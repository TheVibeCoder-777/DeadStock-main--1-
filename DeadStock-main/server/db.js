import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import fs from 'fs';
import lockfile from 'proper-lockfile';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  makeConfig: ['HP', 'Dell', 'Lenovo', 'Acer', 'ASUS', 'Samsung', 'LG', 'Apple', 'Microsoft', 'Toshiba', 'Sony', 'BenQ', 'ViewSonic', 'APC', 'Epson', 'Canon', 'Brother', 'Cisco', 'D-Link', 'TP-Link', 'Seagate', 'Western Digital', 'Kingston', 'Crucial', 'Intel', 'AMD'],
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

// Database instance
let db = null;
let currentDbPath = null;

/**
 * Get the database file path
 * Priority: Environment variable > Default fallback
 */
function getDatabasePath() {
  // Check for Electron-provided path via environment variable
  if (process.env.DEADSTOCK_DB_PATH) {
    return process.env.DEADSTOCK_DB_PATH;
  }
  // Default fallback for development or standalone server
  return join(__dirname, 'inventory.json');
}

/**
 * Initialize or reinitialize the database with a specific file
 */
export async function initDatabase(filePath = null) {
  const dbPath = filePath || getDatabasePath();
  currentDbPath = dbPath;

  console.log(`Initializing database from: ${dbPath}`);

  const adapter = new JSONFile(dbPath);
  db = new Low(adapter, defaultSchema);

  // --- Network File Locking for Concurrency ---
  const originalRead = db.read.bind(db);
  const originalWrite = db.write.bind(db);

  const lockOptions = {
    retries: { retries: 15, minTimeout: 100, maxTimeout: 1500 }
  };

  db.read = async () => {
    let release;
    try {
      if (fs.existsSync(currentDbPath)) {
        release = await lockfile.lock(currentDbPath, lockOptions);
      }
      await originalRead();
    } finally {
      if (release) await release();
    }
  };

  db.write = async () => {
    let release;
    try {
      if (fs.existsSync(currentDbPath)) {
        release = await lockfile.lock(currentDbPath, lockOptions);
      }
      await originalWrite();
    } finally {
      if (release) await release();
    }
  };

  try {
    await db.read();
  } catch (error) {
    console.error('Error reading DB, initializing with defaults:', error);
    db.data = { ...defaultSchema };
  }

  // Ensure all schema keys exist
  db.data = db.data || {};
  Object.keys(defaultSchema).forEach(key => {
    if (db.data[key] === undefined) {
      db.data[key] = defaultSchema[key];
    }
  });

  try {
    await db.write();
  } catch (error) {
    console.error('Error writing DB init:', error);
  }

  return db;
}

/**
 * Get the current database instance
 */
export function getDatabase() {
  return db;
}

/**
 * Get the current database file path
 */
export function getDatabaseFilePath() {
  return currentDbPath;
}

/**
 * Get the uploads directory path (companion folder next to database)
 */
export function getUploadsPath() {
  if (process.env.DEADSTOCK_UPLOADS_PATH) {
    return process.env.DEADSTOCK_UPLOADS_PATH;
  }
  if (currentDbPath && currentDbPath.endsWith('.deadstock')) {
    return currentDbPath.replace('.deadstock', '_files');
  }
  return join(__dirname, 'uploads');
}

// Auto-initialize on module load (for backward compatibility)
await initDatabase();

export default db;
