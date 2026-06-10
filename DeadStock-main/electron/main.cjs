const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Settings storage for recent files
const Store = require('./store.cjs');
const store = new Store({
    configName: 'user-preferences',
    defaults: {
        recentFiles: [],
        windowBounds: { width: 1400, height: 900 },
        lastDatabase: null
    }
});

// Global references
let mainWindow = null;
let currentDbPath = null;
let serverProcess = null;

// Logging setup
const logPath = path.join(app.getPath('userData'), 'app.log');
function logToFile(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    try {
        fs.appendFileSync(logPath, logMessage);
    } catch (e) {
        // console.error('Failed to write log', e);
    }
}

// Check if running in development
const isDev = !app.isPackaged;
logToFile(`App starting. isDev=${isDev}`);

// Default database schema
const defaultSchema = {
    suppliers: [],
    invoices: [],
    hardware: [],
    software: [],
    ewaste: [],
    employees: [],
    laptops: [],
    monitors: [],
    cpus: [],
    ups: [],
    laserprinters: [],
    aiodesktops: [],
    scanners: [],
    networkswitches: [],
    hdds: [],
    hardwareConfig: [],
    employeeConfig: {
        posts: [],
        sections: [],
        wings: [],
        offices: []
    },
    allocationHistory: [],
    ewasteYears: [],
    ewasteItems: [],
    permanent_allocation: [],
    userProfile: null
};

// Get default database path
function getDefaultDbPath() {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'default.deadstock');
}

// Ensure default database exists
function ensureDefaultDatabase() {
    const defaultPath = getDefaultDbPath();
    if (!fs.existsSync(defaultPath)) {
        fs.writeFileSync(defaultPath, JSON.stringify(defaultSchema, null, 2));
        console.log('Created default database at:', defaultPath);
    }

    // Ensure uploads folder exists
    const uploadsDir = defaultPath.replace('.deadstock', '_files');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    return defaultPath;
}

