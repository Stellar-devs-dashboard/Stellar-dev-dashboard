# Claimable Balance Composer and Lifecycle Explorer

## Overview
The **Claimable Balance Composer & Lifecycle Explorer** provides an end-to-end studio for constructing, evaluating, simulating, creating, and claiming conditional payments on the Stellar network.

---

## Key Capabilities

1. **Typed Predicate AST Engine**:
   - Supports `Unconditional`, `AbsBefore` (absolute UNIX timestamp), `RelBefore` (relative duration from creation), and boolean operators (`AND`, `OR`, `NOT`).
   - Validates depth limits (max protocol depth: 6), detects circular structures, negative durations, and tautologies.
   - Generates human-readable English explanations with timezone conversion (UTC / Local).

2. **Multi-Claimant Composer**:
   - Allows up to 10 distinct claimant destinations per balance.
   - Provides granular predicate tree assignment per claimant.
   - Computes base reserve and claimant reserve liabilities with optional sponsorship wrappers.

3. **Lifecycle & Countdown Engine**:
   - Tracks active claimable balances across accounts and sponsors.
   - Computes real-time countdowns to eligibility and lock release windows.
   - Supports 1-click Claim and Clawback transactions.

4. **Predicate Template Vault**:
   - Pre-packaged templates: 30-Day Cliff Vesting, Escrow with Sender Reclaim Window, Windowed Release, Immediate Unrestricted Claim.
   - Import/Export versioned JSON packages (`1.0.0`) with schema validation.

---

## Security & Reliability Considerations

- **Authorization**: Ensures proper signer verification before invoking claim or clawback operations.
- **Reserve Requirements**: Prevents account underfunding by calculating base reserves (0.5 XLM entry + 0.5 XLM per claimant).
- **Timezone Safety**: Timestamps are parsed in absolute epoch seconds with local timezone previews to prevent accidental premature unlocks or expirations.
- **Sensitive Data Handling**: Secret keys and sensitive credentials are never stored or exported in template JSON payloads.
