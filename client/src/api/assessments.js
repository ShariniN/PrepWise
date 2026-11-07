import api from './client';

const d = (p) => p.then((r) => r.data);

// Shared (staff and student see different views from the same URLs).
export const listAssessments = () => d(api.get('/api/assessments'));
export const getAssessment = (id) => d(api.get(`/api/assessments/${id}`));

// Student.
export const startAssessment = (id) => d(api.post(`/api/assessments/${id}/start`, {}));
export const getSession = (sid) => d(api.get(`/api/assessments/sessions/${sid}`));
export const getSessionQuestion = (sid, qid) => d(api.get(`/api/assessments/sessions/${sid}/questions/${qid}`));
export const runSessionQuestion = (sid, qid, body) => d(api.post(`/api/assessments/sessions/${sid}/questions/${qid}/run`, body));
export const submitSessionQuestion = (sid, qid, body) => d(api.post(`/api/assessments/sessions/${sid}/questions/${qid}/submit`, body));
export const autosaveSessionQuestion = (sid, qid, body) => d(api.put(`/api/assessments/sessions/${sid}/questions/${qid}/autosave`, body));
export const postSessionEditEvents = (sid, qid, body) => d(api.post(`/api/assessments/sessions/${sid}/questions/${qid}/events`, body));
export const finishSession = (sid) => d(api.post(`/api/assessments/sessions/${sid}/finish`, {}));
export const getSessionResults = (sid) => d(api.get(`/api/assessments/sessions/${sid}/results`));

// Staff.
export const createAssessment = (body) => d(api.post('/api/assessments', body));
export const updateAssessment = (id, body) => d(api.put(`/api/assessments/${id}`, body));
export const setAssessmentStatus = (id, status) => d(api.patch(`/api/assessments/${id}/status`, { status }));
export const putAccommodation = (id, userId, body) => d(api.put(`/api/assessments/${id}/accommodations/${userId}`, body));
export const deleteAccommodation = (id, userId) => d(api.delete(`/api/assessments/${id}/accommodations/${userId}`));
export const listAssessmentSessions = (id) => d(api.get(`/api/assessments/${id}/sessions`));
export const extendSession = (id, sid, body) => d(api.post(`/api/assessments/${id}/sessions/${sid}/extend`, body));
