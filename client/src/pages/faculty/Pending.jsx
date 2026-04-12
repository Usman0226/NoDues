import React, { useState, useCallback, useMemo } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { DUE_TYPES } from '../../utils/constants';
import { useApi } from '../../hooks/useApi';
import useSSE from '../../hooks/useSSE';
import { getPendingApprovals, approveRecord, markDueRecord, updateApproval } from '../../api/approvals';
import {
  Check,
  X,
  Search,
  RefreshCw,
  AlertTriangle,
  Edit2,
  Loader2,
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

// ── Inline Due Form ─────────────────────────────────────────────────────────────
const DueForm = ({ onSubmit, onCancel, submitting, initialData = {} }) => {
  const [dueType, setDueType] = useState(initialData.dueType || '');
  const [remarks, setRemarks] = useState(initialData.remarks || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!dueType || !remarks.trim()) return;
    onSubmit({ dueType, remarks });
  };

  return (
    <form id="due-form" onSubmit={handleSubmit} className="mt-3 p-4 rounded-xl bg-red-50 border border-red-100 space-y-3">
      <div>
        <label className="block text-[10px] uppercase tracking-widest font-bold text-red-600 mb-1">
          Due Type
        </label>
        <select
          id="due-type-select"
          value={dueType}
          onChange={(e) => setDueType(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
          disabled={submitting}
        >
          <option value="">Select type...</option>
          {DUE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-widest font-bold text-red-600 mb-1">
          Remarks <span className="text-red-500">*</span>
        </label>
        <textarea
          id="due-remarks"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
          placeholder="Describe the due in detail..."
          disabled={submitting}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="danger"
          size="sm"
          type="submit"
          disabled={!dueType || !remarks.trim() || submitting}
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
          {submitting ? 'Submitting...' : 'Submit Due'}
        </Button>
        <Button variant="ghost" size="sm" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

// ── Main Component ──────────────────────────────────────────────────────────────
const Pending = () => {
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [filter, setFilter]               = useState('pending');
  const [search, setSearch]               = useState('');
  const [expandedDue, setExpandedDue]     = useState(null); // approvalId for "mark-due" form
  const [editingId, setEditingId]         = useState(null); // approvalId for "edit" form
  const [actionLoading, setActionLoading] = useState(null); // approvalId being processed

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
        const { approvalId, action, dueType, remarks } = event;
        if (!approvalId) return;
        setResponse((prev) => {
          if (Array.isArray(prev)) {
            return prev.map((a) =>
              a._id === approvalId
                ? { ...a, action: action ?? a.action, dueType: dueType ?? a.dueType, remarks: remarks ?? a.remarks }
                : a
            );
          }
          if (prev?.data) {
            return {
              ...prev,
              data: prev.data.map((a) =>
                a._id === approvalId
                  ? { ...a, action: action ?? a.action, dueType: dueType ?? a.dueType, remarks: remarks ?? a.remarks }
                  : a
              )
            };
          }
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
    } catch {
      // axios interceptor handles the toast
    } finally {
      setActionLoading(null);
    }
  };

  const handleDueSubmit = async (id, dueData) => {
    setActionLoading(id);
    try {
      await markDueRecord({ approvalId: id, ...dueData });
      setResponse((prev) => {
        const update = (a) => (a._id === id ? { ...a, action: 'due_marked', dueType: dueData.dueType, remarks: dueData.remarks } : a);
        if (Array.isArray(prev)) return prev.map(update);
        if (prev?.data) return { ...prev, data: prev.data.map(update) };
        return prev;
      });
      setExpandedDue(null);
      toast.success('Due marked ❌');
    } catch {
      // error handled by axios
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditSubmit = async (id, data) => {
    setActionLoading(id);
    try {
      await updateApproval(id, data);
      setResponse((prev) => {
        const update = (a) =>
          a._id === id
            ? {
                ...a,
                action:  data.action  ?? a.action,
                dueType: data.dueType ?? null,
                remarks: data.remarks ?? null,
              }
            : a;
        if (Array.isArray(prev)) return prev.map(update);
        if (prev?.data) return { ...prev, data: prev.data.map(update) };
        return prev;
      });
      setEditingId(null);
      toast.success('Record updated');
    } catch {
      // handled upstream
    } finally {
      setActionLoading(null);
    }
  };

  // ── Filter logic ─────────────────────────────────────────────────────────────
  const batches = Array.from(new Set((approvals || []).map((a) => a.batchId))).map((batchId) => {
    const record = approvals.find((a) => a.batchId === batchId);
    return { id: batchId, name: record?.className || `Batch ${batchId}` };
  });

  const filtered = (approvals || []).filter((a) => {
    if (selectedBatch !== 'all' && a.batchId !== selectedBatch) return false;
    if (filter !== 'all' && a.action !== filter) return false;
    if (search) {
      const q   = search.toLowerCase();
      const name = a.studentName   || '';
      const roll = a.studentRollNo || '';
      return name.toLowerCase().includes(q) || roll.toLowerCase().includes(q);
    }
    return true;
  });

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading && !response) {
    return (
      <PageWrapper title="Pending Approvals" subtitle="Fetching your action queue...">
        <div className="space-y-4 animate-pulse">
          <div className="h-10 w-full bg-muted/10 rounded-xl mb-6" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-muted/5 rounded-xl" />
          ))}
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper title="Pending Approvals" subtitle="Connection error">
        <div className="text-center py-20 bg-white rounded-xl border border-muted shadow-sm">
          <AlertTriangle className="mx-auto text-status-due mb-4" size={48} />
          <h2 className="text-xl font-black text-navy mb-2">Sync Interrupted</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{error}</p>
          <Button variant="primary" onClick={() => fetchApprovals()}>
            <RefreshCw size={14} className="mr-2" /> Try Again
          </Button>
        </div>
      </PageWrapper>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <PageWrapper title="Pending Approvals" subtitle="Students awaiting your clearance">
      {/* Search & Batch Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-widest font-bold text-navy/40">Group:</label>
          <select
            id="batch-select"
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            className="px-4 py-2 rounded-lg border border-muted bg-white text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 font-semibold text-navy"
          >
            <option value="all">All Classes</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find roll no or name..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-muted bg-white text-sm focus:outline-none focus:ring-2 focus:ring-navy/5"
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchApprovals()}
          disabled={loading}
          className="ml-auto shrink-0"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-6 bg-offwhite rounded-xl p-1 w-fit">
        {FILTERS.map((f) => {
          const count = (approvals || []).filter((a) => f === 'all' || a.action === f).length;
          return (
            <button
              key={f}
              id={`filter-${f}`}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all
                ${filter === f ? 'bg-white text-navy shadow-sm' : 'text-muted-foreground hover:text-navy'}`}
            >
              {f === 'all' ? 'All' : f === 'due_marked' ? 'Dues' : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1.5 opacity-40">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Approval Cards */}
      <div className="space-y-4">
        {filtered.map((item) => {
          const isActioning = actionLoading === item._id;
          return (
            <div
              key={item._id}
              id={`approval-card-${item._id}`}
              className="bg-white rounded-xl border border-muted shadow-sm p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                {/* Student info */}
                <div className="min-w-0">
                  <p className="text-sm font-black text-navy flex items-center gap-2 flex-wrap">
                    <span className="bg-navy/5 text-navy px-2 py-0.5 rounded font-mono text-xs">
                      {item.studentRollNo}
                    </span>
                    <span className="truncate">{item.studentName}</span>
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-[11px] font-bold text-muted-foreground/60">
                      {item.className || 'Batch'}
                    </span>
                    <span className="w-1 h-1 bg-muted rounded-full" />
                    <span className="text-[10px] uppercase font-black tracking-widest text-gold">
                      {getApprovalLabel(item)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {item.action === 'pending' ? (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        id={`approve-btn-${item._id}`}
                        onClick={() => handleApprove(item._id)}
                        disabled={isActioning}
                      >
                        {isActioning ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        id={`due-btn-${item._id}`}
                        onClick={() => {
                          setExpandedDue(expandedDue === item._id ? null : item._id);
                          setEditingId(null);
                        }}
                        disabled={isActioning}
                      >
                        <X size={14} /> Mark Due
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge status={item.action} />
                      {/* Edit button for actioned records — PRD §6.5 */}
                      <button
                        id={`edit-btn-${item._id}`}
                        className="text-[9px] uppercase tracking-widest font-black text-navy/30 hover:text-navy transition-colors px-2 py-1 rounded-lg hover:bg-offwhite"
                        onClick={() => {
                          setEditingId(editingId === item._id ? null : item._id);
                          setExpandedDue(null);
                        }}
                      >
                        <Edit2 size={12} className="inline mr-0.5" />
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Due info display */}
              {item.action === 'due_marked' && !editingId && (
                <div className="mt-4 p-4 rounded-xl bg-red-50/50 border border-red-100/50">
                  <p className="text-[9px] font-black text-red-600 uppercase tracking-widest flex items-center gap-1.5">
                    <AlertTriangle size={10} strokeWidth={3} />
                    Flagged: {item.dueType}
                  </p>
                  {item.remarks && (
                    <p className="text-xs font-medium text-red-800 mt-1 italic">"{item.remarks}"</p>
                  )}
                </div>
              )}

              {/* Inline Mark Due form */}
              {expandedDue === item._id && (
                <DueForm
                  onSubmit={(data) => handleDueSubmit(item._id, data)}
                  onCancel={() => setExpandedDue(null)}
                  submitting={isActioning}
                />
              )}

              {/* Inline Edit form for actioned records */}
              {editingId === item._id && (
                <div className="mt-3 p-4 rounded-xl bg-navy/5 border border-navy/10 space-y-3">
                  <p className="text-[10px] uppercase tracking-widest font-black text-navy/50">
                    Edit Previous Action
                  </p>

                  {/* Option 1 — Change to Approved */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={item.action === 'approved' || isActioning}
                      onClick={() => handleEditSubmit(item._id, { action: 'approved' })}
                    >
                      <Check size={12} /> Change to Approved
                    </Button>

                    {/* Option 2 — Change to / update due */}
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={isActioning}
                      onClick={() => {
                        setEditingId(null);
                        setExpandedDue(item._id);
                      }}
                    >
                      <X size={12} /> Update Due Details
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-20 bg-offwhite/50 rounded-xl border border-dashed border-muted">
            <p className="text-sm font-black text-navy/20 uppercase tracking-widest">
              No candidates found for this view
            </p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
};

export default Pending;
