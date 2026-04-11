import React from 'react';

const STATUS_MAP = {
  approved:     { bg: 'bg-emerald-50/80', text: 'text-emerald-800', dot: 'bg-emerald-500', label: 'Approved' },
  pending:      { bg: 'bg-amber-50/90', text: 'text-amber-800', dot: 'bg-amber-500', label: 'Pending' },
  due_marked:   { bg: 'bg-red-50/90', text: 'text-red-800', dot: 'bg-red-500', label: 'Due Marked' },
  cleared:      { bg: 'bg-emerald-50/80', text: 'text-emerald-800', dot: 'bg-emerald-500', label: 'Cleared' },
  has_dues:     { bg: 'bg-red-50/90', text: 'text-red-800', dot: 'bg-red-500', label: 'Has Dues' },
  hod_override: { bg: 'bg-indigo-50/90', text: 'text-indigo-800', dot: 'bg-indigo-500', label: 'HoD Cleared' },
};

const Badge = ({ status, children, className = '' }) => {
  const style = STATUS_MAP[status] || STATUS_MAP.pending;

  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.22em] border border-current/10 ${style.bg} ${style.text} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></span>
      {children || style.label || status}
    </span>
  );
};

export default Badge;
