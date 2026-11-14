import { getRequestListener } from "@hono/node-server";
import { createAppHandle } from "./app";
import { loadEnv } from "./env";

export const forwardedPathParam = "__healix_path";

const env = loadEnv({
  ...process.env,
  DATA_MODE: "mock",
  AUTH_CODE: process.env.AUTH_CODE ?? "424242",
  SHOW_DEMO_CODE: process.env.SHOW_DEMO_CODE ?? "true",
});

const app = createAppHandle(env, { startSimulator: false }).app;

export function restoreApiPath(request: Request): Request {
  const url = new URL(request.url);
  const routed = url.searchParams.get(forwardedPathParam);
  if (routed === null) return request;
  url.searchParams.delete(forwardedPathParam);
  url.pathname = `/api/${routed.replace(/^\/+/, "")}`;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return new Request(url, { method: request.method, headers: request.headers, body: hasBody ? request.body : undefined, duplex: "half" } as RequestInit);
}

export default getRequestListener((request) => app.fetch(restoreApiPath(request)));
