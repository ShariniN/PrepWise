import api from '../../api/client';

const d = (r) => r.data;

export const listBank = (params) => api.get('/api/questions', { params }).then(d);
export const getBankQuestion = (id) => api.get(`/api/questions/${id}`).then(d);
export const createBankQuestion = (body) => api.post('/api/questions', body).then(d);
export const updateBankQuestion = (id, body) => api.put(`/api/questions/${id}`, body).then(d);
export const deleteBankQuestion = (id) => api.delete(`/api/questions/${id}`).then(d);
export const duplicateQuestion = (id) => api.post(`/api/questions/${id}/duplicate`).then(d);

export const addTest = (id, body) => api.post(`/api/questions/${id}/tests`, body).then(d);
export const updateTest = (id, testId, body) => api.put(`/api/questions/${id}/tests/${testId}`, body).then(d);
export const deleteTest = (id, testId) => api.delete(`/api/questions/${id}/tests/${testId}`).then(d);

export const validateQuestion = (id, body) => api.post(`/api/questions/${id}/validate`, body || {}).then(d);
export const setStatus = (id, status) => api.patch(`/api/questions/${id}/status`, { status }).then(d);

export const getRubric = (id) => api.get(`/api/questions/${id}/rubric`).then(d);
export const saveRubric = (id, criteria) => api.put(`/api/questions/${id}/rubric`, { criteria }).then(d);
export const deleteRubric = (id) => api.delete(`/api/questions/${id}/rubric`).then(d);

export const draftWithAi = (body) => api.post('/api/questions/draft', body).then(d);
