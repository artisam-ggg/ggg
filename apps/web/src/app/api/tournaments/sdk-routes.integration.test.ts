import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Account,
  Address,
  Keypair,
  SorobanDataBuilder,
  StrKey,
  TransactionBuilder,
  contract,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { CURRENT_ESCROW_WASM_HASH } from "@ggg/escrow-sdk";
import { Client } from "@ggg/escrow-sdk/contract";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { createSession } from "@/lib/session-store";
import { POST as buildJoinRoute } from "./[id]/join/route";
import { POST as buildFinalizeRoute } from "./[id]/finalize/route";
import { POST as buildCancelRoute } from "./[id]/cancel/route";
import { POST as buildRefundRoute } from "./[id]/refund/route";
import { POST as submitRoute } from "./[id]/submit/route";
import { POST as createRoute } from "./route";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));

const organizer = Keypair.random();
const referee = Keypair.random();
const player = Keypair.random();
const otherPlayer = Keypair.random();
let contractId: string;
const username = `it_sdk_${Date.now()}`;
let userId: string;
let tournamentId: string;
const tournamentIds: string[] = [];
const passphrase = "Test SDF Network ; September 2015";

function signedXdr(unsignedXdr: string, signer: Keypair): { xdr: string; hash: string } {
  const tx = TransactionBuilder.fromXDR(unsignedXdr, passphrase);
  tx.sign(signer);
  return { xdr: tx.toXDR(), hash: tx.hash().toString("hex") };
}

function confirm(hash: string) {
  vi.spyOn(rpc.Server.prototype, "sendTransaction").mockResolvedValue({
    status: "PENDING",
    hash,
  } as never);
  vi.spyOn(rpc.Server.prototype, "getTransaction").mockResolvedValue({
    status: "SUCCESS",
  } as never);
}

async function submit(intent: string, xdr: string) {
  return submitRoute(request("submit", { intent, signedXdr: xdr }), {
    params: Promise.resolve({ id: tournamentId }),
  });
}

async function createDraft() {
  const spec = new Client({
    contractId,
    publicKey: organizer.publicKey(),
    rpcUrl: "https://rpc.example",
    networkPassphrase: passphrase,
  }).spec;
  vi.spyOn(rpc.Server.prototype, "getContractWasmByHash").mockResolvedValue(Buffer.alloc(0));
  vi.spyOn(contract.Spec, "fromWasm").mockReturnValue(spec);
  const created = await createRoute(
    request("", {
      name: "SDK route deployment",
      gameTitle: "Game",
      asset: "XLM",
      entryFee: "10",
      organizerAddress: organizer.publicKey(),
      refereeAddress: referee.publicKey(),
      distributionBps: [10000],
      settlementDeadline: Math.floor(Date.now() / 1000) + 7200,
    }),
  );
  expect(created.status, JSON.stringify(await created.clone().json())).toBe(201);
  const { tournamentId: draftId, unsignedXdr } = (await created.json()).data;
  tournamentIds.push(draftId);
  return { draftId: draftId as string, unsignedXdr: unsignedXdr as string };
}

function request(path: string, body: unknown, extra: Record<string, string> = {}) {
  return new Request(`http://localhost:3000/api/tournaments/${tournamentId}/${path}`, {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
      "idempotency-key": "integration-test",
      ...extra,
    },
    body: JSON.stringify(body),
  }) as never;
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { username, passwordHash: "integration-only", role: "ORGANIZER" },
  });
  userId = user.id;
});

