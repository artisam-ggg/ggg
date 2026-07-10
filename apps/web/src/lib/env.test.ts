import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

const valid: Record<string, string> = {
  NODE_ENV: "development",
  APP_URL: "http://localhost:3000",
  ALLOWED_ORIGINS: "https://app.example.com,https://admin.example.com",
  SESSION_SECRET: "x".repeat(32),
  CSRF_SECRET: "y".repeat(32),
  DATABASE_URL: "postgresql://ggg:ggg@localhost:5432/ggg",
  REDIS_URL: "redis://localhost:6379",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "supersecret123",
  STELLAR_NETWORK: "testnet",
  SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
  HORIZON_URL: "https://horizon-testnet.stellar.org",
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "ggg-uploads",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_FORCE_PATH_STYLE: "true",
};

describe("parseEnv", () => {
  it("parses a complete valid environment", () => {
    const env = parseEnv(valid);
    expect(env.STELLAR_NETWORK).toBe("testnet");
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it("throws and names the missing key when SESSION_SECRET is absent", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { SESSION_SECRET: _omit, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrowError(/SESSION_SECRET/);
  });

  it("rejects an invalid STELLAR_NETWORK value", () => {
    expect(() => parseEnv({ ...valid, STELLAR_NETWORK: "mars" })).toThrowError(/STELLAR_NETWORK/);
  });

  it("rejects a too-short SESSION_SECRET", () => {
    expect(() => parseEnv({ ...valid, SESSION_SECRET: "short" })).toThrowError(/SESSION_SECRET/);
  });

  it("accepts optional USDC keys (USDC_ISSUER, USDC_SAC_ADDRESS)", () => {
    const env = parseEnv({
      ...valid,
      USDC_ISSUER: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      USDC_SAC_ADDRESS: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    });
    expect(env.USDC_ISSUER).toBe("GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");
    expect(env.USDC_SAC_ADDRESS).toBe("CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75");
  });

  it("parses ALLOWED_ORIGINS as a comma-separated string", () => {
    const env = parseEnv(valid);
    expect(env.ALLOWED_ORIGINS).toBe("https://app.example.com,https://admin.example.com");
  });
});
