import {
  Asset,
  Address,
  Contract,
  StrKey,
  Transaction,
  TransactionBuilder,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import { Client, type TournamentInfo } from "./contract/index.js";

const I128_MAX = (1n << 127n) - 1n;
const U64_MAX = (1n << 64n) - 1n;
const HASH = /^[a-fA-F0-9]{64}$/;
export const CURRENT_ESCROW_WASM_HASH =
  "b704f577f1715d965f9ba24f2cebf49df52735d42c9a4cd2a93781d612a46dd9";

export type EscrowIntent = "deploy" | "join" | "finalize" | "cancel" | "claim_refund";
export type EscrowErrorCode =
  | "INVALID_INPUT"
  | "NETWORK_MISMATCH"
  | "SIMULATION_FAILED"
  | "SUBMIT_REJECTED"
  | "TX_TIMEOUT"
  | "CONFIRMATION_FAILED";

/** Safe to show to a consumer. RPC response bodies and signed XDR are never attached. */
export class EscrowSdkError extends Error {
  constructor(
    public readonly code: EscrowErrorCode,
    message: string,
    public readonly hash?: string,
  ) {
    super(message);
    this.name = "EscrowSdkError";
  }
}

export interface EscrowSdkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contractId?: string;
  wasmHash?: string;
}

export interface BuiltEscrowTransaction {
  readonly xdr: string;
  readonly hash: string;
  readonly intent: EscrowIntent;
  readonly source: string;
  readonly networkPassphrase: string;
  readonly contractId?: string;
}

export interface ConfirmedEscrowTransaction {
  hash: string;
  status: "SUCCESS" | "FAILED";
  contractId?: string;
}

export type EscrowLookupResult = ConfirmedEscrowTransaction | { hash: string; status: "PENDING" };

function input(ok: boolean, message: string): asserts ok {
  if (!ok) throw new EscrowSdkError("INVALID_INPUT", message);
}

export const isValidEscrowPublicKey = (value: unknown): value is string =>
  typeof value === "string" && StrKey.isValidEd25519PublicKey(value);
export const isValidEscrowContractId = (value: unknown): value is string =>
  typeof value === "string" && StrKey.isValidContract(value);
export const isValidEscrowAmount = (value: unknown): value is bigint =>
  typeof value === "bigint" && value > 0n && value <= I128_MAX;
export const isValidEscrowDistribution = (values: unknown): values is number[] =>
  Array.isArray(values) &&
  values.length >= 1 &&
  values.length <= 10 &&
  values.every((v) => Number.isInteger(v) && v > 0 && v <= 10000) &&
  values.reduce((a, b) => a + b, 0) === 10000;

export function escrowTransactionHash(xdr: string, networkPassphrase: string): string {
  input(typeof xdr === "string" && xdr.length > 0, "Malformed transaction XDR");
  try {
    return TransactionBuilder.fromXDR(xdr, networkPassphrase).hash().toString("hex");
  } catch {
    throw new EscrowSdkError("INVALID_INPUT", "Malformed transaction XDR");
  }
}

/** Read the executable hash before a consumer selects an ABI for an instance. */
export async function getEscrowWasmHash(rpcUrl: string, id: string): Promise<string> {
  contractId(id);
  try {
    const server = new rpc.Server(rpcUrl, { allowHttp: new URL(rpcUrl).protocol === "http:" });
    const { entries } = await server.getLedgerEntries(new Contract(id).getFootprint());
    input(entries.length === 1, "Escrow instance was not found");
    const executable = entries[0]!.val.contractData().val().instance().executable();
    input(executable.switch().name === "contractExecutableWasm", "Escrow is not WASM-backed");
    return Buffer.from(executable.wasmHash()).toString("hex");
  } catch {
    throw new EscrowSdkError("CONFIRMATION_FAILED", "Escrow version could not be determined");
  }
}

function publicKey(value: string): void {
  input(isValidEscrowPublicKey(value), "Invalid source or account address");
}
function contractId(value: string): void {
  input(isValidEscrowContractId(value), "Invalid contract ID");
}
function amount(value: bigint): void {
  input(isValidEscrowAmount(value), "Amount must be a positive i128 in stroops");
}
function deadline(value: bigint): void {
  input(
    typeof value === "bigint" && value > 0n && value <= U64_MAX,
    "Deadline must be positive UTC Unix seconds within u64",
  );
}

function distribution(values: number[]): void {
  input(
    isValidEscrowDistribution(values),
    "Distribution must contain 1–10 positive basis points totaling 10000",
  );
}

