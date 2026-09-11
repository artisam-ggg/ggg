import { z } from "zod";

export type ApiError = { code: string; message: string };

export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const apiErrorSchema = z.object({ code: z.string(), message: z.string() });

export function apiResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.union([
    z.object({ ok: z.literal(true), data: dataSchema }),
    z.object({ ok: z.literal(false), error: apiErrorSchema }),
  ]);
}

export const apiEnvelopeSchema = z.union([
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), error: apiErrorSchema }),
]);

/** Success envelope. Defaults to HTTP 200. */
export function ok<T>(data: T, status = 200): Response {
  const body: ApiEnvelope<T> = { ok: true, data };
  return Response.json(body, { status });
}

/** Error envelope. Defaults to HTTP 400. Never leak internal details into `message`. */
export function err(code: string, message: string, status = 400): Response {
  const body: ApiEnvelope<never> = { ok: false, error: { code, message } };
  return Response.json(body, { status });
}
