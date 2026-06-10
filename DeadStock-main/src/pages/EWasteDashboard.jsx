import React, { useState, useEffect } from 'react';
import { formatDate } from '../utils/formatDate';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTimes, faTrash, faCheckCircle, faFileAlt, faDownload, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';

const EWasteDashboard = () => {
    const navigate = useNavigate();
    const [years, setYears] = useState([]);
    const [loading, setLoading] = useState(true);
    const [alert, setAlert] = useState(null);

    // Create Year Modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newYear, setNewYear] = useState('');

    // Breakdown Modal
    const [showBreakdownModal, setShowBreakdownModal] = useState(false);
    const [selectedYear, setSelectedYear] = useState(null);
    const [breakdown, setBreakdown] = useState({});

    // Delete Modal
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    useEffect(() => {
        fetchYears();
    }, []);

    const fetchYears = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/ewaste/dashboard');
            const data = await res.json();
            setYears(data);
        } catch (error) {
            showAlert('error', 'Failed to fetch E-Waste years');
        } finally {
            setLoading(false);
        }
    };

    const showAlert = (type, msg) => {
        setAlert({ type, message: msg });
        setTimeout(() => setAlert(null), 3000);
    };

    const handleCreateYear = async () => {
        if (!newYear.trim()) {
            showAlert('error', 'Please enter a year');
            return;
        }

        try {
            const res = await fetch('http://localhost:3001/api/ewaste/years', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year: newYear })
            });

            if (res.ok) {
                showAlert('success', 'E-Waste year created');
                setShowCreateModal(false);
                setNewYear('');
                fetchYears();
            } else {
                const error = await res.json();
                showAlert('error', error.error);
            }
        } catch (error) {
            showAlert('error', 'Failed to create year');
        }
    };

    const handleViewBreakdown = async (year) => {
        setSelectedYear(year);
        setShowBreakdownModal(true);
        try {
            const res = await fetch(`http://localhost:3001/api/ewaste/${year.year}/breakdown`);
            const data = await res.json();
            setBreakdown(data);
        } catch (error) {
            showAlert('error', 'Failed to fetch breakdown');
        }
    };

    const handleViewYear = (year) => {
        navigate(`/e-waste/${year.year}`);
    };

    const handleDownloadDocument = (year) => {
        if (year.completionDoc) {
            window.open(`http://localhost:3001/api/ewaste/years/${year.year}/document`, '_blank');
        }
    };

    const handleOpenDeleteModal = (year) => {
        setSelectedYear(year);
        setDeleteConfirmText('');
        setShowDeleteModal(true);
    };

    const handleDeleteYear = async () => {
        if (deleteConfirmText !== 'DELETE') {
            showAlert('error', 'Please type DELETE to confirm');
            return;
        }

        try {
            const res = await fetch(`http://localhost:3001/api/ewaste/years/${selectedYear.year}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                showAlert('success', 'E-Waste year deleted');
                setShowDeleteModal(false);
                fetchYears();
            } else {
                showAlert('error', 'Failed to delete year');
            }
        } catch (error) {
            showAlert('error', 'Error deleting year');
        }
    };

    return (
        <div className="page-container">
            {alert && <div className={`alert alert-${alert.type}`}>{alert.message}</div>}

            <div className="page-header">
                <h1>E-Waste Management</h1>
                <p>Manage hardware disposal by financial year</p>
            </div>

            <div className="toolbar">
                <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                    <FontAwesomeIcon icon={faPlus} /> Create New E-Waste Year
                </button>
            </div>

            {loading ? (
                <p>Loading...</p>
            ) : years.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                    <FontAwesomeIcon icon={faTrash} size="3x" style={{ marginBottom: '20px' }} />
                    <p>No E-Waste years created yet. Click "Create New E-Waste Year" to get started.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginTop: '20px' }}>
                    {years.map(year => (
                        <div
                            key={year.year}
                            className="ewaste-card"
                            onClick={() => handleViewYear(year)}
                            style={{
                                padding: '20px',
                                cursor: 'pointer',
                                position: 'relative',
                                border: '2px solid #ddd',
                                borderRadius: '8px',
                                transition: 'all 0.3s ease',
                                backgroundColor: '#fff'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#e74c3c';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(231, 76, 60, 0.2)';
                                e.currentTarget.style.transform = 'translateY(-4px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = '#ddd';
                                e.currentTarget.style.boxShadow = 'none';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            {year.isCompleted && (
                                <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                                    <FontAwesomeIcon icon={faCheckCircle} style={{ color: 'green', fontSize: '1.5em' }} title="Completed" />
                                </div>
                            )}
                            <h3 style={{ margin: '0 0 10px 0' }}>{year.year}</h3>
                            <p style={{ fontSize: '2em', fontWeight: 'bold', margin: '10px 0', color: '#e74c3c' }}>
                                {year.itemCount}
                            </p>
                            <p style={{ color: '#666', marginBottom: '15px' }}>Hardware Items</p>

                            {year.isCompleted && (
                                <p style={{ fontSize: '0.85em', color: '#27ae60', marginBottom: '10px' }}>
                                    <FontAwesomeIcon icon={faFileAlt} /> Completed on {formatDate(year.completedAt)}
                                </p>
                            )}
                            {year.isCompleted && year.completionDoc && (
                                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #eee' }}>
                                    <button
                                        className="btn btn-outline"
                                        style={{ width: '100%', fontSize: '0.85em' }}
                                        onClick={(e) => { e.stopPropagation(); handleDownloadDocument(year); }}
                                    >
                                        <FontAwesomeIcon icon={faDownload} /> View Document
                                    </button>
                                </div>
                            )}

                            <button
                                className="btn btn-outline"
                                style={{ width: '100%', marginTop: '10px' }}
                                onClick={(e) => { e.stopPropagation(); handleViewBreakdown(year); }}
                            >
                                View Category Breakdown
                            </button>

                            <button
                                className="btn btn-outline"
                                style={{ width: '100%', marginTop: '10px', color: '#dc3545', borderColor: '#dc3545' }}
                                onClick={(e) => { e.stopPropagation(); handleOpenDeleteModal(year); }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#dc3545';
                                    e.currentTarget.style.color = '#fff';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = '#dc3545';
                                }}
                            >
                                <FontAwesomeIcon icon={faTrash} /> Delete Year
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Year Modal */}
            {showCreateModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Create New E-Waste Year</h3>
                            <button className="close-btn" onClick={() => setShowCreateModal(false)}>
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Financial Year *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g., 2024-25, 2025-26"
                                    value={newYear}
                                    onChange={e => setNewYear(e.target.value)}
                                />
                                <p style={{ fontSize: '0.85em', color: '#666', marginTop: '5px' }}>
                                    Format: YYYY-YY (e.g., 2024-25 for financial year April 2024 to March 2025)
                                </p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleCreateYear}>Create Year</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Breakdown Modal */}
            {showBreakdownModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Category Breakdown - {selectedYear?.year}</h3>
                            <button className="close-btn" onClick={() => setShowBreakdownModal(false)}>
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                        <div className="modal-body">
                            {Object.keys(breakdown).length === 0 ? (
                                <p style={{ textAlign: 'center', color: '#999' }}>No items in this E-Waste year yet.</p>
                            ) : (
                                <table className="supplier-table">
                                    <thead>
                                        <tr>
                                            <th>Category</th>
                                            <th>Count</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(breakdown).map(([category, count]) => (
                                            <tr key={category}>
                                                <td><strong>{category}</strong></td>
                                                <td>{count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowBreakdownModal(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3><FontAwesomeIcon icon={faExclamationTriangle} style={{ color: '#dc3545' }} /> Delete E-Waste Year</h3>
                            <button className="close-btn" onClick={() => setShowDeleteModal(false)}>
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div style={{ padding: '15px', backgroundColor: '#f8d7da', borderLeft: '4px solid #dc3545', marginBottom: '20px' }}>
                                <strong>Warning:</strong> This action will permanently delete:
                                <ul style={{ marginTop: '10px', marginBottom: '0' }}>
                                    <li>E-Waste year: <strong>{selectedYear?.year}</strong></li>
                                    <li>All {selectedYear?.itemCount || 0} items in this year</li>
                                    <li>This action cannot be undone</li>
                                </ul>
                            </div>

                            <div className="form-group">
                                <label>Type <strong>DELETE</strong> to confirm:</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Type DELETE"
                                    value={deleteConfirmText}
                                    onChange={e => setDeleteConfirmText(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancel</button>
                            <button
                                className="btn"
                                style={{ backgroundColor: '#dc3545', color: '#fff' }}
                                onClick={handleDeleteYear}
                                disabled={deleteConfirmText !== 'DELETE'}
                            >
                                Delete Year
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EWasteDashboard;
