import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatDate } from '../utils/formatDate';
import { getJson, postJson, putJson, deleteJson, downloadBlob, getErrorMessage } from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTimes, faEdit, faTrash, faFileExcel, faDownload, faFilePdf, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';

const Invoices = () => {
    // --- State ---
    const [invoices, setInvoices] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [alert, setAlert] = useState(null);

    // Search
    const [searchCriteria, setSearchCriteria] = useState('Supplier Name');
    const [searchQuery, setSearchQuery] = useState('');

    // Expanded Rows (Set of IDs)
    const [expandedRowIds, setExpandedRowIds] = useState(new Set());

    // Modal State (Add / Edit Invoice)
    const [showModal, setShowModal] = useState(false);
    const [editingInvoiceId, setEditingInvoiceId] = useState(null); // null = Add, id = Edit
    const [modalInvoice, setModalInvoice] = useState({
        Bill_Number: '', Firm_Name: '', Date: '', Amount: '', Category: 'Hardware', Items: []
    });
    const [selectedFile, setSelectedFile] = useState(null);

    // New Item State (within Modal)
    const [newItem, setNewItem] = useState({
        Hardware_Item: '', Quantity: 1, Warranty: '', Warranty_Upto: '', Item_Details: '', OEM_Software: ''
    });

    // Edit item within modal
    const [editingModalItemIdx, setEditingModalItemIdx] = useState(null);
    const [editModalItemData, setEditModalItemData] = useState({});

    const bulkUploadRef = useRef(null);

    // Options
    const [hardwareOptions, setHardwareOptions] = useState([]);

    useEffect(() => {
        fetchInvoices();
        fetchSuppliers();
        fetchHardwareCategories();
    }, []);

    // --- API Calls ---
    const fetchInvoices = async () => {
        try {
            const res = await getJson('/invoices');
            const data = await res.json();
            setInvoices(data);
        } catch (error) {
            console.error(error);
        }
    };

    const fetchSuppliers = async () => {
        try {
            const res = await getJson('/suppliers');
            const data = await res.json();
            setSuppliers(data);
        } catch (error) {
            console.error(error);
        }
    };

    const fetchHardwareCategories = async () => {
        try {
            const res = await getJson('/hardware/config');
            const data = await res.json();
            const categories = data.map(item => item.category);
            setHardwareOptions(categories);
        } catch (error) {
            console.error('Error fetching hardware categories:', error);
        }
    };

    // --- Helper for Base64 ---
    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    // --- Open Modal Handlers ---
    const handleOpenAddModal = () => {
        setEditingInvoiceId(null);
        setModalInvoice({ Bill_Number: '', Firm_Name: '', Date: '', Amount: '', Category: 'Hardware', Items: [] });
        setSelectedFile(null);
        setNewItem({ Hardware_Item: '', Quantity: 1, Warranty: '', Warranty_Upto: '', Item_Details: '', OEM_Software: '' });
        setEditingModalItemIdx(null);
        setShowModal(true);
    };

    const handleOpenEditModal = (inv) => {
        setEditingInvoiceId(inv.id);
        setModalInvoice({
            Bill_Number: inv.Bill_Number || '',
            Firm_Name: inv.Firm_Name || '',
            Date: inv.Date || '',
            Amount: inv.Amount || '',
            Category: inv.Category || 'Hardware',
            Items: inv.Items ? inv.Items.map(item => ({ ...item })) : []
        });
        setSelectedFile(null);
        setNewItem({ Hardware_Item: '', Quantity: 1, Warranty: '', Warranty_Upto: '', Item_Details: '', OEM_Software: '' });
        setEditingModalItemIdx(null);
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingInvoiceId(null);
        setEditingModalItemIdx(null);
    };

    // --- Save (Create or Update) ---
    const handleSaveInvoice = async () => {
        if (!modalInvoice.Bill_Number || !modalInvoice.Firm_Name || !modalInvoice.Date || !modalInvoice.Amount) {
            showAlert('error', 'Please fill all required fields');
            return;
        }

        setProcessing(true);
        try {
            let fileData = null;
            let fileName = null;
            if (selectedFile) {
                fileData = await toBase64(selectedFile);
                fileName = selectedFile.name;
            }

            const payload = {
                data: modalInvoice,
                fileData: fileData,
                fileName: fileName
            };

            const endpoint = editingInvoiceId ? `/invoices/${editingInvoiceId}` : '/invoices';
            const res = editingInvoiceId 
                ? await putJson(endpoint, payload) 
                : await postJson(endpoint, payload);

            if (res.ok) {
                showAlert('success', editingInvoiceId ? 'Invoice Updated' : 'Invoice Added');
                handleCloseModal();
                fetchInvoices();
            } else {
                const errorMsg = await getErrorMessage(res);
                showAlert('error', errorMsg);
            }
        } catch (error) {
            showAlert('error', 'Error saving invoice');
        } finally {
            setProcessing(false);
        }
    };

    // --- Delete ---
    const handleDeleteInvoice = async (id) => {
        if (!window.confirm('Are you sure you want to delete this invoice?')) return;
        setProcessing(true);
        try {
            const res = await deleteJson(`/invoices/${id}`);
            if (res.ok) {
                showAlert('success', 'Invoice Deleted');
                fetchInvoices();
            } else {
                showAlert('error', 'Failed to delete');
            }
        } catch (error) {
            showAlert('error', 'Error deleting invoice');
        } finally {
            setProcessing(false);
        }
    };

    // --- Excel ---
    const handleExcelDownload = async () => {
        setProcessing(true);
        try {
            const blob = await downloadBlob('/invoices/download');
            const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'invoices.xlsx';
                document.body.appendChild(a);
                a.click();
            a.remove();
            showAlert('success', 'File downloaded');
        } catch (error) {
            showAlert('error', 'Error downloading file');
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
                    name: `invoices_${Date.now()}_${file.name}`,
                    buffer: Array.from(new Uint8Array(arrayBuffer))
                });

                if (!saveResult.success) {
                    throw new Error(saveResult.error || 'Failed to save file locally');
                }

                const savedFileName = saveResult.path.split('\\').pop() || saveResult.path.split('/').pop();
                const res = await postJson('/invoices/upload', {
                    fileName: savedFileName,
                    processOnly: true
                });

                const result = await res.json();
                if (res.ok) {
                    showAlert('success', result.message || 'Upload complete');
                    fetchInvoices();
                } else {
                    showAlert('error', result.error || 'Upload failed');
                }
            } else {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const res = await postJson('/invoices/upload', { fileData: event.target.result });
                        const result = await res.json();
                        if (res.ok) {
                            showAlert('success', result.message || 'Upload complete');
                            fetchInvoices();
                        } else {
                            showAlert('error', result.error || 'Upload failed');
                        }
                    } catch (err) {
                        showAlert('error', 'Upload error');
                    } finally {
                        setProcessing(false);
                    }
                };
                reader.readAsDataURL(file);
                return;
            }
        } catch (error) {
            console.error('Upload error:', error);
            showAlert('error', `Upload failed: ${error.message}`);
        } finally {
            setProcessing(false);
            e.target.value = null;
        }
    };

    // --- Search ---
    const filteredInvoices = useMemo(() => {
        if (!searchQuery) return invoices;
        try {
            const query = searchQuery.toLowerCase();
            return invoices.filter(inv => {
                try {
                    if (searchCriteria === 'Supplier Name') {
                        return String(inv.Firm_Name || '').toLowerCase().includes(query);
                    } else {
                        return String(inv.Bill_Number || '').toLowerCase().includes(query);
                    }
                } catch { return false; }
            });
        } catch { return invoices; }
    }, [searchQuery, searchCriteria, invoices]);

    const handleClearSearch = () => {
        setSearchQuery('');
        setSearchCriteria('Supplier Name');
    };

    // --- Modal Item Helpers ---
    const addItemToModal = () => {
        if (!newItem.Hardware_Item || !newItem.Quantity) {
            showAlert('error', 'Item Name and Quantity required');
            return;
        }
        setModalInvoice({ ...modalInvoice, Items: [...modalInvoice.Items, { ...newItem }] });
        setNewItem({ Hardware_Item: '', Quantity: 1, Warranty: '', Warranty_Upto: '', Item_Details: '', OEM_Software: '' });
    };

    const removeItemFromModal = (index) => {
        const updatedItems = [...modalInvoice.Items];
        updatedItems.splice(index, 1);
        setModalInvoice({ ...modalInvoice, Items: updatedItems });
    };

    const startEditModalItem = (index) => {
        setEditingModalItemIdx(index);
        setEditModalItemData({ ...modalInvoice.Items[index] });
    };

    const saveEditModalItem = () => {
        if (editingModalItemIdx === null) return;
        const updatedItems = [...modalInvoice.Items];
        updatedItems[editingModalItemIdx] = { ...editModalItemData };
        setModalInvoice({ ...modalInvoice, Items: updatedItems });
        setEditingModalItemIdx(null);
        setEditModalItemData({});
    };

    const cancelEditModalItem = () => {
        setEditingModalItemIdx(null);
        setEditModalItemData({});
    };

    // --- Misc Helpers ---
    const showAlert = (type, msg) => {
        setAlert({ type, message: msg });
        setTimeout(() => setAlert(null), 3000);
    };

    const toggleRow = (id) => {
        const newSet = new Set(expandedRowIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedRowIds(newSet);
    };

    // --- Render ---
    return (
        <div className="page-container">
            {processing && <div className="processing-overlay"><div className="spinner"></div><p>Processing...</p></div>}
            {alert && <div className={`alert alert-${alert.type}`}>{alert.message}</div>}

            <div className="page-header">
                <h1>Invoices</h1>
                <p>Manage Purchase Invoices</p>
            </div>

            <div className="toolbar">
                <div className="toolbar-actions">
                    <button className="btn btn-primary" onClick={handleOpenAddModal}>
                        <FontAwesomeIcon icon={faPlus} /> New Invoice
                    </button>
                    <button className="btn btn-outline" onClick={() => bulkUploadRef.current.click()}>
                        <FontAwesomeIcon icon={faFileExcel} /> Bulk Upload
                    </button>
                    <button className="btn btn-outline" onClick={handleExcelDownload}>
                        <FontAwesomeIcon icon={faDownload} /> Download Excel
                    </button>
                    <input
                        type="file"
                        ref={bulkUploadRef}
                        className="d-none"
                        accept=".xlsx, .xls"
                        onChange={handleBulkUpload}
                    />
                </div>

                <div className="search-bar">
                    <select className="form-select" value={searchCriteria} onChange={(e) => setSearchCriteria(e.target.value)}>
                        <option value="Supplier Name">Supplier Name</option>
                        <option value="Bill Number">Bill Number</option>
                    </select>
                    <input type="text" className="form-input" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    <button className="btn btn-outline" onClick={handleClearSearch}><FontAwesomeIcon icon={faTimes} /> Clear</button>
                </div>
            </div>

            {/* ====== Table ====== */}
            <div className="table-responsive">
                <table className="supplier-table">
                    <thead>
                        <tr>
                            <th className="col-checkbox"></th>
                            <th>Serial No</th>
                            <th>Bill No</th>
                            <th>Firm Name</th>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Category</th>
                            <th>PDF</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredInvoices.length > 0 ? filteredInvoices.map(inv => (
                            <React.Fragment key={inv.id}>
                                <tr className={expandedRowIds.has(inv.id) ? 'expanded-row-parent' : ''}>
                                    <td onClick={() => toggleRow(inv.id)} className="expand-toggle">
                                        <FontAwesomeIcon icon={expandedRowIds.has(inv.id) ? faChevronUp : faChevronDown} />
                                    </td>
                                    <td>{inv.Serial_Number}</td>
                                    <td>{inv.Bill_Number}</td>
                                    <td>{inv.Firm_Name}</td>
                                    <td>{formatDate(inv.Date)}</td>
                                    <td>{inv.Amount}</td>
                                    <td>{inv.Category}</td>
                                    <td>
                                        {inv.Bill_PDF ?
                                            <a href={`http://localhost:3001/uploads/${inv.Bill_PDF}`} target="_blank" rel="noreferrer">
                                                <FontAwesomeIcon icon={faFilePdf} className="text-icon-pdf" />
                                            </a>
                                            : '-'}
                                    </td>
                                    <td>
                                        <div className="action-buttons">
                                            <button className="btn-icon edit" title="Edit" onClick={() => handleOpenEditModal(inv)}><FontAwesomeIcon icon={faEdit} /></button>
                                            <button className="btn-icon delete" title="Delete" onClick={() => handleDeleteInvoice(inv.id)}><FontAwesomeIcon icon={faTrash} /></button>
                                        </div>
                                    </td>
                                </tr>

                                {/* Expanded Details (Read-Only) */}
                                {expandedRowIds.has(inv.id) && (
                                    <tr className="expanded-row-details">
                                        <td colSpan="9" className="expanded-detail-cell">
                                            <div className="flex-row justify-between items-center mb-md">
                                                <strong>Items for Invoice {inv.Bill_Number}</strong>
                                            </div>

                                            {inv.Items && inv.Items.length > 0 ? (
                                                <table className="items-table-nested">
                                                    <thead>
                                                        <tr>
                                                            <th>Product</th>
                                                            <th>Qty</th>
                                                            <th>Warranty</th>
                                                            <th>Warranty Upto</th>
                                                            <th>Details</th>
                                                            <th>OEM Software</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {inv.Items.map((item, idx) => (
                                                            <tr key={idx}>
                                                                <td>{item.Hardware_Item}</td>
                                                                <td>{item.Quantity}</td>
                                                                <td>{item.Warranty}</td>
                                                                <td>{formatDate(item.Warranty_Upto)}</td>
                                                                <td>{item.Item_Details}</td>
                                                                <td>{item.OEM_Software}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            ) : <p className="no-items-text">No items saved for this invoice.</p>}
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        )) : (
                            <tr><td colSpan="9" className="no-data">No Data Found</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* ====== Modal - Add / Edit Invoice ====== */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content modal-xl">
                        <div className="modal-header">
                            <h3>{editingInvoiceId ? 'Edit Invoice' : 'New Invoice'}</h3>
                        </div>
                        <div className="modal-body">
                            {/* Master Form */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Bill Number <span className="required">*</span></label>
                                    <input type="text" className="form-input" value={modalInvoice.Bill_Number} onChange={(e) => setModalInvoice({ ...modalInvoice, Bill_Number: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Firm Name <span className="required">*</span></label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        list="suppliers-datalist"
                                        value={modalInvoice.Firm_Name}
                                        onChange={(e) => setModalInvoice({ ...modalInvoice, Firm_Name: e.target.value })}
                                        placeholder="Search or select supplier"
                                    />
                                    <datalist id="suppliers-datalist">
                                        {suppliers.map(s => <option key={s.Supplier_ID} value={s.Supplier_Name} />)}
                                    </datalist>
                                </div>
                                <div className="form-group">
                                    <label>Date <span className="required">*</span></label>
                                    <input type="date" className="form-input" value={modalInvoice.Date} onChange={(e) => setModalInvoice({ ...modalInvoice, Date: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Amount (INR) <span className="required">*</span></label>
                                    <input type="number" className="form-input" value={modalInvoice.Amount} onChange={(e) => setModalInvoice({ ...modalInvoice, Amount: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Category <span className="required">*</span></label>
                                    <select className="form-select" value={modalInvoice.Category} onChange={(e) => setModalInvoice({ ...modalInvoice, Category: e.target.value })}>
                                        <option value="Hardware">Hardware</option>
                                        <option value="Software">Software</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Bill PDF {editingInvoiceId ? '(Replace)' : ''}</label>
                                    <input type="file" className="form-input" onChange={(e) => setSelectedFile(e.target.files[0])} accept="application/pdf" />
                                </div>
                            </div>

                            <hr className="section-separator" />

                            {/* Items Sub-Form */}
                            <h4>Invoice Items</h4>
                            <div className="form-row items-end">
                                <div className="form-group">
                                    <label>Item</label>
                                    <select className="form-select" value={newItem.Hardware_Item} onChange={(e) => setNewItem({ ...newItem, Hardware_Item: e.target.value })}>
                                        <option value="">Select Item</option>
                                        {hardwareOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ width: '80px' }}>
                                    <label>Qty</label>
                                    <input type="number" className="form-input" value={newItem.Quantity} onChange={(e) => setNewItem({ ...newItem, Quantity: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Warranty</label>
                                    <select className="form-select" value={newItem.Warranty} onChange={(e) => setNewItem({ ...newItem, Warranty: e.target.value })}>
                                        <option value="">Select</option>
                                        <option value="1 Year">1 Year</option>
                                        <option value="2 Years">2 Years</option>
                                        <option value="3 Years">3 Years</option>
                                        <option value="4 Years">4 Years</option>
                                        <option value="5 Years">5 Years</option>
                                        <option value="6 Years">6 Years</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Warranty Upto</label>
                                    <input type="date" className="form-input" value={newItem.Warranty_Upto} onChange={(e) => setNewItem({ ...newItem, Warranty_Upto: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group flex-2">
                                    <label>Details / Specs</label>
                                    <input type="text" className="form-input" placeholder="Short text & specs" value={newItem.Item_Details} onChange={(e) => setNewItem({ ...newItem, Item_Details: e.target.value })} />
                                </div>
                                <div className="form-group flex-1">
                                    <label>OEM Software</label>
                                    <input type="text" className="form-input" placeholder="Win 11 / Office 365" value={newItem.OEM_Software} onChange={(e) => setNewItem({ ...newItem, OEM_Software: e.target.value })} />
                                </div>
                                <div className="form-group" style={{ marginTop: '24px' }}>
                                    <button className="btn btn-secondary" onClick={addItemToModal} type="button">
                                        <FontAwesomeIcon icon={faPlus} /> Add Item
                                    </button>
                                </div>
                            </div>

                            {/* Added Items List (Read-Only Rows) */}
                            {modalInvoice.Items.length > 0 && (
                                <table className="supplier-table mt-md">
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th>Qty</th>
                                            <th>Warranty</th>
                                            <th>Warranty Upto</th>
                                            <th>Details</th>
                                            <th>OEM</th>
                                            <th className="col-actions text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {modalInvoice.Items.map((item, idx) => (
                                            <tr key={idx}>
                                                <td>{item.Hardware_Item}</td>
                                                <td>{item.Quantity}</td>
                                                <td>{item.Warranty}</td>
                                                <td>{formatDate(item.Warranty_Upto)}</td>
                                                <td>{item.Item_Details}</td>
                                                <td>{item.OEM_Software}</td>
                                                <td className="text-center">
                                                    <div className="action-buttons">
                                                        <button className="btn-icon edit" title="Edit" onClick={() => startEditModalItem(idx)}><FontAwesomeIcon icon={faEdit} /></button>
                                                        <button className="btn-icon delete" title="Delete" onClick={() => removeItemFromModal(idx)}><FontAwesomeIcon icon={faTrash} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {/* ====== Sub-Popup: Edit Item ====== */}
                            {editingModalItemIdx !== null && (
                                <div className="sub-popup-overlay">
                                    <div className="sub-popup-dialog">
                                        <h4>Edit Item</h4>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Product</label>
                                                <select className="form-select" value={editModalItemData.Hardware_Item} onChange={(e) => setEditModalItemData({ ...editModalItemData, Hardware_Item: e.target.value })}>
                                                    {hardwareOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                            </div>
                                            <div className="form-group" style={{ width: '100px' }}>
                                                <label>Qty</label>
                                                <input type="number" className="form-input" value={editModalItemData.Quantity} onChange={(e) => setEditModalItemData({ ...editModalItemData, Quantity: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Warranty</label>
                                                <select className="form-select" value={editModalItemData.Warranty} onChange={(e) => setEditModalItemData({ ...editModalItemData, Warranty: e.target.value })}>
                                                    <option value="">Select</option>
                                                    <option value="1 Year">1 Year</option>
                                                    <option value="2 Years">2 Years</option>
                                                    <option value="3 Years">3 Years</option>
                                                    <option value="4 Years">4 Years</option>
                                                    <option value="5 Years">5 Years</option>
                                                    <option value="6 Years">6 Years</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label>Warranty Upto</label>
                                                <input type="date" className="form-input" value={editModalItemData.Warranty_Upto} onChange={(e) => setEditModalItemData({ ...editModalItemData, Warranty_Upto: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group flex-2">
                                                <label>Details / Specs</label>
                                                <input type="text" className="form-input" value={editModalItemData.Item_Details} onChange={(e) => setEditModalItemData({ ...editModalItemData, Item_Details: e.target.value })} />
                                            </div>
                                            <div className="form-group flex-1">
                                                <label>OEM Software</label>
                                                <input type="text" className="form-input" value={editModalItemData.OEM_Software} onChange={(e) => setEditModalItemData({ ...editModalItemData, OEM_Software: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="flex-row justify-end gap-md" style={{ marginTop: '18px' }}>
                                            <button className="btn btn-primary" onClick={saveEditModalItem}>Save Item</button>
                                            <button className="btn btn-outline" onClick={cancelEditModalItem}>Cancel</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-primary" onClick={handleSaveInvoice}>
                                {editingInvoiceId ? 'Update Invoice' : 'Save Invoice'}
                            </button>
                            <button className="btn btn-outline" onClick={handleCloseModal}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Invoices;
