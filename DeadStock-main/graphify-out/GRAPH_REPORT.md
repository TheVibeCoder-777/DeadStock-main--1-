# Graph Report - DeadStock-main  (2026-07-09)

## Corpus Check
- 28 files · ~86,428 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 117 nodes · 221 edges · 15 communities (8 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b55b5ea6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]

## God Nodes (most connected - your core abstractions)
1. `getJson()` - 17 edges
2. `postJson()` - 15 edges
3. `apiFetch()` - 12 edges
4. `formatDate()` - 12 edges
5. `putJson()` - 11 edges
6. `deleteJson()` - 11 edges
7. `downloadBlob()` - 10 edges
8. `DeadStock Inventory Management System` - 8 edges
9. `DeadStock - Detailed Project Analysis & Documentation` - 8 edges
10. `ErrorBoundary` - 6 edges

## Surprising Connections (you probably didn't know these)
- `updateDatabase()` --calls--> `initDatabase()`  [INFERRED]
  server/server.js → server/db.js

## Communities (15 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.15
Nodes (9): getDatabase(), getDatabaseFilePath(), getDatabasePath(), getUploadsPath(), initDatabase(), ensureUploadsDir(), formatDate(), parseDate() (+1 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (17): 1. Project Overview, 2. Technology Stack & Languages, 3. Database Schema & Architecture, 4. Application Pages & Routing (`src/App.jsx`), 5. API Endpoints, 6. Frontend UI/UX, Colors, and Schemas, 7. Interconnectivity & Data Flow, Color Palette: (+9 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (14): 🏗️ Architecture, Building for Production, code:bash (npm install), code:bash (npm run electron:dev), code:bash (# Build React frontend), DeadStock Inventory Management System, 💻 Developer Setup, 📦 How to Use (For End Users) (+6 more)

## Knowledge Gaps
- **21 isolated node(s):** `🚀 Key Features`, `🛠️ Technology Stack`, `📦 How to Use (For End Users)`, `Prerequisites`, `code:bash (npm install)` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `🚀 Key Features`, `🛠️ Technology Stack`, `📦 How to Use (For End Users)` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._