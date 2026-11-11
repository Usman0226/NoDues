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

export const getAcademicYearRoman = (semester) => {
  const sem = Number(semester);
  if (sem <= 2) return 'I';
  if (sem <= 4) return 'II';
  if (sem <= 6) return 'III';
  return 'IV';
};

export const formatSectionDisplayName = (name, semester) => {
  if (!name || typeof name !== 'string') return '';
  if (/curriculum\s*master/i.test(name)) return name;
  const semNum = Number(semester);
  const roman = semNum ? getAcademicYearRoman(semNum) : '';
  const cleanName = name
    .replace(/^([1-4]|I|II|III|IV)[\s\-_]+/i, '')
    .trim();
  return roman ? `${roman} ${cleanName}` : cleanName;
};
