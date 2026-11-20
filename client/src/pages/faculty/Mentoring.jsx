import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Search,
  Filter,
  Download,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Eye,
  AlertCircle,
  FileText,
  Mail,
  GraduationCap,
  Sparkles,
  BookOpen,
  DollarSign
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { getMyMentees, getMenteeClearance } from '../../api/faculty';
import { approveRecord, markDueRecord, updateApproval, bulkApproveRecords } from '../../api/approvals';
import useSSE from '../../hooks/useSSE';
import { getSSEConnectUrl } from '../../api/sse';

const DUE_TYPES = [
  { value: 'lab', label: 'Lab Kit / Equipment / Observation Record' },
  { value: 'library', label: 'Library Book / Journal' },
  { value: 'fees', label: 'Department / Exam Fee' },
  { value: 'attendance', label: 'Attendance Shortage Remedial' },
  { value: 'other', label: 'Other Academic Requirement' },
];

const Mentoring = () => {
  const [mentees, setMentees] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    pendingMyApproval: 0,
    myDuesFlagged: 0,
    fullyCleared: 0,
    blockedElsewhere: 0,
  });
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending_my_approval' | 'my_due_marked' | 'blocked_elsewhere' | 'overall_cleared' | 'no_request'

  // Debounce search input by 300ms per Section 6 of Engineering Constitution
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  // Detail / Clearance Inspection Modal
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [clearanceData, setClearanceData] = useState(null);
  const [clearanceLoading, setClearanceLoading] = useState(false);

  // Mark Due Modal
  const [dueModalOpen, setDueModalOpen] = useState(false);
  const [dueTarget, setDueTarget] = useState(null); // { studentId, approvalId, studentName, rollNo }
  const [dueType, setDueType] = useState('lab');
  const [dueRemarks, setDueRemarks] = useState('');
  const [dueAmount, setDueAmount] = useState('');
  const [dueSubmitting, setDueSubmitting] = useState(false);

  // Action loading states
  const [actionInProgress, setActionInProgress] = useState({});

  const fetchMenteesData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const params = {};
      if (selectedClass !== 'all') params.classId = selectedClass;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      const res = await getMyMentees(params);
      const data = res?.data?.data || res?.data || {};

      setMentees(data.mentees || []);
      setSummary(data.summary || {
        total: 0,
        pendingMyApproval: 0,
        myDuesFlagged: 0,
        fullyCleared: 0,
        blockedElsewhere: 0,
      });
      if (data.classes && data.classes.length > 0) {
        setClasses(data.classes);
      }
    } catch (err) {
      console.error('Failed to load mentees:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load mentees list');
      toast.error('Failed to fetch assigned mentees');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedClass, statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchMenteesData();
  }, [fetchMenteesData]);

  // Real-time synchronization via SSE
  const sseUrl = getSSEConnectUrl();
  useSSE(sseUrl, (event) => {
    if (event?.event === 'APPROVAL_UPDATED' || event?.event === 'BATCH_CLOSED') {
      fetchMenteesData(true);
    }
  });

  // Handle single approval
  const handleApprove = async (approvalId, studentName) => {
    if (!approvalId) return;
    setActionInProgress((prev) => ({ ...prev, [approvalId]: true }));
    try {
      await approveRecord(approvalId);
      toast.success(`Mentor clearance approved for ${studentName}`);
      await fetchMenteesData(true);
      if (inspectModalOpen && clearanceData) {
        handleInspectClearance(selectedStudentId);
      }
    } catch (err) {
      console.error('Approval failed:', err);
      toast.error(err?.response?.data?.message || 'Failed to approve clearance');
    } finally {
      setActionInProgress((prev) => ({ ...prev, [approvalId]: false }));
    }
  };

  // Handle direct clear due
  const handleClearDue = async (approvalId, studentName) => {
    if (!approvalId) return;
    setActionInProgress((prev) => ({ ...prev, [approvalId]: true }));
    try {
      await updateApproval(approvalId, { action: 'approved' });
      toast.success(`Due cleared & approved for ${studentName}`);
      await fetchMenteesData(true);
      if (inspectModalOpen && clearanceData) {
        handleInspectClearance(selectedStudentId);
      }
    } catch (err) {
      console.error('Clear due failed:', err);
      toast.error(err?.response?.data?.message || 'Failed to clear due');
    } finally {
      setActionInProgress((prev) => ({ ...prev, [approvalId]: false }));
    }
  };

  // Open mark due modal
  const openMarkDueModal = (mentee) => {
    if (!mentee?.mentorApproval?._id) return;
    setDueTarget({
      approvalId: mentee.mentorApproval._id,
      studentId: mentee._id,
      studentName: mentee.name,
      rollNo: mentee.rollNo,
    });
    setDueType('lab');
    setDueRemarks('');
    setDueAmount('');
    setDueModalOpen(true);
  };

  // Submit mark due
  const handleSubmitMarkDue = async (e) => {
    e.preventDefault();
    if (!dueTarget?.approvalId) return;
    if (!dueRemarks.trim()) {
      toast.error('Remarks are mandatory for flagging a due');
      return;
    }

    setDueSubmitting(true);
    try {
      await markDueRecord({
        approvalId: dueTarget.approvalId,
        dueType,
        remarks: dueRemarks.trim(),
        amount: dueAmount ? Number(dueAmount) : 0,
      });
      toast.success(`Due flagged for ${dueTarget.studentName}`);
      setDueModalOpen(false);
      await fetchMenteesData(true);
      if (inspectModalOpen && clearanceData) {
        handleInspectClearance(selectedStudentId);
      }
    } catch (err) {
      console.error('Mark due failed:', err);
      toast.error(err?.response?.data?.message || 'Failed to flag due');
    } finally {
      setDueSubmitting(false);
    }
  };

  // Bulk Approve Selected
  const handleBulkApprove = async () => {
    const validApprovalIds = mentees
      .filter((m) => selectedIds.has(m._id) && m.isMyActionPending && m.mentorApproval?._id)
      .map((m) => m.mentorApproval._id);

    if (!validApprovalIds.length) {
      toast.error('No pending mentor sign-offs selected');
      return;
    }

    setIsBulkSubmitting(true);
    try {
      await bulkApproveRecords(validApprovalIds);
      toast.success(`Approved mentor clearance for ${validApprovalIds.length} mentees`);
      setSelectedIds(new Set());
      await fetchMenteesData(true);
    } catch (err) {
      console.error('Bulk approve failed:', err);
      toast.error(err?.response?.data?.message || 'Bulk approval failed');
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  // Inspect student clearance details
  const handleInspectClearance = async (studentId) => {
    setSelectedStudentId(studentId);
    setInspectModalOpen(true);
    setClearanceLoading(true);
    try {
      const res = await getMenteeClearance(studentId);
      setClearanceData(res?.data?.data || res?.data || null);
    } catch (err) {
      console.error('Failed to load clearance details:', err);
      toast.error('Failed to load student clearance breakdown');
    } finally {
      setClearanceLoading(false);
    }
  };

  // Toggle selection
  const toggleSelectMentee = (studentId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const eligibleForBulk = useMemo(() => {
    return mentees.filter((m) => m.isMyActionPending && m.mentorApproval?._id && !m.batchInfo?.isClosed);
  }, [mentees]);

  const toggleSelectAll = () => {
    if (selectedIds.size === eligibleForBulk.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleForBulk.map((m) => m._id)));
    }
  };

  // Export Mentees to CSV (RFC 4180 Compliant)
  const handleExportCSV = () => {
    if (!mentees.length) {
      toast.error('No mentees data to export');
      return;
    }

    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const headers = [
      'Roll No',
      'Student Name',
      'Email',
      'Class / Section',
      'Semester',
      'Academic Year',
      'Mentor Approval Status',
      'Mentor Due Remarks',
      'Overall Status',
      'Approvals Completed',
      'Total Approvals',
      'External Blockers',
    ];

    const rows = mentees.map((m) => {
      const blockersText = m.blockers
        .filter((b) => !b.isSelf)
        .map((b) => `${b.subjectName}: ${b.remarks}`)
        .join('; ');

      return [
        escapeCsv(m.rollNo),
        escapeCsv(m.name),
        escapeCsv(m.email),
        escapeCsv(m.className),
        escapeCsv(m.semester),
        escapeCsv(m.academicYear),
        escapeCsv(m.mentorApproval?.action?.toUpperCase() || 'NO APPROVAL'),
        escapeCsv(m.mentorApproval?.remarks),
        escapeCsv(m.overallStatus?.toUpperCase()),
        m.stats?.approved || 0,
        m.stats?.total || 0,
        escapeCsv(blockersText),
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Mentee_Clearance_Roster_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Mentee clearance report downloaded');
  };

  return (
    <PageWrapper title="Mentoring Portal" subtitle="Oversight & clearance tracking for your assigned mentees">
      <div className="space-y-6 max-w-7xl mx-auto pb-16">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-navy via-indigo-950 to-navy rounded-2xl p-6 lg:p-8 text-white shadow-xl relative overflow-hidden border border-white/10">
          <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs font-medium text-indigo-200 border border-white/10 backdrop-blur-sm">
                <Users className="w-3.5 h-3.5 text-gold" />
                <span>Mentorship & Academic Advisory Hub</span>
              </div>
              <h1 className="text-2xl lg:text-3xl font-brand font-bold text-white tracking-tight">
                Mentee Clearance Oversight
              </h1>
              <p className="text-sm text-indigo-200/80 max-w-2xl leading-relaxed">
                Track and approve your assigned students across active clearance cycles, advise mentees with external dues, and verify graduation eligibility.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchMenteesData(true)}
                disabled={loading || refreshing}
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Sync
              </Button>
              <Button
                size="sm"
                onClick={handleExportCSV}
                className="bg-gold hover:bg-amber-500 text-navy font-semibold shadow-md"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Metric KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
          <div
            onClick={() => setStatusFilter('all')}
            className={`cursor-pointer bg-white p-4 rounded-xl border transition-all duration-200 ${
              statusFilter === 'all'
                ? 'border-indigo-600 shadow-md ring-1 ring-indigo-600'
                : 'border-slate-200 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">Total Mentees</p>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{summary.total}</p>
            <p className="text-[11px] text-slate-400 mt-1">Assigned to you</p>
          </div>

          <div
            onClick={() => setStatusFilter('pending_my_approval')}
            className={`cursor-pointer bg-white p-4 rounded-xl border transition-all duration-200 ${
              statusFilter === 'pending_my_approval'
                ? 'border-amber-500 shadow-md ring-1 ring-amber-500'
                : 'border-slate-200 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">Action Required</p>
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-amber-600 mt-2">{summary.pendingMyApproval}</p>
            <p className="text-[11px] text-slate-400 mt-1">Awaiting mentor sign-off</p>
          </div>

          <div
            onClick={() => setStatusFilter('my_due_marked')}
            className={`cursor-pointer bg-white p-4 rounded-xl border transition-all duration-200 ${
              statusFilter === 'my_due_marked'
                ? 'border-rose-500 shadow-md ring-1 ring-rose-500'
                : 'border-slate-200 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">My Dues Flagged</p>
              <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-rose-600 mt-2">{summary.myDuesFlagged}</p>
            <p className="text-[11px] text-slate-400 mt-1">Deficiencies marked by you</p>
          </div>

          <div
            onClick={() => setStatusFilter('blocked_elsewhere')}
            className={`cursor-pointer bg-white p-4 rounded-xl border transition-all duration-200 ${
              statusFilter === 'blocked_elsewhere'
                ? 'border-purple-500 shadow-md ring-1 ring-purple-500'
                : 'border-slate-200 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">External Dues</p>
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-purple-600 mt-2">{summary.blockedElsewhere}</p>
            <p className="text-[11px] text-slate-400 mt-1">Blocked by other depts</p>
          </div>

          <div
            onClick={() => setStatusFilter('overall_cleared')}
            className={`cursor-pointer bg-white p-4 rounded-xl border transition-all duration-200 ${
              statusFilter === 'overall_cleared'
                ? 'border-emerald-500 shadow-md ring-1 ring-emerald-500'
                : 'border-slate-200 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">100% Cleared</p>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-emerald-600 mt-2">{summary.fullyCleared}</p>
            <p className="text-[11px] text-slate-400 mt-1">All approvals completed</p>
          </div>
        </div>

        {/* Controls: Search, Class Filter, Tabs */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search mentees by roll number, student name, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="w-full md:w-64">
              <SearchableSelect
                options={[
                  { value: 'all', label: 'All Classes / Sections' },
                  ...classes.map((c) => ({
                    value: c._id,
                    label: `${c.name} (Sem ${c.semester || '-'})`,
                  })),
                ]}
                value={selectedClass}
                onChange={(val) => setSelectedClass(val || 'all')}
                placeholder="Filter by Class..."
              />
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-navy text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Mentees ({summary.total})
            </button>
            <button
              onClick={() => setStatusFilter('pending_my_approval')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                statusFilter === 'pending_my_approval'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              <Clock className="w-3 h-3" />
              Action Required ({summary.pendingMyApproval})
            </button>
            <button
              onClick={() => setStatusFilter('my_due_marked')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                statusFilter === 'my_due_marked'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              <AlertCircle className="w-3 h-3" />
              My Dues ({summary.myDuesFlagged})
            </button>
            <button
              onClick={() => setStatusFilter('blocked_elsewhere')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                statusFilter === 'blocked_elsewhere'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
              }`}
            >
              <ShieldAlert className="w-3 h-3" />
              Blocked Elsewhere ({summary.blockedElsewhere})
            </button>
            <button
              onClick={() => setStatusFilter('overall_cleared')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                statusFilter === 'overall_cleared'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              100% Cleared ({summary.fullyCleared})
            </button>
          </div>
        </div>

        {/* Mentees Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-16 flex flex-col items-center justify-center gap-3">
              <Spinner className="w-8 h-8 text-indigo-600" />
              <p className="text-sm text-slate-500 font-medium">Loading assigned mentees...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">Failed to Load Mentees</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">{error}</p>
              <Button onClick={() => fetchMenteesData()} variant="outline" size="sm">
                Try Again
              </Button>
            </div>
          ) : mentees.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">No Mentees Found</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                {search || selectedClass !== 'all' || statusFilter !== 'all'
                  ? 'No mentees match the current filter criteria. Try adjusting your search or filters.'
                  : 'You do not have any students assigned as mentees in the directory yet. Mentees are assigned by the department administrator or HoD.'}
              </p>
              {(search || selectedClass !== 'all' || statusFilter !== 'all') && (
                <Button
                  onClick={() => {
                    setSearch('');
                    setSelectedClass('all');
                    setStatusFilter('all');
                  }}
                  variant="outline"
                  size="sm"
                >
                  Reset Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={eligibleForBulk.length > 0 && selectedIds.size === eligibleForBulk.length}
                        onChange={toggleSelectAll}
                        disabled={eligibleForBulk.length === 0}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                      />
                    </th>
                    <th className="py-3.5 px-4">Student Profile</th>
                    <th className="py-3.5 px-4">Class & Section</th>
                    <th className="py-3.5 px-4">Mentor Sign-Off</th>
                    <th className="py-3.5 px-4">Overall Clearance</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mentees.map((mentee) => {
                    const isPending = mentee.isMyActionPending;
                    const isDue = mentee.isMyDueFlagged;
                    const isApproved = mentee.mentorApproval?.action === 'approved';
                    const hasAction = actionInProgress[mentee.mentorApproval?._id];
                    const isSelected = selectedIds.has(mentee._id);

                    return (
                      <tr
                        key={mentee._id}
                        className={`transition-colors hover:bg-slate-50/70 ${
                          isSelected ? 'bg-indigo-50/40' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-4 px-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectMentee(mentee._id)}
                            disabled={!isPending || mentee.batchInfo?.isClosed}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          />
                        </td>

                        {/* Student Details */}
                        <td className="py-4 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-navy bg-navy/5 px-2 py-0.5 rounded border border-navy/10">
                                {mentee.rollNo}
                              </span>
                              <span className="font-semibold text-slate-900">{mentee.name}</span>
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-2">
                              {mentee.email && (
                                <a
                                  href={`mailto:${mentee.email}`}
                                  className="hover:text-indigo-600 inline-flex items-center gap-1"
                                >
                                  <Mail className="w-3 h-3 text-slate-400" />
                                  <span>{mentee.email}</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Class */}
                        <td className="py-4 px-4">
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                              {mentee.className}
                            </span>
                            <p className="text-[11px] text-slate-400">
                              Sem {mentee.semester || '-'} • {mentee.academicYear || '-'}
                            </p>
                          </div>
                        </td>

                        {/* Mentor Sign-off Status */}
                        <td className="py-4 px-4">
                          {!mentee.hasActiveBatch ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              No Active Cycle
                            </span>
                          ) : isPending ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              Pending Sign-off
                            </span>
                          ) : isApproved ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Approved
                            </span>
                          ) : isDue ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                                Due Flagged
                              </span>
                              {mentee.mentorApproval?.remarks && (
                                <p className="text-[11px] text-rose-600 font-medium truncate max-w-[200px]" title={mentee.mentorApproval.remarks}>
                                  {mentee.mentorApproval.remarks}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Not Initiated</span>
                          )}
                        </td>

                        {/* Overall Clearance Status & Progress */}
                        <td className="py-4 px-4">
                          <div className="space-y-1.5 w-48">
                            <div className="flex items-center justify-between text-xs">
                              <span
                                className={`font-semibold ${
                                  mentee.overallStatus === 'cleared'
                                    ? 'text-emerald-600'
                                    : mentee.overallStatus === 'has_dues'
                                    ? 'text-rose-600'
                                    : 'text-amber-600'
                                }`}
                              >
                                {mentee.overallStatus === 'cleared'
                                  ? '100% Cleared'
                                  : mentee.overallStatus === 'has_dues'
                                  ? `Has Dues (${mentee.stats?.due})`
                                  : 'In Progress'}
                              </span>
                              <span className="text-slate-400 text-[11px]">
                                {mentee.stats?.approved}/{mentee.stats?.total}
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full transition-all duration-500 ${
                                  mentee.overallStatus === 'cleared'
                                    ? 'bg-emerald-500'
                                    : mentee.overallStatus === 'has_dues'
                                    ? 'bg-rose-500'
                                    : 'bg-indigo-600'
                                }`}
                                style={{ width: `${mentee.stats?.percent || 0}%` }}
                              />
                            </div>

                            {/* Blockers indicator */}
                            {mentee.blockers && mentee.blockers.some((b) => !b.isSelf) && (
                              <p className="text-[10px] text-purple-600 font-medium flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3 text-purple-500 shrink-0" />
                                <span>{mentee.blockers.filter((b) => !b.isSelf).length} external due(s) pending</span>
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            {/* Direct Mentor Actions */}
                            {mentee.batchInfo?.isClosed ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                Cycle Closed
                              </span>
                            ) : isPending && mentee.mentorApproval?._id ? (
                              <>
                                <button
                                  onClick={() => handleApprove(mentee.mentorApproval._id, mentee.name)}
                                  disabled={hasAction}
                                  title="Approve Mentor Clearance"
                                  className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
                                >
                                  {hasAction ? (
                                    <Spinner className="w-4 h-4 text-emerald-600" />
                                  ) : (
                                    <Check className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => openMarkDueModal(mentee)}
                                  disabled={hasAction}
                                  title="Flag a Deficiency / Due"
                                  className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors disabled:opacity-50"
                                >
                                  <AlertCircle className="w-4 h-4" />
                                </button>
                              </>
                            ) : isDue && mentee.mentorApproval?._id ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleClearDue(mentee.mentorApproval._id, mentee.name)}
                                disabled={hasAction}
                                className="text-xs h-7 px-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                              >
                                {hasAction ? <Spinner className="w-3 h-3 mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                                Clear Due
                              </Button>
                            ) : null}

                            {/* View Full Clearance Card */}
                            <button
                              onClick={() => handleInspectClearance(mentee._id)}
                              title="Inspect Full Clearance Breakdown"
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 border border-slate-200 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Floating Bulk Action Bar */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-4 z-40 border border-slate-700 backdrop-blur-md"
            >
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center">
                  {selectedIds.size}
                </span>
                <span className="text-sm font-medium">Mentees selected for sign-off</span>
              </div>

              <div className="h-4 w-px bg-slate-700" />

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleBulkApprove}
                  disabled={isBulkSubmitting}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium"
                >
                  {isBulkSubmitting ? (
                    <Spinner className="w-4 h-4 mr-1.5 text-white" />
                  ) : (
                    <Check className="w-4 h-4 mr-1.5" />
                  )}
                  Approve Selected ({selectedIds.size})
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-slate-400 hover:text-white"
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal: Full Student Clearance Breakdown */}
        <Modal
          isOpen={inspectModalOpen}
          onClose={() => {
            setInspectModalOpen(false);
            setClearanceData(null);
          }}
          title="Mentee Clearance Breakdown"
          size="xl"
        >
          {clearanceLoading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3">
              <Spinner className="w-8 h-8 text-indigo-600" />
              <p className="text-sm text-slate-500">Retrieving clearance card & audit details...</p>
            </div>
          ) : !clearanceData ? (
            <div className="p-8 text-center text-slate-500">No clearance records found for this student.</div>
          ) : (
            <div className="space-y-6">
              {/* Mentee Header Card */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-navy bg-white px-2.5 py-0.5 rounded border border-slate-200">
                      {clearanceData.student?.rollNo}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900">{clearanceData.student?.name}</h3>
                  </div>
                  <p className="text-xs text-slate-500">
                    {clearanceData.student?.departmentId?.name} • {clearanceData.student?.classId?.name} (Sem{' '}
                    {clearanceData.student?.semester || clearanceData.student?.classId?.semester})
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      clearanceData.request?.status === 'cleared'
                        ? 'bg-emerald-100 text-emerald-800'
                        : clearanceData.summary?.due > 0
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {clearanceData.request?.status?.toUpperCase() || 'IN PROGRESS'}
                  </span>
                </div>
              </div>

              {/* Progress Summary */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-xs text-slate-500">Total Checks</p>
                  <p className="text-xl font-bold text-slate-900 mt-0.5">{clearanceData.summary?.total || 0}</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <p className="text-xs text-emerald-700">Approved</p>
                  <p className="text-xl font-bold text-emerald-700 mt-0.5">{clearanceData.summary?.approved || 0}</p>
                </div>
                <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
                  <p className="text-xs text-rose-700">Dues Flagged</p>
                  <p className="text-xl font-bold text-rose-700 mt-0.5">{clearanceData.summary?.due || 0}</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-xs text-amber-700">Pending</p>
                  <p className="text-xl font-bold text-amber-700 mt-0.5">{clearanceData.summary?.pending || 0}</p>
                </div>
              </div>

              {/* Clearance Approvals List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Required Clearance Checkpoints
                </h4>

                {clearanceData.approvals && clearanceData.approvals.length > 0 ? (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {clearanceData.approvals.map((approval) => {
                      const isDue = approval.action === 'due_marked';
                      const isApproved = approval.action === 'approved';
                      const isPending = approval.action === 'pending' || approval.action === 'not_submitted';

                      return (
                        <div
                          key={approval._id}
                          className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm ${
                            isDue ? 'bg-rose-50/50' : 'bg-white'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">
                                {approval.subjectName ||
                                  (approval.approvalType === 'classTeacher'
                                    ? 'Class Teacher'
                                    : approval.approvalType === 'mentor'
                                    ? 'Mentor Sign-Off'
                                    : approval.approvalType === 'hodApproval'
                                    ? 'Head of Department'
                                    : approval.approvalType)}
                              </span>
                              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                                {approval.approvalType}
                              </span>
                            </div>

                            <p className="text-xs text-slate-500">
                              Faculty: {approval.facultyId?.name || 'Assigned Staff'}
                            </p>

                            {/* Dues description if marked */}
                            {isDue && (
                              <div className="p-2 bg-rose-50 rounded border border-rose-200 text-xs text-rose-800 space-y-0.5 mt-1">
                                <p className="font-semibold flex items-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                                  Due Reason: {approval.remarks || 'Deficiency reported'}
                                </p>
                                {approval.amount > 0 && <p className="text-[11px]">Due Amount: ₹{approval.amount}</p>}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isApproved ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                <Check className="w-3.5 h-3.5" />
                                Approved
                              </span>
                            ) : isDue ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                                <AlertCircle className="w-3.5 h-3.5" />
                                Has Due
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                <Clock className="w-3.5 h-3.5" />
                                Pending
                              </span>
                            )}

                            {/* If this is the mentor approval and it's pending, allow instant approval if batch is not closed */}
                            {approval.approvalType === 'mentor' && isPending && (
                              clearanceData.batch?.isClosed ? (
                                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                  Batch Closed
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => handleApprove(approval._id, clearanceData.student?.name)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-2"
                                >
                                  <Check className="w-3.5 h-3.5 mr-1" />
                                  Approve
                                </Button>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl">
                    <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-700">No Active Clearance Cycle</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      No official clearance batch has been initiated for this student yet. Checkpoints will populate once the semester batch is published.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>

        {/* Modal: Mark Due on Mentee */}
        <Modal
          isOpen={dueModalOpen}
          onClose={() => setDueModalOpen(false)}
          title={`Flag Due for ${dueTarget?.studentName || 'Mentee'}`}
        >
          <form onSubmit={handleSubmitMarkDue} className="space-y-4">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Deficiency Flagging Protocol
              </p>
              <p>
                Marking a due blocks this student from obtaining final institutional clearance until the deficiency is resolved and cleared.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Due Classification</label>
              <select
                value={dueType}
                onChange={(e) => setDueType(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                {DUE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Reason / Deficiency Remarks <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="Specify the book title, lab component, or academic task required..."
                value={dueRemarks}
                onChange={(e) => setDueRemarks(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Due Amount (₹, optional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">₹</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={dueAmount}
                  onChange={(e) => setDueAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setDueModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={dueSubmitting || !dueRemarks.trim()}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {dueSubmitting ? <Spinner className="w-4 h-4 mr-1.5 text-white" /> : <AlertCircle className="w-4 h-4 mr-1.5" />}
                Confirm Due
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </PageWrapper>
  );
};

export default Mentoring;
