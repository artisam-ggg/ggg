import { env } from "@/lib/env";

export class CsrfError extends Error {
  constructor() {
    super("Cross-origin request rejected");
    this.name = "CsrfError";
  }
}

function normalizeHost(value: string): { hostname: string; port: string } {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return { hostname: "", port: "" };

  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const defaultPort = parsed.protocol === "https:" ? "443" : parsed.protocol === "http:" ? "80" : "";
    return { hostname: parsed.hostname, port: parsed.port || defaultPort };
  } catch {
    const [hostname, maybePort] = trimmed.split(":");
    return { hostname: hostname || trimmed, port: maybePort || "" };
  }
}

function hostsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  const lhs = normalizeHost(left);
  const rhs = normalizeHost(right);
  return lhs.hostname === rhs.hostname && lhs.port === rhs.port;
}

// Same-site defense for cookie-authenticated mutations (SPEC §6 / AGENT §7).
// SameSite=Lax already blocks cross-site cookie sends on most flows; this is
// the origin/host belt-and-braces check. Throws CsrfError on mismatch.
export function assertSameOrigin(req: Request): void {
  const appHost = normalizeHost(env.APP_URL);
  const origin = req.headers.get("origin");

  if (origin) {
    try {
      if (hostsMatch(new URL(origin).host, `${appHost.hostname}:${appHost.port}`)) return;
    } catch {
      throw new CsrfError();
    }
    throw new CsrfError();
  }

  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host");
  if (hostsMatch(host, `${appHost.hostname}:${appHost.port}`)) return;

  throw new CsrfError();
}
