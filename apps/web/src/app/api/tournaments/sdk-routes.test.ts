import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrKey } from "@stellar/stellar-sdk";

const tournamentId = "c123456789012345678901234";
const address = (n: number) => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, n));
const organizer = address(1);
const referee = address(2);
const players = [3, 4, 5, 6, 7].map(address);

const mocks = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  userId: "owner",
  submitResult: { hash: "hash", status: "SUCCESS", contractId: "CCONTRACT" } as {
    hash: string;
    status: "SUCCESS" | "FAILED";
    contractId?: string;
  },
  built: vi.fn(),
  submit: vi.fn(),
  lookup: vi.fn(),
  validate: vi.fn(),
  saved: vi.fn(),
  prepared: vi.fn(),
  forgetPrepared: vi.fn(),
  participantUpsert: vi.fn(),
  requireCurrent: vi.fn(),
  readTournament: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
    STELLAR_NETWORK: "testnet",
    NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
    ESCROW_WASM_HASH: "b704f577f1715d965f9ba24f2cebf49df52735d42c9a4cd2a93781d612a46dd9",
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    tournament: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        mocks.row = {
          id: tournamentId,
          ...data,
          contractId: null,
          deployTxHash: null,
          pendingDeployTxHash: null,
        };
        return mocks.row;
      }),
      findUnique: vi.fn(
        async () =>
          mocks.row && {
            ...mocks.row,
            participants: players.map((playerAddr) => ({
              playerAddr,
              joinedAt: new Date("2026-09-22T00:00:00Z"),
              joinTxHash: null,
            })),
          },
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(mocks.row!, data);
        return mocks.row;
      }),
    },
    participant: { findUnique: vi.fn(async () => null), upsert: mocks.participantUpsert },
    joinSubmission: {
      upsert: vi.fn(async () => ({ submittedAt: new Date("2026-09-22T00:00:00Z") })),
      deleteMany: vi.fn(async () => ({})),
    },
  },
}));
vi.mock("@/lib/stellar/escrow-sdk", () => {
  const sdk = {
    buildDeploy: vi.fn(async () => ({
      xdr: "BUILT",
      hash: "hash",
      intent: "deploy",
      source: "source",
      networkPassphrase: "passphrase",
    })),
    buildJoin: vi.fn(async () => ({
      xdr: "BUILT",
      hash: "hash",
      intent: "join",
      source: "source",
      networkPassphrase: "passphrase",
    })),
    buildFinalize: vi.fn(async () => ({
      xdr: "BUILT",
      hash: "hash",
      intent: "finalize",
      source: "source",
      networkPassphrase: "passphrase",
    })),
    buildCancel: vi.fn(async () => ({
      xdr: "BUILT",
      hash: "hash",
      intent: "cancel",
      source: "source",
      networkPassphrase: "passphrase",
    })),
    buildClaimRefund: vi.fn(async () => ({
      xdr: "BUILT",
      hash: "hash",
      intent: "claim_refund",
      source: "source",
      networkPassphrase: "passphrase",
    })),
    validateSignedXdr: mocks.validate,
    readTournament: mocks.readTournament,
    submit: mocks.submit,
    lookup: mocks.lookup,
  };
  mocks.built.mockReturnValue(sdk);
  return {
    CURRENT_ESCROW_WASM_HASH: "b704f577f1715d965f9ba24f2cebf49df52735d42c9a4cd2a93781d612a46dd9",
    escrowSdk: mocks.built,
    escrowToken: vi.fn(() => "CTOKEN"),
    escrowVersion: vi.fn(async () => "CURRENT"),
    requireCurrentEscrow: mocks.requireCurrent,
    savePrepared: mocks.saved,
    findPrepared: mocks.prepared,
    forgetPrepared: mocks.forgetPrepared,
    deploymentSalt: vi.fn(() => new Uint8Array(32)),
  };
});
vi.mock("@/lib/auth-guards", () => ({
  requireUser: vi.fn(async () => ({ id: mocks.userId, role: "ORGANIZER", username: "owner" })),
  AuthError: class AuthError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/csrf", () => ({
  assertSameOrigin: vi.fn(),
  CsrfError: class CsrfError extends Error {},
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/server/services/idempotency", () => ({
  withIdempotency: vi.fn(async (_key: string, run: () => Promise<unknown>) => run()),
}));

