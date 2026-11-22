import { createHash } from "node:crypto";
import { getRequestListener } from "@hono/node-server";
import { createAppHandle } from "./app";
import { loadEnv } from "./env";
import { istMidnightUtcMs } from "@core/domain/time";
import type { ClockState } from "./mock/clock";
import { MockWorld, type WorldSnapshot } from "./mock/world";

export const forwardedPathParam = "__healix_path";

export interface SharedStore {
  read(knownVersion: string | null): Promise<{ version: string; text: string } | "unchanged" | null>;
  write(text: string): Promise<string>;
}

export function blobStore(pathname = "healix/state.json"): SharedStore {
  return {
    async read(knownVersion) {
      const { get } = await import("@vercel/blob");
      const result = await get(pathname, { access: "private", useCache: false, ...(knownVersion ? { ifNoneMatch: knownVersion } : {}) }).catch((error: unknown) => {
        if (error instanceof Error && /not.?found/i.test(error.name + error.message)) return null;
        throw error;
      });
      if (!result) return null;
      if (result.statusCode === 304) return "unchanged";
      const text = await new Response(result.stream).text();
      return { version: result.blob.etag, text };
    },
    async write(text) {
      const { put } = await import("@vercel/blob");
      const saved = await put(pathname, text, { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json" });
      return saved.etag;
    },
  };
}

export function tokenSecretFor(source: Record<string, string | undefined>): string {
  if (source.HEALIX_TOKEN_SECRET && source.HEALIX_TOKEN_SECRET.length >= 16) return source.HEALIX_TOKEN_SECRET;
  return createHash("sha256")
    .update(`healix-demo|${source.VERCEL_PROJECT_ID ?? "local"}|${source.AUTH_CODE ?? "424242"}|${source.BLOB_READ_WRITE_TOKEN ?? ""}`)
    .digest("hex");
}

export function restoreApiPath(request: Request): Request {
  const url = new URL(request.url);
  const routed = url.searchParams.get(forwardedPathParam);
  if (routed === null) return request;
  url.searchParams.delete(forwardedPathParam);
  url.pathname = `/api/${routed.replace(/^\/+/, "")}`;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return new Request(url, { method: request.method, headers: request.headers, body: hasBody ? request.body : undefined, duplex: "half" } as RequestInit);
}

function changesState(request: Request): boolean {
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path.startsWith("/api/ai/jobs/")) return true;
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return false;
  return !path.startsWith("/api/ai/assistant/") && !path.startsWith("/api/sarvam/");
}

export const liveStreamMs = 25_000;

const demoDayEndsMinutes = 19 * 60;

type SharedSnapshot = WorldSnapshot & { clock?: ClockState };

export function demoClockIsStale(virtualNowMs: number, realNowMs: number): boolean {
  const today = istMidnightUtcMs(new Date(realNowMs));
  const minutesIntoToday = (virtualNowMs - today) / 60_000;
  return minutesIntoToday < 0 || minutesIntoToday >= demoDayEndsMinutes;
}

export function endBeforeTimeout(response: Response, afterMs: number): Response {
  if (!response.body) return response;
  const reader = response.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      timer = setTimeout(() => {
        void reader.cancel().catch(() => undefined);
        controller.close();
      }, afterMs);
    },
    async pull(controller) {
      const chunk = await reader.read().catch(() => ({ done: true as const, value: undefined }));
      if (chunk.done) {
        clearTimeout(timer);
        try {
          controller.close();
        } catch {
          return;
        }
        return;
      }
      controller.enqueue(chunk.value);
    },
    cancel() {
      clearTimeout(timer);
      void reader.cancel().catch(() => undefined);
    },
  });
  return new Response(body, { status: response.status, headers: response.headers });
}

export function createVercelFetch(source: Record<string, string | undefined>, store: SharedStore | null) {
  const env = loadEnv({
    ...source,
    DATA_MODE: "mock",
    AUTH_CODE: source.AUTH_CODE ?? "424242",
    SHOW_DEMO_CODE: source.SHOW_DEMO_CODE ?? "true",
  });
  const world = new MockWorld({ tokenSecret: tokenSecretFor(source) });
  const app = createAppHandle(env, { world, startSimulator: false }).app;

  let version: string | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  async function pull(): Promise<void> {
    if (!store) return;
    const found = await store.read(version);
    if (found !== null && found !== "unchanged") {
      const snapshot = JSON.parse(found.text) as SharedSnapshot;
      world.restore(snapshot);
      if (world.clock.speed() === 1 && snapshot.clock?.factor === 1) world.clock.setState(snapshot.clock);
      version = found.version;
    }
    if (world.clock.speed() === 1 && demoClockIsStale(world.clock.now().getTime(), Date.now())) world.clock.reset();
  }

  async function push(): Promise<void> {
    if (!store) return;
    const shared: SharedSnapshot = { ...world.snapshot(), ...(world.clock.speed() === 1 ? { clock: world.clock.state() } : {}) };
    version = await store.write(JSON.stringify(shared));
  }

  return async function handle(incoming: Request): Promise<Response> {
    const request = restoreApiPath(incoming);
    if (new URL(request.url).pathname === "/api/events/stream") return endBeforeTimeout(await app.fetch(request), liveStreamMs);
    if (!store || !new URL(request.url).pathname.startsWith("/api/")) return app.fetch(request);
    if (!changesState(request)) {
      await pull().catch((error: unknown) => console.warn("Healix: could not read shared data", error instanceof Error ? error.message : error));
      return app.fetch(request);
    }
    const run = async () => {
      await pull();
      const response = await app.fetch(request);
      if (response.status < 400) await push();
      return response;
    };
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  };
}

const store = process.env.BLOB_READ_WRITE_TOKEN ? blobStore() : null;
if (!store) console.warn("Healix: BLOB_READ_WRITE_TOKEN is not set, so each server copy keeps its own data. Connect a Vercel Blob store to share it.");

export default getRequestListener(createVercelFetch(process.env, store));
