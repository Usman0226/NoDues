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
    const token = localStorage.getItem('token');
    
    // Bypass for Demo Session Persistence
    if (token?.startsWith('demo-token-')) {
      const emailOrRoll = token.replace('demo-token-', '');
      const demoUser = DEMO_USERS[emailOrRoll];
      if (demoUser) {
        setUser(demoUser);
        setLoading(false);
        return;
      }
    }

    try {
      const userData = await authService.getMe();
      setUser(userData);
    } catch (error) {
      console.error('Session restore failed:', error);
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (credentials) => {
    const { email, password } = credentials;
    
    // Bypass for Demo Staff
    if (DEMO_USERS[email] && (password === 'admin123' || password === 'hod123' || password === 'faculty123')) {
      const demoUser = DEMO_USERS[email];
      localStorage.setItem('token', `demo-token-${email}`);
      setUser(demoUser);
      toast.success(`Demo Access: Authorized as ${demoUser.role}`);
      return { user: demoUser, token: `demo-token-${email}` };
    }

    try {
      const response = await authService.login(credentials);
      if (response.token) {
        localStorage.setItem('token', response.token);
      }
      setUser(response.user || response);
      toast.success('Welcome back!');
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
      localStorage.setItem('token', `demo-token-${rollNo}`);
      setUser(demoUser);
      toast.success(`Demo Access: Authorized Student`);
      return { user: demoUser, token: `demo-token-${rollNo}` };
    }

    try {
      const response = await authService.studentLogin(rollNo);
      if (response.token) {
        localStorage.setItem('token', response.token);
      }
      setUser(response.user || response);
      toast.success(`Logged in as Roll No: ${rollNo}`);
      return response;
    } catch (error) {
      toast.error(error.message || 'Student login failed');
      throw error;
    }
  };

  const logout = async () => {
    const token = localStorage.getItem('token');
    
    if (token?.startsWith('demo-token-')) {
      setUser(null);
      localStorage.removeItem('token');
      toast.success('Demo logout successful');
      return;
    }

    try {
      await authService.logout();
    } catch (error) {
      console.warn('Logout request failed, clearing local state anyway');
    } finally {
      setUser(null);
      localStorage.removeItem('token');
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
