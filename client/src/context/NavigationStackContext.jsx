import React, { createContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, matchPath } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ROLES } from '../utils/constants';

export const NavigationStackContext = createContext(null);

// Route definition mapping for deterministic auto-fallback breadcrumb resolution
const ROUTE_DEFINITIONS = [
  // Admin Routes
  { pattern: '/admin', end: true, getCrumbs: () => [{ label: 'Dashboard', path: '/admin', isCurrent: true }] },
  { pattern: '/admin/departments', end: true, getCrumbs: () => [
      { label: 'Departments', path: '/admin/departments', isCurrent: true }
  ]},
  { pattern: '/admin/departments/:deptId/classes', getCrumbs: ({ params }) => [
      { label: 'Departments', path: '/admin/departments' },
      { label: 'Academic Groups', path: `/admin/departments/${params.deptId}/classes`, isCurrent: true }
  ]},
  { pattern: '/admin/class/:classId', getCrumbs: () => [
      { label: 'Departments', path: '/admin/departments' },
      { label: 'Class Details', isCurrent: true }
  ]},
  { pattern: '/admin/faculty', end: true, getCrumbs: () => [
      { label: 'Faculty Directory', path: '/admin/faculty', isCurrent: true }
  ]},
  { pattern: '/admin/students', end: true, getCrumbs: () => [
      { label: 'Student Directory', path: '/admin/students', isCurrent: true }
  ]},
  { pattern: '/admin/subjects', end: true, getCrumbs: () => [
      { label: 'Curriculum & Subjects', path: '/admin/subjects', isCurrent: true }
  ]},
  { pattern: '/admin/batches', end: true, getCrumbs: () => [
      { label: 'Clearance Batches', path: '/admin/batches', isCurrent: true }
  ]},
  { pattern: '/admin/batch/:batchId', end: true, getCrumbs: ({ params }) => [
      { label: 'Clearance Batches', path: '/admin/batches' },
      { label: 'Batch Workspace', path: `/admin/batch/${params.batchId}`, isCurrent: true }
  ]},
  { pattern: '/admin/batch/:batchId/students/:studentId', getCrumbs: ({ params }) => [
      { label: 'Clearance Batches', path: '/admin/batches' },
      { label: 'Batch Workspace', path: `/admin/batch/${params.batchId}` },
      { label: 'Student Clearance Audit', isCurrent: true }
  ]},
  { pattern: '/admin/setup', end: true, getCrumbs: () => [
      { label: 'Setup Wizard', path: '/admin/setup', isCurrent: true }
  ]},
  { pattern: '/admin/co-curricular', end: true, getCrumbs: () => [
      { label: 'Co-Curricular Events', path: '/admin/co-curricular', isCurrent: true }
  ]},
  { pattern: '/admin/email-monitor', end: true, getCrumbs: () => [
      { label: 'Email Monitor', path: '/admin/email-monitor', isCurrent: true }
  ]},
  { pattern: '/admin/feedback', end: true, getCrumbs: () => [
      { label: 'User Feedback', path: '/admin/feedback', isCurrent: true }
  ]},

  // HOD Routes
  { pattern: '/hod', end: true, getCrumbs: () => [{ label: 'Dashboard', path: '/hod', isCurrent: true }] },
  { pattern: '/hod/classes', end: true, getCrumbs: () => [
      { label: 'Academic Groups', path: '/hod/classes', isCurrent: true }
  ]},
  { pattern: '/hod/class/:classId', getCrumbs: () => [
      { label: 'Academic Groups', path: '/hod/classes' },
      { label: 'Class Details', isCurrent: true }
  ]},
  { pattern: '/hod/my-classes', end: true, getCrumbs: () => [
      { label: 'My Classes', path: '/hod/my-classes', isCurrent: true }
  ]},
  { pattern: '/hod/students', end: true, getCrumbs: () => [
      { label: 'Student Directory', path: '/hod/students', isCurrent: true }
  ]},
  { pattern: '/hod/faculty', end: true, getCrumbs: () => [
      { label: 'Faculty Directory', path: '/hod/faculty', isCurrent: true }
  ]},
  { pattern: '/hod/subjects', end: true, getCrumbs: () => [
      { label: 'Curriculum & Subjects', path: '/hod/subjects', isCurrent: true }
  ]},
  { pattern: '/hod/batches', end: true, getCrumbs: () => [
      { label: 'Clearance Batches', path: '/hod/batches', isCurrent: true }
  ]},
  { pattern: '/hod/batch/:batchId', end: true, getCrumbs: ({ params }) => [
      { label: 'Clearance Batches', path: '/hod/batches' },
      { label: 'Batch Workspace', path: `/hod/batch/${params.batchId}`, isCurrent: true }
  ]},
  { pattern: '/hod/batch/:batchId/students/:studentId', getCrumbs: ({ params }) => [
      { label: 'Clearance Batches', path: '/hod/batches' },
      { label: 'Batch Workspace', path: `/hod/batch/${params.batchId}` },
      { label: 'Student Clearance Audit', isCurrent: true }
  ]},
  { pattern: '/hod/dues', end: true, getCrumbs: () => [
      { label: 'Dues Management', path: '/hod/dues', isCurrent: true }
  ]},
  { pattern: '/hod/overrides', end: true, getCrumbs: () => [
      { label: 'Clearance Overrides', path: '/hod/overrides', isCurrent: true }
  ]},
  { pattern: '/hod/co-curricular', end: true, getCrumbs: () => [
      { label: 'Co-Curricular Events', path: '/hod/co-curricular', isCurrent: true }
  ]},

  // Faculty Routes
  { pattern: '/faculty', end: true, getCrumbs: () => [{ label: 'Dashboard', path: '/faculty', isCurrent: true }] },
  { pattern: '/faculty/pending', end: true, getCrumbs: () => [
      { label: 'Clearance Approvals', path: '/faculty/pending', isCurrent: true }
  ]},
  { pattern: '/faculty/classes', end: true, getCrumbs: () => [
      { label: 'My Classes', path: '/faculty/classes', isCurrent: true }
  ]},
  { pattern: '/faculty/history', end: true, getCrumbs: () => [
      { label: 'Action History', path: '/faculty/history', isCurrent: true }
  ]},

  // Student Routes
  { pattern: '/student', end: true, getCrumbs: () => [{ label: 'Clearance Status', path: '/student', isCurrent: true }] },
  { pattern: '/student/history', end: true, getCrumbs: () => [
      { label: 'Clearance Status', path: '/student' },
      { label: 'Clearance History', path: '/student/history', isCurrent: true }
  ]},
  { pattern: '/student/history/:requestId', getCrumbs: () => [
      { label: 'Clearance Status', path: '/student' },
      { label: 'Clearance History', path: '/student/history' },
      { label: 'Request Details', isCurrent: true }
  ]},

  // Global Common
  { pattern: '/change-password', end: true, getCrumbs: () => [
      { label: 'Account Security', path: '/change-password', isCurrent: true }
  ]}
];

