import axios from 'axios';

// API origin. Empty means same origin (the Vite proxy in development, the same host in production).
export const backendUrl = import.meta.env.VITE_BACKEND_URL || '';

// Shared axios instance. Cookie auth, JSON by default. Pass full '/api/...' paths.
const api = axios.create({
  baseURL: backendUrl,
  withCredentials: true,
});

export const errorMessage = (error, fallback = 'Something went wrong') =>
  error?.response?.data?.message || error?.message || fallback;

export const errorCode = (error) => error?.response?.data?.code;

export default api;
