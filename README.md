# Stellar Dev Dashboard

Privacy-preserving usage insights and on-device personalization are documented in [docs/behavior-analytics.md](docs/behavior-analytics.md).

Explainable hybrid ecosystem recommendations, privacy controls, and the optional ranking API are documented in [docs/recommendations.md](docs/recommendations.md).

A real-time, open-source developer dashboard for the Stellar network — built with Vite and React.

![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)
![Network: Stellar](https://img.shields.io/badge/Network-Stellar-blue.svg)
![Stack: Vite + React](https://img.shields.io/badge/Stack-Vite%20%2B%20React-yellow.svg)

Connect a Stellar public key or wallet and explore accounts, transactions, Soroban contracts, network stats, and transaction tooling — all in the browser. No backend required; data comes from public Horizon and Soroban RPC endpoints.

**Live demo:** [stellar-dev-dashboard.netlify.app](https://stellar-dev-dashboard.netlify.app)

---

## Architecture

```mermaid
flowchart LR
  subgraph Browser["Browser (SPA)"]
    UI["React UI\n30+ lazy-loaded tabs"]
    Store["Zustand store"]
    Lib["src/lib\nstellar · builder · wallet"]
    UI --> Store --> Lib
  end

  subgraph Persist["Local"]
    IDB["IndexedDB\ncache · alerts · prefs"]
  end

  subgraph Stellar["Stellar Network"]
    H["Horizon REST"]
    S["Soroban RPC"]
    F["Friendbot\n(testnet)"]
  end

  Lib --> H
  Lib --> S
  Lib --> F
  Store --> IDB
```

**Request flow:** `ConnectPanel` validates a key or wallet → `stellar.ts` fetches account data from Horizon → dashboard tabs read/write via Zustand → Soroban ops simulate/submit through RPC.

---

## Quick Start

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build → dist/
npm run preview   # preview production build
```

Node 20+ (jsdom 29's dependencies no longer support Node 18). No environment variables needed for default networks.

---

## Features

| Area | What you get |
| --- | --- |
| **Account** | Balances, signers, flags, offers, claimable balances, USD estimates |
| **History** | Paginated transactions and operations with search and filters |
| **Soroban** | Contract inspect, simulate, invoke, ABI viewer |
| **Network** | Live ledger stats, SSE streams, fee analytics |
| **Network Intelligence** | Health scoring, anomaly detection, congestion forecasts, incidents, capacity planning |
| **Build** | Transaction builder, simulator, Freighter/Ledger signing |
| **Explore** | SDEX order books, path payments, external explorer links |
| **Tools** | Multisig, alert rules, portfolio analytics, data export, audit log, cross-chain bridge monitor |

Supports **Mainnet**, **Testnet**, **Futurenet**, **Local**, and **Custom** network profiles.

---

## Tech Stack

| Package | Role |
| --- | --- |
| Vite 5 + React 18 | Build tool and UI |
| `@stellar/stellar-sdk` | Horizon, Soroban RPC, XDR |
| Zustand | Global state |
| Recharts | Charts and metrics |
| i18next | Internationalization |
| Vitest + Playwright | Unit, integration, and E2E tests |

Core lib files (`stellar.ts`, `store.ts`) are TypeScript; components are a mix of `.jsx` and `.tsx` during migration.

See [Network Intelligence architecture and operations](docs/network-intelligence.md)
for monitoring methodology, REST API usage, deployment guidance, and model
validation practices.

---

## Project Layout

```
src/
├── App.tsx              # Routing, layout, lazy tab loading
├── main.jsx             # Entry point, service worker
├── components/
│   ├── dashboard/       # One component per feature tab
│   ├── layout/          # Sidebar, mobile nav, search
│   └── …                # charts, multisig, assets, notifications
├── lib/                 # Business logic (no React)
│   ├── stellar.ts       # All Stellar SDK integration
│   ├── store.ts         # Zustand global state
│   └── wallet/          # Freighter, Ledger connectors
├── hooks/               # React hooks
├── i18n/                # Translation files
└── styles/              # CSS tokens, themes, responsive rules
```

---

## Networks

| Network | Horizon | Soroban RPC |
| --- | --- | --- |
| Testnet | `horizon-testnet.stellar.org` | `soroban-testnet.stellar.org` |
| Mainnet | `horizon.stellar.org` | `soroban-rpc.stellar.org` |
| Futurenet | `horizon-futurenet.stellar.org` | `soroban-futurenet.stellar.org` |
| Local | `localhost:8000` | `localhost:8000/soroban/rpc` |
| Custom | User-defined | User-defined |

Switching networks in the sidebar resets account-specific state.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run build:pages` | Production build for GitHub Pages (subpath + SPA fallback) |
| `npm run build:analyze` | Build + bundle treemap (`dist/stats.html`) |
| `npm test` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript check |

CI enforces a **500 KB gzipped** bundle budget on the main entry chunk.

---

## Deployment

**Production:** [https://stellar-dev-dashboard.netlify.app](https://stellar-dev-dashboard.netlify.app) (Netlify)

```bash
npm run build
netlify deploy --prod --dir=dist
```

Netlify config lives in [`netlify.toml`](netlify.toml) (build command, publish dir, SPA redirects).

Alternative targets: [GitHub Pages](.github/workflows/pages.yml) (`npm run build:pages`) or [Vercel](.github/workflows/deploy.yml) (requires `VERCEL_*` secrets).

---

## Contributing

Pull requests are welcome. Check open issues to find something to work on.

---

## License

MIT
# Market Sentiment Intelligence

The dashboard includes a credibility-weighted Stellar sentiment workspace at `/marketSentiment`, with source/language/aspect breakdowns, trend and price correlation, viral signals, alerts, and an optional REST ingestion service. See [the methodology and deployment guide](docs/market-sentiment.md).

# Contract Testing & Verification

The dashboard includes a Soroban contract testing workspace at `/contractTesting`: paste or upload contract source and get a generated test suite (unit/property-based/fuzz/regression), heuristic static security findings, coverage and mutation-score estimates, a formal-verification report, and a downloadable CI/CD workflow — backed by a deterministic client-side engine plus an optional REST analysis service. This is pattern-based static analysis, not symbolic execution or a theorem prover; see [the methodology, limitations, and deployment guide](docs/contract-testing.md).

# Resource Profiling Lab

The dashboard includes a transaction and contract resource profiling workspace at `/resourceProfiling`: capture typed resource profiles (classic fees, Soroban instructions/memory/read-write bytes, footprint, events, transaction size) from real simulations through the same shared invocation API as the Transaction Simulator, save them as named baselines, compare candidates with deterministic absolute/percentage thresholds and regression classification, visualize resource breakdowns and metric timelines, enforce budgets, and export versioned, redaction-by-default JSON suitable for a CI gate. This is evidence-based profiling and regression detection against your own historical samples — it makes no AI-based fee predictions and does not duplicate the fee-optimization work in issue #36. See [the architecture, methodology, and privacy guide](docs/resource-profiling.md).

# Fraud Detection & Prevention

The dashboard includes a layered fraud workspace at `/fraudDetection`: explainable risk scores, threat-intelligence import, investigation queue, prevention workflows, user education, and an optional REST assessment service for wallet providers. See [the architecture and operations guide](docs/fraud-detection.md).

# Treasury Reconciliation & Accounting Exports

The dashboard includes a treasury reconciliation workspace at `/treasuryReconciliation`: deterministic period reconciliation of payments, path payments, trades, fees, claimable balances, sponsorship changes, Soroban token transfers, and account changes into traceable ledger postings, with configurable category rules, cost-basis inputs, discrepancy detection, immutable period snapshots, and versioned CSV/JSON accounting exports. These are operational records, not tax or accounting advice, and are independent of the AI portfolio optimizer. See [the architecture, data model, and export format guide](docs/treasury-reconciliation.md).

# Privacy-safe Diagnostics

The public `/diagnostics` workspace captures bounded redact-before-memory evidence, runs cancellable non-destructive endpoint/wallet/transaction/rendering/storage/service-worker checks, and builds field-selectable SHA-256 diagnostic bundles for local download and comparison. It has no telemetry or upload transport and falls back to bounded memory when browser storage is unavailable. See [the architecture, privacy model, bundle contract, recovery guide, and maintainer integration](docs/diagnostics.md).
