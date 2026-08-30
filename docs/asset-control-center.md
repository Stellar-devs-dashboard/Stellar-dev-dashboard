# Asset Issuance & Trustline Administration Control Center

## Overview

The Asset Control Center provides a production-grade interface for managing Stellar asset issuance, trustline authorization, account flags, and clawback operations. It is designed for asset issuers and distributors who need guided, safe workflows for operations that can be irreversible.

## Architecture

```
src/
├── types/
│   ├── assetControl.ts       # Domain models (flags, trustlines, reserves, envelopes)
│   └── workflows.ts          # Multi-step workflow state machine types
├── lib/assetControl/
│   ├── accountStateService.ts # Readiness checks, flag extraction, reserves
│   ├── assetService.ts        # Transaction builders (issue, clawback, flags, trust)
│   ├── verificationService.ts # Dry-run summaries, offline envelopes, tx verification
│   └── index.ts               # Barrel export
├── hooks/
│   ├── useAccountReadiness.ts # TanStack Query hook for issuer readiness
│   ├── useAssetOperations.ts  # Mutation hooks for all asset operations
│   └── useAssetHolders.ts     # Infinite query hook for asset holder pagination
└── components/asset-control/
    ├── AssetControlCenter.tsx  # Main tabbed dashboard
    ├── AssetControlCenter.css  # Styling
    ├── IssuerConfig.tsx        # Flag management & readiness checks
    ├── TrustlineManager.tsx    # Holder table, batch auth, filters
    ├── IssuanceWorkflow.tsx    # Multi-step issue supply workflow
    ├── ClawbackWorkflow.tsx    # Multi-step clawback workflow
    └── index.ts                # Barrel export
```

### Design Principles

1. **Separation of concerns**: Domain logic (services), state management (hooks), and presentation (components) are strictly separated by typed interfaces.
2. **Transaction construction only**: Services build unsigned XDR. They never sign or submit autonomously — the user always controls the signing step.
3. **Typed domain models**: All data flowing through the system is typed via `src/types/assetControl.ts`.
4. **Schema versioning**: All persistent/exported formats include a `schemaVersion` field for forward compatibility.

## Security Considerations

### Sensitive Value Handling

- **Secret keys** are never stored, logged, or persisted by any service. The `signTransactionXdr` function processes keys in memory only.
- **Address redaction**: All addresses displayed in dry-run summaries and envelopes are redacted to `G123…ABCD` format.
- **No live network defaults**: The system does not automatically submit transactions. Users must explicitly sign and submit.

### Irreversible Operation Safeguards

- Setting `auth_immutable` displays a critical confirmation dialog with explicit warnings about permanence.
- The `lockIssuer` workflow (master weight → 0) includes prominent "IRREVERSIBLE" banners.
- Clawback operations require a two-step confirmation before transaction construction.
- Flag changes that affect existing trustlines show risk assessments.

### Privacy

- Exported audit JSON includes only transaction hashes and public addresses — no secret keys or sensitive metadata.
- Error messages surfaced to the UI are sanitized; raw Horizon errors are not exposed directly.

## Workflows

### Issuer Configuration

1. Enter the issuer account address
2. View current flags (auth_required, auth_revocable, auth_immutable, auth_clawback_enabled)
3. Toggle flags with confirmation for dangerous operations
4. Review readiness checks (separation, domain, thresholds, reserves, immutability)
5. Review risks and reserve state

### Asset Issuance

1. **Configure**: Enter asset code, destination (distributor), amount, and optional memo
2. **Readiness Check**: Automated validation of issuer state
3. **Review**: Dry-run summary with fee, time bounds, and operation details
4. **Complete**: Unsigned XDR ready for offline or wallet signing

### Trustline Management

1. Enter asset code to view all holders
2. Filter by authorization state, minimum balance, or address search
3. Select individual or batch holders
4. Apply authorization changes (authorize, maintain liabilities, deauthorize)

### Clawback

1. **Configure**: Enter asset code, holder address, and amount
2. **Confirm**: Review irreversibility warning and target details
3. **Review**: Dry-run summary of the clawback transaction
4. **Complete**: Unsigned XDR ready for signing

## Testing

### Unit Tests

```bash
npm run test -- tests/unit/assetControl.test.ts
```

Covers:
- Flag extraction from Horizon responses
- Signer weight parsing
- Balance extraction (native + custom assets)
- Reserve calculations (including edge cases)
- Risk detection (immutable, clawback without revocable, open trustlines)
- Readiness checks (separation, domain, thresholds, reserves)
- Asset resolution (native XLM vs custom)

### E2E Tests

```bash
npx playwright test tests/e2e/asset-control.spec.ts
```

Covers:
- Component rendering and heading
- Empty state without issuer address
- Invalid address validation
- Tab rendering and keyboard navigation
- Form field presence and validation
- Label-input association (accessibility)

## Compatibility

- **React 18+**: Uses `useId`, `useReducer`, `useCallback`
- **Stellar SDK v12.3+**: Uses `Operation.setTrustLineFlags`, `Operation.clawback`
- **TanStack Query v5**: Uses `useInfiniteQuery` with `initialPageParam`
- **CSS**: Uses CSS custom properties from the existing design system

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Account not found" error | Account doesn't exist on the selected network | Switch to testnet or fund the account |
| Clawback tab shows "not enabled" | `auth_clawback_enabled` flag is not set | Enable it in the Issuer Config tab (also enable `auth_revocable`) |
| Readiness check fails on reserves | Account XLM balance is below minimum | Fund the account with more XLM |
| Tab keyboard navigation not working | Focus is not on a tab element | Click a tab first, then use arrow keys |

## Migration

When upgrading the schema version:
1. Increment `ASSET_CONTROL_SCHEMA_VERSION` in `src/types/assetControl.ts`
2. Add migration logic in any service that reads persisted data
3. Ensure exported JSON includes the new version number
