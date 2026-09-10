export type StellarErrorCode =
  | "INVALID_INPUT"
  | "SIMULATION_FAILED"
  | "SUBMIT_FAILED"
  | "TX_TIMEOUT"
  | "TX_FAILED"
  | "TX_MALFORMED"
  | "TX_BAD_AUTH"
  | "NETWORK_MISMATCH"
  | "UNKNOWN_ASSET";

export class StellarError extends Error {
  readonly code: StellarErrorCode;
  readonly txHash?: string;
  readonly retryable?: boolean;
  constructor(
    code: StellarErrorCode,
    message: string,
    options?: { cause?: unknown; txHash?: string; retryable?: boolean },
  ) {
    super(message, options);
    this.name = "StellarError";
    this.code = code;
    if (options?.txHash) this.txHash = options.txHash;
    if (options?.retryable !== undefined) this.retryable = options.retryable;
  }
}
