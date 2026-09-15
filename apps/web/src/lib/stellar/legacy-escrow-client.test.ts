// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  Account,
  Keypair,
  scValToNative,
  TransactionBuilder,
  type xdr,
} from "@stellar/stellar-sdk";
import { legacyEscrowClient } from "./legacy-escrow-client";

const PASSPHRASE = "Test SDF Network ; September 2015";
const CONTRACT_ID = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5";

describe("legacyEscrowClient", () => {
  it("encodes finalize_results as three ordered address arguments", async () => {
    const referee = Keypair.random().publicKey();
    const winners = [
      Keypair.random().publicKey(),
      Keypair.random().publicKey(),
      Keypair.random().publicKey(),
    ];
    const client = legacyEscrowClient({
      contractId: CONTRACT_ID,
      publicKey: referee,
      networkPassphrase: PASSPHRASE,
      rpcUrl: "https://example.invalid",
      server: { getAccount: vi.fn().mockResolvedValue(new Account(referee, "1")) } as never,
    });

    const assembled = await client.finalize_results(
      { first: winners[0]!, second: winners[1]!, third: winners[2]! },
      { simulate: false },
    );
    const tx = TransactionBuilder.fromXDR(assembled.raw!.build().toXDR(), PASSPHRASE);
    const operation = tx.operations[0] as unknown as {
      func: { value(): { args(): xdr.ScVal[] } };
    };

    expect(operation.func.value().args().map(scValToNative)).toEqual(winners);
  });
});
