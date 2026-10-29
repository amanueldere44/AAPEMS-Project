import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { requireAuth, allowRoles } from '../middlewares/auth.js';
import { asyncHandler, httpError, sendData } from '../utils/http.js';
import { writeAudit } from '../utils/audit.js';

const router = Router();
router.use(requireAuth);

const READ_ROLES = ['admin', 'committee', 'department_head', 'dean', 'management'];
const STATUSES = ['upcoming', 'active', 'closed'];

// Forward-only lifecycle. A closed cycle can never be reopened.
const NEXT_STATUS = { upcoming: ['active'], active: ['closed'], closed: [] };

const cycleSchema = z
  .object({
    title: z.string().trim().min(3).max(255),
    academicYear: z.string().trim().min(4).max(20),
    startDate: z.string().date(),
    endDate: z.string().date(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'End date must not be before the start date.',
    path: ['endDate'],
  });

function validationError(zodError) {
  const issue = zodError.issues[0];
  const field = issue?.path?.join('.');
  return httpError(
    400,
    field ? `${field}: ${issue.message}` : issue?.message || 'Invalid request.',
    'VALIDATION_ERROR',
  );
}

function cycleId(req) {
  if (!/^[1-9]\d*$/.test(String(req.params.id))) {
    throw httpError(400, 'Invalid cycle ID.', 'VALIDATION_ERROR');
  }
  return req.params.id;
}

const cycleSelect = `
  SELECT c.id, c.title, c.academic_year,
         DATE_FORMAT(c.start_date, '%Y-%m-%d') AS start_date,
         DATE_FORMAT(c.end_date, '%Y-%m-%d') AS end_date,
         c.status,
         (SELECT COUNT(*) FROM evaluation_assignments a
           WHERE a.cycle_id = c.id) AS assignment_count,
         (SELECT COUNT(*) FROM evaluation_assignments a
           WHERE a.cycle_id = c.id AND a.status = 'submitted') AS submitted_count
    FROM evaluation_cycles c`;

function publicCycle(row) {
  const assignmentCount = Number(row.assignment_count ?? 0);

  return {
    id: row.id,
    title: row.title,
    academicYear: row.academic_year,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    assignmentCount,
    submittedCount: Number(row.submitted_count ?? 0),
    canEdit: row.status !== 'closed',
    canDelete: row.status === 'upcoming' && assignmentCount === 0,
  };
}

async function inTransaction(work) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function findDuplicate(connection, title, academicYear, excludeId = null) {
  const [rows] = await connection.execute(
    `SELECT id FROM evaluation_cycles
      WHERE title = ? AND academic_year = ? AND (? IS NULL OR id <> ?)
      LIMIT 1`,
    [title, academicYear, excludeId, excludeId],
  );
  return rows[0] ?? null;
}

const DUPLICATE_MESSAGE = 'A cycle with this title and academic year already exists.';

// GET /api/cycles
router.get(
  '/',
  allowRoles(...READ_ROLES),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `${cycleSelect} ORDER BY c.start_date DESC, c.id DESC`,
    );

    sendData(res, { cycles: rows.map(publicCycle), statuses: STATUSES });
  }),
);

// POST /api/cycles  (always created as "upcoming")
router.post(
  '/',
  allowRoles('admin'),
  asyncHandler(async (req, res) => {
    const parsed = cycleSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw validationError(parsed.error);

    const { title, academicYear, startDate, endDate } = parsed.data;

    const cycle = await inTransaction(async (connection) => {
      if (await findDuplicate(connection, title, academicYear)) {
        throw httpError(409, DUPLICATE_MESSAGE, 'DUPLICATE_CYCLE');
      }

      const [result] = await connection.execute(
        `INSERT INTO evaluation_cycles (title, academic_year, start_date, end_date, status)
         VALUES (?, ?, ?, ?, 'upcoming')`,
        [title, academicYear, startDate, endDate],
      );

      await writeAudit(connection, {
        userId: req.user.id,
        action: 'cycle.created',
        entityType: 'evaluation_cycle',
        entityId: result.insertId,
        details: { title, academicYear, startDate, endDate },
        ipAddress: req.ip,
      });

      const [rows] = await connection.execute(`${cycleSelect} WHERE c.id = ?`, [
        result.insertId,
      ]);
      return publicCycle(rows[0]);
    });

    sendData(res, { cycle }, 201);
  }),
);

