import axios from 'axios';

const customIp = localStorage.getItem('custom_backend_ip');
const defaultBackendHost = customIp || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '10.39.4.131:8000' : `${window.location.hostname}:8000`);
const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || `http://${defaultBackendHost}/api`;


export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach Bearer Token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Interceptor to handle 401 Unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('access_token');
    }
    return Promise.reject(error);
  }
);

