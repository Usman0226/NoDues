import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Table from '../../components/ui/Table';
import { DUE_TYPES } from '../../utils/constants';
import { useApi } from '../../hooks/useApi';
import useSSE from '../../hooks/useSSE';
import { useAuth } from '../../hooks/useAuth';
import { 
  getPendingApprovals, 
  approveRecord, 
  updateApproval,
  bulkApproveRecords 
} from '../../api/approvals';
import { getSSEConnectUrl } from '../../api/sse';
import { getMyClasses } from '../../api/faculty';
import Modal from '../../components/ui/Modal';
import SearchableSelect from '../../components/ui/SearchableSelect';
import BackHeader from '../../components/ui/BackHeader';
import {
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Edit2,
  Clock,
  Loader2,
  Settings2,
  Eye,
  FileText,
  UserCheck,
  ExternalLink,
  PlaneTakeoff
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useUI } from '../../hooks/useUI';
import { motion, AnimatePresence } from 'framer-motion';
import GuidedTour from '../../components/ui/GuidedTour';
import { Sparkles, Layers, CheckCircle2 } from 'lucide-react';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 }
};

const FILTERS = ['all', 'pending', 'approved', 'due_marked'];

const getApprovalLabel = (item) => {
  if (item.roleTag === 'ao') return 'AO Approval';
  if (item.roleTag === 'hod' || item.approvalType === 'hodApproval' || item.approvalType === 'office') return 'HoD Approval';
  if (item.approvalType === 'classTeacher') return 'Class Teacher';
  if (item.approvalType === 'mentor') return 'Mentor Approval';
  if (item.approvalType === 'coCurricular') return item.itemTypeName || 'Co-Curricular';
  const code = item.subjectCode || null;
  return item.subjectName
    ? `${item.subjectName}${code ? ` (${code})` : ''}`
    : '—';
};

const DueModalContent = ({ item, onClose, onSubmit, loading }) => {
  const [dueType, setDueType] = useState('');
  const [remarks, setRemarks] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!dueType) {
      toast.error('Please select a deficiency category');
      return;
    }
    onSubmit({ dueType, remarks });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-2">Target Candidate</p>
        <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-100">
           <p className="text-sm font-black text-zinc-900">{item.studentRollNo} · {item.studentName}</p>
           <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-1">{getApprovalLabel(item)}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-900 mb-2 block">Deficiency Category</label>
          <SearchableSelect 
            options={DUE_TYPES.map(type => ({
              value: type.value,
              label: type.label,
              subLabel: 'Category'
            }))}
            value={dueType}
            onChange={setDueType}
            placeholder="Select Category"
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-900 mb-2 block">Specific Remarks</label>
          <textarea 
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            required
            rows={4}
            placeholder="Explain why the clearance is blocked (e.g., 'Internal exams fee pending', 'Lab equipment damaged')"
            className="w-full bg-white border border-zinc-200 text-sm font-medium text-zinc-900 px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-red-100 transition-all resize-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-4">
        <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="danger" className="flex-1" loading={loading}>Confirm Flag</Button>
      </div>
    </form>
  );
};

