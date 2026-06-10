import React, { useState, useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTimes, faEdit, faTrash, faFileExcel, faDownload } from '@fortawesome/free-solid-svg-icons';

const Suppliers = () => {
    // --- State ---
    const [suppliers, setSuppliers] = useState([]);
    const [, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false); // Global processing overlay
    const [alert, setAlert] = useState(null); // { type: 'success'|'error', message: '' }

    // Search
    const [searchCriteria, setSearchCriteria] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');

    // Modal (Add / Edit)
    const [showModal, setShowModal] = useState(false);
    const [editingSupplierId, setEditingSupplierId] = useState(null);
    const [modalSupplier, setModalSupplier] = useState({
        Supplier_ID: '',
        Category: '',
        Supplier_Name: '',
        Address_1: '',
        Address_2: '',
        City: '',
        State: '',
        PIN_Code: '',
        POC_Person: '',
        Phone_Number: '',
        Email: ''
    });

    // --- Effects ---
    useEffect(() => {
        fetchSuppliers();
    }, []);

    // --- API Functions ---
    const fetchSuppliers = async () => {
        setLoading(true);
        try {
            const response = await fetch('http://localhost:3001/api/suppliers');
            const data = await response.json();
            setSuppliers(data);
        } catch (error) {
            console.error('Error fetching suppliers:', error);
            showAlert('error', `Failed to load suppliers: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenAddModal = () => {
        let maxId = 0;
        suppliers.forEach(s => {
            if (s.Supplier_ID && s.Supplier_ID.startsWith('S')) {
                const num = parseInt(s.Supplier_ID.substring(1), 10);
                if (!isNaN(num) && num > maxId) maxId = num;
            }
        });
        const nextId = `S${String(maxId + 1).padStart(3, '0')}`;
        setEditingSupplierId(null);
        setModalSupplier({
            Supplier_ID: nextId, Category: '', Supplier_Name: '', Address_1: '', Address_2: '',
            City: '', State: '', PIN_Code: '', POC_Person: '', Phone_Number: '', Email: ''
        });
        setShowModal(true);
    };

    const handleOpenEditModal = (supplier) => {
        setEditingSupplierId(supplier.Supplier_ID);
        setModalSupplier({ ...supplier });
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingSupplierId(null);
    };

    const handleSaveSupplier = async () => {
        if (!modalSupplier.Supplier_ID || !modalSupplier.Category || !modalSupplier.Supplier_Name || !modalSupplier.Address_1 || !modalSupplier.City) {
            showAlert('error', 'Please fill in all required fields');
            return;
        }

        setProcessing(true);
        try {
            const url = editingSupplierId
                ? `http://localhost:3001/api/suppliers/${editingSupplierId}`
                : 'http://localhost:3001/api/suppliers';
            const method = editingSupplierId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(modalSupplier)
            });

            if (response.ok) {
                showAlert('success', editingSupplierId ? 'Supplier Updated' : 'Supplier Added');
                handleCloseModal();
                fetchSuppliers();
            } else {
                showAlert('error', editingSupplierId ? 'Failed to update supplier' : 'Failed to add supplier');
            }
        } catch (error) {
            showAlert('error', 'Error saving supplier');
        } finally {
            setProcessing(false);
        }
    };

    const handleDeleteSupplier = async (id, s_id) => {
        if (window.confirm('Are you sure you want to delete this supplier?')) {
            setProcessing(true);
            try {
                const response = await fetch(`http://localhost:3001/api/suppliers/${id || s_id}`, {
                    method: 'DELETE'
                });
                if (response.ok) {
                    showAlert('success', 'Supplier Deleted');
                    fetchSuppliers();
                } else {
                    showAlert('error', 'Failed to delete supplier');
                }
            } catch (error) {
                showAlert('error', 'Error deleting supplier');
            } finally {
                setProcessing(false);
            }
        }
    };

    // Excel Variables
    const fileInputRef = React.useRef(null);

    // Safe check for Electron API
    const isElectron = () => window.electronAPI && typeof window.electronAPI.showOpenDialog === 'function';

    // Browser fallback upload handler
    const handleUpload = async (e) => {
        const file = e?.target?.files?.[0];
        if (!file) return;
        setProcessing(true);
        try {
            // Convert to base64 for server
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const response = await fetch('http://localhost:3001/api/suppliers/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fileData: event.target.result })
                    });
                    const data = await response.json();
                    if (response.ok) {
                        showAlert('success', data.message || 'Suppliers uploaded');
                        fetchSuppliers();
                    } else {
                        showAlert('error', data.error || 'Upload failed');
                    }
                } catch (err) {
                    showAlert('error', 'Error uploading file');
                } finally {
                    setProcessing(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('Upload error:', error);
            showAlert('error', 'Error uploading file');
            setProcessing(false);
        }
    };

    // Native upload with proper error handling
    const handleNativeUpload = async () => {
        if (!isElectron()) {
            // Fallback to file input
            if (fileInputRef.current) fileInputRef.current.click();
            return;
        }

        try {
            const result = await window.electronAPI.showOpenDialog({
                title: 'Select Excel File for Bulk Upload',
                filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
                properties: ['openFile']
            });

            if (result.canceled || !result.filePaths?.length) return;

            const filePath = result.filePaths[0];
            const fileName = filePath.split('\\').pop() || filePath.split('/').pop();

            if (!window.confirm(`Upload ${fileName}? This will add suppliers.`)) return;

            setProcessing(true);

            const fileResult = await window.electronAPI.readFile(filePath);
            if (!fileResult?.success) {
                showAlert('error', 'Failed to read file');
                setProcessing(false);
                return;
            }

            const saveResult = await window.electronAPI.saveFile({
                name: `suppliers_${Date.now()}_${fileName}`,
                buffer: fileResult.data
            });

            if (!saveResult?.success) {
                showAlert('error', 'Failed to save file');
                setProcessing(false);
                return;
            }

            const savedFileName = saveResult.path.split('\\').pop() || saveResult.path.split('/').pop();

            const res = await fetch('http://localhost:3001/api/suppliers/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ processOnly: true, fileName: savedFileName })
            });

            const data = await res.json();
            if (res.ok) {
                showAlert('success', data.message || 'Suppliers uploaded');
                fetchSuppliers();
            } else {
                showAlert('error', data.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            showAlert('error', 'Error uploading file');
        } finally {
            setProcessing(false);
        }
    };

    // Native download - NO blank window!
    const handleFileDownload = async () => {
        setProcessing(true);
        try {
            if (isElectron()) {
                // Fetch buffer FIRST before showing dialog
                const res = await fetch('http://localhost:3001/api/suppliers/download-buffer');
                const data = await res.json();

                if (!data.buffer) throw new Error('No data received');

                // NOW show save dialog
                const result = await window.electronAPI.showSaveDialog({
                    title: 'Save Suppliers Excel',
                    defaultPath: 'suppliers.xlsx',
                    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
                });

                if (!result.canceled && result.filePath) {
                    await window.electronAPI.writeFile({
                        filePath: result.filePath,
                        buffer: data.buffer
                    });
                    showAlert('success', 'File saved!');
                }
            } else {
                // Browser fallback - blob download
                const response = await fetch('http://localhost:3001/api/suppliers/download');
                if (!response.ok) throw new Error('Download failed');
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'suppliers.xlsx';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                showAlert('success', 'File downloaded');
            }
        } catch (error) {
            console.error('Download error:', error);
            showAlert('error', 'Error downloading file');
        } finally {
            setProcessing(false);
        }
    };

    // --- Logic Helpers ---
    const generateSupplierID = () => {
        let maxId = 0;
        suppliers.forEach(s => {
            if (s.Supplier_ID && s.Supplier_ID.startsWith('S')) {
                const num = parseInt(s.Supplier_ID.substring(1), 10);
                if (!isNaN(num) && num > maxId) maxId = num;
            }
        });
        const id = `S${String(maxId + 1).padStart(3, '0')}`;
        if (!suppliers.some(s => s.Supplier_ID === id)) {
            setModalSupplier({ ...modalSupplier, Supplier_ID: id });
        } else {
            showAlert('error', 'Error generating ID');
        }
    };

    // --- Computed Search (instant) ---
    const filteredSuppliers = useMemo(() => {
        if (!searchQuery) return suppliers;
        try {
            const query = searchQuery.toLowerCase();
            return suppliers.filter(s => {
                try {
                    if (searchCriteria === 'Supplier Name') {
                        return String(s.Supplier_Name || '').toLowerCase().includes(query);
                    } else if (searchCriteria === 'City') {
                        return String(s.City || '').toLowerCase().includes(query);
                    } else if (searchCriteria === 'State') {
                        return String(s.State || '').toLowerCase().includes(query);
                    }
                    return String(s.Supplier_Name || '').toLowerCase().includes(query) ||
                        String(s.City || '').toLowerCase().includes(query) ||
                        String(s.State || '').toLowerCase().includes(query);
                } catch { return false; }
            });
        } catch { return suppliers; }
    }, [searchQuery, searchCriteria, suppliers]);

    const handleClearSearch = () => {
        setSearchQuery('');
        setSearchCriteria('All');
    };

    const showAlert = (type, msg) => {
        setAlert({ type, message: msg });
        setTimeout(() => setAlert(null), 3000);
    };





    return (
        <div className="page-container">
            {/* Processing Overlay */}
            {processing && (
                <div className="processing-overlay">
                    <div className="spinner"></div>
                    <p>Processing...</p>
                </div>
            )}

            {/* Alert */}
            {alert && (
                <div className={`alert alert-${alert.type}`}>
                    {alert.message}
                </div>
            )}

            {/* Header */}
            <div className="page-header">
                <h1>Suppliers</h1>
                <p>Add and manage your suppliers</p>
            </div>

            {/* Toolbar */}
            <div className="toolbar">
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" onClick={handleOpenAddModal}>
                        <FontAwesomeIcon icon={faPlus} /> New Supplier
                    </button>
                    {/* Excel Buttons */}
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        style={{ display: 'none' }}
                        ref={fileInputRef}
                        onChange={handleUpload}
                    />
                    <button className="btn btn-outline" onClick={handleNativeUpload}>
                        <FontAwesomeIcon icon={faFileExcel} style={{ color: 'green' }} /> Bulk Upload
                    </button>
                    <button className="btn btn-outline" onClick={handleFileDownload}>
                        <FontAwesomeIcon icon={faDownload} /> Download Excel
                    </button>
                </div>

                <div className="search-bar">
                    <select
                        value={searchCriteria}
                        onChange={(e) => setSearchCriteria(e.target.value)}
                        className="form-select"
                    >
                        <option value="All">All</option>
                        <option value="Supplier Name">Supplier Name</option>
                        <option value="City">City</option>
                        <option value="State">State</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="form-input"
                    />
                    <button className="btn btn-outline" onClick={handleClearSearch}>
                        <FontAwesomeIcon icon={faTimes} /> Clear
                    </button>
                </div>
            </div>

            {/* Modal - Add / Edit Supplier */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>{editingSupplierId ? 'Edit Supplier' : 'Add New Supplier'}</h3>
                        </div>
                        <div className="modal-body">
                            <div className="form-group-row">
                                <label>Supplier ID {editingSupplierId ? '' : '(Auto)'}:</label>
                                <div className="input-with-button">
                                    <input type="text" value={modalSupplier.Supplier_ID} readOnly className="form-input readonly" />
                                    {!editingSupplierId && <button className="btn btn-small" onClick={generateSupplierID}>Generate</button>}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Category <span className="required">*</span></label>
                                <select
                                    value={modalSupplier.Category}
                                    onChange={(e) => setModalSupplier({ ...modalSupplier, Category: e.target.value })}
                                    className="form-select"
                                >
                                    <option value="">Select Category</option>
                                    <option value="Hardware">Hardware</option>
                                    <option value="Software">Software</option>
                                    <option value="Consumables">Consumables</option>
                                    <option value="All (H/S/C)">All (H/S/C)</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Supplier Name <span className="required">*</span></label>
                                <input type="text" className="form-input" value={modalSupplier.Supplier_Name} onChange={(e) => setModalSupplier({ ...modalSupplier, Supplier_Name: e.target.value })} />
                            </div>

                            <div className="form-group">
                                <label>Address 1 <span className="required">*</span></label>
                                <input type="text" className="form-input" value={modalSupplier.Address_1} onChange={(e) => setModalSupplier({ ...modalSupplier, Address_1: e.target.value })} />
                            </div>

                            <div className="form-group">
                                <label>Address 2</label>
                                <input type="text" className="form-input" value={modalSupplier.Address_2} onChange={(e) => setModalSupplier({ ...modalSupplier, Address_2: e.target.value })} />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>City <span className="required">*</span></label>
                                    <input type="text" className="form-input" value={modalSupplier.City} onChange={(e) => setModalSupplier({ ...modalSupplier, City: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>State</label>
                                    <input type="text" className="form-input" value={modalSupplier.State} onChange={(e) => setModalSupplier({ ...modalSupplier, State: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>PIN Code</label>
                                    <input type="number" className="form-input" value={modalSupplier.PIN_Code} onChange={(e) => setModalSupplier({ ...modalSupplier, PIN_Code: e.target.value })} />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>POC Person</label>
                                    <input type="text" className="form-input" value={modalSupplier.POC_Person} onChange={(e) => setModalSupplier({ ...modalSupplier, POC_Person: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Phone Number</label>
                                    <input type="text" className="form-input" value={modalSupplier.Phone_Number} onChange={(e) => setModalSupplier({ ...modalSupplier, Phone_Number: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Email</label>
                                <input type="text" className="form-input" value={modalSupplier.Email} onChange={(e) => setModalSupplier({ ...modalSupplier, Email: e.target.value })} />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-primary" onClick={handleSaveSupplier}>
                                {editingSupplierId ? 'Update Supplier' : 'Save Supplier'}
                            </button>
                            <button className="btn btn-outline" onClick={handleCloseModal}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="table-responsive">
                <table className="supplier-table">
                    <thead>
                        <tr>
                            <th style={{ width: '7%' }}>Actions</th>
                            <th style={{ width: '5%' }}>ID</th>
                            <th style={{ width: '7%' }}>Category</th>
                            <th style={{ width: '20%' }}>Name</th>
                            <th style={{ width: '8%' }}>Address 1</th>
                            <th style={{ width: '10%' }}>Address 2</th>
                            <th style={{ width: '7%' }}>City</th>
                            <th style={{ width: '7%' }}>State</th>
                            <th style={{ width: '7%' }}>PIN</th>
                            <th style={{ width: '8%' }}>POC</th>
                            <th style={{ width: '8%' }}>Phone</th>
                            <th style={{ width: '8%' }}>Email</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSuppliers.length > 0 ? (
                            filteredSuppliers.map((s) => (
                                <tr key={s.Supplier_ID}>
                                    <td>
                                        <div className="action-buttons">
                                            <button className="btn-icon edit" title="Edit" onClick={() => handleOpenEditModal(s)}><FontAwesomeIcon icon={faEdit} /></button>
                                            <button className="btn-icon delete" title="Delete" onClick={() => handleDeleteSupplier(s.id, s.Supplier_ID)}><FontAwesomeIcon icon={faTrash} /></button>
                                        </div>
                                    </td>
                                    <td>{s.Supplier_ID}</td>
                                    <td>{s.Category}</td>
                                    <td>{s.Supplier_Name}</td>
                                    <td>{s.Address_1}</td>
                                    <td>{s.Address_2}</td>
                                    <td>{s.City}</td>
                                    <td>{s.State}</td>
                                    <td>{s.PIN_Code}</td>
                                    <td>{s.POC_Person}</td>
                                    <td>{s.Phone_Number}</td>
                                    <td>{s.Email}</td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan="12" className="no-data">No data found</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

        </div >
    );
};

export default Suppliers;
