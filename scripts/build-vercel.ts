import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, ".vercel/output");
const functionDirectory = resolve(output, "functions/api.func");
const dist = resolve(root, "dist");

if (!existsSync(resolve(dist, "index.html"))) throw new Error("Run the web build first: dist/index.html is missing");

rmSync(output, { recursive: true, force: true });
mkdirSync(functionDirectory, { recursive: true });
cpSync(dist, resolve(output, "static"), { recursive: true });

await build({
  entryPoints: [resolve(root, "server/vercel.ts")],
  outfile: resolve(functionDirectory, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  tsconfig: resolve(root, "tsconfig.json"),
  external: ["tesseract.js", "pdfjs-dist", "@napi-rs/canvas", "@tesseract.js-data/*"],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  plugins: [
    {
      name: "no-ocr-on-vercel",
      setup(context) {
        context.onResolve({ filter: /\/live\/reader$/ }, () => ({ path: resolve(root, "server/live/reader.stub.ts") }));
      },
    },
  ],
  logLevel: "warning",
});

cpSync(resolve(root, "server/mock/data/reports"), resolve(functionDirectory, "data/reports"), { recursive: true });
cpSync(resolve(root, "server/mock/data/report-boxes.json"), resolve(functionDirectory, "data/report-boxes.json"));
writeFileSync(resolve(functionDirectory, "package.json"), JSON.stringify({ type: "module" }));
writeFileSync(
  resolve(functionDirectory, ".vc-config.json"),
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, supportsResponseStreaming: true, maxDuration: 30 }, null, 2),
);

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob: data:",
  "object-src blob:",
  "frame-src blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const config = {
  version: 3,
  routes: [
    {
      src: "/(.*)",
      headers: {
        "Content-Security-Policy": contentSecurityPolicy,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      },
      continue: true,
    },
    { src: "^/assets/(.*)$", headers: { "Cache-Control": "public, max-age=31536000, immutable" }, continue: true },
    { src: "^/api/?$", dest: "/api?__healix_path=" },
    { src: "^/api/(.*)$", dest: "/api?__healix_path=$1" },
    { handle: "filesystem" },
    { src: "^/(.*)$", dest: "/index.html" },
  ],
};
writeFileSync(resolve(output, "config.json"), JSON.stringify(config, null, 2));
console.log("Vercel output written to .vercel/output (static site + /api function)");
