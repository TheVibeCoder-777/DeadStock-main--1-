import React from 'react';
import { Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Suppliers from './pages/Suppliers';
import Invoices from './pages/Invoices';
import Hardware from './pages/Hardware';
import HardwareConfig from './pages/HardwareConfig';

import Employees from './pages/Employees';
import EmployeeConfig from './pages/EmployeeConfig';
import Allocation from './pages/Allocation';
import EWasteDashboard from './pages/EWasteDashboard';
import EWasteTable from './pages/EWasteTable';
import Software from './pages/Software';
import Reports from './pages/Reports';
import AMC from './pages/AMC';
import PermanentAllocation from './pages/PermanentAllocation';
import Dashboard from './pages/Dashboard';
import Backup from './pages/Backup';

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Dashboard */}
          <Route index element={<Dashboard />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="invoices" element={<Invoices />} />

          {/* Hardware Routes */}
          <Route path="hardware/config" element={<HardwareConfig />} />
          <Route path="hardware/:category" element={<Hardware />} />
          <Route path="allocation" element={<Allocation />} />

          <Route path="software" element={<Software />} />

          <Route path="e-waste" element={<EWasteDashboard />} />
          <Route path="e-waste/:year" element={<EWasteTable />} />

          <Route path="employees" element={<Employees />} />
          <Route path="employees/config" element={<EmployeeConfig />} />

          <Route path="reports" element={<Reports />} />
          <Route path="amc" element={<AMC />} />

          <Route path="permanent-allocation" element={<PermanentAllocation />} />
          <Route path="backup" element={<Backup />} />

        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
