const electron = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Simple JSON store for Electron app settings
 */
class Store {
    constructor(opts) {
        // Get the user data path from Electron
        const userDataPath = (electron.app || electron.remote.app).getPath('userData');

        this.path = path.join(userDataPath, opts.configName + '.json');
        this.data = parseDataFile(this.path, opts.defaults);
    }

    // Get a value from the store
    get(key) {
        return this.data[key];
    }

    // Set a value in the store
    set(key, val) {
        this.data[key] = val;
        try {
            fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }
}

function parseDataFile(filePath, defaults) {
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // If there's an error (file doesn't exist, invalid JSON, etc.), return defaults
        return defaults;
    }
}

module.exports = Store;
