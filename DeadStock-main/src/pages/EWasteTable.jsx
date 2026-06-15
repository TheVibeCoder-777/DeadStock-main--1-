import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatDate } from '../utils/formatDate';
import { useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faPlus,
    faTrash,
    faCheckCircle,
    faFileExcel,
    faDownload,
    faLightbulb,
    faTimes,
    faSync
} from '@fortawesome/free-solid-svg-icons';
import { getJson, postJson, deleteJson, downloadBlob, apiFetch } from '../utils/api';

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

const EWasteTable = () => {
    const { year } = useParams();
    const [items, setItems] = useState([]);
    const [yearData, setYearData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [alert, setAlert] = useState(null);
    const [activeTab, setActiveTab] = useState('list');
    const [reportRefDate, setReportRefDate] = useState(new Date());

    // Hardware search
    const [showSearchModal, setShowSearchModal] = useState(false);
    const [allHardware, setAllHardware] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedHardware, setSelectedHardware] = useState([]);

    // Suggestions
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Completion
    const [showCompleteModal, setShowCompleteModal] = useState(false);
    const fileInputRef = useRef(null);
    const uploadFileRef = useRef(null);

    useEffect(() => {
        fetchYearData();
        fetchItems();
        fetchSuggestions();
    }, [year]);

    const fetchYearData = async () => {
        try {
            const res = await getJson(`/ewaste/years/${year}`);
            const data = await res.json();
            setYearData(data);
        } catch (error) {
            showAlert('error', 'Failed to fetch year data');
        }
    };

    const fetchItems = async () => {
        setLoading(true);
        try {
            const res = await getJson(`/ewaste/${year}/items`);
            const data = await res.json();
            setItems(data);
        } catch (error) {
            showAlert('error', 'Failed to fetch items');
        } finally {
            setLoading(false);
        }
    };

    const fetchSuggestions = async () => {
        try {
            const res = await getJson('/ewaste/suggestions');
            const data = await res.json();
            setSuggestions(data);
        } catch (error) {
            console.error('Failed to fetch suggestions');
        }
    };

    const showAlert = (type, msg) => {
        setAlert({ type, message: msg });
        setTimeout(() => setAlert(null), 3000);
    };

    const handleOpenSearch = async () => {
        setShowSearchModal(true);
        try {
            const res = await getJson('/hardware');
            const data = await res.json();
            setAllHardware(data);
        } catch (error) {
            showAlert('error', 'Failed to fetch hardware');
        }
    };

    // --- Computed Search (instant) ---
    const filteredHardware = useMemo(() => {
        if (!searchQuery) return allHardware;
        try {
            const query = searchQuery.toLowerCase();
            return allHardware.filter(h => {
                try {
                    return String(h.EDP_Serial || '').toLowerCase().includes(query) ||
                        String(h.Item_Name || '').toLowerCase().includes(query) ||
                        String(h.Make || '').toLowerCase().includes(query);
                } catch { return false; }
            });
        } catch { return allHardware; }
    }, [searchQuery, allHardware]);

    const toggleHardwareSelection = (hw) => {
        if (selectedHardware.find(s => s.id === hw.id)) {
            setSelectedHardware(selectedHardware.filter(s => s.id !== hw.id));
        } else {
            setSelectedHardware([...selectedHardware, hw]);
        }
    };

    const handleAddToEWaste = async () => {
        if (selectedHardware.length === 0) {
            showAlert('error', 'Please select at least one item');
            return;
        }

        setProcessing(true);
        try {
            const res = await postJson(`/ewaste/${year}/items`, { hardware_ids: selectedHardware.map(h => h.id) });

            if (res.ok) {
                const result = await res.json();
                showAlert('success', result.message);
                setShowSearchModal(false);
                setSelectedHardware([]);
                fetchItems();
                fetchSuggestions();
            } else {
                showAlert('error', 'Failed to add items');
            }
        } catch (error) {
            showAlert('error', 'Error adding items');
        } finally {
            setProcessing(false);
        }
    };

    const handleAddSuggestions = async () => {
        if (suggestions.length === 0) {
            showAlert('error', 'No suggestions available');
            return;
        }

        setProcessing(true);
        try {
            const res = await postJson(`/ewaste/${year}/items`, { hardware_ids: suggestions.map(s => s.id) });

            if (res.ok) {
                const result = await res.json();
                showAlert('success', result.message);
                setShowSuggestions(false);
                fetchItems();
                fetchSuggestions();
            } else {
                showAlert('error', 'Failed to add suggestions');
            }
        } catch (error) {
            showAlert('error', 'Error adding suggestions');
        } finally {
            setProcessing(false);
        }
    };

    const handleRemoveItem = async (itemId) => {
        if (!window.confirm('Remove this item from E-Waste?')) return;

        try {
            const res = await deleteJson(`/ewaste/${year}/items/${itemId}`);

            if (res.ok) {
                showAlert('success', 'Item removed');
                fetchItems();
                fetchSuggestions();
            } else {
                showAlert('error', 'Failed to remove item');
            }
        } catch (error) {
            showAlert('error', 'Error removing item');
        }
    };

    const handleDownloadExcel = async () => {
        setProcessing(true);
        try {
            const blob = await downloadBlob(`/ewaste/${year}/download`);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `ewaste_${year}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showAlert('success', 'File downloaded successfully');
        } catch (error) {
            console.error('Download error:', error);
            showAlert('error', 'Error downloading file');
        } finally {
            setProcessing(false);
        }
    };

    const handleDownloadReportExcel = async () => {
        setProcessing(true);
        try {
            const dateStr = reportRefDate.toISOString();
            const blob = await downloadBlob(`/ewaste/${year}/report/download?refDate=${encodeURIComponent(dateStr)}`);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `ewaste_report_${year}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showAlert('success', 'Report downloaded successfully');
        } catch (error) {
            console.error('Download error:', error);
            showAlert('error', 'Error downloading report');
        } finally {
            setProcessing(false);
        }
    };

    const handleBulkUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setProcessing(true);
        try {
            if (window.electronAPI && window.electronAPI.saveFile) {
                const arrayBuffer = await file.arrayBuffer();
                const saveResult = await window.electronAPI.saveFile({
                    name: file.name,
                    buffer: Array.from(new Uint8Array(arrayBuffer))
                });

                if (!saveResult.success) {
                    throw new Error(saveResult.error || 'Failed to save file locally');
                }

                const savedFileName = saveResult.path.split('\\').pop() || saveResult.path.split('/').pop();
                const res = await postJson(`/ewaste/${year}/upload`, {
                    fileName: savedFileName,
                    processOnly: true
                });

                const result = await res.json();
                if (res.ok) {
                    showAlert('success', result.message);
                    fetchItems();
                } else {
                    showAlert('error', result.error || 'Upload failed');
                }
            } else {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const res = await postJson(`/ewaste/${year}/upload`, { fileData: event.target.result });
                        const result = await res.json();
                        if (res.ok) {
                            showAlert('success', result.message || 'Upload complete');
                            fetchItems();
                        } else {
                            showAlert('error', result.error || 'Upload failed');
                        }
                    } catch (err) {
                        showAlert('error', 'Upload error');
                    }
                };
                reader.readAsDataURL(file);
            }
        } catch (error) {
            console.error('Upload error:', error);
            showAlert('error', `Upload failed: ${error.message}`);
        } finally {
            setProcessing(false);
            e.target.value = null;
        }
    };

    const handleMarkComplete = async (e) => {
        e.preventDefault();
        const file = fileInputRef.current?.files[0];

        if (!file) {
            showAlert('error', 'Please upload a completion document');
            return;
        }

        if (!window.confirm('Mark this E-Waste year as completed? This will remove all items from the main hardware inventory and lock this table.')) {
            return;
        }

        setProcessing(true);
        const formData = new FormData();
        formData.append('document', file);

        try {
            const res = await apiFetch(`/ewaste/years/${year}/complete`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                showAlert('success', 'E-Waste year marked as completed');
                setShowCompleteModal(false);
                fetchYearData();
                fetchItems();
            } else {
                showAlert('error', 'Failed to mark as completed');
            }
        } catch (error) {
            showAlert('error', 'Error completing year');
        } finally {
            setProcessing(false);
        }
    };

    const isCompleted = yearData?.isCompleted;

    // Sticky column styles
    const actionStyle = { position: 'sticky', left: 0, zIndex: 3, backgroundColor: '#1a1a2e', color: '#fff', minWidth: '60px' };
    const itemStyle = (isCompleted) => ({ position: 'sticky', left: isCompleted ? 0 : '60px', zIndex: 3, backgroundColor: '#1a1a2e', color: '#fff', minWidth: '120px' });
    const serialStyle = (isCompleted) => ({ position: 'sticky', left: isCompleted ? '120px' : '180px', zIndex: 3, backgroundColor: '#1a1a2e', color: '#fff', minWidth: '100px', borderRight: '2px solid #e0e0e0' });

    const actionCell = { position: 'sticky', left: 0, zIndex: 1, backgroundColor: '#ffffff', textAlign: 'center' };
    const itemCell = (isCompleted) => ({ position: 'sticky', left: isCompleted ? 0 : '60px', zIndex: 1, backgroundColor: '#ffffff', fontWeight: 600 });
    const serialCell = (isCompleted) => ({ position: 'sticky', left: isCompleted ? '120px' : '180px', zIndex: 1, backgroundColor: '#ffffff', borderRight: '2px solid #e0e0e0', fontWeight: 600 });

    // Report processing logic
    const reportData = useMemo(() => {
        if (activeTab !== 'report') return [];
        const grouped = {};
        let grandTotalCount = 0;
        let grandTotalCost = 0;
        let grandTotalBookValue = 0;

        items.forEach(item => {
            const cost = parseFloat(item.Cost) || 0;
            let dateObj = null;

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
                const diffMs = reportRefDate.getTime() - dateObj.getTime();
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

        const rows = [];

        Object.keys(grouped).sort().forEach(itemName => {
            let itemTotalCount = 0;
            let itemTotalCost = 0;
            let itemTotalBookValue = 0;
            let index = 1; // Reset index per item name

            Object.keys(grouped[itemName]).forEach((subGroupKey) => {
                const sg = grouped[itemName][subGroupKey];
                rows.push({
                    isTotal: false,
                    isGrandTotal: false,
                    index: index++,
                    itemName: itemName,
                    count: sg.count,
                    yop: sg.yop,
                    cost: sg.cost,
                    remainingPctStr: sg.remainingPctStr,
                    bookValue: sg.bookValue
                });
                itemTotalCount += sg.count;
                itemTotalCost += sg.cost;
                itemTotalBookValue += sg.bookValue;
            });

            rows.push({
                isTotal: true,
                isGrandTotal: false,
                itemName: `${itemName} Total`,
                count: itemTotalCount,
                cost: itemTotalCost,
                bookValue: itemTotalBookValue
            });
        });

        rows.push({
            isTotal: true,
            isGrandTotal: true,
            itemName: 'Grand Total',
            count: grandTotalCount,
            cost: grandTotalCost,
            bookValue: grandTotalBookValue
        });

        return rows;
    }, [items, reportRefDate, activeTab]);

    return (
        <div className="page-container">
            {processing && <div className="processing-overlay"><div className="spinner"></div><p>Processing...</p></div>}
            {alert && <div className={`alert alert-${alert.type}`}>{alert.message}</div>}

            <div className="page-header">
                <h1>E-Waste {year}</h1>
                <p>{isCompleted ? `Completed on ${formatDate(yearData.completedAt)}` : 'Manage hardware items for disposal'}</p>
            </div>

            <div className="tabs" style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '20px' }}>
                <button 
                    style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: activeTab === 'list' ? '3px solid #00a884' : '3px solid transparent', color: activeTab === 'list' ? '#00a884' : '#666', fontWeight: activeTab === 'list' ? 'bold' : 'normal', cursor: 'pointer', fontSize: '16px' }}
                    onClick={() => setActiveTab('list')}
                >
                    E-Waste {year}
                </button>
                <button 
                    style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: activeTab === 'report' ? '3px solid #00a884' : '3px solid transparent', color: activeTab === 'report' ? '#00a884' : '#666', fontWeight: activeTab === 'report' ? 'bold' : 'normal', cursor: 'pointer', fontSize: '16px' }}
                    onClick={() => setActiveTab('report')}
                >
                    E-Waste Report {year}
                </button>
            </div>

            {activeTab === 'list' && (
                <>
                    {!isCompleted && (
                        <div className="toolbar">
                            <div className="toolbar-actions">
                                <button className="btn btn-primary" onClick={handleOpenSearch}>
                                    <FontAwesomeIcon icon={faPlus} /> Add Hardware
                                </button>
                                {suggestions.length > 0 && (
                                    <button className="btn btn-outline" onClick={() => setShowSuggestions(true)} style={{ backgroundColor: '#fff3cd', borderColor: '#ffc107' }}>
                                        <FontAwesomeIcon icon={faLightbulb} /> {suggestions.length} Suggestions (6+ years old)
                                    </button>
                                )}
                                <button className="btn btn-outline" onClick={() => uploadFileRef.current.click()}>
                                    <FontAwesomeIcon icon={faFileExcel} /> Bulk Upload
                                </button>
                                <button className="btn btn-outline" onClick={handleDownloadExcel}>
                                    <FontAwesomeIcon icon={faDownload} /> Download Excel
                                </button>
                                <input type="file" ref={uploadFileRef} style={{ display: 'none' }} accept=".xlsx, .xls" onChange={handleBulkUpload} />
                            </div>
                            {items.length > 0 && (
                                <button className="btn btn-success" onClick={() => setShowCompleteModal(true)}>
                                    <FontAwesomeIcon icon={faCheckCircle} /> Mark as Completed
                                </button>
                            )}
                        </div>
                    )}

                    {isCompleted && yearData?.completionDoc && (
                        <div style={{ padding: '15px', backgroundColor: '#d4edda', borderLeft: '4px solid #28a745', marginBottom: '20px' }}>
                            <strong>Completion Document:</strong> {yearData.completionDoc}
                        </div>
                    )}

                    <div className="table-responsive">
                        {loading ? <p>Loading...</p> : items.length === 0 ? (
                            <div className="empty-state">
                                <p>No items in this E-Waste year yet. Click "Add Hardware" to get started.</p>
                            </div>
                        ) : (
                            <table className="supplier-table" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                                <thead>
                                    <tr>
                                        {!isCompleted && <th style={actionStyle}>Action</th>}
                                        <th style={itemStyle(isCompleted)}>Item Name</th>
                                        <th style={serialStyle(isCompleted)}>EDP Serial</th>
                                        <th>Date of Purchase</th>
                                        <th>Bill Number</th>
                                        <th>Cost</th>
                                        <th>Make</th>
                                        <th>Capacity</th>
                                        <th>RAM</th>
                                        <th>OS</th>
                                        <th>Office</th>
                                        <th>Speed</th>
                                        <th>IP</th>
                                        <th>MAC</th>
                                        <th>Company Serial</th>
                                        <th>Additional Items</th>
                                        <th>Status</th>
                                        <th>AMC</th>
                                        <th>AMC Upto</th>
                                        <th>Remarks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => (
                                        <tr key={item.id}>
                                            {!isCompleted && (
                                                <td style={actionCell}>
                                                    <button className="btn-icon delete" onClick={() => handleRemoveItem(item.id)} title="Remove">
                                                        <FontAwesomeIcon icon={faTrash} />
                                                    </button>
                                                </td>
                                            )}
                                            <td style={itemCell(isCompleted)}>{item.Item_Name}</td>
                                            <td style={serialCell(isCompleted)}>{item.EDP_Serial}</td>
                                            <td>{formatDateHelper(item.date_of_purchase)}</td>
                                            <td>{item.Bill_Number}</td>
                                            <td>{item.Cost}</td>
                                            <td>{item.Make}</td>
                                            <td>{item.Capacity}</td>
                                            <td>{item.RAM}</td>
                                            <td>{item.OS}</td>
                                            <td>{item.Office}</td>
                                            <td>{item.Speed}</td>
                                            <td>{item.IP}</td>
                                            <td>{item.MAC}</td>
                                            <td>{item.Company_Serial}</td>
                                            <td>{item.Additional_Item}</td>
                                            <td>{item.Status}</td>
                                            <td>{item.AMC}</td>
                                            <td>{formatDate(item.AMC_Upto)}</td>
                                            <td>{item.Remarks}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {activeTab === 'report' && (
                <div className="report-container">
                    <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <FontAwesomeIcon icon={faFileExcel} /> E-Waste Report {year}
                        </h3>
                        <div className="toolbar-actions">
                            <button className="btn btn-outline" onClick={() => setReportRefDate(new Date())}>
                                <FontAwesomeIcon icon={faSync} /> Refresh
                            </button>
                            <button className="btn btn-primary" onClick={handleDownloadReportExcel}>
                                <FontAwesomeIcon icon={faDownload} /> Download Excel
                            </button>
                        </div>
                    </div>
                    <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '15px' }}>
                        Depreciation calculated at <strong>40% reducing balance</strong> per Income Tax Act. Current reference date: <strong>{formatDateHelper(reportRefDate.toISOString())}</strong>
                    </p>
                    
                    <div className="table-responsive">
                        {loading ? <p>Loading...</p> : items.length === 0 ? (
                            <div className="empty-state">
                                <p>No items available to generate report.</p>
                            </div>
                        ) : (
                            <table className="supplier-table">
                                <thead>
                                    <tr>
                                        <th>ITEM NO.</th>
                                        <th>ITEM NAME</th>
                                        <th>QUANTITY</th>
                                        <th>YEAR OF PURCHASE</th>
                                        <th>COST (₹)</th>
                                        <th>REMAINING VALUE (%)</th>
                                        <th>BOOK VALUE (₹)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.map((row, idx) => (
                                        <tr key={idx} style={{ 
                                            backgroundColor: row.isGrandTotal ? '#e2e3e5' : (row.isTotal ? '#f8f9fa' : '#ffffff'),
                                            fontWeight: row.isTotal ? 'bold' : 'normal'
                                        }}>
                                            <td>{row.index}</td>
                                            <td>{row.itemName}</td>
                                            <td>{row.count}</td>
                                            <td>{row.yop}</td>
                                            <td>{row.isTotal ? '' : '₹ '}{row.cost?.toFixed(2)}</td>
                                            <td>{row.remainingPctStr}</td>
                                            <td>{row.isTotal ? '' : '₹ '}{row.bookValue?.toFixed(4)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Search Hardware Modal */}
            {showSearchModal && (
                <div className="modal-overlay">
                    <div className="modal-content modal-xl">
                        <div className="modal-header">
                            <h3>Add Hardware to E-Waste</h3>
                            <button className="close-btn" onClick={() => setShowSearchModal(false)}><FontAwesomeIcon icon={faTimes} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="search-bar mb-lg">
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Search by EDP Serial, Item Name, or Make..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                                <button className="btn btn-outline" onClick={() => setSearchQuery('')}>Clear</button>
                            </div>

                            <p style={{ marginBottom: '10px' }}><strong>Selected: {selectedHardware.length}</strong></p>

                            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                <table className="supplier-table">
                                    <thead>
                                        <tr>
                                            <th>Select</th>
                                            <th>EDP Serial</th>
                                            <th>Item Name</th>
                                            <th>Make</th>
                                            <th>Category</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredHardware.map(hw => (
                                            <tr key={hw.id}>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={!!selectedHardware.find(s => s.id === hw.id)}
                                                        onChange={() => toggleHardwareSelection(hw)}
                                                    />
                                                </td>
                                                <td><strong>{hw.EDP_Serial}</strong></td>
                                                <td>{hw.Item_Name}</td>
                                                <td>{hw.Make}</td>
                                                <td>{hw.Category}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowSearchModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleAddToEWaste}>Add Selected to E-Waste</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Suggestions Modal */}
            {showSuggestions && (
                <div className="modal-overlay">
                    <div className="modal-content modal-xl">
                        <div className="modal-header">
                            <h3><FontAwesomeIcon icon={faLightbulb} /> Hardware Suggestions (6+ Years Old)</h3>
                            <button className="close-btn" onClick={() => setShowSuggestions(false)}><FontAwesomeIcon icon={faTimes} /></button>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '15px', color: '#856404', backgroundColor: '#fff3cd', padding: '10px', borderRadius: '4px' }}>
                                These items are 6 or more years old based on their purchase date. Consider adding them to E-Waste.
                            </p>
                            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                <table className="supplier-table">
                                    <thead>
                                        <tr>
                                            <th>EDP Serial</th>
                                            <th>Item Name</th>
                                            <th>Purchase Date</th>
                                            <th>Age (Years)</th>
                                            <th>Category</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {suggestions.map(s => {
                                            const age = Math.floor((new Date() - new Date(s.date_of_purchase)) / (365.25 * 24 * 60 * 60 * 1000));
                                            return (
                                                <tr key={s.id}>
                                                    <td><strong>{s.EDP_Serial}</strong></td>
                                                    <td>{s.Item_Name}</td>
                                                    <td>{s.date_of_purchase}</td>
                                                    <td><strong>{age}</strong></td>
                                                    <td>{s.Category}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowSuggestions(false)}>Close</button>
                            <button className="btn btn-primary" onClick={handleAddSuggestions}>Add All to E-Waste</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mark Complete Modal */}
            {showCompleteModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Mark E-Waste Year as Completed</h3>
                            <button className="close-btn" onClick={() => setShowCompleteModal(false)}><FontAwesomeIcon icon={faTimes} /></button>
                        </div>
                        <form onSubmit={handleMarkComplete}>
                            <div className="modal-body">
                                <div style={{ padding: '15px', backgroundColor: '#fff3cd', borderLeft: '4px solid #ffc107', marginBottom: '20px' }}>
                                    <strong>Warning:</strong> This action will:
                                    <ul style={{ marginTop: '10px', marginBottom: '0' }}>
                                        <li>Remove all {items.length} items from the main hardware inventory</li>
                                        <li>Remove them from the allocation module</li>
                                        <li>Lock this E-Waste table (read-only mode)</li>
                                        <li>This action cannot be undone</li>
                                    </ul>
                                </div>

                                <div className="form-group">
                                    <label>Upload Completion Document *</label>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="form-input"
                                        required
                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    />
                                    <p className="text-muted text-xs mt-sm">
                                        Upload disposal certificate, approval document, or any completion proof.
                                    </p>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowCompleteModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-success">Confirm Completion</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EWasteTable;
