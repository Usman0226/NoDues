/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useEffect } from 'react';
import * as authService from '../api/auth';
import { toast } from 'react-hot-toast';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    const token = localStorage.getItem('nds_token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      // Guide §4.5: GET /api/auth/me returns success:true, data: {...user}
      const response = await authService.getMe();
      if (response?.success) {
        setUser(response.data);
      } else {
        setUser(null);
        localStorage.removeItem('nds_token');
      }
    } catch (error) {
      console.error('Session restore failed:', error);
      setUser(null);
      localStorage.removeItem('nds_token');
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
        if (response.token) {
          localStorage.setItem('nds_token', response.token);
        }
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
        if (response.token) {
          localStorage.setItem('nds_token', response.token);
        }
        setUser(response.data);
        toast.success(`Logged in as ${rollNo}`);
      }
      return response;
    } catch (error) {
      toast.error(error.message || 'Student login failed');
      throw error;
    }
  };

  const handlePassChange = async (email)=>{
      try{
        if(!email) {
          toast.error('Please enter your email first');
          return;
        }
        const response = await authService.forgotPassword(email);
        if(response.success) {
          toast.success(response.message || 'Temporary password sent if email exists');
        }
      }catch(err){
          toast.error(err.message || 'Failed to request password reset');
      } 
  }

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.warn('Logout request failed, clearing local state anyway',error);
    } finally {
      localStorage.removeItem('nds_token');
      setUser(null);
      toast.success('Logged out successfully');
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, studentLogin, handlePassChange,logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

