import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { createRateLimiter, type RateLimiter } from "./sarvam/rateLimit";

const megabyte = 1024 * 1024;
export const jsonBodyLimit = megabyte;
export const uploadBodyLimit = 55 * megabyte;
export const audioBodyLimit = 8 * megabyte;

function tooLarge(context: Context) {
  return context.json({ error: { code: "request_too_large", message: "That request is too large", retry: false } }, 413);
}

export function requestSizeGuard(): MiddlewareHandler {
  const small = bodyLimit({ maxSize: jsonBodyLimit, onError: tooLarge });
  const upload = bodyLimit({ maxSize: uploadBodyLimit, onError: tooLarge });
  const audio = bodyLimit({ maxSize: audioBodyLimit, onError: tooLarge });
  return (context, next) => {
    if (context.req.method === "GET" || context.req.method === "HEAD") return next();
    const path = context.req.path;
    if (path === "/api/reports") return upload(context, next);
    if (path.startsWith("/api/sarvam/")) return audio(context, next);
    return small(context, next);
  };
}

export function securityHeaders(): MiddlewareHandler {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", "blob:", "data:"],
      objectSrc: ["blob:"],
      frameSrc: ["blob:"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    strictTransportSecurity: "max-age=31536000; includeSubDomains",
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
    permissionsPolicy: { camera: ["self"], microphone: ["self"], geolocation: ["self"] },
  });
}

export function clientKey(context: Context): string {
  const forwarded = context.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && forwarded.length > 0 ? forwarded : "direct";
}

export interface Limiters {
  loginAttempts: RateLimiter;
  registrations: RateLimiter;
  chat: RateLimiter;
  groq: RateLimiter;
  upload: RateLimiter;
}

export function createLimiters(groqPerMinute: number): Limiters {
  return {
    loginAttempts: createRateLimiter(10, 15 * 60_000),
    registrations: createRateLimiter(40, 15 * 60_000),
    chat: createRateLimiter(40, 60_000),
    groq: createRateLimiter(groqPerMinute, 60_000),
    upload: createRateLimiter(12, 60_000),
  };
}
