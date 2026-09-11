import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = window.localStorage.getItem('user');
        return cached ? JSON.parse(cached) : null;
      } catch {
        return null;
      }
    }
    return null;
  });
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
            window.localStorage.setItem('user', JSON.stringify(res.data));
            window.localStorage.setItem('syncscript_loggedin', '1');
          } catch (err) {
            console.error('Failed to load user', err);
            window.localStorage.removeItem('token');
            window.localStorage.removeItem('user');
            window.localStorage.removeItem('syncscript_loggedin');
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    }
    loadUser();
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password });
    const data = res.data;
    const userData = { _id: data._id, username: data.username, email: data.email };
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('token', data.token);
      window.localStorage.setItem('user', JSON.stringify(userData));
      window.localStorage.setItem('syncscript_loggedin', '1');
    }
    setUser(userData);
    return data;
  };

  const register = async (username, email, password) => {
    const res = await api.post('/api/auth/register', { username, email, password });
    const data = res.data;
    const userData = { _id: data._id, username: data.username, email: data.email };
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('token', data.token);
      window.localStorage.setItem('user', JSON.stringify(userData));
      window.localStorage.setItem('syncscript_loggedin', '1');
    }
    setUser(userData);
    return data;
  };

  const logout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('token');
      window.localStorage.removeItem('user');
      window.localStorage.removeItem('syncscript_loggedin');
    }
    setUser(null);
  };

  const updateProfile = async (username) => {
    const res = await api.put('/api/auth/me', { username });
    const data = res.data;
    const userData = { _id: data._id, username: data.username, email: data.email };
    if (typeof window !== 'undefined') {
      if (data.token) {
        window.localStorage.setItem('token', data.token);
      }
      window.localStorage.setItem('user', JSON.stringify(userData));
    }
    setUser(userData);
    return userData;
  };

  const refreshAuth = async () => {
    try {
      const res = await api.get('/api/auth/me');
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('user', JSON.stringify(res.data));
      }
      setUser(res.data);
      return res.data;
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
