import { apiRequest } from './api.js';
import { toQuery } from './leadershipApi.js';

// Client for /api/archive. Matches src/routes/archive.routes.js.

export const ARCHIVE_LEVELS = {
  department: 'Department archives',
  college_school_institute: 'College / School / Institute archives',
  university: 'University archives',
};

const data = (promise) => promise.then((result) => result?.data);

export const listArchiveSummaries = (params) => data(apiRequest(`/archive/summaries${toQuery(params)}`));
export const getArchiveLevels = (summaryId) => data(apiRequest(`/archive/summaries/${summaryId}/levels`));
export const recordArchiveLevel = (summaryId, level, archiveReference) =>
  data(apiRequest(`/archive/summaries/${summaryId}/levels/${level}`, {
    method: 'POST',
    body: JSON.stringify({ archiveReference: archiveReference || null }),
  }));