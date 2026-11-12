import api from '../../lib/apiClient';

// Thin wrappers over /api/practice. Components handle errors themselves.
export const listQuestions = (params) => api.get('/api/practice/questions', { params }).then((r) => r.data);
export const getQuestion = (id) => api.get(`/api/practice/questions/${id}`).then((r) => r.data);
export const runQuestion = (id, body) => api.post(`/api/practice/questions/${id}/run`, body).then((r) => r.data);
export const submitQuestion = (id, body) => api.post(`/api/practice/questions/${id}/submit`, body).then((r) => r.data);
export const recordBrowserRun = (id, body) => api.post(`/api/practice/questions/${id}/browser-run`, body).then((r) => r.data);
export const getDraft = (id) => api.get(`/api/practice/questions/${id}/draft`).then((r) => r.data);
export const createDraft = (id) => api.post(`/api/practice/questions/${id}/attempts`).then((r) => r.data);
export const autosave = (attemptId, body) => api.put(`/api/practice/attempts/${attemptId}/autosave`, body).then((r) => r.data);

// True when the sandbox is down (503 / verdict unavailable).
export const isUnavailable = (err) =>
  err?.response?.status === 503 || err?.response?.data?.verdict === 'unavailable';
