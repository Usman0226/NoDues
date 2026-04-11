import React from 'react';

const STATUS_MAP = {
  approved:     { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-600/60', label: 'Approved' },
  pending:      { bg: 'bg-amber-50',    text: 'text-amber-700',    dot: 'bg-amber-600/60',   label: 'Pending' },
  due_marked:   { bg: 'bg-red-50',      text: 'text-red-700',      dot: 'bg-red-600/60',     label: 'Due Marked' },
  cleared:      { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-600/60', label: 'Cleared' },
  has_dues:     { bg: 'bg-red-50',      text: 'text-red-700',      dot: 'bg-red-600/60',     label: 'Has Dues' },
  hod_override: { bg: 'bg-blue-50',     text: 'text-blue-700',     dot: 'bg-blue-600/60',    label: 'HoD Cleared' },
};

const Badge = ({ status, children, className = '' }) => {
  const style = STATUS_MAP[status] || STATUS_MAP.pending;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${style.bg} ${style.text} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></span>
      {children || style.label || status}
    </span>
  );
};

export default Badge;
