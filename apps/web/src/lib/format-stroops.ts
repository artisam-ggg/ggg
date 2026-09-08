export function formatStroops(stroops: string): string {
  const amount = BigInt(stroops);
  return `${amount / 10_000_000n}.${(amount % 10_000_000n).toString().padStart(7, "0")}`;
}
