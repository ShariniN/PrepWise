import api from './client';

const d = (p) => p.then((r) => r.data);

// Staff review queue.
export const listCases = (params) => d(api.get('/api/integrity/cases', { params }));
export const getCase = (id) => d(api.get(`/api/integrity/cases/${id}`));
export const updateCase = (id, body) => d(api.patch(`/api/integrity/cases/${id}`, body));
export const analyseSession = (sid) => d(api.post(`/api/integrity/sessions/${sid}/analyse`, {}));
export const analyseAssessment = (aid) => d(api.post(`/api/integrity/assessments/${aid}/analyse`, {}));
export const runSimilarity = (aid, body = {}) => d(api.post(`/api/integrity/assessments/${aid}/similarity/run`, body));
export const getSimilarity = (aid, params) => d(api.get(`/api/integrity/assessments/${aid}/similarity`, { params }));
export const getReplay = (sid, questionId) => d(api.get(`/api/integrity/sessions/${sid}/replay`, { params: questionId ? { questionId } : {} }));

// Student: own escalated cases.
export const listMyCases = () => d(api.get('/api/integrity/my/cases'));
export const getMyCase = (id) => d(api.get(`/api/integrity/my/cases/${id}`));
export const respondToCase = (id, text) => d(api.post(`/api/integrity/my/cases/${id}/response`, { text }));

// Student: integrity signals for a running session.
export const postIntegrityEvents = (sid, events) =>
  d(api.post(`/api/assessments/sessions/${sid}/integrity-events`, { events }));

// Used with fetch + keepalive when the page is going away.
export const integrityEventsUrl = (sid) =>
  `${import.meta.env.VITE_BACKEND_URL || ''}/api/assessments/sessions/${sid}/integrity-events`;
