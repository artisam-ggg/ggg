// Single source of truth for the app's HTTP hardening headers (AGENT §7).
// Imported by next.config.ts headers() so every response carries the set.
//
// CSP notes: connect-src/img-src allow the Stellar RPC/Horizon (any *.stellar.org,
// covering soroban-testnet/horizon-testnet and their mainnet peers), the
// Stellar.Expert explorer (a distinct domain, so listed explicitly), and the
// S3/MinIO image origin; everything else is locked to 'self'.
export function buildSecurityHeaders(): Array<[string, string]> {
  // S3/MinIO public origin for tournament banner images; falls back to the
  // local docker-compose MinIO endpoint in dev.
  const s3Origin = process.env.S3_PUBLIC_ORIGIN ?? "http://localhost:9000";
  // React's development runtime uses eval for debugging features such as
  // reconstructing call stacks. Keep this exception out of production CSP.
  const scriptSrc =
    process.env.NODE_ENV === "development"
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";

  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: https://stellar.expert ${s3Origin}`,
    "connect-src 'self' https://*.stellar.org https://stellar.expert",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  return [
    ["Content-Security-Policy", csp],
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
    ["X-Frame-Options", "DENY"],
    [
      "Permissions-Policy",
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
    ],
  ];
}