beforeEach(async () => {
  await redis.flushdb();
  contractId = StrKey.encodeContract(Keypair.random().rawPublicKey());
  const sid = `sdk-integration-${Date.now()}`;
  await createSession(userId, sid, 60);
  session.current = { user: { id: userId, username, role: "ORGANIZER" }, sid };
  const tournament = await prisma.tournament.create({
    data: {
      name: "SDK integration",
      gameTitle: "Game",
      asset: "XLM",
      entryFee: 10n,
      distributionBps: [10000],
      organizerId: userId,
      organizerAddr: organizer.publicKey(),
      refereeAddr: referee.publicKey(),
      tokenAddr: contractId,
      contractId,
      status: "ACTIVE",
      settlementDeadline: new Date(Date.now() + 2 * 60 * 60 * 1000),
      deadlineConfirmedAt: new Date(),
    },
  });
  tournamentId = tournament.id;
  tournamentIds.push(tournamentId);
  vi.restoreAllMocks();
  vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockResolvedValue({
    entries: [
      {
        val: {
          contractData: () => ({
            val: () => ({
              instance: () => ({
                executable: () => ({
                  switch: () => ({ name: "contractExecutableWasm" }),
                  wasmHash: () => Buffer.from(CURRENT_ESCROW_WASM_HASH, "hex"),
                }),
              }),
            }),
          }),
        },
      },
    ],
  } as never);
  vi.spyOn(rpc.Server.prototype, "getAccount").mockImplementation(
    async (address) => new Account(address, "1") as never,
  );
  vi.spyOn(rpc.Server.prototype, "simulateTransaction").mockResolvedValue({
    _parsed: true,
    transactionData: new SorobanDataBuilder(),
    minResourceFee: "100",
    result: { retval: xdr.ScVal.scvVoid(), auth: [] },
  } as never);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.participant.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
  await prisma.joinSubmission.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
  await prisma.tournament.deleteMany({ where: { organizerId: userId } });
  await prisma.user.delete({ where: { id: userId } });
  await redis.flushdb();
  await redis.quit();
  await prisma.$disconnect();
});

