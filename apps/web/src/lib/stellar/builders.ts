import { Client } from "@/contract-client";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { env } from "@/lib/env";
import { networkName, networkPassphrase } from "./client";
import { simulateAndAssemble } from "./pipeline";
import {
  stellarContractId,
  stellarPublicKey,
  i128Amount,
  u64Timestamp,
  distributionBps as bpsSchema,
} from "./validation";
import { StellarError } from "./errors";

function parse(
  schema: { safeParse: (v: unknown) => { success: boolean } },
  v: unknown,
  label: string,
): void {
  if (!schema.safeParse(v).success) throw new StellarError("INVALID_INPUT", `Invalid ${label}`);
}

function clientFor(contractId: string, source: string): InstanceType<typeof Client> {
  return new Client({
    contractId,
    publicKey: source,
    networkPassphrase: networkPassphrase(),
    rpcUrl: env.SOROBAN_RPC_URL,
  });
}

export async function buildJoinTx(params: {
  contractId: string;
  playerAddress: string;
}): Promise<{ xdr: string; network: string }> {
  parse(stellarContractId, params.contractId, "contractId");
  parse(stellarPublicKey, params.playerAddress, "playerAddress");
  const c = clientFor(params.contractId, params.playerAddress);
  const assembled = await c.join_tournament({ player: params.playerAddress });
  return { xdr: assembled.toXDR(), network: networkName() };
}

/** Reads the deadline stored in a deployed deadline-aware escrow contract. */
export async function readSettlementDeadline(params: {
  contractId: string;
  sourceAddress: string;
}): Promise<bigint | undefined> {
  parse(stellarContractId, params.contractId, "contractId");
  parse(stellarPublicKey, params.sourceAddress, "sourceAddress");
  const assembled = await clientFor(
    params.contractId,
    params.sourceAddress,
  ).get_settlement_deadline();
  return assembled.result ?? undefined;
}

/** Builds a permissionless refund claim which always pays the registered player. */
export async function buildClaimRefundTx(params: {
  contractId: string;
  playerAddress: string;
  submitterAddress: string;
}): Promise<{ xdr: string; network: string }> {
  parse(stellarContractId, params.contractId, "contractId");
  parse(stellarPublicKey, params.playerAddress, "playerAddress");
  parse(stellarPublicKey, params.submitterAddress, "submitterAddress");
  const c = clientFor(params.contractId, params.submitterAddress);
  const assembled = await c.claim_refund({ player: params.playerAddress });
  return { xdr: assembled.toXDR(), network: networkName() };
}

/**
 * Builds the `initialize` invocation for a freshly-deployed escrow contract.
 *
 * The Phase-1 binding's `Client.deploy` only runs `createCustomContract` (it
 * deploys the Wasm instance) — the contract exposes a plain `initialize`
 * function, not a Soroban `__constructor`, so the deployed contract has no
 * organizer/referee/token/fee state until this second transaction lands. The
 * organizer signs it (the contract calls `organizer.require_auth()`, satisfied
 * by source-account auth since the organizer is the transaction source).
 */
export async function buildInitializeTx(params: {
  contractId: string;
  organizerAddress: string;
  refereeAddress: string;
  tokenAddr: string;
  entryFee: bigint;
  distributionBps: [number, number, number];
  settlementDeadline: bigint;
}): Promise<{ xdr: string; network: string }> {
  parse(stellarContractId, params.contractId, "contractId");
  parse(stellarPublicKey, params.organizerAddress, "organizerAddress");
  parse(stellarPublicKey, params.refereeAddress, "refereeAddress");
  parse(stellarContractId, params.tokenAddr, "tokenAddr");
  parse(i128Amount, params.entryFee, "entryFee");
  parse(bpsSchema, params.distributionBps, "distributionBps");
  parse(u64Timestamp, params.settlementDeadline, "settlementDeadline");
  if (params.organizerAddress === params.refereeAddress) {
    throw new StellarError("INVALID_INPUT", "organizer must differ from referee");
  }
  const c = clientFor(params.contractId, params.organizerAddress);
  const assembled = await c.initialize({
    organizer: params.organizerAddress,
    referee: params.refereeAddress,
    token: params.tokenAddr,
    entry_fee: params.entryFee,
    distribution_bps: params.distributionBps,
    settlement_deadline: params.settlementDeadline,
  });
  const prepared = await simulateAndAssemble(
    TransactionBuilder.fromXDR(assembled.toXDR(), networkPassphrase()),
  );
  return { xdr: prepared.toXDR(), network: networkName() };
}

export async function buildFinalizeTx(params: {
  contractId: string;
  refereeAddress: string;
  first: string;
  second: string;
  third: string;
}): Promise<{ xdr: string; network: string }> {
  parse(stellarContractId, params.contractId, "contractId");
  parse(stellarPublicKey, params.refereeAddress, "refereeAddress");
  for (const [k, v] of [
    ["first", params.first],
    ["second", params.second],
    ["third", params.third],
  ] as const) {
    parse(stellarPublicKey, v, k);
  }
  const winners = new Set([params.first, params.second, params.third]);
  if (winners.size !== 3) throw new StellarError("INVALID_INPUT", "Winners must be distinct");
  const c = clientFor(params.contractId, params.refereeAddress);
  const assembled = await c.finalize_results({
    first: params.first,
    second: params.second,
    third: params.third,
  });
  return { xdr: assembled.toXDR(), network: networkName() };
}

export async function buildCancelTx(params: {
  contractId: string;
  organizerAddress: string;
}): Promise<{ xdr: string; network: string }> {
  parse(stellarContractId, params.contractId, "contractId");
  parse(stellarPublicKey, params.organizerAddress, "organizerAddress");
  const c = clientFor(params.contractId, params.organizerAddress);
  const assembled = await c.cancel_tournament();
  return { xdr: assembled.toXDR(), network: networkName() };
}

export async function buildDeployInitializeTx(params: {
  organizerAddress: string;
  refereeAddress: string;
  tokenAddr: string;
  entryFee: bigint;
  distributionBps: [number, number, number];
  settlementDeadline: bigint;
}): Promise<{ xdr: string; network: string }> {
  parse(stellarPublicKey, params.organizerAddress, "organizerAddress");
  parse(stellarPublicKey, params.refereeAddress, "refereeAddress");
  parse(stellarContractId, params.tokenAddr, "tokenAddr");
  parse(i128Amount, params.entryFee, "entryFee");
  parse(bpsSchema, params.distributionBps, "distributionBps");
  parse(u64Timestamp, params.settlementDeadline, "settlementDeadline");
  if (params.organizerAddress === params.refereeAddress) {
    throw new StellarError("INVALID_INPUT", "organizer must differ from referee");
  }
  if (!env.ESCROW_WASM_HASH) {
    throw new StellarError("INVALID_INPUT", "ESCROW_WASM_HASH not configured");
  }
  // TODO: the generated Phase 1 binding deploys a contract but does not accept
  // init args (the contract exposes `initialize`, not a Soroban constructor).
  // A follow-up should either regenerate bindings with constructor support or
  // build a multi-op transaction (createCustomContract + initialize) manually.
  const assembled = await Client.deploy({
    wasmHash: env.ESCROW_WASM_HASH,
    publicKey: params.organizerAddress,
    networkPassphrase: networkPassphrase(),
    rpcUrl: env.SOROBAN_RPC_URL,
  });
  return { xdr: assembled.toXDR(), network: networkName() };
}
