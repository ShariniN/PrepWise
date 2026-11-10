import api from '../../api/client';

// Admin analytics endpoints. Each returns response.data.
const get = async (path, params) => (await api.get(path, { params })).data;

export const admin = {
  overview: () => get('/api/analytics/admin/overview'),
  evidence: (includeStudents) =>
    get('/api/analytics/admin/evidence', { format: 'json', ...(includeStudents ? { includeStudents: 1 } : {}) }),
  evidenceCsv: async (includeStudents) => {
    const res = await api.get('/api/analytics/admin/evidence', {
      params: { format: 'csv', ...(includeStudents ? { includeStudents: 1 } : {}) },
      responseType: 'blob',
    });
    return res.data;
  },
};