// PUT /api/cycles/:id  (edit details; not allowed once closed)
router.put(
  '/:id',
  allowRoles('admin'),
  asyncHandler(async (req, res) => {
    const id = cycleId(req);
    const parsed = cycleSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw validationError(parsed.error);

    const { title, academicYear, startDate, endDate } = parsed.data;

    const cycle = await inTransaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT id, title, academic_year, status,
                DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
           FROM evaluation_cycles WHERE id = ? FOR UPDATE`,
        [id],
      );

      const current = rows[0];
      if (!current) throw httpError(404, 'Evaluation cycle not found.', 'CYCLE_NOT_FOUND');

      if (current.status === 'closed') {
        throw httpError(409, 'A closed cycle cannot be edited.', 'CYCLE_CLOSED');
      }

      if (await findDuplicate(connection, title, academicYear, id)) {
        throw httpError(409, DUPLICATE_MESSAGE, 'DUPLICATE_CYCLE');
      }

      await connection.execute(
        `UPDATE evaluation_cycles
            SET title = ?, academic_year = ?, start_date = ?, end_date = ?
          WHERE id = ?`,
        [title, academicYear, startDate, endDate, id],
      );

      await writeAudit(connection, {
        userId: req.user.id,
        action: 'cycle.updated',
        entityType: 'evaluation_cycle',
        entityId: current.id,
        details: {
          before: {
            title: current.title,
            academicYear: current.academic_year,
            startDate: current.start_date,
            endDate: current.end_date,
          },
          after: { title, academicYear, startDate, endDate },
        },
        ipAddress: req.ip,
      });

      const [updated] = await connection.execute(`${cycleSelect} WHERE c.id = ?`, [id]);
      return publicCycle(updated[0]);
    });

    sendData(res, { cycle });
  }),
);

// PATCH /api/cycles/:id/status  body: { status: 'active' | 'closed' }
router.patch(
  '/:id/status',
  allowRoles('admin'),
  asyncHandler(async (req, res) => {
    const id = cycleId(req);
    const status = req.body?.status;

    if (typeof status !== 'string' || !STATUSES.includes(status)) {
      throw httpError(400, `status: must be one of ${STATUSES.join(', ')}.`, 'VALIDATION_ERROR');
    }

    const cycle = await inTransaction(async (connection) => {
      // Lock every cycle row (the table is tiny) so two admins cannot
      // activate two different cycles at the same moment.
      const [all] = await connection.execute(
        'SELECT id, title, status FROM evaluation_cycles FOR UPDATE',
      );

      const current = all.find((row) => String(row.id) === String(id));
      if (!current) throw httpError(404, 'Evaluation cycle not found.', 'CYCLE_NOT_FOUND');

      if (current.status === status) {
        throw httpError(409, `The cycle is already ${status}.`, 'STATUS_UNCHANGED');
      }

      if (!NEXT_STATUS[current.status].includes(status)) {
        throw httpError(
          409,
          `A ${current.status} cycle cannot become ${status}.`,
          'INVALID_TRANSITION',
        );
      }

      if (status === 'active') {
        const other = all.find(
          (row) => row.status === 'active' && String(row.id) !== String(id),
        );

        if (other) {
          throw httpError(
            409,
            `"${other.title}" is already active. Close it first.`,
            'ANOTHER_CYCLE_ACTIVE',
          );
        }
      }

      await connection.execute('UPDATE evaluation_cycles SET status = ? WHERE id = ?', [
        status,
        id,
      ]);

      await writeAudit(connection, {
        userId: req.user.id,
        action: 'cycle.status_changed',
        entityType: 'evaluation_cycle',
        entityId: current.id,
        details: { previousStatus: current.status, newStatus: status },
        ipAddress: req.ip,
      });

      const [rows] = await connection.execute(`${cycleSelect} WHERE c.id = ?`, [id]);
      return publicCycle(rows[0]);
    });

    sendData(res, { cycle });
  }),
);

// DELETE /api/cycles/:id  (only an upcoming cycle with no assignments)
router.delete(
  '/:id',
  allowRoles('admin'),
  asyncHandler(async (req, res) => {
    const id = cycleId(req);

    try {
      await inTransaction(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT id, title, academic_year, status FROM evaluation_cycles WHERE id = ? FOR UPDATE',
          [id],
        );

        const cycle = rows[0];
        if (!cycle) throw httpError(404, 'Evaluation cycle not found.', 'CYCLE_NOT_FOUND');

        if (cycle.status !== 'upcoming') {
          throw httpError(409, 'Only an upcoming cycle can be deleted.', 'CYCLE_NOT_DELETABLE');
        }

        const [[usage]] = await connection.execute(
          'SELECT COUNT(*) AS total FROM evaluation_assignments WHERE cycle_id = ?',
          [id],
        );

        if (Number(usage.total) > 0) {
          throw httpError(
            409,
            'This cycle already has assignments and cannot be deleted.',
            'CYCLE_IN_USE',
          );
        }

        await connection.execute('DELETE FROM evaluation_cycles WHERE id = ?', [id]);

        await writeAudit(connection, {
          userId: req.user.id,
          action: 'cycle.deleted',
          entityType: 'evaluation_cycle',
          entityId: cycle.id,
          details: { title: cycle.title, academicYear: cycle.academic_year },
          ipAddress: req.ip,
        });
      });
    } catch (error) {
      if (error.code === 'ER_ROW_IS_REFERENCED_2') {
        throw httpError(409, 'This cycle is used by other records and cannot be deleted.', 'CYCLE_IN_USE');
      }
      throw error;
    }

    sendData(res, { deleted: true });
  }),
);

export default router;