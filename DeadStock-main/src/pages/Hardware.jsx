import React, { useState, useEffect, useMemo } from 'react';
import { formatDate } from '../utils/formatDate';
import { useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTimes, faEdit, faTrash, faDownload, faFileExcel } from '@fortawesome/free-solid-svg-icons';
import { getJson, postJson, putJson, deleteJson } from '../utils/api';

const Hardware = () => {
    const { category } = useParams();
    const urlCategory = decodeURIComponent(category);

    // --- State ---
    const [hardwareList, setHardwareList] = useState([]);
    const [, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [alert, setAlert] = useState(null);

    // Search
    const [searchCriteria, setSearchCriteria] = useState('EDP Serial Number'); // Default per requirement
    const [searchQuery, setSearchQuery] = useState('');

    // Inline Edit
    const [editRowId, setEditRowId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    // Add Item Wizard State
    const [showModal, setShowModal] = useState(false);
    const [wizardStep, setWizardStep] = useState(1);
    const [invoices, setInvoices] = useState([]);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [selectedInvoiceItem, setSelectedInvoiceItem] = useState(null);
    const [newItemCommonData, setNewItemCommonData] = useState({
        Make: '', Capacity: '', RAM: '', OS: '', Office: '', Speed: '',
        IP: '', MAC: '', Company_Serial: '', Additional_Item: '',
        Status: 'Working', Remarks: '', AMC: 'No', AMC_Upto: '', Cost: '0'
    });

    const [selectedIds, setSelectedIds] = useState([]);
    const [showBulkAMCModal, setShowBulkAMCModal] = useState(false);
    const [bulkAMCData, setBulkAMCData] = useState({ AMC: 'Yes', AMC_Upto: '' });
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    // EDP Serial Confirmation
    const [showSerialConfirm, setShowSerialConfirm] = useState(false);
    const [proposedSerial, setProposedSerial] = useState('');
    const [serialOverride, setSerialOverride] = useState('');
    const [pendingItems, setPendingItems] = useState(null);

    // Make dropdown config
    const [makeOptions, setMakeOptions] = useState([]);

    // Capacity dropdown config
    const [capacityConfig, setCapacityConfig] = useState([]);
    const [columnVisibilityConfig, setColumnVisibilityConfig] = useState({});

    // Capacity label mapping based on category
    const getCapacityLabel = (category) => {
        const mapping = {
            'LAPTOP': 'Processor',
            'AIO DESKTOP': 'Processor',
            'CPU': 'Processor',
            'MONITOR': 'Screen Size',
            'UPS': 'Capacity of Battery',
            'HDD': 'Storage',
            'LASER PRINTER': 'Model Number',
            'SERVER': 'Processor',
            'PROJECTOR': 'Model Number'
        };
        return mapping[category?.toUpperCase()] || 'Capacity';
    };

    const capacityLabel = getCapacityLabel(urlCategory);

    // --- IP Address Masking ---
    const formatIP = (value) => {
        // Strip non-numeric and non-dot chars
        let cleaned = value.replace(/[^0-9.]/g, '');
        // Split into octets
        let parts = cleaned.split('.');
        // Limit to 4 octets
        parts = parts.slice(0, 4);
        // Clamp each octet to 0-255 and limit to 3 digits
        parts = parts.map(p => {
            if (p === '') return '';
            const num = parseInt(p.slice(0, 3), 10);
            if (isNaN(num)) return '';
            return Math.min(num, 255).toString();
        });
        return parts.join('.');
    };

    const isValidIP = (value) => {
        if (!value) return true; // empty is OK
        const parts = value.split('.');
        if (parts.length !== 4) return false;
        return parts.every(p => {
            const num = parseInt(p, 10);
            return !isNaN(num) && num >= 0 && num <= 255 && p !== '';
        });
    };

    // --- MAC Address Masking ---
    const formatMAC = (value) => {
        // Strip everything except hex chars
        let hex = value.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
        // Limit to 12 hex chars
        hex = hex.slice(0, 12);
        // Insert colons every 2 chars
        let parts = [];
        for (let i = 0; i < hex.length; i += 2) {
            parts.push(hex.slice(i, i + 2));
        }
        return parts.join(':');
    };

    const isValidMAC = (value) => {
        if (!value) return true; // empty is OK
        return /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(value);
    };

    // --- Column visibility per category (from server config) ---
    const hiddenCols = columnVisibilityConfig[urlCategory] || [];
    const colVisible = (col) => !hiddenCols.includes(col);

    // Capacity options filtered by current category
    const capacityOptions = capacityConfig
        .filter(c => c.Item_Name === urlCategory)
        .map(c => c.Capacity);

    useEffect(() => {
        const loadInitialData = async () => {
            setLoading(true);
            try {
                await Promise.all([
                    fetchHardware(false),
                    fetchInvoices(),
                    fetchMakeOptions(),
                    fetchCapacityConfig(),
                    fetchColumnVisibility()
                ]);
            } catch (err) {
                console.error('Initialization error:', err);
            } finally {
                setLoading(false);
            }
        };
        loadInitialData();
    }, [urlCategory]);

    // --- API Calls ---
    const fetchHardware = async (withLoading = true) => {
        if (withLoading) setLoading(true);
        try {
            const res = await getJson(`/hardware?category=${encodeURIComponent(urlCategory)}`);
            const data = await res.json();
            setHardwareList(data);
        } catch (error) {
            console.error(error);
        } finally {
            if (withLoading) setLoading(false);
        }
    };

    const fetchInvoices = async () => {
        try {
            const res = await getJson('/invoices');
            const data = await res.json();
            setInvoices(data);
        } catch (error) {
            console.error(error);
        }
    };

    const fetchCapacityConfig = async () => {
        try {
            const res = await getJson('/capacity/config');
            const data = await res.json();
            setCapacityConfig(data);
        } catch (error) {
            console.error('Failed to fetch capacity config:', error);
        }
    };

    const fetchColumnVisibility = async () => {
        try {
            const res = await getJson('/column-visibility/config');
            const data = await res.json();
            setColumnVisibilityConfig(data);
        } catch (error) {
            console.error('Failed to fetch column visibility:', error);
        }
    };

    const fetchMakeOptions = async () => {
        try {
            const res = await getJson('/make/config');
            const data = await res.json();
            setMakeOptions(data);
        } catch (error) {
            console.error('Failed to fetch make options:', error);
        }
    };

    const invoiceMap = useMemo(() => {
        const map = new Map();
        invoices.forEach(inv => map.set(String(inv.Bill_Number), inv));
        return map;
    }, [invoices]);

    // --- Reactive Search (computed) ---
    const filteredList = useMemo(() => {
        let results = hardwareList;
        if (searchQuery) {
            try {
                const query = searchQuery.toLowerCase();
                if (searchCriteria === 'Supplier Name') {
                    results = hardwareList.filter(item => {
                        try {
                            const bill = invoiceMap.get(String(item.Bill_Number));
                            const supplierName = bill ? String(bill.Firm_Name || '').toLowerCase() : '';
                            return supplierName.includes(query);
                        } catch { return false; }
                    });
                } else if (searchCriteria === 'EDP Serial Number') {
                    results = hardwareList.filter(item => {
                        try { return String(item.EDP_Serial || '').toLowerCase().includes(query); } catch { return false; }
                    });
                } else if (searchCriteria === 'Company Serial') {
                    results = hardwareList.filter(item => {
                        try { return String(item.Company_Serial || '').toLowerCase().includes(query); } catch { return false; }
                    });
                }
            } catch { results = hardwareList; }
        }
        return results;
    }, [searchCriteria, searchQuery, hardwareList, invoiceMap]);

    const handleClearSearch = () => {
        setSearchQuery('');
    };

    // --- Add Item Wizard ---
    const handleSelectInvoice = (e) => {
        const billNo = e.target.value;
        const inv = invoiceMap.get(String(billNo));
        setSelectedInvoice(inv);
        setSelectedInvoiceItem(null); // Reset item selection
    };

    // Helper: look up purchase date from invoices by Bill Number
    const getPurchasedDate = (billNo) => {
        if (!billNo) return '-';
        const inv = invoiceMap.get(String(billNo));
        return inv ? formatDate(inv.Date) : '-';
    };

    const handleStep1Next = () => {
        if (!selectedInvoice) return showAlert('error', 'Select a Bill first');
        setWizardStep(2);
    };

    const handleStep2Next = () => {
        if (!selectedInvoiceItem) return showAlert('error', 'Select an Item to add');
        setWizardStep(3);
    };

    const handleSaveNewItems = async () => {
        if (newItemCommonData.AMC === 'Yes' && !newItemCommonData.AMC_Upto) {
            return showAlert('error', 'Please enter AMC Upto date');
        }

        // Build items first
        const qty = parseInt(selectedInvoiceItem.Quantity, 10);
        const itemsToCreate = [];
        for (let i = 0; i < qty; i++) {
            itemsToCreate.push({
                Category: urlCategory,
                Item_Name: selectedInvoiceItem.Hardware_Item,
                Bill_Number: selectedInvoice.Bill_Number,
                Cost: newItemCommonData.Cost || '0',
                AMC: newItemCommonData.AMC,
                AMC_Upto: newItemCommonData.AMC_Upto,
                Warranty_Upto: selectedInvoiceItem.Warranty_Upto || '',
                Additional_Item: newItemCommonData.Additional_Item,
                Status: newItemCommonData.Status,
                Remarks: newItemCommonData.Remarks,
                Make: newItemCommonData.Make,
                Capacity: newItemCommonData.Capacity,
                RAM: newItemCommonData.RAM,
                OS: newItemCommonData.OS,
                Office: newItemCommonData.Office,
                Speed: newItemCommonData.Speed,
                IP: newItemCommonData.IP,
                MAC: newItemCommonData.MAC,
                Company_Serial: newItemCommonData.Company_Serial,
            });
        }

        // Fetch proposed serial from server and show confirmation popup
        try {
            const previewRes = await getJson(`/hardware/next-serial?category=${encodeURIComponent(urlCategory)}`);
            const previewData = await previewRes.json();
            setProposedSerial(previewData.proposedSerial || '');
            setSerialOverride(previewData.proposedSerial || '');
            setPendingItems(itemsToCreate);
            setShowSerialConfirm(true);
        } catch (error) {
            showAlert('error', 'Error fetching serial preview');
        }
    };

    const handleConfirmAndSave = async () => {
        if (!pendingItems) return;
        setShowSerialConfirm(false);
        setProcessing(true);
        try {
            // Only attach the override to the FIRST item; server will auto-increment for the rest
            const itemsToSend = pendingItems.map((item, idx) => ({
                ...item,
                ...(idx === 0 && serialOverride && serialOverride !== proposedSerial ? { EDP_Serial_Override: serialOverride } : {})
            }));

            const res = await postJson('/hardware', itemsToSend);

            if (res.ok) {
                const result = await res.json();
                showAlert('success', `${result.generatedItems.length} Items Added (Starting EDP: ${result.generatedItems[0]?.EDP_Serial})`);
                handleCloseModal();
                fetchHardware();
            } else {
                showAlert('error', 'Failed to save');
            }
        } catch (error) {
            showAlert('error', 'Error saving hardware');
        } finally {
            setProcessing(false);
            setPendingItems(null);
        }
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setWizardStep(1);
        setSelectedInvoice(null);
        setSelectedInvoiceItem(null);
        setNewItemCommonData({
            Make: '', Capacity: '', RAM: '', OS: '', Office: '', Speed: '',
            IP: '', MAC: '', Company_Serial: '', Additional_Item: '',
            Status: 'Working', Remarks: '', AMC: 'No', AMC_Upto: '', Cost: '0'
        });
    };

    // --- Inline Edit ---
    const startEdit = (item) => {
        setEditRowId(item.id);
        setEditFormData({ ...item });
    };

    const handleUpdate = async (id) => {
        if (editFormData.AMC === 'Yes' && !editFormData.AMC_Upto) {
            return showAlert('error', 'Please enter AMC Upto date');
        }
        setProcessing(true);
        try {
            const res = await putJson(`/hardware/${id}`, editFormData);
            if (res.ok) {
                showAlert('success', 'Updated Successfully');
                setEditRowId(null);
                setEditFormData({});
                fetchHardware();
            } else {
                showAlert('error', 'Update failed');
            }
        } catch (error) {
            showAlert('error', 'Error updating');
        } finally {
            setProcessing(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this item?')) return;
        setProcessing(true);
        try {
            const res = await deleteJson(`/hardware/${id}`);
            if (res.ok) {
                showAlert('success', 'Deleted');
                fetchHardware();
            } else {
                showAlert('error', 'Delete failed');
            }
        } catch (error) {
            showAlert('error', 'Error deleting');
        } finally {
            setProcessing(false);
        }
    };

    // --- Selection & Bulk Actions ---
    const toggleSelect = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredList.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredList.map(h => h.id));
        }
    };

    const handleBulkDelete = async () => {
        setProcessing(true);
        try {
            const res = await postJson('/hardware/bulk-delete', { ids: selectedIds });
            if (res.ok) {
                showAlert('success', 'Items deleted');
                setSelectedIds([]);
                fetchHardware();
            }
        } catch (error) {
            showAlert('error', 'Bulk delete failed');
        } finally {
            setProcessing(false);
            setShowDeleteConfirm(false);
            setDeleteConfirmText('');
        }
    };

    const handleBulkAMCUpdate = async () => {
        if (bulkAMCData.AMC === 'Yes' && !bulkAMCData.AMC_Upto) {
            return showAlert('error', 'Please enter AMC Upto date');
        }
        setProcessing(true);
        try {
            const res = await postJson('/hardware/bulk-update', {
                ids: selectedIds,
                updates: bulkAMCData
            });
            if (res.ok) {
                showAlert('success', 'Items updated');
                setSelectedIds([]);
                setShowBulkAMCModal(false);
                fetchHardware();
            }
        } catch (error) {
            showAlert('error', 'Bulk update failed');
        } finally {
            setProcessing(false);
        }
    };

    const handleDownloadExcel = async () => {
        setProcessing(true);
        try {
            // Check if running in Electron
            if (window.electronAPI && window.electronAPI.showSaveDialog) {
                // Fetch Excel buffer from server
                const res = await fetch(`http://localhost:3001/api/hardware/download-buffer?category=${encodeURIComponent(urlCategory)}`);
                const { buffer } = await res.json();

                // Show native Save As dialog
                const result = await window.electronAPI.showSaveDialog({
                    title: 'Save Excel File',
                    defaultPath: `${urlCategory}_hardware.xlsx`,
                    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
                });

                if (!result.canceled && result.filePath) {
                    // Write file directly to disk
                    await window.electronAPI.writeFile({
                        filePath: result.filePath,
                        buffer: buffer
                    });
                    showAlert('success', 'File saved successfully!');
                }
            } else {
                // Fallback - blob download (no blank window!)
                const response = await fetch(`http://localhost:3001/api/hardware/download?category=${encodeURIComponent(urlCategory)}`);
                if (!response.ok) throw new Error('Download failed');
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${urlCategory}_hardware.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                showAlert('success', 'File downloaded');
            }
        } catch (error) {
            console.error('Download error:', error);
            showAlert('error', 'Failed to download file');
        } finally {
            setProcessing(false);
        }
    };

    // --- Bulk Upload ---
    const [, setUploading] = useState(false);
    const fileInputRef = React.useRef(null);

    const handleUploadClick = async () => {
        // Check if running in Electron with native dialogs
        if (window.electronAPI && window.electronAPI.showOpenDialog) {
            try {
                // Show native Windows file picker
                const result = await window.electronAPI.showOpenDialog({
                    title: 'Select Excel File for Bulk Upload',
                    filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
                    properties: ['openFile']
                });

                if (result.canceled || !result.filePaths.length) return;

                const filePath = result.filePaths[0];
                const fileName = filePath.split('\\').pop() || filePath.split('/').pop();

                if (!window.confirm(`Upload ${fileName}? This will add items to the database.`)) return;

                setUploading(true);

                // Read file directly from disk via IPC
                const fileResult = await window.electronAPI.readFile(filePath);
                if (!fileResult.success) {
                    showAlert('error', 'Failed to read file');
                    return;
                }

                // First save to uploads dir, then process
                const saveResult = await window.electronAPI.saveFile({
                    name: `hardware_${Date.now()}_${fileName}`,
                    buffer: fileResult.data
                });

                if (!saveResult.success) {
                    showAlert('error', 'Failed to save file');
                    return;
                }

                // Tell server to process the saved file
                const res = await fetch('http://localhost:3001/api/hardware/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        processOnly: true,
                        fileName: saveResult.path.split('\\').pop() || saveResult.path.split('/').pop(),
                        defaultCategory: urlCategory // Pass current category as default
                    })
                });

                const data = await res.json();
                if (res.ok) {
                    showAlert('success', data.message || 'Items Uploaded');
                    fetchHardware();
                } else {
                    showAlert('error', data.error || 'Upload failed');
                }
            } catch (error) {
                console.error('Upload error:', error);
                showAlert('error', 'Error uploading file');
            } finally {
                setUploading(false);
            }
        } else {
            // Fallback for browser/dev mode
            if (fileInputRef.current) fileInputRef.current.click();
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!window.confirm(`Upload ${file.name}? This will add items to the database.`)) {
            e.target.value = null; // Reset
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('defaultCategory', urlCategory); // Pass current category as default

        try {
            const res = await fetch('http://localhost:3001/api/hardware/upload', {
                method: 'POST',
                body: formData
            });
            const result = await res.json();
            if (res.ok) {
                showAlert('success', result.message || 'Items Uploaded');
                fetchHardware();
            } else {
                showAlert('error', result.error || 'Upload failed');
            }
        } catch (error) {
            showAlert('error', 'Error uploading file');
        } finally {
            setUploading(false);
            if (e.target) e.target.value = null; // Reset input
        }
    };


    const showAlert = (type, msg) => {
        setAlert({ type, message: msg });
        setTimeout(() => setAlert(null), 3000);
    };

    // --- Render Helpers ---
    const getRowClass = (status) => {
        if (status === 'Not Working') return 'row-red';
        if (status === 'Under Repair') return 'row-orange';
        return '';
    };

    return (
        <div className="page-container">
            {processing && <div className="processing-overlay"><div className="spinner"></div><p>Processing...</p></div>}
            {alert && <div className={`alert alert-${alert.type}`}>{alert.message}</div>}

            <div className="page-header">
                <h1>{urlCategory} Assets</h1>
                <p>Manage {urlCategory} Inventory</p>
            </div>

            <div className="toolbar">
                <div className="toolbar-actions">
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        <FontAwesomeIcon icon={faPlus} /> Add Item
                    </button>
                    <button className="btn btn-outline" onClick={handleUploadClick}>
                        <FontAwesomeIcon icon={faFileExcel} /> Bulk Upload
                    </button>
                    <button className="btn btn-outline" onClick={handleDownloadExcel}>
                        <FontAwesomeIcon icon={faDownload} /> Download Excel
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept=".xlsx, .xls"
                        onChange={handleFileChange}
                    />
                </div>

                <div className="search-bar">
                    <select className="form-select" value={searchCriteria} onChange={(e) => setSearchCriteria(e.target.value)}>
                        <option value="EDP Serial Number">EDP Serial Number</option>
                        <option value="Company Serial">Company Serial</option>
                    </select>
                    <input type="text" className="form-input" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    <button className="btn btn-outline" onClick={handleClearSearch}><FontAwesomeIcon icon={faTimes} /> Clear</button>
                </div>
            </div>

            <div className="table-responsive" style={{ overflowX: 'auto' }}>
                <table className="supplier-table" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead>
                        <tr>
                            <th style={{ position: 'sticky', left: 0, zIndex: 3, backgroundColor: '#1a1a2e', color: '#fff', minWidth: '40px' }}><input type="checkbox" onChange={toggleSelectAll} checked={selectedIds.length === filteredList.length && filteredList.length > 0} /></th>
                            <th style={{ position: 'sticky', left: '40px', zIndex: 3, backgroundColor: '#1a1a2e', color: '#fff', minWidth: '90px' }}>Actions</th>
                            <th style={{ position: 'sticky', left: '130px', zIndex: 3, backgroundColor: '#1a1a2e', color: '#fff', minWidth: '120px', borderRight: '2px solid #e0e0e0' }}>Item Name</th>
                            <th style={{ position: 'sticky', left: '250px', zIndex: 3, backgroundColor: '#1a1a2e', color: '#fff', minWidth: '100px', borderRight: '2px solid #e0e0e0' }}>EDP Serial</th>
                            <th>Make</th>
                            <th>{capacityLabel}</th>
                            {colVisible('RAM') && <th>RAM</th>}
                            {colVisible('OS') && <th>OS</th>}
                            {colVisible('Office') && <th>Office</th>}
                            {colVisible('Speed') && <th>Speed</th>}
                            {colVisible('IP') && <th>IP</th>}
                            {colVisible('MAC') && <th>MAC</th>}
                            <th>Comp Serial</th>
                            <th>Bill No</th>
                            <th>Purchased</th>
                            <th>Cost</th>
                            <th>AMC</th>
                            <th>AMC Upto</th>
                            <th>Warranty Upto</th>
                            <th>Add. Item</th>
                            <th>Status</th>
                            <th>Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredList.map(item => (
                            <tr key={item.id} className={getRowClass(item.Status)} style={getRowClass(item.Status) === 'row-red' ? { backgroundColor: '#ffebeb' } : (getRowClass(item.Status) === 'row-orange' ? { backgroundColor: '#fff3e0' } : {})}>
                                {(() => {
                                    const stickyBg = item.Status === 'Not Working' ? '#ffebeb' : item.Status === 'Under Repair' ? '#fff3e0' : '#ffffff'; return (<>
                                        <td style={{ position: 'sticky', left: 0, zIndex: 1, backgroundColor: stickyBg, textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(item.id)}
                                                onChange={() => toggleSelect(item.id)}
                                            />
                                        </td>
                                        <td style={{ position: 'sticky', left: '40px', zIndex: 1, backgroundColor: stickyBg }}>
                                            <div className="action-buttons">
                                                <button className="btn-icon edit" onClick={() => startEdit(item)}><FontAwesomeIcon icon={faEdit} /></button>
                                                <button className="btn-icon delete" onClick={() => handleDelete(item.id)}><FontAwesomeIcon icon={faTrash} /></button>
                                            </div>
                                        </td>
                                        <td style={{ position: 'sticky', left: '130px', zIndex: 1, backgroundColor: stickyBg, borderRight: '2px solid #e0e0e0', fontWeight: 600 }}>{item.Item_Name}</td>
                                        <td style={{ position: 'sticky', left: '250px', zIndex: 1, backgroundColor: stickyBg, borderRight: '2px solid #e0e0e0', fontWeight: 600 }}>{item.EDP_Serial}</td>
                                    </>);
                                })()}
                                <td>{item.Make}</td>
                                <td>{item.Capacity}</td>
                                {colVisible('RAM') && <td>{item.RAM}</td>}
                                {colVisible('OS') && <td>{item.OS}</td>}
                                {colVisible('Office') && <td>{item.Office}</td>}
                                {colVisible('Speed') && <td>{item.Speed}</td>}
                                {colVisible('IP') && <td>{item.IP}</td>}
                                {colVisible('MAC') && <td>{item.MAC}</td>}
                                <td>{item.Company_Serial}</td>
                                <td>{item.Bill_Number}</td>
                                <td>{getPurchasedDate(item.Bill_Number)}</td>
                                <td>{item.Cost}</td>
                                <td>{item.AMC}</td>
                                <td>{item.AMC === 'Yes' ? formatDate(item.AMC_Upto) : '-'}</td>
                                <td>{formatDate(item.Warranty_Upto)}</td>
                                <td>{item.Additional_Item}</td>
                                <td>{item.Status}</td>
                                <td>{item.Remarks}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Edit Hardware Modal */}
            {editRowId && (
                <div className="modal-overlay">
                    <div className="modal-content modal-lg">
                        <div className="modal-header">
                            <h3>Edit {editFormData.Item_Name} — {editFormData.EDP_Serial}</h3>
                        </div>
                        <div className="modal-body">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Item Name</label>
                                    <input type="text" className="form-input" value={editFormData.Item_Name || ''} disabled style={{ backgroundColor: '#f0f0f0' }} />
                                </div>
                                <div className="form-group">
                                    <label>EDP Serial</label>
                                    <input type="text" className="form-input" value={editFormData.EDP_Serial || ''} disabled style={{ backgroundColor: '#f0f0f0' }} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Make</label>
                                    <select className="form-select" value={editFormData.Make || ''} onChange={e => setEditFormData({ ...editFormData, Make: e.target.value })}>
                                        <option value="">Select</option>
                                        {makeOptions.map(make => <option key={make} value={make}>{make}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>{capacityLabel}</label>
                                    {capacityOptions.length > 0 ? (
                                        <select className="form-select" value={editFormData.Capacity || ''} onChange={e => setEditFormData({ ...editFormData, Capacity: e.target.value })}>
                                            <option value="">Select {capacityLabel}</option>
                                            {capacityOptions.map(cap => <option key={cap} value={cap}>{cap}</option>)}
                                            {editFormData.Capacity && !capacityOptions.includes(editFormData.Capacity) && (
                                                <option value={editFormData.Capacity}>{editFormData.Capacity} (current)</option>
                                            )}
                                        </select>
                                    ) : (
                                        <input type="text" className="form-input" placeholder={capacityLabel} value={editFormData.Capacity || ''} onChange={e => setEditFormData({ ...editFormData, Capacity: e.target.value })} />
                                    )}
                                </div>
                                {colVisible('RAM') && <div className="form-group">
                                    <label>RAM</label>
                                    <input type="text" className="form-input" value={editFormData.RAM || ''} onChange={e => setEditFormData({ ...editFormData, RAM: e.target.value })} />
                                </div>}
                            </div>
                            <div className="form-row">
                                {colVisible('OS') && <div className="form-group">
                                    <label>OS</label>
                                    <input type="text" className="form-input" value={editFormData.OS || ''} onChange={e => setEditFormData({ ...editFormData, OS: e.target.value })} />
                                </div>}
                                {colVisible('Office') && <div className="form-group">
                                    <label>Office</label>
                                    <input type="text" className="form-input" value={editFormData.Office || ''} onChange={e => setEditFormData({ ...editFormData, Office: e.target.value })} />
                                </div>}
                                {colVisible('Speed') && <div className="form-group">
                                    <label>Speed</label>
                                    <input type="text" className="form-input" value={editFormData.Speed || ''} onChange={e => setEditFormData({ ...editFormData, Speed: e.target.value })} />
                                </div>}
                            </div>
                            <div className="form-row">
                                {colVisible('IP') && <div className="form-group">
                                    <label>IP Address</label>
                                    <input type="text" className="form-input" placeholder="192.168.1.1" value={editFormData.IP || ''}
                                        onChange={e => setEditFormData({ ...editFormData, IP: formatIP(e.target.value) })}
                                        style={editFormData.IP && !isValidIP(editFormData.IP) ? { borderColor: '#dc3545' } : {}}
                                    />
                                    {editFormData.IP && !isValidIP(editFormData.IP) && <small style={{ color: '#dc3545' }}>Invalid IP (e.g. 192.168.1.1)</small>}
                                </div>}
                                {colVisible('MAC') && <div className="form-group">
                                    <label>MAC Address</label>
                                    <input type="text" className="form-input" placeholder="AA:BB:CC:DD:EE:FF" value={editFormData.MAC || ''}
                                        onChange={e => setEditFormData({ ...editFormData, MAC: formatMAC(e.target.value) })}
                                        style={editFormData.MAC && !isValidMAC(editFormData.MAC) ? { borderColor: '#dc3545' } : {}}
                                    />
                                    {editFormData.MAC && !isValidMAC(editFormData.MAC) && <small style={{ color: '#dc3545' }}>Invalid MAC (e.g. AA:BB:CC:DD:EE:FF)</small>}
                                </div>}
                                <div className="form-group">
                                    <label>Company Serial</label>
                                    <input type="text" className="form-input" value={editFormData.Company_Serial || ''} onChange={e => setEditFormData({ ...editFormData, Company_Serial: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Bill Number</label>
                                    <select className="form-select" value={editFormData.Bill_Number || ''} onChange={e => setEditFormData({ ...editFormData, Bill_Number: e.target.value })}>
                                        <option value="">Select</option>
                                        {invoices.map(i => <option key={i.id} value={i.Bill_Number}>{i.Bill_Number}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Cost (Rs.)</label>
                                    <input type="number" className="form-input" value={editFormData.Cost || ''} onChange={e => setEditFormData({ ...editFormData, Cost: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>AMC</label>
                                    <select className="form-select" value={editFormData.AMC || 'No'} onChange={e => setEditFormData({ ...editFormData, AMC: e.target.value })}>
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </div>
                                {editFormData.AMC === 'Yes' && (
                                    <div className="form-group">
                                        <label>AMC Upto</label>
                                        <input type="date" className="form-input" value={editFormData.AMC_Upto || ''} onChange={e => setEditFormData({ ...editFormData, AMC_Upto: e.target.value })} />
                                    </div>
                                )}
                                <div className="form-group">
                                    <label>Warranty Upto</label>
                                    <input type="date" className="form-input" value={editFormData.Warranty_Upto || ''} onChange={e => setEditFormData({ ...editFormData, Warranty_Upto: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Additional Item</label>
                                    <input type="text" className="form-input" value={editFormData.Additional_Item || ''} onChange={e => setEditFormData({ ...editFormData, Additional_Item: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Status</label>
                                    <select className="form-select" value={editFormData.Status || 'Working'} onChange={e => setEditFormData({ ...editFormData, Status: e.target.value })}>
                                        <option value="Working">Working</option>
                                        <option value="Not Working">Not Working</option>
                                        <option value="Under Repair">Under Repair</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Remarks</label>
                                    <input type="text" className="form-input" value={editFormData.Remarks || ''} onChange={e => setEditFormData({ ...editFormData, Remarks: e.target.value })} />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => { setEditRowId(null); setEditFormData({}); }}>Close</button>
                            <button className="btn btn-primary" onClick={() => handleUpdate(editRowId)}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Item Wizard Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header"><h3>Add {urlCategory} - Step {wizardStep}</h3></div>
                        <div className="modal-body">
                            {wizardStep === 1 && (
                                <div className="form-group">
                                    <label>Select Bill Number</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Type to search bill number..."
                                        value={selectedInvoice?.Bill_Number || ''}
                                        onChange={e => {
                                            const value = e.target.value;
                                            const inv = invoiceMap.get(String(value));
                                            if (inv) {
                                                handleSelectInvoice({ target: { value } });
                                            } else {
                                                setSelectedInvoice({ Bill_Number: value });
                                            }
                                        }}
                                        list="invoice-bills"
                                    />
                                    <datalist id="invoice-bills">
                                        {invoices.map(inv => (
                                            <option key={inv.id} value={inv.Bill_Number}>{inv.Bill_Number} - {inv.Firm_Name}</option>
                                        ))}
                                    </datalist>
                                    <div className="modal-footer-inline">
                                        <button className="btn btn-primary" onClick={handleStep1Next}>Next</button>
                                        <button className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                                    </div>
                                </div>
                            )}

                            {wizardStep === 2 && selectedInvoice && (
                                <div>
                                    <p><strong>Bill:</strong> {selectedInvoice.Bill_Number}</p>
                                    <label>Select Item to Add Stock:</label>
                                    <div className="list-group" style={{ marginTop: '10px', border: '1px solid #ddd', maxHeight: '200px', overflowY: 'auto' }}>
                                        {selectedInvoice.Items && selectedInvoice.Items.map((item, idx) => (
                                            <div
                                                key={idx}
                                                className={`list-item ${selectedInvoiceItem === item ? 'selected' : ''}`}
                                                style={{ padding: '10px', borderBottom: '1px solid #eee', cursor: 'pointer', backgroundColor: selectedInvoiceItem === item ? '#e6f7ff' : '#fff' }}
                                                onClick={() => setSelectedInvoiceItem(item)}
                                            >
                                                <strong>{item.Hardware_Item}</strong> - Qty: {item.Quantity} ({item.Item_Details})
                                            </div>
                                        ))}
                                    </div>
                                    <div className="modal-footer-inline">
                                        <button className="btn btn-outline" onClick={() => setWizardStep(1)}>Back</button>
                                        <button className="btn btn-primary" onClick={handleStep2Next}>Next</button>
                                        <button className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                                    </div>
                                </div>
                            )}

                            {wizardStep === 3 && selectedInvoiceItem && (
                                <div>
                                    <p>Adding <strong>{selectedInvoiceItem.Quantity}</strong> units of <strong>{selectedInvoiceItem.Hardware_Item}</strong></p>
                                    <p className="helper-text">Enter common details for all units. You can edit unique details (like Serial No) later in the list.</p>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Make</label>
                                            <select className="form-select" value={newItemCommonData.Make} onChange={e => setNewItemCommonData({ ...newItemCommonData, Make: e.target.value })}>
                                                <option value="">Select Company</option>
                                                {makeOptions.map(make => <option key={make} value={make}>{make}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group"><label>{capacityLabel}</label>{capacityOptions.length > 0 ? (<select className="form-select" value={newItemCommonData.Capacity} onChange={e => setNewItemCommonData({ ...newItemCommonData, Capacity: e.target.value })}><option value="">Select {capacityLabel}</option>{capacityOptions.map(cap => <option key={cap} value={cap}>{cap}</option>)}</select>) : (<input type="text" className="form-input" placeholder={capacityLabel} value={newItemCommonData.Capacity} onChange={e => setNewItemCommonData({ ...newItemCommonData, Capacity: e.target.value })} />)}</div>
                                        {colVisible('RAM') && <div className="form-group"><label>RAM</label><input type="text" className="form-input" value={newItemCommonData.RAM} onChange={e => setNewItemCommonData({ ...newItemCommonData, RAM: e.target.value })} /></div>}
                                    </div>
                                    <div className="form-row">
                                        {colVisible('OS') && <div className="form-group"><label>OS</label><input type="text" className="form-input" value={newItemCommonData.OS} onChange={e => setNewItemCommonData({ ...newItemCommonData, OS: e.target.value })} /></div>}
                                        {colVisible('Office') && <div className="form-group"><label>Office</label><input type="text" className="form-input" value={newItemCommonData.Office} onChange={e => setNewItemCommonData({ ...newItemCommonData, Office: e.target.value })} /></div>}
                                        {colVisible('Speed') && <div className="form-group"><label>Speed</label><input type="text" className="form-input" value={newItemCommonData.Speed} onChange={e => setNewItemCommonData({ ...newItemCommonData, Speed: e.target.value })} /></div>}
                                    </div>
                                    <div className="form-row">
                                        {colVisible('IP') && <div className="form-group"><label>IP Address</label><input type="text" className="form-input" placeholder="192.168.1.1" value={newItemCommonData.IP} onChange={e => setNewItemCommonData({ ...newItemCommonData, IP: formatIP(e.target.value) })} style={newItemCommonData.IP && !isValidIP(newItemCommonData.IP) ? { borderColor: '#dc3545' } : {}} />{newItemCommonData.IP && !isValidIP(newItemCommonData.IP) && <small style={{ color: '#dc3545' }}>Invalid IP</small>}</div>}
                                        {colVisible('MAC') && <div className="form-group"><label>MAC Address</label><input type="text" className="form-input" placeholder="AA:BB:CC:DD:EE:FF" value={newItemCommonData.MAC} onChange={e => setNewItemCommonData({ ...newItemCommonData, MAC: formatMAC(e.target.value) })} style={newItemCommonData.MAC && !isValidMAC(newItemCommonData.MAC) ? { borderColor: '#dc3545' } : {}} />{newItemCommonData.MAC && !isValidMAC(newItemCommonData.MAC) && <small style={{ color: '#dc3545' }}>Invalid MAC</small>}</div>}
                                        <div className="form-group"><label>Company Serial</label><input type="text" className="form-input" value={newItemCommonData.Company_Serial} onChange={e => setNewItemCommonData({ ...newItemCommonData, Company_Serial: e.target.value })} /></div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group"><label>Cost (Rs.)</label><input type="number" className="form-input" value={newItemCommonData.Cost} onChange={e => setNewItemCommonData({ ...newItemCommonData, Cost: e.target.value })} /></div>
                                        <div className="form-group"><label>Additional Item</label><input type="text" className="form-input" value={newItemCommonData.Additional_Item} onChange={e => setNewItemCommonData({ ...newItemCommonData, Additional_Item: e.target.value })} /></div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group"><label>AMC</label>
                                            <select className="form-select" value={newItemCommonData.AMC} onChange={e => setNewItemCommonData({ ...newItemCommonData, AMC: e.target.value })}>
                                                <option value="No">No</option>
                                                <option value="Yes">Yes</option>
                                            </select>
                                        </div>
                                        {newItemCommonData.AMC === 'Yes' && (
                                            <div className="form-group"><label>AMC Upto</label><input type="date" className="form-input" value={newItemCommonData.AMC_Upto} onChange={e => setNewItemCommonData({ ...newItemCommonData, AMC_Upto: e.target.value })} /></div>
                                        )}
                                        <div className="form-group"><label>Status</label>
                                            <select className="form-select" value={newItemCommonData.Status} onChange={e => setNewItemCommonData({ ...newItemCommonData, Status: e.target.value })}>
                                                <option value="Working">Working</option>
                                                <option value="Not Working">Not Working</option>
                                                <option value="Under Repair">Under Repair</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="modal-footer-inline">
                                        <button className="btn btn-outline" onClick={() => setWizardStep(2)}>Back</button>
                                        <button className="btn btn-primary" onClick={handleSaveNewItems}>Save All</button>
                                        <button className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            )}
            {/* Bulk Actions Bar */}
            {selectedIds.length > 0 && (
                <div className="bulk-action-bar" style={{
                    position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
                    backgroundColor: '#333', color: 'white', padding: '15px 30px', borderRadius: '50px',
                    display: 'flex', alignItems: 'center', gap: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.3)', zIndex: 1001
                }}>
                    <span><strong>{selectedIds.length}</strong> items selected</span>
                    <button className="btn btn-small" style={{ backgroundColor: '#ff4d4d' }} onClick={() => { setDeleteConfirmText(''); setShowDeleteConfirm(true); }}>
                        <FontAwesomeIcon icon={faTrash} /> Bulk Delete
                    </button>
                    <button className="btn btn-small" style={{ backgroundColor: '#ffd700', color: '#000' }} onClick={() => setShowBulkAMCModal(true)}>
                        Bulk Update AMC
                    </button>
                    <button className="btn-icon" style={{ color: 'white' }} onClick={() => setSelectedIds([])}><FontAwesomeIcon icon={faTimes} /></button>
                </div>
            )}

            {/* EDP Serial Confirmation Popup */}
            {showSerialConfirm && (
                <div className="modal-overlay">
                    <div className="modal-content modal-md">
                        <div className="modal-header"><h3 style={{ color: '#008080' }}>📋 Verify EDP Serial Number</h3></div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '10px' }}>The system has proposed the following starting EDP Serial Number for the new item(s):</p>
                            <div style={{ textAlign: 'center', margin: '20px 0', padding: '15px', background: '#f0f9f9', borderRadius: '8px', border: '2px solid #008080' }}>
                                <span style={{ fontSize: '1.8em', fontWeight: 'bold', color: '#008080', letterSpacing: '3px' }}>{proposedSerial}</span>
                            </div>
                            <p style={{ marginBottom: '10px', color: '#666' }}>If this is <strong>not correct</strong>, please type the correct starting serial number below:</p>
                            <input
                                type="text"
                                className="form-input"
                                placeholder={`e.g. ${proposedSerial}`}
                                value={serialOverride}
                                onChange={e => setSerialOverride(e.target.value.toUpperCase())}
                                style={{ textAlign: 'center', fontSize: '1.2em', letterSpacing: '2px', fontWeight: 'bold' }}
                            />
                            <p className="text-muted text-xs mt-sm">
                                ⚠ Please double-check the last used serial in the list to avoid duplicates or skipped numbers.
                            </p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => { setShowSerialConfirm(false); setPendingItems(null); }}>Cancel</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleConfirmAndSave}
                                disabled={!serialOverride}
                            >
                                ✓ Confirm & Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="modal-overlay">
                    <div className="modal-content modal-sm">
                        <div className="modal-header"><h3 style={{ color: '#ff4d4d' }}>⚠ Confirm Bulk Delete</h3></div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '10px' }}>You are about to permanently delete <strong>{selectedIds.length}</strong> hardware item(s).</p>
                            <p style={{ marginBottom: '15px', color: '#999' }}>This action cannot be undone. To confirm, type <strong style={{ color: '#ff4d4d' }}>DELETE</strong> below:</p>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Type DELETE to confirm"
                                value={deleteConfirmText}
                                onChange={e => setDeleteConfirmText(e.target.value)}
                                autoFocus
                                style={{ textAlign: 'center', fontSize: '1.1em', letterSpacing: '2px' }}
                            />
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}>Cancel</button>
                            <button
                                className="btn"
                                style={{ backgroundColor: deleteConfirmText === 'DELETE' ? '#ff4d4d' : '#ccc', color: 'white' }}
                                disabled={deleteConfirmText !== 'DELETE'}
                                onClick={handleBulkDelete}
                            >
                                Delete {selectedIds.length} Items
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk AMC Update Modal */}
            {showBulkAMCModal && (
                <div className="modal-overlay">
                    <div className="modal-content modal-sm">
                        <div className="modal-header"><h3>Bulk Update AMC</h3></div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>AMC Status</label>
                                <select className="form-select" value={bulkAMCData.AMC} onChange={e => setBulkAMCData({ ...bulkAMCData, AMC: e.target.value })}>
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                </select>
                            </div>
                            {bulkAMCData.AMC === 'Yes' && (
                                <div className="form-group">
                                    <label>AMC Upto</label>
                                    <input type="date" className="form-input" value={bulkAMCData.AMC_Upto} onChange={e => setBulkAMCData({ ...bulkAMCData, AMC_Upto: e.target.value })} />
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowBulkAMCModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleBulkAMCUpdate}>Update All</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Hardware;
