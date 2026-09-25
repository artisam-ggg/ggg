// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { Client as ContractClient } from "@stellar/stellar-sdk/contract";
import { EscrowClient, type TournamentInfo } from "../src/index.js";

afterEach(() => vi.restoreAllMocks());

it("forwards all constructor terms to the SDK deployment", async () => {
  const deploy = vi.spyOn(ContractClient, "deploy").mockResolvedValue({} as never);
  const args = {
    organizer: "GORG",
    referee: "GREF",
    token: "CTOKEN",
    entry_fee: 10n,
    distribution_bps: [6000, 3000, 1000],
    settlement_deadline: 1_800_000_000n,
  };
  const options = {
    wasmHash: "01".repeat(32),
    publicKey: "GORG",
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
  };

  await EscrowClient.deploy(args, options);

  expect(deploy).toHaveBeenCalledWith(args, options);
});

it("exports the finalized read, vector settlement, and refund ABI", () => {
  const client = new EscrowClient({
    contractId: "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5",
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
  });
  const winners: Parameters<EscrowClient["finalize_results"]>[0] = {
    winners: ["G1", "G2", "G3", "G4"],
  };
  const refund: Parameters<EscrowClient["claim_refund"]>[0] = { player: "G1" };
  const deadlineRefund: Parameters<EscrowClient["claim_refund_after_deadline"]>[0] = {
    player: "G1",
  };
  const tournament: TournamentInfo = {
    cancelled: false,
    distribution_bps: [4000, 3000, 2000, 1000],
    entry_fee: 10n,
    finished: false,
    organizer: "G1",
    player_count: 4,
    referee: "G2",
    settlement_deadline: 1_800_000_000n,
    token: "C1",
    winners: winners.winners,
  };

  expect(Object.keys(client.fromJSON)).toEqual(
    expect.arrayContaining([
      "get_pool",
      "get_reward",
      "get_players",
      "get_tournament",
      "get_settlement_deadline",
      "join_tournament",
      "finalize_results",
      "cancel_tournament",
      "claim_refund",
      "claim_refund_after_deadline",
    ]),
  );
  expect(client.fromJSON).not.toHaveProperty("initialize");
  expect(tournament.distribution_bps).toHaveLength(4);
  expect(refund.player).toBe("G1");
  expect(deadlineRefund.player).toBe("G1");
});
