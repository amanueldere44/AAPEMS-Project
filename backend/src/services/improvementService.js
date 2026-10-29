import { z } from 'zod';
import { pool } from '../config/database.js';
import { httpError } from '../utils/http.js';
import { writeAudit } from '../utils/audit.js';
import { inTransaction, parseBody } from '../utils/db.js';

/**
 * Improvement branch of the workflow: after the final evaluation summary,
 * performance gaps are referred to the concerned offices and directorates,
 * which plan support and capacity-building activities.
 *
 * Offices and their members are managed by an administrator. A committee member
 * or department head refers a finalized summary to an office; members of that
 * office acknowledge it and record support activities. Nothing here defines
 * official statuses beyond "acknowledged" and "completed".
 */

const idField = z.number().int().positive();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real calendar date.');

const officeSchema = z.object({ name: z.string().trim().min(1).max(180) });
const officePatchSchema = z
  .object({ name: z.string().trim().min(1).max(180).optional(), active: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.active !== undefined, { message: 'Nothing to update.' });
const referralSchema = z.object({
  summaryId: idField,
  officeId: idField,
  performanceGaps: z.string().trim().min(1).max(10000).optional(),
});
const activitySchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10000).nullable().optional(),
  targetDate: isoDate.nullable().optional(),
});
const activityPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(10000).nullable().optional(),
    targetDate: isoDate.nullable().optional(),
    completed: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update.' });
