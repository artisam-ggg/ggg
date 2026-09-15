import {
  AssembledTransaction,
  Client,
  type ClientOptions,
  Spec,
} from "@stellar/stellar-sdk/contract";

const LEGACY_FINALIZE_SPEC =
  "AAAAAAAAAAAAAAAQZmluYWxpemVfcmVzdWx0cwAAAAMAAAAAAAAABWZpcnN0AAAAAAAAEwAAAAAAAAAGc2Vjb25kAAAAAAATAAAAAAAAAAV0aGlyZAAAAAAAABMAAAAA";

type LegacyFinalizeClient = Client & {
  finalize_results(
    args: {
      first: string;
      second: string;
      third: string;
    },
    options?: { simulate?: boolean },
  ): Promise<AssembledTransaction<null>>;
};

/** Create a client that encodes the pre-#219 three-address finalization ABI. */
export function legacyEscrowClient(options: ClientOptions): LegacyFinalizeClient {
  return new Client(new Spec([LEGACY_FINALIZE_SPEC]), options) as LegacyFinalizeClient;
}
