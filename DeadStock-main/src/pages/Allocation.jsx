import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatDate } from '../utils/formatDate';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faUserCheck,
    faHistory,
    faTimes,
    faFileExcel,
    faDownload
} from '@fortawesome/free-solid-svg-icons';

const Allocation = () => {
    const [hardware, setHardware] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [ewasteItems, setEwasteItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [alert, setAlert] = useState(null);

    // Search & Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [filterItemName, setFilterItemName] = useState('');
    const [filterStock, setFilterStock] = useState('');

    // Sections from Employee Config
    const [sectionsConfig, setSectionsConfig] = useState([]);

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [allocationForm, setAllocationForm] = useState({ PIN: '', Issued_Date: new Date().toISOString().split('T')[0], Issued_Location: '' });
    const [selectedEmployee, setSelectedEmployee] = useState(null);

    // History Modal
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyData, setHistoryData] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [hwRes, empRes, invRes, ewRes] = await Promise.all([
                fetch('http://localhost:3001/api/hardware'),
                fetch('http://localhost:3001/api/employees'),
                fetch('http://localhost:3001/api/invoices'),
                fetch('http://localhost:3001/api/ewaste/dashboard')
            ]);

            const [hwData, empData, invData, ewData] = await Promise.all([
                hwRes.json(),
                empRes.json(),
                invRes.json(),
                ewRes.json()
            ]);

            // Get all E-Waste item IDs
            const ewItemsRes = await Promise.all(
                ewData.map(year => fetch(`http://localhost:3001/api/ewaste/${year.year}/items`).then(r => r.json()))
            );
            const allEWasteItems = ewItemsRes.flat();

            setHardware(hwData);
            setEmployees(empData);
            setInvoices(invData);
            setEwasteItems(allEWasteItems);

            // Fetch sections config separately (error-safe)
            try {
                const configRes = await fetch('http://localhost:3001/api/employees/config');
                const configData = await configRes.json();
                // configData is an object like { sections: [...], posts: [...], wings: [...], offices: [...] }
                const sections = (configData && configData.sections) ? configData.sections : [];
                setSectionsConfig(sections.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))));
            } catch (e) {
                console.error('Failed to fetch sections config:', e);
                setSectionsConfig([]);
            }
        } catch (error) {
            showAlert('error', 'Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    const showAlert = (type, msg) => {
        setAlert({ type, message: msg });
        setTimeout(() => setAlert(null), 3000);
    };

    const normalize = (s) => String(s || '').trim().replace(/^0+/, '');

    // Computed filtered list — reacts instantly to any change
    const filteredList = useMemo(() => {
        try {
            const query = searchQuery.toLowerCase().trim();
            let results = hardware;

            // Apply Item Name filter
            if (filterItemName) {
                results = results.filter(h => h.Item_Name === filterItemName);
            }

            // Apply STOCK filter
            if (filterStock === 'STOCK') {
                results = results.filter(h => String(h.Allocated_To) === 'STOCK');
            } else if (filterStock === 'ALLOCATED') {
                results = results.filter(h => h.Allocated_To && String(h.Allocated_To) !== 'STOCK');
            }

            // Apply text search
            if (query) {
                results = results.filter(h => {
                    try {
                        const allocatedStr = String(h.Allocated_To || '');
                        const emp = employees.find(e => normalize(e.PIN) === normalize(h.Allocated_To));
                        const edpMatch = String(h.EDP_Serial || '').toLowerCase().includes(query);
                        const pinMatch = allocatedStr.toLowerCase().includes(query);
                        const nameMatch = emp?.Name?.toLowerCase().includes(query);
                        const itemMatch = String(h.Item_Name || '').toLowerCase().includes(query);
                        const sectionMatch = emp?.Section?.toLowerCase().includes(query);
                        const wingMatch = emp?.Wing?.toLowerCase().includes(query);
                        const locationMatch = String(h.Issued_Location || '').toLowerCase().includes(query);
                        return edpMatch || pinMatch || nameMatch || itemMatch || sectionMatch || wingMatch || locationMatch;
                    } catch { return false; }
                });
            }

            return results;
        } catch { return hardware; }
    }, [searchQuery, filterItemName, filterStock, hardware, employees]);

    const handleOpenModal = (item) => {
        setSelectedItem(item);
        setAllocationForm({
            PIN: item.Allocated_To === 'STOCK' ? '' : item.Allocated_To,
            Issued_Date: item.Issued_Date || new Date().toISOString().split('T')[0],
            Issued_Location: item.Issued_Location || ''
        });
        if (item.Allocated_To !== 'STOCK') {
            setSelectedEmployee(employees.find(e => normalize(e.PIN) === normalize(item.Allocated_To)));
        } else {
            setSelectedEmployee(null);
        }
        setShowModal(true);
    };

    const handlePINChange = (pin) => {
        setAllocationForm({ ...allocationForm, PIN: pin });
        const normalizedPin = normalize(pin);
        const emp = employees.find(e => {
            return normalize(e.PIN) === normalizedPin ||
                (e.Name && e.Name.toLowerCase() === pin.toLowerCase());
        });
        setSelectedEmployee(emp || null);
    };

    const handleSaveAllocation = async () => {
        setProcessing(true);
        try {
            // Get current user from localStorage
            const userProfile = JSON.parse(localStorage.getItem('userProfile') || '{}');
            const changedBy = userProfile.name || 'System';

            const res = await fetch('http://localhost:3001/api/hardware/allocate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: selectedItem.id,
                    PIN: allocationForm.PIN || 'STOCK',
                    Issued_Date: allocationForm.Issued_Date,
                    Issued_Location: allocationForm.Issued_Location || '',
                    changedBy: changedBy // Add username
                })
            });

            if (res.ok) {
                showAlert('success', 'Allocation Updated');
                setShowModal(false);
                fetchData();
            } else {
                showAlert('error', 'Failed to update');
            }
        } catch (error) {
            showAlert('error', 'Update error');
        } finally {
            setProcessing(false);
        }
    };

    const handleDoubleClick = async (item) => {
        setSelectedItem(item);
        setShowHistoryModal(true);
        setHistoryLoading(true);
        try {
            console.log('Fetching history for hardware ID:', item.id);
            const res = await fetch(`http://localhost:3001/api/hardware/${item.id}/history`);
            console.log('History response status:', res.status);
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            const data = await res.json();
            console.log('History data received:', data);
            setHistoryData(data);
        } catch (error) {
            console.error('History fetch error:', error);
            showAlert('error', 'Failed to load history');
        } finally {
            setHistoryLoading(false);
        }
    };

    const getPurchasedDate = (billNo) => {
        const inv = invoices.find(i => i.Bill_Number === billNo);
        return inv ? formatDate(inv.Date) : '-';
    };

    // Safe check for Electron API
    const isElectron = () => window.electronAPI && typeof window.electronAPI.showOpenDialog === 'function';

    const handleDownloadExcel = async () => {
        setProcessing(true);
        try {
            if (isElectron()) {
                // Fetch buffer first (no blank window!)
                const res = await fetch('http://localhost:3001/api/allocation/download-buffer');
                const data = await res.json();
                if (!data.buffer) throw new Error('No data');

                const result = await window.electronAPI.showSaveDialog({
                    title: 'Save Allocation Excel',
                    defaultPath: 'allocation_items.xlsx',
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
                // Browser fallback - blob download (no window.open!)
                const response = await fetch('http://localhost:3001/api/allocation/download');
                if (!response.ok) throw new Error('Download failed');
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'allocation_items.xlsx';
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

    const handleBulkUpload = async (e) => {
        const file = e?.target?.files?.[0];
        if (!file) return;

        setProcessing(true);
        try {
            // Use base64 for server upload (works in both Electron and browser)
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const userProfile = JSON.parse(localStorage.getItem('userProfile') || '{}');
                    const changedBy = userProfile.name || 'System';

                    const res = await fetch('http://localhost:3001/api/allocation/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fileData: event.target.result, changedBy })
                    });
                    const result = await res.json();
                    if (res.ok) {
                        showAlert('success', result.message || 'Upload complete');
                        fetchData();
                    } else {
                        showAlert('error', result.error || 'Upload failed');
                    }
                } catch (err) {
                    showAlert('error', 'Upload error');
                } finally {
                    setProcessing(false);
                    if (e.target) e.target.value = null;
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('Upload error:', error);
            showAlert('error', 'Upload failed');
            setProcessing(false);
        }
    };

    return (
        <div className="page-container">
            {processing && <div className="processing-overlay"><div className="spinner"></div><p>Updating...</p></div>}
            {alert && <div className={`alert alert-${alert.type}`}>{alert.message}</div>}

            <div className="page-header">
                <h1>Hardware Allocation</h1>
                <p>Manage and track hardware assignments</p>
            </div>

            <div className="toolbar" style={{ flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-outline" onClick={() => fileInputRef.current.click()}>
                        <FontAwesomeIcon icon={faFileExcel} /> Bulk Upload
                    </button>
                    <button className="btn btn-outline" onClick={handleDownloadExcel}>
                        <FontAwesomeIcon icon={faDownload} /> Download Excel
                    </button>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".xlsx, .xls" onChange={handleBulkUpload} />
                </div>

                <div className="search-bar" style={{ width: '100%', maxWidth: '850px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        className="form-select"
                        value={filterItemName}
                        onChange={e => setFilterItemName(e.target.value)}
                        style={{ width: '160px' }}
                    >
                        <option value="">All Items</option>
                        {[...new Set(hardware.map(h => h.Item_Name))].sort().map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                    <select
                        className="form-select"
                        value={filterStock}
                        onChange={e => setFilterStock(e.target.value)}
                        style={{ width: '140px' }}
                    >
                        <option value="">All Status</option>
                        <option value="STOCK">In STOCK</option>
                        <option value="ALLOCATED">Allocated</option>
                    </select>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Search EDP, Name, PIN, Section, Wing, Location..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ flex: 1, minWidth: '180px' }}
                    />
                    <button className="btn btn-outline" onClick={() => { setSearchQuery(''); setFilterItemName(''); setFilterStock(''); }}>Clear</button>
                </div>
            </div>

            <div className="table-responsive" style={{ overflowX: 'auto' }}>
                {loading ? <p>Loading data...</p> : (
                    <table className="supplier-table" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead>
                            <tr>
                                <th style={{ position: 'sticky', left: 0, zIndex: 3, backgroundColor: '#1a1a2e', color: '#fff', minWidth: '90px' }}>Actions</th>
                                <th style={{ position: 'sticky', left: '90px', zIndex: 3, backgroundColor: '#1a1a2e', color: '#fff', minWidth: '120px', borderRight: '2px solid #e0e0e0' }}>Item Name</th>
                                <th style={{ position: 'sticky', left: '210px', zIndex: 3, backgroundColor: '#1a1a2e', color: '#fff', minWidth: '100px', borderRight: '2px solid #e0e0e0' }}>EDP Serial</th>
                                <th>PIN</th>
                                <th>Name</th>
                                <th>Post</th>
                                <th>Wing</th>
                                <th>Issued Date</th>
                                <th>Issued Location</th>
                                <th>Make</th>
                                <th>Co. Serial</th>
                                <th>Bill No</th>
                                <th>Purchased</th>
                                <th>Cost</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredList.map(h => {
                                const emp = employees.find(e => normalize(e.PIN) === normalize(h.Allocated_To));
                                const isStock = h.Allocated_To === 'STOCK';
                                const isInEWaste = ewasteItems.some(ew => ew.hardware_id === h.id);
                                const isAllocatedInEWaste = isInEWaste && !isStock;

                                // Status-based row color: E-Waste allocation > Under Repair > Not Working
                                let rowBg = '#ffffff';
                                if (isAllocatedInEWaste) {
                                    rowBg = '#fff3cd';
                                } else if (h.Status === 'Not Working') {
                                    rowBg = '#ffebeb';
                                } else if (h.Status === 'Under Repair') {
                                    rowBg = '#fff3e0';
                                }

                                return (
                                    <tr
                                        key={h.id}
                                        onDoubleClick={() => handleDoubleClick(h)}
                                        style={{
                                            cursor: 'pointer',
                                            backgroundColor: rowBg
                                        }}
                                        title={isAllocatedInEWaste ? "This item is in E-Waste but still allocated" : "Double-click to view allocation history"}
                                    >
                                        <td style={{ position: 'sticky', left: 0, zIndex: 1, backgroundColor: rowBg || '#ffffff' }}>
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                <button className="btn-icon edit" onClick={(e) => { e.stopPropagation(); handleOpenModal(h); }} title="Re-allocate">
                                                    <FontAwesomeIcon icon={faUserCheck} />
                                                </button>
                                                <button className="btn-icon edit" onClick={(e) => { e.stopPropagation(); handleDoubleClick(h); }} title="View History">
                                                    <FontAwesomeIcon icon={faHistory} />
                                                </button>
                                            </div>
                                        </td>
                                        <td style={{ position: 'sticky', left: '90px', zIndex: 1, backgroundColor: rowBg || '#ffffff', borderRight: '2px solid #e0e0e0', fontWeight: 600 }}>{h.Item_Name}</td>
                                        <td style={{ position: 'sticky', left: '210px', zIndex: 1, backgroundColor: rowBg || '#ffffff', borderRight: '2px solid #e0e0e0', fontWeight: 600 }}><strong>{h.EDP_Serial}</strong></td>
                                        <td>{isStock ? <span className="badge-stock">STOCK</span> : h.Allocated_To}</td>
                                        <td>{emp?.Name || '-'}</td>
                                        <td>{emp?.Present_Post || '-'}</td>
                                        <td>{emp?.Wing || '-'}</td>
                                        <td>{formatDate(h.Issued_Date)}</td>
                                        <td>{h.Issued_Location || '-'}</td>
                                        <td>{h.Make}</td>
                                        <td>{h.Company_Serial}</td>
                                        <td>{h.Bill_Number}</td>
                                        <td>{getPurchasedDate(h.Bill_Number)}</td>
                                        <td>{h.Cost}</td>
                                        <td>
                                            <span style={{
                                                padding: '3px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.8em',
                                                fontWeight: 600,
                                                ...(h.Status === 'Not Working'
                                                    ? { backgroundColor: '#f8d7da', color: '#721c24' }
                                                    : h.Status === 'Under Repair'
                                                        ? { backgroundColor: '#fff3cd', color: '#856404' }
                                                        : { backgroundColor: '#d4edda', color: '#155724' }
                                                )
                                            }}>
                                                {h.Status || 'Working'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Hardware Allocation</h3>
                            <button className="close-btn" onClick={() => setShowModal(false)}><FontAwesomeIcon icon={faTimes} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="card" style={{ padding: '15px', marginBottom: '20px', backgroundColor: '#f9f9f9' }}>
                                <p><strong>Item:</strong> {selectedItem.Item_Name} ({selectedItem.EDP_Serial})</p>
                                <p><strong>Currently:</strong> {selectedItem.Allocated_To === 'STOCK' ? 'In STOCK' : `Allocated to ${selectedItem.Allocated_To}`}</p>
                            </div>

                            <div className="form-group">
                                <label>Enter Employee PIN or Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Leave empty for STOCK"
                                    value={allocationForm.PIN}
                                    onChange={e => handlePINChange(e.target.value)}
                                    list="employee-list"
                                />
                                <datalist id="employee-list">
                                    {employees.map(e => <option key={e.PIN} value={e.PIN}>{e.Name}</option>)}
                                </datalist>
                                <p style={{ fontSize: '0.8em', color: '#666', marginTop: '5px' }}>Tip: Clear the field to move item back to STOCK.</p>
                            </div>

                            {selectedEmployee && (
                                <div className="card" style={{ padding: '15px', marginTop: '10px', borderLeft: '4px solid teal' }}>
                                    <h4 style={{ margin: '0 0 10px 0' }}>Employee Details Found:</h4>
                                    <p><strong>Name:</strong> {selectedEmployee.Name}</p>
                                    <p><strong>Post:</strong> {selectedEmployee.Present_Post}</p>
                                    <p><strong>Mobile:</strong> {selectedEmployee.Mobile || '-'}</p>
                                    <p><strong>Wing:</strong> {selectedEmployee.Wing}</p>
                                </div>
                            )}

                            <div className="form-group" style={{ marginTop: '20px' }}>
                                <label>Issued Date *</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={allocationForm.Issued_Date}
                                    onChange={e => setAllocationForm({ ...allocationForm, Issued_Date: e.target.value })}
                                />
                                <p style={{ fontSize: '0.8em', color: '#666', marginTop: '5px' }}>
                                    {allocationForm.PIN ? 'Date when device was issued to employee' : 'Date when device was moved to STOCK'}
                                </p>
                            </div>

                            <div className="form-group" style={{ marginTop: '15px' }}>
                                <label>Issued Location</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Search or select location..."
                                    value={allocationForm.Issued_Location}
                                    onChange={e => setAllocationForm({ ...allocationForm, Issued_Location: e.target.value })}
                                    list="sections-list"
                                />
                                <datalist id="sections-list">
                                    {sectionsConfig.map(s => <option key={s} value={s} />)}
                                </datalist>
                                <p style={{ fontSize: '0.8em', color: '#666', marginTop: '5px' }}>Sections from Employee Configuration (Manage Options)</p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSaveAllocation}>
                                {allocationForm.PIN ? 'Allocate Device' : 'Move to STOCK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {showHistoryModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '800px' }}>
                        <div className="modal-header">
                            <h3>Allocation History - {selectedItem?.EDP_Serial}</h3>
                            <button className="close-btn" onClick={() => setShowHistoryModal(false)}><FontAwesomeIcon icon={faTimes} /></button>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '15px', color: '#666' }}>
                                <strong>Item:</strong> {selectedItem?.Item_Name} ({selectedItem?.EDP_Serial})
                            </p>
                            {historyLoading ? (
                                <p>Loading history...</p>
                            ) : historyData.length === 0 ? (
                                <p style={{ textAlign: 'center', color: '#999', padding: '20px' }}>No allocation history found for this item.</p>
                            ) : (
                                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                    <table className="supplier-table">
                                        <thead>
                                            <tr>
                                                <th>From</th>
                                                <th>To</th>
                                                <th>Employee Name</th>
                                                <th>Issued Date</th>
                                                <th>Changed At</th>
                                                <th>Changed By</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...historyData]
                                                .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at))
                                                .map(h => {
                                                    const toEmp = employees.find(e => String(e.PIN) === String(h.to_PIN));

                                                    // Format DD-MM-YYYY HH:mm (12hr format)
                                                    const dt = new Date(h.changed_at);
                                                    const dd = String(dt.getDate()).padStart(2, '0');
                                                    const mm = String(dt.getMonth() + 1).padStart(2, '0');
                                                    const yyyy = dt.getFullYear();
                                                    const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                                                    const formattedDate = `${dd}-${mm}-${yyyy} ${timeStr}`;

                                                    let displayIssuedDate = h.issued_date || '-';
                                                    if (h.issued_date) {
                                                        const parts = String(h.issued_date).split('-');
                                                        if (parts.length === 3 && parts[0].length === 4) {
                                                            displayIssuedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                                                        }
                                                    }

                                                    return (
                                                        <tr key={h.id}>
                                                            <td>{h.from_PIN === 'STOCK' ? <span className="badge-stock">STOCK</span> : h.from_PIN}</td>
                                                            <td>{h.to_PIN === 'STOCK' ? <span className="badge-stock">STOCK</span> : h.to_PIN}</td>
                                                            <td>{toEmp?.Name || (h.to_PIN === 'STOCK' ? '-' : 'Unknown')}</td>
                                                            <td>{displayIssuedDate}</td>
                                                            <td>{formattedDate}</td>
                                                            <td><strong>{h.changed_by || 'System'}</strong></td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowHistoryModal(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                .badge-stock {
                    background-color: #eee;
                    color: #666;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 0.85em;
                    font-weight: 600;
                }
            `}} />
        </div>
    );
};

export default Allocation;
