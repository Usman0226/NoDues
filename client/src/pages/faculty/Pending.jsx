import React, { useState, useCallback } from 'react';
import PageWrapper from '../../components/layout/PageWrapper';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { DUE_TYPES } from '../../utils/constants';
import { Check, X, ChevronDown, ChevronUp, Search } from 'lucide-react';

const MOCK_BATCHES = [
  { id: 'b1', className: 'CSE-A Sem 5' },
  { id: 'b2', className: 'CSE-B Sem 5' },
];

const MOCK_APPROVALS = [
  { id: 1, rollNo: '21CSE001', name: 'Arun Kumar', department: 'CSE', subject: 'Data Structures', subjectCode: 'CS301', approvalType: 'subject', action: 'pending', dueType: null, remarks: null },
  { id: 2, rollNo: '21CSE002', name: 'Priya Sharma', department: 'CSE', subject: 'Data Structures', subjectCode: 'CS301', approvalType: 'subject', action: 'pending', dueType: null, remarks: null },
  { id: 3, rollNo: '21CSE003', name: 'Rahul Verma', department: 'CSE', subject: null, subjectCode: null, approvalType: 'classTeacher', action: 'pending', dueType: null, remarks: null },
  { id: 4, rollNo: '21CSE004', name: 'Deepa Nair', department: 'CSE', subject: 'Data Structures', subjectCode: 'CS301', approvalType: 'subject', action: 'approved', dueType: null, remarks: null },
  { id: 5, rollNo: '21CSE005', name: 'Sneha R.', department: 'CSE', subject: null, subjectCode: null, approvalType: 'mentor', action: 'due_marked', dueType: 'attendance', remarks: 'Below 75%' },
  { id: 6, rollNo: '21CSE006', name: 'Kiran Raj', department: 'CSE', subject: 'Data Structures', subjectCode: 'CS301', approvalType: 'subject', action: 'pending', dueType: null, remarks: null },
  { id: 7, rollNo: '21CSE007', name: 'Meera S.', department: 'CSE', subject: null, subjectCode: null, approvalType: 'classTeacher', action: 'approved', dueType: null, remarks: null },
];

const FILTERS = ['all', 'pending', 'approved', 'due_marked'];

const getApprovalLabel = (item) => {
  if (item.approvalType === 'classTeacher') return 'Class Teacher';
  if (item.approvalType === 'mentor') return 'Mentor';
  return `${item.subject} (${item.subjectCode})`;
};

const DueForm = ({ onSubmit, onCancel }) => {
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
          className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
          <option value="">Select type...</option>
          {DUE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-widest font-bold text-red-600 mb-1">Remarks (required)</label>
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2}
          className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
          placeholder="Describe the due..." />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="danger" size="sm" type="submit" disabled={!dueType || !remarks.trim()}>Submit Due</Button>
        <Button variant="ghost" size="sm" type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
};

const Pending = () => {
  const [selectedBatch, setSelectedBatch] = useState(MOCK_BATCHES[0]?.id || '');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedDue, setExpandedDue] = useState(null);

  const filtered = MOCK_APPROVALS.filter((a) => {
    if (filter !== 'all' && a.action !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.rollNo.toLowerCase().includes(q);
    }
    return true;
  });

  const handleApprove = useCallback((id) => {
    // API call placeholder
  }, []);

  const handleDueSubmit = useCallback((id, data) => {
    setExpandedDue(null);
    // API call placeholder
  }, []);

  return (
    <PageWrapper title="Pending Approvals" subtitle="Students awaiting your clearance">
      {/* Batch Selector (PRD §6.5) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Batch:</label>
          <select value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)}
            className="px-3 py-2 rounded-xl border border-muted bg-white text-sm focus:outline-none focus:ring-2 focus:ring-navy/10">
            {MOCK_BATCHES.map((b) => <option key={b.id} value={b.id}>{b.className}</option>)}
          </select>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or roll..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-muted bg-white text-sm focus:outline-none focus:ring-2 focus:ring-navy/10" />
        </div>
      </div>

      {/* Filter Tabs (PRD §6.5) */}
      <div className="flex gap-1 mb-6 bg-offwhite rounded-xl p-1 w-fit">
        {FILTERS.map((f) => {
          const count = f === 'all' ? MOCK_APPROVALS.length : MOCK_APPROVALS.filter((a) => a.action === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
                ${filter === f ? 'bg-white text-navy shadow-sm' : 'text-muted-foreground hover:text-navy'}`}>
              {f === 'all' ? 'All' : f === 'due_marked' ? 'Due Marked' : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1 text-muted-foreground">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Approval Cards (PRD §6.5 — card layout) */}
      <div className="space-y-3">
        {filtered.map((item) => (
          <div key={item.id} className="bg-white rounded-2xl border border-muted shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                {/* Roll No FIRST (PRD §6.9) */}
                <p className="text-sm font-semibold text-navy">
                  <span className="font-mono tracking-wider">{item.rollNo}</span>
                  <span className="text-muted-foreground mx-1.5">·</span>
                  {item.name}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[11px] text-muted-foreground">{item.department}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-navy/5 text-navy font-semibold">
                    {getApprovalLabel(item)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {item.action === 'pending' && (
                  <>
                    <Button variant="primary" size="sm" onClick={() => handleApprove(item.id)}>
                      <Check size={14} /> Approve
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setExpandedDue(expandedDue === item.id ? null : item.id)}>
                      <X size={14} /> Mark Due
                      {expandedDue === item.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </Button>
                  </>
                )}
                {item.action !== 'pending' && (
                  <Badge status={item.action} />
                )}
              </div>
            </div>

            {/* Already actioned: show details */}
            {item.action === 'due_marked' && (
              <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-600">Due: {item.dueType}</span>
                {item.remarks && <p className="text-sm text-red-700 mt-1">"{item.remarks}"</p>}
              </div>
            )}

            {/* Inline Due Form (PRD §6.5 — expand) */}
            {expandedDue === item.id && (
              <DueForm
                onSubmit={(data) => handleDueSubmit(item.id, data)}
                onCancel={() => setExpandedDue(null)}
              />
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No approvals found for this filter.</p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
};

export default Pending;
