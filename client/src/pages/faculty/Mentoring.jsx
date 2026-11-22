import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Download,
  Check,
  X,
  RefreshCw,
  Eye,
  AlertCircle,
  BookOpen,
  Layers,
  Lock,
  Filter,
  Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import PageWrapper from '../../components/layout/PageWrapper';
import Table from '../../components/ui/Table';
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

const FILTERS = [
  { key: 'all', label: 'All', icon: Layers },
  { key: 'pending_my_approval', label: 'Pending', icon: Clock },
  { key: 'my_due_marked', label: 'Dues', icon: AlertCircle },
  { key: 'blocked_elsewhere', label: 'External Dues', icon: ShieldAlert },
  { key: 'overall_cleared', label: 'Cleared', icon: CheckCircle2 },
];

const getApprovalLabel = (a) => {
  if (a.approvalType === 'classTeacher') return 'Class Teacher';
  if (a.approvalType === 'mentor') return 'Mentor Sign-Off';
  if (a.approvalType === 'hodApproval') return 'Head of Department';
  if (a.approvalType === 'coCurricular') return a.itemTypeName || a.subjectName || 'Co-Curricular';
  const code = a.subjectCode || null;
  return a.subjectName ? `${a.subjectName}${code ? ` (${code})` : ''}` : a.approvalType || '—';
};

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
  const [filter, setFilter] = useState('all'); // 'all' | 'pending_my_approval' | 'my_due_marked' | 'blocked_elsewhere' | 'overall_cleared'

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Selection for bulk actions
  const [selection, setSelection] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);

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

  const fetchMenteesData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const params = {};
      if (selectedClass !== 'all') params.classId = selectedClass;
      if (filter !== 'all') params.status = filter;
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
  }, [selectedClass, filter, debouncedSearch]);

  useEffect(() => {
    fetchMenteesData();
  }, [fetchMenteesData]);

  // Real-time synchronization via SSE
  const sseUrl = getSSEConnectUrl();
  const sseEvents = useMemo(() => ['APPROVAL_UPDATED', 'BATCH_CLOSED', 'PENDING_LIST_UPDATE'], []);
  useSSE(sseUrl, (event) => {
    if (event?.event === 'APPROVAL_UPDATED' || event?.event === 'BATCH_CLOSED' || event?.event === 'PENDING_LIST_UPDATE') {
      fetchMenteesData(true);
    }
  }, sseEvents);

  // Handle single approval with optimistic update and instant Undo option
  const handleApprove = async (approvalId, studentName) => {
    if (!approvalId) return;
    setActionLoading(approvalId);

    // Optimistic in-place update
    setMentees((prev) =>
      prev.map((m) => {
        if (m.mentorApproval?._id === approvalId) {
          const updatedStats = {
            ...m.stats,
            approved: (m.stats?.approved || 0) + (m.mentorApproval.action !== 'approved' ? 1 : 0),
            pending: Math.max(0, (m.stats?.pending || 0) - (m.mentorApproval.action === 'pending' || m.mentorApproval.action === 'not_submitted' ? 1 : 0)),
          };
          updatedStats.percent = updatedStats.total > 0 ? Math.round((updatedStats.approved / updatedStats.total) * 100) : 100;
          return {
            ...m,
            isMyActionPending: false,
            isMyDueFlagged: false,
            mentorApproval: {
              ...m.mentorApproval,
              action: 'approved',
              dueType: null,
              remarks: null,
            },
            stats: updatedStats,
            overallStatus: updatedStats.approved === updatedStats.total ? 'cleared' : m.overallStatus,
          };
        }
        return m;
      })
    );

    try {
      await approveRecord(approvalId);
      toast((t) => (
        <div className="flex items-center justify-between gap-4 w-full">
          <span className="font-medium flex items-center gap-1.5 text-xs text-zinc-900">
            <Check size={16} className="text-emerald-500 shrink-0" />
            <span>Approval recorded for {studentName}</span>
          </span>
          <button
            onClick={() => {
              toast.dismiss(t.id);
              handleResetToPending(approvalId, studentName);
            }}
            className="text-[10px] font-black uppercase tracking-widest bg-zinc-100 hover:bg-zinc-200 text-zinc-600 px-3 py-1.5 rounded-lg transition-colors border border-zinc-200 shrink-0"
          >
            Undo
          </button>
        </div>
      ), { duration: 5000, id: `approve-${approvalId}` });

      await fetchMenteesData(true);
      if (inspectModalOpen && clearanceData) {
        handleInspectClearance(selectedStudentId);
      }
    } catch (err) {
      console.error('Approval failed:', err);
      toast.error(err?.response?.data?.message || 'Failed to approve clearance');
      await fetchMenteesData(true);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle direct clear due with optimistic update
  const handleClearDue = async (approvalId, studentName) => {
    if (!approvalId) return;
    setActionLoading(approvalId);

    setMentees((prev) =>
      prev.map((m) => {
        if (m.mentorApproval?._id === approvalId) {
          const updatedStats = {
            ...m.stats,
            approved: (m.stats?.approved || 0) + 1,
            due: Math.max(0, (m.stats?.due || 0) - 1),
          };
          updatedStats.percent = updatedStats.total > 0 ? Math.round((updatedStats.approved / updatedStats.total) * 100) : 100;
          return {
            ...m,
            isMyActionPending: false,
            isMyDueFlagged: false,
            mentorApproval: {
              ...m.mentorApproval,
              action: 'approved',
              dueType: null,
              remarks: null,
            },
            stats: updatedStats,
            overallStatus: updatedStats.approved === updatedStats.total ? 'cleared' : m.overallStatus,
          };
        }
        return m;
      })
    );

    try {
      await updateApproval(approvalId, { action: 'approved', dueType: null, remarks: null });
      toast.success(`Deficiency cleared & approved for ${studentName}`);
      await fetchMenteesData(true);
      if (inspectModalOpen && clearanceData) {
        handleInspectClearance(selectedStudentId);
      }
    } catch (err) {
      console.error('Clear due failed:', err);
      toast.error(err?.response?.data?.message || 'Failed to clear due');
      await fetchMenteesData(true);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle reset back to pending with optimistic update
  const handleResetToPending = async (approvalId, studentName) => {
    if (!approvalId) return;
    setActionLoading(approvalId);

    setMentees((prev) =>
      prev.map((m) => {
        if (m.mentorApproval?._id === approvalId) {
          const wasApproved = m.mentorApproval.action === 'approved';
          const wasDue = m.mentorApproval.action === 'due_marked';
          const updatedStats = {
            ...m.stats,
            approved: Math.max(0, (m.stats?.approved || 0) - (wasApproved ? 1 : 0)),
            due: Math.max(0, (m.stats?.due || 0) - (wasDue ? 1 : 0)),
            pending: (m.stats?.pending || 0) + 1,
          };
          updatedStats.percent = updatedStats.total > 0 ? Math.round((updatedStats.approved / updatedStats.total) * 100) : 0;
          return {
            ...m,
            isMyActionPending: true,
            isMyDueFlagged: false,
            mentorApproval: {
              ...m.mentorApproval,
              action: 'pending',
              dueType: null,
              remarks: null,
            },
            stats: updatedStats,
            overallStatus: 'pending',
          };
        }
        return m;
      })
    );

    try {
      await updateApproval(approvalId, { action: 'pending', dueType: null, remarks: null });
      toast.success(`Action reversed for ${studentName}`);
      await fetchMenteesData(true);
      if (inspectModalOpen && clearanceData) {
        handleInspectClearance(selectedStudentId);
      }
    } catch (err) {
      console.error('Reset failed:', err);
      toast.error(err?.response?.data?.message || 'Failed to reset approval');
      await fetchMenteesData(true);
    } finally {
      setActionLoading(null);
    }
  };

  // Open mark due modal (callable from table row or inspection breakdown modal)
  const openMarkDueModal = (target) => {
    if (!target) return;
    const approvalId = target.mentorApproval?._id || target.approvalId;
    if (!approvalId) return;

    setDueTarget({
      approvalId,
      studentId: target._id || target.studentId,
      studentName: target.name || target.studentName,
      rollNo: target.rollNo || target.studentRollNo,
    });
    setDueType('lab');
    setDueRemarks('');
    setDueAmount('');
    setDueModalOpen(true);
  };

  // Submit mark due with optimistic update
  const handleSubmitMarkDue = async (e) => {
    e.preventDefault();
    if (!dueTarget?.approvalId) return;
    if (!dueRemarks.trim()) {
      toast.error('Remarks are mandatory for flagging a due');
      return;
    }

    setDueSubmitting(true);
    const targetApprovalId = dueTarget.approvalId;
    const targetStudentName = dueTarget.studentName;
    const remarksVal = dueRemarks.trim();
    const typeVal = dueType;
    const amountVal = dueAmount ? Number(dueAmount) : 0;

    // Optimistic in-place update
    setMentees((prev) =>
      prev.map((m) => {
        if (m.mentorApproval?._id === targetApprovalId) {
          const wasPending = m.mentorApproval.action === 'pending' || m.mentorApproval.action === 'not_submitted';
          const wasApproved = m.mentorApproval.action === 'approved';
          const updatedStats = {
            ...m.stats,
            approved: Math.max(0, (m.stats?.approved || 0) - (wasApproved ? 1 : 0)),
            pending: Math.max(0, (m.stats?.pending || 0) - (wasPending ? 1 : 0)),
            due: (m.stats?.due || 0) + 1,
          };
          updatedStats.percent = updatedStats.total > 0 ? Math.round((updatedStats.approved / updatedStats.total) * 100) : 0;
          return {
            ...m,
            isMyActionPending: false,
            isMyDueFlagged: true,
            mentorApproval: {
              ...m.mentorApproval,
              action: 'due_marked',
              dueType: typeVal,
              remarks: remarksVal,
              amount: amountVal,
            },
            stats: updatedStats,
            overallStatus: 'has_dues',
          };
        }
        return m;
      })
    );
    setDueModalOpen(false);

    try {
      await markDueRecord({
        approvalId: targetApprovalId,
        dueType: typeVal,
        remarks: remarksVal,
        amount: amountVal,
      });
      toast.success(`Deficiency flagged for ${targetStudentName}`);
      await fetchMenteesData(true);
      if (inspectModalOpen && clearanceData) {
        handleInspectClearance(selectedStudentId);
      }
    } catch (err) {
      console.error('Mark due failed:', err);
      toast.error(err?.response?.data?.message || 'Failed to flag due');
      await fetchMenteesData(true);
    } finally {
      setDueSubmitting(false);
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
      const blockersText = (m.blockers || [])
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
    link.setAttribute('download', `Mentee_Clearance_List_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Mentee clearance report downloaded');
  };

  const isRowSelectable = useCallback((row) => {
    return Boolean(
      row.mentorApproval?._id &&
      (row.isMyActionPending || row.mentorApproval?.action === 'pending' || row.mentorApproval?.action === 'not_submitted') &&
      !row.batchInfo?.isClosed
    );
  }, []);

  const eligibleForBulk = useMemo(() => {
    return mentees.filter(isRowSelectable);
  }, [mentees, isRowSelectable]);

  // Bulk actions list for Table component
  const bulkActionsList = useMemo(() => {
    const eligibleSelected = mentees.filter(
      (m) => selection.includes(m._id) && isRowSelectable(m)
    );

    if (!eligibleSelected.length) return [];

    return [
      {
        label: `Approve Selected (${eligibleSelected.length})`,
        icon: Check,
        onClick: async () => {
          const approvalIds = eligibleSelected.map((m) => m.mentorApproval._id);
          const studentIds = new Set(eligibleSelected.map((m) => m._id));
          setActionLoading('bulk');

          // Optimistic update for all selected students
          setMentees((prev) =>
            prev.map((m) => {
              if (studentIds.has(m._id) && m.mentorApproval) {
                const updatedStats = {
                  ...m.stats,
                  approved: (m.stats?.approved || 0) + (m.mentorApproval.action !== 'approved' ? 1 : 0),
                  pending: Math.max(0, (m.stats?.pending || 0) - 1),
                };
                updatedStats.percent = updatedStats.total > 0 ? Math.round((updatedStats.approved / updatedStats.total) * 100) : 100;
                return {
                  ...m,
                  isMyActionPending: false,
                  mentorApproval: {
                    ...m.mentorApproval,
                    action: 'approved',
                    dueType: null,
                    remarks: null,
                  },
                  stats: updatedStats,
                  overallStatus: updatedStats.approved === updatedStats.total ? 'cleared' : m.overallStatus,
                };
              }
              return m;
            })
          );
          setSelection([]);

          try {
            await bulkApproveRecords(approvalIds);
            toast.success(`Approved mentor clearance for ${approvalIds.length} students`);
            await fetchMenteesData(true);
          } catch (err) {
            console.error('Bulk approve failed:', err);
            toast.error(err?.response?.data?.message || 'Bulk approval failed');
            await fetchMenteesData(true);
          } finally {
            setActionLoading(null);
          }
        },
        variant: 'primary'
      }
    ];
  }, [selection, mentees, isRowSelectable, fetchMenteesData]);

  // Table Columns Definition matching Pending.jsx exactly
  const columns = useMemo(() => [
    {
      key: 'rollNo',
      label: 'Roll No',
      sortable: true,
      render: (v) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-900/[0.04] text-zinc-900 border border-zinc-900/10 font-mono text-xs sm:text-sm font-black tracking-widest">
          {v || '—'}
        </span>
      ),
    },
    {
      key: 'name',
      label: 'Student Name',
      sortable: true,
      render: (v, row) => (
        <div className="flex flex-col">
          <span className="font-bold text-xs sm:text-sm text-zinc-900">{v || '—'}</span>
          {row.email && (
            <span className="text-[11px] text-zinc-400 font-medium truncate max-w-[190px]">
              {row.email}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'className',
      label: 'Class',
      sortable: true,
      render: (v, row) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-zinc-600 font-medium text-xs">{v || '—'}</span>
          <span className="text-[10px] text-zinc-400">
            {row.academicYear || ''} {row.semester ? `· Sem ${row.semester}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'mentorApproval',
      label: 'Mentor Status',
      render: (_, row) => {
        const isClosed = row.batchInfo?.isClosed;
        const isPending = row.isMyActionPending || (row.mentorApproval && (row.mentorApproval.action === 'pending' || row.mentorApproval.action === 'not_submitted'));
        const isDue = row.isMyDueFlagged || row.mentorApproval?.action === 'due_marked';
        const isApproved = row.mentorApproval?.action === 'approved';

        if (isClosed) {
          return (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-400 text-[10px] font-bold uppercase tracking-wider border border-zinc-200/60">
                <Lock size={10} /> Closed
              </span>
            </div>
          );
        }

        if (isDue) {
          return (
            <div className="flex flex-col gap-0.5">
              <Badge status="due_marked">Due Marked</Badge>
              {row.mentorApproval?.remarks && (
                <span className="text-[10px] font-bold text-red-500 truncate max-w-[180px]" title={row.mentorApproval.remarks}>
                  {row.mentorApproval.remarks}
                </span>
              )}
            </div>
          );
        }

        if (isApproved) {
          return <Badge status="approved">Approved</Badge>;
        }

        if (isPending) {
          return <Badge status="pending">Action Required</Badge>;
        }

        return <Badge status="not_submitted">Not Initiated</Badge>;
      }
    },
    {
      key: 'overallStatus',
      label: 'Institution Clearance',
      render: (_, row) => {
        const externalBlockers = (row.blockers || []).filter((b) => !b.isSelf);
        const isCleared = row.overallStatus === 'cleared';
        const hasDues = row.overallStatus === 'has_dues';
        const statusKey = isCleared ? 'cleared' : hasDues ? 'has_dues' : 'pending';

        return (
          <div className="flex flex-col gap-1.5 max-w-[220px]">
            <div className="flex items-center justify-between text-xs">
              <Badge status={statusKey}>
                {isCleared ? '100% Cleared' : hasDues ? 'Has Dues' : 'In Progress'}
              </Badge>
              <span className="text-[10px] font-mono font-bold text-zinc-400">
                {row.stats?.approved || 0}/{row.stats?.total || 0}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isCleared ? 'bg-emerald-500' : hasDues ? 'bg-red-500' : 'bg-amber-500'
                }`}
                style={{ width: `${row.stats?.percent || 0}%` }}
              />
            </div>

            {/* Named External Blocker Chips */}
            {externalBlockers.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {externalBlockers.slice(0, 2).map((b, bi) => (
                  <span
                    key={bi}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200/70 truncate max-w-[105px]"
                    title={`${b.subjectName}: ${b.remarks || 'Due recorded'}`}
                  >
                    <ShieldAlert size={9} className="shrink-0 text-purple-500" />
                    <span className="truncate">{b.subjectName}</span>
                  </span>
                ))}
                {externalBlockers.length > 2 && (
                  <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1 py-0.5 rounded border border-purple-200/70">
                    +{externalBlockers.length - 2} more
                  </span>
                )}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => {
        const isActioning = actionLoading === row.mentorApproval?._id;
        const isClosed = row.batchInfo?.isClosed;
        const isPending = row.isMyActionPending || (row.mentorApproval && (row.mentorApproval.action === 'pending' || row.mentorApproval.action === 'not_submitted'));
        const isDue = row.isMyDueFlagged || row.mentorApproval?.action === 'due_marked';
        const isApproved = row.mentorApproval?.action === 'approved';

        if (isClosed) {
          return (
            <button
              onClick={(e) => { e.stopPropagation(); handleInspectClearance(row._id); }}
              className="p-1.5 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all shadow-sm"
              title="Inspect Full Clearance"
            >
              <Eye size={14} />
            </button>
          );
        }

        if (isPending && row.mentorApproval?._id) {
          return (
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); handleApprove(row.mentorApproval._id, row.name); }}
                disabled={isActioning}
                className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm disabled:opacity-50"
                title="Approve Mentor Sign-off"
              >
                {isActioning ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); openMarkDueModal(row); }}
                disabled={isActioning}
                className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm disabled:opacity-50"
                title="Mark Due / Flag Deficiency"
              >
                <X size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleInspectClearance(row._id); }}
                className="p-1.5 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all shadow-sm"
                title="Inspect Full Clearance Breakdown"
              >
                <Eye size={14} />
              </button>
            </div>
          );
        }

        if (isDue && row.mentorApproval?._id) {
          return (
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); handleClearDue(row.mentorApproval._id, row.name); }}
                disabled={isActioning}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white text-[10px] font-black uppercase tracking-wider transition-all border border-emerald-200/60 shadow-sm"
                title="Clear Deficiency & Grant Clearance"
              >
                {isActioning ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={11} />}
                Clear & Approve
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleResetToPending(row.mentorApproval._id, row.name); }}
                disabled={isActioning}
                className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 text-zinc-500 hover:bg-zinc-200 text-[10px] font-bold uppercase transition-colors"
                title="Reset back to pending"
              >
                <RefreshCw size={10} /> Reset
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleInspectClearance(row._id); }}
                className="p-1.5 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all shadow-sm"
                title="Inspect Full Clearance"
              >
                <Eye size={14} />
              </button>
            </div>
          );
        }

        if (isApproved && row.mentorApproval?._id) {
          return (
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); handleResetToPending(row.mentorApproval._id, row.name); }}
                disabled={isActioning}
                className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 text-zinc-500 hover:bg-zinc-200 text-[10px] font-bold uppercase transition-colors"
                title="Reset back to pending"
              >
                <RefreshCw size={10} /> Reset
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleInspectClearance(row._id); }}
                className="p-1.5 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all shadow-sm"
                title="Inspect Full Clearance"
              >
                <Eye size={14} />
              </button>
            </div>
          );
        }

        return (
          <button
            onClick={(e) => { e.stopPropagation(); handleInspectClearance(row._id); }}
            className="p-1.5 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all shadow-sm"
            title="Inspect Full Clearance"
          >
            <Eye size={14} />
          </button>
        );
      }
    }
  ], [actionLoading]);

  const subtitleText = useMemo(() => {
    if (summary.pendingMyApproval > 0) {
      return `${summary.total} assigned mentees · ${summary.pendingMyApproval} awaiting your sign-off`;
    }
    return `${summary.total} assigned mentees · All mentor sign-offs cleared`;
  }, [summary.total, summary.pendingMyApproval]);

  return (
    <PageWrapper 
      title="Mentoring" 
      subtitle={subtitleText}
    >
      <div className="space-y-6">
        {/* Header Filters & Controls Bar — 100% Consistent with Pending.jsx */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
          {/* Status Filters Capsule */}
          <div className="overflow-x-auto no-scrollbar pb-1">
            <div className="h-11 flex items-center gap-1 bg-white border border-zinc-100 p-1 rounded-full w-fit shadow-sm shadow-zinc-200/50">
              {FILTERS.map((f) => {
                const count = f.key === 'all' 
                  ? summary.total 
                  : f.key === 'pending_my_approval' 
                  ? summary.pendingMyApproval 
                  : f.key === 'my_due_marked' 
                  ? summary.myDuesFlagged 
                  : f.key === 'blocked_elsewhere' 
                  ? summary.blockedElsewhere 
                  : summary.fullyCleared;
                const active = filter === f.key;
                const Icon = f.icon;

                return (
                  <button
                    key={f.key}
                    onClick={() => { setFilter(f.key); setSelection([]); }}
                    className={`h-9 px-4 rounded-full text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-500 relative whitespace-nowrap inline-flex items-center gap-2.5
                      ${active ? 'text-white' : 'text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50/50'}`}
                  >
                    {active && (
                      <motion.div 
                        layoutId="activeMentoringFilter"
                        className="absolute inset-0 bg-indigo-600 shadow-[0_4px_12px_rgba(79,70,229,0.3)] rounded-full"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      <Icon size={14} className={active ? 'text-white' : 'text-zinc-400'} />
                      <span>{f.label}</span>
                      {active ? (
                        <span className="flex h-4 min-w-[16px] items-center justify-center px-1 rounded-full bg-white/20 text-[8px] font-black text-white backdrop-blur-sm">
                          {count}
                        </span>
                      ) : (
                        <span className="text-[9px] opacity-40 font-bold bg-zinc-100 px-1.5 py-0.5 rounded-md group-hover:bg-indigo-100 transition-colors">
                          {count}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right side controls: Class dropdown, Export, Refresh */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {classes.length > 1 && (
              <div className="flex-1 sm:flex-initial h-11 flex items-center gap-2 bg-white/60 backdrop-blur-sm border border-zinc-200/50 rounded-full shadow-sm hover:shadow-md transition-all group">
                <div className="pl-3.5 text-zinc-400 group-hover:text-indigo-500 transition-colors shrink-0">
                  <Filter size={14} />
                </div>
                <SearchableSelect
                  options={[
                    { value: 'all', label: 'All Classes' },
                    ...classes.map((c) => ({
                      value: c._id,
                      label: `${c.name} (Sem ${c.semester || '-'})`,
                    })),
                  ]}
                  value={selectedClass}
                  onChange={(val) => { setSelectedClass(val || 'all'); setSelection([]); }}
                  placeholder="Filter by Class"
                  variant="ghost"
                  size="sm"
                  className="min-w-[170px] w-full sm:w-[170px]"
                  clearable={selectedClass !== 'all'}
                />
              </div>
            )}

            {/* Export CSV button (rounded-full) */}
            <button
              onClick={handleExportCSV}
              disabled={!mentees.length}
              className="h-11 px-4 inline-flex items-center gap-2 rounded-full bg-white border border-zinc-200 text-zinc-600 hover:text-indigo-600 hover:border-indigo-100 hover:shadow-lg hover:shadow-indigo-500/5 transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
              title="Export Mentees CSV"
            >
              <Download size={15} />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            {/* Refresh button — matching Pending.jsx EXACTLY (h-11 w-11 rounded-full with size={18} icon) */}
            <button
              onClick={() => fetchMenteesData(true)}
              disabled={loading || refreshing}
              className={`h-11 w-11 p-0 inline-flex items-center justify-center shrink-0 rounded-full bg-white border border-zinc-200 text-zinc-400 hover:text-indigo-600 hover:border-indigo-100 hover:shadow-lg hover:shadow-indigo-500/5 transition-all ${refreshing ? 'opacity-50' : ''}`}
              title="Refresh records"
            >
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Institutional Table with built-in search, bulk selection, and records count */}
        {error ? (
          <div className="surface-panel p-20 text-center">
            <AlertTriangle className="mx-auto text-status-due mb-4" size={48} />
            <h2 className="text-xl font-black text-navy mb-2">Sync Interrupted</h2>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{error}</p>
            <Button variant="primary" onClick={() => fetchMenteesData()}>Retry Sync</Button>
          </div>
        ) : (
          <Table
            columns={columns}
            data={mentees}
            loading={loading}
            searchable
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by roll number or name..."
            selectable={eligibleForBulk.length > 0}
            selection={selection}
            onSelectionChange={setSelection}
            isRowSelectable={isRowSelectable}
            bulkActions={bulkActionsList}
            showCount
            primaryKey="_id"
          />
        )}

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
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Loading clearance details...</p>
            </div>
          ) : !clearanceData ? (
            <div className="p-8 text-center text-zinc-500 text-xs font-medium">No clearance records found for this student.</div>
          ) : (
            <div className="space-y-5">
              {/* Mentee Header Card */}
              <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-navy bg-white px-2 py-0.5 rounded border border-zinc-200">
                      {clearanceData.student?.rollNo}
                    </span>
                    <h3 className="text-sm font-black text-navy">{clearanceData.student?.name}</h3>
                  </div>
                  <p className="text-xs text-zinc-500 font-medium">
                    {clearanceData.student?.departmentId?.name} · {clearanceData.student?.classId?.name} (Semester{' '}
                    {clearanceData.student?.semester || clearanceData.student?.classId?.semester})
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
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

              {/* Progress Summary Metrics */}
              <div className="grid grid-cols-4 gap-2.5 text-center">
                <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Total</p>
                  <p className="text-lg font-black text-navy mt-0.5">{clearanceData.summary?.total || 0}</p>
                </div>
                <div className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Approved</p>
                  <p className="text-lg font-black text-emerald-700 mt-0.5">{clearanceData.summary?.approved || 0}</p>
                </div>
                <div className="p-2.5 bg-rose-50/70 rounded-xl border border-rose-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Dues</p>
                  <p className="text-lg font-black text-rose-700 mt-0.5">{clearanceData.summary?.due || 0}</p>
                </div>
                <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Pending</p>
                  <p className="text-lg font-black text-amber-700 mt-0.5">{clearanceData.summary?.pending || 0}</p>
                </div>
              </div>

              {/* Clearance Approvals List */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  Departmental Clearance Checkpoints
                </h4>

                {clearanceData.approvals && clearanceData.approvals.length > 0 ? (
                  <div className="divide-y divide-zinc-100 border border-zinc-200/80 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                    {clearanceData.approvals.map((approval) => {
                      const isDue = approval.action === 'due_marked';
                      const isApproved = approval.action === 'approved';
                      const isPending = approval.action === 'pending' || approval.action === 'not_submitted';

                      return (
                        <div
                          key={approval._id}
                          className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${
                            isDue ? 'bg-rose-50/40' : 'bg-white'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-navy text-xs">
                                {getApprovalLabel(approval)}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 font-mono font-bold uppercase">
                                {approval.approvalType}
                              </span>
                            </div>

                            <p className="text-[11px] text-zinc-400 font-medium">
                              Staff: {approval.facultyId?.name || 'Assigned Department Staff'}
                            </p>

                            {/* Dues description if marked */}
                            {isDue && (
                              <div className="p-2 bg-rose-50 rounded-lg border border-rose-200 text-xs text-rose-800 space-y-0.5 mt-1">
                                <p className="font-bold flex items-center gap-1 text-[11px]">
                                  <AlertCircle size={12} className="text-rose-600 shrink-0" />
                                  <span>Reason: {approval.remarks || 'Requirement pending'}</span>
                                </p>
                                {approval.amount > 0 && <p className="text-[10px] font-mono">Amount: ₹{approval.amount}</p>}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                            {isApproved ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Check size={11} /> Approved
                              </span>
                            ) : isDue ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                                <AlertCircle size={11} /> Has Due
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock size={11} /> Pending
                              </span>
                            )}

                            {/* Direct Actions inside modal if mentor's own checkpoint */}
                            {approval.approvalType === 'mentor' && !clearanceData.batch?.isClosed && (
                              <div className="flex items-center gap-1.5 ml-1">
                                {isPending && (
                                  <>
                                    <button
                                      onClick={() => handleApprove(approval._id, clearanceData.student?.name)}
                                      disabled={actionLoading === approval._id}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
                                      title="Approve Mentor Clearance"
                                    >
                                      {actionLoading === approval._id ? <Loader2 size={10} className="animate-spin" /> : <Check size={11} />}
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => openMarkDueModal({
                                        approvalId: approval._id,
                                        studentId: clearanceData.student?._id,
                                        studentName: clearanceData.student?.name,
                                        rollNo: clearanceData.student?.rollNo
                                      })}
                                      disabled={actionLoading === approval._id}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-200 text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
                                      title="Flag Deficiency"
                                    >
                                      <X size={11} />
                                      Mark Due
                                    </button>
                                  </>
                                )}
                                {isDue && (
                                  <>
                                    <button
                                      onClick={() => handleClearDue(approval._id, clearanceData.student?.name)}
                                      disabled={actionLoading === approval._id}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
                                      title="Clear Deficiency & Approve"
                                    >
                                      {actionLoading === approval._id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                      Clear & Approve
                                    </button>
                                    <button
                                      onClick={() => handleResetToPending(approval._id, clearanceData.student?.name)}
                                      disabled={actionLoading === approval._id}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 text-[10px] font-bold uppercase transition-all disabled:opacity-50"
                                      title="Reset to Pending"
                                    >
                                      <RefreshCw size={10} /> Reset
                                    </button>
                                  </>
                                )}
                                {isApproved && (
                                  <button
                                    onClick={() => handleResetToPending(approval._id, clearanceData.student?.name)}
                                    disabled={actionLoading === approval._id}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 text-[10px] font-bold uppercase transition-all disabled:opacity-50"
                                    title="Reset to Pending"
                                  >
                                    <RefreshCw size={10} /> Reset
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-center bg-zinc-50 border border-zinc-200/80 rounded-xl">
                    <BookOpen size={24} className="text-zinc-300 mx-auto mb-1.5" />
                    <p className="text-xs font-black text-navy uppercase tracking-wider">No Active Clearance Cycle</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Checkpoints will populate once the semester clearance drive is published.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>

        {/* Modal: Flag Due on Mentee */}
        <Modal
          isOpen={dueModalOpen}
          onClose={() => setDueModalOpen(false)}
          title={`Flag Due for ${dueTarget?.studentName || 'Mentee'}`}
        >
          <form onSubmit={handleSubmitMarkDue} className="space-y-4">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-xs text-amber-800 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-[11px]">
                <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                <span>Notice: Flagging a Deficiency</span>
              </p>
              <p className="text-[11px] leading-relaxed">
                Marking a due holds this student's mentor clearance until the deficiency is resolved.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-700">Due Category</label>
              <select
                value={dueType}
                onChange={(e) => setDueType(e.target.value)}
                className="w-full text-xs font-medium border border-zinc-200 rounded-xl p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                {DUE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-700">
                Reason / Remarks <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="Specify the lab component, record submission, or academic task required..."
                value={dueRemarks}
                onChange={(e) => setDueRemarks(e.target.value)}
                className="w-full text-xs font-medium border border-zinc-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-zinc-700">Due Amount (₹, optional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs font-bold">₹</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={dueAmount}
                  onChange={(e) => setDueAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 text-xs font-medium border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setDueModalOpen(false)} className="rounded-xl text-xs font-bold">
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={dueSubmitting || !dueRemarks.trim()}
                className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider"
              >
                {dueSubmitting ? <Spinner className="w-3.5 h-3.5 mr-1 text-white" /> : <AlertCircle size={12} className="mr-1" />}
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
