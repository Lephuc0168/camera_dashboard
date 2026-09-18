import axios from 'axios';

const customIp = localStorage.getItem('custom_backend_ip');
let defaultApiBase = '/api';

if (customIp) {
  defaultApiBase = `http://${customIp}:8000/api`;
} else if ((import.meta as any).env?.DEV) {
  // During local development (Vite dev server on port 5173)
  const host = window.location.hostname || 'localhost';
  defaultApiBase = `http://${host}:8000/api`;
}

export const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || defaultApiBase;


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