export const NavigationStackProvider = ({ children }) => {
  const location = useLocation();
  const { user } = useAuth();
  const [customCrumbs, setCustomCrumbsState] = useState(null);

  // Automatically reset custom breadcrumbs whenever route path changes to prevent stale leak
  useEffect(() => {
    setCustomCrumbsState(null);
  }, [location.pathname]);

  // Determine role-based root path and label
  const rootCrumb = useMemo(() => {
    const role = user?.role;
    let rootPath = '/admin';
    if (role === ROLES.HOD || role === ROLES.AO) rootPath = '/hod';
    else if (role === ROLES.FACULTY) rootPath = '/faculty/pending';
    else if (role === ROLES.STUDENT) rootPath = '/student';

    return {
      label: 'NoDues',
      path: rootPath,
      isRoot: true,
      isCurrent: location.pathname === rootPath
    };
  }, [user?.role, location.pathname]);

  // Derive breadcrumbs automatically from route definitions if no custom crumbs were explicitly provided
  const routeDerivedCrumbs = useMemo(() => {
    // Check against defined routes
    for (const def of ROUTE_DEFINITIONS) {
      const match = matchPath({ path: def.pattern, end: def.end ?? false }, location.pathname);
      if (match) {
        return def.getCrumbs({ params: match.params, pathname: location.pathname });
      }
    }

    // Fallback parser for any unregistered routes (cleaning hex ObjectIds)
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return [];

    const isHexId = (str) => /^[0-9a-fA-F]{24}$/.test(str);
    const crumbs = [];
    let currentPath = '';

    segments.forEach((seg, idx) => {
      currentPath += `/${seg}`;
      const isLast = idx === segments.length - 1;

      if (isHexId(seg)) {
        crumbs.push({
          label: 'Details',
          path: currentPath,
          isCurrent: isLast
        });
      } else {
        const formatted = seg
          .split('-')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        crumbs.push({
          label: formatted,
          path: currentPath,
          isCurrent: isLast
        });
      }
    });

    return crumbs;
  }, [location.pathname]);

  // Combined stack ensures root 'NoDues' is always present at level 0
  const breadcrumbs = useMemo(() => {
    let rawStack = customCrumbs || routeDerivedCrumbs;

    // Filter out redundant root if custom crumbs included it
    const hasRoot = rawStack.length > 0 && (rawStack[0].label === 'NoDues' || rawStack[0].isRoot);
    let completeStack = hasRoot ? rawStack : [rootCrumb, ...rawStack];

    // Ensure only the very last item has isCurrent: true
    return completeStack.map((crumb, idx) => ({
      ...crumb,
      isCurrent: idx === completeStack.length - 1
    }));
  }, [customCrumbs, routeDerivedCrumbs, rootCrumb]);

  const setBreadcrumbs = useCallback((crumbs) => {
    setCustomCrumbsState(crumbs);
  }, []);

  const clearBreadcrumbs = useCallback(() => {
    setCustomCrumbsState(null);
  }, []);

  return (
    <NavigationStackContext.Provider
      value={{
        breadcrumbs,
        setBreadcrumbs,
        clearBreadcrumbs,
        currentCrumb: breadcrumbs[breadcrumbs.length - 1] || rootCrumb,
        parentCrumb: breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2] : null,
      }}
    >
      {children}
    </NavigationStackContext.Provider>
  );
};

