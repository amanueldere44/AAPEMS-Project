import { z } from 'zod';
import { pool } from '../config/database.js';
import { httpError } from '../utils/http.js';
import { writeAudit } from '../utils/audit.js';
import { inTransaction, parseBody } from '../utils/db.js';

/**
 * Archiving of final evaluation summaries at the three levels named in the
 * workflow: department, college/school/institute, and university archives.
 *
 * A summary can be archived only after it was finalized and forwarded by the
 * report office (the existing forward-to-archive step). Each level is recorded
 * once. When all three levels are recorded the summary becomes "archived".
 */

export const ARCHIVE_LEVELS = Object.freeze(['department', 'college_school_institute', 'university']);

const bodySchema = z.object({ archiveReference: z.string().trim().max(120).nullable().optional() });
const listSchema = z.object({
  state: z.enum(['pending', 'archived']).optional(),
  cycleId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function assertLevel(level) {
  if (!ARCHIVE_LEVELS.includes(level)) throw httpError(404, 'Unknown archive level.', 'NOT_FOUND');
}

// Summaries that were forwarded to the archive, with the levels already recorded.
export async function listSummaries(query) {
  const q = parseBody(listSchema, query, 'Invalid filter.');
  const where = ['rt.forwarded_at IS NOT NULL'];
  const params = [];
  if (q.state === 'pending') where.push("s.status = 'reviewed'");
  if (q.state === 'archived') where.push("s.status = 'archived'");
  if (q.cycleId) { where.push('s.cycle_id = ?'); params.push(q.cycleId); }
  const clause = `WHERE ${where.join(' AND ')}`;
  const from = `FROM evaluation_summaries s
                JOIN evaluation_report_routing rt ON rt.summary_id = s.id
                JOIN evaluation_cycles cy ON cy.id = s.cycle_id
                JOIN users u ON u.id = s.instructor_id`;

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from} ${clause}`, params);
  const [rows] = await pool.query(
    `SELECT s.id AS summaryId, s.cycle_id AS cycleId, cy.title AS cycleTitle, cy.academic_year AS academicYear,
            s.instructor_id AS instructorId, u.name AS instructorName, s.total_score AS totalScore,
            s.status, rt.forwarded_at AS forwardedAt, rt.archived_at AS archivedAt,
            (SELECT GROUP_CONCAT(ar.archive_level) FROM evaluation_archive_records ar WHERE ar.summary_id = s.id) AS levels
       ${from} ${clause}
      ORDER BY rt.forwarded_at DESC, s.id DESC
      LIMIT ? OFFSET ?`,
    [...params, q.pageSize, (q.page - 1) * q.pageSize],
  );
  return {
    items: rows.map((r) => {
      const recorded = r.levels ? r.levels.split(',') : [];
      return {
        ...r,
        summaryId: Number(r.summaryId), cycleId: Number(r.cycleId), instructorId: Number(r.instructorId),
        recordedLevels: ARCHIVE_LEVELS.filter((l) => recorded.includes(l)),
        pendingLevels: ARCHIVE_LEVELS.filter((l) => !recorded.includes(l)),
        levels: undefined,
      };
    }),
    page: q.page, pageSize: q.pageSize, total: Number(total),
  };
}

export async function listLevels(summaryId) {
  const [[summary]] = await pool.execute('SELECT id FROM evaluation_summaries WHERE id = ?', [summaryId]);
  if (!summary) throw httpError(404, 'Evaluation summary not found.', 'NOT_FOUND');
  const [rows] = await pool.execute(
    `SELECT ar.archive_level AS level, ar.archived_at AS archivedAt, ar.archive_reference AS archiveReference,
            ar.archived_by AS archivedBy, u.name AS archivedByName
       FROM evaluation_archive_records ar JOIN users u ON u.id = ar.archived_by
      WHERE ar.summary_id = ?`,
    [summaryId],
  );
  return ARCHIVE_LEVELS.map((level) => {
    const rec = rows.find((r) => r.level === level);
    return rec ? { ...rec, archivedBy: Number(rec.archivedBy), recorded: true } : { level, recorded: false };
  });
}

export async function recordLevel(user, summaryId, level, body, ipAddress) {
  assertLevel(level);
  const { archiveReference } = parseBody(bodySchema, body, 'Invalid archive reference.');

  return inTransaction(async (connection) => {
    const [[summary]] = await connection.execute(
      'SELECT id, status FROM evaluation_summaries WHERE id = ? FOR UPDATE', [summaryId],
    );
    if (!summary) throw httpError(404, 'Evaluation summary not found.', 'NOT_FOUND');
    if (summary.status === 'archived') throw httpError(409, 'This report is already archived.', 'ALREADY_ARCHIVED');
    if (summary.status !== 'reviewed') throw httpError(409, 'Only a finalized report can be archived.', 'NOT_FINALIZED');

    const [[routing]] = await connection.execute(
      'SELECT forwarded_at FROM evaluation_report_routing WHERE summary_id = ? FOR UPDATE', [summaryId],
    );
    if (!routing?.forwarded_at) {
      throw httpError(409, 'The report must be forwarded to the archive before it can be recorded at a level.', 'NOT_FORWARDED');
    }

    try {
      await connection.execute(
        `INSERT INTO evaluation_archive_records (summary_id, archive_level, archived_by, archived_at, archive_reference)
         VALUES (?, ?, ?, NOW(), ?)`,
        [summaryId, level, Number(user.id), archiveReference || null],
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw httpError(409, 'This level has already been recorded.', 'LEVEL_ALREADY_RECORDED');
      throw error;
    }
    await writeAudit(connection, {
      userId: Number(user.id), action: 'report_archived_at_level', entityType: 'evaluation_summary',
      entityId: summaryId, details: { level, archiveReference: archiveReference || null }, ipAddress,
    });

    const [[{ recorded }]] = await connection.execute(
      'SELECT COUNT(*) AS recorded FROM evaluation_archive_records WHERE summary_id = ?', [summaryId],
    );
    const complete = Number(recorded) >= ARCHIVE_LEVELS.length;
    if (complete) {
      await connection.execute(
        'UPDATE evaluation_report_routing SET archived_by = ?, archived_at = NOW() WHERE summary_id = ?',
        [Number(user.id), summaryId],
      );
      await connection.execute("UPDATE evaluation_summaries SET status = 'archived' WHERE id = ?", [summaryId]);
      await writeAudit(connection, {
        userId: Number(user.id), action: 'report_archived', entityType: 'evaluation_summary',
        entityId: summaryId, details: { levels: ARCHIVE_LEVELS }, ipAddress,
      });
    }
    return { summaryId, level, recordedLevels: Number(recorded), status: complete ? 'archived' : 'reviewed' };
  });
}