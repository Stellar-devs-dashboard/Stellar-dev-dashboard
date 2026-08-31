# Fee-Bump and Sponsored-Transaction Composition Studio

## Overview
The **Fee-Bump & Sponsored-Transaction Studio** provides a dedicated, production-grade visual composition and simulation environment for advanced Stellar transaction architectures.

---

## Core Capabilities

1. **Inner & Outer Envelope Modeling**:
   - Manages inner transaction source accounts, sequence numbers, base fees, and memo payloads.
   - Wraps inner transactions with outer `FeeBumpTransaction` envelopes where a third-party fee sponsor/relayer pays the fees.
   - Calculates minimum valid maxFee constraints (`maxFee >= baseFee * (ops + 1)`).
   - Validates XDR round-trip encoding and integrity.

2. **Sponsorship Boundaries & Invariant Analysis**:
   - Pairs `beginSponsoringFutureReserves` with `endSponsoringFutureReserves` visually and programmatically.
   - Detects unbalanced, unterminated, or mismatched sponsorship boundaries.
   - Provides operation builders for revoking sponsorships across all supported ledger entries:
     - Account reserves
     - Trustline reserves
     - DEX offer reserves
     - Data entry reserves
     - Claimable balance reserves
     - Signer reserves

3. **Reserve & Liability Estimator**:
   - Calculates exact base reserve liabilities per operation (Account: 1.0 XLM, Trustlines/Offers/Data/Signers: 0.5 XLM, Claimable Balances: 0.5 XLM * (1 + N)).
   - Aggregates liabilities per sponsor account and evaluates available reserve balances.

4. **Multi-Party Signer Routing**:
   - Maps required signing accounts (inner source, operation sources, outer fee source, sponsor).
   - Checks threshold satisfaction and alerts for missing required signatures.

5. **Simulation & Post-Ledger Verification**:
   - Simulates fees, CPU instructions, and memory consumption.
   - Allows post-ledger verification lookup by transaction hash to verify fee deductions and reserve allocations on-chain.

6. **Versioned Template Vault**:
   - Preloaded with common recipes: "Sponsored Account Onboarding", "Sponsored Asset Trustline Setup", "Third-Party Fee Delegation Wrapper".
   - Exports and imports versioned JSON templates with automated sensitive key/signature redaction.
