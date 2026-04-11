import React, { useState, useCallback, useEffect } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { DUE_TYPES } from '../../utils/constants';
import { useApi } from '../../hooks/useApi';
import { getPendingApprovals, approveRecord, markDueRecord } from '../../api/approvals';
import { Check, X, ChevronDown, ChevronUp, Search, RefreshCw, AlertTriangle } from 'lucide-react';

const FILTERS = ['all', 'pending', 'approved', 'due_marked'];

const getApprovalLabel = (item) => {
  if (item.approvalType === 'classTeacher') return 'Class Teacher';
  if (item.approvalType === 'mentor') return 'Mentor Approval';
  return `${item.subjectName} (${item.subjectCode || 'N/A'})`;
};

const DueForm = ({ onSubmit, onCancel, submitting }) => {
  const [dueType, setDueType] = useState('');
  const [remarks, setRemarks] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!dueType || !remarks.trim()) return;
    onSubmit({ dueType, remarks });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 p-4 rounded-xl bg-red-50 border border-red-100 space-y-3">
      <div>
        <label className="block text-[10px] uppercase tracking-widest font-bold text-red-600 mb-1">Due Type</label>
        <select value={dueType} onChange={(e) => setDueType(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
          disabled={submitting}>
          <option value="">Select type...</option>
          {DUE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-widest font-bold text-red-600 mb-1">Remarks (required)</label>
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2}
          className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
          placeholder="Describe the due..."
          disabled={submitting} />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="danger" size="sm" type="submit" disabled={!dueType || !remarks.trim() || submitting}>
          {submitting ? 'Submitting...' : 'Submit Due'}
        </Button>
        <Button variant="ghost" size="sm" type="button" onClick={onCancel} disabled={submitting}>Cancel</Button>
      </div>
    </form>
  );
};

const Pending = () => {
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [expandedDue, setExpandedDue] = useState(null);

  const { data: approvals, loading, error, request: fetchApprovals, setData: setApprovals } = useApi(getPendingApprovals, { immediate: true });


  const handleApprove = async (id) => {
    try {
      await approveRecord(id);
      // Optimistic update
      setApprovals(prev => prev.map(a => a._id === id ? { ...a, action: 'approved' } : a));
    } catch (err) {
      // useApi/axiosInstance handles toast
    }
  };

  const handleDueSubmit = async (id, dueData) => {
    try {
      await markDueRecord({ approvalId: id, ...dueData });
      setApprovals(prev => prev.map(a => a._id === id ? { ...a, action: 'due_marked', ...dueData } : a));
      setExpandedDue(null);
    } catch (err) {
      // error handled by service/axios
    }
  };

  // Derive batches from data for the filter
  const batches = Array.from(new Set((approvals || []).map(a => a.batchId))).map(batchId => {
    const record = approvals.find(a => a.batchId === batchId);
    return { id: batchId, name: record.className || `Batch ${batchId}` };
  });

  const filtered = (approvals || []).filter((a) => {
    if (selectedBatch !== 'all' && a.batchId !== selectedBatch) return false;
    if (filter !== 'all' && a.action !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const studentName = a.studentName || '';
      const rollNo = a.studentRollNo || '';
      return studentName.toLowerCase().includes(q) || rollNo.toLowerCase().includes(q);
    }
    return true;
  });

  if (loading && !approvals) {
    return (
      <PageWrapper title="Pending Approvals" subtitle="Fetching your action queue...">
        <div className="space-y-4 animate-pulse">
          <div className="h-10 w-full bg-muted/10 rounded-xl mb-6"></div>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-24 bg-muted/5 rounded-2xl"></div>
          ))}
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper title="Pending Approvals" subtitle="Connection error">
        <div className="text-center py-20 bg-white rounded-2xl border border-muted shadow-sm">
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

  return (
    <PageWrapper title="Pending Approvals" subtitle="Students awaiting your clearance">
      {/* Search & Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-widest font-bold text-navy/40">Group:</label>
          <select value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)}
            className="px-4 py-2 rounded-xl border border-muted bg-white text-sm focus:outline-none focus:ring-2 focus:ring-navy/5 font-semibold text-navy">
            <option value="all">Check All Classes</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Find roll no or name..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-muted bg-white text-sm focus:outline-none focus:ring-2 focus:ring-navy/5" />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-6 bg-offwhite rounded-xl p-1 w-fit">
        {FILTERS.map((f) => {
          const count = (approvals || []).filter((a) => f === 'all' || a.action === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
                ${filter === f ? 'bg-white text-navy shadow-sm' : 'text-muted-foreground hover:text-navy'}`}>
              {f === 'all' ? 'All' : f === 'due_marked' ? 'Dues' : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1.5 opacity-40">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Approval Cards */}
      <div className="space-y-4">
        {filtered.map((item) => (
          <div key={item._id} className="bg-white rounded-2xl border border-muted shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-black text-navy flex items-center gap-2">
                  <span className="bg-navy/5 text-navy px-2 py-0.5 rounded font-mono text-xs">{item.studentRollNo}</span>
                  <span className="truncate">{item.studentName}</span>
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[11px] font-bold text-muted-foreground/60">{item.className || 'Batch'}</span>
                  <span className="w-1 h-1 bg-muted rounded-full"></span>
                  <span className="text-[10px] uppercase font-black tracking-widest text-gold">
                    {getApprovalLabel(item)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {item.action === 'pending' ? (
                  <>
                    <Button variant="primary" size="sm" onClick={() => handleApprove(item._id)}>
                      <Check size={14} /> Approve
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setExpandedDue(expandedDue === item._id ? null : item._id)}>
                      <X size={14} /> Mark Due
                    </Button>
                  </>
                ) : (
                  <Badge status={item.action} />
                )}
              </div>
            </div>

            {item.action === 'due_marked' && (
              <div className="mt-4 p-4 rounded-xl bg-red-50/50 border border-red-100/50">
                <p className="text-[9px] font-black text-red-600 uppercase tracking-widest flex items-center gap-1.5">
                  <AlertTriangle size={10} strokeWidth={3} /> Flagged: {item.dueType}
                </p>
                {item.remarks && <p className="text-xs font-medium text-red-800 mt-1 italic">"{item.remarks}"</p>}
              </div>
            )}

            {expandedDue === item._id && (
              <DueForm
                onSubmit={(data) => handleDueSubmit(item._id, data)}
                onCancel={() => setExpandedDue(null)}
              />
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-20 bg-offwhite/50 rounded-2xl border border-dashed border-muted">
            <p className="text-sm font-black text-navy/20 uppercase tracking-widest">No candidates found for this view</p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
};

export default Pending;
