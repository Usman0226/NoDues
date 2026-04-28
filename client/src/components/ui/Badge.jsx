import React from 'react';

const STATUS_MAP = {
  approved:     { bg: 'bg-emerald-400/10', text: 'text-emerald-600', dot: 'bg-emerald-500', border: 'border-emerald-500/20', label: 'Approved' },
  pending:      { bg: 'bg-amber-400/10', text: 'text-amber-600', dot: 'bg-amber-500', border: 'border-amber-500/20', label: 'Pending' },
  due_marked:   { bg: 'bg-red-400/10', text: 'text-red-600', dot: 'bg-red-500', border: 'border-red-500/20', label: 'Due Marked' },
  cleared:      { bg: 'bg-emerald-400/10', text: 'text-emerald-600', dot: 'bg-emerald-500', border: 'border-emerald-500/20', label: 'Cleared' },
  has_dues:     { bg: 'bg-red-400/10', text: 'text-red-600', dot: 'bg-red-500', border: 'border-red-500/20', label: 'Has Dues' },
  hod_override: { bg: 'bg-indigo-400/10', text: 'text-indigo-600', dot: 'bg-indigo-500', border: 'border-indigo-500/20', label: 'HoD Cleared' },
  not_submitted: { bg: 'bg-slate-400/10', text: 'text-slate-600', dot: 'bg-slate-500', border: 'border-slate-500/20', label: 'Not Submitted' },
};

const Badge = ({ status, children, className = '' }) => {
  const style = STATUS_MAP[status] || STATUS_MAP.pending;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border ${style.bg} ${style.text} ${style.border} ${className}`}>
      <span className={`w-1 h-1 rounded-full ${style.dot} shadow-[0_0_8px_currentColor]`}></span>
      {children || style.label || status}
    </span>
  );
};

export default Badge;
