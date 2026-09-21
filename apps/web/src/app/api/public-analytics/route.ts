import { err, ok } from "@/lib/api";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const HOMEPAGE_ORIGIN = "https://ggg.quest";
const SUCCESS_CACHE_SECONDS = 5 * 60;
const postHogQueryResultSchema = z.object({
  results: z.tuple([z.tuple([z.number().int().nonnegative().safe()])]),
});

function withHomepageCors(response: Response, request: Request): Response {
  const origin = request.headers.get("Origin");
  const allowedOrigins = new Set([
    HOMEPAGE_ORIGIN,
    ...(env.PUBLIC_ANALYTICS_ALLOWED_ORIGINS?.split(",").map((value) => value.trim()) ?? []),
  ]);
  if (origin && allowedOrigins.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  response.headers.set("Vary", "Origin");
  response.headers.set(
    "Cache-Control",
    response.ok
      ? `public, s-maxage=${SUCCESS_CACHE_SECONDS}, stale-while-revalidate=${SUCCESS_CACHE_SECONDS}`
      : "no-store",
  );
  return response;
}

export async function GET(request: Request): Promise<Response> {
  if (!env.POSTHOG_PERSONAL_API_KEY || !env.POSTHOG_PROJECT_ID) {
    return withHomepageCors(
      err("ANALYTICS_UNAVAILABLE", "Analytics is not configured.", 503),
      request,
    );
  }

  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const limit = await rateLimit(`public-analytics:${ip}`, { limit: 30, windowSec: 60 });
    if (!limit.ok) {
      return withHomepageCors(
        err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429),
        request,
      );
    }

    const response = await fetch(
      `${env.POSTHOG_API_HOST}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          query: {
            kind: "HogQLQuery",
            query:
              "SELECT count() FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY",
          },
        }),
      },
    );

    if (!response.ok) throw new Error(`PostHog query failed with ${response.status}`);

    const body = postHogQueryResultSchema.safeParse(await response.json());
    if (!body.success) throw new Error("PostHog returned an invalid pageview count");
    const pageviews = body.data.results[0][0];

    return withHomepageCors(
      ok({ pageviewsLast30Days: pageviews, generatedAt: new Date().toISOString() }),
      request,
    );
  } catch {
    return withHomepageCors(
      err("ANALYTICS_UNAVAILABLE", "Analytics is temporarily unavailable.", 503),
      request,
    );
  }
}
