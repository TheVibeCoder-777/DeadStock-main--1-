import React, { useState, useEffect, useMemo } from 'react';
import { formatDate } from '../utils/formatDate';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTimes, faDownload } from '@fortawesome/free-solid-svg-icons';

const AMC = () => {
    const [hardwareList, setHardwareList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [alert, setAlert] = useState(null);

    const [activeTab, setActiveTab] = useState('Under AMC');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterItemName, setFilterItemName] = useState('');

    const [selectedIds, setSelectedIds] = useState([]);
    const [showBulkAMCModal, setShowBulkAMCModal] = useState(false);
    const [bulkAMCData, setBulkAMCData] = useState({ AMC: 'Yes', AMC_Upto: '' });

    const [editRowId, setEditRowId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    useEffect(() => {
        fetchHardware();
    }, []);

    const fetchHardware = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/hardware');
            const data = await res.json();
            setHardwareList(data);
        } catch (error) {
            console.error('Failed to fetch hardware for AMC:', error);
            showAlert('error', 'Failed to fetch hardware data');
        } finally {
            setLoading(false);
        }
    };

    const showAlert = (type, msg) => {
        setAlert({ type, message: msg });
        setTimeout(() => setAlert(null), 3000);
    };

    // Calculate Financial Year
    const today = new Date();
    let fyStart, fyEnd;
    if (today.getMonth() >= 3) { // April is month 3
        fyStart = new Date(today.getFullYear(), 3, 1);
        fyEnd = new Date(today.getFullYear() + 1, 2, 31);
    } else {
        fyStart = new Date(today.getFullYear() - 1, 3, 1);
        fyEnd = new Date(today.getFullYear(), 2, 31);
    }

    const parseDateStr = (dateStr) => {
        if (!dateStr || dateStr === '-') return null;
        // Check if format is DD-MM-YYYY
        const parts = dateStr.split('-');
        if (parts.length === 3 && parts[0].length <= 2) {
            return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        return new Date(dateStr);
    };

    const filteredList = useMemo(() => {
        let results = hardwareList;

        if (activeTab === 'Under AMC') {
            results = results.filter(item => {
                if (item.AMC !== 'Yes') return false;
                const amcUptoDate = parseDateStr(item.AMC_Upto);
                if (!amcUptoDate) return false;
                // Under AMC if date is greater than today
                return amcUptoDate > today;
            });
        } else if (activeTab === 'Not in AMC') {
            results = results.filter(item => {
                if (item.AMC !== 'Yes') return false;
                
                // Condition: If item is currently under AMC, it shouldn't be here
                const amcUptoDate = parseDateStr(item.AMC_Upto);
                if (amcUptoDate && amcUptoDate > today) return false;

                let needsAttention = false;
                
                // Condition 1: AMC Upto is expired (less than today)
                if (amcUptoDate && amcUptoDate < today) {
                    needsAttention = true;
                }

                // Condition 2: Warranty Upto is expired
                // Condition 3: Warranty Upto expiring in current financial year
                const warrantyUptoDate = parseDateStr(item.Warranty_Upto);
                if (warrantyUptoDate) {
                    if (warrantyUptoDate < today) {
                        needsAttention = true;
                    }
                    if (warrantyUptoDate >= fyStart && warrantyUptoDate <= fyEnd) {
                        needsAttention = true;
                    }
                }

                return needsAttention;
            });
        } else if (activeTab === 'All Items') {
            // Show all items, no AMC filter needed
        }

        // Search logic
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            results = results.filter(item => {
                return (
                    (item.Item_Name && item.Item_Name.toLowerCase().includes(query)) ||
                    (item.EDP_Serial && item.EDP_Serial.toLowerCase().includes(query)) ||
                    (item.Make && item.Make.toLowerCase().includes(query)) ||
                    (item.Company_Serial && item.Company_Serial.toLowerCase().includes(query))
                );
            });
        }

        if (filterItemName) {
            results = results.filter(item => item.Item_Name === filterItemName);
        }

        return results;
    }, [hardwareList, activeTab, searchQuery, filterItemName, today, fyStart, fyEnd]);

    // Selection logic
    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredList.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredList.map(item => item.id));
        }
    };

    const handleRowClick = (e, id) => {
        // Prevent toggle if clicking on edit button or input elements
        if (['BUTTON', 'SVG', 'PATH', 'INPUT'].includes(e.target.tagName.toUpperCase())) return;
        toggleSelect(id);
    };

    // Bulk AMC logic
    const handleBulkAMCUpdate = async () => {
        if (bulkAMCData.AMC === 'Yes' && !bulkAMCData.AMC_Upto) {
            return showAlert('error', 'Please enter AMC Upto date');
        }
        setProcessing(true);
        try {
            const res = await fetch('http://localhost:3001/api/hardware/bulk-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedIds, updates: bulkAMCData })
            });
            if (res.ok) {
                showAlert('success', 'Items updated successfully');
                setSelectedIds([]);
                setShowBulkAMCModal(false);
                fetchHardware();
            } else {
                showAlert('error', 'Bulk update failed');
            }
        } catch (error) {
            console.error('Bulk AMC error:', error);
            showAlert('error', 'Error updating bulk AMC');
        } finally {
            setProcessing(false);
        }
    };

    const handleDownloadExcel = async () => {
        setProcessing(true);
        try {
            const excelData = filteredList.map(item => ({
                'Item Name': item.Item_Name || '',
                'EDP Serial': item.EDP_Serial || '',
                'Make': item.Make || '',
                'Processor/Capacity': item.Capacity || '',
                'Purchased': item.Date_of_Purchase ? formatDate(item.Date_of_Purchase) : '',
                'Cost (Rs.)': item.Cost || '',
                'AMC': item.AMC || 'No',
                'AMC Upto': item.AMC === 'Yes' && item.AMC_Upto ? formatDate(item.AMC_Upto) : '',
                'Warranty Upto': item.Warranty_Upto ? formatDate(item.Warranty_Upto) : ''
            }));

            if (window.electronAPI && window.electronAPI.showSaveDialog) {
                const res = await fetch('http://localhost:3001/api/amc/download-buffer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: excelData })
                });
                const { buffer } = await res.json();
                
                const result = await window.electronAPI.showSaveDialog({
                    title: 'Save Excel File',
                    defaultPath: `AMC_${activeTab.replace(/ /g, '_')}.xlsx`,
                    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
                });

                if (!result.canceled && result.filePath) {
                    await window.electronAPI.writeFile({
                        filePath: result.filePath,
                        buffer: buffer
                    });
                    showAlert('success', 'File saved successfully!');
                }
            } else {
                const response = await fetch('http://localhost:3001/api/amc/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: excelData })
                });
                if (!response.ok) throw new Error('Download failed');
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `AMC_${activeTab.replace(/ /g, '_')}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                showAlert('success', 'File downloaded successfully');
            }
        } catch (error) {
            console.error('Download error:', error);
            showAlert('error', 'Failed to download file');
        } finally {
            setProcessing(false);
        }
    };

    // Single Edit logic
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
            const res = await fetch(`http://localhost:3001/api/hardware/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editFormData)
            });
            if (res.ok) {
                showAlert('success', 'Updated Successfully');
                setEditRowId(null);
                setEditFormData({});
                fetchHardware();
            } else {
                showAlert('error', 'Update failed');
            }
        } catch (error) {
            console.error('Edit error:', error);
            showAlert('error', 'Error updating item');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="page-container">
            {processing && <div className="processing-overlay"><div className="spinner"></div><p>Processing...</p></div>}
            {alert && <div className={`alert alert-${alert.type}`}>{alert.message}</div>}

            <div className="page-header">
                <h1>AMC Management</h1>
                <p>Manage Annual Maintenance Contracts (Current FY: {fyStart.getFullYear()}-{fyEnd.getFullYear()})</p>
            </div>

            <div className="tabs">
                <button
                    className={`tab ${activeTab === 'Under AMC' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('Under AMC'); setSelectedIds([]); }}
                >
                    Under AMC
                </button>
                <button
                    className={`tab ${activeTab === 'Not in AMC' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('Not in AMC'); setSelectedIds([]); }}
                >
                    Not in AMC
                </button>
                <button
                    className={`tab ${activeTab === 'All Items' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('All Items'); setSelectedIds([]); }}
                >
                    All Items
                </button>
            </div>

            <div className="tab-content">
                <div className="toolbar">
                    <div className="toolbar-actions">
                        <button className="btn btn-outline" onClick={handleDownloadExcel}>
                            <FontAwesomeIcon icon={faDownload} /> Download Excel
                        </button>
                        {selectedIds.length > 0 && (
                            <button className="btn btn-primary" onClick={() => setShowBulkAMCModal(true)}>
                                Bulk Update AMC ({selectedIds.length})
                            </button>
                        )}
                    </div>

                    <div className="toolbar-actions">
                        <select
                            className="form-select"
                            value={filterItemName}
                            onChange={e => setFilterItemName(e.target.value)}
                            style={{ width: '160px' }}
                        >
                            <option value="">All Items</option>
                            {[...new Set(hardwareList.map(h => h.Item_Name).filter(Boolean))].sort().map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search by Name, EDP, Make..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <button className="btn btn-outline" onClick={() => setSearchQuery('')}>
                            <FontAwesomeIcon icon={faTimes} /> Clear
                        </button>
                    </div>
                </div>

            <div className="table-responsive table-card">
                {loading ? (
                    <div className="empty-state">Loading hardware...</div>
                ) : filteredList.length === 0 ? (
                    <div className="empty-state">No hardware items found.</div>
                ) : (
                    <table className="supplier-table" style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{ position: 'sticky', left: 0, zIndex: 3, backgroundColor: '#1a1a2e', color: '#fff', width: '50px' }}>
                                    <input
                                        type="checkbox"
                                        onChange={toggleSelectAll}
                                        checked={selectedIds.length === filteredList.length && filteredList.length > 0}
                                    />
                                </th>
                                <th style={{ position: 'sticky', left: '50px', zIndex: 3, backgroundColor: '#1a1a2e', color: '#fff', minWidth: '80px', borderRight: '2px solid #e0e0e0' }}>Actions</th>
                                <th style={{ backgroundColor: '#1a1a2e', color: '#fff' }}>Item Name</th>
                                <th style={{ backgroundColor: '#1a1a2e', color: '#fff' }}>EDP Serial</th>
                                <th style={{ backgroundColor: '#1a1a2e', color: '#fff' }}>Make</th>
                                <th style={{ backgroundColor: '#1a1a2e', color: '#fff' }}>Processor/Capacity</th>
                                <th style={{ backgroundColor: '#1a1a2e', color: '#fff' }}>Purchased</th>
                                <th style={{ backgroundColor: '#1a1a2e', color: '#fff' }}>Cost</th>
                                <th style={{ backgroundColor: '#1a1a2e', color: '#fff' }}>AMC</th>
                                <th style={{ backgroundColor: '#1a1a2e', color: '#fff' }}>AMC Upto</th>
                                <th style={{ backgroundColor: '#1a1a2e', color: '#fff' }}>Warranty Upto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredList.map(item => (
                                <tr key={item.id} className="hover-row">
                                    <td
                                        style={{ position: 'sticky', left: 0, zIndex: 1, backgroundColor: '#ffffff', textAlign: 'center', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                                        onClick={(e) => handleRowClick(e, item.id)}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(item.id)}
                                            onChange={() => toggleSelect(item.id)}
                                        />
                                    </td>
                                    <td
                                        style={{ position: 'sticky', left: '50px', zIndex: 1, backgroundColor: '#ffffff', borderRight: '2px solid #e0e0e0', borderBottom: '1px solid #eee', cursor: 'pointer' }}
                                        onClick={(e) => handleRowClick(e, item.id)}
                                    >
                                        <div className="action-buttons" style={{ display: 'flex', justifyContent: 'center' }}>
                                            <button className="btn-icon edit" onClick={(e) => { e.stopPropagation(); startEdit(item); }} title="Edit AMC">
                                                <FontAwesomeIcon icon={faEdit} />
                                            </button>
                                        </div>
                                    </td>
                                    <td style={{ borderBottom: '1px solid #eee' }}>{item.Item_Name}</td>
                                    <td style={{ borderBottom: '1px solid #eee', fontWeight: 600 }}>{item.EDP_Serial}</td>
                                    <td style={{ borderBottom: '1px solid #eee' }}>{item.Make || '-'}</td>
                                    <td style={{ borderBottom: '1px solid #eee' }}>{item.Capacity || '-'}</td>
                                    <td style={{ borderBottom: '1px solid #eee' }}>{formatDate(item.Issued_Date) || '-'}</td>
                                    <td style={{ borderBottom: '1px solid #eee' }}>{item.Cost || '0'}</td>
                                    <td style={{ borderBottom: '1px solid #eee' }}>
                                        <span style={{ 
                                            padding: '4px 8px', 
                                            borderRadius: '4px', 
                                            backgroundColor: item.AMC === 'Yes' ? '#e8f5e9' : '#ffebee',
                                            color: item.AMC === 'Yes' ? '#2e7d32' : '#c62828',
                                            fontWeight: 500,
                                            fontSize: '0.85em'
                                        }}>
                                            {item.AMC || 'No'}
                                        </span>
                                    </td>
                                    <td style={{ borderBottom: '1px solid #eee' }}>{item.AMC === 'Yes' ? formatDate(item.AMC_Upto) : '-'}</td>
                                    <td style={{ borderBottom: '1px solid #eee' }}>{formatDate(item.Warranty_Upto) || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Bulk AMC Modal */}
            {showBulkAMCModal && (
                <div className="modal-overlay">
                    <div className="modal-content modal-sm">
                        <div className="modal-header">
                            <h3>Bulk Update AMC</h3>
                        </div>
                        <div className="modal-body">
                            <p className="helper-text mb-lg">Updating <strong>{selectedIds.length}</strong> selected items.</p>
                            <div className="form-group">
                                <label>AMC Status</label>
                                <select
                                    className="form-select"
                                    value={bulkAMCData.AMC}
                                    onChange={(e) => setBulkAMCData({ ...bulkAMCData, AMC: e.target.value })}
                                >
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                </select>
                            </div>
                            {bulkAMCData.AMC === 'Yes' && (
                                <div className="form-group">
                                    <label>AMC Upto</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={bulkAMCData.AMC_Upto}
                                        onChange={(e) => setBulkAMCData({ ...bulkAMCData, AMC_Upto: e.target.value })}
                                    />
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

            {/* Single Edit Modal */}
            {editRowId && (
                <div className="modal-overlay">
                    <div className="modal-content modal-sm">
                        <div className="modal-header">
                            <h3>Edit {editFormData.Item_Name} — {editFormData.EDP_Serial}</h3>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>AMC Status</label>
                                <select
                                    className="form-select"
                                    value={editFormData.AMC || 'No'}
                                    onChange={(e) => setEditFormData({ ...editFormData, AMC: e.target.value })}
                                >
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                </select>
                            </div>
                            {editFormData.AMC === 'Yes' && (
                                <div className="form-group">
                                    <label>AMC Upto</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={editFormData.AMC_Upto || ''}
                                        onChange={(e) => setEditFormData({ ...editFormData, AMC_Upto: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setEditRowId(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={() => handleUpdate(editFormData.id)}>Save Changes</button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .hover-row:hover td {
                    background-color: #f8f9fa !important;
                }
            `}</style>
            </div>
        </div>
    );
};

export default AMC;
