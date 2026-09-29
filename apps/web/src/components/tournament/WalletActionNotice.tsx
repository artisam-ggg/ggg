import type { ReactNode } from "react";
import { stellarNetworkLabel } from "@/lib/stellar-network";

export function WalletActionNotice({
  expectedPassphrase,
  children,
}: {
  expectedPassphrase: string;
  children: ReactNode;
}) {
  return (
    <p className="w-full text-sm text-on-surface-variant">
      {children} Approve this transaction in Freighter on {stellarNetworkLabel(expectedPassphrase)}.
      GGG cannot access your private key or sign for you.
    </p>
  );
}
