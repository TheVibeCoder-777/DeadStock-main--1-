import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createRequire } from 'module';
import db, { getUploadsPath, initDatabase, getDatabaseFilePath } from './db.js';

const require = createRequire(import.meta.url);
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// --- Process-Level Crash Guards ---
process.on('unhandledRejection', (reason, _promise) => {
    console.error('[FATAL] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught Exception:', error);
    // Give the process a moment to flush logs, then exit
    setTimeout(() => process.exit(1), 1000);
});

// Parse CLI args (simple)
const args = process.argv;
console.log('Raw Process Arguments:', args);
const uploadsFlagIndex = args.indexOf('--uploads-path');
let cliUploadsPath = null;
if (uploadsFlagIndex > -1 && args[uploadsFlagIndex + 1]) {
    cliUploadsPath = args[uploadsFlagIndex + 1];
    console.log('CLI Override for Uploads Path:', cliUploadsPath);
}

// Get uploads directory (dynamic for Electron, static for standalone)
let uploadsDir = cliUploadsPath || getUploadsPath();

// Ensure uploads directory exists
function ensureUploadsDir() {
    if (!fs.existsSync(uploadsDir)) {
        try {
            fs.mkdirSync(uploadsDir, { recursive: true });
        } catch (e) {
            console.error('Context:', e.message || e);
        }
    }
    return uploadsDir;
}
ensureUploadsDir();

// Dynamic storage that checks uploads path on each request
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            console.log('Starting file upload...');
            const dir = ensureUploadsDir();
            console.log(`Upload destination: ${dir}`);
            if (!fs.existsSync(dir)) {
                console.log('Directory missing, recreating...');
                fs.mkdirSync(dir, { recursive: true });
            }
            cb(null, dir);
        } catch (error) {
            console.error('Context:', error.message || error);
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        // Sanitize filename to avoid Windows invalid chars
        const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        console.log(`Sanitized: ${file.originalname} -> ${sanitized}`);
        cb(null, uniqueSuffix + '-' + sanitized);
    }
});
const upload = multer({ storage: storage });

// Memory storage for bulk uploads that need buffer access
const memoryUpload = multer({ storage: multer.memoryStorage() });

// --- Global Helper: Format Excel serial dates to DD-MM-YYYY ---
const formatExcelDate = (val) => {
    if (!val && val !== 0) return '';
    const num = Number(val);
    // Excel serial dates: 10000 (~1927) to 90000 (~2146) covers valid range
    if (!isNaN(num) && num > 10000 && num < 90000) {
        const date = new Date(Math.round((num - 25569) * 86400 * 1000));
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }
    return val ? String(val) : '';
};

// --- Shared Helper: Normalize PIN for comparison (strip leading zeros, trim) ---
const normalizePin = (s) => String(s || '').trim().replace(/^0+/, '');

// --- Shared Helper: Convert YYYY-MM-DD to DD-MM-YYYY; passthrough other formats ---
const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '';
    const parts = String(dateStr).split('-');
    if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
};

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));



app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Serve uploaded files dynamically
app.use('/uploads', (req, res, next) => {
    express.static(ensureUploadsDir())(req, res, next);
});

// Note: Global error handler is registered AFTER all routes (see bottom of file)

app.get('/', (req, res) => {
    res.json({ message: 'Inventory System Backend (LowDB) is running' });
});

// --- Database Info API (for Electron) ---
app.get('/api/database-info', (req, res) => {
    res.json({
        path: process.env.DEADSTOCK_DB_PATH || 'default',
        uploadsPath: uploadsDir
    });
});

// --- Suppliers API ---

// GET All Suppliers
app.get('/api/suppliers', async (req, res) => {
    try {
        await db.read();
        db.data ||= { suppliers: [] }; // Safety check
        res.json(db.data.suppliers || []);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to fetch suppliers' });
    }
});

// POST New Supplier
app.post('/api/suppliers', async (req, res) => {
    try {
        const newSupplier = req.body;
        await db.update((data) => {
            data.suppliers.push(newSupplier);
        });
        res.status(201).json({ message: 'New Supplier Added', supplier: newSupplier });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to add supplier' });
    }
});

// PUT Update Supplier
app.put('/api/suppliers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        const result = await db.update((data) => {
            const index = data.suppliers.findIndex(s => s.Supplier_ID === id);
            if (index !== -1) {
                data.suppliers[index] = { ...data.suppliers[index], ...updatedData };
                return { found: true, supplier: data.suppliers[index] };
            }
            return { found: false };
        });
        if (result.found) {
            res.json({ message: 'Supplier Details Updated', supplier: result.supplier });
        } else {
            res.status(404).json({ error: 'Supplier not found' });
        }
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to update supplier' });
    }
});

// DELETE Supplier (match by Supplier_ID or fallback to id field)
app.delete('/api/suppliers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.update((data) => {
            const initialLength = data.suppliers.length;
            data.suppliers = data.suppliers.filter(s => s.Supplier_ID !== id && s.id !== id);
            return { deleted: data.suppliers.length < initialLength };
        });
        if (result.deleted) {
            res.json({ message: 'Supplier Deleted' });
        } else {
            res.status(404).json({ error: 'Supplier not found' });
        }
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to delete supplier' });
    }
});

// --- Excel Bulk Operations ---

// Upload Excel (Base64)
app.post('/api/suppliers/upload', async (req, res) => {
    try {
        let filePath;

        if (req.body.processOnly) {
            // File already saved via IPC
            filePath = path.join(uploadsDir, req.body.fileName);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found on server' });
            }
        } else {
            // Base64 upload
            const { fileData } = req.body;
            if (!fileData) {
                return res.status(400).json({ error: 'No file data provided' });
            }
            filePath = path.join(uploadsDir, `suppliers_${Date.now()}.xlsx`);
            const buffer = Buffer.from(fileData.split(',')[1], 'base64');
            fs.writeFileSync(filePath, buffer);
        }

        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        console.log('Parsed Excel Data (First Row):', data[0]); // DEBUG LOG

        let addedCount = 0;
        let updatedCount = 0;

        await db.update((dbData) => {
            dbData.suppliers ||= [];
            for (const rawRow of data) {
                const row = {
                    Supplier_ID: rawRow['Supplier_ID'] || rawRow['Supplier ID'],
                    Supplier_Name: rawRow['Supplier_Name'] || rawRow['Supplier Name'] || rawRow['Name'],
                    Category: rawRow['Category'],
                    Address_1: rawRow['Address_1'] || rawRow['Address 1'] || rawRow['Address'],
                    Address_2: rawRow['Address_2'] || rawRow['Address 2'],
                    City: rawRow['City'],
                    State: rawRow['State'],
                    PIN_Code: rawRow['PIN_Code'] || rawRow['PIN Code'] || rawRow['PIN'],
                    POC_Person: rawRow['POC_Person'] || rawRow['POC Person'] || rawRow['POC'],
                    Phone_Number: rawRow['Phone_Number'] || rawRow['Phone Number'] || rawRow['Phone'],
                    Email: rawRow['Email']
                };

                if (!row.Supplier_Name) {
                    console.log('Skipping row due to missing Supplier Name:', rawRow);
                    continue;
                }

                if (!row.Supplier_ID) {
                    const num = Math.floor(Math.random() * 9000) + 1000;
                    row.Supplier_ID = `S${num}`;
                }

                const supplierData = {
                    Supplier_ID: row.Supplier_ID,
                    Category: row.Category || 'All (H/S/C)',
                    Supplier_Name: row.Supplier_Name,
                    Address_1: row.Address_1 || '',
                    Address_2: row.Address_2 || '',
                    City: row.City || '',
                    State: row.State || '',
                    PIN_Code: row.PIN_Code || '',
                    POC_Person: row.POC_Person || '',
                    Phone_Number: row.Phone_Number || '',
                    Email: row.Email || ''
                };

                const existingIndex = dbData.suppliers.findIndex(s => s.Supplier_ID === row.Supplier_ID);
                if (existingIndex !== -1) {
                    Object.assign(dbData.suppliers[existingIndex], supplierData);
                    updatedCount++;
                } else {
                    dbData.suppliers.push(supplierData);
                    addedCount++;
                }
            }
        });

        res.json({ message: `Bulk upload processed. Added ${addedCount} new, Updated ${updatedCount} existing suppliers.` });

    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to process Excel file' });
    }
});

// Download Excel
app.get('/api/suppliers/download', async (req, res) => {
    try {
        await db.read();
        const suppliers = db.data.suppliers;

        const worksheet = xlsx.utils.json_to_sheet(suppliers);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Suppliers');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="suppliers.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to generate Excel file' });
    }
});

// Suppliers Download Buffer (for Native Save) - v1.2.0
app.get('/api/suppliers/download-buffer', async (req, res) => {
    try {
        await db.read();
        const suppliers = db.data.suppliers;
        const worksheet = xlsx.utils.json_to_sheet(suppliers);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Suppliers');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.json({ buffer: Array.from(buffer) });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to generate Excel buffer' });
    }
});

// --- Invoices API ---

// GET All Invoices
app.get('/api/invoices', async (req, res) => {
    try {
        await db.read();
        db.data ||= { invoices: [] };
        const invoices = (db.data.invoices || []).map(inv => ({
            ...inv,
            Date: formatExcelDate(inv.Date),
            Items: (inv.Items || []).map(item => ({
                ...item,
                Warranty_Upto: formatExcelDate(item.Warranty_Upto)
            }))
        }));
        res.json(invoices);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

// POST New Invoice
// POST New Invoice (Base64)
app.post('/api/invoices', async (req, res) => {
    try {
        // Expecting { data: Object, fileData: "base64...", fileName: "name.pdf" }
        const { fileData, fileName, data } = req.body;
        const invoiceData = (typeof data === 'string') ? JSON.parse(data) : data;

        let savedFilename = null;

        if (fileData && fileName) {
            try {
                // Sanitize filename
                const safeName = fileName.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
                const uniqueName = Date.now() + '-' + safeName;
                const buffer = Buffer.from(fileData.split(',')[1], 'base64');

                const targetDir = ensureUploadsDir();
                const targetPath = path.join(targetDir, uniqueName);

                fs.writeFileSync(targetPath, buffer);
                console.log(`Saved Base64 file: ${uniqueName}`);
                savedFilename = uniqueName;
            } catch (err) {
                console.error('Context:', err.message || err);
                return res.status(500).json({ error: 'Failed to write file' });
            }
        }

        const result = await db.update((data) => {
            data.invoices = data.invoices || [];

            // Generate Serial Number (Simple Auto Increment for now)
            let maxInv = 0;
            data.invoices.forEach(inv => {
                if (inv.Serial_Number && inv.Serial_Number.startsWith('INV')) {
                    const num = parseInt(inv.Serial_Number.substring(3));
                    if (num > maxInv) maxInv = num;
                }
            });
            const nextSerial = `INV${String(maxInv + 1).padStart(3, '0')}`;

            const newInvoice = {
                id: Date.now().toString(), // Internal ID
                Serial_Number: nextSerial,
                ...invoiceData,
                Bill_PDF: savedFilename,
                Items: invoiceData.Items || [] // Ensure Items array exists
            };

            // Check Bill Number Duplicate
            const duplicate = data.invoices.find(inv => inv.Bill_Number === newInvoice.Bill_Number);
            if (duplicate) {
                return { error: 'Bill Number already exists', status: 400 };
            }

            data.invoices.push(newInvoice);
            return { invoice: newInvoice };
        });

        if (result.error) return res.status(result.status).json({ error: result.error });
        res.status(201).json({ message: 'Invoice Added', invoice: result.invoice });

    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to save invoice' });
    }
});

// PUT Update Invoice (Support file replacement)
// PUT Update Invoice (Base64)
app.put('/api/invoices/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Expecting { data: Object, fileData: "base64...", fileName: "name.pdf" }
        const { fileData, fileName, data } = req.body;
        const invoiceData = (typeof data === 'string') ? JSON.parse(data) : data;

        // Handle New File Upload if present
        let savedFilename = undefined;

        if (fileData && fileName) {
            try {
                const safeName = fileName.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
                const uniqueName = Date.now() + '-' + safeName;
                const buffer = Buffer.from(fileData.split(',')[1], 'base64');

                const targetDir = ensureUploadsDir();
                const targetPath = path.join(targetDir, uniqueName);

                fs.writeFileSync(targetPath, buffer);
                console.log(`Saved Base64 file (Update): ${uniqueName}`);
                savedFilename = uniqueName;
            } catch (err) {
                console.error('Context:', err.message || err);
                return res.status(500).json({ error: 'Failed to write file' });
            }
        }

        const result = await db.update((data) => {
            const index = data.invoices.findIndex(inv => inv.id === id);
            if (index !== -1) {
                const oldInvoice = data.invoices[index];
                const updatedInvoice = {
                    ...oldInvoice,
                    ...invoiceData,
                    Bill_PDF: savedFilename !== undefined ? savedFilename : (invoiceData.Bill_PDF !== undefined ? invoiceData.Bill_PDF : oldInvoice.Bill_PDF),
                    Items: invoiceData.Items || oldInvoice.Items
                };
                data.invoices[index] = updatedInvoice;
                return { found: true, invoice: updatedInvoice };
            }
            return { found: false };
        });

        if (result.found) {
            res.json({ message: 'Invoice Updated', invoice: result.invoice });
        } else {
            res.status(404).json({ error: 'Invoice not found' });
        }
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to update invoice' });
    }
});

// DELETE Invoice
app.delete('/api/invoices/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.update((data) => {
            const initialLength = data.invoices.length;
            data.invoices = data.invoices.filter(inv => inv.id !== id);
            return { deleted: data.invoices.length < initialLength };
        });

        if (result.deleted) {
            res.json({ message: 'Invoice Deleted' });
        } else {
            res.status(404).json({ error: 'Invoice not found' });
        }
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to delete invoice' });
    }
});

// Download Invoices Excel
app.get('/api/invoices/download', async (req, res) => {
    try {
        await db.read();
        // Flatten data for Excel (Master + Items?)
        // Usually people want one row per item, with master info repeated.
        const flatData = [];
        const invoices = db.data.invoices || [];

        invoices.forEach(inv => {
            if (inv.Items && inv.Items.length > 0) {
                inv.Items.forEach(item => {
                    flatData.push({
                        Serial_Number: inv.Serial_Number,
                        Bill_Number: inv.Bill_Number,
                        Firm_Name: inv.Firm_Name,
                        Date: inv.Date,
                        Amount: inv.Amount,
                        Category: inv.Category,
                        Hardware_Item: item.Hardware_Item,
                        Item_Qty: item.Quantity,
                        Warranty: item.Warranty,
                        Warranty_Upto: item.Warranty_Upto,
                        Item_Details: item.Item_Details,
                        OEM_Software: item.OEM_Software
                    });
                });
            } else {
                // Invoice with no items
                flatData.push({
                    Serial_Number: inv.Serial_Number,
                    Bill_Number: inv.Bill_Number,
                    Firm_Name: inv.Firm_Name,
                    Date: inv.Date,
                    Amount: inv.Amount,
                    Category: inv.Category,
                    Hardware_Item: '', Item_Qty: '', Warranty: '', Warranty_Upto: '', Item_Details: '', OEM_Software: ''
                });
            }
        });

        const worksheet = xlsx.utils.json_to_sheet(flatData);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Invoices');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="invoices.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to download invoices' });
    }
});

