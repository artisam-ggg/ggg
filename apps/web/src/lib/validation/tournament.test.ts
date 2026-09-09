import { describe, it, expect } from "vitest";
import {
  createTournamentSchema,
  submitSchema,
  joinSchema,
  finalizeSchema,
  listQuerySchema,
  uploadSchema,
  assetSchema,
  statusSchema,
  stellarPublicKey,
  stellarContractId,
  i128Amount,
  signedXdr,
} from "./tournament";

// Valid Stellar addresses for testing
const G = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";
const G2 = "GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5JT3YZXCYPAFBJZB";
const G3 = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const validCreate = {
  name: "Cup",
  gameTitle: "SF6",
  entryFee: "1000",
  asset: "XLM" as const,
  refereeAddress: G,
  organizerAddress: G2,
  settlementDeadline: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  distributionBps: [6000, 3000, 1000] as [number, number, number],
};

// --- Re-exported Stellar validators ---

describe("re-exported stellar validators", () => {
  it("stellarPublicKey is re-exported and works", () => {
    expect(stellarPublicKey.parse(G)).toBe(G);
    expect(stellarPublicKey.safeParse("bad").success).toBe(false);
  });

  it("stellarContractId is re-exported and works", () => {
    const C = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5";
    expect(stellarContractId.parse(C)).toBe(C);
    expect(stellarContractId.safeParse(G).success).toBe(false);
  });

  it("i128Amount is re-exported and works", () => {
    expect(i128Amount.parse(1000n)).toBe(1000n);
    expect(i128Amount.safeParse(0n).success).toBe(false);
    expect(i128Amount.safeParse(-1n).success).toBe(false);
  });

  it("signedXdr is re-exported and works", () => {
    expect(signedXdr.parse("AAAAAgAAAAA=")).toBe("AAAAAgAAAAA=");
    expect(signedXdr.safeParse("").success).toBe(false);
  });
});

// --- assetSchema ---

describe("assetSchema", () => {
  it("accepts XLM and USDC", () => {
    expect(assetSchema.parse("XLM")).toBe("XLM");
    expect(assetSchema.parse("USDC")).toBe("USDC");
  });

  it("rejects unknown assets", () => {
    expect(assetSchema.safeParse("BTC").success).toBe(false);
    expect(assetSchema.safeParse("").success).toBe(false);
  });
});

// --- statusSchema ---

describe("statusSchema", () => {
  it("accepts valid statuses", () => {
    for (const s of ["DRAFT", "ACTIVE", "FINISHED", "CANCELLED"] as const) {
      expect(statusSchema.parse(s)).toBe(s);
    }
  });

  it("rejects invalid status", () => {
    expect(statusSchema.safeParse("PENDING").success).toBe(false);
  });
});

// --- createTournamentSchema ---

