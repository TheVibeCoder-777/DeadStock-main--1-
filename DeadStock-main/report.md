# DeadStock - Detailed Project Analysis & Documentation

## 1. Project Overview
**DeadStock** is a comprehensive Inventory Management System built as a desktop application using web technologies. It tracks hardware, software, employee allocations, Annual Maintenance Contracts (AMC), e-waste, invoices, and suppliers. The application is packaged as a standalone desktop app using Electron.

## 2. Technology Stack & Languages
- **Frontend Framework:** React 19 (using JSX, Hooks, React Router DOM for routing)
- **Styling:** Vanilla CSS3 with semantic custom properties (variables)
- **Build Tool:** Vite
- **Backend Environment:** Node.js (Express.js)
- **Desktop Framework:** Electron with `electron-builder` for NSIS Windows installers
- **Database:** LowDB (A lightweight, local JSON database) with `proper-lockfile` for concurrent read/write protection.
- **Data Parsing:** `xlsx` for parsing bulk Excel data uploads, `multer` for file uploads.

## 3. Database Schema & Architecture
The system uses a JSON file (`inventory.json` or `.deadstock`) managed by **LowDB**. The database schema holds various interconnected collections:

### Core Collections:
- **`suppliers`**: Supplier details (ID, Name, Contact, Address).
- **`invoices`**: Invoice details linked to purchases.
- **`employees`**: Staff details for allocation.
- **`hardware`**: General hardware tracking.
- **`software`**: Software licensing and tracking.
- **`ewaste`**: Items marked for e-waste.
- **`allocationHistory`**: Logs of when items are assigned or returned.
- **`permanent_allocation`**: Long-term asset assignments.

### Hardware-Specific Collections:
To handle diverse attributes, hardware is divided into sub-collections:
- `laptops`, `monitors`, `cpus`, `ups`, `laserprinters`, `aiodesktops`, `scanners`, `networkswitches`, `hdds`

### Configuration & Meta Collections:
- **`employeeConfig`**: Contains `posts`, `sections`, `wings`, `offices`.
- **`hardwareConfig`**: Custom fields/types for hardware.
- **`makeConfig`**: List of standard manufacturers (e.g., HP, Dell, Lenovo).
- **`ewasteYears`** & **`ewasteItems`**: Tracks e-waste records by financial year.
- **`userProfile`**: Admin/User settings.

## 4. Application Pages & Routing (`src/App.jsx`)
The frontend is structured around a central `<Layout />` containing a sidebar and a top navigation area. 

### Page List:
1. **Dashboard (`/`)**: High-level metrics and overview.
2. **Suppliers (`/suppliers`)**: Manage vendor information and upload via Excel.
3. **Invoices (`/invoices`)**: Track purchase invoices and financial records.
4. **Hardware Config (`/hardware/config`)**: Setup categories and makes.
5. **Hardware List (`/hardware/:category`)**: Dynamic pages showing specific hardware items (e.g., Laptops, Monitors).
6. **Allocation (`/allocation`)**: Assign assets to employees dynamically.
7. **Permanent Allocation (`/permanent-allocation`)**: Fixed asset assignments.
8. **Software (`/software`)**: Manage software inventory and licenses.
9. **E-Waste Dashboard (`/e-waste`)**: High-level view of e-waste groupings.
10. **E-Waste Table (`/e-waste/:year`)**: Drill-down lists of depreciated items per year with Excel export.
11. **Employees (`/employees`)**: Employee database.
12. **Employee Config (`/employees/config`)**: Setup roles, wings, and offices.
13. **Reports (`/reports`)**: Consolidated hardware/software exportable reports.
14. **AMC (`/amc`)**: Annual Maintenance Contract tracking.
15. **Backup (`/backup`)**: Export and secure database/files.

## 5. API Endpoints
The backend runs on an Express server (port 3001) that the Electron app communicates with. The APIs follow RESTful conventions for CRUD operations.

### Common Patterns:
- **`GET /api/<collection>`**: Fetch all records.
- **`POST /api/<collection>`**: Add a new record.
- **`PUT /api/<collection>/:id`**: Update a specific record.
- **`DELETE /api/<collection>/:id`**: Remove a record.
- **`POST /api/<collection>/upload`**: Bulk Excel uploads via `multer` (e.g., `/api/suppliers/upload`).

### Key Endpoints:
- `/api/database-info`: Returns the active database path and uploads directory.
- `/uploads`: Static route serving user-uploaded files.

## 6. Frontend UI/UX, Colors, and Schemas
The application follows a modern, clean, and professional "Enterprise" aesthetic with a custom-built CSS framework (`index.css`). 

### Color Palette:
- **Primary (Teal):** `#0D9488` (Main brand color, buttons, active states)
- **Primary Dark:** `#0F766E` (Hover states)
- **Secondary:** `#CCFBF1` (Light teal for backgrounds/highlights)
- **Backgrounds:** `#FFFFFF` (Surface), `#F8FAFC` (Grey backdrop)
- **Text:** `#1E293B` (Dark Slate for high readability)
- **Semantic Colors:** 
  - Danger: `#DC2626` (Deletions, alerts)
  - Success: `#059669` (Confirmations)
  - Warning: `#D97706` 
  - Info: `#2563EB`
  - Excel/PDF specific colors: `#217346` / `#DC2626`

### Typography:
- **Headings:** `Outfit`, sans-serif (Clean, geometric feel)
- **Body & Data:** `Inter`, sans-serif (High legibility for tables and forms)

### UI Layout & Components:
- **Navigation:** Left sidebar (width: 260px, collapses to 70px) and a Top Header (height: 64px).
- **Tables:** Custom table components with freezing columns (e.g., the first three columns in E-Waste/Hardware), robust search bars, and filter toolbars.
- **Modals (Wizards):** Multi-step modal logic mapped to sizes (`modal-sm` to `modal-xl`) for data entry.
- **Utility Classes:** Heavy use of Flexbox and CSS Grid (e.g., `.flex-row`, `.grid-2-col`) to maintain consistent alignment without complex media queries.

## 7. Interconnectivity & Data Flow
1. **Frontend-Backend Bridge:** The React UI makes HTTP requests via `fetch` to the Express backend.
2. **Database Mutex:** When the backend receives a request, it uses `proper-lockfile` before calling `db.read()` or `db.write()` to ensure the JSON database isn't corrupted by simultaneous actions.
3. **Electron IPC (Inter-Process Communication):** Some deep OS tasks (like opening native file dialogs or determining app data paths) are handled by `main.cjs` and passed to React via Context bridges.
4. **Excel Processing:** When users upload Excel sheets, the backend utilizes the `xlsx` library to parse rows, maps them to JSON objects, and pushes them to LowDB. When exporting, the frontend parses JSON back into Excel logic and triggers browser/electron downloads.
