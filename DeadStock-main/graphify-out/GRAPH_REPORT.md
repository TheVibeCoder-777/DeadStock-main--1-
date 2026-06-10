# Graph Report - DeadStock-main  (2026-06-10)

## Corpus Check
- 29 files · ~1,462,357 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 84 nodes · 121 edges · 21 communities (19 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]

## God Nodes (most connected - your core abstractions)
1. `formatDate()` - 11 edges
2. `DeadStock Inventory Management System` - 7 edges
3. `initDatabase()` - 5 edges
4. `ErrorBoundary` - 5 edges
5. `💻 Developer Setup` - 5 edges
6. `getDatabaseFilePath()` - 4 edges
7. `getUploadsPath()` - 4 edges
8. `getDatabasePath()` - 3 edges
9. `ensureUploadsDir()` - 3 edges
10. `parseDate()` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (21 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.21
Nodes (17): getDatabase(), getDatabaseFilePath(), getDatabasePath(), getUploadsPath(), initDatabase(), ensureUploadsDir(), formatDate(), formatDateDDMMYYYY() (+9 more)

### Community 1 - "Community 1"
Cohesion: 0.13
Nodes (14): 🏗️ Architecture, Building for Production, code:bash (npm install), code:bash (npm run electron:dev), code:bash (# Build React frontend), DeadStock Inventory Management System, 💻 Developer Setup, 📦 How to Use (For End Users) (+6 more)

## Knowledge Gaps
- **9 isolated node(s):** `🚀 Key Features`, `🛠️ Technology Stack`, `📦 How to Use (For End Users)`, `Prerequisites`, `code:bash (npm install)` (+4 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `🚀 Key Features`, `🛠️ Technology Stack`, `📦 How to Use (For End Users)` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._