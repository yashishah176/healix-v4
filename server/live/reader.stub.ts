import type { ReportExtractor } from "../mock/reports";

export function createReportReader(): ReportExtractor {
  return async () => {
    throw new Error("reader_unavailable");
  };
}

export async function stopReader(): Promise<void> {
  return undefined;
}