const listSchema = z.object({
  summaryId: z.coerce.number().int().positive().optional(),
  officeId: z.coerce.number().int().positive().optional(),
  acknowledged: z.enum(['yes', 'no']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/* ------------------------------------------------------------------ */
/* Concerned offices (administrator)                                   */
/* ------------------------------------------------------------------ */

export async function listOffices(user) {
  if (user.role === 'admin') {
    const [rows] = await pool.query(
      `SELECT o.id, o.name, o.active,
              (SELECT COUNT(*) FROM concerned_office_members m WHERE m.office_id = o.id) AS memberCount,
              (SELECT COUNT(*) FROM improvement_referrals r WHERE r.office_id = o.id) AS referralCount
         FROM concerned_offices o ORDER BY o.name`,
    );
    return rows.map((r) => ({
      id: Number(r.id), name: r.name, active: Boolean(r.active),
      memberCount: Number(r.memberCount), referralCount: Number(r.referralCount),
    }));
  }
  const [rows] = await pool.query('SELECT id, name FROM concerned_offices WHERE active = 1 ORDER BY name');
  return rows.map((r) => ({ id: Number(r.id), name: r.name, active: true }));
}

export async function createOffice(user, body, ipAddress) {
  const data = parseBody(officeSchema, body, 'Invalid office.');
  return inTransaction(async (connection) => {
    let id;
    try {
      const [res] = await connection.execute('INSERT INTO concerned_offices (name) VALUES (?)', [data.name]);
      id = Number(res.insertId);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw httpError(409, 'An office with this name already exists.', 'DUPLICATE_OFFICE');
      throw error;
    }
    await writeAudit(connection, {
      userId: Number(user.id), action: 'concerned_office_created', entityType: 'concerned_office',
      entityId: id, details: { name: data.name }, ipAddress,
    });
    return { id, name: data.name, active: true };
  });
}

export async function updateOffice(user, officeId, body, ipAddress) {
  const data = parseBody(officePatchSchema, body, 'Invalid office.');
  return inTransaction(async (connection) => {
    const [[office]] = await connection.execute('SELECT id FROM concerned_offices WHERE id = ? FOR UPDATE', [officeId]);
    if (!office) throw httpError(404, 'Office not found.', 'NOT_FOUND');
    const sets = [];
    const params = [];
    if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name); }
    if (data.active !== undefined) { sets.push('active = ?'); params.push(data.active ? 1 : 0); }
    try {
      await connection.execute(`UPDATE concerned_offices SET ${sets.join(', ')} WHERE id = ?`, [...params, officeId]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw httpError(409, 'An office with this name already exists.', 'DUPLICATE_OFFICE');
      throw error;
    }
    await writeAudit(connection, {
      userId: Number(user.id), action: 'concerned_office_updated', entityType: 'concerned_office',
      entityId: officeId, details: data, ipAddress,
    });
    return { id: officeId, ...data };
  });
}

export async function listMembers(officeId) {
  const [[office]] = await pool.execute('SELECT id FROM concerned_offices WHERE id = ?', [officeId]);
  if (!office) throw httpError(404, 'Office not found.', 'NOT_FOUND');
  const [rows] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.status
       FROM concerned_office_members m JOIN users u ON u.id = m.user_id
      WHERE m.office_id = ? ORDER BY u.name`,
    [officeId],
  );
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

export async function addMember(user, officeId, userId, ipAddress) {
  return inTransaction(async (connection) => {
    const [[office]] = await connection.execute('SELECT id FROM concerned_offices WHERE id = ? FOR UPDATE', [officeId]);
    if (!office) throw httpError(404, 'Office not found.', 'NOT_FOUND');
    const [[person]] = await connection.execute('SELECT role, status FROM users WHERE id = ?', [userId]);
    if (!person || person.status !== 'active' || person.role !== 'concerned_office') {
      throw httpError(422, 'Members must be active users with the role "concerned_office".', 'INVALID_PARTICIPANT');
    }
    try {
      await connection.execute('INSERT INTO concerned_office_members (office_id, user_id) VALUES (?, ?)', [officeId, userId]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw httpError(409, 'This user is already a member.', 'ALREADY_MEMBER');
      throw error;
    }
    await writeAudit(connection, {
      userId: Number(user.id), action: 'concerned_office_member_added', entityType: 'concerned_office',
      entityId: officeId, details: { memberId: userId }, ipAddress,
    });
    return { officeId, userId };
  });
}

export async function removeMember(user, officeId, userId, ipAddress) {
  return inTransaction(async (connection) => {
    const [res] = await connection.execute(
      'DELETE FROM concerned_office_members WHERE office_id = ? AND user_id = ?', [officeId, userId],
    );
    if (!res.affectedRows) throw httpError(404, 'Membership not found.', 'NOT_FOUND');
    await writeAudit(connection, {
      userId: Number(user.id), action: 'concerned_office_member_removed', entityType: 'concerned_office',
      entityId: officeId, details: { memberId: userId }, ipAddress,
    });
    return { officeId, userId, removed: true };
  });
}

/* ------------------------------------------------------------------ */
/* Visibility                                                          */
/* ------------------------------------------------------------------ */

// Same scope rules as the reports: a department head sees their own department,
// a dean their own faculty; office members see only referrals sent to their office.
function visibilityClause(user) {
  switch (user.role) {
    case 'admin':
    case 'committee':
      return { clause: '1 = 1', params: [] };
    case 'department_head':
      return {
        clause: `EXISTS (SELECT 1 FROM employees viewer JOIN employees target ON target.department_id = viewer.department_id
                          WHERE viewer.user_id = ? AND viewer.department_id IS NOT NULL AND target.user_id = s.instructor_id)`,
        params: [Number(user.id)],
      };
    case 'dean':
      return {
        clause: `EXISTS (SELECT 1 FROM employees viewer
                           JOIN departments vd ON vd.id = viewer.department_id
                           JOIN employees target ON target.user_id = s.instructor_id
                           JOIN departments td ON td.id = target.department_id
                          WHERE viewer.user_id = ? AND viewer.department_id IS NOT NULL AND vd.faculty_id = td.faculty_id)`,
        params: [Number(user.id)],
      };
    case 'concerned_office':
      return {
        clause: 'r.office_id IN (SELECT m.office_id FROM concerned_office_members m WHERE m.user_id = ?)',
        params: [Number(user.id)],
      };
    default:
      return { clause: '1 = 0', params: [] };
  }
}

async function assertOfficeMember(connection, user, officeId) {
  const [rows] = await connection.execute(
    'SELECT 1 AS ok FROM concerned_office_members WHERE office_id = ? AND user_id = ?',
    [officeId, Number(user.id)],
  );
  if (!rows.length) throw httpError(404, 'Referral not found.', 'NOT_FOUND');
}

/* ------------------------------------------------------------------ */
/* Referrals                                                           */
/* ------------------------------------------------------------------ */

const REFERRAL_SELECT = `
  SELECT r.id, r.summary_id AS summaryId, s.cycle_id AS cycleId, cy.title AS cycleTitle,
         cy.academic_year AS academicYear, s.instructor_id AS instructorId, iu.name AS instructorName,
         r.office_id AS officeId, o.name AS officeName, r.performance_gaps AS performanceGaps,
         r.referred_by AS referredBy, rb.name AS referredByName, r.created_at AS referredAt,
         r.acknowledged_by AS acknowledgedBy, r.acknowledged_at AS acknowledgedAt,
         (SELECT COUNT(*) FROM support_activities a WHERE a.referral_id = r.id) AS activityCount,
         (SELECT COUNT(*) FROM support_activities a WHERE a.referral_id = r.id AND a.completed_at IS NOT NULL) AS completedCount
    FROM improvement_referrals r
    JOIN evaluation_summaries s ON s.id = r.summary_id
    JOIN evaluation_cycles cy ON cy.id = s.cycle_id
    JOIN users iu ON iu.id = s.instructor_id
    JOIN concerned_offices o ON o.id = r.office_id
    JOIN users rb ON rb.id = r.referred_by`;

function shapeReferral(r) {
  return {
    ...r,
    id: Number(r.id), summaryId: Number(r.summaryId), cycleId: Number(r.cycleId),
    instructorId: Number(r.instructorId), officeId: Number(r.officeId), referredBy: Number(r.referredBy),
    acknowledgedBy: r.acknowledgedBy === null ? null : Number(r.acknowledgedBy),
    activityCount: Number(r.activityCount), completedCount: Number(r.completedCount),
  };
}

export async function createReferral(user, body, ipAddress) {
  const data = parseBody(referralSchema, body, 'Invalid referral.');
  return inTransaction(async (connection) => {
    const [[summary]] = await connection.execute(
      'SELECT id, instructor_id, status, committee_improvements FROM evaluation_summaries WHERE id = ? FOR UPDATE',
      [data.summaryId],
    );
    if (!summary) throw httpError(404, 'Evaluation summary not found.', 'NOT_FOUND');

    if (user.role === 'department_head') {
      const [rows] = await connection.execute(
        `SELECT 1 AS ok FROM employees viewer JOIN employees target ON target.department_id = viewer.department_id
          WHERE viewer.user_id = ? AND viewer.department_id IS NOT NULL AND target.user_id = ? LIMIT 1`,
        [Number(user.id), Number(summary.instructor_id)],
      );
      if (!rows.length) throw httpError(404, 'Evaluation summary not found.', 'NOT_FOUND');
    }
    if (Number(user.id) === Number(summary.instructor_id)) {
      throw httpError(403, 'You cannot refer your own evaluation.', 'SELF_REVIEW');
    }
    if (!['reviewed', 'archived'].includes(summary.status)) {
      throw httpError(409, 'Only a finalized evaluation summary can be referred.', 'NOT_FINALIZED');
    }

    const [[office]] = await connection.execute('SELECT id, name, active FROM concerned_offices WHERE id = ?', [data.officeId]);
    if (!office) throw httpError(404, 'Office not found.', 'NOT_FOUND');
    if (!office.active) throw httpError(409, 'This office is not active.', 'OFFICE_INACTIVE');

    const gaps = data.performanceGaps || summary.committee_improvements;
    if (!gaps || !String(gaps).trim()) {
      throw httpError(400, 'Describe the performance gaps; the summary has no areas for improvement recorded.', 'VALIDATION_ERROR');
    }

    let id;
    try {
      const [res] = await connection.execute(
        'INSERT INTO improvement_referrals (summary_id, office_id, performance_gaps, referred_by) VALUES (?, ?, ?, ?)',
        [data.summaryId, data.officeId, gaps, Number(user.id)],
      );
      id = Number(res.insertId);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw httpError(409, 'This summary was already referred to this office.', 'ALREADY_REFERRED');
      throw error;
    }

    await connection.execute(
      `INSERT INTO notifications (user_id, title, message)
       SELECT m.user_id, 'New performance-improvement referral', ?
         FROM concerned_office_members m JOIN users u ON u.id = m.user_id
        WHERE m.office_id = ? AND u.status = 'active'`,
      [`A finalized evaluation summary (#${data.summaryId}) was referred to ${office.name}.`, data.officeId],
    );
    await writeAudit(connection, {
      userId: Number(user.id), action: 'improvement_referral_created', entityType: 'improvement_referral',
      entityId: id, details: { summaryId: data.summaryId, officeId: data.officeId }, ipAddress,
    });
    return { id, summaryId: data.summaryId, officeId: data.officeId };
  });
}

