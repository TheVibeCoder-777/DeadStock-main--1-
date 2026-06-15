import React, { useState, useEffect } from 'react';
import { formatDate } from '../utils/formatDate';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faPlus, faFilePdf, faArchive } from '@fortawesome/free-solid-svg-icons';
import { getJson, apiFetch, downloadBlob } from '../utils/api';

const PermanentAllocation = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState(null);
    const [searchTerm] = useState('');

    // Wizard State
    const [showWizard, setShowWizard] = useState(false);
    const [wizardStep, setWizardStep] = useState(1);
    const [hardwareList, setHardwareList] = useState([]); // Available hardware for transfer
    const [selectedIds, setSelectedIds] = useState([]);
    const [transferDetails, setTransferDetails] = useState({
        transferType: 'Retired',
        targetOffice: ''
    });
    const [notesheetFile, setNotesheetFile] = useState(null);
    const [wizardSearch, setWizardSearch] = useState('');

    useEffect(() => {
        fetchPermanentAllocations();
    }, []);

    const showAlert = (type, msg) => {
        setAlert({ type, message: msg });
        setTimeout(() => setAlert(null), 3000);
    };

    const fetchPermanentAllocations = async () => {
        setLoading(true);
        try {
            const res = await getJson('/permanent-allocation');
            const resData = await res.json();
            setData(resData || []);
        } catch (error) {
            console.error('Error fetching data:', error);
            showAlert('error', 'Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    // --- Wizard Actions ---
    const startWizard = async () => {
        setLoading(true);
        try {
            // Fetch ALL hardware to select from
            const res = await getJson('/hardware');
            const hwData = await res.json();
            setHardwareList(hwData);
            setWizardStep(1);
            setSelectedIds([]);
            setTransferDetails({ transferType: 'Retired', targetOffice: '' });
            setNotesheetFile(null);
            setShowWizard(true);
        } catch (error) {
            showAlert('error', 'Failed to fetch hardware list');
        } finally {
            setLoading(false);
        }
    };

    const handleWizardClose = () => {
        setShowWizard(false);
        setWizardStep(1);
    };

    const toggleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleTransferSubmit = async () => {
        if (!notesheetFile) {
            showAlert('error', 'Please upload Notesheet/Reference Document');
            return;
        }
        if (transferDetails.transferType === 'Transferred' && !transferDetails.targetOffice) {
            showAlert('error', 'Please enter Office Name');
            return;
        }

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('data', JSON.stringify({
                ids: selectedIds,
                transferType: transferDetails.transferType,
                targetOffice: transferDetails.targetOffice
            }));
            formData.append('notesheet', notesheetFile);

            const res = await apiFetch('/permanent-allocation/transfer', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const result = await res.json();
                showAlert('success', result.message);
                setShowWizard(false);
                fetchPermanentAllocations();
            } else {
                const err = await res.json();
                showAlert('error', err.error || 'Transfer failed');
            }
        } catch (error) {
            showAlert('error', 'Error submitting transfer');
        } finally {
            setLoading(false);
        }
    };

    // --- Search Logic (Main Table) ---
    const filteredData = data.filter(item => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (
            item.Item_Name?.toLowerCase().includes(s) ||
            item.EDP_Serial?.toLowerCase().includes(s) ||
            item.Issued_To?.toLowerCase().includes(s) ||
            item.R_T_Type?.toLowerCase().includes(s)
        );
    });

    // --- Wizard Step 1 Filter ---
    const wizardHardware = hardwareList.filter(item => {
        if (!wizardSearch) return true;
        const s = wizardSearch.toLowerCase();
        return (
            item.Item_Name?.toLowerCase().includes(s) ||
            item.EDP_Serial?.toLowerCase().includes(s)
        );
    });

    return (
        <div className="page-container">
            {alert && <div className={`alert alert-${alert.type}`}>{alert.message}</div>}

            <div className="page-header">
                <h1><FontAwesomeIcon icon={faArchive} /> Permanent Allocation / Transferred</h1>
            </div>

            <div className="toolbar">
                <div className="toolbar-actions">
                    <button className="btn btn-primary" onClick={startWizard}>
                        <FontAwesomeIcon icon={faPlus} /> Add / Transfer
                    </button>
                    <button className="btn btn-outline" onClick={async () => {
                        setLoading(true);
                        try {
                            const blob = await downloadBlob('/permanent-allocation/download-excel');
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'permanent_allocation.xlsx';
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                            showAlert('success', 'Downloaded');
                        } catch (e) {
                            showAlert('error', 'Download failed');
                        } finally {
                            setLoading(false);
                        }
                    }}>
                        <FontAwesomeIcon icon={faFilePdf} /> Download Excel
                    </button>
                    <button className="btn btn-outline" onClick={fetchPermanentAllocations}>
                        <FontAwesomeIcon icon={faSync} /> Refresh
                    </button>
                </div>
            </div>

            <div className="table-responsive max-h-table">
                <table className="supplier-table">
                    <thead>
                        <tr>
                            <th>R/T Type</th>
                            <th>To Office</th>
                            <th>Item Name</th>
                            <th>EDP Serial</th>
                            <th>PIN</th>
                            <th>Name</th>
                            <th>Post</th>
                            <th>Issued Date</th>
                            <th>Purchased</th>
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
                            <th>Co. Serial</th>
                            <th>Add. Items</th>
                            <th>Status</th>
                            <th>Remarks</th>
                            <th>Ref. Docs</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && data.length === 0 ? (
                            <tr><td colSpan="23">Loading...</td></tr>
                        ) : filteredData.length === 0 ? (
                            <tr><td colSpan="23">No Records Found</td></tr>
                        ) : (
                            filteredData.map((item, idx) => (
                                <tr key={idx}>
                                    <td>
                                        <span className={`status-badge ${item.R_T_Type === 'Retired' ? 'status-inactive' : 'status-warning'}`}>
                                            {item.R_T_Type}
                                        </span>
                                    </td>
                                    <td>{item.Target_Office || '-'}</td>
                                    <td>{item.Item_Name}</td>
                                    <td>{item.EDP_Serial}</td>
                                    <td>{item.PIN || '-'}</td>
                                    <td>{item.Name || '-'}</td>
                                    <td>{item.Post || '-'}</td>
                                    <td>{formatDate(item.Issued_Date)}</td>
                                    <td>{formatDate(item.Date_of_Purchase)}</td>
                                    <td>{item.Bill_Number}</td>
                                    <td>{item.Cost}</td>
                                    <td>{item.Make}</td>
                                    <td>{item.Capacity}</td>
                                    <td>{item.RAM}</td>
                                    <td>{item.OS}</td>
                                    <td>{item.Office}</td>
                                    <td>{item.Speed || '-'}</td>
                                    <td>{item.IP_Address || '-'}</td>
                                    <td>{item.MAC_Address || '-'}</td>
                                    <td>{item.Company_Serial || '-'}</td>
                                    <td>{item.Additional_Item}</td>
                                    <td>{item.Status}</td>
                                    <td>{item.Remarks}</td>
                                    <td>
                                        {item.Notesheet_Doc ? (
                                            <a href={`http://localhost:3001/uploads/${item.Notesheet_Doc}`} target="_blank" rel="noreferrer">
                                                <FontAwesomeIcon icon={faFilePdf} className="text-icon-pdf" />
                                            </a>
                                        ) : '-'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Transfer Wizard Modal */}
            {showWizard && (
                <div className="modal-overlay">
                    <div className="modal-content modal-xl">
                        <div className="modal-header">
                            <h3>Transfer Hardware (Step {wizardStep} of 3)</h3>
                        </div>
                        <div className="modal-body">

                            {/* Step 1: Select Items */}
                            {wizardStep === 1 && (
                                <div>
                                    <div className="flex-row justify-between items-center mb-md">
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Search Hardware to Transfer..."
                                            value={wizardSearch}
                                            onChange={(e) => setWizardSearch(e.target.value)}
                                            style={{ width: '300px' }}
                                        />
                                        <div>selected: {selectedIds.length}</div>
                                    </div>
                                    <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ddd' }}>
                                        <table className="supplier-table">
                                            <thead>
                                                <tr>
                                                    <th>Select</th>
                                                    <th>Item Name</th>
                                                    <th>EDP Serial</th>
                                                    <th>Issued To</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {wizardHardware.map(item => (
                                                    <tr key={item.id} onClick={() => toggleSelect(item.id)} style={{ cursor: 'pointer', backgroundColor: selectedIds.includes(item.id) ? '#eef' : '' }}>
                                                        <td><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} /></td>
                                                        <td>{item.Item_Name}</td>
                                                        <td>{item.EDP_Serial}</td>
                                                        <td>{item.Issued_To || 'STOCK'}</td>
                                                        <td>{item.Status}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="flex-row justify-end gap-md" style={{ marginTop: '20px' }}>
                                        <button className="btn btn-primary" disabled={selectedIds.length === 0} onClick={() => setWizardStep(2)}>Next</button>
                                        <button className="btn btn-secondary" onClick={handleWizardClose}>Cancel</button>
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Transfer Details & Upload */}
                            {wizardStep === 2 && (
                                <div>
                                    <div className="form-group">
                                        <label>Reference Document / Notesheet (Required) <span className="required">*</span></label>
                                        <input type="file" className="form-input" onChange={(e) => setNotesheetFile(e.target.files[0])} accept=".pdf,.jpg,.png,.doc,.docx" />
                                    </div>

                                    <div className="form-group">
                                        <label>Transfer Type <span className="required">*</span></label>
                                        <select
                                            className="form-select"
                                            value={transferDetails.transferType}
                                            onChange={(e) => setTransferDetails({ ...transferDetails, transferType: e.target.value })}
                                        >
                                            <option value="Retired">Retired</option>
                                            <option value="Transferred">Transferred</option>
                                        </select>
                                    </div>

                                    {transferDetails.transferType === 'Transferred' && (
                                        <div className="form-group">
                                            <label>Target Office Name <span className="required">*</span></label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={transferDetails.targetOffice}
                                                onChange={(e) => setTransferDetails({ ...transferDetails, targetOffice: e.target.value })}
                                            />
                                        </div>
                                    )}

                                    <div className="flex-row justify-end gap-md" style={{ marginTop: '20px' }}>
                                        <button className="btn btn-outline" onClick={() => setWizardStep(1)}>Back</button>
                                        <button className="btn btn-primary" onClick={() => setWizardStep(3)} disabled={!notesheetFile || (transferDetails.transferType === 'Transferred' && !transferDetails.targetOffice)}>Next</button>
                                        <button className="btn btn-secondary" onClick={handleWizardClose}>Cancel</button>
                                    </div>
                                </div>
                            )}

                            {/* Step 3: Confirmation */}
                            {wizardStep === 3 && (
                                <div>
                                    <h4>Confirm Transfer</h4>
                                    <p>You are about to transfer <strong>{selectedIds.length}</strong> items.</p>
                                    <ul>
                                        <li><strong>Type:</strong> {transferDetails.transferType}</li>
                                        {transferDetails.transferType === 'Transferred' && <li><strong>Target Office:</strong> {transferDetails.targetOffice}</li>}
                                        <li><strong>Document:</strong> {notesheetFile?.name}</li>
                                    </ul>
                                    <div className="alert alert-warning">
                                        Warning: These items will be removed from the active Hardware and Allocation inventory.
                                    </div>
                                    <div className="flex-row justify-end gap-md" style={{ marginTop: '20px' }}>
                                        <button className="btn btn-outline" onClick={() => setWizardStep(2)}>Back</button>
                                        <button className="btn btn-primary" onClick={handleTransferSubmit}>Proceed</button>
                                        <button className="btn btn-secondary" onClick={handleWizardClose}>Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PermanentAllocation;
