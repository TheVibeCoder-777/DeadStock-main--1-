const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Database operations
    getDatabaseInfo: () => ipcRenderer.invoke('get-database-info'),
    openDatabaseDialog: () => ipcRenderer.invoke('open-database-dialog'),
    createNewDatabase: () => ipcRenderer.invoke('create-new-database'),
    getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    saveFile: (fileData) => ipcRenderer.invoke('save-file', fileData),

    // File operations
    showFileInFolder: (filePath) => ipcRenderer.invoke('show-file-in-folder', filePath),

    // Native File Dialogs (v1.2.0)
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
    writeFile: (data) => ipcRenderer.invoke('write-file', data),

    // Listen for database changes
    onDatabaseLoaded: (callback) => {
        ipcRenderer.on('database-loaded', (event, data) => callback(data));
    },

    // Platform info
    platform: process.platform,
    isElectron: true
});

