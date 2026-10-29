import { apiRequest } from './api.js';

// Client for /api/leadership (Dean -> Department Head, Academic Affairs VP -> Dean).
// Paths and response shapes match src/routes/leadership.routes.js on the backend.

export const LEADERSHIP_TYPES = {
  dean_evaluates_department_head: {
    label: 'Dean evaluates Department Head',
    evaluator: 'Dean / Vice Dean',
    evaluatee: 'Department Head',
  },
  vp_evaluates_dean: {
    label: 'Academic Affairs VP evaluates Dean',
    evaluator: 'Academic Affairs Vice President / Vice Director',
    evaluatee: 'Dean',
  },
};

// Builds a query string and leaves out empty values, which the API would reject.
export function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

const send = (method, body) => ({ method, body: JSON.stringify(body ?? {}) });
const data = (promise) => promise.then((result) => result?.data);

export const getCycles = () =>
  apiRequest('/cycles').then((result) => result?.data?.cycles ?? []);

// Forms (administrator)
export const getLeadershipForms = () => data(apiRequest('/leadership/forms'));
export const getLeadershipVersion = (id) => data(apiRequest(`/leadership/versions/${id}`));
export const createLeadershipVersion = (type, body) =>
  data(apiRequest(`/leadership/forms/${type}/versions`, send('POST', body)));
export const updateLeadershipVersion = (id, body) =>
  data(apiRequest(`/leadership/versions/${id}`, send('PUT', body)));
export const publishLeadershipVersion = (id) =>
  data(apiRequest(`/leadership/versions/${id}/publish`, send('POST')));

// Assignments (administrator)
export const getLeadershipCandidates = (type) => data(apiRequest(`/leadership/candidates/${type}`));
export const assignLeadershipEvaluation = (body) =>
  data(apiRequest('/leadership/evaluations', send('POST', body)));
export const removeLeadershipEvaluation = (id) =>
  data(apiRequest(`/leadership/evaluations/${id}`, { method: 'DELETE' }));

// Evaluations (evaluator; administrator can read)
export const listLeadershipEvaluations = (params) =>
  data(apiRequest(`/leadership/evaluations${toQuery(params)}`));
export const getLeadershipEvaluation = (id) => data(apiRequest(`/leadership/evaluations/${id}`));
export const saveLeadershipDraft = (id, body) =>
  data(apiRequest(`/leadership/evaluations/${id}/draft`, send('PUT', body)));
export const submitLeadershipEvaluation = (id, body) =>
  data(apiRequest(`/leadership/evaluations/${id}/submit`, send('POST', body)));