/** Resolve a Stellar asset contract from explicit network data, without app environment defaults. */
export function resolveSacAddress(
  asset: "XLM" | "USDC",
  networkPassphrase: string,
  options: { nativeSacAddress?: string; usdcIssuer?: string },
): string {
  input(
    typeof networkPassphrase === "string" && networkPassphrase.trim().length > 0,
    "Network passphrase is required",
  );
  if (asset === "XLM") {
    contractId(options.nativeSacAddress ?? "");
    return options.nativeSacAddress!;
  }
  input(asset === "USDC", "Unsupported asset");
  publicKey(options.usdcIssuer ?? "");
  return new Asset("USDC", options.usdcIssuer!).contractId(networkPassphrase);
}

/** Stateless, keyless client. The caller retains each build result until confirmation. */
export class EscrowSdk {
  private readonly server: rpc.Server;
  readonly config: Readonly<EscrowSdkConfig>;

  constructor(config: EscrowSdkConfig) {
    let url: URL;
    try {
      url = new URL(config?.rpcUrl);
    } catch {
      throw new EscrowSdkError("INVALID_INPUT", "A valid RPC URL is required");
    }
    input(
      (url.protocol === "https:" || url.protocol === "http:") &&
        !!url.hostname &&
        !url.username &&
        !url.password,
      "A valid RPC URL without embedded credentials is required",
    );
    input(
      typeof config.networkPassphrase === "string" && config.networkPassphrase.trim().length > 0,
      "Network passphrase is required",
    );
    if (config.contractId !== undefined) contractId(config.contractId);
    if (config.wasmHash !== undefined)
      input(HASH.test(config.wasmHash), "WASM hash must be 32 bytes of hex");
    this.config = Object.freeze({ ...config });
    this.server = new rpc.Server(config.rpcUrl, { allowHttp: url.protocol === "http:" });
  }

  private id(): string {
    input(!!this.config.contractId, "An existing contract ID is required");
    return this.config.contractId!;
  }

  private client(source: string): Client {
    publicKey(source);
    return new Client({
      contractId: this.id(),
      publicKey: source,
      rpcUrl: this.config.rpcUrl,
      networkPassphrase: this.config.networkPassphrase,
    });
  }

