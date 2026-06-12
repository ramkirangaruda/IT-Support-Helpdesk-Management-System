import axios from 'axios';
import { getToken, setToken } from './token';

const api = axios.create({
  // Vite proxies /api → http://localhost:3000 in dev.
  // Override with VITE_API_URL for production builds.
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
});

// Attach JWT on every request
api.interceptors.request.use(config => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401: clear token and hard-redirect to login
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      setToken(null);
      window.location.replace('/login');
    }
    return Promise.reject(err);
  },
);

export default api;
