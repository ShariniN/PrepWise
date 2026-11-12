import api from '../../lib/apiClient';

// Dashboard API (/api/dashboard). Each returns response.data.
// Empty filters are left out so the server sees "all students".
const clean = (params = {}) => Object.fromEntries(
  Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
);

export const getOverview = (group) => api.get('/api/dashboard/overview', { params: clean({ group }) }).then((r) => r.data);

export const listStudents = (params) => api.get('/api/dashboard/students', { params: clean(params) }).then((r) => r.data);

// CSV of every matching row (no paging). The server writes an audit entry for each export.
export const downloadStudentsCsv = (params) =>
  api.get('/api/dashboard/students.csv', { params: clean(params), responseType: 'blob' }).then((r) => r.data);

// Viewing one student's record (profile or interview) is audited by the server.
export const getStudent = (id) => api.get(`/api/dashboard/students/${id}`).then((r) => r.data);

export const getStudentInterview = (id, interviewId) =>
  api.get(`/api/dashboard/students/${id}/interviews/${interviewId}`).then((r) => r.data);
