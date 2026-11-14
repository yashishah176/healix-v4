import { z } from "zod";
import { requestJson } from "./http";

export const metaSchema = z.object({
  data_mode: z.enum(["mock", "live", "local"]),
  sarvam_enabled: z.boolean(),
  sarvam_mode: z.enum(["live", "mock", "off"]).optional(),
  assistant_mode: z.enum(["groq", "local"]).optional(),
  demo_hint: z.object({ code: z.string(), staff_phone: z.string() }).optional(),
});

export type Meta = z.infer<typeof metaSchema>;

export function fetchMeta(signal?: AbortSignal): Promise<Meta> {
  return requestJson("/meta", { schema: metaSchema, signal });
}