describe("createTournamentSchema", () => {
  it("accepts a valid payload", () => {
    const r = createTournamentSchema.safeParse(validCreate);
    expect(r.success).toBe(true);
    if (r.success) {
      // entryFee coerced to bigint
      expect(r.data.entryFee).toBe(1000n);
      expect(r.data.settlementDeadline).toBe(validCreate.settlementDeadline);
    }
  });

  it("rejects bps that do not sum to 10000", () => {
    const r = createTournamentSchema.safeParse({
      ...validCreate,
      distributionBps: [6000, 3000, 500],
    });
    expect(r.success).toBe(false);
  });

  it("rejects organizer == referee", () => {
    const r = createTournamentSchema.safeParse({
      ...validCreate,
      refereeAddress: G,
      organizerAddress: G,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a past settlement deadline", () => {
    const r = createTournamentSchema.safeParse({
      ...validCreate,
      settlementDeadline: Math.floor(Date.now() / 1000) - 1,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a settlement deadline beyond the 90-day horizon", () => {
    const r = createTournamentSchema.safeParse({
      ...validCreate,
      settlementDeadline: Math.floor(Date.now() / 1000) + 91 * 24 * 60 * 60,
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed, fractional, and under-one-hour Unix deadlines", () => {
    const now = Math.floor(Date.now() / 1000);
    for (const settlementDeadline of ["tomorrow", now + 1.5, now + 59 * 60]) {
      expect(createTournamentSchema.safeParse({ ...validCreate, settlementDeadline }).success).toBe(
        false,
      );
    }
  });

  it("rejects missing name", () => {
    const r = createTournamentSchema.safeParse({ ...validCreate, name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects name exceeding 120 chars", () => {
    const r = createTournamentSchema.safeParse({ ...validCreate, name: "a".repeat(121) });
    expect(r.success).toBe(false);
  });

  it("rejects entryFee of zero (string)", () => {
    const r = createTournamentSchema.safeParse({ ...validCreate, entryFee: "0" });
    expect(r.success).toBe(false);
  });

  it("rejects negative entryFee", () => {
    const r = createTournamentSchema.safeParse({ ...validCreate, entryFee: "-1" });
    expect(r.success).toBe(false);
  });

  it("rejects non-numeric entryFee string", () => {
    const r = createTournamentSchema.safeParse({ ...validCreate, entryFee: "abc" });
    expect(r.success).toBe(false);
  });

  it("accepts optional coverImageKey", () => {
    const r = createTournamentSchema.safeParse({
      ...validCreate,
      coverImageKey: "uploads/abc.png",
    });
    expect(r.success).toBe(true);
  });

  it("rejects coverImageKey > 256 chars", () => {
    const r = createTournamentSchema.safeParse({
      ...validCreate,
      coverImageKey: "x".repeat(257),
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid refereeAddress", () => {
    const r = createTournamentSchema.safeParse({ ...validCreate, refereeAddress: "notakey" });
    expect(r.success).toBe(false);
  });

  it("rejects bps with wrong tuple length (2 elements)", () => {
    const r = createTournamentSchema.safeParse({
      ...validCreate,
      distributionBps: [5000, 5000],
    });
    expect(r.success).toBe(false);
  });

  it("distributionBps summing exactly to 10000 passes", () => {
    const cases: [number, number, number][] = [
      [10000, 0, 0],
      [5000, 3000, 2000],
      [3334, 3333, 3333],
    ];
    for (const bps of cases) {
      const r = createTournamentSchema.safeParse({ ...validCreate, distributionBps: bps });
      expect(r.success).toBe(true);
    }
  });
});

// --- submitSchema ---

describe("submitSchema", () => {
  it("accepts valid intents", () => {
    for (const intent of ["deploy", "join", "finalize", "cancel"] as const) {
      const r = submitSchema.safeParse({ signedXdr: "AAAAAgAAAAA=", intent });
      expect(r.success).toBe(true);
    }
  });

  it("rejects empty signedXdr", () => {
    expect(submitSchema.safeParse({ signedXdr: "", intent: "join" }).success).toBe(false);
  });

  it("rejects unknown intent", () => {
    expect(submitSchema.safeParse({ signedXdr: "AAAAAgAAAAA=", intent: "unknown" }).success).toBe(
      false,
    );
  });

  it("rejects malformed (non-base64) XDR", () => {
    expect(submitSchema.safeParse({ signedXdr: "!!!", intent: "join" }).success).toBe(false);
  });

  it("accepts a valid base64 XDR string", () => {
    expect(submitSchema.safeParse({ signedXdr: "AAAAAgAAAAA=", intent: "deploy" }).success).toBe(
      true,
    );
  });
});

// --- joinSchema ---

describe("joinSchema", () => {
  it("accepts a valid player address", () => {
    const r = joinSchema.safeParse({ playerAddress: G });
    expect(r.success).toBe(true);
  });

  it("rejects invalid player address", () => {
    expect(joinSchema.safeParse({ playerAddress: "bad" }).success).toBe(false);
  });
});

// --- finalizeSchema ---

describe("finalizeSchema", () => {
  it("accepts three distinct winners", () => {
    const r = finalizeSchema.safeParse({ first: G, second: G2, third: G3 });
    expect(r.success).toBe(true);
  });

  it("rejects non-distinct winners (first == second)", () => {
    expect(finalizeSchema.safeParse({ first: G, second: G, third: G2 }).success).toBe(false);
  });

  it("rejects non-distinct winners (all same)", () => {
    expect(finalizeSchema.safeParse({ first: G, second: G, third: G }).success).toBe(false);
  });

  it("rejects non-distinct winners (second == third)", () => {
    expect(finalizeSchema.safeParse({ first: G, second: G2, third: G2 }).success).toBe(false);
  });

  it("rejects invalid addresses", () => {
    expect(finalizeSchema.safeParse({ first: "bad", second: G2, third: G3 }).success).toBe(false);
  });
});

// --- listQuerySchema ---

describe("listQuerySchema", () => {
  it("defaults take to 20 and coerces", () => {
    const r = listQuerySchema.parse({});
    expect(r.take).toBe(20);
  });

  it("coerces take from string", () => {
    const r = listQuerySchema.parse({ take: "10" });
    expect(r.take).toBe(10);
  });

  it("rejects take > 50", () => {
    expect(listQuerySchema.safeParse({ take: 51 }).success).toBe(false);
  });

  it("rejects take < 1", () => {
    expect(listQuerySchema.safeParse({ take: 0 }).success).toBe(false);
  });

  it("accepts a valid status filter", () => {
    const r = listQuerySchema.parse({ status: "ACTIVE" });
    expect(r.status).toBe("ACTIVE");
  });

  it("rejects invalid status filter", () => {
    expect(listQuerySchema.safeParse({ status: "PENDING" }).success).toBe(false);
  });

  it("accepts cursor as string", () => {
    const r = listQuerySchema.parse({ cursor: "abc123" });
    expect(r.cursor).toBe("abc123");
  });
});

// --- uploadSchema ---

describe("uploadSchema", () => {
  it("accepts valid image content types", () => {
    for (const contentType of ["image/png", "image/jpeg", "image/webp"] as const) {
      const r = uploadSchema.safeParse({ contentType, contentLength: 1024 });
      expect(r.success).toBe(true);
    }
  });

  it("rejects unsupported content type", () => {
    expect(uploadSchema.safeParse({ contentType: "image/gif", contentLength: 1024 }).success).toBe(
      false,
    );
  });

  it("rejects contentLength of 0", () => {
    expect(uploadSchema.safeParse({ contentType: "image/png", contentLength: 0 }).success).toBe(
      false,
    );
  });

  it("rejects contentLength exceeding 5 MB", () => {
    expect(
      uploadSchema.safeParse({
        contentType: "image/png",
        contentLength: 5 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
  });

  it("accepts exactly 5 MB", () => {
    const r = uploadSchema.safeParse({ contentType: "image/png", contentLength: 5 * 1024 * 1024 });
    expect(r.success).toBe(true);
  });

  it("coerces contentLength from string", () => {
    const r = uploadSchema.parse({ contentType: "image/jpeg", contentLength: "2048" });
    expect(r.contentLength).toBe(2048);
  });
});