const Pending = () => {
  const location = useLocation();
  const [selectedBatch, setSelectedBatch] = useState(location.state?.classId || 'all');
  const [filter, setFilter]               = useState('pending');

  // Sync with navigation state (from My Classes / Dashboard)
  useEffect(() => {
    if (location.state?.classId && location.state.classId !== selectedBatch) {
      setSelectedBatch(location.state.classId);
    }
    // Reset to 'pending' if entering from a summary view (Dashboard/My Classes)
    if (location.state?.from && filter !== 'pending') {
      setFilter('pending');
    }
  }, [location.state, selectedBatch, filter]);
  const [selection, setSelection]         = useState([]);
  const [actionLoading, setActionLoading] = useState(null); 
  const [dueModal, setDueModal]           = useState(null); 
  const [reviewModal, setReviewModal]     = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const { showGlobalLoader } = useUI();
  const { user } = useAuth();
  const { data: response, loading, error, request: fetchApprovals, setData: setResponse } =
    useApi(getPendingApprovals);

  const [isTourActive, setIsTourActive] = useState(false);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('tour_completed_faculty_pending');
    if (!hasSeenTour && !loading && response) {
      const timer = setTimeout(() => setIsTourActive(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [loading, response]);

  const tourSteps = [
    {
      targetId: 'tour-filters',
      title: 'Status Filters',
      content: 'Easily switch between Pending requests, Approved records, and students with Dues marked.'
    },
    {
      targetId: 'tour-class-select',
      title: 'Class Filtering',
      content: 'Focus on a specific academic batch by selecting it from this dropdown.'
    },
    {
      targetId: 'tour-search',
      title: 'Quick Search',
      content: 'Instantly find students by their Roll Number or Name.'
    },
    {
      targetId: 'tour-table',
      title: 'Approvals Table',
      content: 'Review student details and take actions directly from here.'
    },
    {
      targetId: 'tour-bulk-actions',
      title: 'Bulk Approval',
      content: 'Select multiple students and approve them all at once to save time.'
    }
  ];


  const { data: classesData } = useApi(getMyClasses, { immediate: true });
  
  const baseTotal = response?.pagination?.total || 0;

  const baseApprovals = useMemo(() => {
    if (Array.isArray(response)) return response;
    return response?.data || [];
  }, [response]);

  const useDummyData = isTourActive && baseApprovals.length === 0;

  const approvals = useDummyData ? [
    {
      _id: 'dummy-1',
      studentId: { rollNumber: 'CS24-001', name: 'Alex Johnson', department: 'Computer Science' },
      className: 'Computer Science - Year 4',
      approvalType: 'subject',
      action: 'pending',
      dues: [],
      updatedAt: new Date().toISOString()
    },
    {
      _id: 'dummy-2',
      studentId: { rollNumber: 'CS24-002', name: 'Sarah Williams', department: 'Computer Science' },
      className: 'Computer Science - Year 4',
      approvalType: 'mentor',
      action: 'pending',
      dues: [],
      updatedAt: new Date().toISOString()
    }
  ] : baseApprovals;

  const total = useDummyData ? 2 : baseTotal;

  // Force selection for tour if empty
  const activeSelection = useDummyData ? ['dummy-1', 'dummy-2'] : selection;

  const sseUrl = getSSEConnectUrl();
  
  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchValue);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    fetchApprovals({ 
      page, 
      limit, 
      search: debouncedSearch,
      batchId: selectedBatch !== 'all' ? selectedBatch : undefined,
      action: filter
    });
  }, [fetchApprovals, page, limit, debouncedSearch, selectedBatch, filter]);

  useSSE(
    sseUrl,
    useCallback(
      (event) => {
        if (event?.event !== 'APPROVAL_UPDATED') return;

        // If the event carries a specific approvalId+action, apply it in-place.
        // This avoids a full refetch when OUR OWN approve/mark-due action echoes back via SSE.
        const { approvalId, action: incomingAction, bulk } = event;

        if (approvalId && incomingAction && !bulk) {
          setResponse((prev) => {
            // Check if this row already matches — if so, no-op (we already set it optimistically)
            const rows = Array.isArray(prev) ? prev : (prev?.data || []);
            const target = rows.find((a) => a._id === approvalId);
            if (!target || target.action === incomingAction) return prev; // already up to date

            // Row exists but differs — apply the remote update in-place
            const update = (a) =>
              a._id === approvalId
                ? { ...a, action: incomingAction, dueType: event.dueType ?? null, remarks: event.remarks ?? null }
                : a;

            if (Array.isArray(prev)) return prev.map(update);
            if (prev?.data) return { ...prev, data: prev.data.map(update) };
            return prev;
          });
        } else {
          // Bulk event or cross-session event — do a full refetch
          fetchApprovals({
            page,
            limit,
            search: debouncedSearch,
            batchId: selectedBatch !== 'all' ? selectedBatch : undefined,
            action: filter
          });
        }
      },
      [fetchApprovals, setResponse, page, limit, debouncedSearch, selectedBatch, filter]
    )
  );

  const handleUndo = async (id) => {
    setActionLoading(id);
    try {
      await updateApproval(id, { action: 'pending', dueType: null, remarks: null });
      // Optimistic in-place reset — avoids a no-arg refetch that ignores current filter/page/search
      setResponse((prev) => {
        const update = (a) =>
          a._id === id ? { ...a, action: 'pending', dueType: null, remarks: null } : a;
        if (Array.isArray(prev)) return prev.map(update);
        if (prev?.data) return { ...prev, data: prev.data.map(update) };
        return prev;
      });
      toast.success('Action reversed. Record is back in Pending.', { id: `undo-${id}` });
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to reverse action');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      await approveRecord(id);
      setResponse((prev) => {
        const update = (a) => (a._id === id ? { ...a, action: 'approved', dueType: null, remarks: null } : a);
        if (Array.isArray(prev)) return prev.map(update);
        if (prev?.data) return { ...prev, data: prev.data.map(update) };
        return prev;
      });
      toast((t) => (
        <div className="flex items-center justify-between gap-4 w-full">
          <span className="font-medium flex items-center gap-1.5"><Check size={16} className="text-emerald-500" /> Approval recorded</span>
          <button 
            onClick={() => {
              toast.dismiss(t.id);
              handleUndo(id);
            }}
            className="text-[10px] font-black uppercase tracking-widest bg-zinc-100 hover:bg-zinc-200 text-zinc-600 px-3 py-1.5 rounded-lg transition-colors border border-zinc-200"
          >
            Undo
          </button>
        </div>
      ), { duration: 5000 });
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkApprove = useCallback(async () => {
    if (!selection.length) return;
    
    // Prevent API calls with dummy data during tour
    if (useDummyData || selection.some(id => id.toString().startsWith('dummy-'))) {
      toast.error('Actions are disabled in Test Flight mode');
      return;
    }

    setActionLoading('bulk');
    const approvedIds = new Set(selection);
    try {
      const res = await bulkApproveRecords(selection);
      toast.success(`Successfully approved ${res.data.processed} students`);
      
      // Optimistic update for all selected rows
      setResponse((prev) => {
        const update = (a) =>
          approvedIds.has(a._id) ? { ...a, action: 'approved', dueType: null, remarks: null } : a;
        if (Array.isArray(prev)) return prev.map(update);
        if (prev?.data) return { ...prev, data: prev.data.map(update) };
        return prev;
      });
      setSelection([]);
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Bulk approval failed');
    } finally {
      setActionLoading(null);
    }
  }, [selection, bulkApproveRecords, setResponse, useDummyData]);

  const handleUpdate = async (id, data) => {
    setActionLoading(id);
    try {
      await updateApproval(id, data);
      // Optimistic in-place update — avoids the no-arg fetchApprovals() silent no-op
      setResponse((prev) => {
        const update = (a) =>
          a._id === id
            ? {
                ...a,
                action: data.action ?? a.action,
                dueType: data.action === 'pending' ? null : (data.dueType ?? a.dueType),
                remarks: data.action === 'pending' ? null : (data.remarks ?? a.remarks),
              }
            : a;
        if (Array.isArray(prev)) return prev.map(update);
        if (prev?.data) return { ...prev, data: prev.data.map(update) };
        return prev;
      });

      if (data.action === 'due_marked') {
        toast((t) => (
          <div className="flex items-center justify-between gap-4 w-full">
            <span className="font-medium text-red-600 flex items-center gap-1.5"><AlertTriangle size={16} /> Deficiency Flagged</span>
            <button 
              onClick={() => {
                toast.dismiss(t.id);
                handleUndo(id);
              }}
              className="text-[10px] font-black uppercase tracking-widest bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors border border-red-100"
            >
              Undo
            </button>
          </div>
        ), { duration: 6000 });
      } else {
        toast.success(data.action === 'pending' ? 'Record reset to pending' : 'Record updated');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Table Configuration ──────────────────────────────────────────────────────
  const columns = [
    {
      key: 'studentRollNo',
      label: 'Roll No',
      sortable: true,
      render: (val) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-900/[0.04] text-zinc-900 border border-zinc-900/10 font-mono text-[10px] sm:text-xs font-black tracking-tight">
          {val}
        </span>
      ),
    },
    {
      key: 'studentName',
      label: 'Student Name',
      sortable: true,
    },
    {
      key: 'className',
      label: 'Class',
      sortable: true,
      render: (val) => <span className="text-zinc-500">{val || '—'}</span>,
    },
    {
      key: 'approvalType',
      label: 'Request Type',
      render: (_, row) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase font-black tracking-widest text-gold/80">
            {getApprovalLabel(row)}
          </span>
          {user?.userId !== row.facultyId && row.facultyName && (
             <span className="text-[9px] font-bold text-zinc-400 whitespace-nowrap">
               Assigned to: {row.facultyName}
             </span>
          )}
        </div>
      ),
    },
    {
      key: 'action',
      label: 'Status',
      render: (val) => <Badge status={val} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => {
        const isActioning = actionLoading === row._id;
        const isCoCurricular = row.approvalType === 'coCurricular';
        
        if (row.action === 'pending') {
          return (
            <div className="flex items-center gap-1.5">
              {isCoCurricular && (
                <button
                  onClick={(e) => { e.stopPropagation(); setReviewModal(row); }}
                  className="p-1.5 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all shadow-sm"
                  title="Review Submission"
                >
                  <Eye size={14} />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleApprove(row._id); }}
                disabled={isActioning}
                className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                title="Approve"
              >
                {isActioning ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setDueModal(row); }}
                disabled={isActioning}
                className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm"
                title="Mark Due / Reject"
              >
                <X size={14} />
              </button>
            </div>
          );
        }

        return (
          <button
            onClick={(e) => { e.stopPropagation(); handleUpdate(row._id, { action: 'pending' }); }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 text-zinc-500 hover:bg-zinc-200 text-[10px] font-bold uppercase transition-colors"
          >
            <RefreshCw size={10} /> Reset
          </button>
        );
      },
    },
  ];

  const classes = useMemo(() => {
    return (classesData?.data || []).map((c) => ({
      id: c._id,
      name: c.name
    }));
  }, [classesData]);



  const bulkActionsList = useMemo(() => [
    {
      label: 'Approve Selection',
      icon: Check,
      onClick: handleBulkApprove,
      variant: 'primary'
    }
  ], [handleBulkApprove]);

  return (
    <PageWrapper 
      title="Pending Approvals" 
      headerActions={
        <button 
          onClick={() => setIsTourActive(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-100 transition-all text-[10px] font-black uppercase tracking-widest"
        >
          <PlaneTakeoff size={14} /> Test Flight
        </button>
      }
    >
      <AnimatePresence>
        {isTourActive && (
          <GuidedTour 
            steps={tourSteps} 
            onComplete={() => {
              setIsTourActive(false);
              setSelection([]);
            }}
            onSkip={() => {
              setIsTourActive(false);
              setSelection([]);
            }}
            onStepChange={(index) => {
              // Step 4 is Bulk Actions - ensure something is selected so the bar appears
              if (index === 4 && selection.length === 0 && approvals.length > 0) {
                setSelection([approvals[0]._id]);
              }
            }}
            tourId="faculty_pending"
          />
        )}
      </AnimatePresence>
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
        

        {/* Header Filters */}
        <motion.div variants={item} className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Status Filters Capsule */}
          <div className="overflow-x-auto no-scrollbar pb-1 -mx-2 px-2 lg:mx-0 lg:px-0">
            <div id="tour-filters" className="flex items-center gap-1 bg-white border border-zinc-100 p-1 rounded-full w-fit shadow-sm shadow-zinc-200/50">
              {FILTERS.map((f) => {
                const count = approvals.filter((a) => f === 'all' || a.action === f).length;
                const active = filter === f;
                
                // Map icons to filters
                const Icon = f === 'all' ? Layers : 
                           f === 'pending' ? Clock : 
                           f === 'approved' ? CheckCircle2 : AlertTriangle;

                return (
                  <button
                    key={f}
                    onClick={() => { setFilter(f); setSelection([]); setPage(1); }}
                    className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-500 relative whitespace-nowrap flex items-center gap-2.5
                      ${active ? 'text-white' : 'text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50/50'}`}
                  >
                    {active && (
                      <motion.div 
                        layoutId="activeFilter"
                        className="absolute inset-0 bg-indigo-600 shadow-[0_4px_12px_rgba(79,70,229,0.3)] rounded-full"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      <Icon size={14} className={active ? 'text-white' : 'text-zinc-400'} />
                      {f === 'all' ? 'All' : f === 'due_marked' ? 'DUES' : f.toUpperCase()}
                      {active ? (
                        <span className="flex h-4 min-w-[16px] items-center justify-center px-1 rounded-full bg-white/20 text-[8px] font-black text-white backdrop-blur-sm">
                          {total}
                        </span>
                      ) : (
                        <span className="text-[9px] opacity-40 font-bold bg-zinc-100 px-1.5 py-0.5 rounded-md group-hover:bg-indigo-100 transition-colors">{count}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            <div id="tour-class-select" className="flex-1 sm:flex-initial flex items-center gap-2 bg-white/60 backdrop-blur-sm border border-zinc-200/50 rounded-full shadow-sm hover:shadow-md transition-all group">
               <div className="pl-3 text-zinc-400 group-hover:text-indigo-500 transition-colors">
                <Settings2 size={14} />
               </div>
               <SearchableSelect 
                options={classes}
                value={selectedBatch}
                onChange={(val) => { setSelectedBatch(val || 'all'); setSelection([]); setPage(1); }}
                placeholder="Filter by Class"
                labelKey="name"
                idKey="id"
                variant="ghost"
                className="min-w-[200px] w-full sm:w-[200px]"
                clearable={selectedBatch !== 'all'}
              />
            </div>

            <button
              onClick={async () => {
                const hide = showGlobalLoader('Fetching latest records...');
                await fetchApprovals();
                hide();
              }}
              className={`p-3.5 rounded-full bg-white border border-zinc-200 text-zinc-400 hover:text-indigo-600 hover:border-indigo-100 hover:shadow-lg hover:shadow-indigo-500/5 transition-all ${loading ? 'opacity-50' : ''}`}
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </motion.div>

        <motion.div variants={item}>
          {error ? (
            <div className="surface-panel p-20 text-center">
              <AlertTriangle className="mx-auto text-status-due mb-4" size={48} />
              <h2 className="text-xl font-black text-navy mb-2">Sync Interrupted</h2>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{error}</p>
              <Button variant="primary" onClick={() => fetchApprovals()}>Retry Sync</Button>
            </div>
          ) : approvals.length === 0 && !loading ? (
            <div className="bg-white border border-dashed border-zinc-200 rounded-3xl p-16 text-center">
              <div className="bg-zinc-50 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6">
                {searchValue || selectedBatch !== 'all' ? (
                  <Eye className="text-zinc-300" size={40} />
                ) : (
                  <Check className="text-zinc-300" size={40} />
                )}
              </div>
              <h3 className="text-navy font-brand text-xl mb-2">
                {searchValue || selectedBatch !== 'all' ? 'No Matching Records' : 'Queue Fully Processed'}
              </h3>
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                {searchValue || selectedBatch !== 'all' 
                  ? "We couldn't find any students matching your current search or filter criteria. Try adjusting your search or clearing filters."
                  : `No student clearance requests are pending for the selected ${selectedBatch === 'all' ? 'active batches' : 'class'}. Check individual status or history for previously actioned records.`
                }
              </p>
              {(searchValue || selectedBatch !== 'all') && (
                <Button 
                  variant="ghost" 
                  className="mt-6 text-indigo-600 font-bold"
                  onClick={() => {
                    setSearchValue('');
                    setSelectedBatch('all');
                  }}
                >
                  Clear All Filters
                </Button>
              )}
            </div>
          ) : (
            <div id="tour-table">
              <Table
                columns={columns}
                data={approvals}
                loading={loading}
                pagination={{
                  total,
                  page,
                  limit,
                  onPageChange: (p) => setPage(p),
                  onLimitChange: (l) => { setLimit(l); setPage(1); }
                }}
                searchable
                searchValue={searchValue}
                onSearchChange={setSearchValue}
                searchPlaceholder="Search by roll number or name..."
                selectable={filter === 'pending'} // Only allow selection in pending view
                selection={activeSelection}
                onSelectionChange={setSelection}
                bulkActions={bulkActionsList}
                showCount
                searchId="tour-search"
                bulkActionsId="tour-bulk-actions"
              />
            </div>
          )}

        </motion.div>
      </motion.div>
      <Modal
        isOpen={!!dueModal}
        onClose={() => setDueModal(null)}
        title="Flag Clearance Deficiency"
        size="sm"
      >
        {dueModal && (
          <DueModalContent 
            item={dueModal} 
            onClose={() => setDueModal(null)}
            onSubmit={async (data) => {
              await handleUpdate(dueModal._id, {
                action: 'due_marked',
                ...data
              });
              setDueModal(null);
            }}
            loading={actionLoading === dueModal._id}
          />
        )}
      </Modal>
      <Modal
        isOpen={!!reviewModal}
        onClose={() => setReviewModal(null)}
        title="Review Clearance Submission"
        size="md"
      >
        {reviewModal && (
          <div className="space-y-6">
             <div className="flex items-start gap-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-100">
                <div className="h-12 w-12 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-400 shrink-0">
                   <UserCheck size={24} />
                </div>
                <div className="min-w-0">
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-1">Student Candidate</p>
                   <h3 className="text-lg font-black text-navy leading-none mb-1">{reviewModal.studentName}</h3>
                   <p className="text-xs font-bold text-zinc-500 font-mono tracking-tighter">{reviewModal.studentRollNo} · {reviewModal.className}</p>
                </div>
             </div>

             <div className="space-y-4">
                <div className="flex items-center gap-2">
                   <FileText size={16} className="text-indigo-600" />
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-navy">Submission Details</h4>
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                   {!reviewModal.submission ? (
                      <div className="p-8 text-center bg-offwhite rounded-2xl border border-dashed border-muted/50">
                         <Clock className="mx-auto text-muted-foreground/30 mb-2" size={32} />
                         <p className="text-sm font-bold text-muted-foreground">No documentation submitted yet.</p>
                      </div>
                   ) : (
                      Object.entries(reviewModal.submission.data || {}).map(([key, value]) => (
                        <div key={key} className="p-4 rounded-xl bg-white border border-zinc-100 shadow-sm">
                           <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400 mb-1">{key.replace(/_/g, ' ')}</p>
                           <p className="text-sm font-bold text-navy break-all">
                              {value?.toString().match(/^https?:\/\//) ? (
                                <a href={value} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-1">
                                   View Document <ExternalLink size={12} />
                                </a>
                              ) : value || '—'}
                           </p>
                        </div>
                      ))
                   )}
                </div>
             </div>

             <div className="flex items-center gap-3 pt-6 border-t border-zinc-100">
                <Button 
                   variant="danger" 
                   className="flex-1" 
                   onClick={() => {
                      setReviewModal(null);
                      setDueModal(reviewModal);
                   }}
                >
                   Reject Submission
                </Button>
                <Button 
                   variant="primary" 
                   className="flex-1" 
                   onClick={async () => {
                      await handleApprove(reviewModal._id);
                      setReviewModal(null);
                   }}
                   loading={actionLoading === reviewModal._id}
                >
                   Approve
                </Button>
             </div>
          </div>
        )}
      </Modal>
    </PageWrapper>
  );
};

export default Pending;
