/* Authorized Protocol Quality Assurance & Formal Verification Test Suite */
import { validateStellarNetwork, StellarNetwork } from './stellar_network_validator';

describe('STELLAR_NETWORK validation', () => {
  it('accepts valid network identifiers', () => {
    expect(validateStellarNetwork('TESTNET')).toBe(StellarNetwork.TESTNET);
    expect(validateStellarNetwork('PUBLIC')).toBe(StellarNetwork.PUBLIC);
    expect(validateStellarNetwork('FUTURENET')).toBe(StellarNetwork.FUTURENET);
  });

  it('rejects unknown network configurations with clear error', () => {
    expect(() => validateStellarNetwork('UNKNOWN_NET')).toThrow(/Invalid STELLAR_NETWORK/);
    expect(() => validateStellarNetwork('')).toThrow(/STELLAR_NETWORK configuration is missing/);
    expect(() => validateStellarNetwork(undefined)).toThrow(/STELLAR_NETWORK configuration is missing/);
  });
});
