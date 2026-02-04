import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Loans from './pages/Loans';
import LoanDetail from './pages/LoanDetail';
import NewLoan from './pages/NewLoan';
import Savings from './pages/Savings';
import FixedDeposits from './pages/FixedDeposits';
import Reports from './pages/Reports';
import Staff from './pages/Staff';
import Settings from './pages/Settings';
import ChangePassword from './pages/ChangePassword';
import Verification from './pages/Verification';
import Documents from './pages/Documents';
import AuditLogs from './pages/AuditLogs';
import JournalEntry from './pages/JournalEntry';
import Attendance from './pages/Attendance';
import LoadingSpinner from './components/LoadingSpinner';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner fullScreen />;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="loans" element={<Loans />} />
        <Route path="loans/new" element={<NewLoan />} />
        <Route path="loans/:id" element={<LoanDetail />} />
        <Route path="savings" element={<Savings />} />
        <Route path="fixed-deposits" element={<FixedDeposits />} />
        <Route path="reports" element={<Reports />} />
        <Route path="staff" element={<Staff />} />
        <Route path="verification" element={<Verification />} />
        <Route path="documents" element={<Documents />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="accounting/journal/new" element={<JournalEntry />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="settings" element={<Settings />} />
        <Route path="change-password" element={<ChangePassword />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