// Upload Invoices Excel (Bulk)
app.post('/api/invoices/upload', async (req, res) => {
    try {
        let filePath;

        if (req.body.processOnly) {
            // File already saved via IPC - read from uploads dir
            filePath = path.join(uploadsDir, req.body.fileName);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found on server' });
            }
        } else if (req.body.fileData) {
            // Base64 upload fallback
            filePath = path.join(uploadsDir, `invoices_${Date.now()}.xlsx`);
            const buffer = Buffer.from(req.body.fileData.split(',')[1], 'base64');
            fs.writeFileSync(filePath, buffer);
        } else {
            return res.status(400).json({ error: 'No file data provided' });
        }

        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        console.log('Invoice Excel First Row:', data[0]);

        let addedCount = 0;
        let updatedCount = 0;

        // Group items by Bill_Number
        const invoiceMap = new Map();

        for (const row of data) {
            const billNumber = row['Bill_Number'] || row['Bill Number'] || row['Bill_No'];
            if (!billNumber) {
                continue;
            }

            if (!invoiceMap.has(billNumber)) {
                invoiceMap.set(billNumber, {
                    Bill_Number: String(billNumber),
                    Firm_Name: row['Firm_Name'] || row['Firm Name'] || row['Supplier'] || '',
                    Date: formatExcelDate(row['Date']),
                    Amount: row['Amount'] || row['Total'] || '0',
                    Category: row['Category'] || 'Hardware',
                    Items: []
                });
            }

            const hardwareItem = row['Hardware_Item'] || row['Hardware Item'] || row['Item'];
            if (hardwareItem) {
                invoiceMap.get(billNumber).Items.push({
                    Hardware_Item: hardwareItem,
                    Quantity: row['Quantity'] || row['Item_Qty'] || row['Qty'] || 1,
                    Warranty: row['Warranty'] || '',
                    Warranty_Upto: formatExcelDate(row['Warranty_Upto'] || row['Warranty Upto']),
                    Item_Details: row['Item_Details'] || row['Item Details'] || row['Details'] || '',
                    OEM_Software: row['OEM_Software'] || row['OEM Software'] || ''
                });
            }
        }

        await db.update((dbData) => {
            dbData.invoices = dbData.invoices || [];

            // Get max serial number for new invoices
            let maxSerial = 0;
            dbData.invoices.forEach(inv => {
                if (inv.Serial_Number) {
                    const num = parseInt(inv.Serial_Number, 10);
                    if (num > maxSerial) maxSerial = num;
                }
            });

            // Upsert invoices by Bill_Number
            for (const [billNumber, invoiceData] of invoiceMap) {
                const existingIndex = dbData.invoices.findIndex(inv => inv.Bill_Number === billNumber);
                if (existingIndex !== -1) {
                    // Update existing invoice, preserve id and Serial_Number
                    const existing = dbData.invoices[existingIndex];
                    Object.assign(dbData.invoices[existingIndex], {
                        ...invoiceData,
                        id: existing.id,
                        Serial_Number: existing.Serial_Number
                    });
                    updatedCount++;
                } else {
                    maxSerial++;
                    dbData.invoices.push({
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        Serial_Number: maxSerial,
                        ...invoiceData
                    });
                    addedCount++;
                }
            }
        });
        res.json({ message: `Bulk upload complete. Added ${addedCount} new, Updated ${updatedCount} existing invoices.` });

    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to process Excel file' });
    }
});

// --- Hardware Module ---

// 1. Hardware Configuration (Categories & Prefixes)
app.get('/api/hardware/config', async (req, res) => {
    try {
        await db.update((data) => {
            if (!data.hardwareConfig || data.hardwareConfig.length === 0) {
                data.hardwareConfig = [
                    { category: 'LAPTOP', prefix: 'L' },
                    { category: 'MONITOR', prefix: 'M' },
                    { category: 'CPU', prefix: 'C' },
                    { category: 'UPS', prefix: 'UPS' },
                    { category: 'HDD', prefix: 'HDD' },
                    { category: 'SERVER', prefix: 'SER' },
                    { category: 'AIO DESKTOP', prefix: 'AIOD' },
                    { category: 'LASER PRINTER', prefix: 'LP' }
                ];
            }
        });
        res.json(db.data.hardwareConfig);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to fetch hardware config' });
    }
});

app.post('/api/hardware/config', async (req, res) => {
    try {
        const { category, prefix } = req.body;
        const result = await db.update((data) => {
            data.hardwareConfig = data.hardwareConfig || [];
            if (data.hardwareConfig.find(c => c.category === category)) {
                return { error: 'Category already exists', status: 400 };
            }
            data.hardwareConfig.push({ category, prefix });
            return { success: true };
        });
        if (result.error) return res.status(result.status).json({ error: result.error });
        res.json({ message: 'Category Added' });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to add category' });
    }
});

// --- Capacity Configuration (Per Item Name) ---
const defaultCapacityConfig = [
    { Item_Name: 'AIO DESKTOP', Capacity: 'Core i5' },
    { Item_Name: 'CPU', Capacity: 'Core i3' },
    { Item_Name: 'CPU', Capacity: 'Core i5' },
    { Item_Name: 'CPU', Capacity: 'Ryzen 3' },
    { Item_Name: 'CPU', Capacity: 'Ryzen 5' },
    { Item_Name: 'LAPTOP', Capacity: 'Core i3' },
    { Item_Name: 'LAPTOP', Capacity: 'Core i5' },
    { Item_Name: 'LAPTOP', Capacity: 'Ryzen 5' },
    { Item_Name: 'LAPTOP', Capacity: 'Ryzen 7' },
    { Item_Name: 'LASER PRINTER', Capacity: 'AIO-6020NV' },
    { Item_Name: 'LASER PRINTER', Capacity: 'CANON IR2925 IND 230' },
    { Item_Name: 'LASER PRINTER', Capacity: 'CANON MFP-1440I' },
    { Item_Name: 'LASER PRINTER', Capacity: 'ECOSYS 5021CDN' },
    { Item_Name: 'LASER PRINTER', Capacity: 'ECOSYS M5526CDW' },
    { Item_Name: 'LASER PRINTER', Capacity: 'ECOSYS P2040DW' },
    { Item_Name: 'LASER PRINTER', Capacity: 'HP PRO M405DW' },
    { Item_Name: 'LASER PRINTER', Capacity: 'PRO MFP M329DW W1A24' },
    { Item_Name: 'MONITOR', Capacity: '19.5 INCH' },
    { Item_Name: 'MONITOR', Capacity: '21.5 INCH' },
    { Item_Name: 'PROJECTOR', Capacity: 'EB-FH54' },
    { Item_Name: 'UPS', Capacity: '10KVA' },
    { Item_Name: 'UPS', Capacity: '1KVA' },
    { Item_Name: 'UPS', Capacity: '600VA' },
    { Item_Name: 'UPS', Capacity: '650VA' }
];

// GET all capacity configs
app.get('/api/capacity/config', async (req, res) => {
    try {
        await db.update((data) => {
            if (!data.capacityConfig || data.capacityConfig.length === 0) {
                data.capacityConfig = [...defaultCapacityConfig];
            }
        });
        res.json(db.data.capacityConfig);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to fetch capacity config' });
    }
});

// POST add a new capacity entry
app.post('/api/capacity/config', async (req, res) => {
    try {
        const { Item_Name, Capacity } = req.body;
        if (!Item_Name || !Capacity) {
            return res.status(400).json({ error: 'Item Name and Capacity are required' });
        }
        const result = await db.update((data) => {
            data.capacityConfig = data.capacityConfig || [];
            if (data.capacityConfig.find(c => c.Item_Name === Item_Name && c.Capacity === Capacity)) {
                return { error: 'This capacity already exists for this item', status: 400 };
            }
            data.capacityConfig.push({ Item_Name: Item_Name.trim(), Capacity: Capacity.trim() });
            data.capacityConfig.sort((a, b) => a.Item_Name.localeCompare(b.Item_Name) || a.Capacity.localeCompare(b.Capacity));
            return { success: true };
        });
        if (result.error) return res.status(result.status).json({ error: result.error });
        res.json({ message: 'Capacity added' });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to add capacity' });
    }
});

// PUT edit a capacity entry
app.put('/api/capacity/config', async (req, res) => {
    try {
        const { Item_Name, oldCapacity, newCapacity } = req.body;
        if (!Item_Name || !oldCapacity || !newCapacity) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        const result = await db.update((data) => {
            data.capacityConfig = data.capacityConfig || [];
            const idx = data.capacityConfig.findIndex(c => c.Item_Name === Item_Name && c.Capacity === oldCapacity);
            if (idx === -1) {
                return { error: 'Capacity entry not found', status: 404 };
            }
            if (data.capacityConfig.find(c => c.Item_Name === Item_Name && c.Capacity === newCapacity)) {
                return { error: 'New capacity already exists for this item', status: 400 };
            }
            data.capacityConfig[idx].Capacity = newCapacity.trim();

            // Propagate change to hardware items
            let updatedCount = 0;
            const hardware = data.hardware || [];
            for (const hw of hardware) {
                if (hw.Item_Name === Item_Name && hw.Capacity === oldCapacity) {
                    hw.Capacity = newCapacity.trim();
                    updatedCount++;
                }
            }
            data.capacityConfig.sort((a, b) => a.Item_Name.localeCompare(b.Item_Name) || a.Capacity.localeCompare(b.Capacity));
            return { success: true, updatedCount };
        });
        if (result.error) return res.status(result.status).json({ error: result.error });
        res.json({ message: `Capacity renamed. ${result.updatedCount} hardware item(s) updated.`, updatedCount: result.updatedCount });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to update capacity' });
    }
});

// DELETE a capacity entry
app.delete('/api/capacity/config', async (req, res) => {
    try {
        const { Item_Name, Capacity } = req.body;
        if (!Item_Name || !Capacity) {
            return res.status(400).json({ error: 'Item Name and Capacity are required' });
        }
        const result = await db.update((data) => {
            data.capacityConfig = data.capacityConfig || [];
            const initialLen = data.capacityConfig.length;
            data.capacityConfig = data.capacityConfig.filter(c => !(c.Item_Name === Item_Name && c.Capacity === Capacity));
            return { deleted: data.capacityConfig.length < initialLen };
        });
        if (result.deleted) {
            res.json({ message: 'Capacity deleted' });
        } else {
            res.status(404).json({ error: 'Capacity entry not found' });
        }
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to delete capacity' });
    }
});

// --- Make Config (Company/Brand Names) ---
app.get('/api/make/config', async (req, res) => {
    try {
        await db.read();
        const defaultMakes = ['HP', 'Dell', 'Lenovo', 'Acer', 'ASUS', 'Samsung', 'LG', 'Apple', 'Microsoft', 'Toshiba', 'Sony', 'BenQ', 'ViewSonic', 'APC', 'Epson', 'Canon', 'Brother', 'Cisco', 'D-Link', 'TP-Link', 'Seagate', 'Western Digital', 'Kingston', 'Crucial', 'Intel', 'AMD'];
        const makes = db.data.makeConfig || defaultMakes;
        res.json(makes);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to fetch makes' });
    }
});

app.post('/api/make/config', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Company name is required' });
        }
        const result = await db.update((data) => {
            data.makeConfig = data.makeConfig || ['HP', 'Dell', 'Lenovo', 'Acer', 'ASUS', 'Samsung', 'LG'];
            if (data.makeConfig.includes(name.trim())) {
                return { error: 'Company already exists', status: 400 };
            }
            data.makeConfig.push(name.trim());
            data.makeConfig.sort();
            return { success: true, makes: data.makeConfig };
        });
        if (result.error) return res.status(result.status).json({ error: result.error });
        res.json({ message: 'Company added', makes: result.makes });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to add company' });
    }
});

app.delete('/api/make/config/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const result = await db.update((data) => {
            data.makeConfig = data.makeConfig || [];
            const index = data.makeConfig.indexOf(name);
            if (index === -1) {
                return { error: 'Company not found', status: 404 };
            }
            data.makeConfig.splice(index, 1);
            return { success: true, makes: data.makeConfig };
        });
        if (result.error) return res.status(result.status).json({ error: result.error });
        res.json({ message: 'Company deleted', makes: result.makes });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to delete company' });
    }
});

// --- Column Visibility Config ---
app.get('/api/column-visibility/config', async (req, res) => {
    try {
        await db.read();
        res.json(db.data.columnVisibility || {});
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to fetch column visibility config' });
    }
});

app.put('/api/column-visibility/config', async (req, res) => {
    try {
        const { category, hiddenColumns } = req.body;
        if (!category) return res.status(400).json({ error: 'Category is required' });

        await db.update((data) => {
            data.columnVisibility = data.columnVisibility || {};
            data.columnVisibility[category] = hiddenColumns || [];
        });
        res.json({ message: 'Column visibility updated', columnVisibility: db.data.columnVisibility });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to update column visibility' });
    }
});

// 2. Hardware CRUD
app.get('/api/hardware', async (req, res) => {
    await db.read();
    const { category } = req.query;
    let data = db.data.hardware || [];
    if (category) {
        const catUpper = category.toUpperCase();
        // Match by Category OR Item_Name (case-insensitive) to handle legacy data
        data = data.filter(item => {
            const itemCat = (item.Category || '').toUpperCase();
            const itemName = (item.Item_Name || '').toUpperCase();
            return itemCat === catUpper || itemName === catUpper;
        });

        // Auto-fix: correct Category field for items that only matched by Item_Name
        const itemsToFix = data.filter(item => (item.Category || '').toUpperCase() !== catUpper);
        if (itemsToFix.length > 0) {
            // Use atomic update to safely fix categories
            await db.update((dbData) => {
                for (const item of itemsToFix) {
                    const idx = dbData.hardware.findIndex(h => h.id === item.id);
                    if (idx !== -1) {
                        dbData.hardware[idx].Category = catUpper;
                        item.Category = catUpper;
                    }
                }
            });
        }
    }
    // Format date fields before sending
    const formattedData = data.map(item => ({
        ...item,
        AMC_Upto: formatExcelDate(item.AMC_Upto),
        Warranty_Upto: formatExcelDate(item.Warranty_Upto),
        Issued_Date: formatExcelDate(item.Issued_Date)
    }));
    res.json(formattedData);
});

