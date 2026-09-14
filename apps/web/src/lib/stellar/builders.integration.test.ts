import { describe, it, expect } from "vitest";
import { Asset, Keypair, TransactionBuilder } from "@stellar/stellar-sdk";

const PASSPHRASE = "Test SDF Network ; September 2015";
const enabled = process.env.RUN_STELLAR_IT === "1";
const d = enabled ? describe : describe.skip;

d("Testnet integration", () => {
  it("deploys an immediately joinable escrow in one signed Testnet transaction", async () => {
    const organizer = Keypair.random();
    const referee = Keypair.random();
    const player = Keypair.random();
    // fund organizer via Friendbot
    const res = await fetch(
      `https://friendbot.stellar.org/?addr=${encodeURIComponent(organizer.publicKey())}`,
    );
    expect(res.ok).toBe(true);
    const fundedPlayer = await fetch(
      `https://friendbot.stellar.org/?addr=${encodeURIComponent(player.publicKey())}`,
    );
    expect(fundedPlayer.ok).toBe(true);

    const { buildDeployInitializeTx, buildJoinTx, readSettlementDeadline, submitSignedXdr } =
      await import("./index");
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60);
    const out = await buildDeployInitializeTx({
      tournamentId: `testnet-${organizer.publicKey()}`,
      organizerAddress: organizer.publicKey(),
      refereeAddress: referee.publicKey(),
      // Avoid resolveSacAddress here: the test must not depend on NATIVE_SAC_ADDRESS.
      tokenAddr: Asset.native().contractId(PASSPHRASE),
      entryFee: 10_000_000n,
      distributionBps: [6000, 3000, 1000],
      settlementDeadline: deadline,
    });
    const deploy = TransactionBuilder.fromXDR(out.xdr, PASSPHRASE);
    expect(deploy.operations).toHaveLength(1);
    const operation = deploy.operations[0] as {
      func?: { switch(): { name: string }; value(): { constructorArgs(): unknown[] } };
    };
    expect(operation.func?.switch().name).toBe("hostFunctionTypeCreateContractV2");
    expect(operation.func?.value().constructorArgs()).toHaveLength(6);
    const sorobanData = deploy.toEnvelope().v1().tx().ext().value();
    expect(BigInt(sorobanData!.resourceFee().toString())).toBeGreaterThan(0n);
    deploy.sign(organizer);
    const deployed = await submitSignedXdr(deploy.toEnvelope().toXDR("base64"), "deploy");
    expect(deployed.status).toBe("SUCCESS");
    expect(deployed.contractId).toBeDefined();

    await expect(
      readSettlementDeadline({
        contractId: deployed.contractId!,
        sourceAddress: organizer.publicKey(),
      }),
    ).resolves.toBe(deadline);
    const join = await buildJoinTx({
      contractId: deployed.contractId!,
      playerAddress: player.publicKey(),
    });
    const joinTx = TransactionBuilder.fromXDR(join.xdr, PASSPHRASE);
    joinTx.sign(player);
    await expect(
      submitSignedXdr(joinTx.toEnvelope().toXDR("base64"), "join"),
    ).resolves.toMatchObject({
      status: "SUCCESS",
    });
  }, 120_000);
});
