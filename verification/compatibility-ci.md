# Compatibility feature verification

Final local verification was run on 2026-08-28 with Node `v20.20.2` and npm `10.8.2`, on branch `feat/stellar-soroban-compatibility-matrix` based on `origin/master` commit `e4728a0`.

Complete command output is retained in the delivery artifact under `logs/<gate>.log`; the literal terminal conclusions below are copied from those logs. Every listed command exited with status `0`.

| Gate                      | Exact command                  | Literal result                                                                   |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| Install                   | `npm ci`                       | `added 811 packages, and audited 812 packages in 8s` / `found 0 vulnerabilities` |
| Lint                      | `npm run lint`                 | `✖ 674 problems (0 errors, 674 warnings)`                                        |
| Format                    | `npm run format:check`         | `All matched files use Prettier code style!`                                     |
| Types                     | `npm run type-check`           | `> tsc --noEmit`                                                                 |
| Unit/integration coverage | `npm run test:coverage`        | `Test Files 112 passed (112)` / `Tests 1025 passed (1025)`                       |
| Coverage summary          | `npm run test:coverage`        | `Statements : 31.42% ( 7812/24861 )` / `Lines : 31.95% ( 7061/22099 )`           |
| Production build          | `npm run build`                | `✓ built in 11.60s`                                                              |
| Critical browser E2E      | `npm run test:e2e:critical`    | `21 passed (30.1s)`                                                              |
| Visual regression         | `npm run test:visual`          | `17 passed (14.6s)`                                                              |
| Dependency audit          | `npm audit --audit-level=high` | `found 0 vulnerabilities`                                                        |
| Bundle budget             | Exact CI measurement logic     | `main_chunk=dist/assets/index-BmhB9qCS.js` / `gzip_kb=7` / `budget_kb=500`       |

## Service tests

These are the exact service commands in `.github/workflows/ci.yml`.

| Exact command                                 | Literal result                                     | Exit |
| --------------------------------------------- | -------------------------------------------------- | ---- |
| `npm ci --prefix services/behavior-analytics` | `added 70 packages, and audited 71 packages in 1s` | `0`  |
| `npm run test:analytics-service`              | `# pass 18` / `# fail 0`                           | `0`  |
| `npm run test:network-monitor`                | `# pass 3` / `# fail 0`                            | `0`  |
| `npm run test:sentiment-service`              | `# pass 4` / `# fail 0`                            | `0`  |
| `npm run test:contract-testing-service`       | `# pass 10` / `# fail 0`                           | `0`  |
| `npm run test:recommendation-service`         | `# pass 4` / `# fail 0`                            | `0`  |
| `npm run test:fraud-service`                  | `# pass 6` / `# fail 0`                            | `0`  |

## Targeted compatibility evidence

- The critical browser run includes seven deterministic compatibility workflows: compatible, optional degraded, endpoint comparison, empty upgrade audit, versioned/redacted export, cached offline recovery, and axe WCAG checks.
- The visual project includes the compatibility status view. Baselines were generated and the full 17-test visual suite then passed twice consecutively after removing a delayed-tour race from the existing connected-account fixture.
- Compatibility unit coverage includes protocol 20–27 validation, unknown future protocol behavior, old SDK/XDR boundaries, missing and malformed method responses, contradictory endpoints, stale cache records, overrides, offline mode, abort/timeout behavior, redaction, and all six artifact-audit categories.
- The compatibility route is lazy-loaded. The real HTML entry (`index-Cs090IM7.js`) is 68,269 bytes (66 KiB) gzipped; compatibility is emitted as an independent route chunk. The repository CI's lexicographic `index-*` selector measured a smaller 7 KiB index-named chunk, and both figures are below the 500 KiB budget.

## Delivery size and target synchronization

- Production implementation: 4,478+ non-test TypeScript/React lines, excluding CSS, tests, fixtures, documentation, snapshots, and generated output.
- `git fetch origin master` confirmed `origin/master=e4728a0`; it is an ancestor of the feature branch and the update introduced no conflicts.
