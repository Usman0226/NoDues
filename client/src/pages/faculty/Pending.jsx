import React, { useState, useCallback, useMemo } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Table from '../../components/ui/Table';
import { DUE_TYPES } from '../../utils/constants';
import { useApi } from '../../hooks/useApi';
import useSSE from '../../hooks/useSSE';
import { 
  getPendingApprovals, 
  approveRecord, 
  markDueRecord, 
  updateApproval,
  bulkApproveRecords 
} from '../../api/approvals';
import {
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Edit2,
  Loader2,
  Settings2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const FILTERS = ['all', 'pending', 'approved', 'due_marked'];

const getApprovalLabel = (item) => {
  if (item.approvalType === 'classTeacher') return 'Class Teacher';
  if (item.approvalType === 'mentor') return 'Mentor Approval';
  const code = item.subjectCode || null;
  return item.subjectName
    ? `${item.subjectName}${code ? ` (${code})` : ''}`
    : '—';
};

// ── Inline Due Form (Moved out of card, used in Modal-like context or simply rendered) ──────────────
// For simplicity in the table view, we will use a small inline form or a simple action.
// Since the table is more structured, I'll keep the DueForm as a standalone component if needed.

const Pending = () => {
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [filter, setFilter]               = useState('pending');
  const [selection, setSelection]         = useState([]);
  const [actionLoading, setActionLoading] = useState(null); // 'bulk' or approvalId
  const [dueModal, setDueModal]           = useState(null); // { id, ... }

  const { data: response, loading, error, request: fetchApprovals, setData: setResponse } =
    useApi(getPendingApprovals, { immediate: true });

  const approvals = useMemo(() => {
    if (Array.isArray(response)) return response;
    return response?.data || [];
  }, [response]);

  const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
  const sseUrl  = `${apiBase}/api/sse/connect`;
  
  useSSE(
    sseUrl,
    useCallback(
      (event) => {
        if (event?.type !== 'APPROVAL_UPDATED') return;
        const { approvalId, action, dueType, remarks, bulk } = event;
        
        setResponse((prev) => {
          const updateArray = (arr) => arr.map((a) => {
            if (bulk && action === 'approved') return { ...a, action: 'approved' };
            if (a._id === approvalId) {
               return { ...a, action: action ?? a.action, dueType: dueType ?? a.dueType, remarks: remarks ?? a.remarks };
            }
            return a;
          });

          if (Array.isArray(prev)) return updateArray(prev);
          if (prev?.data) return { ...prev, data: updateArray(prev.data) };
          return prev;
        });
      },
      [setResponse]
    )
  );

  // ── Actions ──────────────────────────────────────────────────────────────────
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
      toast.success('Approval recorded ✅');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkApprove = async () => {
    if (!selection.length) return;
    setActionLoading('bulk');
    try {
      const res = await bulkApproveRecords(selection);
      toast.success(`Successfully approved ${res.data.processed} students ✅`);
      setSelection([]);
      fetchApprovals(); // Refresh to catch all Recalc effects
    } finally {
      setActionLoading('bulk');
      setTimeout(() => setActionLoading(null), 500);
    }
  };

  const handleUpdate = async (id, data) => {
    setActionLoading(id);
    try {
      await updateApproval(id, data);
      fetchApprovals();
      toast.success('Record updated');
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
        <span className="bg-zinc-100 text-zinc-900 px-2 py-0.5 rounded font-mono text-[10px] sm:text-xs font-bold border border-zinc-200">
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
        <span className="text-[10px] uppercase font-black tracking-widest text-gold/80">
          {getApprovalLabel(row)}
        </span>
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
        
        if (row.action === 'pending') {
          return (
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); handleApprove(row._id); }}
                disabled={isActioning}
                className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                title="Approve"
              >
                {isActioning ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toast('Individual due marking remains the same - refactoring now'); }}
                disabled={isActioning}
                className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm"
                title="Mark Due"
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

  const batches = Array.from(new Set(approvals.map((a) => a.batchId))).map((batchId) => {
    const record = approvals.find((a) => a.batchId === batchId);
    return { id: batchId, name: record?.className || `Batch ${batchId}` };
  });

  const filtered = useMemo(() => {
    return approvals.filter((a) => {
      if (selectedBatch !== 'all' && a.batchId !== selectedBatch) return false;
      if (filter !== 'all' && a.action !== filter) return false;
      return true;
    });
  }, [approvals, selectedBatch, filter]);

  const bulkActions = (
    <Button
      variant="primary"
      size="sm"
      className="bg-white text-navy hover:bg-indigo-50 border-none shadow-xl px-6 rounded-full"
      onClick={handleBulkApprove}
      disabled={actionLoading === 'bulk'}
    >
      {actionLoading === 'bulk' ? (
        <Loader2 size={16} className="animate-spin mr-2" />
      ) : (
        <Check size={16} className="mr-2" />
      )}
      Approve {selection.length} Students
    </Button>
  );

  return (
    <PageWrapper title="Pending Approvals" subtitle="Efficiently manage clearance requests">
      {/* Header Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div className="flex items-center gap-1 bg-zinc-100/80 p-1 rounded-2xl w-fit border border-zinc-200/50">
          {FILTERS.map((f) => {
            const count = approvals.filter((a) => f === 'all' || a.action === f).length;
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => { setFilter(f); setSelection([]); }}
                className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all
                  ${active ? 'bg-white text-indigo-600 shadow-md translate-y-[-1px]' : 'text-zinc-500 hover:text-zinc-900'}`}
              >
                {f === 'all' ? 'Everything' : f === 'due_marked' ? 'Dues' : f}
                <span className={`ml-2 opacity-50 ${active ? 'text-indigo-400' : ''}`}>({count})</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
             <Settings2 size={14} className="text-zinc-400" />
             <select
              value={selectedBatch}
              onChange={(e) => { setSelectedBatch(e.target.value); setSelection([]); }}
              className="bg-white border border-zinc-200 text-sm font-bold text-navy px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer"
            >
              <option value="all">All Academic Groups</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchApprovals()}
            className={`p-3 rounded-xl bg-white border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-100 transition-all ${loading ? 'opacity-50' : ''}`}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="surface-panel p-20 text-center">
          <AlertTriangle className="mx-auto text-status-due mb-4" size={48} />
          <h2 className="text-xl font-black text-navy mb-2">Sync Interrupted</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{error}</p>
          <Button variant="primary" onClick={() => fetchApprovals()}>Retry Sync</Button>
        </div>
      ) : (
        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          searchable
          searchPlaceholder="Search by roll number or name..."
          selectable={filter === 'pending'} // Only allow selection in pending view
          selection={selection}
          onSelectionChange={setSelection}
          selectionActions={bulkActions}
          showCount
        />
      )}
    </PageWrapper>
  );
};

export default Pending;
