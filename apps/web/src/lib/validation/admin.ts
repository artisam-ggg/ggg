import { z } from "zod";
import { Role } from "@/generated/prisma/enums";

export const adminListQuerySchema = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminListQueryInput = z.infer<typeof adminListQuerySchema>;

export const adminUpdateUserSchema = z
  .object({
    role: z.enum(Role).optional(),
    resetPassword: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.resetPassword === true, {
    message: "Must provide role or resetPassword",
    path: ["root"],
  });
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export const adminUpdateTournamentSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    gameTitle: z.string().min(1).max(120).optional(),
    status: z.literal("CANCELLED").optional(),
  })
  .refine((v) => v.name !== undefined || v.gameTitle !== undefined || v.status !== undefined, {
    message: "Must provide at least one field to update",
    path: ["root"],
  });
export type AdminUpdateTournamentInput = z.infer<typeof adminUpdateTournamentSchema>;
