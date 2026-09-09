import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return ok({
    status: "ok",
    service: "ggg-web",
    timestamp: new Date().toISOString(),
  });
}
