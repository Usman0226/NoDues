import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import ErrorBoundary from './components/ui/ErrorBoundary';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { ROLES } from './utils/constants';
import { getRoleRedirect } from './utils/roleRedirect';

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
        <div className="flex-1 overflow-y-auto"><Outlet /></div>
      </div>
    </div>
  );
};

/* Layout WITHOUT sidebar (Student — PRD §6.3) */
const StudentLayout = () => (
  <div className="min-h-screen bg-offwhite flex flex-col">
    <nav className="h-14 lg:h-16 bg-navy flex items-center justify-between px-4 lg:px-8 sticky top-0 z-40">
      <h2 className="text-white font-serif text-lg">No<span className="text-gold">Dues</span></h2>
      <StudentNavRight />
    </nav>
    <div className="flex-1 overflow-y-auto"><Outlet /></div>
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
      <button onClick={logout} className="px-3 py-1.5 rounded-full bg-white/10 text-white text-xs uppercase tracking-wider hover:bg-white/20 transition-colors">
        Logout
      </button>
    </div>
  );
};

const RoleRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={getRoleRedirect(user.role)} replace />;
};

const App = () => (
  <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RoleRedirect />} />

            {/* Staff Layout (sidebar) */}
            <Route element={<ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.HOD, ROLES.FACULTY]}><AppLayout /></ProtectedRoute>}>
              <Route path="/admin" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]}><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/departments" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]}><Departments /></ProtectedRoute>} />
              <Route path="/admin/departments/:deptId/classes" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]}><DepartmentClasses /></ProtectedRoute>} />
              <Route path="/admin/class/:classId" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]}><ClassDetail /></ProtectedRoute>} />
              <Route path="/admin/faculty" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]}><FacultyList /></ProtectedRoute>} />
              <Route path="/admin/students" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]}><StudentList /></ProtectedRoute>} />
              <Route path="/admin/subjects" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]}><Subjects /></ProtectedRoute>} />
              <Route path="/admin/batches" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]}><Batches /></ProtectedRoute>} />
              <Route path="/admin/batch/:batchId" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]}><BatchView /></ProtectedRoute>} />
              <Route path="/admin/batch/:batchId/students/:studentId" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]}><BatchStudentDetail /></ProtectedRoute>} />
              <Route path="/change-password" element={<ChangePassword />} />

              <Route path="/hod" element={<ProtectedRoute allowedRoles={[ROLES.HOD]}><HodDashboard /></ProtectedRoute>} />
              <Route path="/hod/dues" element={<ProtectedRoute allowedRoles={[ROLES.HOD]}><Dues /></ProtectedRoute>} />
              <Route path="/hod/overrides" element={<ProtectedRoute allowedRoles={[ROLES.HOD]}><Overrides /></ProtectedRoute>} />

              <Route path="/faculty" element={<ProtectedRoute allowedRoles={[ROLES.FACULTY]}><FacultyDashboard /></ProtectedRoute>} />
              <Route path="/faculty/pending" element={<ProtectedRoute allowedRoles={[ROLES.FACULTY]}><Pending /></ProtectedRoute>} />
              <Route path="/faculty/history" element={<ProtectedRoute allowedRoles={[ROLES.FACULTY]}><FacultyHistory /></ProtectedRoute>} />
            </Route>

            {/* Student Layout (NO sidebar — PRD §6.3) */}
            <Route element={<ProtectedRoute allowedRoles={[ROLES.STUDENT]}><StudentLayout /></ProtectedRoute>}>
              <Route path="/student" element={<StudentStatus />} />
            </Route>

            <Route path="/unauthorized" element={
              <div className="min-h-screen flex items-center justify-center bg-offwhite">
                <div className="text-center">
                  <h1 className="text-4xl font-serif text-navy mb-2">403</h1>
                  <p className="text-muted-foreground">You do not have permission to access this page.</p>
                </div>
              </div>
            } />
            <Route path="*" element={
              <div className="min-h-screen flex items-center justify-center bg-offwhite">
                <div className="text-center">
                  <h1 className="text-4xl font-serif text-navy mb-2">404</h1>
                  <p className="text-muted-foreground">Page not found.</p>
                </div>
              </div>
            } />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