// Helper: Generate Next EDP Serial
const generateEDPSerial = (hardwareList, prefix) => {
    // Standard prefixes per user requirement
    const standardPrefixes = {
        'LAPTOP': 'LAP',
        'MONITOR': 'M',
        'CPU': 'C',
        'UPS': 'UPS',
        'HDD': 'HDD',
        'SERVER': 'SER',
        'AIO DESKTOP': 'AIOD',
        'LASER PRINTER': 'LP'
    };

    // Use standard prefix if matches, otherwise use provided prefix
    const effectivePrefix = standardPrefixes[prefix] || standardPrefixes[prefix.toUpperCase()] || prefix;

    const regex = new RegExp(`^${effectivePrefix}(\\d+)$`);
    let maxNum = 0;
    hardwareList.forEach(item => {
        if (item.EDP_Serial) {
            const match = item.EDP_Serial.match(regex);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) maxNum = num;
            }
        }
    });

    let padding = 4;
    // 3 digits for HDD, SER, AIOD, LP as implied by examples (HDD001)
    if (['HDD', 'SER', 'AIOD', 'LP'].includes(effectivePrefix)) padding = 3;

    const nextNum = maxNum + 1;
    return `${effectivePrefix}${nextNum.toString().padStart(padding, '0')}`;
};

// GET next serial preview — lets frontend show the proposed serial for user confirmation
app.get('/api/hardware/next-serial', async (req, res) => {
    try {
        const { category } = req.query;
        if (!category) return res.status(400).json({ error: 'Category is required' });

        await db.read();
        db.data.hardware = db.data.hardware || [];
        db.data.hardwareConfig = db.data.hardwareConfig || [];

        const categoryUpper = category.toUpperCase();
        const standardPrefixes = {
            'LAPTOP': 'LAP', 'MONITOR': 'M', 'CPU': 'C', 'UPS': 'UPS',
            'HDD': 'HDD', 'SERVER': 'SER', 'AIO DESKTOP': 'AIOD', 'LASER PRINTER': 'LP'
        };

        let prefix = standardPrefixes[categoryUpper] || 'ITEM';
        if (!standardPrefixes[categoryUpper]) {
            const config = db.data.hardwareConfig.find(c => c.category.toUpperCase() === categoryUpper);
            if (config) prefix = config.prefix;
        }

        const proposedSerial = generateEDPSerial(db.data.hardware, prefix);
        res.json({ proposedSerial, prefix });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to generate serial preview' });
    }
});

app.post('/api/hardware', async (req, res) => {
    try {
        const items = Array.isArray(req.body) ? req.body : [req.body];
        const result = await db.update((data) => {
            data.hardware = data.hardware || [];
            data.hardwareConfig = data.hardwareConfig || [];

            const newItems = [];

            for (const item of items) {
                let prefix = 'ITEM';
                const categoryUpper = item.Category ? item.Category.toUpperCase() : '';

                const standardPrefixes = {
                    'LAPTOP': 'LAP',
                    'MONITOR': 'M',
                    'CPU': 'C',
                    'UPS': 'UPS',
                    'HDD': 'HDD',
                    'SERVER': 'SER',
                    'AIO DESKTOP': 'AIOD',
                    'LASER PRINTER': 'LP'
                };

                if (standardPrefixes[categoryUpper]) {
                    prefix = standardPrefixes[categoryUpper];
                } else {
                    const config = data.hardwareConfig.find(c => c.category.toUpperCase() === categoryUpper);
                    if (config) prefix = config.prefix;
                }

                const allCurrent = [...data.hardware, ...newItems];

                let edpSerial;
                if (item.EDP_Serial_Override) {
                    edpSerial = item.EDP_Serial_Override;
                    delete item.EDP_Serial_Override;
                } else if (newItems.length > 0 && newItems[0].EDP_Serial) {
                    const firstSerial = newItems[0].EDP_Serial;
                    const serialMatch = firstSerial.match(/^([A-Za-z]+)(\d+)$/);
                    if (serialMatch) {
                        const serialPrefix = serialMatch[1];
                        const serialNumStr = serialMatch[2];
                        const nextNum = parseInt(serialNumStr, 10) + newItems.length;
                        edpSerial = `${serialPrefix}${nextNum.toString().padStart(serialNumStr.length, '0')}`;
                    } else {
                        edpSerial = generateEDPSerial(allCurrent, prefix);
                    }
                } else {
                    edpSerial = generateEDPSerial(allCurrent, prefix);
                }

                const newItem = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    EDP_Serial: edpSerial,
                    Allocated_To: 'STOCK',
                    Issued_Date: '',
                    ...item
                };
                newItems.push(newItem);
            }

            data.hardware.push(...newItems);
            return { newItems };
        });
        res.json({ message: 'Hardware Added', generatedItems: result.newItems });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to add hardware' });
    }
});

// Get Hardware Allocation History (MUST be before generic :id routes)
app.get('/api/hardware/:id/history', async (req, res) => {
    try {
        const { id } = req.params;
        await db.read();
        const history = (db.data.allocationHistory || []).filter(h => h.hardware_id === id);
        console.log(`History request for hardware ID: ${id}, found ${history.length} records`);
        res.json(history);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

app.put('/api/hardware/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const result = await db.update((data) => {
            const index = data.hardware.findIndex(h => h.id === id);
            if (index !== -1) {
                data.hardware[index] = { ...data.hardware[index], ...updates };
                return { found: true, item: data.hardware[index] };
            }
            return { found: false };
        });
        if (result.found) {
            res.json(result.item);
        } else {
            res.status(404).json({ error: 'Item not found' });
        }
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Update failed' });
    }
});

app.delete('/api/hardware/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.update((data) => {
            const initialLen = data.hardware.length;
            data.hardware = data.hardware.filter(h => h.id !== id);
            return { deleted: data.hardware.length < initialLen };
        });
        if (result.deleted) {
            res.json({ message: 'Deleted' });
        } else {
            res.status(404).json({ error: 'Not found' });
        }
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// Bulk Delete Hardware
app.post('/api/hardware/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids)) return res.status(400).json({ error: 'Invalid IDs' });
        await db.update((data) => {
            data.hardware = data.hardware.filter(h => !ids.includes(h.id));
        });
        res.json({ message: 'Items deleted successfully' });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Bulk delete failed' });
    }
});

// Bulk Update Hardware (AMC & AMC Upto)
app.post('/api/hardware/bulk-update', async (req, res) => {
    try {
        const { ids, updates } = req.body;
        if (!Array.isArray(ids)) return res.status(400).json({ error: 'Invalid IDs' });
        await db.update((data) => {
            data.hardware = data.hardware.map(h => {
                if (ids.includes(h.id)) {
                    return { ...h, ...updates };
                }
                return h;
            });
        });
        res.json({ message: 'Items updated successfully' });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Bulk update failed' });
    }
});

// Wipe all hardware data (for fresh start)
app.delete('/api/hardware/wipe-all', async (req, res) => {
    try {
        const result = await db.update((data) => {
            const count = (data.hardware || []).length;
            data.hardware = [];
            data.allocationHistory = [];
            return { count };
        });
        res.json({ message: `Cleared ${result.count} hardware items and allocation history.` });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to wipe hardware data' });
    }
});

// Hardware Excel Upload (Native + Fallback) - v1.2.0
app.post('/api/hardware/upload', async (req, res) => {
    try {
        let filePath;

        if (req.body.processOnly) {
            // File already saved via IPC - read from uploads dir
            filePath = path.join(uploadsDir, req.body.fileName);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found on server' });
            }
        } else if (req.body.fileData) {
            // Base64 upload fallback
            filePath = path.join(uploadsDir, `hardware_${Date.now()}.xlsx`);
            const buffer = Buffer.from(req.body.fileData.split(',')[1], 'base64');
            fs.writeFileSync(filePath, buffer);
        } else {
            return res.status(400).json({ error: 'No file data provided' });
        }

        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        let addedCount = 0;
        let updatedCount = 0;

        const standardPrefixes = {
            'LAPTOP': 'LAP', 'MONITOR': 'M', 'CPU': 'C', 'UPS': 'UPS',
            'HDD': 'HDD', 'SERVER': 'SER', 'AIO DESKTOP': 'AIOD', 'LASER PRINTER': 'LP'
        };

        const defaultCategory = req.body.defaultCategory || '';

        await db.update((dbData) => {
            dbData.hardware = dbData.hardware || [];
            dbData.hardwareConfig = dbData.hardwareConfig || [];

            for (const row of data) {
                const category = row['Category'] || row['category'] || defaultCategory || 'UNKNOWN';
                const categoryUpper = category.toUpperCase();
                let prefix = standardPrefixes[categoryUpper] || 'ITEM';

                const existingEDP = row['EDP Serial'] || row['EDP_Serial'] || row['EDP serial'] || row['edp_serial'] || '';
                let edpSerial = existingEDP;

                if (!edpSerial) {
                    const regex = new RegExp(`^${prefix}(\\d+)$`);
                    let maxNum = 0;
                    dbData.hardware.forEach(item => {
                        if (item.EDP_Serial) {
                            const match = item.EDP_Serial.match(regex);
                            if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
                        }
                    });
                    const padding = ['HDD', 'SER', 'AIOD', 'LP'].includes(prefix) ? 3 : 4;
                    edpSerial = `${prefix}${(maxNum + 1 + addedCount).toString().padStart(padding, '0')}`;
                }

                const itemData = {
                    Category: categoryUpper,
                    Item_Name: row['Item Name'] || row['Item_Name'] || categoryUpper,
                    EDP_Serial: String(edpSerial),
                    Make: row['Make'] || '',
                    Capacity: row['Capacity'] || '',
                    RAM: row['RAM'] || '',
                    OS: row['OS'] || '',
                    Office: row['Office'] || '',
                    Speed: row['Speed'] || '',
                    IP: row['IP'] || '',
                    MAC: row['MAC'] || '',
                    Company_Serial: row['Company Serial'] || row['Company_Serial'] || '',
                    Bill_Number: row['Bill Number'] || row['Bill_Number'] || '',
                    Cost: row['Cost (Rs.)'] || row['Cost'] || '0',
                    AMC: row['AMC'] || 'No',
                    AMC_Upto: formatExcelDate(row['AMC Upto'] || row['AMC_Upto']),
                    Warranty_Upto: formatExcelDate(row['Warranty Upto'] || row['Warranty_Upto']),
                    Additional_Item: row['Additional Item'] || row['Additional_Item'] || '',
                    Status: row['Status'] || 'Working',
                    Remarks: row['Remarks'] || '',
                    Allocated_To: row['Allocated To'] || row['Allocated_To'] || 'STOCK',
                    Issued_Date: formatExcelDate(row['Issued Date'] || row['Issued_Date'])
                };

                const existingIndex = dbData.hardware.findIndex(h => h.EDP_Serial === String(edpSerial));
                if (existingIndex !== -1) {
                    const existing = dbData.hardware[existingIndex];
                    Object.assign(dbData.hardware[existingIndex], { ...itemData, id: existing.id });
                    updatedCount++;
                } else {
                    dbData.hardware.push({
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        ...itemData
                    });
                    addedCount++;
                }
            }
        });
        res.json({ message: `Bulk upload complete. Added ${addedCount} new, Updated ${updatedCount} existing items.` });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to process Excel file' });
    }
});

// Hardware Allocation Update
app.post('/api/hardware/allocate', async (req, res) => {
    try {
        const { id, PIN, Issued_Date, changedBy } = req.body;
        const result = await db.update((data) => {
            const index = data.hardware.findIndex(h => h.id === id);
            if (index === -1) return { found: false };

            const hardware = data.hardware[index];
            const previousAllocation = hardware.Allocated_To;

            // Update current allocation
            data.hardware[index].Allocated_To = PIN || 'STOCK';
            data.hardware[index].Issued_Date = Issued_Date || '';
            if (req.body.Issued_Location !== undefined) {
                data.hardware[index].Issued_Location = req.body.Issued_Location || '';
            }

            // Log to history
            data.allocationHistory = data.allocationHistory || [];
            data.allocationHistory.push({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                hardware_id: id,
                EDP_Serial: hardware.EDP_Serial,
                Item_Name: hardware.Item_Name,
                from_PIN: previousAllocation,
                to_PIN: PIN || 'STOCK',
                issued_date: Issued_Date || '',
                changed_at: new Date().toISOString(),
                changed_by: changedBy || 'System'
            });

            // Cap history to 5 records for this hardware item
            const hardwareHistory = data.allocationHistory.filter(h => h.hardware_id === id);
            if (hardwareHistory.length > 5) {
                const numToRemove = hardwareHistory.length - 5;
                const idsToRemove = hardwareHistory
                    .sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at))
                    .slice(0, numToRemove)
                    .map(h => h.id);
                data.allocationHistory = data.allocationHistory.filter(h => !idsToRemove.includes(h.id));
            }

            return { found: true, item: data.hardware[index] };
        });

        if (result.found) {
            res.json({ message: 'Allocation updated', item: result.item });
        } else {
            res.status(404).json({ error: 'Item not found' });
        }
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Allocation failed' });
    }
});



