import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { getJson, postJson, putJson, deleteJson, apiFetch } from '../utils/api';
import { faTrash, faPlus, faEdit, faSave, faTimes, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';

const HardwareConfig = () => {
    const [configs, setConfigs] = useState([]);
    const [category, setCategory] = useState('');
    const [prefix, setPrefix] = useState('');
    const [alert, setAlert] = useState(null);

    // Make/Company Config
    const [makes, setMakes] = useState([]);
    const [newMake, setNewMake] = useState('');

    // Capacity Config
    const [capacityConfig, setCapacityConfig] = useState([]);
    const [newCapItem, setNewCapItem] = useState('');
    const [newCapValue, setNewCapValue] = useState('');
    const [editingCap, setEditingCap] = useState(null);
    const [editCapValue, setEditCapValue] = useState('');
    const [capFilter, setCapFilter] = useState('');

    // Column Visibility Config
    const [columnVisibility, setColumnVisibility] = useState({});
    const [colVisModalOpen, setColVisModalOpen] = useState(false);
    const [colVisCategory, setColVisCategory] = useState('');
    const [colVisSelection, setColVisSelection] = useState([]);

    const ALL_COLUMNS = ['RAM', 'OS', 'Office', 'Speed', 'IP', 'MAC'];

    useEffect(() => {
        fetchConfig();
        fetchMakes();
        fetchCapacityConfig();
        fetchColumnVisibility();
    }, []);

    const fetchConfig = async () => {
        const res = await getJson('/hardware/config');
        const data = await res.json();
        setConfigs(data);
    };

    const fetchMakes = async () => {
        try {
            const res = await getJson('/make/config');
            const data = await res.json();
            setMakes(data);
        } catch (error) {
            console.error('Failed to fetch makes:', error);
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
            setColumnVisibility(data);
        } catch (error) {
            console.error('Failed to fetch column visibility:', error);
        }
    };

    const openColVisModal = (category) => {
        setColVisCategory(category);
        setColVisSelection(columnVisibility[category] || []);
        setColVisModalOpen(true);
    };

    const toggleColVis = (col) => {
        setColVisSelection(prev =>
            prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
        );
    };

    const saveColVisibility = async () => {
        try {
            const res = await putJson('/column-visibility/config', { category: colVisCategory, hiddenColumns: colVisSelection });
            if (res.ok) {
                const data = await res.json();
                setColumnVisibility(data.columnVisibility);
                showAlert('success', `Column visibility updated for ${colVisCategory}`);
                setColVisModalOpen(false);
            } else {
                showAlert('error', 'Failed to save column visibility');
            }
        } catch (error) {
            showAlert('error', 'Error saving column visibility');
        }
    };

    const handleAdd = async () => {
        if (!category || !prefix) return showAlert('error', 'Fill all fields');

        const res = await postJson('/hardware/config', { category: category.toUpperCase(), prefix: prefix.toUpperCase() });

        if (res.ok) {
            showAlert('success', 'Category Added - Sidebar Updated');
            setCategory('');
            setPrefix('');
            fetchConfig();
            window.dispatchEvent(new CustomEvent('hardwareConfigUpdated'));
        } else {
            showAlert('error', 'Failed to add');
        }
    };

    const handleAddMake = async () => {
        if (!newMake.trim()) return showAlert('error', 'Enter company name');

        const res = await postJson('/make/config', { name: newMake.trim() });

        if (res.ok) {
            showAlert('success', 'Company Added');
            setNewMake('');
            fetchMakes();
        } else {
            const result = await res.json();
            showAlert('error', result.error || 'Failed to add');
        }
    };

    const handleDeleteMake = async (name) => {
        if (!confirm(`Delete "${name}" from the list?`)) return;

        const res = await deleteJson(`/make/config/${encodeURIComponent(name)}`);

        if (res.ok) {
            showAlert('success', 'Company Deleted');
            fetchMakes();
        } else {
            showAlert('error', 'Failed to delete');
        }
    };

    // --- Capacity Handlers ---
    const handleAddCapacity = async () => {
        if (!newCapItem || !newCapValue.trim()) return showAlert('error', 'Select Item Name and enter Capacity');

        const res = await postJson('/capacity/config', { Item_Name: newCapItem, Capacity: newCapValue.trim() });

        const data = await res.json();
        if (res.ok) {
            showAlert('success', 'Capacity added');
            setNewCapValue('');
            fetchCapacityConfig();
        } else {
            showAlert('error', data.error || 'Failed to add');
        }
    };

    const handleEditCapacity = async () => {
        if (!editCapValue.trim() || !editingCap) return;

        const res = await putJson('/capacity/config', {
            Item_Name: editingCap.Item_Name,
            oldCapacity: editingCap.Capacity,
            newCapacity: editCapValue.trim()
        });

        const data = await res.json();
        if (res.ok) {
            showAlert('success', data.message);
            setEditingCap(null);
            setEditCapValue('');
            fetchCapacityConfig();
        } else {
            showAlert('error', data.error || 'Failed to update');
        }
    };

    const handleDeleteCapacity = async (Item_Name, Capacity) => {
        if (!confirm(`Delete "${Capacity}" from ${Item_Name}?`)) return;

        const res = await apiFetch('/capacity/config', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Item_Name, Capacity })
        });

        if (res.ok) {
            showAlert('success', 'Capacity deleted');
            fetchCapacityConfig();
        } else {
            showAlert('error', 'Failed to delete');
        }
    };

    const startEditCap = (item) => {
        setEditingCap(item);
        setEditCapValue(item.Capacity);
    };

    const showAlert = (type, msg) => {
        setAlert({ type, message: msg });
        setTimeout(() => setAlert(null), 5000);
    };

    // Get unique item names from configs for the dropdown
    const itemNames = configs.map(c => c.category).sort();

    // Filter capacity config
    const filteredCapacity = capFilter
        ? capacityConfig.filter(c => c.Item_Name === capFilter)
        : capacityConfig;

    return (
        <div className="page-container">
            {alert && <div className={`alert alert-${alert.type}`}>{alert.message}</div>}

            <div className="page-header">
                <h1>Hardware Configuration</h1>
                <p>Define Hardware Categories, Prefixes, Manufacturer Names, and Capacity options.</p>
            </div>

            <div className="grid-2-col" style={{ gap: '30px', marginTop: '20px' }}>
                {/* Hardware Categories Section */}
                <div className="card config-card">
                    <h3>Hardware Categories</h3>
                    <div className="form-group">
                        <label>Category Name (e.g., PROJECTOR)</label>
                        <input type="text" className="form-input" value={category} onChange={e => setCategory(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Prefix (e.g., PROJ)</label>
                        <input type="text" className="form-input" value={prefix} onChange={e => setPrefix(e.target.value)} />
                        <small>Serial Numbers will look like: PROJ0001</small>
                    </div>
                    <button className="btn btn-primary mt-md" onClick={handleAdd}>
                        <FontAwesomeIcon icon={faPlus} /> Add Category
                    </button>

                    <div className="mt-lg">
                        <h4>Existing Categories</h4>
                        <table className="supplier-table">
                            <thead><tr><th>Category</th><th>Prefix</th></tr></thead>
                            <tbody>
                                {configs.map((c, i) => (
                                    <tr key={i}>
                                        <td>{c.category}</td>
                                        <td>{c.prefix}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Capacity Configuration Section */}
                <div style={{ position: 'relative' }}>
                    <div className="card config-card" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
                        <h3>Capacity / Model Configuration</h3>
                        <p className="helper-text" style={{ marginBottom: '15px' }}>
                            Manage capacity/model options grouped by Item Name. Editing a value here updates all existing items.
                        </p>

                        {/* Add New Capacity + Filter */}
                        <div className="flex-row gap-md items-center flex-wrap mb-lg">
                            <select
                                className="form-select"
                                value={newCapItem}
                                onChange={e => setNewCapItem(e.target.value)}
                                style={{ flex: 1, minWidth: '150px' }}
                            >
                                <option value="">Select Item Name</option>
                                {itemNames.map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Enter capacity / model value..."
                                value={newCapValue}
                                onChange={e => setNewCapValue(e.target.value)}
                                onKeyPress={e => e.key === 'Enter' && handleAddCapacity()}
                                style={{ flex: 2, minWidth: '150px' }}
                            />
                            <button className="btn btn-primary" onClick={handleAddCapacity}>
                                <FontAwesomeIcon icon={faPlus} /> Add
                            </button>
                        </div>

                        <div className="flex-row items-center gap-sm mb-lg">
                            <label className="text-semibold text-nowrap text-sm">Filter:</label>
                            <select
                                className="form-select"
                                value={capFilter}
                                onChange={e => setCapFilter(e.target.value)}
                                style={{ width: '100%' }}
                            >
                                <option value="">All Items ({capacityConfig.length})</option>
                                {[...new Set(capacityConfig.map(c => c.Item_Name))].sort().map(name => (
                                    <option key={name} value={name}>
                                        {name} ({capacityConfig.filter(c => c.Item_Name === name).length})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Capacity Table */}
                        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                            <table className="supplier-table" style={{ fontSize: '0.9em' }}>
                                <thead>
                                    <tr>
                                        <th className="col-checkbox">#</th>
                                        <th>Item</th>
                                        <th>Capacity / Model</th>
                                        <th className="col-actions text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCapacity.length > 0 ? (
                                        filteredCapacity.map((cap, idx) => (
                                            <tr key={`${cap.Item_Name}-${cap.Capacity}`}>
                                                <td className="text-muted">{idx + 1}</td>
                                                <td className="text-semibold">{cap.Item_Name}</td>
                                                <td>
                                                    {editingCap && editingCap.Item_Name === cap.Item_Name && editingCap.Capacity === cap.Capacity ? (
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            value={editCapValue}
                                                            onChange={e => setEditCapValue(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') handleEditCapacity();
                                                                if (e.key === 'Escape') { setEditingCap(null); setEditCapValue(''); }
                                                            }}
                                                            autoFocus
                                                            style={{ padding: '4px 8px', margin: 0 }}
                                                        />
                                                    ) : (
                                                        cap.Capacity
                                                    )}
                                                </td>
                                                <td className="text-center">
                                                    {editingCap && editingCap.Item_Name === cap.Item_Name && editingCap.Capacity === cap.Capacity ? (
                                                        <div className="action-buttons">
                                                            <button className="btn-icon edit" onClick={handleEditCapacity} title="Save">
                                                                <FontAwesomeIcon icon={faSave} />
                                                            </button>
                                                            <button className="btn-icon delete" onClick={() => { setEditingCap(null); setEditCapValue(''); }} title="Cancel">
                                                                <FontAwesomeIcon icon={faTimes} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="action-buttons">
                                                            <button className="btn-icon edit" onClick={() => startEditCap(cap)} title="Edit">
                                                                <FontAwesomeIcon icon={faEdit} />
                                                            </button>
                                                            <button className="btn-icon delete" onClick={() => handleDeleteCapacity(cap.Item_Name, cap.Capacity)} title="Delete">
                                                                <FontAwesomeIcon icon={faTrash} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="4" className="empty-state">
                                                No capacity entries found
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Make/Company Section — Full Width */}
            <div className="card config-card" style={{ marginTop: '30px' }}>
                <h3>Company/Brand Names (Make)</h3>
                <p className="helper-text" style={{ marginBottom: '15px' }}>
                    Manage the list of companies that appear in the "Make" dropdown when adding or editing hardware.
                </p>
                <div className="toolbar-actions" style={{ marginBottom: '20px' }}>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Enter company name (e.g., Acer)"
                        value={newMake}
                        onChange={e => setNewMake(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && handleAddMake()}
                        style={{ flex: 1, maxWidth: '400px' }}
                    />
                    <button className="btn btn-primary" onClick={handleAddMake}>
                        <FontAwesomeIcon icon={faPlus} /> Add
                    </button>
                </div>

                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <table className="supplier-table">
                        <thead><tr><th>Company Name</th><th className="col-id">Action</th></tr></thead>
                        <tbody>
                            {makes.map((make, i) => (
                                <tr key={i}>
                                    <td>{make}</td>
                                    <td>
                                        <button className="btn-icon delete" onClick={() => handleDeleteMake(make)} title="Delete">
                                            <FontAwesomeIcon icon={faTrash} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Column Visibility Configuration */}
            <div className="card config-card" style={{ marginTop: '30px' }}>
                <h3>Column Visibility Configuration</h3>
                <p className="helper-text" style={{ marginBottom: '15px' }}>
                    Configure which columns are visible for each hardware category. By default, all columns are visible.
                </p>
                <table className="supplier-table text-sm">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Category</th>
                            <th>Visible Columns</th>
                            <th>Hidden Columns</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {configs.length > 0 ? configs.map((c, i) => {
                            const hidden = columnVisibility[c.category] || [];
                            const visible = ALL_COLUMNS.filter(col => !hidden.includes(col));
                            return (
                                <tr key={c.category}>
                                    <td>{i + 1}</td>
                                    <td><strong>{c.category}</strong></td>
                                    <td>
                                        {visible.length === ALL_COLUMNS.length
                                            ? <span style={{ color: '#2e7d32' }}>All ({ALL_COLUMNS.length})</span>
                                            : <span>{visible.join(', ') || 'None'}</span>
                                        }
                                    </td>
                                    <td>
                                        {hidden.length === 0
                                            ? <span style={{ color: '#999' }}>None</span>
                                            : <span style={{ color: '#c62828' }}>{hidden.join(', ')}</span>
                                        }
                                    </td>
                                    <td>
                                        <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '0.85em' }} onClick={() => openColVisModal(c.category)}>
                                            <FontAwesomeIcon icon={faEye} /> Configure
                                        </button>
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan="5" className="empty-state">
                                    No categories found. Add categories above first.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Column Visibility Modal */}
            {
                colVisModalOpen && (
                    <div className="modal-overlay">
                        <div className="modal-content" style={{ width: '450px', maxWidth: '90vw' }}>
                            <div className="modal-header">
                                <h3>Column Visibility — {colVisCategory}</h3>
                            </div>
                            <div className="modal-body">
                                <p className="helper-text" style={{ marginBottom: '15px' }}>
                                    Uncheck columns to <strong>hide</strong> them from the table, edit form, and add wizard for <strong>{colVisCategory}</strong>.
                                </p>
                                <div className="grid-2-col" style={{ gap: '12px' }}>
                                    {ALL_COLUMNS.map(col => {
                                        const isHidden = colVisSelection.includes(col);
                                        return (
                                            <label key={col} style={{
                                                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                                                borderRadius: '6px', cursor: 'pointer', userSelect: 'none',
                                                border: `1px solid ${isHidden ? '#ffcdd2' : '#c8e6c9'}`,
                                                backgroundColor: isHidden ? '#fff5f5' : '#f1f8e9',
                                                transition: 'all 0.2s'
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!isHidden}
                                                    onChange={() => toggleColVis(col)}
                                                    style={{ width: '16px', height: '16px' }}
                                                />
                                                <FontAwesomeIcon icon={isHidden ? faEyeSlash : faEye} style={{ color: isHidden ? '#c62828' : '#2e7d32', fontSize: '0.9em' }} />
                                                <span style={{ fontWeight: 500, color: isHidden ? '#c62828' : '#333' }}>{col}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '15px 20px', borderTop: '1px solid #eee' }}>
                                <button className="btn btn-outline" onClick={() => setColVisModalOpen(false)}>Cancel</button>
                                <button className="btn btn-primary" onClick={saveColVisibility}>
                                    <FontAwesomeIcon icon={faSave} /> Save
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default HardwareConfig;
