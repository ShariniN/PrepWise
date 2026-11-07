import axios from 'axios';

// Shared axios instance for the Phase 1 pages. Cookie auth, JSON by default.
// Pass full '/api/...' paths. Without VITE_BACKEND_URL the Vite proxy is used.
const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL || '',
  withCredentials: true,
});

export const errorMessage = (error, fallback = 'Something went wrong') =>
  error?.response?.data?.message || error?.message || fallback;

export const errorCode = (error) => error?.response?.data?.code;

export default api;
