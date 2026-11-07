import api from './client';

// Thin wrappers over the Phase 3B endpoints. Each returns response.data.
const scopeParams = (courseId, cohortId, extra = {}) => {
  const params = { courseId, ...extra };
  if (cohortId) params.cohortId = cohortId;
  return params;
};

const get = async (path, params) => (await api.get(path, { params })).data;

export const lecturer = {
  failurePatterns: (c, k) => get('/api/analytics/lecturer/failure-patterns', scopeParams(c, k)),
  topicHeatmap: (c, k) => get('/api/analytics/lecturer/topic-heatmap', scopeParams(c, k)),
  studentsNeedingHelp: (c, k, thresholds) => get('/api/analytics/lecturer/students-needing-help', scopeParams(c, k, thresholds)),
  questionQuality: (c, k, overExposurePct) =>
    get('/api/analytics/lecturer/question-quality', scopeParams(c, k, overExposurePct ? { overExposurePct } : {})),
  activity: (c, k, days) => get('/api/analytics/lecturer/activity', scopeParams(c, k, { days })),
};

const careerParams = (f = {}) => {
  const p = {};
  if (f.courseId) p.courseId = f.courseId;
  if (f.cohortId) p.cohortId = f.cohortId;
  return p;
};

export const careers = {
  readiness: (f) => get('/api/analytics/careers/readiness', careerParams(f)),
  coverage: (f) => get('/api/analytics/careers/coverage', careerParams(f)),
  skillsGap: (f, threshold) => get('/api/analytics/careers/skills-gap', { ...careerParams(f), ...(threshold ? { threshold } : {}) }),
  readinessCsv: async (f) => {
    const res = await api.get('/api/analytics/careers/readiness.csv', { params: careerParams(f), responseType: 'blob' });
    return res.data;
  },
};

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
