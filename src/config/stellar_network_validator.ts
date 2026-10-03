// Configuration validator for STELLAR_NETWORK
export enum StellarNetwork {
  TESTNET = 'TESTNET',
  PUBLIC = 'PUBLIC',
  FUTURENET = 'FUTURENET',
  STANDALONE = 'STANDALONE'
}

export interface NetworkConfig {
  network: StellarNetwork;
  horizonUrl?: string;
  rpcUrl?: string;
}

export function validateStellarNetwork(rawNetwork: string | undefined): StellarNetwork {
  if (!rawNetwork) {
    throw new Error("STELLAR_NETWORK configuration is missing. Must be one of: TESTNET, PUBLIC, FUTURENET, STANDALONE");
  }
  const normalized = rawNetwork.trim().toUpperCase();
  if (!(normalized in StellarNetwork)) {
    throw new Error(`Invalid STELLAR_NETWORK '${rawNetwork}'. Supported values: ${Object.keys(StellarNetwork).join(', ')}`);
  }
  return StellarNetwork[normalized as keyof typeof StellarNetwork];
}
