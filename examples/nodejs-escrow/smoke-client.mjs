import assert from "node:assert/strict";
import {
  EscrowClient,
  EscrowSdk,
  EscrowSdkError,
  resolveSacAddress,
} from "@goodgameguild/escrow-sdk";
// This direct dependency is used only to make local RPC fixtures and unsigned XDR.
import {
  Account,
  Keypair,
  SorobanDataBuilder,
  TransactionBuilder,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";

const networkPassphrase = "Test SDF Network ; September 2015";
const source = Keypair.random(); // ephemeral, unfunded, never printed or stored
const contractId = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5";
const config = { rpcUrl: "https://rpc.invalid", networkPassphrase, contractId };
assert.throws(
  () => new EscrowSdk({ ...config, contractId: "bad" }),
  (error) => error instanceof EscrowSdkError && error.code === "INVALID_INPUT",
);
assert.equal(
  resolveSacAddress("XLM", networkPassphrase, { nativeSacAddress: contractId }),
  contractId,
);

const calls = { account: 0, simulation: 0 };
rpc.Server.prototype.getAccount = async (address) => {
  calls.account++;
  assert.equal(address, source.publicKey());
  return new Account(address, "1");
};
rpc.Server.prototype.simulateTransaction = async () => {
  calls.simulation++;
  return {
    _parsed: true,
    result: { retval: xdr.ScVal.scvVoid(), auth: [] },
    transactionData: new SorobanDataBuilder(),
    minResourceFee: "100",
  };
};

const sdk = new EscrowSdk(config);
await new EscrowClient({ ...config, publicKey: source.publicKey() }).join_tournament({
  player: source.publicKey(),
});
const built = await sdk.buildJoin(source.publicKey());
assert.equal(built.intent, "join");
assert.equal(built.contractId, contractId);
assert.equal(built.source, source.publicKey());
assert.match(built.hash, /^[a-f0-9]{64}$/);
assert.ok(built.xdr.length > 100);
assert.ok(calls.account > 0 && calls.simulation >= 2);
const transaction = TransactionBuilder.fromXDR(built.xdr, networkPassphrase);
assert.equal(transaction.operations.length, 1);
assert.equal(transaction.operations[0].type, "invokeHostFunction");
transaction.sign(source);
assert.equal(
  sdk.validateSignedXdr(transaction.toXDR(), built, networkPassphrase).hash().toString("hex"),
  built.hash,
);
assert.throws(
  () => sdk.validateSignedXdr(transaction.toXDR(), built, "wrong network"),
  (error) => error instanceof EscrowSdkError && error.code === "NETWORK_MISMATCH",
);
console.log(
  "PASS: packed public API, configuration, simulated join construction, signed-XDR validation",
);