// Hardware Excel Download
app.get('/api/hardware/download', async (req, res) => {
    try {
        await db.read();
        const { category } = req.query;
        const invoices = db.data.invoices || [];
        let data = db.data.hardware || [];

        // Filter by category if specified
        if (category) data = data.filter(h => h.Category === category);

        // Map to Excel-friendly format with readable column headers
        const excelData = data.map(item => {
            const invoice = invoices.find(inv => inv.Bill_Number === item.Bill_Number);

            return {
                'Category': item.Category,
                'Item Name': item.Item_Name,
                'EDP Serial': item.EDP_Serial,
                'Make': item.Make || '',
                'Capacity': item.Capacity || '',
                'RAM': item.RAM || '',
                'OS': item.OS || '',
                'Office': item.Office || '',
                'Speed': item.Speed || '',
                'IP': item.IP || '',
                'MAC': item.MAC || '',
                'Company Serial': item.Company_Serial || '',
                'Bill Number': item.Bill_Number || '',
                'Purchase Date': invoice?.Date || '',
                'Cost (Rs.)': item.Cost || '',
                'AMC': item.AMC || 'No',
                'AMC Upto': item.AMC === 'Yes' ? item.AMC_Upto || '' : '',
                'Warranty Upto': item.Warranty_Upto || '',
                'Additional Item': item.Additional_Item || '',
                'Status': item.Status || 'Working',
                'Remarks': item.Remarks || '',
                'Allocated To': item.Allocated_To || 'STOCK',
                'Issued Date': item.Issued_Date || ''
            };
        });

        const worksheet = xlsx.utils.json_to_sheet(excelData);
        const workbook = xlsx.utils.book_new();
        const sheetName = category || 'Hardware';
        xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        const filename = category ? `${category}_hardware.xlsx` : 'all_hardware.xlsx';
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Hardware Excel Download (Buffer for Native Save) - v1.2.0
app.get('/api/hardware/download-buffer', async (req, res) => {
    try {
        await db.read();
        const { category } = req.query;
        const invoices = db.data.invoices || [];
        const employees = db.data.employees || [];
        let data = db.data.hardware || [];

        if (category) data = data.filter(h => h.Category === category);



        const excelData = data.map(item => {
            const invoice = invoices.find(inv => inv.Bill_Number === item.Bill_Number);
            const emp = employees.find(e => normalizePin(e.PIN) === normalizePin(item.Allocated_To));
            return {
                'Category': item.Category,
                'Item Name': item.Item_Name,
                'EDP Serial': item.EDP_Serial,
                'Make': item.Make || '',
                'Capacity': item.Capacity || '',
                'RAM': item.RAM || '',
                'OS': item.OS || '',
                'Office': item.Office || '',
                'Speed': item.Speed || '',
                'IP': item.IP || '',
                'MAC': item.MAC || '',
                'Company Serial': item.Company_Serial || '',
                'Bill Number': item.Bill_Number || '',
                'Purchase Date': invoice?.Date || '',
                'Cost (Rs.)': item.Cost || '',
                'AMC': item.AMC || 'No',
                'AMC Upto': item.AMC === 'Yes' ? item.AMC_Upto || '' : '',
                'Warranty Upto': item.Warranty_Upto || '',
                'Additional Item': item.Additional_Item || '',
                'Status': item.Status || 'Working',
                'Remarks': item.Remarks || '',
                'Allocated To (PIN)': item.Allocated_To || 'STOCK',
                'Employee Name': emp?.Name || (item.Allocated_To === 'STOCK' || !item.Allocated_To ? 'STOCK' : ''),
                'Post': emp?.Present_Post || '',
                'Wing': emp?.Wing || '',
                'Issued Date': item.Issued_Date || ''
            };
        });

        const worksheet = xlsx.utils.json_to_sheet(excelData);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, category || 'Hardware');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.json({ buffer: Array.from(buffer) });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// AMC Excel Download
app.post('/api/amc/download-buffer', async (req, res) => {
    try {
        const { data } = req.body;
        const worksheet = xlsx.utils.json_to_sheet(data);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'AMC');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.json({ buffer: Array.from(buffer) });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Download failed' });
    }
});

app.post('/api/amc/download', async (req, res) => {
    try {
        const { data } = req.body;
        const worksheet = xlsx.utils.json_to_sheet(data);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'AMC');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="amc.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Allocation Excel Download (with employee details)
app.get('/api/allocation/download', async (req, res) => {
    try {
        await db.read();
        const hardware = db.data.hardware || [];
        const employees = db.data.employees || [];
        const invoices = db.data.invoices || [];



        // Create enriched data with employee and invoice details
        const enrichedData = hardware.map(h => {
            const emp = employees.find(e => normalizePin(e.PIN) === normalizePin(h.Allocated_To));
            const inv = invoices.find(i => i.Bill_Number === h.Bill_Number);

            return {
                'Item Name': h.Item_Name,
                'EDP Serial': h.EDP_Serial,
                'PIN': h.Allocated_To,
                'Employee Name': emp?.Name || (h.Allocated_To === 'STOCK' ? 'STOCK' : ''),
                'Present Post': emp?.Present_Post || '',
                'Wing': emp?.Wing || '',
                'Issued Date': formatDateDDMMYYYY(h.Issued_Date),
                'Issued Location': h.Issued_Location || '',
                'Make': h.Make,
                'Company Serial': h.Company_Serial,
                'Bill Number': h.Bill_Number,
                'Purchased Date': formatDateDDMMYYYY(inv?.Date),
                'Cost': h.Cost,
                'Status': h.Status || 'Working'
            };
        });

        const worksheet = xlsx.utils.json_to_sheet(enrichedData);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Allocation');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="hardware_allocation.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Allocation Download Buffer (for Native Save) - v1.2.0
app.get('/api/allocation/download-buffer', async (req, res) => {
    try {
        await db.read();
        const hardware = db.data.hardware || [];
        const employees = db.data.employees || [];
        const invoices = db.data.invoices || [];



        const enrichedData = hardware.map(h => {
            const emp = employees.find(e => normalizePin(e.PIN) === normalizePin(h.Allocated_To));
            const inv = invoices.find(i => i.Bill_Number === h.Bill_Number);
            return {
                'Item Name': h.Item_Name,
                'EDP Serial': h.EDP_Serial,
                'PIN': h.Allocated_To,
                'Employee Name': emp?.Name || (h.Allocated_To === 'STOCK' ? 'STOCK' : ''),
                'Present Post': emp?.Present_Post || '',
                'Wing': emp?.Wing || '',
                'Issued Date': formatDateDDMMYYYY(h.Issued_Date),
                'Issued Location': h.Issued_Location || '',
                'Make': h.Make,
                'Company Serial': h.Company_Serial,
                'Bill Number': h.Bill_Number,
                'Purchased Date': formatDateDDMMYYYY(inv?.Date),
                'Cost': h.Cost,
                'Status': h.Status || 'Working'
            };
        });

        const worksheet = xlsx.utils.json_to_sheet(enrichedData);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Allocation');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.json({ buffer: Array.from(buffer) });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Allocation Excel Upload (Base64)
app.post('/api/allocation/upload', async (req, res) => {
    try {
        const { fileData, changedBy } = req.body;
        if (!fileData) return res.status(400).json({ error: 'No file uploaded' });

        const buffer = Buffer.from(fileData.split(',')[1], 'base64');
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        const result = await db.update((dataObj) => {
            let updated = 0;
            let skipped = 0;

            for (const row of data) {
                const edpSerial = row['EDP Serial'];
                const newPIN = row['PIN'];
                const issuedDate = formatExcelDate(row['Issued Date']);

                if (!edpSerial) { skipped++; continue; }

                const index = dataObj.hardware.findIndex(h => h.EDP_Serial === edpSerial);
                if (index !== -1) {
                    const hardware = dataObj.hardware[index];
                    const previousAllocation = hardware.Allocated_To;

                    // Update allocation
                    dataObj.hardware[index].Allocated_To = newPIN || 'STOCK';
                    dataObj.hardware[index].Issued_Date = issuedDate || '';

                    // Log to history
                    dataObj.allocationHistory = dataObj.allocationHistory || [];
                    dataObj.allocationHistory.push({
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        hardware_id: hardware.id,
                        EDP_Serial: hardware.EDP_Serial,
                        Item_Name: hardware.Item_Name,
                        from_PIN: previousAllocation,
                        to_PIN: newPIN || 'STOCK',
                        issued_date: issuedDate || '',
                        changed_at: new Date().toISOString(),
                        changed_by: changedBy || 'System'
                    });

                    // Cap history to 5 records for this hardware item
                    const hardwareHistory = dataObj.allocationHistory.filter(h => h.hardware_id === hardware.id);
                    if (hardwareHistory.length > 5) {
                        const numToRemove = hardwareHistory.length - 5;
                        const idsToRemove = hardwareHistory
                            .sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at))
                            .slice(0, numToRemove)
                            .map(h => h.id);
                        dataObj.allocationHistory = dataObj.allocationHistory.filter(h => !idsToRemove.includes(h.id));
                    }

                    updated++;
                } else {
                    skipped++;
                }
            }
            return { updated, skipped };
        });

        res.json({ message: `Bulk upload complete. Updated ${result.updated}, Skipped ${result.skipped}.` });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Bulk upload failed' });
    }
});


// --- Employees Module ---

// 1. Employee Configuration (Dropdown Lists)
app.get('/api/employees/config', async (req, res) => {
    await db.read();
    res.json(db.data.employeeConfig || {});
});

app.post('/api/employees/config', async (req, res) => {
    try {
        const { type, values } = req.body; // type: posts | sections | wings | offices
        const allowedTypes = ['posts', 'sections', 'wings', 'offices'];
        if (!allowedTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid config type' });
        }
        await db.update((data) => {
            data.employeeConfig = data.employeeConfig || {};
            data.employeeConfig[type] = values;
        });
        res.json({ message: 'Configuration updated' });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to update config' });
    }
});

// Rename a config value and propagate to all employees
app.put('/api/employees/config/rename', async (req, res) => {
    try {
        const { type, oldValue, newValue } = req.body;
        const allowedTypes = ['posts', 'sections', 'wings', 'offices'];
        if (!allowedTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid config type' });
        }
        if (!oldValue || !newValue || oldValue === newValue) {
            return res.status(400).json({ error: 'Invalid rename values' });
        }

        const result = await db.update((data) => {
            data.employeeConfig = data.employeeConfig || {};

            // Rename in config list
            const items = data.employeeConfig[type] || [];
            const idx = items.indexOf(oldValue);
            if (idx === -1) {
                return { error: 'Value not found in config', status: 404 };
            }
            if (items.includes(newValue)) {
                return { error: 'New value already exists', status: 400 };
            }
            items[idx] = newValue;
            data.employeeConfig[type] = items;

            // Map config type to employee field name
            const fieldMap = {
                posts: 'Present_Post',
                sections: 'Section',
                wings: 'Wing',
                offices: 'Office'
            };
            const field = fieldMap[type];

            // Propagate rename to all employees
            let updatedCount = 0;
            const employees = data.employees || [];
            for (const emp of employees) {
                if (emp[field] === oldValue) {
                    emp[field] = newValue;
                    updatedCount++;
                }
            }
            return { updatedCount, success: true };
        });

        if (!result.success) {
            return res.status(result.status).json({ error: result.error });
        }

        res.json({ message: `Renamed "${oldValue}" to "${newValue}". ${result.updatedCount} employee(s) updated.`, updatedCount: result.updatedCount });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to rename config value' });
    }
});

// 2. Employees CRUD
app.get('/api/employees', async (req, res) => {
    await db.read();
    const employees = db.data.employees || [];



    // Normalize field names for consistent frontend display
    const normalizedEmployees = employees.map(emp => ({
        id: emp.id,
        PIN: emp.PIN || emp['PIN'] || '',
        Name: emp.Name || emp['Name'] || '',
        Present_Post: emp.Present_Post || emp['Present Post'] || emp['PresentPost'] || emp['Post'] || '',
        Section: emp.Section || emp['Section'] || '',
        Wing: emp.Wing || emp['Wing'] || '',
        Office: emp.Office || emp['Office'] || '',
        Email: emp.Email || emp['Email'] || '',
        Mobile: emp.Mobile || emp['Mobile'] || emp['Phone'] || '',
        Hqr_Field: emp.Hqr_Field || emp['Hqr_Field'] || emp['Hqr/Field'] || emp['HqrField'] || emp['Hqr Field'] || '',
        DOB: formatExcelDate(emp.DOB || emp['DOB'] || emp['Date of Birth']),
        Retirement_Date: formatExcelDate(emp.Retirement_Date || emp['Retirement_Date'] || emp['Retirement Date'] || emp['Retirement'])
    }));

    res.json(normalizedEmployees);
});

app.post('/api/employees', async (req, res) => {
    try {
        const employee = req.body;
        const result = await db.update((data) => {
            data.employees = data.employees || [];

            // Check unique PIN
            if (data.employees.find(e => e.PIN === employee.PIN)) {
                return { error: 'Employee with this PIN already exists', status: 400 };
            }

            data.employees.push({
                id: Date.now().toString(),
                ...employee
            });
            return { success: true };
        });

        if (!result.success) {
            return res.status(result.status).json({ error: result.error });
        }

        res.status(201).json({ message: 'Employee added successfully', employee });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to add employee' });
    }
});

app.put('/api/employees/:pin', async (req, res) => {
    try {
        const { pin } = req.params;
        const updates = req.body;
        const result = await db.update((data) => {
            const index = data.employees.findIndex(e => String(e.PIN) === String(pin) || String(e.id) === String(pin));
            if (index !== -1) {
                data.employees[index] = { ...data.employees[index], ...updates };
                return { found: true, item: data.employees[index] };
            }
            return { found: false };
        });
        
        if (result.found) {
            res.json(result.item);
        } else {
            res.status(404).json({ error: 'Employee not found' });
        }
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Update failed' });
    }
});

app.delete('/api/employees/:pin', async (req, res) => {
    try {
        const { pin } = req.params;
        const result = await db.update((data) => {
            const initialLen = data.employees.length;
            // Match by either ID or PIN using String comparison
            data.employees = data.employees.filter(e =>
                String(e.id) !== String(pin) && String(e.PIN) !== String(pin)
            );
            return { deleted: data.employees.length < initialLen };
        });

        if (result.deleted) {
            res.json({ message: 'Employee deleted' });
        } else {
            res.status(404).json({ error: 'Employee not found' });
        }
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// 3. Employee Excel Bulk
app.post('/api/employees/upload', memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        const result = await db.update((dbData) => {
            dbData.employees = dbData.employees || [];
            let added = 0;
            let updated = 0;

            for (const row of data) {
                const normalizedRow = {
                    PIN: row.PIN || row['PIN'] || '',
                    Name: row.Name || row['Name'] || '',
                    Present_Post: row.Present_Post || row['Present Post'] || row['PresentPost'] || '',
                    Wing: row.Wing || row['Wing'] || '',
                    Office: row.Office || row['Office'] || '',
                    Email: row.Email || row['Email'] || '',
                    Mobile: row.Mobile || row['Mobile'] || row['Phone'] || '',
                    Hqr_Field: row.Hqr_Field || row['Hqr_Field'] || row['Hqr/Field'] || row['HqrField'] || row['Hqr Field'] || '',
                    DOB: row.DOB || row['DOB'] || row['Date of Birth'] || '',
                    Retirement_Date: row.Retirement_Date || row['Retirement_Date'] || row['Retirement Date'] || row['Retirement'] || ''
                };

                if (!normalizedRow.PIN || !normalizedRow.Name) { continue; }

                // Upsert: update if exists by PIN, insert if new
                const existingIndex = dbData.employees.findIndex(e => String(e.PIN) === String(normalizedRow.PIN));
                if (existingIndex !== -1) {
                    const existing = dbData.employees[existingIndex];
                    Object.assign(dbData.employees[existingIndex], { ...normalizedRow, id: existing.id });
                    updated++;
                } else {
                    dbData.employees.push({ id: Date.now().toString() + added, ...normalizedRow });
                    added++;
                }
            }
            return { added, updated };
        });
        res.json({ message: `Bulk upload complete. Added ${result.added} new, Updated ${result.updated} existing employees.` });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Bulk upload failed' });
    }
});

app.get('/api/employees/download', async (req, res) => {
    try {
        await db.read();
        const rawData = db.data.employees || [];
        
        // Helper to convert dates to DD-MM-YYYY text so Excel does not show whole numbers
        const formatForExcel = (dateStr) => {
            if (!dateStr) return '';
            const num = Number(dateStr);
            if (!isNaN(num) && num > 10000 && num < 90000) {
                // If it's an Excel serial date, convert to DD-MM-YYYY
                const date = new Date(Math.round((num - 25569) * 86400 * 1000));
                return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
            }
            // If it's YYYY-MM-DD string
            const parts = String(dateStr).split('-');
            if (parts.length === 3 && parts[0].length === 4) {
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
            return dateStr;
        };

        // Exclude the 'Section' field from downloaded JSON
        const data = rawData.map(emp => {
            const { Section, ...rest } = emp;
            if (rest.DOB) rest.DOB = formatForExcel(rest.DOB);
            if (rest.Retirement_Date) rest.Retirement_Date = formatForExcel(rest.Retirement_Date);
            if (rest['Date of Birth']) rest['Date of Birth'] = formatForExcel(rest['Date of Birth']);
            if (rest['Retirement Date']) rest['Retirement Date'] = formatForExcel(rest['Retirement Date']);
            if (rest['Retirement']) rest['Retirement'] = formatForExcel(rest['Retirement']);
            return rest;
        });
        const worksheet = xlsx.utils.json_to_sheet(data);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Employees');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="employees.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Download failed' });
    }
});


// --- E-Waste Module ---

// Get all E-Waste years
app.get('/api/ewaste/years', async (req, res) => {
    try {
        await db.read();
        res.json(db.data.ewasteYears || []);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to fetch years' });
    }
});

// Create new E-Waste year
app.post('/api/ewaste/years', async (req, res) => {
    try {
        const { year } = req.body;
        const result = await db.update((data) => {
            data.ewasteYears = data.ewasteYears || [];

            if (data.ewasteYears.find(y => y.year === year)) {
                return { error: 'E-Waste year already exists', status: 400 };
            }

            const newYear = {
                year,
                created_at: new Date().toISOString(),
                isCompleted: false,
                completionDoc: '',
                completedAt: ''
            };

            data.ewasteYears.push(newYear);
            return { success: true, newYear };
        });

        if (!result.success) {
            return res.status(result.status).json({ error: result.error });
        }

        res.status(201).json({ message: 'E-Waste year created', year: result.newYear });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to create year' });
    }
});

// Get specific year details
app.get('/api/ewaste/years/:year', async (req, res) => {
    try {
        const { year } = req.params;
        await db.read();
        const yearData = db.data.ewasteYears?.find(y => y.year === year);
        if (yearData) {
            res.json(yearData);
        } else {
            res.status(404).json({ error: 'Year not found' });
        }
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to fetch year' });
    }
});

// Mark year as completed
app.post('/api/ewaste/years/:year/complete', upload.single('document'), async (req, res) => {
    try {
        const { year } = req.params;
        const result = await db.update((data) => {
            const yearIndex = data.ewasteYears?.findIndex(y => y.year === year);
            if (yearIndex === -1 || yearIndex === undefined) {
                return { error: 'Year not found', status: 404 };
            }

            data.ewasteYears[yearIndex].isCompleted = true;
            data.ewasteYears[yearIndex].completedAt = new Date().toISOString();
            if (req.file) {
                data.ewasteYears[yearIndex].completionDoc = req.file.filename; // Store the filename
            }

            const ewasteItems = (data.ewasteItems || []).filter(item => item.year === year);
            const hardwareIdsToRemove = ewasteItems.map(item => item.hardware_id);

            data.hardware = (data.hardware || []).filter(h => !hardwareIdsToRemove.includes(h.id));
            return { success: true };
        });

        if (!result.success) {
            return res.status(result.status).json({ error: result.error });
        }

        res.json({ message: 'E-Waste year marked as completed and hardware removed' });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to complete year' });
    }
});

// Download E-Waste completion document
app.get('/api/ewaste/years/:year/document', async (req, res) => {
    try {
        const { year } = req.params;
        await db.read();

        const yearData = db.data.ewasteYears?.find(y => y.year === year);
        if (!yearData || !yearData.completionDoc) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const filePath = path.join(uploadsDir, yearData.completionDoc);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        res.download(filePath);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to download document' });
    }
});

// Delete E-Waste year
app.delete('/api/ewaste/years/:year', async (req, res) => {
    try {
        const { year } = req.params;
        const result = await db.update((data) => {
            const yearIndex = data.ewasteYears?.findIndex(y => y.year === year);
            if (yearIndex === -1 || yearIndex === undefined) {
                return { error: 'Year not found', status: 404 };
            }

            // Delete associated items
            data.ewasteItems = (data.ewasteItems || []).filter(item => item.year !== year);

            // Delete the year
            data.ewasteYears.splice(yearIndex, 1);
            return { success: true };
        });

        if (!result.success) {
            return res.status(result.status).json({ error: result.error });
        }
        res.json({ message: 'E-Waste year deleted successfully' });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to delete year' });
    }
});

// Get items for specific year
app.get('/api/ewaste/:year/items', async (req, res) => {
    try {
        const { year } = req.params;
        await db.read();
        const items = (db.data.ewasteItems || []).filter(item => item.year === year);
        res.json(items);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

// Add hardware to E-Waste
app.post('/api/ewaste/:year/items', async (req, res) => {
    try {
        const { year } = req.params;
        const { hardware_ids } = req.body;

        const result = await db.update((data) => {
            data.ewasteItems = data.ewasteItems || [];

            const invoices = data.invoices || [];
            const addedItems = [];

            for (const hwId of hardware_ids) {
                const hardware = data.hardware?.find(h => h.id === hwId);
                if (hardware) {
                    const invoice = invoices.find(inv => inv.Bill_Number === hardware.Bill_Number);

                    const ewasteItem = {
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        year,
                        hardware_id: hardware.id,
                        ...hardware,
                        date_of_purchase: invoice?.Date || '',
                        added_at: new Date().toISOString()
                    };

                    data.ewasteItems.push(ewasteItem);
                    addedItems.push(ewasteItem);
                }
            }
            return { addedItems };
        });

        res.json({ message: `${result.addedItems.length} items added to E-Waste`, items: result.addedItems });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to add items' });
    }
});

// Remove item from E-Waste
app.delete('/api/ewaste/:year/items/:id', async (req, res) => {
    try {
        const { year, id } = req.params;
        const result = await db.update((data) => {
            const initialLen = data.ewasteItems?.length || 0;
            data.ewasteItems = (data.ewasteItems || []).filter(item => !(item.id === id && item.year === year));
            return { deleted: data.ewasteItems.length < initialLen };
        });

        if (result.deleted) {
            res.json({ message: 'Item removed from E-Waste' });
        } else {
            res.status(404).json({ error: 'Item not found' });
        }
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to remove item' });
    }
});

// Get 6+ year old hardware suggestions
app.get('/api/ewaste/suggestions', async (req, res) => {
    try {
        await db.read();
        const hardware = db.data.hardware || [];
        const invoices = db.data.invoices || [];
        const ewasteItems = db.data.ewasteItems || [];

        const ewasteHardwareIds = ewasteItems.map(item => item.hardware_id);

        const suggestions = [];
        const sixYearsAgo = new Date();
        sixYearsAgo.setFullYear(sixYearsAgo.getFullYear() - 6);

        for (const hw of hardware) {
            if (ewasteHardwareIds.includes(hw.id)) continue;

            const invoice = invoices.find(inv => inv.Bill_Number === hw.Bill_Number);
            if (invoice && invoice.Date) {
                const purchaseDate = new Date(invoice.Date);
                if (purchaseDate <= sixYearsAgo) {
                    suggestions.push({
                        ...hw,
                        date_of_purchase: invoice.Date
                    });
                }
            }
        }

        res.json(suggestions);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to get suggestions' });
    }
});

// Dashboard statistics
app.get('/api/ewaste/dashboard', async (req, res) => {
    try {
        await db.read();
        const years = db.data.ewasteYears || [];
        const items = db.data.ewasteItems || [];

        const dashboard = years.map(year => {
            const yearItems = items.filter(item => item.year === year.year);
            return {
                ...year,
                itemCount: yearItems.length
            };
        });

        res.json(dashboard);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
});

// Category breakdown for specific year
app.get('/api/ewaste/:year/breakdown', async (req, res) => {
    try {
        const { year } = req.params;
        await db.read();
        const items = (db.data.ewasteItems || []).filter(item => item.year === year);

        const breakdown = {};
        items.forEach(item => {
            const category = item.Category || 'Unknown';
            breakdown[category] = (breakdown[category] || 0) + 1;
        });

        res.json(breakdown);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to get breakdown' });
    }
});

// Download E-Waste Excel
app.get('/api/ewaste/:year/download', async (req, res) => {
    try {
        const { year } = req.params;
        await db.read();
        const items = (db.data.ewasteItems || []).filter(item => item.year === year);

        const formatDateHelper = (val) => {
            if (!val && val !== 0) return '-';
            const str = String(val).trim();
            if (!str) return '-';
            if (typeof val === 'number' || /^\d+$/.test(str)) {
                const num = Number(str);
                if (num > 10000 && num < 100000) {
                    const date = new Date((num - 25569) * 86400 * 1000);
                    const dd = String(date.getUTCDate()).padStart(2, '0');
                    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
                    const yyyy = date.getUTCFullYear();
                    return `${dd}-${mm}-${yyyy}`;
                }
            }
            const parsed = new Date(str);
            if (!isNaN(parsed.getTime())) {
                const dd = String(parsed.getDate()).padStart(2, '0');
                const mm = String(parsed.getMonth() + 1).padStart(2, '0');
                const yyyy = parsed.getFullYear();
                return `${dd}-${mm}-${yyyy}`;
            }
            return str;
        };

        const exportData = items.map(item => ({
            'Item Name': item.Item_Name,
            'EDP Serial': item.EDP_Serial,
            'Date of Purchase': formatDateHelper(item.date_of_purchase),
            'Bill Number': item.Bill_Number,
            'Cost': item.Cost,
            'Make': item.Make,
            'Capacity': item.Capacity,
            'RAM': item.RAM,
            'OS': item.OS,
            'Office': item.Office,
            'Speed': item.Speed,
            'IP': item.IP,
            'MAC': item.MAC,
            'Company Serial': item.Company_Serial,
            'Additional Items': item.Additional_Item,
            'Status': item.Status,
            'AMC': item.AMC,
            'AMC Upto': item.AMC_Upto,
            'Remarks': item.Remarks
        }));

        const headers = [
            'Item Name', 'EDP Serial', 'Date of Purchase', 'Bill Number', 'Cost',
            'Make', 'Capacity', 'RAM', 'OS', 'Office', 'Speed', 'IP', 'MAC',
            'Company Serial', 'Additional Items', 'Status', 'AMC', 'AMC Upto', 'Remarks'
        ];

        let worksheet;
        if (exportData.length > 0) {
            worksheet = xlsx.utils.json_to_sheet(exportData, { header: headers });
        } else {
            // Empty data — create sheet with just headers
            worksheet = xlsx.utils.aoa_to_sheet([headers]);
        }
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, `E-Waste ${year}`);
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', `attachment; filename="ewaste_${year}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Download E-Waste Report Excel (Depreciation)
app.get('/api/ewaste/:year/report/download', async (req, res) => {
    try {
        const { year } = req.params;
        const refDateParam = req.query.refDate;
        const refDate = refDateParam ? new Date(refDateParam) : new Date();
        
        await db.read();
        const items = (db.data.ewasteItems || []).filter(item => item.year === year);

        // Grouping variables
        const grouped = {};
        let grandTotalCount = 0;
        let grandTotalCost = 0;
        let grandTotalBookValue = 0;

        items.forEach(item => {
            const cost = parseFloat(item.Cost) || 0;
            let dateObj = null;

            // Parse Date of Purchase safely
            const dateVal = item.date_of_purchase;
            if (dateVal) {
                const str = String(dateVal).trim();
                if (typeof dateVal === 'number' || /^\d+$/.test(str)) {
                    const num = Number(str);
                    if (num > 10000 && num < 100000) {
                        dateObj = new Date((num - 25569) * 86400 * 1000);
                    }
                } else {
                    const parsed = new Date(str);
                    if (!isNaN(parsed.getTime())) dateObj = parsed;
                }
            }

            let yop = '-';
            let remainingPct = 0;
            let bookValue = 0;

            if (dateObj) {
                yop = dateObj.getFullYear();
                const diffMs = refDate.getTime() - dateObj.getTime();
                const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
                const completedYears = Math.floor(Math.max(0, diffYears));
                remainingPct = 100 * Math.pow(0.6, completedYears);
                bookValue = cost * (remainingPct / 100);
            }

            const itemName = item.Item_Name || 'Unknown Item';
            const remainingPctStr = remainingPct.toFixed(4) + '%';
            const subGroupKey = `${yop}_${remainingPctStr}`;

            if (!grouped[itemName]) grouped[itemName] = {};
            if (!grouped[itemName][subGroupKey]) {
                grouped[itemName][subGroupKey] = {
                    count: 0,
                    yop: yop,
                    cost: 0,
                    remainingPctStr: remainingPctStr,
                    bookValue: 0
                };
            }

            grouped[itemName][subGroupKey].count += 1;
            grouped[itemName][subGroupKey].cost += cost;
            grouped[itemName][subGroupKey].bookValue += bookValue;

            grandTotalCount += 1;
            grandTotalCost += cost;
            grandTotalBookValue += bookValue;
        });

        const exportData = [];

        Object.keys(grouped).sort().forEach(itemName => {
            let itemTotalCount = 0;
            let itemTotalCost = 0;
            let itemTotalBookValue = 0;
            let index = 1; // Reset index per item name

            Object.keys(grouped[itemName]).forEach((subGroupKey) => {
                const sg = grouped[itemName][subGroupKey];
                exportData.push({
                    'ITEM NO.': index++,
                    'ITEM NAME': itemName,
                    'QUANTITY': sg.count,
                    'YEAR OF PURCHASE': sg.yop,
                    'COST (₹)': sg.cost.toFixed(2),
                    'REMAINING VALUE (%)': sg.remainingPctStr,
                    'BOOK VALUE (₹)': sg.bookValue.toFixed(4)
                });
                itemTotalCount += sg.count;
                itemTotalCost += sg.cost;
                itemTotalBookValue += sg.bookValue;
            });

            // Subtotal Row
            exportData.push({
                'ITEM NO.': '',
                'ITEM NAME': `${itemName} Total`,
                'QUANTITY': itemTotalCount,
                'YEAR OF PURCHASE': '',
                'COST (₹)': itemTotalCost.toFixed(2),
                'REMAINING VALUE (%)': '',
                'BOOK VALUE (₹)': itemTotalBookValue.toFixed(4)
            });
        });

        // Grand Total Row
        exportData.push({
            'ITEM NO.': '',
            'ITEM NAME': 'Grand Total',
            'QUANTITY': grandTotalCount,
            'YEAR OF PURCHASE': '',
            'COST (₹)': grandTotalCost.toFixed(2),
            'REMAINING VALUE (%)': '',
            'BOOK VALUE (₹)': grandTotalBookValue.toFixed(4)
        });

        const headers = [
            'ITEM NO.', 'ITEM NAME', 'QUANTITY', 'YEAR OF PURCHASE', 'COST (₹)', 'REMAINING VALUE (%)', 'BOOK VALUE (₹)'
        ];

        let worksheet;
        if (exportData.length > 0) {
            worksheet = xlsx.utils.json_to_sheet(exportData, { header: headers });
        } else {
            worksheet = xlsx.utils.aoa_to_sheet([headers]);
        }
        
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, `E-Waste Report ${year}`);
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', `attachment; filename="ewaste_report_${year}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Report Download failed' });
    }
});

// Upload E-Waste Excel (Native + Base64 Fallback)
app.post('/api/ewaste/:year/upload', async (req, res) => {
    try {
        const { year } = req.params;
        let filePath;

        if (req.body.processOnly) {
            // File already saved via IPC - read from uploads dir
            filePath = path.join(uploadsDir, req.body.fileName);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found on server' });
            }
        } else if (req.body.fileData) {
            // Base64 upload fallback
            filePath = path.join(uploadsDir, `ewaste_${year}_${Date.now()}.xlsx`);
            const buffer = Buffer.from(req.body.fileData.split(',')[1], 'base64');
            fs.writeFileSync(filePath, buffer);
        } else {
            return res.status(400).json({ error: 'No file data provided' });
        }

        const workbook = xlsx.readFile(filePath);
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        const result = await db.update((dataObj) => {
            dataObj.ewasteItems = dataObj.ewasteItems || [];

            let added = 0;
            let updated = 0;
            for (const row of data) {
                const edpSerial = row['EDP Serial'] || row['EDP_Serial'] || row['edp serial'] || row['edp_serial'];
                if (!edpSerial) continue;

                const normalizedEDP = String(edpSerial).trim();
                const hardware = dataObj.hardware?.find(h => String(h.EDP_Serial).trim() === normalizedEDP);

                let ewasteItem;
                if (hardware) {
                    ewasteItem = {
                        year,
                        hardware_id: hardware.id,
                        ...hardware,
                        date_of_purchase: row['Date of Purchase'] || row['date_of_purchase'] || '',
                        added_at: new Date().toISOString()
                    };
                } else {
                    ewasteItem = {
                        year,
                        hardware_id: null,
                        Item_Name: row['Item Name'] || '',
                        EDP_Serial: normalizedEDP,
                        date_of_purchase: row['Date of Purchase'] || '',
                        Bill_Number: row['Bill Number'] || '',
                        Cost: row['Cost'] || '',
                        Make: row['Make'] || '',
                        Capacity: row['Capacity'] || '',
                        RAM: row['RAM'] || '',
                        OS: row['OS'] || '',
                        Office: row['Office'] || '',
                        Speed: row['Speed'] || '',
                        IP: row['IP'] || '',
                        MAC: row['MAC'] || '',
                        Company_Serial: row['Company Serial'] || '',
                        Additional_Item: row['Additional Items'] || '',
                        Status: row['Status'] || '',
                        AMC: row['AMC'] || '',
                        AMC_Upto: row['AMC Upto'] || '',
                        Remarks: row['Remarks'] || '',
                        added_at: new Date().toISOString()
                    };
                }

                // Upsert: update if exists by EDP_Serial + year, insert if new
                const existingIndex = dataObj.ewasteItems.findIndex(e =>
                    String(e.EDP_Serial).trim() === normalizedEDP && e.year === year
                );
                if (existingIndex !== -1) {
                    const existing = dataObj.ewasteItems[existingIndex];
                    Object.assign(dataObj.ewasteItems[existingIndex], { ...ewasteItem, id: existing.id });
                    updated++;
                } else {
                    dataObj.ewasteItems.push({
                        id: Date.now().toString() + added + Math.random().toString(36).substr(2, 9),
                        ...ewasteItem
                    });
                    added++;
                }
            }
            return { added, updated };
        });

        res.json({ message: `Bulk upload complete. Added ${result.added} new, Updated ${result.updated} existing items.` });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Upload failed' });
    }
});


// --- Software Module ---

// GET all software
app.get('/api/software', async (req, res) => {
    try {
        await db.read();
        const software = (db.data.software || []).map(s => ({
            ...s,
            Purchase_Date: formatExcelDate(s.Purchase_Date),
            Valid_Upto: formatExcelDate(s.Valid_Upto)
        }));
        res.json(software);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to fetch software' });
    }
});

// POST new software (Base64)
app.post('/api/software', async (req, res) => {
    try {
        const { fileData, fileName, data } = req.body;
        const softwareData = (typeof data === 'string') ? JSON.parse(data) : data || {};

        const result = await db.update((dataObj) => {
            dataObj.software = dataObj.software || [];

            const newSoftware = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                Software_Name: softwareData.Software_Name,
                Quantity: softwareData.Quantity,
                Source: softwareData.Source,
                Bill_Number: softwareData.Bill_Number || '',
                Vendor_Name: softwareData.Vendor_Name || '',
                Letter_Number: softwareData.Letter_Number || '',
                Purchase_Date: softwareData.Purchase_Date || '',
                Amount: softwareData.Amount || 0,
                Valid_Upto: softwareData.Valid_Upto || '',
                Issued_To: softwareData.Issued_To || '',
                License_Code: softwareData.License_Code || '',
                Additional_Info: softwareData.Additional_Info || '',
                Multiple_Issued: softwareData.Multiple_Issued || [],
                Document: savedFilename,
                created_at: new Date().toISOString()
            };

            dataObj.software.push(newSoftware);
            return { newSoftware };
        });

        res.status(201).json({ message: 'Software created', software: result.newSoftware });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to create software' });
    }
});

// PUT update software
app.put('/api/software/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.update((dataObj) => {
            const index = dataObj.software?.findIndex(s => s.id === id);
            if (index === -1 || index === undefined) {
                return { error: 'Software not found', status: 404 };
            }

            // Handle base64 file upload (same pattern as POST)
            let documentFilename = dataObj.software[index].Document;
            if (req.body.fileData && req.body.fileName) {
                const base64Data = req.body.fileData.split(',')[1] || req.body.fileData;
                const buffer = Buffer.from(base64Data, 'base64');
                const uniqueName = Date.now() + '-' + req.body.fileName;
                const filePath = path.join(uploadsDir, uniqueName);
                fs.writeFileSync(filePath, buffer);
                documentFilename = uniqueName;
            }

            dataObj.software[index] = {
                ...dataObj.software[index],
                Software_Name: softwareData.Software_Name,
                Quantity: softwareData.Quantity,
                Source: softwareData.Source,
                Bill_Number: softwareData.Bill_Number || '',
                Vendor_Name: softwareData.Vendor_Name || '',
                Letter_Number: softwareData.Letter_Number || '',
                Purchase_Date: softwareData.Purchase_Date || '',
                Amount: softwareData.Amount || 0,
                Valid_Upto: softwareData.Valid_Upto || '',
                Issued_To: softwareData.Issued_To || '',
                License_Code: softwareData.License_Code || '',
                Additional_Info: softwareData.Additional_Info || '',
                Multiple_Issued: softwareData.Multiple_Issued || [],
                Document: documentFilename
            };
            return { success: true, software: dataObj.software[index] };
        });

        if (!result.success) {
            return res.status(result.status).json({ error: result.error });
        }

        res.json({ message: 'Software updated', software: result.software });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to update software' });
    }
});

// DELETE software
app.delete('/api/software/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.update((dataObj) => {
            const initialLen = dataObj.software?.length || 0;
            dataObj.software = (dataObj.software || []).filter(s => s.id !== id);
            return { deleted: dataObj.software.length < initialLen };
        });

        if (result.deleted) {
            res.json({ message: 'Software deleted' });
        } else {
            res.status(404).json({ error: 'Software not found' });
        }
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to delete software' });
    }
});

// GET software document
app.get('/api/software/:id/document', async (req, res) => {
    try {
        const { id } = req.params;
        await db.read();

        const software = db.data.software?.find(s => s.id === id);
        if (!software || !software.Document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const filePath = path.join(uploadsDir, software.Document);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        res.download(filePath);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to download document' });
    }
});

// Download Software Excel
app.get('/api/software/download', async (req, res) => {
    try {
        await db.read();
        const software = db.data.software || [];

        const exportData = software.map(s => ({
            'Software Name': s.Software_Name,
            'Quantity': s.Quantity,
            'Source': s.Source,
            'Bill Number': s.Bill_Number,
            'Vendor Name': s.Vendor_Name,
            'Letter Number': s.Letter_Number,
            'Purchase Date': s.Purchase_Date,
            'Amount (INR)': s.Amount,
            'Valid Upto': s.Valid_Upto,
            'Issued To': s.Issued_To,
            'License Code': s.License_Code,
            'Additional Info': s.Additional_Info,
            'Multiple Issued': Array.isArray(s.Multiple_Issued) ? s.Multiple_Issued.join(', ') : s.Multiple_Issued
        }));

        const worksheet = xlsx.utils.json_to_sheet(exportData);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Software');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="software.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Upload Software Excel
app.post('/api/software/upload', memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        const result = await db.update((dataObj) => {
            dataObj.software = dataObj.software || [];

            let added = 0;
            let updated = 0;
            for (const row of data) {
                if (!row['Software Name']) continue;

                const softwareData = {
                    Software_Name: row['Software Name'],
                    Quantity: row['Quantity'] || 1,
                    Source: row['Source'] || 'Purchased',
                    Bill_Number: row['Bill Number'] || '',
                    Vendor_Name: row['Vendor Name'] || '',
                    Letter_Number: row['Letter Number'] || '',
                    Purchase_Date: formatExcelDate(row['Purchase Date']),
                    Amount: row['Amount (INR)'] || 0,
                    Valid_Upto: formatExcelDate(row['Valid Upto']),
                    Issued_To: row['Issued To'] || '',
                    License_Code: row['License Code'] || '',
                    Additional_Info: row['Additional Info'] || '',
                    Multiple_Issued: row['Multiple Issued'] ? row['Multiple Issued'].split(',').map(s => s.trim()) : []
                };

                // Upsert: update if exists by Software_Name + Bill_Number, insert if new
                const existingIndex = dataObj.software.findIndex(s =>
                    s.Software_Name === softwareData.Software_Name &&
                    s.Bill_Number === softwareData.Bill_Number
                );
                if (existingIndex !== -1) {
                    const existing = dataObj.software[existingIndex];
                    Object.assign(dataObj.software[existingIndex], {
                        ...softwareData,
                        id: existing.id,
                        Document: existing.Document || '',
                        created_at: existing.created_at
                    });
                    updated++;
                } else {
                    dataObj.software.push({
                        id: Date.now().toString() + added + Math.random().toString(36).substr(2, 9),
                        ...softwareData,
                        Document: '',
                        created_at: new Date().toISOString()
                    });
                    added++;
                }
            }
            return { added, updated };
        });

        res.json({ message: `Bulk upload complete. Added ${result.added} new, Updated ${result.updated} existing software entries.` });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// --- Reports API ---

// GET Hardware Report
app.get('/api/reports/hardware', async (req, res) => {
    try {
        await db.read();
        const hardware = db.data.hardware || [];
        const grouped = {};

        hardware.forEach(item => {
            const key = `${item.Item_Name || 'Unknown'}_${item.Capacity || 'N/A'}`;
            if (!grouped[key]) {
                grouped[key] = {
                    Item_Name: item.Item_Name || 'Unknown',
                    Capacity: item.Capacity || 'N/A',
                    Total_Quantity: 0,
                    Stock_Quantity: 0,
                    _hasAMC: false,
                    _hasWarranty: false
                };
            }
            grouped[key].Total_Quantity++;
            const isStockItem = (!item.Issued_To || item.Issued_To === '' || String(item.Issued_To).toUpperCase() === 'STOCK')
                && (!item.Allocated_To || item.Allocated_To === '' || String(item.Allocated_To).toUpperCase() === 'STOCK');
            if (isStockItem) {
                grouped[key].Stock_Quantity++;
            }
            if (item.AMC === 'Yes') {
                grouped[key]._hasAMC = true;
            }
            if (item.Warranty_Upto) {
                // Parse DD-MM-YYYY or try native Date
                let warrantyDate;
                const parts = String(item.Warranty_Upto).split('-');
                if (parts.length === 3 && parts[0].length <= 2) {
                    warrantyDate = new Date(parts[2], parts[1] - 1, parts[0]);
                } else {
                    warrantyDate = new Date(item.Warranty_Upto);
                }
                if (warrantyDate > new Date()) {
                    grouped[key]._hasWarranty = true;
                }
            }
        });

        // Set final AMC/Warranty status
        Object.values(grouped).forEach(g => {
            if (g._hasAMC && g._hasWarranty) g.AMC_Warranty_Status = 'Under AMC/Warranty';
            else if (g._hasAMC) g.AMC_Warranty_Status = 'Under AMC';
            else if (g._hasWarranty) g.AMC_Warranty_Status = 'Under Warranty';
            else g.AMC_Warranty_Status = 'NA';
            delete g._hasAMC;
            delete g._hasWarranty;
        });

        const result = Object.values(grouped).sort((a, b) => {
            if (a.Item_Name !== b.Item_Name) return a.Item_Name.localeCompare(b.Item_Name);
            return a.Capacity.localeCompare(b.Capacity);
        });
        res.json(result);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to generate hardware report' });
    }
});

// GET Hardware Report Excel Download
app.get('/api/reports/hardware/download', async (req, res) => {
    try {
        await db.read();
        const hardware = db.data.hardware || [];
        const grouped = {};

        hardware.forEach(item => {
            const key = `${item.Item_Name || 'Unknown'}_${item.Capacity || 'N/A'}`;
            if (!grouped[key]) {
                grouped[key] = {
                    'Item Name': item.Item_Name || 'Unknown',
                    'Capacity': item.Capacity || 'N/A',
                    'Total Quantity': 0,
                    'Quantity in Stock': 0,
                    _hasAMC: false,
                    _hasWarranty: false
                };
            }
            grouped[key]['Total Quantity']++;
            const isStockItem = (!item.Issued_To || item.Issued_To === '' || String(item.Issued_To).toUpperCase() === 'STOCK')
                && (!item.Allocated_To || item.Allocated_To === '' || String(item.Allocated_To).toUpperCase() === 'STOCK');
            if (isStockItem) {
                grouped[key]['Quantity in Stock']++;
            }
            if (item.AMC === 'Yes') {
                grouped[key]._hasAMC = true;
            }
            if (item.Warranty_Upto) {
                let warrantyDate;
                const parts = String(item.Warranty_Upto).split('-');
                if (parts.length === 3 && parts[0].length <= 2) {
                    warrantyDate = new Date(parts[2], parts[1] - 1, parts[0]);
                } else {
                    warrantyDate = new Date(item.Warranty_Upto);
                }
                if (warrantyDate > new Date()) {
                    grouped[key]._hasWarranty = true;
                }
            }
        });

        // Set final AMC/Warranty status
        Object.values(grouped).forEach(g => {
            if (g._hasAMC && g._hasWarranty) g['AMC/Warranty Status'] = 'Under AMC/Warranty';
            else if (g._hasAMC) g['AMC/Warranty Status'] = 'Under AMC';
            else if (g._hasWarranty) g['AMC/Warranty Status'] = 'Under Warranty';
            else g['AMC/Warranty Status'] = 'NA';
            delete g._hasAMC;
            delete g._hasWarranty;
        });

        const sortedData = Object.values(grouped).sort((a, b) => {
            if (a['Item Name'] !== b['Item Name']) return a['Item Name'].localeCompare(b['Item Name']);
            return a['Capacity'].localeCompare(b['Capacity']);
        });

        const finalData = [];
        let grandTotal = 0;
        let grandStock = 0;
        let currentGroup = null;
        let groupTotal = 0;
        let groupStock = 0;

        sortedData.forEach((item, index) => {
            if (currentGroup && item['Item Name'] !== currentGroup) {
                finalData.push({
                    'Item Name': `${currentGroup} Total`,
                    'Capacity': '',
                    'Total Quantity': groupTotal,
                    'Quantity in Stock': groupStock,
                    'AMC/Warranty Status': ''
                });
                groupTotal = 0;
                groupStock = 0;
            }
            currentGroup = item['Item Name'];

            finalData.push(item);
            groupTotal += item['Total Quantity'];
            groupStock += item['Quantity in Stock'];
            grandTotal += item['Total Quantity'];
            grandStock += item['Quantity in Stock'];

            if (index === sortedData.length - 1) {
                finalData.push({
                    'Item Name': `${currentGroup} Total`,
                    'Capacity': '',
                    'Total Quantity': groupTotal,
                    'Quantity in Stock': groupStock,
                    'AMC/Warranty Status': ''
                });
            }
        });

        finalData.push({
            'Item Name': 'Grand Total',
            'Capacity': '',
            'Total Quantity': grandTotal,
            'Quantity in Stock': grandStock,
            'AMC/Warranty Status': ''
        });

        const worksheet = xlsx.utils.json_to_sheet(finalData);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Hardware Report');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename=hardware_report.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to download hardware report' });
    }
});

// GET Software Report
app.get('/api/reports/software', async (req, res) => {
    try {
        await db.read();
        const software = db.data.software || [];
        const grouped = {};

        software.forEach(item => {
            const key = item.Software_Name || 'Unknown';
            if (!grouped[key]) {
                grouped[key] = {
                    Software_Name: item.Software_Name || 'Unknown',
                    Total_Quantity: 0,
                    Quantity_Not_Issued: 0
                };
            }
            const quantity = item.Quantity || 1;
            grouped[key].Total_Quantity += quantity;
            let issuedCount = 0;
            if (item.Issued_To && item.Issued_To !== '') issuedCount++;
            if (item.Multiple_Issued && Array.isArray(item.Multiple_Issued)) {
                issuedCount += item.Multiple_Issued.length;
            }
            grouped[key].Quantity_Not_Issued += Math.max(0, quantity - issuedCount);
        });

        const result = Object.values(grouped).sort((a, b) =>
            a.Software_Name.localeCompare(b.Software_Name)
        );
        res.json(result);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to generate software report' });
    }
});

// GET Software Report Excel Download
app.get('/api/reports/software/download', async (req, res) => {
    try {
        await db.read();
        const software = db.data.software || [];
        const grouped = {};

        software.forEach(item => {
            const key = item.Software_Name || 'Unknown';
            if (!grouped[key]) {
                grouped[key] = {
                    'Software Name': item.Software_Name || 'Unknown',
                    'Total Quantity': 0,
                    'Quantity Not Issued': 0
                };
            }
            const quantity = item.Quantity || 1;
            grouped[key]['Total Quantity'] += quantity;
            let issuedCount = 0;
            if (item.Issued_To && item.Issued_To !== '') issuedCount++;
            if (item.Multiple_Issued && Array.isArray(item.Multiple_Issued)) {
                issuedCount += item.Multiple_Issued.length;
            }
            grouped[key]['Quantity Not Issued'] += Math.max(0, quantity - issuedCount);
        });

        const data = Object.values(grouped).sort((a, b) =>
            a['Software Name'].localeCompare(b['Software Name'])
        );

        const worksheet = xlsx.utils.json_to_sheet(data);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Software Report');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename=software_report.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to download software report' });
    }
});


// --- Permanent Allocation Module ---

// GET All Permanent Allocation Items
app.get('/api/permanent-allocation', async (req, res) => {
    try {
        await db.read();
        res.json(db.data.permanent_allocation || []);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to fetch permanent allocation data' });
    }
});

// Transfer Items to Permanent Allocation
app.post('/api/permanent-allocation/transfer', upload.single('notesheet'), async (req, res) => {
    try {
        if (!req.body.data) return res.status(400).json({ error: 'No data provided' });
        const { ids, transferType, targetOffice } = JSON.parse(req.body.data);
        const file = req.file;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'No items selected for transfer' });
        }

        const result = await db.update((dataObj) => {
            dataObj.permanent_allocation = dataObj.permanent_allocation || [];
            dataObj.hardware = dataObj.hardware || [];
            const employees = dataObj.employees || [];
            const invoices = dataObj.invoices || [];

            const transferredItems = [];
            const remainingHardware = [];
            const updateIds = ids.map(String);

            dataObj.hardware.forEach(item => {
                if (updateIds.includes(String(item.id))) {
                    // Determine PIN (Allocated_To or Issued_To)
                    const pin = item.Allocated_To || item.Issued_To || '';

                    // Lookup Employee (robust comparison handling leading zeros)
                    const targetPin = normalizePin(pin);
                    const emp = employees.find(e => normalizePin(e.PIN) === targetPin);

                    // Lookup Invoice for Purchase Date if missing
                    const invoice = invoices.find(i => i.Bill_Number === item.Bill_Number);
                    const purchaseDate = item.Date_of_Purchase || (invoice ? invoice.Date : '');

                    // Snapshot Item
                    const newItem = {
                        ...item,
                        PIN: pin,
                        // Lookup keys with potential spaces
                        Name: emp ? (emp.Name || emp['Employee Name']) : (item.Issued_To || item.Name || ''),
                        Post: emp ? (emp.Present_Post || emp['Present Post'] || emp.Designation) : (item.Present_Post || ''),
                        Date_of_Purchase: purchaseDate,
                        Transfer_Id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                        Transfer_Date: new Date().toISOString().split('T')[0],
                        R_T_Type: transferType,
                        Target_Office: targetOffice,
                        Notesheet_Doc: file ? file.filename : null
                    };

                    transferredItems.push(newItem);
                } else {
                    remainingHardware.push(item);
                }
            });

            if (transferredItems.length === 0) {
                return { error: 'Selected items not found in hardware inventory', status: 404 };
            }

            dataObj.permanent_allocation.push(...transferredItems);
            dataObj.hardware = remainingHardware;

            return { success: true, count: transferredItems.length };
        });

        if (!result.success) {
            return res.status(result.status).json({ error: result.error });
        }

        res.json({ message: `Successfully transferred ${result.count} items`, count: result.count });

    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to transfer items' });
    }
});

// Download Notesheet
app.get('/api/permanent-allocation/download/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(uploadsDir, filename);
        if (fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Download Permanent Allocation Excel
app.get('/api/permanent-allocation/download-excel', async (req, res) => {
    try {
        await db.read();
        const data = db.data.permanent_allocation || [];

        // Map data to columns
        const excelData = data.map(item => ({
            'R/T Type': item.R_T_Type || (item.Transfer_Type === 'Retired' ? 'Retired' : 'Transferred'),
            'To Office': item.Target_Office || '',
            'Item Name': item.Item_Name,
            'EDP Serial': item.EDP_Serial,
            'PIN': item.PIN || '',
            'Name': item.Name || item.Issued_To || '',
            'Post': item.Post || item.Present_Post || item.Designation || '',
            'Issued Date': item.Issued_Date || '',
            'Purchased': item.Date_of_Purchase || '',
            'Bill Number': item.Bill_Number,
            'Cost': item.Cost,
            'Make': item.Make,
            'Capacity': item.Capacity,
            'RAM': item.RAM,
            'OS': item.OS,
            'Office': item.Office || item.Target_Office || '',
            'Speed': item.Speed || '',
            'IP': item.IP_Address || '',
            'MAC': item.MAC_Address || '',
            'Co. Serial': item.Company_Serial || '',
            'Add. Items': item.Additional_Item,
            'Status': item.Status,
            'Remarks': item.Remarks,
            'Ref. Docs': item.Notesheet_Doc || ''
        }));

        const worksheet = xlsx.utils.json_to_sheet(excelData);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Permanent Allocation');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename=permanent_allocation.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to download excel' });
    }
});

// --- Dashboard Module ---

// NOC Search - Search employee by PIN or Name and get all details with hardware
app.get('/api/dashboard/noc-search', async (req, res) => {
    try {
        const { query } = req.query;

        if (!query || query.trim() === '') {
            return res.json(null);
        }

        await db.read();
        const employees = db.data.employees || [];
        const hardware = db.data.hardware || [];
        const invoices = db.data.invoices || [];

        // Normalize for case-insensitive search
        const searchTerm = query.toLowerCase().trim();

        // Search all employees matching PIN or Name (partial match)
        const matchedEmployees = employees.filter(emp => {
            const pin = String(emp.PIN || '').toLowerCase();
            const name = String(emp.Name || emp['Employee Name'] || '').toLowerCase();
            return pin.includes(searchTerm) || name.includes(searchTerm);
        });

        if (matchedEmployees.length === 0) {
            return res.json(null);
        }



        // Build results for each matched employee
        const results = matchedEmployees.map(employee => {
            // Get employee details
            const employeeDetails = {
                PIN: employee.PIN,
                Name: employee.Name || employee['Employee Name'],
                Present_Post: employee.Present_Post || employee['Present Post'] || employee.Designation,
                Mobile: employee.Mobile || '',
                Office: employee.Office,
                Hqr_Field: employee['Hqr/Field'] || employee.Hqr_Field
            };

            // Find all hardware issued to this employee
            const targetPin = normalizePin(employee.PIN);

            const issuedHardware = hardware.filter(hw => {
                const issuedTo = normalizePin(hw.Issued_To);
                const allocatedTo = normalizePin(hw.Allocated_To);
                return issuedTo === targetPin || allocatedTo === targetPin;
            });

            // Enhance hardware with invoice data
            const hardwareList = issuedHardware.map(hw => {
                const invoice = invoices.find(inv => inv.Bill_Number === hw.Bill_Number);
                return {
                    Item_Name: hw.Item_Name,
                    EDP_Serial: hw.EDP_Serial,
                    Issued_Date: hw.Issued_Date,
                    Make: hw.Make,
                    Company_Serial: hw.Company_Serial,
                    Bill_Number: hw.Bill_Number,
                    Date_of_Purchase: hw.Date_of_Purchase || (invoice ? invoice.Date : ''),
                    Cost: hw.Cost
                };
            });

            return {
                employee: employeeDetails,
                hardware: hardwareList
            };
        });

        res.json({ employees: results });

    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to search NOC data' });
    }
});

// Retirement Suggestions - Find retired employees and suggest actions
app.get('/api/dashboard/retirement-suggestions', async (req, res) => {
    try {
        await db.read();
        const employees = db.data.employees || [];
        const hardware = db.data.hardware || [];



        // Helper to parse date from various formats (Excel serial, DD-MM-YYYY, YYYY-MM-DD)
        const parseDate = (val) => {
            if (!val) return null;

            // Check for Excel serial number
            const num = Number(val);
            // Excel serial 10000 is year 1927, 90000 is year 2146
            if (!isNaN(num) && num > 10000 && num < 90000) {
                // (num - 25569) * 86400 * 1000 converts Excel serial to Unix ms
                return new Date(Math.round((num - 25569) * 86400 * 1000));
            }

            // Check for DD-MM-YYYY or DD/MM/YYYY
            if (typeof val === 'string' && (val.includes('-') || val.includes('/'))) {
                const parts = val.split(/[-/]/);
                if (parts.length === 3) {
                    // Assumption: DD-MM-YYYY (Indian/UK format)
                    // If it's YYYY-MM-DD
                    if (parts[0].length === 4) {
                        return new Date(val);
                    }
                    // DD-MM-YYYY
                    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                }
            }

            // Fallback to standard parser
            const d = new Date(val);
            return isNaN(d.getTime()) ? null : d;
        };

        // Filter employees with retirement date < current date
        const retiredEmployees = employees.filter(emp => {
            const dateVal = emp.Retirement_Date || emp['Retirement Date'];
            if (!dateVal) return false;

            const retirementDate = parseDate(dateVal);
            if (!retirementDate) return false;

            // Reset time part for accurate date comparison
            retirementDate.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            return retirementDate < today;
        });

        // Format date to DD-MM-YYYY for display
        const formatDate = (val) => {
            const d = parseDate(val);
            if (!d) return val;
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}-${month}-${year}`;
        };

        const withHardware = [];
        const withoutHardware = [];

        retiredEmployees.forEach(emp => {
            const targetPin = normalizePin(emp.PIN);

            // Find hardware issued to this employee
            const employeeHardware = hardware.filter(hw => {
                const issuedTo = normalizePin(hw.Issued_To);
                const allocatedTo = normalizePin(hw.Allocated_To);
                return issuedTo === targetPin || allocatedTo === targetPin;
            });

            if (employeeHardware.length > 0) {
                // Employee has hardware
                employeeHardware.forEach(hw => {
                    withHardware.push({
                        Item_Name: hw.Item_Name,
                        EDP_Serial: hw.EDP_Serial,
                        PIN: emp.PIN,
                        Name: emp.Name || emp['Employee Name'],
                        hardware_id: hw.id,
                        Retirement_Date: formatDate(emp.Retirement_Date || emp['Retirement Date'])
                    });
                });
            } else {
                // Employee has no hardware
                withoutHardware.push({
                    PIN: emp.PIN,
                    Name: emp.Name || emp['Employee Name'],
                    Present_Post: emp.Present_Post || emp['Present Post'] || emp.Designation,
                    Retirement_Date: formatDate(emp.Retirement_Date || emp['Retirement Date']),
                    employee_id: emp.id || emp.PIN
                });
            }
        });

        res.json({
            withHardware,
            withoutHardware
        });

    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to get retirement suggestions' });
    }
});

// Office Suggestions - Find employees who hold hardware but are not in the selected Home Office
app.get('/api/dashboard/office-suggestions', async (req, res) => {
    try {
        const { homeOffice } = req.query;
        if (!homeOffice) {
             return res.json([]);
        }

        await db.read();
        const employees = db.data.employees || [];
        const hardware = db.data.hardware || [];

        const suggestions = [];

        // Filter hardware that is allocated (not STOCK)
        const isStock = (val) => !val || val === '' || String(val).toUpperCase() === 'STOCK';
        
        hardware.forEach(hw => {
            const allocatedTo = hw.Allocated_To;
            const issuedTo = hw.Issued_To;
            
            // hardware is considered held by an employee if allocated or issued is set and not STOCK
            let targetPin = null;
            if (!isStock(allocatedTo)) {
                targetPin = normalizePin(allocatedTo);
            } else if (!isStock(issuedTo)) {
                targetPin = normalizePin(issuedTo);
            }

            if (targetPin) {
                // Find the employee holding this hardware
                const emp = employees.find(e => normalizePin(e.PIN) === targetPin);
                
                // If employee exists and their current office is NOT the homeOffice
                if (emp && emp.Office && String(emp.Office).trim() !== String(homeOffice).trim()) {
                    suggestions.push({
                        Item_Name: hw.Item_Name,
                        EDP_Serial: hw.EDP_Serial,
                        PIN: emp.PIN,
                        Name: emp.Name || emp['Employee Name'],
                        Wing: emp.Wing || '-',
                        Office: emp.Office,
                        hardware_id: hw.id
                    });
                }
            }
        });

        res.json(suggestions);
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to get office suggestions' });
    }
});

// Stock Count - Get count of items in stock grouped by item type
app.get('/api/dashboard/stock-count', async (req, res) => {
    try {
        const { item } = req.query; // Optional: get bifurcation for specific item

        await db.read();
        const hardware = db.data.hardware || [];
        const invoices = db.data.invoices || [];

        // Filter stock items (not issued/allocated to anyone)
        const isStock = (val) => !val || val === '' || String(val).toUpperCase() === 'STOCK';
        const stockItems = hardware.filter(hw =>
            isStock(hw.Issued_To) && isStock(hw.Allocated_To)
        );

        if (item) {
            // Return bifurcation for specific item
            const itemList = stockItems
                .filter(hw => hw.Item_Name === item)
                .map(hw => {
                    const invoice = invoices.find(inv => inv.Bill_Number === hw.Bill_Number);
                    return {
                        EDP_Serial: hw.EDP_Serial,
                        Make: hw.Make,
                        Capacity: hw.Capacity,
                        Bill_Number: hw.Bill_Number,
                        Cost: hw.Cost,
                        Date_of_Purchase: hw.Date_of_Purchase || (invoice ? invoice.Date : ''),
                        RAM: hw.RAM,
                        Status: hw.Status
                    };
                });

            return res.json({ item, items: itemList });
        }

        // Group by Item_Name and count
        const grouped = {};
        stockItems.forEach(hw => {
            const itemName = hw.Item_Name || 'Unknown';
            if (!grouped[itemName]) {
                grouped[itemName] = {
                    Item_Name: itemName,
                    Count: 0
                };
            }
            grouped[itemName].Count++;
        });

        const result = Object.values(grouped).sort((a, b) =>
            a.Item_Name.localeCompare(b.Item_Name)
        );

        // Add total count
        const totalCount = stockItems.length;

        res.json({
            items: result,
            totalCount
        });

    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to get stock count' });
    }
});

// --- Dashboard: Hardware Status (Under Repair / Not Working) ---
app.get('/api/dashboard/hardware-status', async (req, res) => {
    try {
        const { status, location } = req.query;
        await db.read();
        const hardware = db.data.hardware || [];
        const invoices = db.data.invoices || [];
        const employees = db.data.employees || [];

        const underRepair = hardware.filter(h => h.Status === 'Under Repair');
        const notWorking = hardware.filter(h => h.Status === 'Not Working');
        const serverRoom = hardware.filter(h => h.Issued_Location === 'Server Room');
        const eWasteStore = hardware.filter(h => h.Issued_Location === 'E-Waste Store');

        if (status || location) {
            let targetArray = [];
            if (status === 'Under Repair') targetArray = underRepair;
            else if (status === 'Not Working') targetArray = notWorking;
            else if (location === 'Server Room') targetArray = serverRoom;
            else if (location === 'E-Waste Store') targetArray = eWasteStore;

            const items = targetArray.map(hw => {
                const invoice = invoices.find(inv => inv.Bill_Number === hw.Bill_Number);
                const emp = employees.find(e => String(e.PIN) === String(hw.Allocated_To));
                return {
                    id: hw.id,
                    Item_Name: hw.Item_Name,
                    EDP_Serial: hw.EDP_Serial,
                    Make: hw.Make,
                    Capacity: hw.Capacity,
                    RAM: hw.RAM,
                    Bill_Number: hw.Bill_Number,
                    Cost: hw.Cost,
                    Status: hw.Status,
                    Issued_Location: hw.Issued_Location || '',
                    Allocated_To: hw.Allocated_To,
                    Employee_Name: emp ? emp.Name : (hw.Allocated_To === 'STOCK' ? 'STOCK' : hw.Allocated_To || '-'),
                    Date_of_Purchase: hw.Date_of_Purchase || (invoice ? invoice.Date : '')
                };
            });
            return res.json({ status: status || location, items });
        }

        res.json({
            underRepairCount: underRepair.length,
            notWorkingCount: notWorking.length,
            serverRoomCount: serverRoom.length,
            eWasteCount: eWasteStore.length
        });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to get hardware status' });
    }
});

// --- Dashboard: Update Hardware Status ---
app.put('/api/dashboard/hardware-status/update', async (req, res) => {
    try {
        const { id, status } = req.body;
        if (!id || !status) return res.status(400).json({ error: 'id and status are required' });

        const result = await db.update((dataObj) => {
            const index = dataObj.hardware.findIndex(h => h.id === id);
            if (index === -1) return { error: 'Hardware not found', status: 404 };

            dataObj.hardware[index].Status = status;
            return { success: true, item: dataObj.hardware[index] };
        });

        if (!result.success) {
            return res.status(result.status).json({ error: result.error });
        }

        res.json({ message: 'Status updated', item: result.item });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});




// Server instance for Electron control
let server = null;

/**
 * Start the Express server
 * @returns {Promise<object>} The server instance
 */
export async function startServer() {
    return new Promise((resolve) => {
        server = app.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
            console.log(`Uploads directory: ${uploadsDir}`);

            // Verify write permissions
            try {
                const testFile = path.join(uploadsDir, 'perm_test.txt');
                fs.writeFileSync(testFile, 'ok');
                fs.unlinkSync(testFile);
                console.log('Write permissions check passed');
            } catch (e) {
                console.error('Context:', e.message || e);
            }

            console.log(`Database path: ${process.env.DEADSTOCK_DB_PATH || 'default'}`);
            resolve(server);
        });
    });
}

/**
 * Stop the Express server
 */
export async function stopServer() {
    if (server) {
        return new Promise((resolve) => {
            server.close(() => {
                console.log('Server stopped');
                resolve();
            });
        });
    }
}

// --- Employee PIN Deduplication ---
app.post('/api/employees/deduplicate', async (req, res) => {
    try {
        const result = await db.update((dataObj) => {
            const employees = dataObj.employees || [];
            const seen = new Map();
            const unique = [];

            for (const emp of employees) {
                const pinKey = String(emp.PIN);
                if (!seen.has(pinKey)) {
                    seen.set(pinKey, true);
                    unique.push(emp);
                }
            }

            const removed = employees.length - unique.length;
            dataObj.employees = unique;
            return { removed, remaining: unique.length };
        });

        console.log(`Deduplication complete: removed ${result.removed} duplicates, ${result.remaining} remaining`);
        res.json({ message: `Removed ${result.removed} duplicate employees. ${result.remaining} unique records remaining.`, removed: result.removed, remaining: result.remaining });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Deduplication failed' });
    }
});

// --- Backup History Sync ---
app.get('/api/backup/history', async (req, res) => {
    try {
        await db.read();
        res.json({ history: db.data.backupHistory || [] });
    } catch (error) {
        console.error('Backup history read error:', error);
        res.status(500).json({ error: 'Failed to read backup history' });
    }
});

app.post('/api/backup/history', async (req, res) => {
    try {
        const record = req.body;
        if (!record || !record.date) {
            return res.status(400).json({ error: 'Invalid backup record' });
        }
        
        await db.update(data => {
            if (!data.backupHistory) data.backupHistory = [];
            data.backupHistory = [record, ...data.backupHistory].slice(0, 20); // Keep last 20 globally
        });
        
        res.json({ success: true, history: db.data.backupHistory });
    } catch (error) {
        console.error('Backup history write error:', error);
        res.status(500).json({ error: 'Failed to write backup history' });
    }
});

// --- Full Backup (multi-sheet Excel) ---
app.get('/api/backup/full', async (req, res) => {
    try {
        await db.read();
        const workbook = xlsx.utils.book_new();

        // Suppliers
        const suppliers = db.data.suppliers || [];
        if (suppliers.length > 0) {
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(suppliers), 'Suppliers');
        }

        // Invoices (flatten with items)
        const invoices = db.data.invoices || [];
        if (invoices.length > 0) {
            const flatInvoices = [];
            for (const inv of invoices) {
                if (inv.items && inv.items.length > 0) {
                    for (const item of inv.items) {
                        flatInvoices.push({
                            Bill_Number: inv.Bill_Number,
                            Supplier: inv.Supplier,
                            Date: inv.Date,
                            ...item
                        });
                    }
                } else {
                    flatInvoices.push(inv);
                }
            }
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(flatInvoices), 'Invoices');
        }

        // Hardware
        const hardware = db.data.hardware || [];
        if (hardware.length > 0) {
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(hardware), 'Hardware');
        }

        // Employees
        const employees = db.data.employees || [];
        if (employees.length > 0) {
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(employees), 'Employees');
        }

        // Hardware Allocation (Enriched)
        const allocEnriched = hardware.map(h => {
            const emp = employees.find(e => normalizePin(e.PIN) === normalizePin(h.Allocated_To));
            const inv = invoices.find(i => i.Bill_Number === h.Bill_Number);
            return {
                'Item Name': h.Item_Name,
                'EDP Serial': h.EDP_Serial,
                'PIN': h.Allocated_To,
                'Employee Name': emp?.Name || (h.Allocated_To === 'STOCK' ? 'STOCK' : ''),
                'Present Post': emp?.Present_Post || '',
                'Mobile': emp?.Mobile || '',
                'Wing': emp?.Wing || '',
                'Issued Date': h.Issued_Date,
                'Issued Location': h.Issued_Location || '',
                'Make': h.Make,
                'Company Serial': h.Company_Serial,
                'Bill Number': h.Bill_Number,
                'Purchased Date': inv?.Date || '',
                'Cost': h.Cost,
                'Status': h.Status || 'Working'
            };
        });
        if (allocEnriched.length > 0) {
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(allocEnriched), 'Hardware_Allocation');
        }

        // Software
        const software = db.data.software || [];
        if (software.length > 0) {
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(software), 'Software');
        }

        // E-Waste Items
        const ewasteItems = db.data.ewasteItems || [];
        if (ewasteItems.length > 0) {
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(ewasteItems), 'E-Waste');
        }

        // Permanent Allocation
        const permAlloc = db.data.permanent_allocation || [];
        if (permAlloc.length > 0) {
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(permAlloc), 'Permanent_Allocation');
        }

        // Allocation History
        const allocHistory = db.data.allocationHistory || [];
        if (allocHistory.length > 0) {
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(allocHistory), 'Allocation_History');
        }

        // If workbook has no sheets, add an empty one
        if (workbook.SheetNames.length === 0) {
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([{ message: 'No data' }]), 'Info');
        }

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const base64 = buffer.toString('base64');

        // Also read the raw database file for backup
        let dbBase64 = null;
        try {
            const dbPath = getDatabaseFilePath();
            if (dbPath && fs.existsSync(dbPath)) {
                const dbBuffer = fs.readFileSync(dbPath);
                dbBase64 = dbBuffer.toString('base64');
            }
        } catch (dbErr) {
            console.error('Context:', dbErr.message || dbErr);
        }

        res.json({ buffer: base64, dbBuffer: dbBase64, sheets: workbook.SheetNames });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Backup generation failed' });
    }
});

// --- Restore Database from .deadstock file ---
app.post('/api/backup/restore', async (req, res) => {
    try {
        const { dbBuffer } = req.body;
        if (!dbBuffer) {
            return res.status(400).json({ error: 'No database file provided' });
        }

        // Decode and validate the JSON
        const decoded = Buffer.from(dbBuffer, 'base64').toString('utf8');
        let parsed;
        try {
            parsed = JSON.parse(decoded);
        } catch (e) {
            console.error('Context:', e.message || e);
            return res.status(400).json({ error: 'Invalid database file — could not parse JSON' });
        }

        // Basic structure validation
        const requiredKeys = ['suppliers', 'invoices', 'hardware', 'employees'];
        const hasKeys = requiredKeys.filter(k => parsed[k] !== undefined);
        if (hasKeys.length < 2) {
            return res.status(400).json({ error: 'Invalid database file — missing required data tables' });
        }

        // Backup current DB before overwriting
        const dbPath = getDatabaseFilePath();
        if (dbPath && fs.existsSync(dbPath)) {
            const backupPath = dbPath + '.pre_restore_' + Date.now();
            fs.copyFileSync(dbPath, backupPath);
            console.log('Pre-restore backup saved:', backupPath);
        }

        // Write the restored data atomically
        await db.update(data => {
            const history = data.backupHistory || [];
            
            // Clear current data keys
            for (let key in data) {
                delete data[key];
            }
            
            // Load parsed data
            Object.assign(data, parsed);
            
            // Preserve backup history across restores
            data.backupHistory = history;
        });
        
        console.log('Database restored from uploaded file');

        // Count records for response
        await db.read();
        const counts = {
            suppliers: (db.data.suppliers || []).length,
            invoices: (db.data.invoices || []).length,
            hardware: (db.data.hardware || []).length,
            employees: (db.data.employees || []).length,
            software: (db.data.software || []).length,
            ewasteItems: (db.data.ewasteItems || []).length,
            allocationHistory: (db.data.allocationHistory || []).length,
            permanent_allocation: (db.data.permanent_allocation || []).length
        };

        res.json({ message: 'Database restored successfully', counts });
    } catch (error) {
        console.error('Context:', error.message || error);
        res.status(500).json({ error: 'Restore failed: ' + error.message });
    }
});

// --- Global Error Handler (MUST be registered after ALL routes) ---
app.use((err, req, res, _next) => {
    if (err.type === 'entity.too.large') {
        console.error('[ERROR] Payload too large:', err.message);
        return res.status(413).json({ error: 'File too large. Please upload smaller files.' });
    }
    console.error(`[ERROR] ${req.method} ${req.url}:`, err.message || err);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// --- Graceful Shutdown ---
process.on('SIGTERM', () => {
    console.log('[SIGTERM] Shutting down gracefully...');
    if (server) {
        server.close(() => {
            console.log('HTTP server closed.');
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 5000);
    } else {
        process.exit(0);
    }
});

process.on('SIGINT', () => {
    console.log('[SIGINT] Shutting down gracefully...');
    if (server) {
        server.close(() => {
            console.log('HTTP server closed.');
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 5000);
    } else {
        process.exit(0);
    }
});

/**
 * Reinitialize database with a new path
 */
export async function updateDatabase(newPath) {
    process.env.DEADSTOCK_DB_PATH = newPath;
    process.env.DEADSTOCK_UPLOADS_PATH = newPath.replace('.deadstock', '_files');
    await initDatabase(newPath);
    ensureUploadsDir();
    console.log(`Database switched to: ${newPath}`);
}

// Auto-start server if run directly (not imported by Electron)
// Auto-start server if run directly (not imported by Electron)
const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
const forceStart = process.argv.includes('--start');

if (isMainModule || forceStart) {
    console.log('Starting server (Triggered by main module check or --start flag)...');
    console.log(`ENV: DB_PATH=${process.env.DEADSTOCK_DB_PATH}`);
    console.log(`ENV: UPLOADS_PATH=${process.env.DEADSTOCK_UPLOADS_PATH}`);
    startServer();
}

export { app };
