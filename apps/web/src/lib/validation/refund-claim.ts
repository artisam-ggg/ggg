import { isValidEscrowPublicKey } from "@goodgameguild/escrow-sdk";
import { z } from "zod";

export const stellarAddressSchema = z.string().refine(isValidEscrowPublicKey);

export const refundClaimPayloadSchema = z.object({
  player: stellarAddressSchema,
  amount: z.string().regex(/^[1-9]\d*$/, "Amount must be a positive integer"),
});
