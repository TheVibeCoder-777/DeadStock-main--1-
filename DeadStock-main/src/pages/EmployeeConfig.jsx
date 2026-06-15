import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { getJson, postJson, putJson } from '../utils/api';
import { faPlus, faTrash, faEdit, faSave, faTimes } from '@fortawesome/free-solid-svg-icons';

// Table-based ConfigSection with Edit and Delete
const ConfigSection = ({ title, type, items, newItemValue, onInputChange, onAdd, onDelete, onEdit }) => {
    const [editingItem, setEditingItem] = useState(null);
    const [editValue, setEditValue] = useState('');

    const startEdit = (item) => {
        setEditingItem(item);
        setEditValue(item);
    };

    const cancelEdit = () => {
        setEditingItem(null);
        setEditValue('');
    };

    const saveEdit = () => {
        if (editValue.trim() && editValue.trim() !== editingItem) {
            onEdit(type, editingItem, editValue.trim());
        }
        setEditingItem(null);
        setEditValue('');
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') saveEdit();
        if (e.key === 'Escape') cancelEdit();
    };

    return (
        <div className="card config-card mb-lg">
            <h3 className="mb-lg">{title}</h3>
            <div className="form-row mb-lg">
                <input
                    type="text"
                    className="form-input"
                    placeholder={`Add new ${title.toLowerCase()}...`}
                    value={newItemValue}
                    onChange={e => onInputChange(type, e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && onAdd(type)}
                />
                <button className="btn btn-primary" onClick={() => onAdd(type)}>
                    <FontAwesomeIcon icon={faPlus} /> Add
                </button>
            </div>
            <div className="table-responsive" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="supplier-table text-sm">
                    <thead>
                        <tr>
                            <th className="col-checkbox">#</th>
                            <th>Name</th>
                            <th className="col-actions text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items && items.length > 0 ? (
                            [...items]
                                .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
                                .map((item, idx) => (
                                    <tr key={item}>
                                        <td className="text-muted">{idx + 1}</td>
                                        <td>
                                            {editingItem === item ? (
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    onKeyDown={handleKeyPress}
                                                    autoFocus
                                                    style={{ padding: '4px 8px', margin: 0 }}
                                                />
                                            ) : (
                                                item
                                            )}
                                        </td>
                                        <td className="text-center">
                                            {editingItem === item ? (
                                                <div className="action-buttons">
                                                    <button className="btn-icon edit" onClick={saveEdit} title="Save">
                                                        <FontAwesomeIcon icon={faSave} />
                                                    </button>
                                                    <button className="btn-icon delete" onClick={cancelEdit} title="Cancel">
                                                        <FontAwesomeIcon icon={faTimes} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="action-buttons">
                                                    <button className="btn-icon edit" onClick={() => startEdit(item)} title="Edit">
                                                        <FontAwesomeIcon icon={faEdit} />
                                                    </button>
                                                    <button className="btn-icon delete" onClick={() => onDelete(type, item)} title="Delete">
                                                        <FontAwesomeIcon icon={faTrash} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                        ) : (
                            <tr>
                                <td colSpan="3" className="empty-state">
                                    No items added yet
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div className="text-muted text-xs mt-sm">
                {items?.length || 0} item(s)
            </div>
        </div>
    );
};

const EmployeeConfig = () => {
    const [config, setConfig] = useState({ posts: [], sections: [], wings: [], offices: [] });
    const [newItems, setNewItems] = useState({ posts: '', sections: '', wings: '', offices: '' });
    const [processing, setProcessing] = useState(false);
    const [alert, setAlert] = useState(null);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const res = await getJson('/employees/config');
            if (res.ok) {
                const data = await res.json();
                setConfig(data);
            }
        } catch (error) {
            console.error('Failed to fetch config');
        }
    };

    const showAlert = (type, msg) => {
        setAlert({ type, message: msg });
        setTimeout(() => setAlert(null), 5000);
    };

    const handleInputChange = (type, value) => {
        setNewItems(prev => ({ ...prev, [type]: value }));
    };

    const handleAdd = async (type) => {
        const val = newItems[type].trim();
        if (!val) return;

        const currentItems = config[type] || [];
        if (currentItems.includes(val)) return showAlert('error', 'Already exists');

        const updatedValues = [...currentItems, val];
        await saveConfig(type, updatedValues);
        setNewItems(prev => ({ ...prev, [type]: '' }));
    };

    const handleDelete = async (type, val) => {
        if (!window.confirm(`Delete "${val}"?`)) return;
        const currentItems = config[type] || [];
        const updatedValues = currentItems.filter(v => v !== val);
        await saveConfig(type, updatedValues);
    };

    const handleEdit = async (type, oldValue, newValue) => {
        if (!newValue || oldValue === newValue) return;
        setProcessing(true);
        try {
            const res = await putJson('/employees/config/rename', { type, oldValue, newValue });
            const data = await res.json();
            if (res.ok) {
                showAlert('success', data.message);
                await fetchConfig();
            } else {
                showAlert('error', data.error || 'Failed to rename');
            }
        } catch (error) {
            showAlert('error', 'Network error');
        } finally {
            setProcessing(false);
        }
    };

    const saveConfig = async (type, values) => {
        setProcessing(true);
        try {
            const res = await postJson('/employees/config', { type, values });
            if (res.ok) {
                showAlert('success', 'Updated Successfully');
                await fetchConfig();
            } else {
                showAlert('error', 'Failed to save');
            }
        } catch (error) {
            showAlert('error', 'Network error');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="page-container">
            {processing && <div className="processing-overlay"><div className="spinner"></div></div>}
            {alert && <div className={`alert alert-${alert.type}`}>{alert.message}</div>}

            <div className="page-header">
                <h1>Employee Settings</h1>
                <p>Manage list items for Employee dropdowns. Editing a value here will also update all employees using that value.</p>
            </div>

            <div className="grid-2-col" style={{ gap: '20px' }}>
                <ConfigSection
                    title="Present Posts"
                    type="posts"
                    items={config.posts}
                    newItemValue={newItems.posts}
                    onInputChange={handleInputChange}
                    onAdd={handleAdd}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                />
                <ConfigSection
                    title="Sections"
                    type="sections"
                    items={config.sections}
                    newItemValue={newItems.sections}
                    onInputChange={handleInputChange}
                    onAdd={handleAdd}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                />
                <ConfigSection
                    title="Wings"
                    type="wings"
                    items={config.wings}
                    newItemValue={newItems.wings}
                    onInputChange={handleInputChange}
                    onAdd={handleAdd}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                />
                <ConfigSection
                    title="Offices"
                    type="offices"
                    items={config.offices}
                    newItemValue={newItems.offices}
                    onInputChange={handleInputChange}
                    onAdd={handleAdd}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                />
            </div>
        </div>
    );
};

export default EmployeeConfig;
