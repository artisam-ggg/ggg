// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { Client as ContractClient } from "@stellar/stellar-sdk/contract";
import { Client } from "./index";

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

  await Client.deploy(args, options);

  expect(deploy).toHaveBeenCalledWith(args, options);
});
