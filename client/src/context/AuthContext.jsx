import React, { createContext, useContext, useState, useEffect } from 'react';
import { ROLES } from '../utils/constants';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const storedUser = JSON.parse(localStorage.getItem('user'));
          if (storedUser) setUser(storedUser);
        } catch (error) {
          localStorage.removeItem('token');
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, []);

  const login = async (credentials) => {
    let mockUser = null;

    // Student login (roll number only)
    if (credentials.rollNo) {
      mockUser = {
        id: 100,
        name: 'Riya Sharma',
        role: ROLES.STUDENT,
        rollNo: credentials.rollNo,
        department: 'CSE',
        semester: 5,
        academicYear: '2025-26',
      };
    }
    // Staff login (email + password)
    else {
      const { email } = credentials;
      if (email.includes('admin')) {
        mockUser = { id: 1, name: 'Admin User', role: ROLES.ADMIN, email, departmentId: null };
      } else if (email.includes('hod')) {
        mockUser = { id: 2, name: 'Dr. Ramesh Kumar', role: ROLES.HOD, email, departmentId: 'dept-cse', department: 'CSE' };
      } else if (email.includes('faculty')) {
        mockUser = { id: 3, name: 'Dr. Anand Sharma', role: ROLES.FACULTY, email, departmentId: 'dept-cse', department: 'CSE', roleTags: ['faculty'] };
      } else {
        mockUser = { id: 1, name: 'Admin User', role: ROLES.ADMIN, email, departmentId: null };
      }
    }

    setUser(mockUser);
    localStorage.setItem('token', 'mock-jwt-token');
    localStorage.setItem('user', JSON.stringify(mockUser));
    return mockUser;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
