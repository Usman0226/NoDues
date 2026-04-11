import React, { createContext, useContext, useState, useEffect } from 'react';
import * as authService from '../api/auth';
import { toast } from 'react-hot-toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
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
    try {
      // In production, the backend might set an httpOnly cookie, 
      // but we support payload-based token return as well.
      const response = await authService.login(credentials);
      
      // If token is in payload (common in some setups), store it
      if (response.token) {
        localStorage.setItem('token', response.token);
      }
      
      setUser(response.user || response); // Handle different response shapes
      toast.success('Welcome back!');
      return response;
    } catch (error) {
      toast.error(error.message || 'Login failed');
      throw error;
    }
  };

  const studentLogin = async (rollNo) => {
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
