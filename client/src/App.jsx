import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ErrorBoundary from './components/ui/ErrorBoundary';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { ROLES } from './utils/constants';
import { getRoleRedirect } from './utils/roleRedirect';
import { Toaster } from 'react-hot-toast';

import Sidebar from './components/layout/Sidebar';
import Navbar from './components/layout/Navbar';

import Login from './pages/auth/Login';
import ChangePassword from './pages/auth/ChangePassword';

import AdminDashboard from './pages/admin/Dashboard';
import Departments from './pages/admin/Departments';
import DepartmentClasses from './pages/admin/DepartmentClasses';
import ClassDetail from './pages/admin/ClassDetail';
import FacultyList from './pages/admin/FacultyList';
import StudentList from './pages/admin/StudentList';
import BatchView from './pages/admin/BatchView';
import BatchStudentDetail from './pages/admin/BatchStudentDetail';
import Subjects from './pages/admin/Subjects';
import Batches from './pages/admin/Batches';

import HodDashboard from './pages/hod/Dashboard';
import Dues from './pages/hod/Dues';
import Overrides from './pages/hod/Overrides';

import FacultyDashboard from './pages/faculty/Dashboard';
import Pending from './pages/faculty/Pending';
import FacultyHistory from './pages/faculty/History';

import StudentStatus from './pages/student/Status';

/* Layout WITH sidebar (Admin, HoD, Faculty) */
const AppLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex h-screen overflow-hidden bg-offwhite">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="absolute inset-0 pointer-events-none grid-overlay opacity-[0.32]" />
        <Navbar onMenuToggle={() => setMobileOpen(true)} />
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 relative z-10">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

/* Layout WITHOUT sidebar (Student — PRD §6.3) */
const StudentLayout = () => (
  <div className="h-screen overflow-hidden bg-offwhite flex flex-col">
    <nav className="h-14 lg:h-16 bg-gradient-to-r from-indigo-950 via-indigo-900 to-slate-900 border-b border-white/10 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-40">
      <h2 className="text-white font-brand text-lg">No<span className="text-gold">Dues</span></h2>
      <StudentNavRight />
    </nav>
    <div className="flex-1 overflow-y-auto p-4 lg:p-8">
      <Outlet />
    </div>
  </div>
);

const StudentNavRight = () => {
  const { user, logout } = useAuth();
  return (
    <div className="flex items-center gap-3">
      <div className="text-right hidden sm:block">
        <p className="text-sm font-black text-white leading-none tracking-tight">{user?.rollNo}</p>
        <p className="text-[9px] text-indigo-100/70 uppercase tracking-[0.24em] mt-1">{user?.name}</p>
      </div>
      <button onClick={logout} className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 text-white text-[10px] font-black uppercase tracking-[0.18em] hover:bg-white/20 transition-colors">
        Logout
      </button>
    </div>
  );
};

const RoleRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return null; // Avoid flicker during session restore
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={getRoleRedirect(user.role)} replace />;
};

const App = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Toaster 
          position="top-right"
          containerStyle={{ top: 40, right: 40 }}
          toastOptions={{
            duration: 4000,
            style: {
              background: '#FFFFFF',
              color: '#312e81',
              borderRadius: '16px',
              border: '1px solid #e4e4e7',
              fontWeight: '700',
              fontSize: '12px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              padding: '14px 20px',
              boxShadow: '0 14px 30px rgba(15, 23, 42, 0.14)',
              fontFamily: 'Geist, Outfit, sans-serif',
            },
            success: {
              iconTheme: {
                primary: '#10B981',
                secondary: '#FFFFFF',
              },
            },
            error: {
              iconTheme: {
                primary: '#EF4444',
                secondary: '#FFFFFF',
              },
            },
          }}
        />
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RoleRedirect />} />

            {/* Staff Layout (sidebar) */}
            <Route element={<ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.HOD, ROLES.FACULTY]}><AppLayout /></ProtectedRoute>}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/departments" element={<Departments />} />
              <Route path="/admin/departments/:deptId/classes" element={<DepartmentClasses />} />
              <Route path="/admin/class/:classId" element={<ClassDetail />} />
              <Route path="/admin/faculty" element={<FacultyList />} />
              <Route path="/admin/students" element={<StudentList />} />
              <Route path="/admin/subjects" element={<Subjects />} />
              <Route path="/admin/batches" element={<Batches />} />
              <Route path="/admin/batch/:batchId" element={<BatchView />} />
              <Route path="/admin/batch/:batchId/students/:studentId" element={<BatchStudentDetail />} />
              <Route path="/change-password" element={<ChangePassword />} />

              <Route path="/hod" element={<HodDashboard />} />
              <Route path="/hod/dues" element={<Dues />} />
              <Route path="/hod/overrides" element={<Overrides />} />

              <Route path="/faculty" element={<FacultyDashboard />} />
              <Route path="/faculty/pending" element={<Pending />} />
              <Route path="/faculty/history" element={<FacultyHistory />} />
            </Route>

            {/* Student Layout (NO sidebar — PRD §6.3) */}
            <Route element={<ProtectedRoute allowedRoles={[ROLES.STUDENT]}><StudentLayout /></ProtectedRoute>}>
              <Route path="/student" element={<StudentStatus />} />
            </Route>

            <Route path="/unauthorized" element={
              <div className="min-h-screen flex items-center justify-center bg-offwhite">
                <div className="text-center">
                  <h1 className="text-4xl font-brand text-navy mb-2">403</h1>
                  <p className="text-muted-foreground">You do not have permission to access this page.</p>
                </div>
              </div>
            } />
            <Route path="*" element={
              <div className="min-h-screen flex items-center justify-center bg-offwhite">
                <div className="text-center">
                  <h1 className="text-4xl font-brand text-navy mb-2">404</h1>
                  <p className="text-muted-foreground">Page not found.</p>
                </div>
              </div>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
