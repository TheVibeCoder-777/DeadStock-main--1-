import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatDate } from '../utils/formatDate';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faPlus,
    faTimes,
    faEdit,
    faTrash,
    faDownload,
    faFileExcel
} from '@fortawesome/free-solid-svg-icons';

const Employees = () => {
    // --- State ---
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [alert, setAlert] = useState(null);
    const [config, setConfig] = useState({ posts: [], sections: [], wings: [], offices: [] });

    // Search
    const [searchQuery, setSearchQuery] = useState('');

    // Filters
    const [filterOffice, setFilterOffice] = useState('');
    const [filterPost, setFilterPost] = useState('');

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [editEmployee, setEditEmployee] = useState(null); // For Add/Edit
    const [formData, setFormData] = useState({
        PIN: '', Name: '', Present_Post: '', Section: '', Wing: '',
        Office: '', Email: '', Mobile: '', Hqr_Field: '',
        DOB: '', Retirement_Date: ''
    });

    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchEmployees();
        fetchConfig();
    }, []);

    // --- API Calls ---
    const fetchEmployees = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/employees');
            const data = await res.json();
            setEmployees(data);
        } catch (error) {
            showAlert('error', 'Failed to fetch employees');
        } finally {
            setLoading(false);
        }
    };

    const fetchConfig = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/employees/config');
            const data = await res.json();
            setConfig(data);
        } catch (error) {
            console.error('Config fetch failed');
        }
    };

    const showAlert = (type, msg) => {
        setAlert({ type, message: msg });
        setTimeout(() => setAlert(null), 3000);
    };

    const filteredList = useMemo(() => {
        let list = employees;
        try {
            // Apply dropdown filters
            if (filterOffice) {
                list = list.filter(e => String(e.Office || '') === filterOffice);
            }
            if (filterPost) {
                list = list.filter(e => String(e.Present_Post || '') === filterPost);
            }
            // Apply search query
            if (searchQuery) {
                const query = searchQuery.toLowerCase().trim();
                list = list.filter(e => {
                    try {
                        const pinMatch = String(e.PIN || '').toLowerCase().includes(query);
                        const nameMatch = String(e.Name || '').toLowerCase().includes(query);
                        const wingMatch = String(e.Wing || '').toLowerCase().includes(query);
                        const mobileMatch = String(e.Mobile || '').toLowerCase().includes(query);
                        return pinMatch || nameMatch || wingMatch || mobileMatch;
                    } catch { return false; }
                });
            }
            return list;
        } catch { return employees; }
    }, [searchQuery, employees, filterOffice, filterPost]);

    const handleClearSearch = () => {
        setSearchQuery('');
        setFilterOffice('');
        setFilterPost('');
    };

    const handleOpenModal = (employee = null) => {
        if (employee) {
            setEditEmployee(employee);
            setFormData({ ...employee });
        } else {
            setEditEmployee(null);
            setFormData({
                PIN: '', Name: '', Present_Post: '', Section: '', Wing: '',
                Office: '', Email: '', Mobile: '', Hqr_Field: '',
                DOB: '', Retirement_Date: ''
            });
        }
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formData.PIN || !formData.Name || !formData.Present_Post || !formData.Wing || !formData.Office) {
            return showAlert('error', 'Please fill required fields');
        }

        setProcessing(true);
        try {
            const url = editEmployee
                ? `http://localhost:3001/api/employees/${editEmployee.PIN}`
                : 'http://localhost:3001/api/employees';
            const method = editEmployee ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                showAlert('success', editEmployee ? 'Employee Updated' : 'Employee Added');
                setShowModal(false);
                fetchEmployees();
            } else {
                const err = await res.json();
                showAlert('error', err.error || 'Server error');
            }
        } catch (error) {
            showAlert('error', 'Fetch error');
        } finally {
            setProcessing(false);
        }
    };

    const handleDelete = async (pin) => {
        if (!window.confirm('Delete this employee?')) return;
        setProcessing(true);
        try {
            const res = await fetch(`http://localhost:3001/api/employees/${pin}`, { method: 'DELETE' });
            if (res.ok) {
                showAlert('success', 'Deleted');
                fetchEmployees();
            }
        } catch (error) {
            showAlert('error', 'Delete failed');
        } finally {
            setProcessing(false);
        }
    };

    const handleDownloadExcel = async () => {
        setProcessing(true);
        try {
            const response = await fetch('http://localhost:3001/api/employees/download');
            if (!response.ok) throw new Error('Download failed');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'employees.xlsx';
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
            const res = await fetch('http://localhost:3001/api/employees/upload', {
                method: 'POST',
                body: formData
            });
            const result = await res.json();
            if (res.ok) {
                showAlert('success', result.message);
                fetchEmployees();
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

    return (
        <div className="page-container">
            {processing && <div className="processing-overlay"><div className="spinner"></div><p>Processing...</p></div>}
            {alert && <div className={`alert alert-${alert.type}`}>{alert.message}</div>}

            <div className="page-header">
                <h1>Employees List</h1>
                <p>Manage Employee Directory</p>
            </div>

            <div className="toolbar">
                <div className="toolbar-actions">
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                        <FontAwesomeIcon icon={faPlus} /> New Employee
                    </button>
                    <button className="btn btn-outline" onClick={() => fileInputRef.current.click()}>
                        <FontAwesomeIcon icon={faFileExcel} /> Bulk Upload
                    </button>
                    <button className="btn btn-outline" onClick={handleDownloadExcel}>
                        <FontAwesomeIcon icon={faDownload} /> Download Excel
                    </button>
                    <input type="file" ref={fileInputRef} className="d-none" accept=".xlsx, .xls" onChange={handleBulkUpload} />
                </div>

                <div className="search-bar">
                    <select className="form-select filter-select" value={filterOffice} onChange={e => setFilterOffice(e.target.value)}>
                        <option value="">All Offices</option>
                        {(config.offices || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <select className="form-select filter-select" value={filterPost} onChange={e => setFilterPost(e.target.value)}>
                        <option value="">All Posts</option>
                        {(config.posts || []).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Search PIN, Name, Wing, Mobile..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ width: '250px' }}
                    />
                    <button className="btn btn-outline" onClick={handleClearSearch}><FontAwesomeIcon icon={faTimes} /> Clear</button>
                </div>
            </div>

            <div className="table-responsive">
                {loading ? <p>Loading employees...</p> : (
                    <table className="supplier-table">
                        <thead>
                            <tr>
                                <th className="sticky-col-header col-actions" style={{ left: 0 }}>Actions</th>
                                <th className="sticky-col-header" style={{ left: '80px' }}>PIN</th>
                                <th>Name</th>
                                <th>Present Post</th>
                                <th>Wing</th>
                                <th>Office</th>
                                <th>Email</th>
                                <th>Mobile</th>
                                <th>Hqr/Field</th>
                                <th>DOB</th>
                                <th>Retirement</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredList.map(emp => (
                                <tr key={emp.id || `${emp.PIN}-${emp.Name}`}>
                                    <td className="sticky-col col-actions" style={{ left: 0 }}>
                                        <div className="action-buttons">
                                            <button className="btn-icon edit" onClick={() => handleOpenModal(emp)}><FontAwesomeIcon icon={faEdit} /></button>
                                            <button className="btn-icon delete" onClick={() => handleDelete(emp.PIN)}><FontAwesomeIcon icon={faTrash} /></button>
                                        </div>
                                    </td>
                                    <td className="sticky-col" style={{ left: '80px' }}><strong>{emp.PIN}</strong></td>
                                    <td>{emp.Name}</td>
                                    <td>{emp.Present_Post}</td>
                                    <td>{emp.Wing}</td>
                                    <td>{emp.Office}</td>
                                    <td>{emp.Email || '-'}</td>
                                    <td>{emp.Mobile || '-'}</td>
                                    <td>{emp.Hqr_Field || '-'}</td>
                                    <td>{formatDate(emp.DOB)}</td>
                                    <td>{formatDate(emp.Retirement_Date)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Employee Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content modal-lg">
                        <div className="modal-header">
                            <h3>{editEmployee ? 'Edit Employee' : 'New Employee'}</h3>
                        </div>
                        <div className="modal-body">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>PIN (Unique) *</label>
                                    <input type="text" className="form-input" value={formData.PIN} disabled={!!editEmployee} onChange={e => setFormData({ ...formData, PIN: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Name *</label>
                                    <input type="text" className="form-input" value={formData.Name} onChange={e => setFormData({ ...formData, Name: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Present Post *</label>
                                    <select className="form-select" value={formData.Present_Post} onChange={e => setFormData({ ...formData, Present_Post: e.target.value })}>
                                        <option value="">Select Post</option>
                                        {config.posts.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Section</label>
                                    <select className="form-select" value={formData.Section} onChange={e => setFormData({ ...formData, Section: e.target.value })}>
                                        <option value="">Select Section</option>
                                        {config.sections.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Wing *</label>
                                    <select className="form-select" value={formData.Wing} onChange={e => setFormData({ ...formData, Wing: e.target.value })}>
                                        <option value="">Select Wing</option>
                                        {config.wings.map(w => <option key={w} value={w}>{w}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Office *</label>
                                    <select className="form-select" value={formData.Office} onChange={e => setFormData({ ...formData, Office: e.target.value })}>
                                        <option value="">Select Office</option>
                                        {config.offices.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Email</label>
                                    <input type="email" className="form-input" value={formData.Email} onChange={e => setFormData({ ...formData, Email: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Mobile Number</label>
                                    <input type="text" className="form-input" value={formData.Mobile} onChange={e => setFormData({ ...formData, Mobile: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Hqr / Field</label>
                                    <select className="form-select" value={formData.Hqr_Field} onChange={e => setFormData({ ...formData, Hqr_Field: e.target.value })}>
                                        <option value="">Select</option>
                                        <option value="H">H (Hqr)</option>
                                        <option value="F">F (Field)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Date of Birth</label>
                                    <input type="date" className="form-input" value={formData.DOB} onChange={e => setFormData({ ...formData, DOB: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Date of Retirement</label>
                                    <input type="date" className="form-input" value={formData.Retirement_Date} onChange={e => setFormData({ ...formData, Retirement_Date: e.target.value })} />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave}>Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Employees;
