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
    <div className="flex min-h-screen bg-offwhite">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar onMenuToggle={() => setMobileOpen(true)} />
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

/* Layout WITHOUT sidebar (Student — PRD §6.3) */
const StudentLayout = () => (
  <div className="min-h-screen bg-offwhite flex flex-col">
    <nav className="h-14 lg:h-16 bg-navy flex items-center justify-between px-4 lg:px-8 sticky top-0 z-40">
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
        <p className="text-sm font-semibold text-white leading-none">{user?.rollNo}</p>
        <p className="text-[10px] text-white/60 uppercase tracking-widest mt-0.5">{user?.name}</p>
      </div>
      <button onClick={logout} className="px-3 py-1.5 rounded-full bg-white/10 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-white/20 transition-colors">
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
              color: '#1E3A5F',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              fontWeight: '700',
              fontSize: '13px',
              padding: '16px 24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              fontFamily: 'Inter, sans-serif',
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