export async function listReferrals(user, query) {
  const q = parseBody(listSchema, query, 'Invalid filter.');
  const vis = visibilityClause(user);
  const where = [vis.clause];
  const params = [...vis.params];
  if (q.summaryId) { where.push('r.summary_id = ?'); params.push(q.summaryId); }
  if (q.officeId) { where.push('r.office_id = ?'); params.push(q.officeId); }
  if (q.acknowledged === 'yes') where.push('r.acknowledged_at IS NOT NULL');
  if (q.acknowledged === 'no') where.push('r.acknowledged_at IS NULL');
  const clause = `WHERE ${where.join(' AND ')}`;

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM improvement_referrals r JOIN evaluation_summaries s ON s.id = r.summary_id ${clause}`,
    params,
  );
  const [rows] = await pool.query(
    `${REFERRAL_SELECT} ${clause} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`,
    [...params, q.pageSize, (q.page - 1) * q.pageSize],
  );
  return { items: rows.map(shapeReferral), page: q.page, pageSize: q.pageSize, total: Number(total) };
}

export async function getReferral(user, referralId) {
  const vis = visibilityClause(user);
  const [rows] = await pool.query(`${REFERRAL_SELECT} WHERE r.id = ? AND ${vis.clause}`, [referralId, ...vis.params]);
  if (!rows[0]) throw httpError(404, 'Referral not found.', 'NOT_FOUND');
  const [activities] = await pool.execute(
    `SELECT a.id, a.title, a.description, a.target_date AS targetDate, a.completed_at AS completedAt,
            a.created_by AS createdBy, cu.name AS createdByName, a.created_at AS createdAt
       FROM support_activities a JOIN users cu ON cu.id = a.created_by
      WHERE a.referral_id = ? ORDER BY a.created_at, a.id`,
    [referralId],
  );
  return {
    ...shapeReferral(rows[0]),
    activities: activities.map((a) => ({
      ...a, id: Number(a.id), createdBy: Number(a.createdBy),
      targetDate: a.targetDate instanceof Date ? a.targetDate.toISOString().slice(0, 10) : a.targetDate,
    })),
  };
}

export async function acknowledgeReferral(user, referralId, ipAddress) {
  return inTransaction(async (connection) => {
    const [[referral]] = await connection.execute(
      'SELECT id, office_id, acknowledged_at FROM improvement_referrals WHERE id = ? FOR UPDATE', [referralId],
    );
    if (!referral) throw httpError(404, 'Referral not found.', 'NOT_FOUND');
    await assertOfficeMember(connection, user, referral.office_id);
    if (referral.acknowledged_at) throw httpError(409, 'This referral was already acknowledged.', 'ALREADY_ACKNOWLEDGED');
    await connection.execute(
      'UPDATE improvement_referrals SET acknowledged_by = ?, acknowledged_at = NOW() WHERE id = ?', [Number(user.id), referralId],
    );
    await writeAudit(connection, {
      userId: Number(user.id), action: 'improvement_referral_acknowledged', entityType: 'improvement_referral',
      entityId: referralId, details: {}, ipAddress,
    });
    return { id: referralId, acknowledged: true };
  });
}

/* ------------------------------------------------------------------ */
/* Support activities (office members)                                 */
/* ------------------------------------------------------------------ */

export async function createActivity(user, referralId, body, ipAddress) {
  const data = parseBody(activitySchema, body, 'Invalid activity.');
  return inTransaction(async (connection) => {
    const [[referral]] = await connection.execute(
      'SELECT id, office_id FROM improvement_referrals WHERE id = ? FOR UPDATE', [referralId],
    );
    if (!referral) throw httpError(404, 'Referral not found.', 'NOT_FOUND');
    await assertOfficeMember(connection, user, referral.office_id);
    const [res] = await connection.execute(
      'INSERT INTO support_activities (referral_id, title, description, target_date, created_by) VALUES (?, ?, ?, ?, ?)',
      [referralId, data.title, data.description || null, data.targetDate || null, Number(user.id)],
    );
    const id = Number(res.insertId);
    await writeAudit(connection, {
      userId: Number(user.id), action: 'support_activity_created', entityType: 'support_activity',
      entityId: id, details: { referralId }, ipAddress,
    });
    return { id, referralId };
  });
}

export async function updateActivity(user, activityId, body, ipAddress) {
  const data = parseBody(activityPatchSchema, body, 'Invalid activity.');
  return inTransaction(async (connection) => {
    const [[activity]] = await connection.execute(
      `SELECT a.id, a.completed_at, r.office_id, a.referral_id
         FROM support_activities a JOIN improvement_referrals r ON r.id = a.referral_id
        WHERE a.id = ? FOR UPDATE OF a`,
      [activityId],
    );
    if (!activity) throw httpError(404, 'Activity not found.', 'NOT_FOUND');
    await assertOfficeMember(connection, user, activity.office_id);

    const sets = [];
    const params = [];
    if (data.title !== undefined) { sets.push('title = ?'); params.push(data.title); }
    if (data.description !== undefined) { sets.push('description = ?'); params.push(data.description || null); }
    if (data.targetDate !== undefined) { sets.push('target_date = ?'); params.push(data.targetDate || null); }
    if (data.completed === true && !activity.completed_at) sets.push('completed_at = NOW()');
    if (data.completed === false) sets.push('completed_at = NULL');
    if (sets.length) {
      await connection.execute(`UPDATE support_activities SET ${sets.join(', ')} WHERE id = ?`, [...params, activityId]);
    }
    await writeAudit(connection, {
      userId: Number(user.id), action: 'support_activity_updated', entityType: 'support_activity',
      entityId: activityId, details: { referralId: Number(activity.referral_id), ...data }, ipAddress,
    });
    return { id: activityId };
  });
}