// Start Express server as a child process
async function startExpressServer(dbPath) {
    currentDbPath = dbPath;

    // Set environment variables
    process.env.DEADSTOCK_DB_PATH = dbPath;
    process.env.DEADSTOCK_UPLOADS_PATH = dbPath.replace('.deadstock', '_files');

    if (serverProcess) {
        console.log('Server already running');
        return;
    }

    // Get server path
    const serverPath = isDev
        ? path.join(__dirname, '../server/server.js')
        : path.join(process.resourcesPath, 'server', 'server.js');

    logToFile(`Starting server from: ${serverPath}`);
    logToFile(`Database path: ${dbPath}`);

    // Spawn server as child process using Electron's bundled Node
    const nodeExecutable = process.execPath;

    // Calculate uploads path explicitly
    const uploadsPath = dbPath.endsWith('.deadstock')
        ? dbPath.replace('.deadstock', '_files')
        : path.join(path.dirname(dbPath), 'uploads');

    serverProcess = spawn(nodeExecutable, [serverPath, '--start', '--uploads-path', uploadsPath], {
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            DEADSTOCK_DB_PATH: dbPath,
            DEADSTOCK_UPLOADS_PATH: dbPath.replace('.deadstock', '_files')
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: isDev ? path.join(__dirname, '../server') : path.join(process.resourcesPath, 'server')
    });

    serverProcess.stdout.on('data', (data) => {
        logToFile(`Server: ${data}`);
        console.log(`Server: ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
        logToFile(`Server Error: ${data}`);
        console.error(`Server Error: ${data}`);
    });

    serverProcess.on('close', (code) => {
        logToFile(`Server exited with code ${code}`);
        console.log(`Server exited with code ${code}`);
        serverProcess = null;
    });

    serverProcess.on('error', (err) => {
        logToFile(`Failed to spawn server process: ${err.message}`);
    });

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
}

function createWindow() {
    const { width, height } = store.get('windowBounds');

    mainWindow = new BrowserWindow({
        width,
        height,
        minWidth: 1024,
        minHeight: 768,
        title: 'DeadStock',
        icon: path.join(__dirname, '../public/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true
        },
        show: false
    });

    // Save window size on resize
    mainWindow.on('resize', () => {
        const { width, height } = mainWindow.getBounds();
        store.set('windowBounds', { width, height });
    });

    // Show when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Build application menu
    const menu = buildMenu();
    Menu.setApplicationMenu(menu);

    // Load the app
    if (isDev) {
        // In development, load from Vite dev server
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        // In production, load built files
        const indexPath = path.join(__dirname, '../dist/index.html');
        console.log('Loading:', indexPath);
        mainWindow.loadFile(indexPath);
    }
}

function buildMenu() {
    const recentFiles = store.get('recentFiles') || [];

    const recentFilesMenu = recentFiles.length > 0
        ? recentFiles.map(filePath => ({
            label: path.basename(filePath),
            click: () => openDatabase(filePath)
        }))
        : [{ label: 'No Recent Files', enabled: false }];

    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Database',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => createNewDatabase()
                },
                {
                    label: 'Open Database...',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => openDatabaseDialog()
                },
                {
                    label: 'Open Recent',
                    submenu: [
                        ...recentFilesMenu,
                        { type: 'separator' },
                        {
                            label: 'Clear Recent',
                            click: () => {
                                store.set('recentFiles', []);
                                Menu.setApplicationMenu(buildMenu());
                            }
                        }
                    ]
                },
                { type: 'separator' },
                {
                    label: 'Save',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('menu-save');
                        }
                    }
                },
                {
                    label: 'Save As...',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: () => saveAsDatabase()
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: 'Alt+F4',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About DeadStock',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About DeadStock',
                            message: 'DeadStock - Inventory Management System',
                            detail: 'Version 1.0.0\n\nA comprehensive solution for managing hardware and software inventory.'
                        });
                    }
                }
            ]
        }
    ];

    // Add DevTools in development
    if (isDev) {
        template[1].submenu.push(
            { type: 'separator' },
            { role: 'toggleDevTools' }
        );
    }

    return Menu.buildFromTemplate(template);
}

async function createNewDatabase() {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        title: 'Create New Database',
        defaultPath: 'inventory.deadstock',
        filters: [
            { name: 'DeadStock Database', extensions: ['deadstock'] }
        ]
    });

    if (canceled || !filePath) return;

    try {
        // Create new database file with default schema
        fs.writeFileSync(filePath, JSON.stringify(defaultSchema, null, 2));

        // Create companion uploads folder
        const uploadsDir = filePath.replace('.deadstock', '_files');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        await openDatabase(filePath);
    } catch (error) {
        dialog.showErrorBox('Error', `Failed to create database: ${error.message}`);
    }
}

async function openDatabaseDialog() {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Database',
        filters: [
            { name: 'DeadStock Database', extensions: ['deadstock'] }
        ],
        properties: ['openFile']
    });

    if (canceled || filePaths.length === 0) return;

    await openDatabase(filePaths[0]);
}

async function openDatabase(filePath) {
    if (!fs.existsSync(filePath)) {
        dialog.showErrorBox('Error', 'Database file not found.');
        return;
    }

    try {
        currentDbPath = filePath;

        // Update recent files
        let recentFiles = store.get('recentFiles') || [];
        recentFiles = recentFiles.filter(f => f !== filePath);
        recentFiles.unshift(filePath);
        recentFiles = recentFiles.slice(0, 10);
        store.set('recentFiles', recentFiles);
        store.set('lastDatabase', filePath);

        // Rebuild menu to update recent files
        Menu.setApplicationMenu(buildMenu());

        // Restart server with new database
        if (serverProcess) {
            serverProcess.kill();
            serverProcess = null;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await startExpressServer(filePath);

        // Reload the page
        if (mainWindow) {
            mainWindow.webContents.reload();
        }
    } catch (error) {
        dialog.showErrorBox('Error', `Failed to open database: ${error.message}`);
    }
}

function addToRecentFiles(filePath) {
    let recentFiles = store.get('recentFiles') || [];
    recentFiles = recentFiles.filter(f => f !== filePath);
    recentFiles.unshift(filePath);
    recentFiles = recentFiles.slice(0, 10);
    store.set('recentFiles', recentFiles);
    store.set('lastDatabase', filePath);
    Menu.setApplicationMenu(buildMenu());
}

// Save database to a new location
async function saveAsDatabase() {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Database As',
            defaultPath: currentDbPath || 'inventory.deadstock',
            filters: [
                { name: 'DeadStock Database', extensions: ['deadstock'] }
            ]
        });

        if (result.canceled || !result.filePath) return;

        // Copy current database to new location
        if (currentDbPath && fs.existsSync(currentDbPath)) {
            fs.copyFileSync(currentDbPath, result.filePath);

            // Also copy the files folder
            const currentFilesDir = currentDbPath.replace('.deadstock', '_files');
            const newFilesDir = result.filePath.replace('.deadstock', '_files');
            if (fs.existsSync(currentFilesDir)) {
                if (!fs.existsSync(newFilesDir)) {
                    fs.mkdirSync(newFilesDir, { recursive: true });
                }
                // Copy all files
                const files = fs.readdirSync(currentFilesDir);
                files.forEach(file => {
                    fs.copyFileSync(
                        path.join(currentFilesDir, file),
                        path.join(newFilesDir, file)
                    );
                });
            }

            // Update recent files
            addToRecentFiles(result.filePath);

            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Saved',
                message: `Database saved to: ${result.filePath}`
            });
        }
    } catch (error) {
        dialog.showErrorBox('Error', `Failed to save database: ${error.message}`);
    }
}

// IPC Handlers
ipcMain.handle('get-database-info', () => {
    if (!currentDbPath) return null;
    return {
        path: currentDbPath,
        name: path.basename(currentDbPath, '.deadstock')
    };
});

ipcMain.handle('open-database-dialog', () => openDatabaseDialog());
ipcMain.handle('create-new-database', () => createNewDatabase());
ipcMain.handle('get-recent-files', () => store.get('recentFiles') || []);

ipcMain.handle('show-file-in-folder', (event, filePath) => {
    shell.showItemInFolder(filePath);
});

// App lifecycle
app.whenReady().then(async () => {
    // Get database path: last used, or create default
    const lastDb = store.get('lastDatabase');
    let dbPath;

    if (lastDb && fs.existsSync(lastDb)) {
        dbPath = lastDb;
    } else {
        dbPath = ensureDefaultDatabase();
    }

    // Start server first
    await startExpressServer(dbPath);

    // Then create window
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    // Kill server process when app quits
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// Handle file association
app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow) {
        openDatabase(filePath);
    } else {
        app.whenReady().then(() => openDatabase(filePath));
    }
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();

            const filePath = commandLine.find(arg => arg.endsWith('.deadstock'));
            if (filePath) {
                openDatabase(filePath);
            }
        }
    });
}

// IPC handler to save file (bypassing HTTP for large files)
ipcMain.handle('save-file', async (event, { name, buffer }) => {
    try {
        const uploadsDir = currentDbPath.endsWith('.deadstock')
            ? currentDbPath.replace('.deadstock', '_files')
            : path.join(path.dirname(currentDbPath), 'uploads');

        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const filePath = path.join(uploadsDir, name);
        fs.writeFileSync(filePath, Buffer.from(buffer));
        console.log('File saved via IPC:', filePath);
        return { success: true, path: filePath };
    } catch (error) {
        console.error('IPC Save File Error:', error);
        return { success: false, error: error.message };
    }
});

// ============================================
// Native File Dialog Handlers (v1.2.0)
// ============================================

// Show native Open dialog for file selection
ipcMain.handle('show-open-dialog', async (event, options) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, options);
        return result;
    } catch (error) {
        console.error('Show Open Dialog Error:', error);
        return { canceled: true, filePaths: [], error: error.message };
    }
});

// Read file directly from disk (for Excel processing)
ipcMain.handle('read-file', async (event, filePath) => {
    try {
        const buffer = fs.readFileSync(filePath);
        // Return as array for IPC transfer
        return { success: true, data: Array.from(buffer) };
    } catch (error) {
        console.error('Read File Error:', error);
        return { success: false, error: error.message };
    }
});

// Show native Save As dialog
ipcMain.handle('show-save-dialog', async (event, options) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, options);
        return result;
    } catch (error) {
        console.error('Show Save Dialog Error:', error);
        return { canceled: true, filePath: undefined, error: error.message };
    }
});

// Write buffer directly to disk (for Excel downloads)
ipcMain.handle('write-file', async (event, { filePath, buffer }) => {
    try {
        fs.writeFileSync(filePath, Buffer.from(buffer));
        logToFile(`File written via IPC: ${filePath}`);
        return { success: true, path: filePath };
    } catch (error) {
        console.error('Write File Error:', error);
        return { success: false, error: error.message };
    }
});
