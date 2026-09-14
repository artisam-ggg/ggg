import { z } from "zod";
import { StrKey } from "@stellar/stellar-sdk";

const I128_MAX = (1n << 127n) - 1n;
const U64_MAX = (1n << 64n) - 1n;

export const stellarPublicKey = z
  .string()
  .refine((v) => StrKey.isValidEd25519PublicKey(v), { message: "Invalid Stellar public key (G…)" });

export const stellarContractId = z
  .string()
  .refine((v) => StrKey.isValidContract(v), { message: "Invalid Stellar contract id (C…)" });

export const i128Amount = z
  .bigint()
  .refine((v) => v > 0n && v <= I128_MAX, { message: "Amount must be a positive i128" });

export const u64Timestamp = z
  .bigint()
  .refine((v) => v > 0n && v <= U64_MAX, { message: "Timestamp must be a positive u64" });

export const signedXdr = z
  .string()
  .min(1, "XDR required")
  .refine((v) => /^[A-Za-z0-9+/]+={0,2}$/.test(v) && v.length % 4 === 0, {
    message: "XDR must be base64",
  });

export const distributionBps = z
  .tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ])
  .refine(([a, b, c]) => a + b + c === 10000, { message: "distributionBps must sum to 10000" });
