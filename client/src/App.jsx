import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { UIProvider, UIContext } from './context/UIContext';
import { useUI } from './hooks/useUI';
import { PageSpinner } from './components/ui/Spinner';
import ErrorBoundary from './components/ui/ErrorBoundary';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { ROLES } from './utils/constants';
import { getRoleRedirect } from './utils/roleRedirect';
import { Toaster } from 'react-hot-toast';

import Sidebar from './components/layout/Sidebar';
import Navbar from './components/layout/Navbar';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ScrollToTop from './components/ui/ScrollToTop';

import Login from './pages/auth/Login';
import ChangePassword from './pages/auth/ChangePassword';
import ForcedChangePasswordModal from './components/auth/ForcedChangePasswordModal';

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
import EmailMonitor from './pages/admin/EmailMonitor';

import HodDashboard from './pages/hod/Dashboard';
import Dues from './pages/hod/Dues';
import Overrides from './pages/hod/Overrides';

import FacultyDashboard from './pages/faculty/Dashboard';
import MyClasses from './pages/faculty/MyClasses';
import HodMyClasses from './pages/hod/MyClasses';
import Pending from './pages/faculty/Pending';
import FacultyHistory from './pages/faculty/History';

import StudentStatus from './pages/student/Status';

const AppLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const isLocked = user?.mustChangePassword;

  return (
    <div className="flex h-screen overflow-hidden bg-offwhite">
      <ForcedChangePasswordModal />
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 min-w-0 relative h-full flex flex-col">
        <div className="absolute inset-0 pointer-events-none grid-overlay opacity-[0.32] -z-10" />
        <Navbar onMenuToggle={() => setMobileOpen(true)} />
        <div className="flex-1 overflow-y-auto relative z-10">
          {!isLocked ? (
            <Outlet />
          ) : (
            <div className="h-full w-full flex items-center justify-center p-8 select-none pointer-events-none">
              <div className="text-center space-y-4 opacity-10">
                <h1 className="text-8xl font-brand text-navy tracking-tighter">NoDues</h1>
                <p className="text-[10px] uppercase tracking-[0.4em] font-black text-navy leading-none">
                  Security Clearance Required
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StudentLayout = () => (
  <div className="h-screen overflow-hidden bg-offwhite flex flex-col relative">
    {/* Ambient Background Depth */}
    <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-500/5 blur-[120px] rounded-full" />
      <div className="absolute inset-0 grid-overlay opacity-[0.2]" />
    </div>

    <nav className="h-14 lg:h-16 bg-gradient-to-r from-indigo-950 via-indigo-900 to-slate-900 border-b border-white/10 flex items-center justify-between px-4 lg:px-8 shrink-0 relative z-40 shadow-lg">
      <h2 className="text-white font-brand text-lg">No<span className="text-gold">Dues</span></h2>
      <StudentNavRight />
    </nav>
    <main className="flex-1 overflow-y-auto relative z-10">
      <div className="max-w-7xl mx-auto min-h-full">
        <Outlet />
      </div>
    </main>
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
      <button onClick={logout} className="px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-[10px] font-black uppercase tracking-[0.18em] hover:bg-white/20 transition-colors">
        Logout
      </button>
    </div>
  );
};

const RoleRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return null; 
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={getRoleRedirect(user.role)} replace />;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const AppContent = () => {
  const { isGlobalLoading, loadingMessage } = useUI();

  return (
    <>
      {isGlobalLoading && <PageSpinner message={loadingMessage} />}
      <ScrollToTop />
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
          {/* Existing Routes ... */}
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
            <Route path="/admin/email-monitor" element={<EmailMonitor />} />
            <Route path="/change-password" element={<ChangePassword />} />

            <Route path="/hod" element={<HodDashboard />} />
            <Route path="/hod/classes" element={<DepartmentClasses />} />
            <Route path="/hod/my-classes" element={<HodMyClasses />} />
            <Route path="/hod/class/:classId" element={<ClassDetail />} />
            <Route path="/hod/students" element={<StudentList />} />
            <Route path="/hod/faculty" element={<FacultyList />} />
            <Route path="/hod/subjects" element={<Subjects />} />
            <Route path="/hod/batches" element={<Batches />} />
            <Route path="/hod/dues" element={<Dues />} />
            <Route path="/hod/overrides" element={<Overrides />} />
            <Route path="/hod/batch/:batchId" element={<BatchView />} />
            <Route path="/hod/batch/:batchId/students/:studentId" element={<BatchStudentDetail />} />

            <Route path="/faculty" element={<FacultyDashboard />} />
            <Route path="/faculty/classes" element={<MyClasses />} />
            <Route path="/faculty/pending" element={<Pending />} />
            <Route path="/faculty/history" element={<FacultyHistory />} />
          </Route>

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
    </>
  );
};

const App = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <UIProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </UIProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
