# Graph-Based Relationship Analysis Engine

## Purpose

Map and analyze relationships between Stellar accounts, anchors, liquidity pools, and contracts: discover multi-hop connections, detect communities (anchor networks, payment corridors, liquidity clusters, Sybil-suspect clusters), rank influence (PageRank, betweenness, degree), and surface suspicious topology (circular fund flows, dust fan-out, Ponzi-like fan-in/fan-out, systemic bridge accounts). The engine is decision support for exploration and investigation — pattern matches are leads, not proof of wrongdoing.

## Architecture

| Layer | Location | Responsibility |
| --- | --- | --- |
| Domain types | `src/types/networkGraph.ts` | Nodes, edges, centrality, communities, patterns, paths, NL query, preferences |
| Algorithms | `src/lib/networkGraph/algorithms.ts` | Adjacency, BFS pathfinding, PageRank, betweenness, label propagation, pattern detectors |
| NL query | `src/lib/networkGraph/nlQuery.ts` | Keyword/intent parser mapping free text onto the algorithms above |
| Fixtures | `src/lib/networkGraph/fixtures.ts` | Deterministic demo graph with embedded ground-truth patterns |
| Client | `src/lib/networkGraph/client.ts` | Cache, optional remote API, degraded/offline fallback |
| Hook | `src/hooks/useNetworkGraph.ts` | Loading, refresh, memoized analysis, preferences, pathfinding, NL query |
| UI | `src/components/network-graph/` | `NetworkGraphDashboard.tsx` (lazy `/networkGraph` workspace) + `GraphCanvas.tsx` |