describe("SDK-backed tournament route integration", () => {
  it("builds a join through the real SDK and stores its prepared transaction", async () => {
    const response = await buildJoinRoute(request("join", { playerAddress: player.publicKey() }), {
      params: Promise.resolve({ id: tournamentId }),
    });
    expect(response.status).toBe(200);
    const json = await response.json();
    const tx = TransactionBuilder.fromXDR(
      json.data.unsignedXdr,
      "Test SDF Network ; September 2015",
    );
    expect(tx.operations).toHaveLength(1);
  });

  it("submits a signed join and persists a participant only after RPC confirmation", async () => {
    const built = await buildJoinRoute(request("join", { playerAddress: player.publicKey() }), {
      params: Promise.resolve({ id: tournamentId }),
    });
    expect(built.status).toBe(200);
    const { unsignedXdr } = (await built.json()).data;
    const { xdr, hash } = signedXdr(unsignedXdr, player);
    confirm(hash);
    const result = await submit("join", xdr);
    expect(result.status).toBe(200);
    expect(
      await prisma.participant.findUnique({
        where: { tournamentId_playerAddr: { tournamentId, playerAddr: player.publicKey() } },
      }),
    ).toMatchObject({ joinTxHash: hash });
  });

  it("does not register a join when RPC confirmation fails", async () => {
    const built = await buildJoinRoute(request("join", { playerAddress: player.publicKey() }), {
      params: Promise.resolve({ id: tournamentId }),
    });
    const { xdr, hash } = signedXdr((await built.json()).data.unsignedXdr, player);
    vi.spyOn(rpc.Server.prototype, "sendTransaction").mockResolvedValue({
      status: "PENDING",
      hash,
    } as never);
    vi.spyOn(rpc.Server.prototype, "getTransaction").mockResolvedValue({
      status: "FAILED",
    } as never);
    expect((await submit("join", xdr)).status).toBe(422);
    expect(await prisma.participant.count({ where: { tournamentId } })).toBe(0);
  });

  it("rejects a signed transaction for a different contract before broadcast", async () => {
    const built = await buildJoinRoute(request("join", { playerAddress: player.publicKey() }), {
      params: Promise.resolve({ id: tournamentId }),
    });
    const { xdr } = signedXdr((await built.json()).data.unsignedXdr, player);
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { contractId: StrKey.encodeContract(Keypair.random().rawPublicKey()) },
    });
    const broadcast = vi.spyOn(rpc.Server.prototype, "sendTransaction");
    expect((await submit("join", xdr)).status).toBe(400);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("blocks writes to a legacy-WASM escrow", async () => {
    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockResolvedValue({
      entries: [
        {
          val: {
            contractData: () => ({
              val: () => ({
                instance: () => ({
                  executable: () => ({
                    switch: () => ({ name: "contractExecutableWasm" }),
                    wasmHash: () => Buffer.alloc(32, 1),
                  }),
                }),
              }),
            }),
          },
        },
      ],
    } as never);
    const result = await buildJoinRoute(request("join", { playerAddress: player.publicKey() }), {
      params: Promise.resolve({ id: tournamentId }),
    });
    expect(result.status).toBe(409);
    expect(await prisma.preparedEscrowTransaction.count({ where: { tournamentId } })).toBe(0);
  });

  it("prevents a different organizer from cancelling or submitting this tournament", async () => {
    const other = await prisma.user.create({
      data: { username: `${username}_other`, passwordHash: "integration-only", role: "ORGANIZER" },
    });
    try {
      const built = await buildCancelRoute(request("cancel", {}), {
        params: Promise.resolve({ id: tournamentId }),
      });
      expect(built.status).toBe(200);
      const { xdr } = signedXdr((await built.json()).data.unsignedXdr, organizer);
      const sid = `sdk-other-${Date.now()}`;
      await createSession(other.id, sid, 60);
      session.current = {
        user: { id: other.id, username: other.username, role: "ORGANIZER" },
        sid,
      };
      expect(
        (
          await buildCancelRoute(request("cancel", {}), {
            params: Promise.resolve({ id: tournamentId }),
          })
        ).status,
      ).toBe(403);
      const broadcast = vi.spyOn(rpc.Server.prototype, "sendTransaction");
      expect((await submit("cancel", xdr)).status).toBe(403);
      expect(broadcast).not.toHaveBeenCalled();
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });

  it("builds and confirms a cancel, while enforcing the organizer session", async () => {
    session.current = null;
    expect(
      (
        await buildCancelRoute(request("cancel", {}), {
          params: Promise.resolve({ id: tournamentId }),
        })
      ).status,
    ).toBe(401);
    const sid = `sdk-cancel-${Date.now()}`;
    await createSession(userId, sid, 60);
    session.current = { user: { id: userId, username, role: "ORGANIZER" }, sid };
    const built = await buildCancelRoute(request("cancel", {}), {
      params: Promise.resolve({ id: tournamentId }),
    });
    expect(built.status).toBe(200);
    const { xdr, hash } = signedXdr((await built.json()).data.unsignedXdr, organizer);
    confirm(hash);
    expect((await submit("cancel", xdr)).status).toBe(200);
    expect(
      await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { status: true } }),
    ).toMatchObject({ status: "CANCELLED" });
  });

  it("builds a refund claim after confirmed cancellation", async () => {
    await prisma.tournament.update({ where: { id: tournamentId }, data: { status: "CANCELLED" } });
    const built = await buildRefundRoute(
      request("refund", {
        playerAddress: player.publicKey(),
        submitterAddress: otherPlayer.publicKey(),
      }),
      { params: Promise.resolve({ id: tournamentId }) },
    );
    expect(built.status).toBe(200);
    const { xdr, hash } = signedXdr((await built.json()).data.unsignedXdr, otherPlayer);
    confirm(hash);
    expect((await submit("claim_refund", xdr)).status).toBe(200);
  });

  it.each([1, 2])("finalizes with %i registered winner(s) after confirmation", async (count) => {
    const winners = [player.publicKey(), otherPlayer.publicKey()].slice(0, count);
    const distributionBps = count === 1 ? [10000] : [6000, 4000];
    await prisma.tournament.update({ where: { id: tournamentId }, data: { distributionBps } });
    await prisma.participant.createMany({
      data: winners.map((playerAddr) => ({ tournamentId, playerAddr })),
    });
    const spec = new Client({
      contractId,
      publicKey: referee.publicKey(),
      rpcUrl: "https://rpc.example",
      networkPassphrase: passphrase,
    }).spec;
    const outputType = spec.getFunc("get_tournament").outputs()[0]!;
    const tournamentInfo = {
      cancelled: false,
      distribution_bps: distributionBps,
      entry_fee: 10n,
      finished: false,
      organizer: organizer.publicKey(),
      player_count: count,
      referee: referee.publicKey(),
      settlement_deadline: BigInt(Math.floor(Date.now() / 1000) + 7200),
      token: contractId,
      winners: [],
    };
    vi.spyOn(rpc.Server.prototype, "simulateTransaction").mockImplementation(async (tx) => {
      const op = tx.operations[0] as {
        func: { value(): { functionName(): { toString(): string } } };
      };
      const method = op.func.value().functionName().toString();
      return {
        _parsed: true,
        transactionData: new SorobanDataBuilder(),
        minResourceFee: "100",
        result: {
          retval:
            method === "get_tournament"
              ? spec.nativeToScVal(tournamentInfo, outputType)
              : xdr.ScVal.scvVoid(),
          auth: [],
        },
      } as never;
    });
    const built = await buildFinalizeRoute(
      request("finalize", { winners }, { "x-wallet-address": referee.publicKey() }),
      { params: Promise.resolve({ id: tournamentId }) },
    );
    expect(built.status).toBe(200);
    const { xdr: signed, hash } = signedXdr((await built.json()).data.unsignedXdr, referee);
    confirm(hash);
    expect((await submit("finalize", signed)).status).toBe(200);
    expect(
      await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { status: true } }),
    ).toMatchObject({ status: "FINISHED" });
  });

  it("creates a draft with the SDK constructor and activates it only after confirmed deployment", async () => {
    const { draftId, unsignedXdr } = await createDraft();
    expect(
      await prisma.tournament.findUnique({ where: { id: draftId }, select: { status: true } }),
    ).toMatchObject({ status: "DRAFT" });
    const operation = TransactionBuilder.fromXDR(unsignedXdr, passphrase).operations[0] as {
      func: { switch(): { name: string } };
    };
    expect(operation.func.switch().name).toBe("hostFunctionTypeCreateContractV2");
    const { xdr: signed, hash } = signedXdr(unsignedXdr, organizer);
    const deployedContractId = StrKey.encodeContract(Keypair.random().rawPublicKey());
    vi.spyOn(rpc.Server.prototype, "sendTransaction").mockResolvedValue({
      status: "PENDING",
      hash,
    } as never);
    vi.spyOn(rpc.Server.prototype, "getTransaction").mockResolvedValue({
      status: "SUCCESS",
      returnValue: Address.fromString(deployedContractId).toScVal(),
    } as never);
    const submitted = await submitRoute(
      new Request(`http://localhost:3000/api/tournaments/${draftId}/submit`, {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "idempotency-key": "sdk-deploy",
        },
        body: JSON.stringify({ intent: "deploy", signedXdr: signed }),
      }) as never,
      { params: Promise.resolve({ id: draftId }) },
    );
    expect(submitted.status).toBe(200);
    expect(
      await prisma.tournament.findUnique({
        where: { id: draftId },
        select: {
          status: true,
          contractId: true,
          deployTxHash: true,
        },
      }),
    ).toMatchObject({ status: "ACTIVE", contractId: deployedContractId, deployTxHash: hash });
  });

  it("keeps a draft pending when the deployment broadcast outcome is unknown", async () => {
    const { draftId, unsignedXdr } = await createDraft();
    const { xdr: signed, hash } = signedXdr(unsignedXdr, organizer);
    vi.spyOn(rpc.Server.prototype, "sendTransaction").mockRejectedValue(
      new Error("RPC unavailable"),
    );
    const result = await submitRoute(
      new Request(`http://localhost:3000/api/tournaments/${draftId}/submit`, {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "idempotency-key": "sdk-pending",
        },
        body: JSON.stringify({ intent: "deploy", signedXdr: signed }),
      }) as never,
      { params: Promise.resolve({ id: draftId }) },
    );
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ error: { code: "CONFIRMATION_FAILED" } });
    expect(
      await prisma.tournament.findUnique({
        where: { id: draftId },
        select: {
          status: true,
          contractId: true,
          pendingDeployTxHash: true,
        },
      }),
    ).toMatchObject({ status: "DRAFT", contractId: null, pendingDeployTxHash: hash });
  });
});
