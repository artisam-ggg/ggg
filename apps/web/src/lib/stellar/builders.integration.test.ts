import { describe, it, expect } from "vitest";
import { Asset, Keypair, TransactionBuilder } from "@stellar/stellar-sdk";

const PASSPHRASE = "Test SDF Network ; September 2015";
const enabled = process.env.RUN_STELLAR_IT === "1";
const d = enabled ? describe : describe.skip;

d("Testnet integration", () => {
  it("deploys then initializes a contract with two signed Testnet transactions", async () => {
    const organizer = Keypair.random();
    const referee = Keypair.random();
    // fund organizer via Friendbot
    const res = await fetch(
      `https://friendbot.stellar.org/?addr=${encodeURIComponent(organizer.publicKey())}`,
    );
    expect(res.ok).toBe(true);

    const { buildDeployInitializeTx, buildInitializeTx, readSettlementDeadline, submitSignedXdr } =
      await import("./index");
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60);
    const out = await buildDeployInitializeTx({
      organizerAddress: organizer.publicKey(),
      refereeAddress: referee.publicKey(),
      // Avoid resolveSacAddress here: the test must not depend on NATIVE_SAC_ADDRESS.
      tokenAddr: Asset.native().contractId(PASSPHRASE),
      entryFee: 10_000_000n,
      distributionBps: [6000, 3000, 1000],
      settlementDeadline: deadline,
    });
    const deploy = TransactionBuilder.fromXDR(out.xdr, PASSPHRASE);
    deploy.sign(organizer);
    const deployed = await submitSignedXdr(deploy.toEnvelope().toXDR("base64"), "deploy");
    expect(deployed.status).toBe("SUCCESS");
    expect(deployed.contractId).toBeDefined();

    const initialize = await buildInitializeTx({
      contractId: deployed.contractId!,
      organizerAddress: organizer.publicKey(),
      refereeAddress: referee.publicKey(),
      tokenAddr: Asset.native().contractId(PASSPHRASE),
      entryFee: 10_000_000n,
      distributionBps: [6000, 3000, 1000],
      settlementDeadline: deadline,
    });
    const initializeTx = TransactionBuilder.fromXDR(
      initialize.xdr,
      PASSPHRASE,
    );
    expect(initializeTx.toEnvelope().v1().tx().ext().value()).toBeDefined();
    const operation = initializeTx.operations[0] as { auth?: unknown[] } | undefined;
    expect(operation?.auth).toBeDefined();
    expect(operation?.auth).not.toHaveLength(0);
    initializeTx.sign(organizer);
    const signedInitializeXdr = initializeTx.toEnvelope().toXDR("base64");
    await expect(submitSignedXdr(signedInitializeXdr, "initialize")).resolves.toMatchObject({
      status: "SUCCESS",
    });
    await expect(
      readSettlementDeadline({
        contractId: deployed.contractId!,
        sourceAddress: organizer.publicKey(),
      }),
    ).resolves.toBe(deadline);
  }, 120_000);
});
