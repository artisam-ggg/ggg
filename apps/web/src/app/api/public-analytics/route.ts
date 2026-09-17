import { err, ok } from "@/lib/api";
import { env } from "@/lib/env";

const HOMEPAGE_ORIGIN = "https://ggg.quest";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function withHomepageCors(response: Response): Response {
  response.headers.set("Access-Control-Allow-Origin", HOMEPAGE_ORIGIN);
  response.headers.set("Vary", "Origin");
  response.headers.set(
    "Cache-Control",
    `public, s-maxage=${THIRTY_DAYS}, stale-while-revalidate=86400`,
  );
  return response;
}

export async function GET(): Promise<Response> {
  if (!env.POSTHOG_PERSONAL_API_KEY || !env.POSTHOG_PROJECT_ID) {
    return withHomepageCors(err("ANALYTICS_UNAVAILABLE", "Analytics is not configured.", 503));
  }

  try {
    const response = await fetch(
      `${env.POSTHOG_API_HOST}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`,
          "Content-Type": "application/json",
        },
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

    const body: unknown = await response.json();
    const visits = Number((body as { results?: unknown[][] }).results?.[0]?.[0]);
    if (!Number.isSafeInteger(visits) || visits < 0)
      throw new Error("PostHog returned an invalid visit count");

    return withHomepageCors(
      ok({ visitsLast30Days: visits, generatedAt: new Date().toISOString() }),
    );
  } catch {
    return withHomepageCors(
      err("ANALYTICS_UNAVAILABLE", "Analytics is temporarily unavailable.", 503),
    );
  }
}
