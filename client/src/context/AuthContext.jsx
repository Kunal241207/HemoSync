import React, { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Restore authenticated session on application load
  const restoreSession = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getMe();
      if (res && res.data) {
        setUser(res.data);
      } else {
        apiClient.setToken(null);
        setUser(null);
      }
    } catch (err) {
      apiClient.setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      apiClient.setToken(null);
      setUser(null);
      setAuthError('Your session ended. Please sign in again.');
    };

    window.addEventListener('hemosync:session-expired', handleSessionExpired);
    return () => window.removeEventListener('hemosync:session-expired', handleSessionExpired);
  }, []);

  const login = async (email, password) => {
    setAuthError(null);
    try {
      const res = await apiClient.login({ email, password });
      const authenticatedUser = res?.data?.user;
      const token = res?.data?.token;
      if (token) {
        apiClient.setToken(token);
      }
      setUser(authenticatedUser);
      return authenticatedUser;
    } catch (err) {
      setAuthError(err.message || 'Login failed');
      throw err;
    }
  };

  const register = async (userData) => {
    setAuthError(null);
    try {
      const res = await apiClient.register(userData);
      return res?.data;
    } catch (err) {
      setAuthError(err.message || 'Registration failed');
      throw err;
    }
  };

  const logout = async () => {
    try {
      await apiClient.logout();
    } catch (err) {
      console.warn('Error during backend logout:', err.message);
    } finally {
      apiClient.setToken(null);
      setUser(null);
      setAuthError(null);
    }
  };

  const value = {
    user,
    isAuthenticated: Boolean(user),
    role: user?.role || null,
    institution: user?.institution || null,
    loading,
    authError,
    login,
    register,
    logout,
    restoreSession
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