import { POST as create } from "./route";
import { GET as detail } from "./[id]/route";
import { POST as deployOrSubmit } from "./[id]/submit/route";
import { POST as join } from "./[id]/join/route";
import { POST as finalize } from "./[id]/finalize/route";
import { POST as cancel } from "./[id]/cancel/route";
import { POST as refund } from "./[id]/refund/route";
import { requireUser, AuthError } from "@/lib/auth-guards";
import { EscrowSdkError } from "@ggg/escrow-sdk";
import { withIdempotency } from "@/server/services/idempotency";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { getTournamentDisplayStatus } from "@/server/services/tournaments";

const ctx = { params: Promise.resolve({ id: tournamentId }) };
const deadline = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
function request(path: string, body: unknown, extra: Record<string, string> = {}) {
  return new Request(`http://localhost:3000/api/tournaments${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "idempotency-key": "key",
      ...extra,
    },
    body: JSON.stringify(body),
  }) as never;
}
const signed = { signedXdr: "AAAAAgAAAAA=", intent: "deploy" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = "owner";
  mocks.row = {
    id: tournamentId,
    organizerId: "owner",
    organizerAddr: organizer,
    refereeAddr: referee,
    status: "ACTIVE",
    contractId: "CCONTRACT",
    entryFee: 10n,
    distributionBps: [10000],
    settlementDeadline: new Date(Date.now() - 1000),
    deadlineConfirmedAt: new Date(),
    tokenAddr: "CTOKEN",
    deployTxHash: null,
    pendingDeployTxHash: null,
    events: [],
    payouts: [],
    coverImageKey: null,
  };
  mocks.readTournament.mockResolvedValue({ settlement_deadline: 1_800_000_000n });
  mocks.submitResult = { hash: "hash", status: "SUCCESS", contractId: "CCONTRACT" };
  mocks.submit.mockImplementation(async () => mocks.submitResult);
  mocks.lookup.mockResolvedValue({ hash: "hash", status: "PENDING" });
  mocks.requireCurrent.mockReturnValue(mocks.built());
  mocks.saved.mockImplementation(async () => ({ unsignedXdr: "BUILT", network: "testnet" }));
  mocks.prepared.mockImplementation(async (_id, _xdr, intent) => ({
    xdr: "BUILT",
    hash: "hash",
    intent,
    source:
      intent === "deploy" || intent === "cancel"
        ? organizer
        : intent === "finalize"
          ? referee
          : players[0],
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CCONTRACT",
  }));
});

describe("SDK-backed tournament routes", () => {
  it("creates one prepared constructor and activates only after confirmed deployment", async () => {
    const created = await create(
      request("", {
        name: "Cup",
        gameTitle: "Game",
        asset: "XLM",
        entryFee: "10",
        organizerAddress: organizer,
        refereeAddress: referee,
        settlementDeadline: deadline,
        distributionBps: [10000],
      }),
    );
    expect(created.status).toBe(201);
    expect(mocks.row?.status).toBe("DRAFT");
    expect(mocks.built().buildDeploy).toHaveBeenCalledOnce();
    const result = await deployOrSubmit(request(`/${tournamentId}/submit`, signed), ctx);
    expect(result.status).toBe(200);
    expect(mocks.validate).toHaveBeenCalledOnce();
    expect(mocks.row?.status).toBe("ACTIVE");
    expect(mocks.forgetPrepared).toHaveBeenCalledWith("hash");
  });

  it("builds a join and records a participant only after confirmation", async () => {
    expect(
      (await join(request(`/${tournamentId}/join`, { playerAddress: players[0] }), ctx)).status,
    ).toBe(200);
    mocks.submitResult = { hash: "hash", status: "FAILED" };
    expect(
      (await deployOrSubmit(request(`/${tournamentId}/submit`, { ...signed, intent: "join" }), ctx))
        .status,
    ).toBe(422);
    expect(mocks.participantUpsert).not.toHaveBeenCalled();
  });

  it("persists a participant only for a confirmed SDK join", async () => {
    const response = await deployOrSubmit(
      request(`/${tournamentId}/submit`, { ...signed, intent: "join" }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(mocks.participantUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ playerAddr: players[0] }) }),
    );
  });

  it("keeps a deployment draft pending when confirmation is uncertain", async () => {
    Object.assign(mocks.row!, {
      status: "DRAFT",
      contractId: null,
      settlementDeadline: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });
    mocks.submit.mockRejectedValueOnce(new EscrowSdkError("TX_TIMEOUT", "Unconfirmed", "hash"));
    const response = await deployOrSubmit(request(`/${tournamentId}/submit`, signed), ctx);
    expect(response.status).toBe(504);
    expect(mocks.row?.status).toBe("DRAFT");
    expect(mocks.row?.pendingDeployTxHash).toBe("hash");
    expect(mocks.forgetPrepared).not.toHaveBeenCalled();
  });

  it("recovers a late successful deployment before checking an expired deadline", async () => {
    Object.assign(mocks.row!, {
      status: "DRAFT",
      contractId: null,
      pendingDeployTxHash: "old-hash",
    });
    mocks.lookup.mockResolvedValueOnce({ hash: "old-hash", status: "SUCCESS", contractId: "COLD" });
    const response = await deployOrSubmit(request(`/${tournamentId}/submit`, signed), ctx);
    expect(response.status).toBe(200);
    expect(mocks.row).toMatchObject({
      status: "ACTIVE",
      contractId: "COLD",
      pendingDeployTxHash: null,
    });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("does not replace a different deployment while its outcome is pending", async () => {
    Object.assign(mocks.row!, {
      status: "DRAFT",
      contractId: null,
      pendingDeployTxHash: "old-hash",
      settlementDeadline: new Date(Date.now() + 60_000),
    });
    const response = await deployOrSubmit(request(`/${tournamentId}/submit`, signed), ctx);
    expect(response.status).toBe(504);
    expect(mocks.row?.pendingDeployTxHash).toBe("old-hash");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("clears a confirmed failed deployment of the same hash", async () => {
    Object.assign(mocks.row!, {
      status: "DRAFT",
      contractId: null,
      pendingDeployTxHash: "hash",
      settlementDeadline: new Date(Date.now() + 60_000),
    });
    mocks.lookup.mockResolvedValueOnce({ hash: "hash", status: "FAILED" });
    const response = await deployOrSubmit(request(`/${tournamentId}/submit`, signed), ctx);
    expect(response.status).toBe(422);
    expect(mocks.row?.pendingDeployTxHash).toBeNull();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.forgetPrepared).toHaveBeenCalledWith("hash");
  });

  it("recovers a rejected submission that landed successfully", async () => {
    Object.assign(mocks.row!, {
      status: "DRAFT",
      contractId: null,
      settlementDeadline: new Date(Date.now() + 60_000),
    });
    mocks.submit.mockRejectedValueOnce(new EscrowSdkError("SUBMIT_REJECTED", "Rejected", "hash"));
    mocks.lookup.mockResolvedValueOnce({ hash: "hash", status: "SUCCESS", contractId: "CRECOVER" });
    const response = await deployOrSubmit(request(`/${tournamentId}/submit`, signed), ctx);
    expect(response.status).toBe(200);
    expect(mocks.row).toMatchObject({ status: "ACTIVE", contractId: "CRECOVER" });
  });

  it("keeps a rejected submission pending when lookup remains uncertain", async () => {
    Object.assign(mocks.row!, {
      status: "DRAFT",
      contractId: null,
      pendingDeployTxHash: "hash",
      settlementDeadline: new Date(Date.now() + 60_000),
    });
    mocks.submit.mockRejectedValueOnce(new EscrowSdkError("SUBMIT_REJECTED", "Rejected", "hash"));
    const response = await deployOrSubmit(request(`/${tournamentId}/submit`, signed), ctx);
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ error: { code: "TX_TIMEOUT" } });
    expect(mocks.row?.pendingDeployTxHash).toBe("hash");
    expect(mocks.forgetPrepared).not.toHaveBeenCalled();
  });

  it("clears a rejected first deployment so a new hash can be submitted", async () => {
    Object.assign(mocks.row!, {
      status: "DRAFT",
      contractId: null,
      settlementDeadline: new Date(Date.now() + 60_000),
    });
    mocks.submit.mockRejectedValueOnce(new EscrowSdkError("SUBMIT_REJECTED", "Rejected", "hash"));
    const response = await deployOrSubmit(request(`/${tournamentId}/submit`, signed), ctx);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "SUBMIT_REJECTED" } });
    expect(mocks.row?.pendingDeployTxHash).toBeNull();
    expect(mocks.forgetPrepared).toHaveBeenCalledWith("hash");
  });

  it("rejects an expired unsubmitted deployment", async () => {
    Object.assign(mocks.row!, { status: "DRAFT", contractId: null });
    const response = await deployOrSubmit(request(`/${tournamentId}/submit`, signed), ctx);
    expect(response.status).toBe(409);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("derives refund display status only after a confirmed deadline", () => {
    const base = {
      status: "ACTIVE" as const,
      settlementDeadline: new Date(0),
      deadlineConfirmedAt: new Date(0),
      participantAddresses: [players[0]!],
      refundClaimedPlayers: [] as string[],
    };
    expect(getTournamentDisplayStatus(base, 1)).toBe("REFUNDS_OPEN");
    expect(getTournamentDisplayStatus({ ...base, refundClaimedPlayers: [players[0]!] }, 1)).toBe(
      "REFUNDED",
    );
    expect(getTournamentDisplayStatus({ ...base, deadlineConfirmedAt: null }, 1)).toBe("ACTIVE");
  });

  it.each([[players[0]!], [players[0]!, players[1]!, players[2]!]])(
    "builds ordered finalize winners",
    async (...winners) => {
      mocks.row!.distributionBps = winners.map((_, i) =>
        i === 0 ? 10000 - (winners.length - 1) * 1000 : 1000,
      );
      const response = await finalize(
        request(`/${tournamentId}/finalize`, { winners }, { "x-wallet-address": referee }),
        ctx,
      );
      expect(response.status).toBe(200);
      expect(mocks.built().buildFinalize).toHaveBeenCalledWith(referee, winners);
    },
  );

  it("rejects an unregistered winner and a non-referee", async () => {
    expect(
      (
        await finalize(
          request(
            `/${tournamentId}/finalize`,
            { winners: [organizer] },
            { "x-wallet-address": referee },
          ),
          ctx,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await finalize(
          request(
            `/${tournamentId}/finalize`,
            { winners: [players[0]] },
            { "x-wallet-address": organizer },
          ),
          ctx,
        )
      ).status,
    ).toBe(403);
  });

  it("rejects duplicate winners and wrong payout-vector length", async () => {
    expect(
      (
        await finalize(
          request(
            `/${tournamentId}/finalize`,
            { winners: [players[0], players[0]] },
            { "x-wallet-address": referee },
          ),
          ctx,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await finalize(
          request(
            `/${tournamentId}/finalize`,
            { winners: [players[0], players[1]] },
            { "x-wallet-address": referee },
          ),
          ctx,
        )
      ).status,
    ).toBe(409);
  });

  it("builds cancel and a deadline refund for the contract-selected recipient", async () => {
    expect((await cancel(request(`/${tournamentId}/cancel`, {}), ctx)).status).toBe(200);
    expect(
      (
        await refund(
          request(`/${tournamentId}/refund`, {
            playerAddress: players[0],
            submitterAddress: players[1],
          }),
          ctx,
        )
      ).status,
    ).toBe(200);
    expect(mocks.built().buildClaimRefund).toHaveBeenCalledWith(players[1], players[0]);
  });

  it("marks finalize and cancel only after confirmed SDK submissions", async () => {
    mocks.submitResult = { hash: "hash", status: "FAILED" };
    expect(
      (
        await deployOrSubmit(
          request(`/${tournamentId}/submit`, { ...signed, intent: "finalize" }),
          ctx,
        )
      ).status,
    ).toBe(422);
    expect(mocks.row?.status).toBe("ACTIVE");
    mocks.submitResult = { hash: "hash", status: "SUCCESS" };
    expect(
      (
        await deployOrSubmit(
          request(`/${tournamentId}/submit`, { ...signed, intent: "finalize" }),
          ctx,
        )
      ).status,
    ).toBe(200);
    expect(mocks.row?.status).toBe("FINISHED");
    mocks.row!.status = "ACTIVE";
    expect(
      (
        await deployOrSubmit(
          request(`/${tournamentId}/submit`, { ...signed, intent: "cancel" }),
          ctx,
        )
      ).status,
    ).toBe(200);
    expect(mocks.row?.status).toBe("CANCELLED");
  });

  it("leaves refund status to the confirmed event subscriber", async () => {
    const response = await deployOrSubmit(
      request(`/${tournamentId}/submit`, { ...signed, intent: "claim_refund" }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(mocks.row?.status).toBe("ACTIVE");
  });

  it("preserves owner checks and rejects removed initialize intent", async () => {
    mocks.userId = "other";
    expect((await cancel(request(`/${tournamentId}/cancel`, {}), ctx)).status).toBe(403);
    expect(
      (
        await deployOrSubmit(
          request(`/${tournamentId}/submit`, { ...signed, intent: "initialize" }),
          ctx,
        )
      ).status,
    ).toBe(400);
  });

  it("rejects incompatible escrow versions before mutation", async () => {
    mocks.requireCurrent.mockRejectedValueOnce(
      Object.assign(new Error("Unsupported legacy ABI"), { status: 409 }),
    );
    expect(
      (await join(request(`/${tournamentId}/join`, { playerAddress: players[0] }), ctx)).status,
    ).toBe(409);
  });

  it("rejects signed network and contract mismatches", async () => {
    mocks.validate.mockImplementationOnce(() => {
      throw new EscrowSdkError("NETWORK_MISMATCH", "Wrong network");
    });
    expect(
      (await deployOrSubmit(request(`/${tournamentId}/submit`, { ...signed, intent: "join" }), ctx))
        .status,
    ).toBe(400);
    mocks.prepared.mockRejectedValueOnce(new EscrowSdkError("INVALID_INPUT", "Wrong contract"));
    expect(
      (await deployOrSubmit(request(`/${tournamentId}/submit`, { ...signed, intent: "join" }), ctx))
        .status,
    ).toBe(400);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("requires an app session and keeps deployment scoped to its owner", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new AuthError("Login required", 401));
    expect((await create(request("", {}))).status).toBe(401);
    mocks.userId = "other";
    expect((await deployOrSubmit(request(`/${tournamentId}/submit`, signed), ctx)).status).toBe(
      403,
    );
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("scopes non-deployment idempotency results to the user and intent", async () => {
    const body = { ...signed, intent: "join" };
    await deployOrSubmit(request(`/${tournamentId}/submit`, body), ctx);
    mocks.userId = "other";
    await deployOrSubmit(request(`/${tournamentId}/submit`, body), ctx);
    expect(vi.mocked(withIdempotency).mock.calls.map(([key]) => key)).toEqual([
      `${tournamentId}:owner:join:key`,
      `${tournamentId}:other:join:key`,
    ]);
  });

  it("does not expose an unsafe on-chain deadline as an imprecise number", async () => {
    const safe = await detail(new Request(`http://localhost/tournaments/${tournamentId}`), ctx);
    expect((await safe.json()).data.settlementDeadline).toBe(1_800_000_000);
    mocks.readTournament.mockResolvedValueOnce({
      settlement_deadline: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
    });
    const unsafe = await detail(new Request(`http://localhost/tournaments/${tournamentId}`), ctx);
    expect(await unsafe.json()).toMatchObject({
      data: { settlementDeadline: null, contractVersion: "UNAVAILABLE" },
    });
  });

  const guardedRoutes = [
    [
      "submit",
      () => deployOrSubmit(request(`/${tournamentId}/submit`, { ...signed, intent: "join" }), ctx),
    ],
    ["join", () => join(request(`/${tournamentId}/join`, { playerAddress: players[0] }), ctx)],
    [
      "finalize",
      () =>
        finalize(
          request(
            `/${tournamentId}/finalize`,
            { winners: [players[0]] },
            { "x-wallet-address": referee },
          ),
          ctx,
        ),
    ],
  ] as const;

  it.each(guardedRoutes)("returns 403 for %s CSRF failures", async (_name, run) => {
    vi.mocked(assertSameOrigin).mockImplementationOnce(() => {
      throw new CsrfError();
    });
    const response = await run();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "CSRF_VIOLATION" } });
  });

  it.each(guardedRoutes)("returns 429 for rate-limited %s requests", async (_name, run) => {
    vi.mocked(rateLimit).mockResolvedValueOnce({ ok: false, remaining: 0 } as never);
    const response = await run();
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "TOO_MANY_REQUESTS" },
    });
  });

  it.each(guardedRoutes)("returns 404 for missing %s tournaments", async (_name, run) => {
    mocks.row = null;
    const response = await run();
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("rejects finalize without a wallet address", async () => {
    const response = await finalize(
      request(`/${tournamentId}/finalize`, { winners: [players[0]] }),
      ctx,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });

  it.each([
    ["submit", deployOrSubmit],
    ["join", join],
    ["finalize", finalize],
  ] as const)("rejects malformed JSON for %s", async (name, route) => {
    const response = await route(
      new Request(`http://localhost:3000/api/tournaments/${tournamentId}/${name}`, {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "idempotency-key": "key",
          "x-wallet-address": referee,
        },
        body: "{",
      }) as never,
      ctx,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });
});
