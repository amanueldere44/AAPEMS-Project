
import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireAuth } from '../middlewares/auth.js';
import { asyncHandler, sendData } from '../utils/http.js';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    const userId = Number(req.user.id);

    // The authentication middleware provides req.user.id.
    // Never use req.user.id here.
    const assignmentWhere = isAdmin
      ? ''
      : 'WHERE evaluator_id = ?';

    const values = isAdmin ? [] : [userId];

    const [assignmentRows] = await pool.execute(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(status = 'pending'), 0) AS pending,
         COALESCE(SUM(status = 'draft'), 0) AS draft,
         COALESCE(SUM(status = 'submitted'), 0) AS submitted
       FROM evaluation_assignments
       ${assignmentWhere}`,
      values,
    );

    const [cycles] = await pool.execute(
      `SELECT
         id,
         title,
         academic_year,
         start_date,
         end_date,
         status
       FROM evaluation_cycles
       ORDER BY start_date DESC
       LIMIT 10`,
    );

    const [recent] = await pool.execute(
      `SELECT
         a.id AS assignment_id,
         a.status AS assignment_status,
         f.code AS form_code,
         f.title AS form_title,
         u.name AS instructor_name,
         cy.title AS cycle_title,
         e.status AS evaluation_status,
         e.submitted_at
       FROM evaluation_assignments a
       JOIN evaluation_forms f ON f.id = a.form_id
       JOIN users u ON u.id = a.instructor_id
       JOIN evaluation_cycles cy ON cy.id = a.cycle_id
       LEFT JOIN evaluations e ON e.assignment_id = a.id
       ${isAdmin ? '' : 'WHERE a.evaluator_id = ?'}
       ORDER BY a.updated_at DESC
       LIMIT 8`,
      values,
    );

    let users = null;

    if (isAdmin) {
      const [userRows] = await pool.execute(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(status = 'active'), 0) AS active
         FROM users`,
      );

      users = userRows[0];
    }

    const activeCycles = cycles.filter(
      (cycle) => cycle.status === 'active',
    ).length;

    sendData(res, {
      counts: assignmentRows[0],
      users,
      activeCycles,
      cycles,
      recent,
    });
  }),
);

export default router;
