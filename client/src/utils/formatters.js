export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatRollNo = (rollNo) => {
  if (!rollNo) return '—';
  return rollNo.toUpperCase();
};

export const formatRole = (role) => {
  if (!role) return '—';
  const roles = {
    admin: 'Administrator',
    hod: 'HOD',
    ao: 'AO',
    faculty: 'Faculty Member',
    student: 'Student'
  };
  return roles[role.toLowerCase()] || role.toUpperCase();
};
