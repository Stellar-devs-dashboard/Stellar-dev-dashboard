# feat: migrate stellar.js and store.js to TypeScript

## Summary

Migrates the two core library files from plain JavaScript to TypeScript, adding full type annotations throughout. This improves IDE autocompletion, catches bugs at compile time, and makes the codebase easier for new contributors to extend.

## Changes

- `src/lib/stellar.js` → `src/lib/stellar.ts` — full type annotations on all exports
- `src/lib/store.js` → `src/lib/store.ts` — typed Zustand store with `StoreState` interface
- `tsconfig.json` — new, strict mode with bundler module resolution
- `vite.config.js` — `.ts` extensions prioritised in resolution order
- `package.json` — added `typescript` dev dependency

## Type highlights

### stellar.ts

| Export | Type |
|---|---|
| `NetworkName` | `'mainnet' \| 'testnet'` |
| `NetworkConfig` | interface with `horizonUrl`, `sorobanUrl`, `passphrase`, optional `faucetUrl` |
| `BuilderOperation` | discriminated union of `PaymentOperation \| CreateAccountOperation` |
| `PathAsset` | `{ type: 'native' \| 'credit', code, issuer? }` |
| `PaymentPathRecord` | typed Horizon path response including client-side `slippagePct` |
| `SimulateResult` | `{ fee, operationCount, success, errors, xdr? }` |
| All functions | explicit parameter and return types, no implicit `any` |

### store.ts

- `StoreState` interface covers all state fields and setters
- Account data typed as `Horizon.AccountResponse`
- Transactions/operations typed as `ServerApi.TransactionRecord[]` / `OperationRecord[]`
- Contract data typed as `SorobanRpc.Api.LedgerEntryResult`
- `faucetResult` typed as `unknown` — genuinely untyped external JSON response

## Notes

- Scope is strictly the two lib files — no `.jsx` components were touched
- `allowJs: true` / `checkJs: false` in tsconfig keeps existing JSX components working without requiring their migration
- `tsc --noEmit` passes with zero errors

## Testing

```bash
npx tsc --noEmit   # should exit 0 with no output
npm run build      # vite build should complete without errors
npm run dev        # app should behave identically to before
```

## Related

Closes #<!-- issue number -->
