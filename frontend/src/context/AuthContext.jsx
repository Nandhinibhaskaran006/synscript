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
            const userData = {
              _id: res.data._id,
              username: res.data.username,
              email: res.data.email,
              avatar: res.data.avatar || '',
              githubUrl: res.data.githubUrl || '',
            };
            setUser(userData);
            window.localStorage.setItem('user', JSON.stringify(userData));
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
    const userData = {
      _id: data._id,
      username: data.username,
      email: data.email,
      avatar: data.avatar || '',
      githubUrl: data.githubUrl || '',
    };
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
    const userData = {
      _id: data._id,
      username: data.username,
      email: data.email,
      avatar: data.avatar || '',
      githubUrl: data.githubUrl || '',
    };
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
      window.localStorage.removeItem('syncscript_active_roomId');
    }
    setUser(null);
  };

  const updateProfile = async (updates) => {
    const payload = typeof updates === 'string' ? { username: updates } : updates;
    const res = await api.put('/api/auth/me', payload);
    const data = res.data;
    const userData = {
      _id: data._id,
      username: data.username,
      email: data.email,
      avatar: data.avatar || '',
      githubUrl: data.githubUrl || '',
    };
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
      const userData = {
        _id: res.data._id,
        username: res.data.username,
        email: res.data.email,
        avatar: res.data.avatar || '',
        githubUrl: res.data.githubUrl || '',
      };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('user', JSON.stringify(userData));
      }
      setUser(userData);
      return userData;
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
