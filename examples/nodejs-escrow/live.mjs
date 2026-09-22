import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { EscrowSdk, EscrowSdkError } from "@ggg/escrow-sdk";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("<")) throw new Error(`Set ${name} in .env`);
  return value;
};

async function main() {
  const rpcUrl = required("RPC_URL");
  const networkPassphrase = required("NETWORK_PASSPHRASE");
  if (networkPassphrase !== "Test SDF Network ; September 2015") {
    throw new Error("This example runs on Stellar Testnet only");
  }
  const wasmHash = required("ESCROW_WASM_HASH");
  const token = required("TOKEN_SAC_ID");
  const organizer = required("ORGANIZER");
  const referee = required("REFEREE");
  const players = required("PLAYERS")
    .split(",")
    .map((v) => v.trim());
  const delegate = required("DELEGATE");
  const distributionBps = required("DISTRIBUTION_BPS")
    .split(",")
    .map((v) => Number(v.trim()));
  const entryFee = BigInt(required("ENTRY_FEE_STROOPS"));
  const windowSeconds = Number(required("SETTLEMENT_WINDOW_SECONDS"));
  if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 90 || windowSeconds > 90 * 86400) {
    throw new Error("SETTLEMENT_WINDOW_SECONDS must be 90 through 7776000");
  }
  if (players.length !== distributionBps.length || new Set(players).size !== players.length) {
    throw new Error("PLAYERS must be distinct and match DISTRIBUTION_BPS length");
  }
  const signerPath = required("SIGNER_MODULE");
  if (!/^[A-Za-z]:[\\/]|^\//.test(signerPath))
    throw new Error("SIGNER_MODULE must be an absolute path");
  const { signTransaction, getNetworkPassphrase } = await import(pathToFileURL(signerPath).href);
  if (typeof signTransaction !== "function" || typeof getNetworkPassphrase !== "function") {
    throw new Error("Signer module must export signTransaction and getNetworkPassphrase");
  }

  const sdk = (contractId) =>
    new EscrowSdk({
      rpcUrl,
      networkPassphrase,
      ...(contractId ? { contractId } : { wasmHash }),
    });
  const link = (hash) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function send(client, source, built) {
    const signerNetwork = await getNetworkPassphrase(source);
    check(signerNetwork === networkPassphrase, "Signer network differs from Testnet");
    const signedXdr = await signTransaction({ source, xdr: built.xdr, networkPassphrase });
    try {
      const result = await client.submit(signedXdr, built, signerNetwork);
      if (result.status === "FAILED") {
        console.error(`${built.intent} confirmed FAILED: ${result.hash} ${link(result.hash)}`);
        throw new Error("Confirmed ledger execution failed");
      }
      console.log(`${built.intent}: ${result.hash} ${link(result.hash)}`);
      return result;
    } catch (error) {
      if (error instanceof EscrowSdkError && error.hash) {
        const status = await client.lookup(error.hash, built.intent);
        console.error(`${built.intent} hash ${error.hash}: ${status.status}; ${link(error.hash)}`);
        if (status.status === "SUCCESS") return status;
      }
      throw error;
    }
  }

  async function newTournament(label, deadline, bps) {
    const built = await sdk().buildDeploy(organizer, {
      referee,
      token,
      entryFee,
      distributionBps: bps,
      settlementDeadline: BigInt(deadline),
      salt: randomBytes(32),
    });
    const result = await send(sdk(), organizer, built);
    check(result.contractId, `${label}: confirmed deployment has no contract ID`);
    console.log(`${label} contract: ${result.contractId}`);
    const client = sdk(result.contractId);
    const state = await client.readTournament(organizer);
    check(
      state.organizer === organizer && state.referee === referee && state.token === token,
      `${label}: constructor state mismatch`,
    );
    check(
      state.entry_fee === entryFee && state.settlement_deadline === BigInt(deadline),
      `${label}: constructor terms mismatch`,
    );
    return client;
  }

  async function join(client, player) {
    await send(client, player, await client.buildJoin(player));
    check(
      (await client.readPlayers(organizer)).includes(player),
      "Confirmed join missing on chain",
    );
  }

  const now = () => Math.floor(Date.now() / 1000);
  const start = now();
  const settled = await newTournament("settlement", start + windowSeconds, distributionBps);
  for (const player of players) await join(settled, player);
  const pool = await settled.readPool(organizer);
  check(pool === entryFee * BigInt(players.length), "Settlement pool mismatch before payout");
  await send(settled, referee, await settled.buildFinalize(referee, players));
  const finalState = await settled.readTournament(organizer);
  check(
    finalState.finished &&
      !finalState.cancelled &&
      JSON.stringify(finalState.winners) === JSON.stringify(players),
    "Settlement not confirmed on chain",
  );
  check(await settled.readFinished(organizer), "Finished read disagrees");
  const payouts = await Promise.all(players.map((player) => settled.readReward(organizer, player)));
  check(
    payouts.reduce((a, b) => a + b, 0n) === pool && (await settled.readPool(organizer)) === 0n,
    "Confirmed payout amounts or remaining pool mismatch",
  );
  console.log(`confirmed payouts (stroops): ${payouts.join(", ")}`);

  // Terminal outcomes are alternatives, so refunds use fresh contract instances.
  const refundDeadline = now() + 90;
  const expired = await newTournament("deadline refund", refundDeadline, [10000]);
  await join(expired, players[0]);
  console.log(`Waiting for deadline ${refundDeadline} UTC Unix seconds on the deadline instance`);
  while (now() < refundDeadline + 20) await pause(5000);
  check(
    (await expired.readSettlementDeadline(organizer)) === BigInt(refundDeadline),
    "Deadline read mismatch",
  );
  check(!(await expired.readTournament(organizer)).cancelled, "Deadline instance was cancelled");
  await send(expired, delegate, await expired.buildClaimRefund(delegate, players[0]));
  check(
    (await expired.readPool(organizer)) === 0n && !(await expired.readFinished(organizer)),
    "Deadline refund not confirmed on chain",
  );
  console.log(`confirmed delegated deadline refund: ${entryFee} stroops to ${players[0]}`);

  const cancelled = await newTournament("cancellation refund", now() + windowSeconds, [10000]);
  await join(cancelled, players[0]);
  await send(cancelled, organizer, await cancelled.buildCancel(organizer));
  check(
    (await cancelled.readTournament(organizer)).cancelled,
    "Cancellation not confirmed on chain",
  );
  await send(cancelled, delegate, await cancelled.buildClaimRefund(delegate, players[0]));
  check(
    (await cancelled.readPool(organizer)) === 0n && !(await cancelled.readFinished(organizer)),
    "Cancellation refund not confirmed on chain",
  );
  console.log(`confirmed cancellation refund: ${entryFee} stroops to ${players[0]}`);
}

main().catch((error) => {
  if (error instanceof EscrowSdkError) {
    console.error(`${error.code}: ${error.message}${error.hash ? ` (${error.hash})` : ""}`);
  } else {
    console.error(
      "Example stopped. Check configuration, signer, funding, and Testnet state privately.",
    );
  }
  process.exitCode = 1;
});
