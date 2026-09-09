import { stellarPublicKey } from "../stellar/validation";
import { z } from "zod";

export const stellarAddressSchema = stellarPublicKey;

export const refundClaimPayloadSchema = z.object({
  player: stellarAddressSchema,
  amount: z.string().regex(/^[1-9]\d*$/, "Amount must be a positive integer"),
});
