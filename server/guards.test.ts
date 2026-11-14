import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { deflateRawSync } from "node:zlib";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAppHandle, type AppHandle } from "./app";
import { loadEnv } from "./env";
import { securityHeaders } from "./guards";
import { docxText } from "./live/documents";
import { MockWorld } from "./mock/world";
import { noLatency } from "./mock/routes";

let directory = "";
let local: AppHandle;

beforeAll(() => {
  directory = mkdtempSync(resolve(tmpdir(), "healix-guards-"));
  local = createAppHandle(loadEnv({ DATA_MODE: "local", LOCAL_DATA_DIR: directory, AUTH_CODE: "424242" }));
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

async function post(app: AppHandle, path: string, body: unknown, token?: string, headers: Record<string, string> = {}) {
  return app.app.request(`/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function register(app: AppHandle, phone: string) {
  const response = await post(app, "/auth/register", { phone, otp: "424242", name: "Guard Test" });
  return ((await response.json()) as { access_token: string }).access_token;
}

describe("request size and input limits", () => {
  it("refuses a JSON request over 1 MB", async () => {
    const response = await post(local, "/auth/login", { phone: "9876543210", otp: "x".repeat(1_200_000) });
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("request_too_large");
  });

  it("refuses chat messages that are too long or have too much history", async () => {
    const token = await register(local, "9877700001");
    expect((await post(local, "/ai/assistant/chat", { message: "a".repeat(2001) }, token)).status).toBe(400);
    const history = Array.from({ length: 21 }, () => ({ role: "user", content: "hi" }));
    expect((await post(local, "/ai/assistant/chat", { message: "hi", history }, token)).status).toBe(400);
    expect((await post(local, "/ai/assistant/chat", { message: "hi" }, token)).status).toBe(200);
  });

  it("refuses a Word file that expands into a zip bomb", () => {
    const bomb = Buffer.alloc(30 * 1024 * 1024, 65);
    const packed = deflateRawSync(bomb);
    const name = Buffer.from("word/document.xml");
    const local1 = Buffer.alloc(30);
    local1.writeUInt32LE(0x04034b50, 0);
    local1.writeUInt16LE(8, 8);
    local1.writeUInt32LE(packed.length, 18);
    local1.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt16LE(name.length, 28);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + name.length, 12);
    end.writeUInt32LE(local1.length + name.length + packed.length, 16);
    const zip = Buffer.concat([local1, name, packed, central, name, end]);
    expect(() => docxText(zip)).toThrow();
  });
});

describe("rate limits", () => {
  it("slows down repeated sign-in guesses for one phone number in local mode", async () => {
    await register(local, "9878800001");
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) statuses.push((await post(local, "/auth/login", { phone: "9878800001", otp: "000000" })).status);
    expect(statuses.slice(0, 9).every((status) => status === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("limits how fast one person can chat", async () => {
    const handle = createAppHandle(loadEnv({}), { world: new MockWorld(), latency: noLatency });
    const login = await post(handle, "/auth/login", { phone: "9876500001", otp: "123456" });
    const token = ((await login.json()) as { access_token: string }).access_token;
    let last = 200;
    for (let index = 0; index < 45; index += 1) last = (await post(handle, "/ai/assistant/chat", { message: "hi" }, token)).status;
    expect(last).toBe(429);
  });

  it("stops calling Groq once the shared per-minute budget is used, and the built-in answer takes over", async () => {
    let groqCalls = 0;
    const handle = createAppHandle(loadEnv({ GROQ_API_KEY: "k", GROQ_MODEL: "m", GROQ_RATE_LIMIT_PER_MINUTE: "1" }), {
      world: new MockWorld(),
      latency: noLatency,
      groqTransport: async () => {
        groqCalls += 1;
        return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "Groq says hello [1]" } }] })}\n\ndata: [DONE]\n\n`, { status: 200 });
      },
    });
    const login = await post(handle, "/auth/login", { phone: "9876500001", otp: "123456" });
    const token = ((await login.json()) as { access_token: string }).access_token;
    const texts: string[] = [];
    for (let index = 0; index < 3; index += 1) texts.push(await (await post(handle, "/ai/assistant/chat", { message: "What does HbA1c mean?" }, token)).text());
    expect(groqCalls).toBe(1);
    expect(texts[0]).toContain("Groq");
    expect(texts[1]).not.toContain("Groq");
    expect(texts[1]).toContain("event: done");
  });
});

describe("security headers", () => {
  it("adds a strict content policy, no framing and no sniffing", async () => {
    const app = new Hono();
    app.use("*", securityHeaders());
    app.get("/", (context) => context.text("ok"));
    const response = await app.request("/");
    const policy = response.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("script-src 'self' 'unsafe");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("strict-transport-security")).toContain("max-age");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});
