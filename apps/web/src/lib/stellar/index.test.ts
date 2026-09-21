import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    STELLAR_NETWORK: "testnet",
    SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
    HORIZON_URL: "https://horizon-testnet.stellar.org",
    NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
    NATIVE_SAC_ADDRESS: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    ESCROW_WASM_HASH: "abc",
  },
}));
vi.mock("@ggg/escrow-sdk", () => ({ EscrowClient: vi.fn() }));

describe("public barrel", () => {
  it("exports the Phase-4 contract surface", async () => {
    const m = await import("./index");
    for (const name of [
      "buildDeployInitializeTx",
      "buildJoinTx",
      "buildFinalizeTx",
      "buildCancelTx",
      "submitSignedXdr",
      "resolveSacAddress",
      "explorerTxUrl",
      "explorerContractUrl",
      "stellarPublicKey",
      "stellarContractId",
      "i128Amount",
      "signedXdr",
    ]) {
      expect(m[name as keyof typeof m], name).toBeDefined();
    }
    expect(typeof m.buildJoinTx).toBe("function");
    expect(typeof m.resolveSacAddress).toBe("function");
    expect(m.resolveSacAddress("XLM")).toBe(
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    );
  });
});
