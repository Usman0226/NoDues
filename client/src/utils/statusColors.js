export const STATUS_COLORS = {
  pending:      { bg: 'bg-amber-50',    text: 'text-amber-600',    border: 'border-amber-200' },
  approved:     { bg: 'bg-emerald-50',  text: 'text-emerald-600',  border: 'border-emerald-200' },
  due_marked:   { bg: 'bg-red-50',      text: 'text-red-600',      border: 'border-red-200' },
  cleared:      { bg: 'bg-emerald-50',  text: 'text-emerald-600',  border: 'border-emerald-200' },
  has_dues:     { bg: 'bg-red-50',      text: 'text-red-600',      border: 'border-red-200' },
  hod_override: { bg: 'bg-blue-50',     text: 'text-blue-600',     border: 'border-blue-200' },
};

export const getStatusColor = (status) => STATUS_COLORS[status] || STATUS_COLORS.pending;