  private async prepare(
    assembled: { toXDR(): string },
    intent: EscrowIntent,
    source: string,
    id?: string,
  ): Promise<BuiltEscrowTransaction> {
    try {
      const tx = TransactionBuilder.fromXDR(assembled.toXDR(), this.config.networkPassphrase);
      input(tx instanceof Transaction, "Expected a transaction envelope");
      const sim = await this.server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim))
        throw new EscrowSdkError("SIMULATION_FAILED", "Escrow simulation failed");
      const prepared = rpc.assembleTransaction(tx, sim as never).build();
      return {
        xdr: prepared.toXDR(),
        hash: prepared.hash().toString("hex"),
        intent,
        source,
        networkPassphrase: this.config.networkPassphrase,
        ...(id ? { contractId: id } : {}),
      };
    } catch (error) {
      if (error instanceof EscrowSdkError) throw error;
      throw new EscrowSdkError("SIMULATION_FAILED", "Escrow simulation could not be completed");
    }
  }

  async buildDeploy(
    source: string,
    terms: {
      referee: string;
      token: string;
      entryFee: bigint;
      distributionBps: number[];
      settlementDeadline: bigint;
      salt: Uint8Array;
    },
  ): Promise<BuiltEscrowTransaction> {
    publicKey(source);
    publicKey(terms.referee);
    contractId(terms.token);
    amount(terms.entryFee);
    deadline(terms.settlementDeadline);
    distribution(terms.distributionBps);
    input(source !== terms.referee, "Organizer and referee must differ");
    input(
      terms.salt instanceof Uint8Array && terms.salt.length === 32,
      "Deployment salt must be 32 bytes",
    );
    input(!!this.config.wasmHash, "Escrow WASM hash is required for deployment");
    try {
      const assembled = await Client.deploy(
        {
          organizer: source,
          referee: terms.referee,
          token: terms.token,
          entry_fee: terms.entryFee,
          distribution_bps: terms.distributionBps,
          settlement_deadline: terms.settlementDeadline,
        },
        {
          wasmHash: this.config.wasmHash!,
          salt: Buffer.from(terms.salt),
          publicKey: source,
          rpcUrl: this.config.rpcUrl,
          networkPassphrase: this.config.networkPassphrase,
        },
      );
      return await this.prepare(assembled, "deploy", source);
    } catch (error) {
      this.buildError(error);
    }
  }

  async buildJoin(player: string): Promise<BuiltEscrowTransaction> {
    const client = this.client(player);
    try {
      return await this.prepare(
        await client.join_tournament({ player }),
        "join",
        player,
        this.id(),
      );
    } catch (error) {
      this.buildError(error);
    }
  }

  async buildFinalize(referee: string, winners: string[]): Promise<BuiltEscrowTransaction> {
    const client = this.client(referee);
    input(
      Array.isArray(winners) && winners.length >= 1 && winners.length <= 10,
      "Winners must contain 1–10 addresses",
    );
    winners.forEach(publicKey);
    input(new Set(winners).size === winners.length, "Winners must be distinct");
    try {
      const tournament = await client.get_tournament();
      distribution(tournament.result.distribution_bps);
      input(
        winners.length === tournament.result.distribution_bps.length,
        "Winner count must match the contract distribution",
      );
      return await this.prepare(
        await client.finalize_results({ winners }),
        "finalize",
        referee,
        this.id(),
      );
    } catch (error) {
      this.buildError(error);
    }
  }

  async buildCancel(organizer: string): Promise<BuiltEscrowTransaction> {
    const client = this.client(organizer);
    try {
      return await this.prepare(await client.cancel_tournament(), "cancel", organizer, this.id());
    } catch (error) {
      this.buildError(error);
    }
  }

  async buildClaimRefund(source: string, player: string): Promise<BuiltEscrowTransaction> {
    const client = this.client(source);
    publicKey(player);
    try {
      return await this.prepare(
        await client.claim_refund({ player }),
        "claim_refund",
        source,
        this.id(),
      );
    } catch (error) {
      this.buildError(error);
    }
  }

  async readTournament(source: string): Promise<TournamentInfo> {
    const client = this.client(source);
    return this.read(() => client.get_tournament());
  }
  async readPool(source: string): Promise<bigint> {
    const client = this.client(source);
    return this.read(() => client.get_pool());
  }
  async readReward(source: string, player: string): Promise<bigint> {
    publicKey(player);
    const client = this.client(source);
    return this.read(() => client.get_reward({ player }));
  }
  async readPlayers(source: string): Promise<string[]> {
    const client = this.client(source);
    return this.read(() => client.get_players());
  }
  async readFinished(source: string): Promise<boolean> {
    const client = this.client(source);
    return this.read(() => client.is_finished());
  }
  async readSettlementDeadline(source: string): Promise<bigint | undefined> {
    const client = this.client(source);
    return this.read(() =>
      client.get_settlement_deadline().then((v) => ({ result: v.result ?? undefined })),
    );
  }

  private async read<T>(call: () => Promise<{ result: T }>): Promise<T> {
    try {
      return (await call()).result;
    } catch {
      throw new EscrowSdkError("SIMULATION_FAILED", "Escrow read could not be completed");
    }
  }

  private buildError(error: unknown): never {
    if (error instanceof EscrowSdkError) throw error;
    throw new EscrowSdkError("SIMULATION_FAILED", "Escrow simulation could not be completed");
  }

  /** Require wallet-reported network and exactly the transaction body returned by build. */
  validateSignedXdr(
    signedXdr: string,
    built: BuiltEscrowTransaction,
    walletNetworkPassphrase: string,
  ): Transaction {
    if (
      walletNetworkPassphrase !== this.config.networkPassphrase ||
      built.networkPassphrase !== this.config.networkPassphrase
    )
      throw new EscrowSdkError("NETWORK_MISMATCH", "Wallet and SDK networks differ");
    input(
      typeof signedXdr === "string" &&
        signedXdr.length > 0 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(signedXdr) &&
        signedXdr.length % 4 === 0,
      "Malformed signed XDR",
    );
    try {
      const tx = TransactionBuilder.fromXDR(signedXdr, this.config.networkPassphrase);
      const original = TransactionBuilder.fromXDR(built.xdr, this.config.networkPassphrase);
      input(
        tx instanceof Transaction && original instanceof Transaction,
        "Expected a transaction envelope",
      );
      input(tx.signatures.length > 0, "Transaction has no envelope signature");
      input(
        tx.hash().equals(original.hash()) &&
          original.hash().toString("hex") === built.hash &&
          tx.source === built.source,
        "Signed transaction differs from the simulated transaction",
      );
      input(tx.operations.length === 1, "Expected one escrow operation");
      const op = tx.operations[0] as {
        type?: string;
        source?: string;
        func?: {
          switch(): { name: string };
          value(): {
            contractAddress(): never;
            functionName(): { toString(): string };
            args(): never[];
            contractIdPreimage(): {
              switch(): { name: string };
              value(): { address(): never };
            };
            executable(): { switch(): { name: string }; value(): Buffer };
            constructorArgs(): never[];
          };
        };
      };
      input(op.type === "invokeHostFunction" && !!op.func, "Expected a Soroban operation");
      input(!op.source || op.source === built.source, "Unexpected operation source");
      if (built.intent === "deploy") {
        input(
          op.func!.switch().name === "hostFunctionTypeCreateContractV2" && !!this.config.wasmHash,
          "Unexpected deployment operation",
        );
        const deployment = op.func!.value();
        input(
          deployment.contractIdPreimage().switch().name === "contractIdPreimageFromAddress" &&
            Address.fromScAddress(deployment.contractIdPreimage().value().address()).toString() ===
              built.source &&
            deployment.executable().switch().name === "contractExecutableWasm" &&
            deployment.executable().value().toString("hex") ===
              this.config.wasmHash!.toLowerCase() &&
            deployment.constructorArgs().length === 6 &&
            scValToNative(deployment.constructorArgs()[0]!) === built.source,
          "Unexpected escrow constructor terms or WASM",
        );
      } else {
        const methods: Record<Exclude<EscrowIntent, "deploy">, string> = {
          join: "join_tournament",
          finalize: "finalize_results",
          cancel: "cancel_tournament",
          claim_refund: "claim_refund",
        };
        input(
          op.func!.switch().name === "hostFunctionTypeInvokeContract",
          "Unexpected contract operation",
        );
        const invocation = op.func!.value();
        input(
          Address.fromScAddress(invocation.contractAddress()).toString() === this.id() &&
            built.contractId === this.id() &&
            invocation.functionName().toString() === methods[built.intent],
          "Unexpected contract or method",
        );
        if (built.intent === "join")
          input(
            invocation.args().length === 1 && scValToNative(invocation.args()[0]!) === built.source,
            "Join player differs from transaction source",
          );
      }
      return tx;
    } catch (error) {
      if (error instanceof EscrowSdkError) throw error;
      throw new EscrowSdkError(
        "INVALID_INPUT",
        "Malformed or unexpected signed escrow transaction",
      );
    }
  }

  /** A timeout retains its hash. Call lookup(hash) before any retry. */
  async submit(
    signedXdr: string,
    built: BuiltEscrowTransaction,
    walletNetworkPassphrase: string,
    options: { attempts?: number; intervalMs?: number } = {},
  ): Promise<ConfirmedEscrowTransaction> {
    const tx = this.validateSignedXdr(signedXdr, built, walletNetworkPassphrase);
    const hash = built.hash;
    const attempts = options.attempts ?? 30;
    const interval = options.intervalMs ?? 1000;
    input(
      Number.isInteger(attempts) &&
        attempts > 0 &&
        attempts <= 120 &&
        Number.isInteger(interval) &&
        interval >= 0 &&
        interval <= 30000,
      "Invalid confirmation polling options",
    );
    let sent: Awaited<ReturnType<rpc.Server["sendTransaction"]>>;
    try {
      sent = await this.server.sendTransaction(tx);
    } catch {
      throw new EscrowSdkError(
        "CONFIRMATION_FAILED",
        "Submission status is unknown; look up the transaction hash before retrying",
        hash,
      );
    }
    if (sent.status === "ERROR")
      throw new EscrowSdkError("SUBMIT_REJECTED", "Stellar rejected the transaction", hash);
    if (sent.status === "TRY_AGAIN_LATER")
      throw new EscrowSdkError(
        "SUBMIT_REJECTED",
        "RPC asked to retry later; the same signed transaction may be resubmitted",
        hash,
      );
    if (sent.hash !== hash)
      throw new EscrowSdkError(
        "CONFIRMATION_FAILED",
        "RPC returned an unexpected transaction hash",
        hash,
      );
    for (let i = 0; i < attempts; i++) {
      const result = await this.lookup(hash, built.intent);
      if (result.status !== "PENDING") return result;
      if (i < attempts - 1 && interval)
        await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new EscrowSdkError(
      "TX_TIMEOUT",
      "Transaction confirmation timed out; look up the hash before retrying",
      hash,
    );
  }

  /** Reconcile an uncertain broadcast without sending another transaction. */
  async lookup(hash: string, intent?: EscrowIntent): Promise<EscrowLookupResult> {
    input(typeof hash === "string" && HASH.test(hash), "Invalid transaction hash");
    let result: Awaited<ReturnType<rpc.Server["getTransaction"]>>;
    try {
      result = await this.server.getTransaction(hash);
    } catch {
      throw new EscrowSdkError(
        "CONFIRMATION_FAILED",
        "Transaction confirmation could not be looked up",
        hash,
      );
    }
    if (result.status === "SUCCESS") {
      let deployedId: string | undefined;
      if (intent === "deploy") {
        try {
          input(!!result.returnValue, "Missing deployed contract ID");
          deployedId = Address.fromScVal(result.returnValue).toString();
          contractId(deployedId);
        } catch {
          throw new EscrowSdkError(
            "CONFIRMATION_FAILED",
            "Confirmed deployment returned no valid contract ID",
            hash,
          );
        }
      }
      return { hash, status: "SUCCESS", ...(deployedId ? { contractId: deployedId } : {}) };
    }
    if (result.status === "FAILED") return { hash, status: "FAILED" };
    return { hash, status: "PENDING" };
  }
}
