import React, { createContext, useContext, useState, useEffect } from 'react';
import * as authService from '../api/auth';
import { toast } from 'react-hot-toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const DEMO_USERS = {
    'admin@mits.ac.in': { id: 'd1', name: 'Demo Administrator', role: 'ADMIN', email: 'admin@mits.ac.in' },
    'hod_cse@mits.ac.in': { id: 'd2', name: 'Dr. Sarah (HOD CSE)', role: 'HOD', department: 'CSE', email: 'hod_cse@mits.ac.in' },
    'faculty@mits.ac.in': { id: 'd3', name: 'Prof. Ramesh (Faculty)', role: 'FACULTY', email: 'faculty@mits.ac.in' },
    '21CSE001': { id: 'd4', name: 'Yugesh (Demo Student)', role: 'STUDENT', rollNo: '21CSE001', department: 'CSE' }
  };

  const fetchUser = async () => {
    try {
      // Guide §4.5: GET /api/auth/me returns success:true, data: {...user}
      const response = await authService.getMe();
      if (response?.success) {
        setUser(response.data);
      }
    } catch (error) {
      console.error('Session restore failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Rely on /api/auth/me for all session checks.
    // Cookies are automatically sent by the browser.
    fetchUser();
  }, []);

  const login = async (credentials) => {
    const { email, password } = credentials;
    
    // Bypass for Demo Staff (Guide Alignment)
    if (DEMO_USERS[email] && (password === 'admin123' || password === 'hod123' || password === 'faculty123')) {
      const demoUser = DEMO_USERS[email];
      setUser(demoUser);
      toast.success(`Demo Access: Authorized as ${demoUser.role}`);
      return { success: true, data: demoUser };
    }

    try {
      const response = await authService.login(credentials);
      // Guide: Response success envelope contains user info in 'data'
      if (response.success) {
        setUser(response.data);
        toast.success(`Welcome back, ${response.data.name}`);
      }
      return response;
    } catch (error) {
      toast.error(error.message || 'Login failed');
      throw error;
    }
  };

  const studentLogin = async (rollNo) => {
    // Bypass for Demo Student
    if (rollNo === '21CSE001') {
      const demoUser = DEMO_USERS[rollNo];
      setUser(demoUser);
      toast.success(`Demo Access: Authorized Student`);
      return { success: true, data: demoUser };
    }

    try {
      const response = await authService.studentLogin(rollNo);
      if (response.success) {
        setUser(response.data);
        toast.success(`Logged in as Roll No: ${rollNo}`);
      }
      return response;
    } catch (error) {
      toast.error(error.message || 'Student login failed');
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.warn('Logout request failed, clearing local state anyway');
    } finally {
      setUser(null);
      toast.success('Logged out successfully');
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, studentLogin, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
