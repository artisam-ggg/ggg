import { createHash } from "node:crypto";
import {
  EscrowSdk,
  EscrowSdkError,
  CURRENT_ESCROW_WASM_HASH,
  escrowTransactionHash,
  getEscrowWasmHash,
  resolveSacAddress as sdkResolveSacAddress,
  type BuiltEscrowTransaction,
  type EscrowIntent,
} from "@ggg/escrow-sdk";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export { CURRENT_ESCROW_WASM_HASH };

export function escrowSdk(contractId?: string): EscrowSdk {
  return new EscrowSdk({
    rpcUrl: env.SOROBAN_RPC_URL,
    networkPassphrase: env.NETWORK_PASSPHRASE,
    ...(contractId ? { contractId } : {}),
    ...(env.ESCROW_WASM_HASH ? { wasmHash: env.ESCROW_WASM_HASH } : {}),
  });
}

export function escrowToken(asset: "XLM" | "USDC"): string {
  const issuers = {
    testnet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    public: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  };
  return sdkResolveSacAddress(asset, env.NETWORK_PASSPHRASE, {
    ...(env.NATIVE_SAC_ADDRESS ? { nativeSacAddress: env.NATIVE_SAC_ADDRESS } : {}),
    usdcIssuer: issuers[env.STELLAR_NETWORK],
  });
}

export async function escrowVersion(contractId: string): Promise<"CURRENT" | "UNSUPPORTED"> {
  return (await getEscrowWasmHash(env.SOROBAN_RPC_URL, contractId)) === CURRENT_ESCROW_WASM_HASH
    ? "CURRENT"
    : "UNSUPPORTED";
}

export async function requireCurrentEscrow(contractId: string): Promise<EscrowSdk> {
  if ((await escrowVersion(contractId)) !== "CURRENT") {
    throw Object.assign(new Error("This escrow uses an unsupported legacy ABI and is read-only"), {
      status: 409,
    });
  }
  return escrowSdk(contractId);
}

export async function savePrepared(
  tournamentId: string,
  built: BuiltEscrowTransaction,
): Promise<{ unsignedXdr: string; network: string }> {
  await prisma.preparedEscrowTransaction.upsert({
    where: { hash: built.hash },
    create: {
      hash: built.hash,
      tournamentId,
      intent: built.intent,
      source: built.source,
      xdr: built.xdr,
    },
    update: {},
  });
  return { unsignedXdr: built.xdr, network: env.STELLAR_NETWORK };
}

export async function findPrepared(tournamentId: string, signedXdr: string, intent: EscrowIntent) {
  const hash = escrowTransactionHash(signedXdr, env.NETWORK_PASSPHRASE);
  const prepared = await prisma.preparedEscrowTransaction.findUnique({ where: { hash } });
  if (!prepared || prepared.tournamentId !== tournamentId || prepared.intent !== intent) {
    throw new EscrowSdkError("INVALID_INPUT", "Transaction was not prepared for this tournament");
  }
  return {
    xdr: prepared.xdr,
    hash,
    intent,
    source: prepared.source,
    networkPassphrase: env.NETWORK_PASSPHRASE,
    ...(intent !== "deploy" ? { contractId: await contractIdFor(tournamentId) } : {}),
  } satisfies BuiltEscrowTransaction;
}

async function contractIdFor(tournamentId: string): Promise<string> {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament?.contractId) {
    throw new EscrowSdkError("INVALID_INPUT", "Tournament has no confirmed escrow contract");
  }
  return tournament.contractId;
}

export const deploymentSalt = (tournamentId: string): Uint8Array =>
  createHash("sha256").update(tournamentId).digest();
