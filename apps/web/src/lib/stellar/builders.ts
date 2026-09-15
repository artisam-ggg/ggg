import { Client } from "@/contract-client";
import { createHash } from "node:crypto";
import { Contract, TransactionBuilder, type Transaction } from "@stellar/stellar-sdk";
import { env } from "@/lib/env";
import { getRpc, networkName, networkPassphrase } from "./client";
import { legacyEscrowClient } from "./legacy-escrow-client";
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

async function deployedWasmHash(contractId: string): Promise<string> {
  try {
    const { entries } = await getRpc().getLedgerEntries(new Contract(contractId).getFootprint());
    if (entries.length !== 1) throw new Error("contract instance not found");
    const executable = entries[0]!.val.contractData().val().instance().executable();
    if (executable.switch().name !== "contractExecutableWasm") {
      throw new Error("contract instance is not Wasm-backed");
    }
    return Buffer.from(executable.wasmHash()).toString("hex");
  } catch (error) {
    console.error("Escrow Wasm lookup failed", { contractId, error });
    throw new StellarError("SIMULATION_FAILED", "Escrow version could not be determined", {
      retryable: true,
    });
  }
}

async function preparedXdr(assembled: { toXDR: () => string }): Promise<string> {
  // The binding's first simulation supplies auth entries. Reassembly keeps
  // those entries while refreshing Soroban data, including the footprint that
  // core validates before contract execution.
  const prepared = await simulateAndAssemble(
    TransactionBuilder.fromXDR(assembled.toXDR(), networkPassphrase()) as Transaction,
  );
  return prepared.toXDR();
}

export async function buildJoinTx(params: {
  contractId: string;
  playerAddress: string;
}): Promise<{ xdr: string; network: string }> {
  parse(stellarContractId, params.contractId, "contractId");
  parse(stellarPublicKey, params.playerAddress, "playerAddress");
  const c = clientFor(params.contractId, params.playerAddress);
  const assembled = await c.join_tournament({ player: params.playerAddress });
  return { xdr: await preparedXdr(assembled), network: networkName() };
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
  return { xdr: await preparedXdr(assembled), network: networkName() };
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
  const wasmHash = await deployedWasmHash(params.contractId);
  const options = {
    contractId: params.contractId,
    publicKey: params.refereeAddress,
    networkPassphrase: networkPassphrase(),
    rpcUrl: env.SOROBAN_RPC_URL,
  };
  const assembled =
    env.ESCROW_WASM_HASH && wasmHash === env.ESCROW_WASM_HASH.toLowerCase()
      ? await clientFor(params.contractId, params.refereeAddress).finalize_results({
          winners: [params.first, params.second, params.third],
        })
      : await legacyEscrowClient(options).finalize_results({
          first: params.first,
          second: params.second,
          third: params.third,
        });
  return { xdr: await preparedXdr(assembled), network: networkName() };
}

export async function buildCancelTx(params: {
  contractId: string;
  organizerAddress: string;
}): Promise<{ xdr: string; network: string }> {
  parse(stellarContractId, params.contractId, "contractId");
  parse(stellarPublicKey, params.organizerAddress, "organizerAddress");
  const c = clientFor(params.contractId, params.organizerAddress);
  const assembled = await c.cancel_tournament();
  return { xdr: await preparedXdr(assembled), network: networkName() };
}

export async function buildDeployInitializeTx(params: {
  tournamentId: string;
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
  const assembled = await Client.deploy(
    {
      organizer: params.organizerAddress,
      referee: params.refereeAddress,
      token: params.tokenAddr,
      entry_fee: params.entryFee,
      distribution_bps: params.distributionBps,
      settlement_deadline: params.settlementDeadline,
    },
    {
      wasmHash: env.ESCROW_WASM_HASH,
      salt: createHash("sha256").update(params.tournamentId).digest(),
      publicKey: params.organizerAddress,
      networkPassphrase: networkPassphrase(),
      rpcUrl: env.SOROBAN_RPC_URL,
    },
  );
  return { xdr: await preparedXdr(assembled), network: networkName() };
}
