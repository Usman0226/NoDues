import { ROLES } from './constants';

export const getRoleRedirect = (role) => {
  switch (role) {
    case ROLES.ADMIN: return '/admin';
    case ROLES.HOD: return '/hod';
    case ROLES.FACULTY: return '/faculty/pending';
    case ROLES.STUDENT: return '/student';
    default: return '/login';
  }
};
