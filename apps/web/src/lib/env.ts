import { z } from "zod";

const booleanString = z.enum(["true", "false"]).transform((v) => v === "true");

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 chars"),
  CSRF_SECRET: z.string().min(32, "CSRF_SECRET must be at least 32 chars"),

  // Database / cache
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Seed admin
  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD must be at least 8 chars"),

  // Stellar
  STELLAR_NETWORK: z.enum(["testnet", "public"]),
  SOROBAN_RPC_URL: z.string().url(),
  HORIZON_URL: z.string().url(),
  NETWORK_PASSPHRASE: z.string().min(1),
  ESCROW_WASM_HASH: z.string().optional(),
  NATIVE_SAC_ADDRESS: z.string().optional(),
  // USDC support (roadmap §6 reconciliation delta #1)
  USDC_ISSUER: z.string().optional(),
  USDC_SAC_ADDRESS: z.string().optional(),

  // File storage (S3 / MinIO)
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanString.default(false),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

/**
 * Validated environment singleton. Validation is lazy: the first property
 * access parses `process.env` and throws (fail closed) if any key is missing
 * or invalid. Lazy evaluation keeps unit tests that import `parseEnv` directly
 * from tripping on an incomplete test `process.env`, while app code that reads
 * `env.X` still refuses to boot on a bad environment.
 */
let cached: Env | undefined;
function loadEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return loadEnv()[prop as keyof Env];
  },
  has(_target, prop: string) {
    return prop in loadEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(loadEnv());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(loadEnv(), prop);
  },
});
