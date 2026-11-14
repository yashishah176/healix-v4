import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const built = resolve(process.cwd(), ".vercel/output/functions/api.func");
const isolated = mkdtempSync(resolve(tmpdir(), "healix-vercel-"));
cpSync(built, isolated, { recursive: true });

const module = (await import(pathToFileURL(resolve(isolated, "index.mjs")).href)) as { default: (request: IncomingMessage, response: ServerResponse) => void };
const server = createServer((request, response) => module.default(request, response)).listen(0);
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;
const via = (path: string) => `http://127.0.0.1:${port}/api?__healix_path=${encodeURIComponent(path)}`;

const failures: string[] = [];
const expect = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "OK    " : "FAILED"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures.push(label);
};

const meta = (await fetch(via("meta")).then((response) => response.json())) as { data_mode?: string; demo_hint?: { code: string } };
expect("meta answers from the API, not the website", meta.data_mode === "mock", JSON.stringify(meta));
expect("demo code is shown", meta.demo_hint?.code !== undefined, meta.demo_hint?.code);
const login = await fetch(via("auth/login"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: "9876500001", otp: meta.demo_hint?.code ?? "" }) });
expect("sign-in with the demo code works", login.status === 200, String(login.status));
const token = ((await login.json()) as { access_token?: string }).access_token ?? "";
const posts = await fetch(via("community/posts") + "&sort=new", { headers: { authorization: `Bearer ${token}` } });
expect("multi-part API paths work", posts.status === 200, String(posts.status));
const image = await fetch(via("reports/rep_june/image"), { headers: { authorization: `Bearer ${token}` } });
expect("bundled report images are found", image.status === 200, String(image.status));
const chat = await fetch(via("ai/assistant/chat"), { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ message: "hi" }) });
expect("chat streams", chat.status === 200 && (chat.headers.get("content-type") ?? "").includes("text/event-stream"));
await chat.text();

server.close();
rmSync(isolated, { recursive: true, force: true });
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nThe Vercel API function works on its own.");
process.exit(0);
