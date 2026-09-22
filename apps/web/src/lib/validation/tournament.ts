import { z } from "zod";
import {
  isValidEscrowPublicKey,
  isValidEscrowContractId,
  isValidEscrowAmount,
  isValidEscrowDistribution,
} from "@ggg/escrow-sdk";
import { Asset, TournamentStatus } from "@/generated/prisma/enums";

/** Conservative, uniform maximum settlement window for every supported network. */
export const MIN_SETTLEMENT_LEAD_TIME_SECS = 60 * 60;
/** Matches the Testnet-safe horizon enforced by the escrow contract (#215). */
export const MAX_SETTLEMENT_HORIZON_SECS = 90 * 24 * 60 * 60;

export const stellarPublicKey = z
  .string()
  .refine(isValidEscrowPublicKey, "Invalid Stellar public key");
export const stellarContractId = z.string().refine(isValidEscrowContractId, "Invalid contract ID");
export const i128Amount = z.bigint().refine(isValidEscrowAmount, "Amount must be a positive i128");
export const signedXdr = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);

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

export const coverImageKeySchema = z
  .string()
  .regex(/^covers\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/);

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
    distributionBps: z.array(z.number()).min(1).max(10).refine(isValidEscrowDistribution, {
      message: "Split must contain 1–10 positive ranks totaling 10000 basis points",
    }),
    coverImageKey: coverImageKeySchema.optional(),
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
  signedXdr,
  intent: z.enum(["deploy", "join", "claim_refund", "finalize", "cancel"]),
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
  .object({ winners: z.array(stellarPublicKey).min(1).max(10) })
  .refine((v) => new Set(v.winners).size === v.winners.length, {
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

export const uploadFileSchema = z
  .custom<Blob>(
    (value): value is Blob =>
      typeof value === "object" &&
      value !== null &&
      "arrayBuffer" in value &&
      "size" in value &&
      "type" in value,
    "An image file is required",
  )
  .refine(
    (file) => ["image/png", "image/jpeg", "image/webp"].includes(file.type),
    "Invalid file type. Upload a PNG, JPEG, or WEBP image.",
  )
  .refine(
    (file) => file.size > 0 && file.size <= 5 * 1024 * 1024,
    "Image must be no larger than 5 MB.",
  );
