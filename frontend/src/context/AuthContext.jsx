import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if token exists in localStorage and verify user on mount
    async function loadUser() {
      if (typeof window !== 'undefined') {
        const token = window.localStorage.getItem('token');
        if (token) {
          try {
            const res = await api.get('/api/auth/me');
            setUser(res.data);
          } catch (err) {
            console.error('Failed to load user', err);
            window.localStorage.removeItem('token');
            window.localStorage.removeItem('syncscript_loggedin');
          }
        }
      }
      setLoading(false);
    }
    loadUser();
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password });
    const data = res.data;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('token', data.token);
      window.localStorage.setItem('syncscript_loggedin', '1');
    }
    setUser({ _id: data._id, username: data.username, email: data.email });
    return data;
  };

  const register = async (username, email, password) => {
    const res = await api.post('/api/auth/register', { username, email, password });
    const data = res.data;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('token', data.token);
      window.localStorage.setItem('syncscript_loggedin', '1');
    }
    setUser({ _id: data._id, username: data.username, email: data.email });
    return data;
  };

  const logout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('token');
      window.localStorage.removeItem('syncscript_loggedin');
    }
    setUser(null);
  };

  const updateProfile = async (username) => {
    const res = await api.put('/api/auth/me', { username });
    const data = res.data;
    if (typeof window !== 'undefined' && data.token) {
      window.localStorage.setItem('token', data.token);
    }
    setUser({ _id: data._id, username: data.username, email: data.email });
    return data;
  };

  const refreshAuth = async () => {
    try {
      const res = await api.get('/api/auth/me');
      setUser(res.data);
    } catch (err) {
      console.error('Failed to refresh user', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile, refreshAuth, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
