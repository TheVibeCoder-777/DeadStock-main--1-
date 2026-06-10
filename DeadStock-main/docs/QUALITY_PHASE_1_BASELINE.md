# DeadStock Quality Phase 1 Baseline

Date: 2026-06-10

## Scope

Phase 1 covered lint configuration, no-risk unused-code cleanup, build validation, and baseline recording. No business logic, API contracts, database schema, dependencies, server port, allocation rules, report generation rules, or file formats were intentionally changed.

## Rollback Checkpoint

Status: blocked in this workspace.

Reason: `DeadStock-main` and its parent folder are not Git repositories, so `git tag` cannot create `pre-quality-standardization` or phase checkpoint tags here.

Required before later production work: initialize or restore the Git repository, then create the planned rollback/checkpoint tags.

## Data Integrity Baseline

Status: no active workspace database found.

Search performed: recursive lookup for `*.deadstock` and `inventory.json` inside this workspace returned no database file.

Baseline available now:
- Source schema remains defined in `server/db.js` and `electron/main.cjs`.
- No database migration or data rewrite was performed.
- No upload folder was modified as part of Phase 1.

Required before backend phases: run against the actual active `.deadstock` file and capture top-level keys, record counts, database file size, and companion upload-folder presence before and after each phase.

## Performance Baseline

Status: not captured in this workspace during Phase 1.

Reason: the approved performance baseline requires a running app, active database, stable upload folder, and repeatable browser/window conditions. This workspace does not currently expose the active `.deadstock` database, and no browser automation dependency will be added under the dependency freeze.

Required measurement before optimization:
- Dashboard: `/`
- Hardware: one populated `/hardware/{category}` route from current config
- Allocation: `/allocation`
- Reports: `/reports`

Measurement rule:
- One warm-up navigation per page.
- Three measured navigations per page.
- Same machine, same database, same upload folder, same app mode, same window size.
- Record median time from navigation start until the primary table/cards are populated or the visible empty/loading state settles.
- Regression threshold: more than 10% slower and at least 150 ms slower than baseline.

## Validation Results

Lint:
- Before Phase 1: 186 reported problems in the initial audit.
- After Phase 1: `npm run lint` exits successfully with 0 errors and 18 warnings.

Build:
- `npm run build` succeeds.
- Vite reports one existing bundle-size warning for the main JS chunk over 500 kB.

## Preserved React Hook Warnings

Hook warnings were not behavior-fixed in Phase 1 because the approved rule requires behavior checks before changing fetch timing or render timing.

Remaining warnings:
- `src/components/Layout.jsx`: set-state-in-effect initialization warning.
- `src/pages/AMC.jsx`: fetch dependency warning and `today` dependency warning.
- `src/pages/Allocation.jsx`: fetch dependency warning.
- `src/pages/Backup.jsx`: auto-backup effect dependency warning.
- `src/pages/Dashboard.jsx`: fetch dependency warning.
- `src/pages/EWasteDashboard.jsx`: fetch dependency warning.
- `src/pages/EWasteTable.jsx`: fetch dependency warning.
- `src/pages/Employees.jsx`: fetch dependency warning.
- `src/pages/Hardware.jsx`: fetch dependency warning.
- `src/pages/HardwareConfig.jsx`: function declaration order warnings.
- `src/pages/PermanentAllocation.jsx`: fetch dependency warning.
- `src/pages/Reports.jsx`: fetch dependency warning.
- `src/pages/Software.jsx`: fetch dependency warning.
- `src/pages/Suppliers.jsx`: fetch dependency warning.

## Phase 1 Changes Made

- ESLint now ignores generated/vendor folders: `dist`, `release`, `node_modules`, `server/node_modules`, and `graphify-out`.
- ESLint now separates browser React files from Node/Electron files so Node globals are recognized correctly.
- Unused imports, unused variables, unused catch bindings, and unused state read values were cleaned up where behavior is unchanged.
- `electron/main.cjs` now defines the `addToRecentFiles()` helper already called by `saveAsDatabase()`.
- An unused backend PDF upload storage block was removed because the active server uses the dynamic upload middleware.

## Phase 1 Decision

Phase 1 quality gate status: partially complete.

Complete:
- Lint errors reduced to 0.
- Build succeeds.
- Hook warning changes were deferred instead of behavior-risked.

Blocked:
- Git rollback tags cannot be created until the project is in a Git repository.
- Actual data integrity snapshot requires the active `.deadstock` database.
- Page performance baseline requires a running app with the active database and stable measurement conditions.
