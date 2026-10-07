import Reports from './pages/Reports';
import AuditLog from './pages/AuditLog';
import { PatientFeedback, AdminFeedback } from './pages/Feedback';
import Recommendations from './pages/Recommendations';
import Notifications from './pages/Notifications';
/* eslint-disable react-refresh/only-export-components -- Application entry point is not imported by other modules. */
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  Link,
  useLocation,
} from 'react-router-dom';
import PublicHome from './pages/PublicHome';
import { DisplayProvider } from './components/DisplayPreference';
import { AuthProvider, useAuth } from './auth';
import { Loading, Notice } from './components/ui';
import Layout from './components/Layout';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Departments from './pages/Departments';
import Staff from './pages/Staff';
import BookAppointment from './pages/BookAppointment';
import Appointments from './pages/Appointments';
import Schedules from './pages/Schedules';
import ReceptionPatients from './pages/ReceptionPatients';
import { DoctorQueue, ConsultationPage, MedicalHistory } from './pages/Clinical';
import { Billing, BillDetail } from './pages/Billing';
import './styles.css';
import './glass.css';

function Protected({ roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role))
    return (
      <div className="card padded">
        <h1>Access restricted</h1>
        <p>This page is not part of your workspace.</p>
        <Link className="button primary" to="/dashboard">
          Back to overview
        </Link>
      </div>
    );
  return <Outlet />;
}
function App() {
  const { loading, error, refresh } = useAuth();
  const { pathname } = useLocation();
  // Public information remains usable while session lookup is loading or unavailable.
  if (pathname === '/') return <PublicHome />;
  if (loading)
    return (
      <div className="full-state">
        <Loading />
      </div>
    );
  if (error && !['/login', '/register'].includes(pathname))
    return (
      <div className="full-state">
        <div className="card padded">
          <h1>Let’s reconnect.</h1>
          <Notice>{error}</Notice>
          <button className="button primary" onClick={refresh}>
            Try again
          </button>
        </div>
      </div>
    );
  return (
    <Routes>
      <Route path="/login" element={<AuthPage key="login" />} />
      <Route path="/register" element={<AuthPage key="register" register />} />
      <Route element={<Protected />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/appointments" element={<Appointments />} />
          <Route element={<Protected roles={['doctor']} />}>
            <Route path="/queue" element={<DoctorQueue />} />
            <Route path="/clinical/:id" element={<ConsultationPage />} />
          </Route>
          <Route element={<Protected roles={['patient', 'receptionist', 'admin']} />}>
            <Route path="/book" element={<BookAppointment />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/billing/:id" element={<BillDetail />} />
          </Route>
          <Route element={<Protected roles={['receptionist', 'admin']} />}>
            <Route path="/reception/patients" element={<ReceptionPatients />} />
          </Route>
          <Route element={<Protected roles={['doctor', 'admin']} />}>
            <Route path="/schedules" element={<Schedules />} />
          </Route>
          <Route element={<Protected roles={['patient']} />}>
            <Route path="/feedback" element={<PatientFeedback />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/recommendations" element={<Recommendations />} />
            <Route path="/records" element={<MedicalHistory />} />
          </Route>
          <Route element={<Protected roles={['admin']} />}>
            <Route path="/admin/reports" element={<Reports />} />
            <Route path="/admin/audit" element={<AuditLog />} />
            <Route path="/admin/feedback" element={<AdminFeedback />} />
            <Route path="/admin/departments" element={<Departments />} />
            <Route path="/admin/staff" element={<Staff />} />
          </Route>
        </Route>
      </Route>
      <Route
        path="*"
        element={
          <div className="full-state">
            <div>
              <h1>Page not found</h1>
              <p>This page may have moved.</p>
              <Link className="button primary" to="/dashboard">
                Go to your workspace
              </Link>
            </div>
          </div>
        }
      />
    </Routes>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <DisplayProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </DisplayProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
