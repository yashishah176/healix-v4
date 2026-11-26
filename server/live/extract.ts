import type { Observation } from "@core/api/schemas/ai";
import type { ExtractedReport } from "../mock/reports";
import { interpret } from "../mock/reports";
import { analytes, reportTypeFor, type Analyte } from "./analytes";

export interface ReaderWord {
  text: string;
  bbox: [number, number, number, number];
  confidence: number;
}

export interface ReaderLine {
  words: ReaderWord[];
}

export interface ReaderPage {
  width: number;
  height: number;
  lines: ReaderLine[];
}

const numberPattern = /^[<>≤≥]?\d+(?:[.,]\d+)?$/;
const repairedConfidence = 0.55;
const defaultRangeConfidence = 0.75;

function cleanNumber(text: string): string {
  return text.replace(/[^\d.,<>≤≥]/g, "").replace(",", ".");
}

function parseNumber(text: string): number | null {
  const cleaned = cleanNumber(text).replace(/^[<>≤≥]/, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function repairDecimal(text: string, plausible: [number, number]): { value: number; repaired: boolean } | null {
  const cleaned = cleanNumber(text).replace(/^[<>≤≥]/, "");
  const direct = parseNumber(cleaned);
  if (direct === null) return null;
  const [low, high] = plausible;
  if (direct >= low && direct <= high) return { value: direct, repaired: false };
  if (cleaned.includes(".")) return null;
  for (let position = 1; position < cleaned.length; position += 1) {
    const candidate = Number(`${cleaned.slice(0, position)}.${cleaned.slice(position)}`);
    if (candidate >= low && candidate <= high) return { value: candidate, repaired: true };
  }
  return null;
}

function normaliseLine(words: ReaderWord[]): { text: string; starts: number[] } {
  const starts: number[] = [];
  let text = "";
  for (const word of words) {
    starts.push(text.length);
    text += `${word.text} `;
  }
  return { text, starts };
}

interface ParsedRange {
  low: number | null;
  high: number | null;
}

const abnormalBand = /deficien|insufficien|toxic|borderline|\bpoor\b|\blow\s*:|\bhigh\s*:|diabet/i;

function scaledValue(text: string, analyte: Analyte): { value: number; repaired: boolean } | null {
  if (!analyte.scale) return null;
  const raw = parseNumber(cleanNumber(text).replace(/^[<>≤≥]/, ""));
  if (raw === null || raw < analyte.scale.above) return null;
  const value = Math.round((raw / analyte.scale.divideBy) * 100) / 100;
  return value >= analyte.plausible[0] && value <= analyte.plausible[1] ? { value, repaired: false } : null;
}

function parseRange(texts: readonly string[], analyte: Analyte): ParsedRange | null {
  const joined = texts
    .join(" ")
    .replace(/[–—]/g, "-")
    .replace(/\d+(?:[.,]\d+)?/g, (number) => {
      const scaled = scaledValue(number, analyte);
      return scaled ? String(scaled.value) : number;
    });
  const span = joined.match(/(\d+(?:[.,]\d+)?)\s*(?:-|to)\s*(\d+(?:[.,]\d+)?)/i);
  const wide: [number, number] = [0, analyte.plausible[1] * 1.5];
  if (span?.[1] && span[2]) {
    const low = repairDecimal(span[1], wide) ?? { value: parseNumber(span[1]) ?? 0, repaired: false };
    let high = repairDecimal(span[2], wide) ?? { value: parseNumber(span[2]) ?? 0, repaired: false };
    if (high.value <= low.value) {
      const retry = repairDecimal(span[2], [low.value, analyte.plausible[1] * 1.5]);
      if (retry) high = retry;
    }
    if (high.value > low.value) return { low: low.value, high: high.value };
  }
  const upper = joined.match(/[<≤]\s*(\d+(?:[.,]\d+)?)/);
  if (upper?.[1]) {
    const parsed = repairDecimal(upper[1], wide);
    if (parsed) return { low: 0, high: parsed.value };
  }
  const lower = joined.match(/[>≥]\s*(\d+(?:[.,]\d+)?)/);
  if (lower?.[1]) {
    const parsed = repairDecimal(lower[1], wide);
    if (parsed) return { low: parsed.value, high: null };
  }
  return null;
}

function fitToRange(raw: string, value: number, reference: ParsedRange): number | null {
  const { low, high } = reference;
  if (high === null && (low === null || low === 0)) return null;
  const upper = high ?? (low ?? 0) * 3;
  const lower = low !== null && low > 0 ? low : 0;
  if (value <= upper * 3 && (lower === 0 || value >= lower / 3)) return null;
  const cleaned = cleanNumber(raw).replace(/^[<>≤≥]/, "");
  if (cleaned.includes(".")) return null;
  for (let position = 1; position < cleaned.length; position += 1) {
    const candidate = Number(`${cleaned.slice(0, position)}.${cleaned.slice(position)}`);
    if (candidate <= upper * 3 && (lower === 0 || candidate >= lower / 3)) return candidate;
  }
  return null;
}

function parseLine(line: ReaderLine, page: ReaderPage): Observation | null {
  if (line.words.length < 2) return null;
  const { text, starts } = normaliseLine(line.words);
  const matched = analytes.find((candidate) => candidate.pattern.test(text));
  if (!matched) return null;
  const match = text.match(matched.pattern);
  if (!match || match.index === undefined) return null;
  const end = match.index + match[0].length;
  const after = line.words.filter((_, index) => (starts[index] ?? 0) >= end);
  const valueIndex = after.findIndex((word) => numberPattern.test(cleanNumber(word.text)) && /\d/.test(word.text));
  const valueWord = after[valueIndex];
  if (!valueWord) return null;

  const parsed = scaledValue(valueWord.text, matched) ?? repairDecimal(valueWord.text, matched.plausible);
  if (!parsed) return null;
  let value = parsed.value;

  const rest = after.slice(valueIndex + 1).map((word) => word.text);
  const range = abnormalBand.test(rest.join(" ")) ? null : parseRange(rest.filter((word) => !/^[HL*]$/i.test(word)), matched);
  const fromReport = range !== null;
  const reference = range ?? matched.defaultRange ?? { low: null, high: null };

  let repaired = parsed.repaired;
  const fitted = fitToRange(valueWord.text, value, reference);
  if (fitted !== null && fitted !== value) {
    value = fitted;
    repaired = true;
  }

  let confidence = Math.min(Math.max(valueWord.confidence / 100, 0), 1);
  if (repaired) confidence = Math.min(confidence, repairedConfidence);
  if (!fromReport) confidence = Math.min(confidence, defaultRangeConfidence);

  const [x0, y0, x1, y1] = valueWord.bbox;
  const bbox: [number, number, number, number] = [
    Math.round((x0 / page.width) * 10_000) / 10_000,
    Math.round((y0 / page.height) * 10_000) / 10_000,
    Math.round(((x1 - x0) / page.width) * 10_000) / 10_000,
    Math.round(((y1 - y0) / page.height) * 10_000) / 10_000,
  ];

  return {
    code: matched.code,
    display: matched.display,
    value,
    unit: matched.unit,
    reference: { low: reference.low, high: reference.high },
    interpretation: interpret(value, reference.low, reference.high),
    confidence: Math.round(confidence * 100) / 100,
    bbox,
  };
}

const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function findReportDate(text: string, nowMs: number): number | null {
  const found: number[] = [];
  for (const match of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g)) found.push(dateAt(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  for (const match of text.matchAll(/\b(\d{1,2})[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,-]+(\d{4})\b/gi)) {
    found.push(dateAt(Number(match[1]), monthNames.indexOf((match[2] ?? "").toLowerCase()), Number(match[3])));
  }
  const plausible = found.filter((at) => Number.isFinite(at) && at <= nowMs + 86_400_000 && at >= nowMs - 10 * 365 * 86_400_000);
  return plausible.length > 0 ? Math.max(...plausible) : null;
}

function dateAt(day: number, month: number, year: number): number {
  if (month < 0 || month > 11 || day < 1 || day > 31) return Number.NaN;
  return Date.UTC(year, month, day, 6, 30);
}

const headings: Array<[RegExp, string]> = [
  [/diabet|glyc(?:ated|osylated)|blood\s+sugar/i, "Diabetes check-up"],
  [/lipid/i, "Lipid profile"],
  [/complete\s+blood\s+count|\bcbc\b|h(?:a)?emogram/i, "Complete blood count"],
  [/thyroid/i, "Thyroid"],
  [/kidney|renal/i, "Kidney function"],
  [/liver/i, "Liver function"],
  [/vitamin/i, "Vitamins"],
];

function headingTitle(pages: readonly ReaderPage[]): string | null {
  const first = pages[0];
  if (!first) return null;
  for (const line of first.lines.slice(0, 12)) {
    const text = line.words.map((word) => word.text).join(" ");
    if (/\d/.test(text) && !/check-?up|profile|panel|test/i.test(text)) continue;
    if (!/check-?up|profile|panel|count|screen|function|test|vitamin/i.test(text)) continue;
    const hit = headings.find(([pattern]) => pattern.test(text));
    if (hit) return hit[1];
  }
  return null;
}

export function extractFromPages(pages: readonly ReaderPage[], nowMs: number): ExtractedReport {
  const found = new Map<string, Observation>();
  for (const page of pages) {
    for (const line of page.lines) {
      const observation = parseLine(line, page);
      if (!observation) continue;
      const existing = found.get(observation.code);
      if (!existing || observation.confidence > existing.confidence) found.set(observation.code, observation);
    }
  }
  const observations = [...found.values()];
  const firstPage = pages[0];
  const allText = pages.flatMap((page) => page.lines.map((line) => line.words.map((word) => word.text).join(" "))).join("\n");
  const firstLines = firstPage?.lines.map((line) => line.words.map((word) => word.text).join(" ").trim()) ?? [];
  const usable = firstLines.filter((text) => /[A-Za-z]{4,}/.test(text) && !/^(patient|name|age|sex|date)/i.test(text) && !text.includes(":") && !/scan\s+qr|test\s+report|\breport\b|national\s+reference|information|address|email|website|phone|\bm\.?d\b|\bdr\.?\s/i.test(text));
  const labLine = usable.find((text) => /\b(patholog\w*|diagnostics?|laborator(?:y|ies)|labs?|hospital|clinic|healthcare)\b/i.test(text) && text.length <= 60) ?? firstLines.slice(0, 3).find((text) => usable.includes(text) && text.length <= 40 && !/\d/.test(text));
  return {
    labName: (labLine ?? "Uploaded report").slice(0, 80),
    reportType: headingTitle(pages) ?? reportTypeFor(observations.map((entry) => entry.code)),
    issuedAtMs: findReportDate(allText, nowMs),
    observations,
    rawText: allText.slice(0, 20000),
  };
}
