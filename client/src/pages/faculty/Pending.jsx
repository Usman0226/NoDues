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
  ExternalLink
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useUI } from '../../hooks/useUI';
import { motion } from 'framer-motion';

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
  if (item.approvalType === 'hodApproval' || item.approvalType === 'office' || item.roleTag === 'hod') return 'HoD Approval';
  if (item.approvalType === 'classTeacher') return 'Class Teacher';
  if (item.approvalType === 'mentor') return 'Mentor Approval';
  if (item.approvalType === 'coCurricular') return item.itemTypeName || 'Co-Curricular';
  const code = item.subjectCode || null;
  return item.subjectName
    ? `${item.subjectName}${code ? ` (${code})` : ''}`
    : '—';
};

const Pending = () => {
  const location = useLocation();
  const [selectedBatch, setSelectedBatch] = useState(location.state?.classId || 'all');
  const [filter, setFilter]               = useState('pending');
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

  const { data: classesData } = useApi(getMyClasses, { immediate: true });
  
  const total = response?.pagination?.total || 0;

  const approvals = useMemo(() => {
    if (Array.isArray(response)) return response;
    return response?.data || [];
  }, [response]);

  const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
  const sseUrl  = `${apiBase}/api/sse/connect`;
  
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
        // For simplicity and correctness with pagination, refetch is best
        fetchApprovals({ 
          page, 
          limit, 
          search: debouncedSearch,
          batchId: selectedBatch !== 'all' ? selectedBatch : undefined,
          action: filter
        });
      },
      [fetchApprovals, page, limit, debouncedSearch, selectedBatch, filter]
    )
  );

  const handleUndo = async (id) => {
    setActionLoading(id);
    try {
      await updateApproval(id, { action: 'pending', dueType: null, remarks: null });
      fetchApprovals();
      toast.success('Action reversed. Record is back in Pending.', { id: `undo-${id}` });
    } catch (err) {
      console.warn(err)
      toast.error('Failed to reverse action');
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
    setActionLoading('bulk');
    try {
      const res = await bulkApproveRecords(selection);
      toast.success(`Successfully approved ${res.data.processed} students `);
      setSelection([]);
      fetchApprovals(); // Refresh to catch all Recalc effects
    } finally {
      setActionLoading('bulk');
      setTimeout(() => setActionLoading(null), 500);
    }
  }, [selection, fetchApprovals]);

  const handleUpdate = async (id, data) => {
    setActionLoading(id);
    try {
      await updateApproval(id, data);
      fetchApprovals();
      
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

  const batches = useMemo(() => {
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
      // subtitle="Efficiently manage clearance requests"
    >
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
        

        {/* Header Filters */}
        <motion.div variants={item} className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-1 bg-zinc-200/40 p-1.5 rounded-[20px] w-fit border border-zinc-200/20 backdrop-blur-md">
            {FILTERS.map((f) => {
              const count = approvals.filter((a) => f === 'all' || a.action === f).length;
              const active = filter === f;
              return (
                <button
                  key={f}
                  onClick={() => { setFilter(f); setSelection([]); }}
                  className={`px-6 py-2.5 rounded-[14px] text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300 relative
                    ${active ? 'text-indigo-600' : 'text-zinc-500 hover:text-zinc-900 hover:bg-white/40'}`}
                >
                  {active && (
                    <motion.div 
                      layoutId="activeFilter"
                      className="absolute inset-0 bg-white rounded-[14px] shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-indigo-50"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10">
                    {f === 'all' ? 'Everything' : f === 'due_marked' ? 'Dues' : f}
                    <span className={`ml-2 opacity-40 font-bold ${active ? 'text-indigo-400' : ''}`}>{count}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
               <Settings2 size={16} className="text-zinc-400" />
               <SearchableSelect 
                options={[
                  { value: 'all', label: 'All Academic Classes  ' },
                  ...batches.map(b => ({
                    value: b.id,
                    label: b.name,
                  }))
                ]}
                value={selectedBatch}
                onChange={(val) => { setSelectedBatch(val); setSelection([]); }}
                placeholder="Filter by Class"
                className="min-w-[240px]"
              />
            </div>

            <button
              onClick={async () => {
                const hide = showGlobalLoader('Fetching latest records...');
                await fetchApprovals();
                hide();
              }}
              className={`p-3.5 rounded-2xl bg-white border border-zinc-200 text-zinc-400 hover:text-indigo-600 hover:border-indigo-100 hover:shadow-lg hover:shadow-indigo-500/5 transition-all ${loading ? 'opacity-50' : ''}`}
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
                <Check className="text-zinc-300" size={40} />
              </div>
              <h3 className="text-navy font-brand text-xl mb-2">Queue Fully Processed</h3>
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                No student clearance requests are pending for the selected {selectedBatch === 'all' ? 'active batches' : 'class'}. 
                Check individual status or history for previously actioned records.
              </p>
            </div>
          ) : (
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
              selection={selection}
              onSelectionChange={setSelection}
              bulkActions={bulkActionsList}
              showCount
            />
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
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              await handleUpdate(dueModal._id, {
                action: 'due_marked',
                dueType: formData.get('dueType'),
                remarks: formData.get('remarks')
              });
              setDueModal(null);
            }}
            className="space-y-6"
          >
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-2">Target Candidate</p>
              <div className="p-4 rounded-xl bg-offwhite border border-muted/50">
                 <p className="text-sm font-black text-navy">{dueModal.studentRollNo} · {dueModal.studentName}</p>
                 <p className="text-[10px] font-bold text-gold uppercase tracking-widest mt-1">{getApprovalLabel(dueModal)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-navy mb-2 block">Deficiency Category</label>
                <SearchableSelect 
                  options={DUE_TYPES.map(type => ({
                    value: type.value,
                    label: type.label,
                    subLabel: 'Category'
                  }))}
                  value={''} // Controlled via native form in this component, but we should probably refactor to state if needed.
                  // Wait, the parent uses (e) => new FormData(e.target). 
                  // SearchableSelect doesn't work with native FormData out of the box unless it has a hidden input.
                  // I'll add a name prop to SearchableSelect or refactor this to state.
                  onChange={val => {
                    const select = document.getElementById('dueType-hidden');
                    if (select) {
                      select.value = val;
                      select.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                  }}
                  placeholder="Select Category"
                />
                <input type="hidden" name="dueType" id="dueType-hidden" required />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-navy mb-2 block">Specific Remarks</label>
                <textarea 
                  name="remarks"
                  required
                  rows={4}
                  placeholder="Explain why the clearance is blocked (e.g., 'Internal exams fee pending', 'Lab equipment damaged')"
                  className="w-full bg-white border border-muted text-sm font-medium text-navy px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-red-100 transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setDueModal(null)}>Cancel</Button>
              <Button type="submit" variant="danger" className="flex-1" loading={actionLoading === dueModal._id}>Confirm Flag</Button>
            </div>
          </form>
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
