import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { getJson, postJson } from '../utils/api';

const HardwareAllocationModal = ({ show, onClose, item, onSaveSuccess }) => {
    const [allocationForm, setAllocationForm] = useState({ PIN: '', Issued_Date: '', Issued_Location: '' });
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [sectionsConfig, setSectionsConfig] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (show && item) {
            setAllocationForm({
                PIN: item.Allocated_To === 'STOCK' ? '' : (item.Allocated_To || item.PIN || ''),
                Issued_Date: item.Issued_Date || new Date().toISOString().split('T')[0],
                Issued_Location: item.Issued_Location || ''
            });
            setError('');
            
            const fetchConfig = async () => {
                try {
                    const [empRes, confRes] = await Promise.all([
                        getJson('/employees'),
                        getJson('/employees/config')
                    ]);
                    const empData = await empRes.json();
                    setEmployees(empData);
                    
                    const confData = await confRes.json();
                    const sections = confData && confData.sections ? confData.sections : [];
                    setSectionsConfig(sections.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))));
                    
                    const currentPin = item.Allocated_To === 'STOCK' ? '' : (item.Allocated_To || item.PIN || '');
                    if (currentPin) {
                        const normalizedPin = String(currentPin).trim().replace(/^0+/, '');
                        const found = empData.find(e => String(e.PIN).trim().replace(/^0+/, '') === normalizedPin);
                        setSelectedEmployee(found || null);
                    } else {
                        setSelectedEmployee(null);
                    }
                } catch (e) {
                    console.error("Failed to fetch modal dependencies", e);
                }
            };
            fetchConfig();
        }
    }, [show, item]);

    const handlePINChange = (pin) => {
        setAllocationForm({ ...allocationForm, PIN: pin });
        const normalizedPin = String(pin).trim().replace(/^0+/, '');
        const emp = employees.find(e => {
            const ePin = String(e.PIN).trim().replace(/^0+/, '');
            const eName = e.Name ? e.Name.toLowerCase() : '';
            return ePin === normalizedPin || eName === pin.toLowerCase();
        });
        setSelectedEmployee(emp || null);
    };

    const handleSave = async () => {
        setProcessing(true);
        setError('');
        try {
            const userProfile = JSON.parse(localStorage.getItem('userProfile') || '{}');
            const changedBy = userProfile.name || 'System';

            const res = await postJson('/hardware/allocate', {
                id: item.hardware_id || item.id,
                PIN: allocationForm.PIN || 'STOCK',
                Issued_Date: allocationForm.Issued_Date,
                Issued_Location: allocationForm.Issued_Location || '',
                changedBy
            });

            if (res.ok) {
                if (onSaveSuccess) onSaveSuccess();
                onClose();
            } else {
                setError('Failed to update allocation.');
            }
        } catch (e) {
            setError('Error updating allocation.');
        } finally {
            setProcessing(false);
        }
    };

    if (!show || !item) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Hardware Allocation</h3>
                    <button className="close-btn" onClick={onClose}><FontAwesomeIcon icon={faTimes} /></button>
                </div>
                <div className="modal-body">
                    {error && <div className="alert alert-error">{error}</div>}
                    <div className="card" style={{ padding: '15px', marginBottom: '20px', backgroundColor: '#f9f9f9' }}>
                        <p><strong>Item:</strong> {item.Item_Name} ({item.EDP_Serial})</p>
                        <p><strong>Currently:</strong> {item.Allocated_To === 'STOCK' ? 'In STOCK' : `Allocated to ${item.Allocated_To || item.PIN || 'Unknown'}`}</p>
                    </div>

                    <div className="form-group">
                        <label>Enter Employee PIN or Name</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Leave empty for STOCK"
                            value={allocationForm.PIN}
                            onChange={e => handlePINChange(e.target.value)}
                            list="employee-list-modal"
                        />
                        <datalist id="employee-list-modal">
                            {employees.map(e => <option key={e.PIN} value={e.PIN}>{e.Name}</option>)}
                        </datalist>
                        <p className="text-muted text-xs mt-sm">Tip: Clear the field to move item back to STOCK.</p>
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

                    <div className="form-group mt-lg">
                        <label>Issued Date *</label>
                        <input
                            type="date"
                            className="form-input"
                            value={allocationForm.Issued_Date}
                            onChange={e => setAllocationForm({ ...allocationForm, Issued_Date: e.target.value })}
                        />
                        <p className="text-muted text-xs mt-sm">
                            {allocationForm.PIN ? 'Date when device was issued to employee' : 'Date when device was moved to STOCK'}
                        </p>
                    </div>

                    <div className="form-group mt-lg">
                        <label>Issued Location</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search or select location..."
                            value={allocationForm.Issued_Location}
                            onChange={e => setAllocationForm({ ...allocationForm, Issued_Location: e.target.value })}
                            list="sections-list-modal"
                        />
                        <datalist id="sections-list-modal">
                            {sectionsConfig.map(s => <option key={s} value={s} />)}
                        </datalist>
                        <p className="text-muted text-xs mt-sm">Sections from Employee Configuration (Manage Options)</p>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={processing}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={processing}>
                        {processing ? 'Processing...' : (allocationForm.PIN ? 'Allocate Device' : 'Move to STOCK')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HardwareAllocationModal;
