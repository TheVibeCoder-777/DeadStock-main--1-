# DeadStock Inventory Management System

DeadStock is a comprehensive, offline-first inventory management solution designed for tracking hardware, software, and e-waste in organizations. Built with modern web technologies, it runs as a native desktop application.

## 🚀 Key Features

*   **Dashboard**: Real-time overview of inventory stats, stock alerts, and recent activities.
*   **Hardware Management**: Track computers, laptops, printers, and peripherals with detailed specs (RAM, HDD, Make, Model).
*   **Software Licensing**: Manage software licenses, validity dates, and allocation.
*   **Invoicing**: Link inventory items to purchase bills and vendors for warranty tracking.
*   **Employee Allocation**: Assign hardware/software to employees and track history.
*   **E-Waste Management**: efficient monitoring of disposed/retired assets.
*   **Reports**: Generate detailed Excel reports for audits and inventory checks.
*   **Native File Handling**: Seamless Excel upload/download and document management using native Windows dialogs.

## 🛠️ Technology Stack

*   **Frontend**: React 19, Vite, TailwindCSS (styled with custom CSS).
*   **Backend**: Express.js (running locally as a child process).
*   **Desktop Container**: Electron.
*   **Database**: Local JSON-based storage (LowDB style) for zero-configuration persistence.
*   **Security**: Context Isolation, IPC communication, no remote external dependencies.

## 📦 How to Use (For End Users)

1.  **Download** the application package.
2.  **Extract** the folder to your preferred location (e.g., `C:\DeadStock`).
3.  **Run** `DeadStock.exe`.
4.  **First Run**: The app will automatically create a `default.deadstock` database in your AppData folder.
5.  **Menu**: Use the **File** menu to New, Open, Save, or Save As databases.

## 💻 Developer Setup

To modify or build the application from source:

### Prerequisites
*   Node.js (v18 or higher)
*   npm

### Installation
1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```

### Running in Development
Starts the React dev server and Electron window with hot-reload:
```bash
npm run electron:dev
```

### Building for Production
Create a standalone Windows executable:
```bash
# Build React frontend
npm run build

# Package Electron app (creates release/ folder)
npx electron-packager . DeadStock --platform=win32 --arch=x64 --out=release --overwrite --asar --icon=public/icon.png --extra-resource=server
```

## 🏗️ Architecture

1.  **Electron Main Process** (`electron/main.cjs`):
    *   Manages window lifecycle and native menus.
    *   Spawns the Express server as a background child process.
    *   Handles native file dialogs via IPC.

2.  **Express Server** (`server/server.js`):
    *   REST API endpoints (e.g., `/api/hardware`, `/api/employees`).
    *   Reads/Writes to the JSON database.
    *   Handles file uploads/downloads using Streams/Buffers.

3.  **React Frontend** (`src/`):
    *   Consumes REST API for data.
    *   Uses `window.electronAPI` for native dialogs (Open/Save).

## 📄 License
Private / Proprietary.
