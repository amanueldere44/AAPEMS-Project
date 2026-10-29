// One-time (and any-time) refresh of every EXISTING evaluation_summaries row using
// the central scoring service. Safe to run repeatedly. Archived rows are skipped.
// It does not create summary rows for instructors that have none yet.
//
//   cd backend
//   node scripts/recomputeSummaries.js

import { pool } from '../src/config/database.js';
import { recomputeInstructorSummary } from '../src/services/summaryService.js';

const connection = await pool.getConnection();
try {
  const [pairs] = await connection.execute(
    'SELECT cycle_id, instructor_id FROM evaluation_summaries ORDER BY cycle_id, instructor_id',
  );
  console.log(`Recalculating ${pairs.length} instructor/cycle summaries...`);

  for (const pair of pairs) {
    const cycleId = Number(pair.cycle_id);
    const instructorId = Number(pair.instructor_id);
    try {
      await connection.beginTransaction();
      const result = await recomputeInstructorSummary(connection, cycleId, instructorId);
      await connection.commit();
      const pending = result.form.pendingGroups.map((item) => `${item.type} ${item.submitted}/${item.assigned}`).join(', ');
      const missing = result.form.missingGroups.join(', ');
      console.log(
        `cycle ${cycleId} instructor ${instructorId}: ${result.status}` +
        ` total=${result.form.total ?? '-'} partial=${result.form.partialTotal}` +
        (missing ? ` missing=[${missing}]` : '') +
        (pending ? ` pending=[${pending}]` : ''),
      );
    } catch (error) {
      await connection.rollback();
      console.error(`cycle ${cycleId} instructor ${instructorId}: FAILED - ${error.message}`);
    }
  }
} finally {
  connection.release();
  await pool.end();
}