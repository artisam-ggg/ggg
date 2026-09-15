// @ts-nocheck -- Stellar CLI generated binding includes unused SDK template imports.
import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"BadDistributionLen"},
  3: {message:"BadDistributionSum"},
  4: {message:"NonPositiveEntryFee"},
  5: {message:"OrganizerIsReferee"},
  6: {message:"NotInitialized"},
  7: {message:"AlreadyFinished"},
  8: {message:"AlreadyCancelled"},
  9: {message:"AlreadyJoined"},
  10: {message:"WinnersNotDistinct"},
  11: {message:"WinnerNotRegistered"},
  12: {message:"DeadlineNotFuture"},
  13: {message:"DeadlineExceedsTestnetSafeHorizon"},
  14: {message:"DeadlineNotReached"},
  15: {message:"PlayerNotRegistered"},
  16: {message:"RefundAlreadyClaimed"},
  17: {message:"MaxPlayersReached"},
  18: {message:"DeadlineReached"},
  19: {message:"BadWinnersLen"},
  20: {message:"WinnerCountMismatch"},
  21: {message:"InvalidDistributionBps"},
  22: {message:"InvalidPool"}
}

export type DataKey = {tag: "Organizer", values: void} | {tag: "Referee", values: void} | {tag: "Token", values: void} | {tag: "EntryFee", values: void} | {tag: "DistributionBps", values: void} | {tag: "Players", values: void} | {tag: "Finished", values: void} | {tag: "Cancelled", values: void} | {tag: "Winners", values: void} | {tag: "PayoutAmounts", values: void} | {tag: "SettlementDeadline", values: void} | {tag: "Registered", values: readonly [string]} | {tag: "RefundClaimed", values: readonly [string]};



/**
 * Stable read-helper ABI for contracts deployed with the N-winner WASM.
 */
export interface TournamentInfo {
  cancelled: boolean;
  distribution_bps: Array<u32>;
  entry_fee: i128;
  finished: boolean;
  organizer: string;
  player_count: u32;
  referee: string;
  settlement_deadline: u64;
  token: string;
  winners: Array<string>;
}

