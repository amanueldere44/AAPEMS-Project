import { apiRequest } from './api.js';
import { toQuery } from './leadershipApi.js';

// Client for /api/improvement (offices, referrals, support activities)
// and the lookups the referral screens need. Matches src/routes/improvement.routes.js.

const send = (method, body) => ({ method, body: JSON.stringify(body ?? {}) });
const data = (promise) => promise.then((result) => result?.data);

// Offices
export const listOffices = () => data(apiRequest('/improvement/offices'));
export const createOffice = (name) => data(apiRequest('/improvement/offices', send('POST', { name })));
export const updateOffice = (id, body) => data(apiRequest(`/improvement/offices/${id}`, send('PATCH', body)));
export const listOfficeMembers = (id) => data(apiRequest(`/improvement/offices/${id}/members`));
export const addOfficeMember = (officeId, userId) =>
  data(apiRequest(`/improvement/offices/${officeId}/members/${userId}`, send('PUT')));
export const removeOfficeMember = (officeId, userId) =>
  data(apiRequest(`/improvement/offices/${officeId}/members/${userId}`, { method: 'DELETE' }));

// Referrals and support activities
export const listReferrals = (params) => data(apiRequest(`/improvement/referrals${toQuery(params)}`));
export const getReferral = (id) => data(apiRequest(`/improvement/referrals/${id}`));
export const createReferral = (body) => data(apiRequest('/improvement/referrals', send('POST', body)));
export const acknowledgeReferral = (id) => data(apiRequest(`/improvement/referrals/${id}/acknowledge`, send('POST')));
export const addActivity = (referralId, body) =>
  data(apiRequest(`/improvement/referrals/${referralId}/activities`, send('POST', body)));
export const updateActivity = (id, body) => data(apiRequest(`/improvement/activities/${id}`, send('PATCH', body)));

// Lookups
// Finalized summaries the signed-in user may refer (the reports API applies their scope).
export async function listReferableSummaries() {
  const [reviewed, archived] = await Promise.all(
    ['reviewed', 'archived'].map((status) =>
      apiRequest(`/reports/summaries${toQuery({ status, limit: 100 })}`).then((r) => r?.data?.items ?? []),
    ),
  );
  return [...reviewed, ...archived];
}
// Active users who hold the office role, for the member picker (administrator only).
export const listOfficeUsers = () =>
  apiRequest(`/users${toQuery({ role: 'concerned_office', limit: 100 })}`).then((r) =>
    (r?.data?.users ?? []).filter((u) => u.status === 'active'),
  );