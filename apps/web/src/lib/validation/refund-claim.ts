import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

export const stellarAddressSchema = z
  .string()
  .refine(StrKey.isValidEd25519PublicKey, "Invalid Stellar public key");

export const refundClaimPayloadSchema = z.object({
  player: stellarAddressSchema,
  amount: z.string().regex(/^[1-9]\d*$/, "Amount must be a positive integer"),
});
