import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatDate } from '../utils/formatDate';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { getJson, postJson, putJson, deleteJson, downloadBlob, apiFetch } from '../utils/api';
import {
    faPlus,
    faEdit,
    faTrash,
    faFileExcel,
    faDownload,
    faTimes,
    faFilePdf
} from '@fortawesome/free-solid-svg-icons';

const Software = () => {
    const [software, setSoftware] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [sectionsConfig, setSectionsConfig] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [alert, setAlert] = useState(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [employeeSearch, setEmployeeSearch] = useState('');

    // Bulk Delete
    const [selectedIds, setSelectedIds] = useState([]);

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({
        Software_Name: '',
        Quantity: 1,
        Source: 'Purchased',
        Bill_Number: '',
        Vendor_Name: '',
        Letter_Number: '',
        Purchase_Date: '',
        Amount: 0,
        Valid_Upto: '',
        Issued_To: '',
        License_Code: '',
        Additional_Info: '',
        Multiple_Issued: []
    });

    const uploadFileRef = useRef(null);
    const documentInputRef = useRef(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [swRes, empRes, invRes, supRes, cfgRes] = await Promise.all([
                getJson('/software'),
                getJson('/employees'),
                getJson('/invoices'),
                getJson('/suppliers'),
                getJson('/employees/config')
            ]);

            const [swData, empData, invData, supData, cfgData] = await Promise.all([
                swRes.json(),
                empRes.json(),
                invRes.json(),
                supRes.json(),
                cfgRes.json()
            ]);

            setSoftware(swData);
            setEmployees(empData);
            setInvoices(invData);
            setSuppliers(supData);
            setSectionsConfig(cfgData.sections || []);
            setSelectedIds([]);
        } catch (error) {
            console.error('Fetch error:', error);
            if (!silent) showAlert('error', 'Failed to fetch data');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const showAlert = (type, msg) => {
        setAlert({ type, message: msg });
        setTimeout(() => setAlert(null), 3000);
    };

    // --- Computed Search (instant) ---
    const filteredSoftware = useMemo(() => {
        let list = software;
        if (searchQuery) {
            try {
                const query = searchQuery.toLowerCase();
                list = list.filter(s => {
                    try {
                        return String(s.Software_Name || '').toLowerCase().includes(query) ||
                            String(s.Bill_Number || '').toLowerCase().includes(query) ||
                            String(s.Vendor_Name || '').toLowerCase().includes(query) ||
                            String(s.Issued_To || '').toLowerCase().includes(query);
                    } catch { return false; }
                });
            } catch { /* keep list */ }
        }
        // Sort by Purchase_Date descending
        return [...list].sort((a, b) => {
            const da = a.Purchase_Date ? new Date(a.Purchase_Date) : new Date(0);
            const db2 = b.Purchase_Date ? new Date(b.Purchase_Date) : new Date(0);
            return db2 - da;
        });
    }, [searchQuery, software]);

    // Unique sections from employees and config
    const uniqueSections = useMemo(() => {
        const secs = new Set(sectionsConfig);
        employees.forEach(emp => { if (emp.Section) secs.add(emp.Section); });
        return [...secs].sort();
    }, [employees, sectionsConfig]);

    const handleOpenModal = (item = null) => {
        fetchData(true); // Silently refresh employee and section data for the dropdowns
        if (item) {
            setEditingItem(item);
            setFormData({
                Software_Name: item.Software_Name,
                Quantity: item.Quantity,
                Source: item.Source,
                Bill_Number: item.Bill_Number,
                Vendor_Name: item.Vendor_Name,
                Letter_Number: item.Letter_Number,
                Purchase_Date: item.Purchase_Date,
                Amount: item.Amount,
                Valid_Upto: item.Valid_Upto,
                Issued_To: item.Issued_To,
                License_Code: item.License_Code,
                Additional_Info: item.Additional_Info,
                Multiple_Issued: item.Multiple_Issued || []
            });
        } else {
            setEditingItem(null);
            setFormData({
                Software_Name: '',
                Quantity: 1,
                Source: 'Purchased',
                Bill_Number: '',
                Vendor_Name: '',
                Letter_Number: '',
                Purchase_Date: '',
                Amount: 0,
                Valid_Upto: '',
                Issued_To: '',
                License_Code: '',
                Additional_Info: '',
                Multiple_Issued: []
            });
        }
        setShowModal(true);
    };

    // --- Helper for Base64 ---
    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    const handleSave = async () => {
        if (!formData.Software_Name || !formData.Quantity) {
            showAlert('error', 'Software Name and Quantity are required');
            return;
        }

        setProcessing(true);

        try {
            let fileData = null;
            let fileName = null;
            if (documentInputRef.current?.files[0]) {
                fileData = await toBase64(documentInputRef.current.files[0]);
                fileName = documentInputRef.current.files[0].name;
            }

            const payload = {
                data: formData,
                fileData: fileData,
                fileName: fileName
            };

            const endpoint = editingItem ? `/software/${editingItem.id}` : '/software';
            const res = editingItem ? await putJson(endpoint, payload) : await postJson(endpoint, payload);

            if (res.ok) {
                showAlert('success', editingItem ? 'Software updated' : 'Software created');
                setShowModal(false);
                fetchData();
            } else {
                showAlert('error', 'Failed to save software');
            }
        } catch (error) {
            showAlert('error', 'Error saving software');
        } finally {
            setProcessing(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this software entry?')) return;

        try {
            const res = await deleteJson(`/software/${id}`);

            if (res.ok) {
                showAlert('success', 'Software deleted');
                fetchData();
            } else {
                showAlert('error', 'Failed to delete');
            }
        } catch (error) {
            showAlert('error', 'Error deleting software');
        }
    };

    const toggleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(filteredSoftware.map(item => item.id));
        } else {
            setSelectedIds([]);
        }
    };

    const toggleSelectOne = (e, id) => {
        if (e.target.checked) {
            setSelectedIds([...selectedIds, id]);
        } else {
            setSelectedIds(selectedIds.filter(itemId => itemId !== id));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected items?`)) return;

        setProcessing(true);
        try {
            await Promise.all(selectedIds.map(id => deleteJson(`/software/${id}`)));
            showAlert('success', `${selectedIds.length} items deleted successfully`);
            setSelectedIds([]);
            fetchData();
        } catch (error) {
            console.error('Bulk delete error:', error);
            showAlert('error', 'Failed to delete some items');
        } finally {
            setProcessing(false);
        }
    };

    const handleDownloadExcel = async () => {
        setProcessing(true);
        try {
            const blob = await downloadBlob('/software/download');
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'software.xlsx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showAlert('success', 'File downloaded');
        } catch (error) {
            showAlert('error', 'Download failed');
        } finally {
            setProcessing(false);
        }
    };

    const handleBulkUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        setProcessing(true);
        try {
            const res = await apiFetch('/software/upload', {
                method: 'POST',
                body: formData
            });
            const result = await res.json();
            if (res.ok) {
                showAlert('success', result.message);
                fetchData();
            } else {
                showAlert('error', result.error);
            }
        } catch (error) {
            showAlert('error', 'Upload failed');
        } finally {
            setProcessing(false);
            e.target.value = null;
        }
    };

    const toggleMultipleIssued = (employeeName) => {
        const current = formData.Multiple_Issued || [];
        if (current.includes(employeeName)) {
            setFormData({
                ...formData,
                Multiple_Issued: current.filter(n => n !== employeeName)
            });
        } else {
            setFormData({
                ...formData,
                Multiple_Issued: [...current, employeeName]
            });
        }
    };

    const isPurchased = formData.Source === 'Purchased';
    const isReceived = formData.Source === 'Received from Headquarter';

    return (
        <div className="page-container">
            {processing && <div className="processing-overlay"><div className="spinner"></div><p>Processing...</p></div>}
            {alert && <div className={`alert alert-${alert.type}`}>{alert.message}</div>}

            <div className="page-header">
                <h1>Software Management</h1>
                <p>Track software licenses and allocations</p>
            </div>

            <div className="toolbar">
                <div className="toolbar-actions">
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                        <FontAwesomeIcon icon={faPlus} /> New Software
                    </button>
                    <button className="btn btn-outline" onClick={() => uploadFileRef.current.click()}>
                        <FontAwesomeIcon icon={faFileExcel} /> Bulk Upload
                    </button>
                    <button className="btn btn-outline" onClick={handleDownloadExcel}>
                        <FontAwesomeIcon icon={faDownload} /> Download Excel
                    </button>
                    {selectedIds.length > 0 && (
                        <button className="btn btn-danger" onClick={handleBulkDelete}>
                            <FontAwesomeIcon icon={faTrash} /> Delete Selected ({selectedIds.length})
                        </button>
                    )}
                    <input type="file" ref={uploadFileRef} className="d-none" accept=".xlsx, .xls" onChange={handleBulkUpload} />
                </div>

                <div className="search-bar">
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Search by Software Name..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    <button className="btn btn-outline" onClick={() => setSearchQuery('')}>Clear</button>
                </div>
            </div>

            <div className="table-responsive">
                {loading ? <p>Loading...</p> : (
                    <table className="supplier-table">
                        <thead>
                            <tr>
                                <th className="col-checkbox">
                                    <input
                                        type="checkbox"
                                        onChange={toggleSelectAll}
                                        checked={selectedIds.length === filteredSoftware.length && filteredSoftware.length > 0}
                                    />
                                </th>
                                <th className="col-actions text-center">Actions</th>
                                <th>Software Name</th>
                                <th>Quantity</th>
                                <th>Source</th>
                                <th>Bill Number</th>
                                <th>Letter No</th>
                                <th>Purchase Date</th>
                                <th>Amount (INR)</th>
                                <th>Valid Upto</th>
                                <th>Issued To</th>
                                <th className="col-wide">License Code</th>
                                <th className="col-wide">Additional Info</th>
                                <th className="col-wide">Multiple Issued</th>
                                <th>PDF</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSoftware.map(item => (
                                <tr key={item.id}>
                                    <td className="text-center">
                                        <input
                                            type="checkbox"
                                            onChange={(e) => toggleSelectOne(e, item.id)}
                                            checked={selectedIds.includes(item.id)}
                                        />
                                    </td>
                                    <td className="text-center">
                                        <div className="action-buttons">
                                            <button className="btn-icon edit" onClick={() => handleOpenModal(item)} title="Edit">
                                                <FontAwesomeIcon icon={faEdit} />
                                            </button>
                                            <button className="btn-icon delete" onClick={() => handleDelete(item.id)} title="Delete">
                                                <FontAwesomeIcon icon={faTrash} />
                                            </button>
                                        </div>
                                    </td>
                                    <td><strong>{item.Software_Name}</strong></td>
                                    <td>{item.Quantity}</td>
                                    <td>{item.Source}</td>
                                    <td>{item.Bill_Number}</td>
                                    <td>{item.Letter_Number}</td>
                                    <td>{formatDate(item.Purchase_Date)}</td>
                                    <td>₹{item.Amount}</td>
                                    <td>{formatDate(item.Valid_Upto)}</td>
                                    <td>{item.Issued_To}</td>
                                    <td className="text-wrap-break col-wide">{item.License_Code}</td>
                                    <td className="text-wrap-break col-wide">{item.Additional_Info}</td>
                                    <td className="text-wrap-break col-wide">{Array.isArray(item.Multiple_Issued) ? item.Multiple_Issued.join(', ') : item.Multiple_Issued}</td>
                                    <td>
                                        {item.Document ?
                                            <a href={`http://localhost:3001/uploads/${item.Document}`} target="_blank" rel="noreferrer" title="View PDF">
                                                <FontAwesomeIcon icon={faFilePdf} className="text-icon-pdf" style={{ fontSize: '1.2em' }} />
                                            </a>
                                            : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content modal-lg">
                        <div className="modal-header">
                            <h3>{editingItem ? 'Edit Software' : 'New Software'}</h3>
                            <button className="close-btn" onClick={() => setShowModal(false)}><FontAwesomeIcon icon={faTimes} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="grid-2-col">
                                <div className="form-group">
                                    <label>Software Name *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.Software_Name}
                                        onChange={e => setFormData({ ...formData, Software_Name: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Quantity *</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={formData.Quantity}
                                        onChange={e => setFormData({ ...formData, Quantity: parseInt(e.target.value) })}
                                        min="1"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Source *</label>
                                    <select
                                        className="form-input"
                                        value={formData.Source}
                                        onChange={e => setFormData({ ...formData, Source: e.target.value })}
                                    >
                                        <option value="Purchased">Purchased</option>
                                        <option value="Received from Headquarter">Received from Headquarter</option>
                                    </select>
                                </div>

                                {isPurchased && (
                                    <>
                                        <div className="form-group">
                                            <label>Bill Number</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="Type to search bill number..."
                                                value={formData.Bill_Number}
                                                onChange={e => setFormData({ ...formData, Bill_Number: e.target.value })}
                                                list="bill-numbers-list"
                                            />
                                            <datalist id="bill-numbers-list">
                                                {invoices.map(inv => (
                                                    <option key={inv.Bill_Number} value={inv.Bill_Number}>{inv.Bill_Number}</option>
                                                ))}
                                            </datalist>
                                        </div>

                                        <div className="form-group">
                                            <label>Vendor Name</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="Type to search vendor..."
                                                value={formData.Vendor_Name}
                                                onChange={e => setFormData({ ...formData, Vendor_Name: e.target.value })}
                                                list="vendors-list"
                                            />
                                            <datalist id="vendors-list">
                                                {suppliers.map(sup => (
                                                    <option key={sup.id} value={sup.Supplier_Name}>{sup.Supplier_Name}</option>
                                                ))}
                                            </datalist>
                                        </div>
                                    </>
                                )}

                                {isReceived && (
                                    <div className="form-group">
                                        <label>Letter Number</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.Letter_Number}
                                            onChange={e => setFormData({ ...formData, Letter_Number: e.target.value })}
                                        />
                                    </div>
                                )}

                                <div className="form-group">
                                    <label>Purchase Date</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formData.Purchase_Date}
                                        onChange={e => setFormData({ ...formData, Purchase_Date: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Amount (INR)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={formData.Amount}
                                        onChange={e => setFormData({ ...formData, Amount: parseFloat(e.target.value) })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Valid Upto</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formData.Valid_Upto}
                                        onChange={e => setFormData({ ...formData, Valid_Upto: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Issued To</label>
                                    <select
                                        className="form-input mb-sm"
                                        value={formData.Issued_To?.startsWith('Employee:') || formData.Issued_To?.startsWith('Section:') ? formData.Issued_To.split(':')[0] : ''}
                                        onChange={e => setFormData({ ...formData, Issued_To: e.target.value ? e.target.value + ':' : '' })}
                                    >
                                        <option value="">Select Type</option>
                                        <option value="Employee">Employee</option>
                                        <option value="Section">Section</option>
                                    </select>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder={formData.Issued_To?.startsWith('Section:') ? 'Type to search section...' : 'Type to search employees...'}
                                        value={formData.Issued_To?.includes(':') ? formData.Issued_To.split(':').slice(1).join(':') : formData.Issued_To || ''}
                                        onChange={e => {
                                            const prefix = formData.Issued_To?.includes(':') ? formData.Issued_To.split(':')[0] + ':' : '';
                                            setFormData({ ...formData, Issued_To: prefix + e.target.value });
                                        }}
                                        list={formData.Issued_To?.startsWith('Section:') ? 'sections-datalist' : 'employees-datalist'}
                                    />
                                    <datalist id="employees-datalist">
                                        {employees.map(emp => (
                                            <option key={emp.PIN} value={emp.Name}>{emp.Name} ({emp.PIN})</option>
                                        ))}
                                    </datalist>
                                    <datalist id="sections-datalist">
                                        {uniqueSections.map(sec => (
                                            <option key={sec} value={sec}>{sec}</option>
                                        ))}
                                    </datalist>
                                </div>

                                <div className="form-group">
                                    <label>License Code</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.License_Code}
                                        onChange={e => setFormData({ ...formData, License_Code: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="form-group mt-lg">
                                <label>Additional Info</label>
                                <textarea
                                    className="form-input"
                                    rows="3"
                                    value={formData.Additional_Info}
                                    onChange={e => setFormData({ ...formData, Additional_Info: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label>Multiple Issued (Select multiple employees)</label>
                                <input
                                    type="text"
                                    className="form-input mb-md"
                                    placeholder="Search employees..."
                                    value={employeeSearch}
                                    onChange={e => setEmployeeSearch(e.target.value)}
                                />
                                <div className="employee-list-scroll">
                                    {employees
                                        .filter(emp =>
                                            employeeSearch === '' ||
                                            String(emp.Name || '').toLowerCase().includes(employeeSearch.toLowerCase()) ||
                                            String(emp.PIN || '').toLowerCase().includes(employeeSearch.toLowerCase())
                                        )
                                        .map(emp => (
                                            <div key={emp.PIN} className="employee-list-item">
                                                <label className="employee-list-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={(formData.Multiple_Issued || []).includes(emp.Name)}
                                                        onChange={() => toggleMultipleIssued(emp.Name)}
                                                        className="checkbox-mr"
                                                    />
                                                    {emp.Name} ({emp.PIN})
                                                </label>
                                            </div>
                                        ))}
                                </div>
                                {formData.Multiple_Issued?.length > 0 && (
                                    <p className="helper-text">
                                        Selected: {formData.Multiple_Issued.join(', ')}
                                    </p>
                                )}
                            </div>

                            <div className="form-group">
                                <label>Upload Document (Bill/License PDF)</label>
                                <input
                                    type="file"
                                    ref={documentInputRef}
                                    className="form-input"
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave}>
                                {editingItem ? 'Update' : 'Create'} Software
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Software;
