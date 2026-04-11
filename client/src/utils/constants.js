export const ROLES = {
  ADMIN: 'ADMIN',
  HOD: 'HOD',
  FACULTY: 'FACULTY',
  STUDENT: 'STUDENT',
};

export const STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DUE_MARKED: 'due_marked',
  CLEARED: 'cleared',
  HAS_DUES: 'has_dues',
  HOD_OVERRIDE: 'hod_override',
};

export const DUE_TYPES = [
  { value: 'library', label: 'Library' },
  { value: 'lab', label: 'Lab' },
  { value: 'fees', label: 'Fees' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'other', label: 'Other' },
];

export const APPROVAL_TYPES = {
  SUBJECT: 'subject',
  CLASS_TEACHER: 'classTeacher',
  MENTOR: 'mentor',
};
