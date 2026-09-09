import { z } from "zod";
import {
  stellarPublicKey,
  stellarContractId,
  i128Amount,
  signedXdr as signedXdrSchema,
} from "@/lib/stellar";
import { Asset, TournamentStatus } from "@/generated/prisma/enums";

/** Conservative, uniform maximum settlement window for every supported network. */
export const MIN_SETTLEMENT_LEAD_TIME_SECS = 60 * 60;
/** Matches the Testnet-safe horizon enforced by the escrow contract (#215). */
export const MAX_SETTLEMENT_HORIZON_SECS = 90 * 24 * 60 * 60;

// Re-export Phase 2 Stellar validators for convenience
export { stellarPublicKey, stellarContractId, i128Amount };
export { signedXdrSchema as signedXdr };

// --- Enums ---

export const assetSchema = z.enum(Asset);
export type AssetValue = z.infer<typeof assetSchema>;

export const statusSchema = z.enum(TournamentStatus);
export type TournamentStatusValue = z.infer<typeof statusSchema>;

// --- Coercing amount: JSON sends strings; BigInt end-to-end ---

const i128AmountFromString = z
  .string()
  .min(1, "Amount required")
  .transform((s, ctx) => {
    try {
      return BigInt(s);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid integer string" });
      return z.NEVER;
    }
  })
  .pipe(i128Amount);

// --- createTournamentSchema ---

export const createTournamentSchema = z
  .object({
    name: z.string().min(1).max(120),
    gameTitle: z.string().min(1).max(120),
    entryFee: i128AmountFromString,
    asset: assetSchema,
    refereeAddress: stellarPublicKey,
    organizerAddress: stellarPublicKey,
    // An integer UTC Unix timestamp is unambiguous and can be passed to Soroban unchanged.
    settlementDeadline: z.coerce.number().int().nonnegative(),
    distributionBps: z.tuple([
      z.number().int().min(0).max(10000),
      z.number().int().min(0).max(10000),
      z.number().int().min(0).max(10000),
    ]),
    coverImageKey: z.string().max(256).optional(),
  })
  .refine((v) => v.distributionBps[0] + v.distributionBps[1] + v.distributionBps[2] === 10000, {
    message: "Split must sum to 10000 basis points",
    path: ["distributionBps"],
  })
  .refine((v) => v.organizerAddress !== v.refereeAddress, {
    message: "Organizer and referee must differ",
    path: ["refereeAddress"],
  })
  .superRefine((v, ctx) => {
    const now = Math.floor(Date.now() / 1000);
    if (v.settlementDeadline <= now) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Settlement deadline must be in the future",
        path: ["settlementDeadline"],
      });
    } else if (v.settlementDeadline - now < MIN_SETTLEMENT_LEAD_TIME_SECS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Settlement deadline must be at least one hour away",
        path: ["settlementDeadline"],
      });
    } else if (v.settlementDeadline - now > MAX_SETTLEMENT_HORIZON_SECS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Settlement deadline must be within 90 days",
        path: ["settlementDeadline"],
      });
    }
  });

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;

// --- submitSchema ---

export const submitSchema = z.object({
  signedXdr: signedXdrSchema,
  intent: z.enum(["deploy", "initialize", "join", "claim_refund", "finalize", "cancel"]),
});
export type SubmitInput = z.infer<typeof submitSchema>;

// --- joinSchema ---

export const joinSchema = z.object({ playerAddress: stellarPublicKey });
export type JoinInput = z.infer<typeof joinSchema>;

export const refundClaimSchema = z.object({
  playerAddress: stellarPublicKey,
  submitterAddress: stellarPublicKey,
});
export type RefundClaimInput = z.infer<typeof refundClaimSchema>;

export const tournamentParamsSchema = z.object({ id: z.string().cuid() });

// --- finalizeSchema ---

export const finalizeSchema = z
  .object({
    first: stellarPublicKey,
    second: stellarPublicKey,
    third: stellarPublicKey,
  })
  .refine((v) => new Set([v.first, v.second, v.third]).size === 3, {
    message: "Winners must be distinct",
  });
export type FinalizeInput = z.infer<typeof finalizeSchema>;

// --- listQuerySchema ---

export const listQuerySchema = z.object({
  status: statusSchema.optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListQueryInput = z.infer<typeof listQuerySchema>;

// --- uploadSchema ---

export const uploadSchema = z.object({
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  contentLength: z.coerce
    .number()
    .int()
    .min(1)
    .max(5 * 1024 * 1024), // 5 MB cap
});
export type UploadInput = z.infer<typeof uploadSchema>;
