const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const PUBLIC_PASSPHRASE = "Public Global Stellar Network ; September 2015";

export function stellarNetworkLabel(passphrase: string) {
  if (passphrase === TESTNET_PASSPHRASE) return "Stellar Testnet";
  if (passphrase === PUBLIC_PASSPHRASE) return "Stellar Public Network";
  return "the configured Stellar network";
}
