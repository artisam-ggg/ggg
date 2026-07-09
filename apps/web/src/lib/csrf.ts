import { env } from "@/lib/env";

export class CsrfError extends Error {
  constructor() {
    super("Cross-origin request rejected");
    this.name = "CsrfError";
  }
}

function normalizeHost(value: string): { hostname: string; port: string } {
  try {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return { hostname: "", port: "" };

    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const defaultPort =
      parsed.protocol === "https:" ? "443" : parsed.protocol === "http:" ? "80" : "";
    return { hostname: parsed.hostname, port: parsed.port || defaultPort };
  } catch {
    try {
      const trimmed = value.trim().toLowerCase();
      const [hostname, maybePort] = trimmed.split(":");
      return { hostname: hostname || trimmed, port: maybePort || "" };
    } catch {
      return { hostname: "", port: "" };
    }
  }
}

function hostsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  const lhs = normalizeHost(left);
  const rhs = normalizeHost(right);
  return lhs.hostname === rhs.hostname && lhs.port === rhs.port;
}

function getAllowedOrigins(): string[] {
  const raw = env.ALLOWED_ORIGINS ?? "";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

// Same-site defense for cookie-authenticated mutations (SPEC §6 / AGENT §7).
// SameSite=Lax already blocks cross-site cookie sends on most flows; this is
// the origin/host belt-and-braces check. Throws CsrfError on mismatch.
export function assertSameOrigin(req: Request): void {
  const appHost = normalizeHost(env.APP_URL);
  const origin = req.headers.get("origin");
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host");

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (hostsMatch(originHost, `${appHost.hostname}:${appHost.port}`)) return;
      for (const allowed of getAllowedOrigins()) {
        if (hostsMatch(originHost, allowed)) return;
      }
      if (hostsMatch(originHost, host)) return;
    } catch {
      throw new CsrfError();
    }
    throw new CsrfError();
  }

  if (hostsMatch(host, `${appHost.hostname}:${appHost.port}`)) return;

  throw new CsrfError();
}
