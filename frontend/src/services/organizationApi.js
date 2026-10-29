import { apiRequest } from './api.js';
import { toQuery } from './leadershipApi.js';

// Client for /api/organization (administrator only): academic units, departments, department staff.
// Matches src/routes/organization.routes.js.

const send = (method, body) => ({ method, body: JSON.stringify(body ?? {}) });
const data = (promise) => promise.then((result) => result?.data);

// Academic units (colleges, schools, institutes)
export const listUnits = () => data(apiRequest('/organization/units'));
export const createUnit = (name) => data(apiRequest('/organization/units', send('POST', { name })));
export const updateUnit = (id, name) => data(apiRequest(`/organization/units/${id}`, send('PATCH', { name })));
export const deleteUnit = (id) => data(apiRequest(`/organization/units/${id}`, { method: 'DELETE' }));

// Departments
export const listDepartments = (params) => data(apiRequest(`/organization/departments${toQuery(params)}`));
export const createDepartment = (body) => data(apiRequest('/organization/departments', send('POST', body)));
export const updateDepartment = (id, body) => data(apiRequest(`/organization/departments/${id}`, send('PATCH', body)));
export const deleteDepartment = (id) => data(apiRequest(`/organization/departments/${id}`, { method: 'DELETE' }));

// Department staff
export const listDepartmentMembers = (id) => data(apiRequest(`/organization/departments/${id}/members`));
export const listUnassignedUsers = (search) => data(apiRequest(`/organization/unassigned-users${toQuery({ search })}`));
export const setDepartmentMember = (departmentId, userId, body) =>
  data(apiRequest(`/organization/departments/${departmentId}/members/${userId}`, send('PUT', body)));
export const removeDepartmentMember = (departmentId, userId) =>
  data(apiRequest(`/organization/departments/${departmentId}/members/${userId}`, { method: 'DELETE' }));