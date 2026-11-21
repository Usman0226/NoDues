import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '../../components/layout/PageWrapper';
import { useApi } from '../../hooks/useApi';
import { getMyClasses, getFacultyClassStudents } from '../../api/faculty';
import { 
  GraduationCap, 
  BookOpen, 
  UserCheck, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Layers, 
  RefreshCw,
  Search,
  X,
  Users,
  Download,
  LayoutGrid,
  List,
  Info
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Spinner';
import { toast } from 'react-hot-toast';

const MyClasses = () => {
  const navigate = useNavigate();
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'pending' | 'active_drives' | 'not_started'
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Student roster modal state
  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  const { data, loading, error, request: fetchClasses } = useApi(
    () => getMyClasses(), 
    { immediate: true }
  );

  const classes = useMemo(() => data?.data || [], [data?.data]);

  // Exclude closed/archived classes to keep faculty view strictly focused on active duties
  const activeClasses = useMemo(() => {
    return classes.filter(c => c.batchStatus !== 'closed' && c.isActiveClass !== false);
  }, [classes]);

  // Search & tab filtered classes
  const filteredClasses = useMemo(() => {
    return activeClasses.filter(c => {
      // Tab filter
      if (filterTab === 'pending' && (!c.pendingCount || c.pendingCount === 0)) return false;
      if (filterTab === 'active_drives' && c.batchStatus !== 'active') return false;
      if (filterTab === 'not_started' && c.batchStatus !== 'not_initiated') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (c.name || '').toLowerCase().includes(q);
        const matchesSubject = (c.subjectTaught || '').toLowerCase().includes(q);
        const matchesCode = (c.subjectCode || '').toLowerCase().includes(q);
        const matchesDept = (c.departmentName || '').toLowerCase().includes(q);
        if (!matchesName && !matchesSubject && !matchesCode && !matchesDept) return false;
      }

      return true;
    });
  }, [activeClasses, filterTab, searchQuery]);

  // Aggregate stats
  const pendingCount = useMemo(() => activeClasses.filter(c => (c.pendingCount || 0) > 0).length, [activeClasses]);
  const activeDrivesCount = useMemo(() => activeClasses.filter(c => c.batchStatus === 'active').length, [activeClasses]);
  const notInitiatedCount = useMemo(() => activeClasses.filter(c => c.batchStatus === 'not_initiated').length, [activeClasses]);
  const totalPendingReviews = useMemo(() => activeClasses.reduce((acc, c) => acc + (c.pendingCount || 0), 0), [activeClasses]);
  const totalStudentsEnrolled = useMemo(() => activeClasses.reduce((acc, c) => acc + (c.studentCount || 0), 0), [activeClasses]);

  const distinctSubjectsCount = useMemo(() => {
    const subs = activeClasses.map(c => c.subjectTaught || c.subjectCode).filter(Boolean);
    return new Set(subs).size;
  }, [activeClasses]);

  // Open student modal
  const handleOpenStudentsModal = async (classItem) => {
    setSelectedClass(classItem);
    setStudentSearch('');
    setLoadingStudents(true);
    try {
      const res = await getFacultyClassStudents(classItem._id);
      setStudents(res.data?.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load students for this class');
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  };

  // Filter students inside modal
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLowerCase().trim();
    return students.filter(s => 
      (s.rollNo || '').toLowerCase().includes(q) ||
      (s.name || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  // Export roster to CSV
  const handleExportRosterCSV = () => {
    if (!students.length) {
      toast.error('No students to export');
      return;
    }
    const headers = ['Roll Number', 'Student Name', 'Email', 'Year of Study'];
    const rows = students.map(s => [
      `"${s.rollNo || ''}"`,
      `"${s.name || ''}"`,
      `"${s.email || ''}"`,
      `"${s.yearOfStudy || ''}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${selectedClass?.name || 'Class'}_Student_Roster.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Student list exported');
  };

  if (loading && !data) {
    return <PageSpinner message="Loading your classes..." />;
  }

  if (error && !data) {
    return (
      <PageWrapper title="My Classes" subtitle="Unable to load">
        <div className="h-[60vh] flex flex-col items-center justify-center space-y-4 px-6 text-center">
          <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="text-red-500" size={32} />
          </div>
          <h3 className="text-navy font-brand text-xl">Failed to load classes</h3>
          <p className="text-sm text-zinc-500 max-w-xs">{error}</p>
          <Button onClick={() => fetchClasses()} variant="outline" className="rounded-full px-8">
            <RefreshCw size={14} className="mr-2" /> Try again
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper 
      title="My Classes" 
      subtitle="Overview of your assigned sections, course teaching load, and student clearance status"
      headerActions={
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200/80">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-xs text-navy' : 'text-zinc-500 hover:text-navy'}`}
              title="Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white shadow-xs text-navy' : 'text-zinc-500 hover:text-navy'}`}
              title="List View"
            >
              <List size={15} />
            </button>
          </div>

          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => fetchClasses()}
            className="text-zinc-600 hover:text-navy border border-zinc-200 bg-white"
            title="Refresh Classes"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      }
    >
      {/* ── Executive Metric Overview ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">Teaching Load</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-navy">{activeClasses.length}</span>
              <span className="text-xs font-bold text-zinc-400">{activeClasses.length === 1 ? 'Section' : 'Sections'}</span>
            </div>
            <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
              {distinctSubjectsCount > 0 ? `${distinctSubjectsCount} distinct course subjects` : 'Active academic sections'}
            </p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-indigo-50 border border-indigo-100/60 flex items-center justify-center text-indigo-600 shrink-0">
            <BookOpen size={22} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">Total Students</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-navy">{totalStudentsEnrolled}</span>
              <span className="text-xs font-bold text-zinc-400">enrolled</span>
            </div>
            <p className="text-[11px] text-zinc-500 font-medium mt-0.5">Across your assigned class sections</p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-emerald-50 border border-emerald-100/60 flex items-center justify-center text-emerald-600 shrink-0">
            <Users size={22} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">Clearance Status</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-black ${
                totalPendingReviews > 0 
                  ? 'text-amber-600' 
                  : activeDrivesCount > 0 
                  ? 'text-emerald-600' 
                  : 'text-zinc-600'
              }`}>
                {totalPendingReviews > 0 ? totalPendingReviews : activeDrivesCount > 0 ? 'All Clear' : 'Not Started'}
              </span>
              {totalPendingReviews > 0 && <span className="text-xs font-bold text-amber-600">pending</span>}
            </div>
            <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
              {totalPendingReviews > 0 
                ? 'Student clearance reviews pending' 
                : activeDrivesCount > 0 
                ? `${activeDrivesCount} active clearance ${activeDrivesCount === 1 ? 'drive' : 'drives'}` 
                : 'Awaiting HoD initiation for this term'}
            </p>
          </div>
          <div className={`h-12 w-12 rounded-2xl flex items-center justify-center border shrink-0 ${
            totalPendingReviews > 0 
              ? 'bg-amber-50 border-amber-100 text-amber-600' 
              : activeDrivesCount > 0 
              ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
              : 'bg-zinc-100 border-zinc-200 text-zinc-500'
          }`}>
            {totalPendingReviews > 0 ? <AlertCircle size={22} /> : activeDrivesCount > 0 ? <CheckCircle2 size={22} /> : <Clock size={22} />}
          </div>
        </div>
      </div>

      {/* ── Search & Filter Toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input 
            type="text"
            placeholder="Search by course name, code, section..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-8 text-xs bg-white border border-zinc-200/90 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-navy placeholder:text-zinc-400 shadow-xs"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterTab('all')}
            className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
              filterTab === 'all'
                ? 'bg-navy text-white shadow-sm'
                : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            <span>All Classes</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              filterTab === 'all' ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-600'
            }`}>
              {activeClasses.length}
            </span>
          </button>

          {pendingCount > 0 && (
            <button
              onClick={() => setFilterTab('pending')}
              className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
                filterTab === 'pending'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-white border border-amber-200 text-amber-700 hover:bg-amber-50'
              }`}
            >
              <Clock size={13} />
              <span>Needs Review</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                filterTab === 'pending' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
              }`}>
                {pendingCount}
              </span>
            </button>
          )}

          {activeDrivesCount > 0 && (
            <button
              onClick={() => setFilterTab('active_drives')}
              className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
                filterTab === 'active_drives'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              <CheckCircle2 size={13} />
              <span>Active Drives</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                filterTab === 'active_drives' ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-600'
              }`}>
                {activeDrivesCount}
              </span>
            </button>
          )}

          {notInitiatedCount > 0 && (
            <button
              onClick={() => setFilterTab('not_started')}
              className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
                filterTab === 'not_started'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              <span>Not Initiated</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                filterTab === 'not_started' ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-600'
              }`}>
                {notInitiatedCount}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ── Content: Grid View or List View ─────────────────────────────────── */}
      {filteredClasses.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white border border-dashed border-zinc-200 rounded-2xl p-16 text-center shadow-xs"
        >
          <div className="bg-zinc-50 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6 border border-zinc-100">
            <GraduationCap className="text-zinc-300" size={40} />
          </div>
          <h3 className="text-navy font-black text-xl tracking-tight mb-2">No Matching Classes</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto font-medium leading-relaxed">
            {searchQuery 
              ? `No classes matched "${searchQuery}". Try clearing your search filter.`
              : filterTab === 'pending' 
              ? 'No classes currently have pending clearance approvals.' 
              : filterTab === 'active_drives'
              ? 'No clearance drives are active right now.'
              : filterTab === 'not_started'
              ? 'All classes have had clearance drives initiated.'
              : 'No classes are currently assigned to you.'}
          </p>
          {(searchQuery || filterTab !== 'all') && (
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4 text-[10px] font-bold uppercase tracking-wider"
              onClick={() => { setSearchQuery(''); setFilterTab('all'); }}
            >
              Reset Filters
            </Button>
          )}
        </motion.div>
      ) : viewMode === 'grid' ? (
        /* ── Grid View ── */
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {filteredClasses.map((c, idx) => {
            const isActiveDrive = c.batchStatus === 'active';
            const isNotInitiated = c.batchStatus === 'not_initiated';
            const isClassTeacher = c.roleTag === 'classTeacher';

            return (
              <motion.div 
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.3 }}
                key={`${c._id}-${c.roleTag}-${c.subjectCode || idx}`}
                className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs hover:shadow-xl hover:border-indigo-300 transition-all duration-300 flex flex-col justify-between overflow-hidden relative group"
              >
                {/* Top Accent Bar */}
                <div className={`h-1.5 w-full ${
                  isClassTeacher 
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600' 
                    : 'bg-gradient-to-r from-indigo-500 to-indigo-600'
                }`} />

                <div className="p-6">
                  {/* Row 1: Role Badge & Clearance Status Chip */}
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      isClassTeacher 
                        ? 'bg-amber-50 text-amber-800 border border-amber-200/60' 
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                    }`}>
                      {isClassTeacher ? <UserCheck size={12} /> : <BookOpen size={12} />}
                      {isClassTeacher ? 'Class Teacher' : 'Course Instructor'}
                    </span>

                    {/* Clearance Status Chip */}
                    {isActiveDrive && (c.pendingCount || 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black uppercase tracking-wider">
                        <Clock size={11} /> {c.pendingCount} Pending
                      </span>
                    )}
                    {isActiveDrive && (!c.pendingCount || c.pendingCount === 0) && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase tracking-wider">
                        <CheckCircle2 size={11} /> All Clear
                      </span>
                    )}
                    {isNotInitiated && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200 text-[10px] font-bold uppercase tracking-wider" title="Drive not yet opened by HoD">
                        <Clock size={11} /> Drive Not Started
                      </span>
                    )}
                  </div>

                  {/* Course Title & Section Identification */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-lg bg-navy text-white text-xs font-black tracking-wide">
                        Section {c.name}
                      </span>
                      {c.subjectCode && (
                        <span className="font-mono text-xs font-bold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                          {c.subjectCode}
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-black text-navy group-hover:text-indigo-600 transition-colors tracking-tight leading-snug line-clamp-1" title={c.subjectTaught || c.name}>
                      {c.subjectTaught || `${c.name} (Class Incharge)`}
                    </h3>
                    <p className="text-xs text-zinc-500 font-medium mt-1">
                      Semester {c.semester} · {c.academicYear || 'Current Academic Year'}
                      {c.departmentName && ` · Dept. of ${c.departmentName}`}
                    </p>
                  </div>

                  {/* Metadata Row: Enrolled count & Class Teacher */}
                  <div className="grid grid-cols-2 gap-3 py-3 px-3.5 bg-zinc-50/80 rounded-xl border border-zinc-100 mb-4 text-xs">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 block mb-0.5">Enrolled</span>
                      <span className="font-bold text-navy flex items-center gap-1">
                        <Users size={12} className="text-zinc-400" />
                        {c.studentCount ? `${c.studentCount} Students` : 'Roster Active'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 block mb-0.5">Class Teacher</span>
                      <span className="font-bold text-zinc-700 truncate block" title={c.classTeacherName || 'Not Assigned'}>
                        {c.classTeacherName || (isClassTeacher ? 'You' : '—')}
                      </span>
                    </div>
                  </div>

                  {/* Clearance Progress Block */}
                  {isActiveDrive ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
                        <span className="text-zinc-400">Clearance Status</span>
                        <span className={(c.pendingCount || 0) > 0 ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
                          {(c.pendingCount || 0) > 0 ? `${c.pendingCount} Awaiting Review` : '100% Cleared'}
                        </span>
                      </div>
                      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-700 ${(c.pendingCount || 0) > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ 
                            width: `${(c.totalCount || 0) > 0 ? Math.round(((c.totalCount - (c.pendingCount || 0)) / c.totalCount) * 100) : 100}%` 
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/60 text-xs text-zinc-500 flex items-start gap-2.5">
                      <Info size={14} className="text-zinc-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-zinc-600 leading-relaxed font-medium">
                        Clearance drive not yet initiated for this term. Approvals will activate once HoD opens the batch.
                      </p>
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="p-6 pt-0 mt-auto">
                  <div className="pt-4 border-t border-zinc-100 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenStudentsModal(c)}
                      className="flex-1 text-xs font-bold text-navy hover:bg-zinc-50 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-zinc-200"
                    >
                      <Users size={13} className="text-zinc-500" />
                      <span>View Students</span>
                    </Button>

                    {isActiveDrive && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => navigate('/faculty/pending', { state: { classId: c.batchId, from: 'faculty-my-classes' } })}
                        className="flex-1 text-xs font-bold text-white bg-navy hover:bg-navy/90 flex items-center justify-center gap-1.5 py-2.5 rounded-xl shadow-sm"
                      >
                        <span>Review</span>
                        <ChevronRight size={13} />
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        /* ── Table / List View ── */
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-2xl border border-zinc-200/80 overflow-hidden shadow-xs"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50/80 border-b border-zinc-200/80 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="py-3 px-4">Section</th>
                  <th className="py-3 px-4">Course / Subject</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Term</th>
                  <th className="py-3 px-4">Students</th>
                  <th className="py-3 px-4">Clearance Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredClasses.map((c, idx) => {
                  const isActiveDrive = c.batchStatus === 'active';
                  const isClassTeacher = c.roleTag === 'classTeacher';

                  return (
                    <tr key={`${c._id}-${c.roleTag}-${idx}`} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-black text-navy">
                        <span className="px-2 py-0.5 rounded bg-navy text-white text-[11px]">
                          {c.name}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-navy text-xs">
                          {c.subjectTaught || `${c.name} (Class Incharge)`}
                        </div>
                        {c.subjectCode && (
                          <span className="font-mono text-[10px] text-zinc-500 font-bold">
                            {c.subjectCode}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isClassTeacher ? 'bg-amber-50 text-amber-800' : 'bg-indigo-50 text-indigo-700'
                        }`}>
                          {isClassTeacher ? 'Class Teacher' : 'Instructor'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-500 font-medium">
                        Sem {c.semester} · {c.academicYear}
                      </td>
                      <td className="py-3.5 px-4 text-navy font-bold">
                        {c.studentCount || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {isActiveDrive ? (
                          (c.pendingCount || 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">
                              <Clock size={10} /> {c.pendingCount} Pending
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                              <CheckCircle2 size={10} /> All Clear
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-medium">
                            Not Started
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenStudentsModal(c)}
                            className="text-xs text-navy hover:bg-zinc-100 h-8 px-2.5"
                          >
                            <Users size={13} className="mr-1 text-zinc-500" />
                            Students
                          </Button>
                          {isActiveDrive && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => navigate('/faculty/pending', { state: { classId: c.batchId, from: 'faculty-my-classes' } })}
                              className="text-xs h-8 px-2.5"
                            >
                              Review
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* ── Student Roster Modal ────────────────────────────────────────────── */}
      <Modal
        isOpen={!!selectedClass}
        onClose={() => setSelectedClass(null)}
        title={`${selectedClass?.name || 'Class'} — Enrolled Students`}
        size="2xl"
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-zinc-50 border border-zinc-100">
            <div>
              <p className="text-xs font-bold text-navy">
                {selectedClass?.subjectTaught ? `${selectedClass.subjectTaught} (${selectedClass.subjectCode || ''})` : `Section ${selectedClass?.name}`}
              </p>
              <p className="text-[11px] text-zinc-500 font-medium">
                Semester {selectedClass?.semester} · Academic Year {selectedClass?.academicYear}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">
                {students.length} {students.length === 1 ? 'Student' : 'Students'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportRosterCSV}
                className="text-xs font-bold text-navy flex items-center gap-1.5"
                disabled={!students.length}
              >
                <Download size={13} /> Export
              </Button>
            </div>
          </div>

          {/* Quick search input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input 
              type="text"
              placeholder="Filter by roll number or name..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-8 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
            />
            {studentSearch && (
              <button 
                onClick={() => setStudentSearch('')} 
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Table */}
          {loadingStudents ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs font-medium">
              <RefreshCw size={18} className="animate-spin text-indigo-600" />
              <span>Loading student roster...</span>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-10 text-center text-zinc-500 text-xs font-medium border border-dashed border-zinc-200 rounded-xl">
              {studentSearch ? `No students matched "${studentSearch}"` : 'No students found enrolled in this class.'}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto border border-zinc-200/80 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200/80 text-[10px] font-black uppercase tracking-wider text-zinc-400 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">#</th>
                    <th className="py-2.5 px-3">Roll No</th>
                    <th className="py-2.5 px-3">Student Name</th>
                    <th className="py-2.5 px-3">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredStudents.map((s, idx) => (
                    <tr key={s._id || idx} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="py-2.5 px-3 text-center text-[10px] font-bold text-zinc-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-navy">
                        {s.rollNo}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-zinc-800">
                        {s.name}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-500 truncate max-w-[180px]">
                        {s.email || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </PageWrapper>
  );
};

export default MyClasses;
