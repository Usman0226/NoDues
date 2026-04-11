export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatRollNo = (rollNo) => {
  if (!rollNo) return '—';
  return rollNo.toUpperCase();
};
