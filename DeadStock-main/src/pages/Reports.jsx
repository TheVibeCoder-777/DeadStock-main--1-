import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faChartBar, faSync } from '@fortawesome/free-solid-svg-icons';

const Reports = () => {
    const [activeTab, setActiveTab] = useState('hardware');
    const [hardwareReport, setHardwareReport] = useState([]);
    const [softwareReport, setSoftwareReport] = useState([]);
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState(null);

    useEffect(() => {
        fetchReports();
    }, []);

    const showAlert = (type, msg) => {
        setAlert({ type, message: msg });
        setTimeout(() => setAlert(null), 3000);
    };

    const fetchReports = async () => {
        setLoading(true);
        try {
            const [hwRes, swRes] = await Promise.all([
                fetch('http://localhost:3001/api/reports/hardware'),
                fetch('http://localhost:3001/api/reports/software')
            ]);

            if (hwRes.ok && swRes.ok) {
                const hwData = await hwRes.json();
                const swData = await swRes.json();
                setHardwareReport(hwData);
                setSoftwareReport(swData);
                showAlert('success', 'Reports loaded successfully');
            } else {
                showAlert('error', 'Failed to load reports');
            }
        } catch (error) {
            console.error('Error fetching reports:', error);
            showAlert('error', 'Error loading reports');
        } finally {
            setLoading(false);
        }
    };

    const processedHardwareReport = React.useMemo(() => {
        if (!hardwareReport.length) return [];
        const result = [];
        let grandTotal = 0;
        let grandStock = 0;

        let currentGroup = null;
        let currentGroupTotal = 0;
        let currentGroupStock = 0;

        hardwareReport.forEach((item, index) => {
            if (currentGroup && item.Item_Name !== currentGroup) {
                result.push({ isSubtotal: true, Item_Name: `${currentGroup} Total`, Total_Quantity: currentGroupTotal, Stock_Quantity: currentGroupStock });
                currentGroupTotal = 0;
                currentGroupStock = 0;
            }
            currentGroup = item.Item_Name;

            result.push(item);
            currentGroupTotal += (item.Total_Quantity || 0);
            currentGroupStock += (item.Stock_Quantity || 0);
            grandTotal += (item.Total_Quantity || 0);
            grandStock += (item.Stock_Quantity || 0);

            if (index === hardwareReport.length - 1) {
                result.push({ isSubtotal: true, Item_Name: `${currentGroup} Total`, Total_Quantity: currentGroupTotal, Stock_Quantity: currentGroupStock });
            }
        });

        result.push({ isGrandTotal: true, Item_Name: 'Grand Total', Total_Quantity: grandTotal, Stock_Quantity: grandStock });
        return result;
    }, [hardwareReport]);

    const [, setProcessing] = useState(false);

    const handleDownloadHardware = async () => {
        setProcessing(true);
        try {
            const response = await fetch('http://localhost:3001/api/reports/hardware/download');
            if (!response.ok) throw new Error('Download failed');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'hardware_report.xlsx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showAlert('success', 'Report downloaded');
        } catch (error) {
            showAlert('error', 'Download failed');
        } finally {
            setProcessing(false);
        }
    };

    const handleDownloadSoftware = async () => {
        setProcessing(true);
        try {
            const response = await fetch('http://localhost:3001/api/reports/software/download');
            if (!response.ok) throw new Error('Download failed');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'software_report.xlsx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showAlert('success', 'Report downloaded');
        } catch (error) {
            showAlert('error', 'Download failed');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="page-container">
            {alert && <div className={`alert alert-${alert.type}`}>{alert.message}</div>}

            <div className="page-header">
                <h1><FontAwesomeIcon icon={faChartBar} /> Reports</h1>
                <p>Generate analytical reports from your inventory data</p>
            </div>

            {/* Tab Navigation */}
            <div className="tabs">
                <button
                    className={`tab ${activeTab === 'hardware' ? 'active' : ''}`}
                    onClick={() => setActiveTab('hardware')}
                >
                    Hardware Report
                </button>
                <button
                    className={`tab ${activeTab === 'software' ? 'active' : ''}`}
                    onClick={() => setActiveTab('software')}
                >
                    Software Report
                </button>
            </div>

            {/* Hardware Report Tab */}
            {activeTab === 'hardware' && (
                <div className="tab-content">
                    <div className="toolbar">
                        <h2>Hardware Report</h2>
                        <div className="toolbar-actions">
                            <button className="btn btn-outline" onClick={fetchReports}>
                                <FontAwesomeIcon icon={faSync} /> Refresh
                            </button>
                            <button className="btn btn-primary" onClick={handleDownloadHardware}>
                                <FontAwesomeIcon icon={faDownload} /> Download Excel
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <p>Loading...</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="supplier-table">
                                <thead>
                                    <tr>
                                        <th>Item Name</th>
                                        <th>Capacity</th>
                                        <th>Total Quantity</th>
                                        <th>Quantity in Stock</th>
                                        <th>AMC/Warranty Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {hardwareReport.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="empty-state">
                                                No hardware data available
                                            </td>
                                        </tr>
                                    ) : (
                                        processedHardwareReport.map((item, index) => (
                                            <tr key={index} className={item.isGrandTotal ? 'row-grand-total' : (item.isSubtotal ? 'row-subtotal' : '')}>
                                                <td>{item.isSubtotal || item.isGrandTotal ? item.Item_Name : <strong>{item.Item_Name}</strong>}</td>
                                                <td>{item.isSubtotal || item.isGrandTotal ? '' : item.Capacity}</td>
                                                <td>{item.Total_Quantity}</td>
                                                <td>{item.Stock_Quantity}</td>
                                                <td>
                                                    {item.isSubtotal || item.isGrandTotal ? '' : (
                                                        <span style={{
                                                            padding: '4px 10px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.85em',
                                                            fontWeight: 600,
                                                            ...(item.AMC_Warranty_Status === 'Under AMC' || item.AMC_Warranty_Status === 'Under Warranty'
                                                                ? { backgroundColor: '#d4edda', color: '#155724' }
                                                                : item.AMC_Warranty_Status && item.AMC_Warranty_Status.includes('AMC') && item.AMC_Warranty_Status.includes('Warranty')
                                                                    ? { backgroundColor: '#fff3cd', color: '#856404' }
                                                                    : { backgroundColor: '#f8d7da', color: '#721c24' }
                                                            )
                                                        }}>
                                                            {item.AMC_Warranty_Status}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Software Report Tab */}
            {activeTab === 'software' && (
                <div className="tab-content">
                    <div className="toolbar">
                        <h2>Software Report</h2>
                        <div className="toolbar-actions">
                            <button className="btn btn-outline" onClick={fetchReports}>
                                <FontAwesomeIcon icon={faSync} /> Refresh
                            </button>
                            <button className="btn btn-primary" onClick={handleDownloadSoftware}>
                                <FontAwesomeIcon icon={faDownload} /> Download Excel
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <p>Loading...</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="supplier-table">
                                <thead>
                                    <tr>
                                        <th>Software Name</th>
                                        <th>Total Quantity</th>
                                        <th>Quantity Not Issued</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {softwareReport.length === 0 ? (
                                        <tr>
                                            <td colSpan="3" className="empty-state">
                                                No software data available
                                            </td>
                                        </tr>
                                    ) : (
                                        softwareReport.map((item, index) => (
                                            <tr key={index}>
                                                <td><strong>{item.Software_Name}</strong></td>
                                                <td>{item.Total_Quantity}</td>
                                                <td>{item.Quantity_Not_Issued}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Reports;
