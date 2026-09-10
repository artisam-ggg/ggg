import { describe, it, expect } from "vitest";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";

const enabled = process.env.RUN_STELLAR_IT === "1";
const d = enabled ? describe : describe.skip;

d("Testnet integration", () => {
  it("deploys, initializes, and reads the active escrow state", async () => {
    const organizer = Keypair.random();
    const referee = Keypair.random();
    const settlementDeadline = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60);
    // fund organizer via Friendbot
    const res = await fetch(
      `https://friendbot.stellar.org/?addr=${encodeURIComponent(organizer.publicKey())}`,
    );
    expect(res.ok).toBe(true);

    const { buildDeployInitializeTx, buildInitializeTx, readSettlementDeadline, resolveSacAddress, submitSignedXdr } =
      await import("./index");
    const tokenAddr = resolveSacAddress("XLM");
    const deploy = await buildDeployInitializeTx({
      organizerAddress: organizer.publicKey(),
      refereeAddress: referee.publicKey(),
      tokenAddr,
      entryFee: 10_000_000n,
      distributionBps: [6000, 3000, 1000],
      settlementDeadline,
    });
    expect(deploy.network).toBe("testnet");

    const signedDeploy = TransactionBuilder.fromXDR(
      deploy.xdr,
      "Test SDF Network ; September 2015",
    );
    signedDeploy.sign(organizer);
    const deployed = await submitSignedXdr(signedDeploy.toXDR(), "deploy", {
      attempts: 60,
    });
    expect(deployed.status).toBe("SUCCESS");
    expect(deployed.contractId).toBeTruthy();

    // Deploy only installs the instance. A read proves this Wasm can execute
    // before we attribute an initialize failure to its transaction assembly.
    await expect(
      readSettlementDeadline({
        contractId: deployed.contractId!,
        sourceAddress: organizer.publicKey(),
      }),
    ).resolves.toBeUndefined();

    const initialize = await buildInitializeTx({
      contractId: deployed.contractId!,
      organizerAddress: organizer.publicKey(),
      refereeAddress: referee.publicKey(),
      tokenAddr,
      entryFee: 10_000_000n,
      distributionBps: [6000, 3000, 1000],
      settlementDeadline,
    });
    const signedInitialize = TransactionBuilder.fromXDR(
      initialize.xdr,
      "Test SDF Network ; September 2015",
    );
    signedInitialize.sign(organizer);
    const initialized = await submitSignedXdr(signedInitialize.toXDR(), "initialize", {
      attempts: 60,
    });
    expect(initialized.status).toBe("SUCCESS");
    await expect(
      readSettlementDeadline({
        contractId: deployed.contractId!,
        sourceAddress: organizer.publicKey(),
      }),
    ).resolves.toBe(settlementDeadline);
  }, 120_000);
});
