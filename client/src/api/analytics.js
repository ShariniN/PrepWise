import api from './client';

// Thin wrappers over the admin analytics and grading endpoints. Each returns response.data.
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

export const grading = {
  queue: (params) => get('/api/grading/queue', params),
  item: async (id) => (await api.get(`/api/grading/${id}`)).data,
  suggest: async (id) => (await api.post(`/api/grading/${id}/suggest`)).data,
  confirm: async (id, body) => (await api.patch(`/api/grading/${id}`, body)).data,
  bulkConfirm: async (items) => (await api.post('/api/grading/bulk-confirm', { items })).data,
};

// Save a Blob as a file download.
export const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
