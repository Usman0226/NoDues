import React, { createContext, useContext, useState, useEffect } from 'react';
import * as authService from '../api/auth';
import { toast } from 'react-hot-toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
      console.warn('Logout request failed, clearing local state anyway',error);
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