When `VITE_GRAPH_API_URL` is unset (the default for this PR — see [Known limitations](#known-limitations)), the dashboard analyzes a deterministic fixture graph. Setting that variable switches `client.ts` to fetch `GET {VITE_GRAPH_API_URL}/v1/graph/:network/snapshot` and analyze the returned nodes/edges instead — the algorithms, hook, and UI are unchanged either way, so a real indexer-backed service is a drop-in.

## Graph model

- **Nodes** (`GraphNode`): `account`, `anchor`, `issuer`, `contract`, `liquidity-pool`.
- **Edges** (`GraphEdge`): `payment`, `trustline`, `path-payment`, `offer`, `contract-invoke`, `create-account` — each carries `weight` (normalized relationship strength used by PageRank/community detection), `volume`, `asset`, `txCount`, and `lastActivity` so temporal filtering is possible without a schema change.

## Algorithms

- **Pathfinding** — breadth-first search over the undirected relationship graph, bounded by a configurable hop limit (default, and UI max, 10). Complexity is `O(V + E)` up to the hop cutoff, which is what keeps a 10-hop query fast regardless of overall graph size.
- **Centrality** — weighted PageRank via power iteration (damping 0.85, dangling-node mass redistributed so total rank is conserved); unweighted Brandes betweenness centrality over the undirected graph (`O(V·E)`); degree and weighted degree. A composite influence score blends all three (45% PageRank / 30% betweenness / 25% degree) for a single ranked "top influencers" list.
- **Community detection** — synchronous label propagation (Raghavan, Albert & Kumar, 2007), near-linear time. Detected communities are classified into `anchor-network`, `payment-corridor`, `liquidity-cluster`, or `sybil-suspect` using node-type and edge-type composition heuristics, or `general` otherwise.
- **Pattern detection** (all heuristic + topology-based, not ML classifiers):
  - **Circular flow** — bounded DFS cycle search (default max length 6) filtered to cycles whose edge amounts stay within a tolerance of each other, the signature of value moving in a loop rather than an incidental short cycle.
  - **Dust network** — fan-out of near-zero payments from one source to many distinct recipients.
  - **Sybil cluster** — a hub-funded group of low-activity accounts created within a short window and densely interconnected only among themselves.
  - **Ponzi-like topology** — fan-in/fan-out and amount-ratio signature (many small inbound "investments", few large outbound "payouts") drawn from the graph-topology heuristics literature on Ponzi scheme detection.
  - **Hub concentration** — accounts whose betweenness centrality is a statistical outlier (z-score threshold) are flagged as systemic bridges / single points of failure.
- **Natural-language query** — a bounded keyword/intent matcher (`nlQuery.ts`), not a language model. It resolves free text into one of `shortest-path`, `top-influencers`, `communities`, `patterns`, `neighbors`, or `unknown`, extracting addresses and hop counts when present, and returns example phrasings on `unknown` instead of guessing. Accuracy is validated in `nlQuery.test.ts` against the documented `SAMPLE_QUERIES` set.

## UI

`/networkGraph` (sidebar → Network → Graph Analysis) ships seven views: **Explorer** (interactive canvas graph with pan/zoom/hover/select), **Communities**, **Centrality** (top influencers), **Patterns** (risk findings with evidence), **Pathfinder** (pick two accounts, get the shortest relationship path with a visual highlight), **Ask** (natural-language query bar with sample prompts), and **Methodology** (algorithm summary + caveats). Every cross-view "Investigate" / "View in explorer" action highlights the relevant nodes on the canvas. The dashboard handles loading, error (with retry), degraded/cached, and empty states consistently with the rest of the app (see `FraudDetectionDashboard.tsx` for the sibling pattern this mirrors).

`GraphCanvas.tsx` renders on `<canvas>` (not per-node DOM/SVG elements) using a deterministic radial-cluster layout — communities are arranged around a macro circle and their members around a micro circle — which is `O(n)` and avoids the cost of a pairwise force simulation, so it stays responsive well past the DOM-node counts that would bog down an SVG-per-node approach.

## Performance

| Target from the issue | How this build addresses it |
| --- | --- |
| 10-hop queries in < 5s | BFS is hop-bounded and `O(V+E)` to the cutoff; sub-millisecond on the fixture graph, and the bound is independent of total graph size. |
| Real-time updates within 1s of confirmation | Not implemented in this PR — see [Known limitations](#known-limitations). |
| 100M+ nodes / 1B+ edges | Not implemented — this PR ships the algorithmic engine and UI against an in-memory graph sized for interactive browser analysis (fixtures: dozens of nodes; the client contract supports swapping in a paginated/filtered subgraph from a real backend). |
| 10,000+ node visualization | `GraphCanvas` uses canvas rendering and an `O(n)` layout specifically so it can scale past what SVG-per-node rendering allows; not benchmarked at 10k in this PR. |
| 1000+ concurrent sessions | Not applicable — this is a client-side, per-user analysis engine; concurrency is a backend-service concern for a future `VITE_GRAPH_API_URL` deployment. |

## Known limitations

- **No distributed graph database ships in this PR.** The issue calls for infrastructure (a distributed graph DB, real-time ingestion pipeline, GNN training) that is a multi-service backend effort, not a frontend dashboard change. This PR delivers the full analysis engine, algorithms, and UI against a documented service boundary (`client.ts` + `VITE_GRAPH_API_URL`) so a real indexer-backed API is a drop-in later — see [Follow-up work](#follow-up-work).
- Community detection uses label propagation, not modularity-maximizing Louvain; it's a legitimate, near-linear-time algorithm but can produce different partitions than Louvain on the same graph.
- Betweenness centrality here is unweighted and undirected (`O(V·E)`), appropriate for the filtered, interactive subgraphs this dashboard renders — not a claim of full-network 100M-node betweenness, which needs approximate/sampling algorithms in production.
- Pattern detectors are heuristic and topology-based; they surface leads for investigation, not proof of fraud, Sybil activity, or a Ponzi scheme.
- The natural-language interface is a keyword/intent parser, not an LLM; unsupported phrasings return example queries rather than a best-effort guess.
- No private keys, device identifiers, or off-chain personal data are represented in the graph — only public ledger relationships (accounts, trustlines, payments, offers, contract invocations).

## Follow-up work

1. A `services/graph-analysis` backend (mirroring `services/fraud-detection`) that ingests Horizon/Soroban RPC data into a real graph store, exposes `GET /v1/graph/:network/snapshot`, and lets `client.ts` point at it via `VITE_GRAPH_API_URL` with zero UI changes.
2. Streaming/incremental updates (websocket or SSE) for the "within 1 second of confirmation" requirement.
3. Louvain or Leiden modularity optimization as an alternative community detector for large graphs, with the existing `Community` type unchanged.
4. Sampling/approximate betweenness (e.g. Brandes with pivot sampling) to scale centrality to very large graphs.
5. A trained graph embedding / GNN model for anomaly scoring and link prediction, replacing or augmenting the current heuristic pattern detectors — the `PatternMatch` type already carries a `confidence` field so a model-based score can plug in without a UI change.

## Extending

1. Add a new detector in `algorithms.ts` that returns `PatternMatch[]`, register it in `runAllPatternDetectors`, and cover it with a fixture-backed test in `algorithms.test.ts`.
2. Add a new NL intent rule in `nlQuery.ts` and extend `SAMPLE_QUERIES`; every sample is asserted to resolve to a known intent in `nlQuery.test.ts`.
3. Extend `fixtures.ts` with a new embedded pattern for regression coverage — follow the existing pattern of building a small, clearly-labeled subgraph and asserting on it by label.