export interface Client {
  /**
   * Construct and simulate a get_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_pool: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_reward transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_reward: ({player}: {player: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_players transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns registration-ordered players; length never exceeds MAX_PLAYERS.
   */
  get_players: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a is_finished transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_finished: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a claim_refund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Anyone may submit this claim, but it always pays the registered player.
   * Cancellation enables immediate claims; otherwise the deadline is inclusive.
   */
  claim_refund: ({player}: {player: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_tournament transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns immutable configuration plus current status and ranked winners.
   */
  get_tournament: (options?: MethodOptions) => Promise<AssembledTransaction<TournamentInfo>>

  /**
   * Construct and simulate a join_tournament transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  join_tournament: ({player}: {player: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a finalize_results transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  finalize_results: ({winners}: {winners: Array<string>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a cancel_tournament transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel_tournament: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_settlement_deadline transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the initialized UTC Unix settlement deadline for state reconciliation.
   */
  get_settlement_deadline: (options?: MethodOptions) => Promise<AssembledTransaction<Option<u64>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {organizer, referee, token, entry_fee, distribution_bps, settlement_deadline}: {organizer: string, referee: string, token: string, entry_fee: i128, distribution_bps: Array<u32>, settlement_deadline: u64},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({organizer, referee, token, entry_fee, distribution_bps, settlement_deadline}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAFgAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAABJCYWREaXN0cmlidXRpb25MZW4AAAAAAAIAAAAAAAAAEkJhZERpc3RyaWJ1dGlvblN1bQAAAAAAAwAAAAAAAAATTm9uUG9zaXRpdmVFbnRyeUZlZQAAAAAEAAAAAAAAABJPcmdhbml6ZXJJc1JlZmVyZWUAAAAAAAUAAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAAGAAAAAAAAAA9BbHJlYWR5RmluaXNoZWQAAAAABwAAAAAAAAAQQWxyZWFkeUNhbmNlbGxlZAAAAAgAAAAAAAAADUFscmVhZHlKb2luZWQAAAAAAAAJAAAAAAAAABJXaW5uZXJzTm90RGlzdGluY3QAAAAAAAoAAAAAAAAAE1dpbm5lck5vdFJlZ2lzdGVyZWQAAAAACwAAAAAAAAARRGVhZGxpbmVOb3RGdXR1cmUAAAAAAAAMAAAAAAAAACFEZWFkbGluZUV4Y2VlZHNUZXN0bmV0U2FmZUhvcml6b24AAAAAAAANAAAAAAAAABJEZWFkbGluZU5vdFJlYWNoZWQAAAAAAA4AAAAAAAAAE1BsYXllck5vdFJlZ2lzdGVyZWQAAAAADwAAAAAAAAAUUmVmdW5kQWxyZWFkeUNsYWltZWQAAAAQAAAAAAAAABFNYXhQbGF5ZXJzUmVhY2hlZAAAAAAAABEAAAAAAAAAD0RlYWRsaW5lUmVhY2hlZAAAAAASAAAAAAAAAA1CYWRXaW5uZXJzTGVuAAAAAAAAEwAAAAAAAAATV2lubmVyQ291bnRNaXNtYXRjaAAAAAAUAAAAAAAAABZJbnZhbGlkRGlzdHJpYnV0aW9uQnBzAAAAAAAVAAAAAAAAAAtJbnZhbGlkUG9vbAAAAAAW",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAADQAAAAAAAAAAAAAACU9yZ2FuaXplcgAAAAAAAAAAAAAAAAAAB1JlZmVyZWUAAAAAAAAAAAAAAAAFVG9rZW4AAAAAAAAAAAAAAAAAAAhFbnRyeUZlZQAAAAAAAAAAAAAAD0Rpc3RyaWJ1dGlvbkJwcwAAAAAAAAAAAAAAAAdQbGF5ZXJzAAAAAAAAAAAAAAAACEZpbmlzaGVkAAAAAAAAAAAAAAAJQ2FuY2VsbGVkAAAAAAAAAAAAAAAAAAAHV2lubmVycwAAAAAAAAAAAAAAAA1QYXlvdXRBbW91bnRzAAAAAAAAAAAAAAAAAAASU2V0dGxlbWVudERlYWRsaW5lAAAAAAABAAAAAAAAAApSZWdpc3RlcmVkAAAAAAABAAAAEwAAAAEAAAAAAAAADVJlZnVuZENsYWltZWQAAAAAAAABAAAAEw==",
        "AAAABQAAAEtTdGFibGUgZm9yICMyMTY6IHRvcGljcyBhcmUgKCJyZWZ1bmRfY2xhaW1lZCIsIHBsYXllcik7IGRhdGEgaXMgeyBhbW91bnQgfS4AAAAAAAAAAA1SZWZ1bmRDbGFpbWVkAAAAAAAAAQAAAA5yZWZ1bmRfY2xhaW1lZAAAAAAAAgAAAAAAAAAGcGxheWVyAAAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAAAQAAAEVTdGFibGUgcmVhZC1oZWxwZXIgQUJJIGZvciBjb250cmFjdHMgZGVwbG95ZWQgd2l0aCB0aGUgTi13aW5uZXIgV0FTTS4AAAAAAAAAAAAADlRvdXJuYW1lbnRJbmZvAAAAAAAKAAAAAAAAAAljYW5jZWxsZWQAAAAAAAABAAAAAAAAABBkaXN0cmlidXRpb25fYnBzAAAD6gAAAAQAAAAAAAAACWVudHJ5X2ZlZQAAAAAAAAsAAAAAAAAACGZpbmlzaGVkAAAAAQAAAAAAAAAJb3JnYW5pemVyAAAAAAAAEwAAAAAAAAAMcGxheWVyX2NvdW50AAAABAAAAAAAAAAHcmVmZXJlZQAAAAATAAAAAAAAABNzZXR0bGVtZW50X2RlYWRsaW5lAAAAAAYAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAHd2lubmVycwAAAAPqAAAAEw==",
        "AAAAAAAAAAAAAAAIZ2V0X3Bvb2wAAAAAAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAKZ2V0X3Jld2FyZAAAAAAAAQAAAAAAAAAGcGxheWVyAAAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAEdSZXR1cm5zIHJlZ2lzdHJhdGlvbi1vcmRlcmVkIHBsYXllcnM7IGxlbmd0aCBuZXZlciBleGNlZWRzIE1BWF9QTEFZRVJTLgAAAAALZ2V0X3BsYXllcnMAAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAAAAAAALaXNfZmluaXNoZWQAAAAAAAAAAAEAAAAB",
        "AAAAAAAAAJNBbnlvbmUgbWF5IHN1Ym1pdCB0aGlzIGNsYWltLCBidXQgaXQgYWx3YXlzIHBheXMgdGhlIHJlZ2lzdGVyZWQgcGxheWVyLgpDYW5jZWxsYXRpb24gZW5hYmxlcyBpbW1lZGlhdGUgY2xhaW1zOyBvdGhlcndpc2UgdGhlIGRlYWRsaW5lIGlzIGluY2x1c2l2ZS4AAAAADGNsYWltX3JlZnVuZAAAAAEAAAAAAAAABnBsYXllcgAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAYAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAAAAAAAB3JlZmVyZWUAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAllbnRyeV9mZWUAAAAAAAALAAAAAAAAABBkaXN0cmlidXRpb25fYnBzAAAD6gAAAAQAAAAAAAAAE3NldHRsZW1lbnRfZGVhZGxpbmUAAAAABgAAAAA=",
        "AAAAAAAAAEdSZXR1cm5zIGltbXV0YWJsZSBjb25maWd1cmF0aW9uIHBsdXMgY3VycmVudCBzdGF0dXMgYW5kIHJhbmtlZCB3aW5uZXJzLgAAAAAOZ2V0X3RvdXJuYW1lbnQAAAAAAAAAAAABAAAH0AAAAA5Ub3VybmFtZW50SW5mbwAA",
        "AAAAAAAAAAAAAAAPam9pbl90b3VybmFtZW50AAAAAAEAAAAAAAAABnBsYXllcgAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAQZmluYWxpemVfcmVzdWx0cwAAAAEAAAAAAAAAB3dpbm5lcnMAAAAD6gAAABMAAAAA",
        "AAAAAAAAAAAAAAARY2FuY2VsX3RvdXJuYW1lbnQAAAAAAAAAAAAAAA==",
        "AAAAAAAAAE5SZXR1cm5zIHRoZSBpbml0aWFsaXplZCBVVEMgVW5peCBzZXR0bGVtZW50IGRlYWRsaW5lIGZvciBzdGF0ZSByZWNvbmNpbGlhdGlvbi4AAAAAABdnZXRfc2V0dGxlbWVudF9kZWFkbGluZQAAAAAAAAAAAQAAA+gAAAAG" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_pool: this.txFromJSON<i128>,
        get_reward: this.txFromJSON<i128>,
        get_players: this.txFromJSON<Array<string>>,
        is_finished: this.txFromJSON<boolean>,
        claim_refund: this.txFromJSON<null>,
        get_tournament: this.txFromJSON<TournamentInfo>,
        join_tournament: this.txFromJSON<null>,
        finalize_results: this.txFromJSON<null>,
        cancel_tournament: this.txFromJSON<null>,
        get_settlement_deadline: this.txFromJSON<Option<u64>>
  }
}