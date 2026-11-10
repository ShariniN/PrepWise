import api from '../../api/client';

// Grading queue endpoints. Each returns response.data.
export const grading = {
  queue: async (params) => (await api.get('/api/grading/queue', { params })).data,
  item: async (id) => (await api.get(`/api/grading/${id}`)).data,
  suggest: async (id) => (await api.post(`/api/grading/${id}/suggest`)).data,
  confirm: async (id, body) => (await api.patch(`/api/grading/${id}`, body)).data,
  bulkConfirm: async (items) => (await api.post('/api/grading/bulk-confirm', { items })).data,
};
