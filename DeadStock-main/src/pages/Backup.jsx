import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { getJson, postJson } from '../utils/api';
import {
    faFolderOpen,
    faClock,
    faDownload,
    faCheckCircle,
    faTimesCircle,
    faSpinner,
    faToggleOn,
    faToggleOff,
    faShieldAlt,
    faUpload,
    faDatabase
} from '@fortawesome/free-solid-svg-icons';

const Backup = () => {
    const [backupFolder, setBackupFolder] = useState('');
    const [backupTime, setBackupTime] = useState('14:00');
    const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
    const [lastBackup, setLastBackup] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [alert, setAlert] = useState(null);
    const [backupHistory, setBackupHistory] = useState([]);
    const [restoreCounts, setRestoreCounts] = useState(null);
    const intervalRef = useRef(null);
    const restoreInputRef = useRef(null);

    // Load saved settings from localStorage
    useEffect(() => {
        const saved = JSON.parse(localStorage.getItem('backupSettings') || '{}');
        if (saved.folder) setBackupFolder(saved.folder);
        if (saved.time) setBackupTime(saved.time);
        if (saved.autoEnabled) setAutoBackupEnabled(saved.autoEnabled);
        if (saved.lastBackup) setLastBackup(saved.lastBackup);
        if (saved.history) setBackupHistory(saved.history);
    }, []);

    // Save settings to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('backupSettings', JSON.stringify({
            folder: backupFolder,
            time: backupTime,
            autoEnabled: autoBackupEnabled,
            lastBackup,
            history: backupHistory.slice(0, 10) // Keep last 10
        }));
    }, [backupFolder, backupTime, autoBackupEnabled, lastBackup, backupHistory]);

    // Auto-backup scheduler
    useEffect(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);

        if (autoBackupEnabled && backupFolder) {
            intervalRef.current = setInterval(() => {
                const now = new Date();
                const [hours, minutes] = backupTime.split(':').map(Number);
                if (now.getHours() === hours && now.getMinutes() === minutes) {
                    runBackup(true);
                }
            }, 60000); // Check every minute
        }

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [autoBackupEnabled, backupFolder, backupTime]);

    const showAlert = (type, msg) => {
        setAlert({ type, message: msg });
        setTimeout(() => setAlert(null), 8000);
    };

    const handleSelectFolder = async () => {
        try {
            if (window.electronAPI && window.electronAPI.showOpenDialog) {
                const result = await window.electronAPI.showOpenDialog({
                    title: 'Select Backup Folder',
                    properties: ['openDirectory']
                });
                if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
                    setBackupFolder(result.filePaths[0]);
                    showAlert('success', `Folder selected: ${result.filePaths[0]}`);
                }
            } else {
                showAlert('error', 'Folder picker is only available in the desktop app.');
            }
        } catch (error) {
            showAlert('error', 'Failed to open folder picker');
        }
    };

    const runBackup = async (isAuto = false) => {
        if (!backupFolder) {
            showAlert('error', 'Please select a backup folder first');
            return;
        }
        setProcessing(true);
        try {
            const res = await getJson('/backup/full');
            const data = await res.json();

            if (!data.buffer) throw new Error('No backup data received');

            const now = new Date();
            const timestamp = now.toISOString().slice(0, 16).replace(/[T:]/g, '-');
            const excelFileName = `DeadStock_Backup_${timestamp}.xlsx`;
            const dbFileName = `DeadStock_Backup_${timestamp}.deadstock`;
            const excelPath = `${backupFolder}\\${excelFileName}`;
            const dbPath = `${backupFolder}\\${dbFileName}`;

            if (window.electronAPI && window.electronAPI.writeFile) {
                // Save Excel backup
                const byteChars = atob(data.buffer);
                const byteArray = new Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) {
                    byteArray[i] = byteChars.charCodeAt(i);
                }
                await window.electronAPI.writeFile({
                    filePath: excelPath,
                    buffer: byteArray
                });

                // Save raw database backup
                let dbSaved = false;
                if (data.dbBuffer) {
                    const dbByteChars = atob(data.dbBuffer);
                    const dbByteArray = new Array(dbByteChars.length);
                    for (let i = 0; i < dbByteChars.length; i++) {
                        dbByteArray[i] = dbByteChars.charCodeAt(i);
                    }
                    await window.electronAPI.writeFile({
                        filePath: dbPath,
                        buffer: dbByteArray
                    });
                    dbSaved = true;
                }

                const backupRecord = {
                    date: now.toLocaleString(),
                    path: excelPath,
                    dbPath: dbSaved ? dbPath : null,
                    sheets: data.sheets,
                    auto: isAuto
                };

                setLastBackup(backupRecord);
                setBackupHistory(prev => [backupRecord, ...prev].slice(0, 10));
                showAlert('success', `${isAuto ? 'Auto-backup' : 'Backup'} saved: ${excelFileName}${dbSaved ? ' + Database file' : ''}`);
            } else {
                // Browser fallback - download Excel directly
                const byteChars = atob(data.buffer);
                const byteNumbers = new Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) {
                    byteNumbers[i] = byteChars.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = excelFileName;
                document.body.appendChild(a);
                a.click();
                URL.revokeObjectURL(url);
                document.body.removeChild(a);

                // Also download DB file if available
                if (data.dbBuffer) {
                    const dbByteChars = atob(data.dbBuffer);
                    const dbByteNumbers = new Array(dbByteChars.length);
                    for (let i = 0; i < dbByteChars.length; i++) {
                        dbByteNumbers[i] = dbByteChars.charCodeAt(i);
                    }
                    const dbBlob = new Blob([new Uint8Array(dbByteNumbers)], { type: 'application/octet-stream' });
                    const dbUrl = URL.createObjectURL(dbBlob);
                    const dbA = document.createElement('a');
                    dbA.href = dbUrl;
                    dbA.download = dbFileName;
                    document.body.appendChild(dbA);
                    dbA.click();
                    URL.revokeObjectURL(dbUrl);
                    document.body.removeChild(dbA);
                }

                const backupRecord = {
                    date: now.toLocaleString(),
                    path: 'Downloaded via browser',
                    sheets: data.sheets,
                    auto: false
                };
                setLastBackup(backupRecord);
                setBackupHistory(prev => [backupRecord, ...prev].slice(0, 10));
                showAlert('success', `Backup downloaded: ${excelFileName}`);
            }
        } catch (error) {
            console.error('Backup error:', error);
            showAlert('error', 'Backup failed: ' + error.message);
        } finally {
            setProcessing(false);
        }
    };

    // --- Restore Logic ---
    const handleRestoreClick = () => {
        if (restoreInputRef.current) {
            restoreInputRef.current.click();
        }
    };

    const handleRestoreFile = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Reset input so the same file can be re-selected
        e.target.value = '';

        // Validate file extension
        if (!file.name.endsWith('.deadstock')) {
            showAlert('error', 'Invalid file. Please select a .deadstock backup file.');
            return;
        }

        // Confirm with user
        const confirmed = window.confirm(
            `⚠️ RESTORE DATABASE\n\nThis will replace ALL current data with the backup from:\n${file.name}\n\nA backup of the current database will be saved automatically before restoring.\n\nAre you sure you want to continue?`
        );
        if (!confirmed) return;

        setRestoring(true);
        setRestoreCounts(null);
        try {
            // Read file as base64
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);

            const res = await postJson('/backup/restore', { dbBuffer: base64 });

            const data = await res.json();

            if (res.ok) {
                setRestoreCounts(data.counts);
                showAlert('success', `Database restored successfully from ${file.name}`);
            } else {
                showAlert('error', data.error || 'Restore failed');
            }
        } catch (error) {
            console.error('Restore error:', error);
            showAlert('error', 'Restore failed: ' + error.message);
        } finally {
            setRestoring(false);
        }
    };

    return (
        <div className="page-container">
            {(processing || restoring) && <div className="processing-overlay"><div className="spinner"></div><p>{restoring ? 'Restoring database...' : 'Generating backup...'}</p></div>}
            {alert && <div className={`alert alert-${alert.type}`}>{alert.message}</div>}

            <div className="page-header">
                <h1><FontAwesomeIcon icon={faShieldAlt} style={{ marginRight: '10px' }} />Backup & Restore</h1>
                <p>Schedule and manage automated data backups, or restore from a previous backup</p>
            </div>

            {/* Backup Settings Card */}
            <div className="card config-card mb-lg">
                <h3 className="toolbar-actions mb-lg">
                    <FontAwesomeIcon icon={faFolderOpen} style={{ color: 'teal' }} />
                    Backup Location
                </h3>
                <div className="toolbar-actions">
                    <input
                        type="text"
                        className="form-input"
                        value={backupFolder}
                        readOnly
                        placeholder="No folder selected..."
                        style={{ flex: 1, minWidth: '300px', backgroundColor: '#f5f5f5', cursor: 'pointer' }}
                        onClick={handleSelectFolder}
                    />
                    <button className="btn btn-primary" onClick={handleSelectFolder}>
                        <FontAwesomeIcon icon={faFolderOpen} /> Browse...
                    </button>
                </div>
            </div>

            {/* Schedule + Manual Backup + Restore */}
            <div className="grid-3-col" style={{ gap: '20px', marginBottom: '20px' }}>
                <div className="card config-card">
                    <h3 className="toolbar-actions mb-lg">
                        <FontAwesomeIcon icon={faClock} style={{ color: 'teal' }} />
                        Schedule
                    </h3>
                    <div className="form-group" style={{ marginBottom: '20px' }}>
                        <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>Daily Backup Time</label>
                        <input
                            type="time"
                            className="form-input"
                            value={backupTime}
                            onChange={e => setBackupTime(e.target.value)}
                            style={{ width: '200px' }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span style={{ fontWeight: 600 }}>Auto-Backup:</span>
                        <button
                            className={`btn ${autoBackupEnabled ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setAutoBackupEnabled(!autoBackupEnabled)}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}
                        >
                            <FontAwesomeIcon icon={autoBackupEnabled ? faToggleOn : faToggleOff} style={{ fontSize: '1.2em' }} />
                            {autoBackupEnabled ? 'Enabled' : 'Disabled'}
                        </button>
                    </div>
                    {autoBackupEnabled && !backupFolder && (
                        <p style={{ color: '#e65100', marginTop: '10px', fontSize: '0.85em' }}>
                            ⚠ Please select a backup folder to enable auto-backup
                        </p>
                    )}
                    {autoBackupEnabled && backupFolder && (
                        <p style={{ color: 'teal', marginTop: '10px', fontSize: '0.85em' }}>
                            ✓ Auto-backup will run daily at {backupTime}
                        </p>
                    )}
                </div>

                {/* Manual Backup Card */}
                <div className="card config-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <h3 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FontAwesomeIcon icon={faDownload} style={{ color: 'teal' }} />
                        Manual Backup
                    </h3>
                    <p className="helper-text mb-lg">
                        Generate Excel + Database backup files
                    </p>
                    <button
                        className="btn btn-primary"
                        onClick={() => runBackup(false)}
                        disabled={processing || restoring}
                        style={{ padding: '12px 30px', fontSize: '1em' }}
                    >
                        {processing ? (
                            <><FontAwesomeIcon icon={faSpinner} spin /> Generating...</>
                        ) : (
                            <><FontAwesomeIcon icon={faDownload} /> Backup Now</>
                        )}
                    </button>
                    <p className="text-muted text-xs mt-sm">
                        Creates: Excel (.xlsx) + Database (.deadstock)
                    </p>
                </div>

                {/* Restore Card */}
                <div className="card config-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <h3 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FontAwesomeIcon icon={faUpload} style={{ color: '#e65100' }} />
                        Restore Database
                    </h3>
                    <p className="helper-text mb-lg">
                        Restore from a .deadstock backup file
                    </p>
                    <input
                        type="file"
                        ref={restoreInputRef}
                        accept=".deadstock"
                        onChange={handleRestoreFile}
                        style={{ display: 'none' }}
                    />
                    <button
                        className="btn btn-outline"
                        onClick={handleRestoreClick}
                        disabled={processing || restoring}
                        style={{
                            padding: '12px 30px',
                            fontSize: '1em',
                            borderColor: '#e65100',
                            color: '#e65100'
                        }}
                    >
                        {restoring ? (
                            <><FontAwesomeIcon icon={faSpinner} spin /> Restoring...</>
                        ) : (
                            <><FontAwesomeIcon icon={faDatabase} /> Select Backup File</>
                        )}
                    </button>
                    <p className="text-muted text-xs mt-sm">
                        ⚠ Current data will be backed up before restore
                    </p>
                </div>
            </div>

            {/* Restore Result */}
            {restoreCounts && (
                <div className="card" style={{ padding: '20px', marginBottom: '20px', borderLeft: '4px solid #2e7d32' }}>
                    <h3 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FontAwesomeIcon icon={faCheckCircle} style={{ color: '#2e7d32' }} />
                        Restore Complete
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', fontSize: '0.9em' }}>
                        <div><strong>Suppliers:</strong> {restoreCounts.suppliers}</div>
                        <div><strong>Invoices:</strong> {restoreCounts.invoices}</div>
                        <div><strong>Hardware:</strong> {restoreCounts.hardware}</div>
                        <div><strong>Employees:</strong> {restoreCounts.employees}</div>
                        <div><strong>Software:</strong> {restoreCounts.software}</div>
                        <div><strong>E-Waste:</strong> {restoreCounts.ewasteItems}</div>
                        <div><strong>Alloc History:</strong> {restoreCounts.allocationHistory}</div>
                        <div><strong>Perm Alloc:</strong> {restoreCounts.permanent_allocation}</div>
                    </div>
                    <p style={{ marginTop: '10px', color: '#666', fontSize: '0.85em' }}>
                        Please refresh or restart the app to see updated data across all modules.
                    </p>
                </div>
            )}

            {/* Last Backup Status */}
            {lastBackup && (
                <div className="card" style={{ padding: '20px', marginBottom: '20px', borderLeft: '4px solid teal' }}>
                    <h3 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FontAwesomeIcon icon={faCheckCircle} style={{ color: 'teal' }} />
                        Last Backup
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.9em' }}>
                        <div><strong>Date:</strong> {lastBackup.date}</div>
                        <div><strong>Type:</strong> {lastBackup.auto ? 'Automatic' : 'Manual'}</div>
                        <div style={{ gridColumn: '1 / -1' }}><strong>Excel:</strong> {lastBackup.path}</div>
                        {lastBackup.dbPath && (
                            <div style={{ gridColumn: '1 / -1' }}><strong>Database:</strong> {lastBackup.dbPath}</div>
                        )}
                        <div style={{ gridColumn: '1 / -1' }}>
                            <strong>Data Sheets:</strong> {lastBackup.sheets?.join(', ') || 'N/A'}
                        </div>
                    </div>
                </div>
            )}

            {/* Backup History */}
            {backupHistory.length > 0 && (
                <div className="card config-card">
                    <h3 className="section-heading">Backup History</h3>
                    <div className="table-responsive">
                        <table className="supplier-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Excel Location</th>
                                    <th>DB Backup</th>
                                    <th>Sheets</th>
                                </tr>
                            </thead>
                            <tbody>
                                {backupHistory.map((record, i) => (
                                    <tr key={i}>
                                        <td>{record.date}</td>
                                        <td>
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.85em',
                                                backgroundColor: record.auto ? '#e3f2fd' : '#e8f5e9',
                                                color: record.auto ? '#1565c0' : '#2e7d32'
                                            }}>
                                                {record.auto ? 'Auto' : 'Manual'}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.85em', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {record.path}
                                        </td>
                                        <td>
                                            {record.dbPath ? (
                                                <FontAwesomeIcon icon={faCheckCircle} style={{ color: '#2e7d32' }} title={record.dbPath} />
                                            ) : (
                                                <FontAwesomeIcon icon={faTimesCircle} style={{ color: '#999' }} />
                                            )}
                                        </td>
                                        <td style={{ fontSize: '0.85em' }}>{record.sheets?.length || 0} sheets</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Backup;
