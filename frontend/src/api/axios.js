import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to inject the JWT Bearer token dynamically
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = window.localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor to handle unauthorized / expired token responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        const publicRoutes = ['/login', '/register', '/', '/forgot-password', '/reset-password'];
        const isPublic = publicRoutes.includes(currentPath) || currentPath.startsWith('/auth/callback');

        window.localStorage.removeItem('token');
        window.localStorage.removeItem('user');
        window.localStorage.removeItem('syncscript_loggedin');

        if (!isPublic) {
          window.localStorage.setItem('syncscript_redirect_after_login', currentPath);
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

