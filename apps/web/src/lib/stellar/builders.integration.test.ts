import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";

const enabled = process.env.RUN_STELLAR_IT === "1";
const d = enabled ? describe : describe.skip;

d("Testnet integration", () => {
  it("builds a deploy+initialize XDR that simulates on Testnet", async () => {
    const organizer = Keypair.random();
    const referee = Keypair.random();
    // fund organizer via Friendbot
    const res = await fetch(
      `https://friendbot.stellar.org/?addr=${encodeURIComponent(organizer.publicKey())}`,
    );
    expect(res.ok).toBe(true);

    const { buildDeployInitializeTx, resolveSacAddress } = await import("./index");
    const out = await buildDeployInitializeTx({
      organizerAddress: organizer.publicKey(),
      refereeAddress: referee.publicKey(),
      tokenAddr: resolveSacAddress("XLM"),
      entryFee: 10_000_000n,
      distributionBps: [6000, 3000, 1000],
      settlementDeadline: BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60),
    });
    expect(out.network).toBe("testnet");
    expect(out.xdr.length).toBeGreaterThan(0);
  }, 60_000);
});
