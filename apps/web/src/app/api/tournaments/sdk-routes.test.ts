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
  participantUpsert: vi.fn(),
  requireCurrent: vi.fn(),
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
            participants: players.map((playerAddr) => ({ playerAddr })),
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
import { POST as deployOrSubmit } from "./[id]/submit/route";
import { POST as join } from "./[id]/join/route";
import { POST as finalize } from "./[id]/finalize/route";
import { POST as cancel } from "./[id]/cancel/route";
import { POST as refund } from "./[id]/refund/route";
import { requireUser, AuthError } from "@/lib/auth-guards";
import { rateLimit } from "@/lib/rate-limit";
import { EscrowSdkError } from "@ggg/escrow-sdk";
import { withIdempotency } from "@/server/services/idempotency";

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
  };
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

  it("submits a wallet-signed join without an app session, but still requires one for deploy", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new AuthError("Authentication required", 401));
    const joined = await deployOrSubmit(
      request(`/${tournamentId}/submit`, { ...signed, intent: "join" }, {
        "x-forwarded-for": "203.0.113.10",
      }),
      ctx,
    );
    expect(joined.status).toBe(200);
    expect(requireUser).not.toHaveBeenCalled();
    expect(rateLimit).toHaveBeenCalledWith(`submit:join:${tournamentId}:203.0.113.10`, {
      limit: 20,
      windowSec: 60,
    });
    expect(mocks.validate).toHaveBeenCalledOnce();
    expect(mocks.participantUpsert).toHaveBeenCalledOnce();

    const deployed = await deployOrSubmit(request(`/${tournamentId}/submit`, signed), ctx);
    expect(deployed.status).toBe(401);
    expect(mocks.submit).toHaveBeenCalledOnce();
  });

  it("scopes public join idempotency to the signed transaction", async () => {
    await deployOrSubmit(request(`/${tournamentId}/submit`, { ...signed, intent: "join" }), ctx);
    await deployOrSubmit(request(`/${tournamentId}/submit`, { ...signed, intent: "join" }), ctx);
    await deployOrSubmit(
      request(`/${tournamentId}/submit`, { signedXdr: "AAAAAgAAAAB=", intent: "join" }),
      ctx,
    );
    const keys = vi.mocked(withIdempotency).mock.calls.map(([key]) => key);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("scopes non-deployment idempotency results to the user and intent", async () => {
    const body = { ...signed, intent: "claim_refund" };
    await deployOrSubmit(request(`/${tournamentId}/submit`, body), ctx);
    mocks.userId = "other";
    await deployOrSubmit(request(`/${tournamentId}/submit`, body), ctx);
    expect(vi.mocked(withIdempotency).mock.calls.map(([key]) => key)).toEqual([
      `${tournamentId}:owner:claim_refund:key`,
      `${tournamentId}:other:claim_refund:key`,
    ]);
  });
});
