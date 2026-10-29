import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { requireAuth, allowRoles } from '../middlewares/auth.js';
import { asyncHandler, httpError, sendData } from '../utils/http.js';
import { writeAudit } from '../utils/audit.js';

// Evaluation tasks = rows of evaluation_assignments.
// Committee members and department heads manage only the tasks of their own department: staff are linked through employees.department_id and students through
// student_departments.department_id. The limit is enforced here on the server, not in the UI.
//
// The course of a task always comes from a course assignment (course_instructors joined to courses),
// never from the client. Its code and title are copied (snapshot) into evaluation_assignments, so
// later changes to the course catalog do not alter existing tasks.
const router = Router();
// The system administrator has no role in choosing evaluators: that belongs to the committee and the
// department head, each for their own department.
router.use(requireAuth, allowRoles('committee', 'department_head'));

// Returns null for administrators (no limit) or the department id of a committee member / department head.
async function scopeFor(db, user) {
  if (user.role === 'admin') return null;
  const [rows] = await db.execute(
    'SELECT department_id FROM employees WHERE user_id = ? LIMIT 1', [Number(user.id)],
  );
  const departmentId = rows[0]?.department_id;
  if (!departmentId) {
    throw httpError(403, 'Your account is not assigned to a department. Ask an administrator to assign one.', 'NO_DEPARTMENT');
  }
  return Number(departmentId);
}

const IN_DEPARTMENT = `SELECT user_id FROM employees WHERE department_id = ?
                       UNION SELECT user_id FROM student_departments WHERE department_id = ?`;

async function departmentUserIds(db, departmentId) {
  const [rows] = await db.execute(IN_DEPARTMENT, [departmentId, departmentId]);
  return new Set(rows.map((row) => Number(row.user_id)));
}

const id = z.number().int().positive();

const createSchema = z.object({
  cycleId: id,
  instructorId: id,
  assignmentId: id, // course_instructors.id
  batch: z.enum(['I', 'II', 'III', 'IV', 'V']).nullable().optional(),
  studentIds: z.array(id).max(500).default([]),
  departmentHeadId: id.nullable().optional(),
  peerIds: z.array(id).max(50).default([]),
  includeSelf: z.boolean().default(true),
});

// Assignment semester (1 / 2, "Semester 1", "II", ...) -> task semester ('I' / 'II'), or null.
function toTaskSemester(value) {
  const text = String(value ?? '').trim().toUpperCase();
  if (/(^|[^A-Z0-9])(2|II|TWO|SECOND)([^A-Z0-9]|$)/.test(text)) return 'II';
  if (/(^|[^A-Z0-9])(1|I|ONE|FIRST)([^A-Z0-9]|$)/.test(text)) return 'I';
  return null;
}

// Academic years are compared as trimmed, case-insensitive text ("2026" matches " 2026 ").
function sameYear(a, b) {
  const clean = (value) => String(value ?? '').trim().toLowerCase();
  return clean(a) === clean(b);
}

function parseId(value, label) {
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw httpError(400, `Invalid ${label}.`, 'VALIDATION_ERROR');
  }
  return Number(value);
}

// GET /api/tasks/candidates - active users that can be chosen as evaluators.
router.get('/candidates', asyncHandler(async (req, res) => {
  const departmentId = await scopeFor(pool, req.user);
  const limit = departmentId === null ? '' : `AND u.id IN (${IN_DEPARTMENT})`;
  const [rows] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.role,
            (SELECT e.department_id FROM employees e WHERE e.user_id = u.id LIMIT 1) AS department_id
       FROM users u
      WHERE u.status = 'active' AND u.role IN ('student', 'teacher', 'department_head') ${limit}
      ORDER BY u.name`,
    departmentId === null ? [] : [departmentId, departmentId],
  );
  const pick = (role) => rows
    .filter((row) => row.role === role)
    .map((row) => ({
      id: Number(row.id),
      name: row.name,
      email: row.email,
      departmentId: row.department_id === null || row.department_id === undefined ? null : Number(row.department_id),
    }));

  // Course assignments of the listed teachers (only active courses).
  const teachers = pick('teacher');
  const byInstructor = new Map();
  if (teachers.length) {
    const [assignments] = await pool.query(
      `SELECT ci.id, ci.instructor_id, ci.academic_year, ci.semester, c.title, c.course_code
         FROM course_instructors ci JOIN courses c ON c.id = ci.course_id
        WHERE c.active = 1 AND ci.instructor_id IN (?)
        ORDER BY c.title, ci.academic_year DESC, ci.id`,
      [teachers.map((teacher) => teacher.id)],
    );
    for (const row of assignments) {
      const list = byInstructor.get(Number(row.instructor_id)) ?? [];
      list.push({
        id: Number(row.id),
        courseCode: row.course_code,
        courseTitle: row.title,
        academicYear: row.academic_year,
        semester: toTaskSemester(row.semester),
      });
      byInstructor.set(Number(row.instructor_id), list);
    }
  }
  sendData(res, {
    instructors: teachers.map((teacher) => ({ ...teacher, assignments: byInstructor.get(teacher.id) ?? [] })),
    students: pick('student'),
    departmentHeads: pick('department_head'),
  });
}));

// GET /api/tasks?cycleId=&page=&limit=
router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const departmentId = await scopeFor(pool, req.user);
  const values = [];
  const conditions = [];
  if (req.query.cycleId) {
    conditions.push('a.cycle_id = ?');
    values.push(parseId(req.query.cycleId, 'cycleId'));
  }
  if (departmentId !== null) {
    conditions.push('a.instructor_id IN (SELECT user_id FROM employees WHERE department_id = ?)');
    values.push(departmentId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM evaluation_assignments a ${where}`, values,
  );
  const [rows] = await pool.query(
    `SELECT a.id, a.cycle_id, cy.title AS cycle_title, f.code AS form_code,
            instructor.name AS instructor_name, evaluator.name AS evaluator_name,
            a.course_title, a.course_code, a.batch, a.semester, a.status,
            e.status AS evaluation_status
       FROM evaluation_assignments a
       JOIN evaluation_cycles cy ON cy.id = a.cycle_id
       JOIN evaluation_forms f ON f.id = a.form_id
       JOIN users instructor ON instructor.id = a.instructor_id
       JOIN users evaluator ON evaluator.id = a.evaluator_id
       LEFT JOIN evaluations e ON e.assignment_id = a.id
       ${where}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ? OFFSET ?`,
    [...values, limit, (page - 1) * limit],
  );

  sendData(res, {
    total: Number(total),
    page,
    limit,
    tasks: rows.map((row) => ({
      id: Number(row.id),
      cycleId: Number(row.cycle_id),
      cycleTitle: row.cycle_title,
      formCode: row.form_code,
      instructorName: row.instructor_name,
      evaluatorName: row.evaluator_name,
      courseTitle: row.course_title,
      courseCode: row.course_code,
      batch: row.batch,
      semester: row.semester,
      status: row.status,
      evaluationStatus: row.evaluation_status,
    })),
  });
}));

// POST /api/tasks - create the tasks for one instructor and course. Existing tasks are skipped.
router.post('/', asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw httpError(400, `${issue.path.join('.') || 'body'}: ${issue.message}`, 'VALIDATION_ERROR');
  }
  const input = parsed.data;
  const studentIds = [...new Set(input.studentIds)];
  const peerIds = [...new Set(input.peerIds)];

  if (peerIds.includes(input.instructorId)) {
    throw httpError(400, 'The instructor cannot be their own peer evaluator. Use self evaluation.', 'VALIDATION_ERROR');
  }

  if (input.departmentHeadId && Number(input.departmentHeadId) === Number(input.instructorId)) {
    throw httpError(400, 'The instructor cannot be their own department head evaluator. Use self evaluation.', 'VALIDATION_ERROR');
  }
  if (!studentIds.length && !input.departmentHeadId && !peerIds.length && !input.includeSelf) {
    throw httpError(400, 'Choose at least one evaluator.', 'VALIDATION_ERROR');
  }

  const departmentId = await scopeFor(pool, req.user);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [cycles] = await connection.execute(
      'SELECT * FROM evaluation_cycles WHERE id = ? FOR UPDATE', [input.cycleId],
    );
    if (!cycles[0]) throw httpError(404, 'Evaluation cycle not found.', 'NOT_FOUND');
    if (cycles[0].status === 'closed') throw httpError(409, 'This cycle is closed.', 'CYCLE_CLOSED');

    // The course comes from the instructor's course assignment, not from the client.
    const [assignmentRows] = await connection.execute(
      `SELECT ci.id, ci.semester, ci.academic_year, c.title, c.course_code, c.active
         FROM course_instructors ci JOIN courses c ON c.id = ci.course_id
        WHERE ci.id = ? AND ci.instructor_id = ?`,
      [input.assignmentId, input.instructorId],
    );
    const courseAssignment = assignmentRows[0];
    if (!courseAssignment) {
      throw httpError(400, 'This instructor has no such course assignment. Assign the course under Courses & instructors first.', 'NO_COURSE_ASSIGNMENT');
    }
    if (!Number(courseAssignment.active)) {
      throw httpError(409, 'This course is not active.', 'COURSE_INACTIVE');
    }
    // The assignment must belong to the academic year of the chosen cycle (checked when both have one).
    const cycleYear = cycles[0].academic_year ?? cycles[0].academicYear;
    if (String(cycleYear ?? '').trim() && String(courseAssignment.academic_year ?? '').trim()
        && !sameYear(cycleYear, courseAssignment.academic_year)) {
      throw httpError(
        409,
        `This course is assigned for ${courseAssignment.academic_year}, but the cycle is for ${cycleYear}.`,
        'ACADEMIC_YEAR_MISMATCH',
      );
    }
    const courseTitle = courseAssignment.title;
    const courseCode = courseAssignment.course_code;
    const semester = toTaskSemester(courseAssignment.semester);

    // Every (user, role) pair must match an active user. A user may fill only the role they really have.
    const wanted = [
      [input.instructorId, 'teacher'],
      ...studentIds.map((userId) => [userId, 'student']),
      ...peerIds.map((userId) => [userId, 'teacher']),
    ];
    if (input.departmentHeadId) wanted.push([input.departmentHeadId, 'department_head']);
    const userIds = [...new Set(wanted.map(([userId]) => userId))];
    if (departmentId !== null) {
      const allowed = await departmentUserIds(connection, departmentId);
      if (userIds.some((userId) => !allowed.has(userId))) {
        throw httpError(403, 'Every instructor and evaluator must belong to your department.', 'OUTSIDE_DEPARTMENT');
      }
    }
    const [users] = await connection.query(
      'SELECT id, role, status FROM users WHERE id IN (?)', [userIds],
    );
    const byId = new Map(users.map((user) => [Number(user.id), user]));
    for (const [userId, role] of wanted) {
      const user = byId.get(userId);
      if (!user || user.status !== 'active' || user.role !== role) {
        throw httpError(400, `User ${userId} must be an active ${role}.`, 'INVALID_EVALUATOR');
      }
    }

    // The department head evaluator must be the head of the instructor's own department.
    if (input.departmentHeadId) {
      const [sameDepartment] = await connection.execute(
        `SELECT 1 FROM employees head
           JOIN employees instructor ON instructor.department_id = head.department_id
          WHERE head.user_id = ? AND instructor.user_id = ? AND head.department_id IS NOT NULL
          LIMIT 1`,
        [input.departmentHeadId, input.instructorId],
      );
      if (!sameDepartment.length) {
        throw httpError(
          400,
          'The department head must belong to the same department as the instructor.',
          'HEAD_DEPARTMENT_MISMATCH',
        );
      }
    }

    // Each task uses the form version that is published right now.
    const [versions] = await connection.execute(
      `SELECT v.id AS version_id, f.id AS form_id, f.evaluator_type
         FROM form_versions v JOIN evaluation_forms f ON f.id = v.form_id
        WHERE v.status = 'published' AND f.is_active = 1`,
    );
    const formFor = new Map(versions.map((row) => [row.evaluator_type, row]));

    const planned = [
      ...studentIds.map((evaluatorId) => ['student', evaluatorId]),
      ...(input.departmentHeadId ? [['department_head', input.departmentHeadId]] : []),
      ...peerIds.map((evaluatorId) => ['peer', evaluatorId]),
      ...(input.includeSelf ? [['self', input.instructorId]] : []),
    ];
    for (const [type] of planned) {
      if (!formFor.has(type)) throw httpError(409, `No published form exists for ${type} evaluation.`, 'FORM_NOT_PUBLISHED');
    }

    const [existing] = await connection.execute(
      `SELECT form_id, evaluator_id FROM evaluation_assignments
        WHERE cycle_id = ? AND instructor_id = ? AND course_code = ? AND course_title = ?`,
      [input.cycleId, input.instructorId, courseCode, courseTitle],
    );
    const exists = new Set(existing.map((row) => `${row.form_id}:${row.evaluator_id}`));

    let created = 0;
    let skipped = 0;
    for (const [type, evaluatorId] of planned) {
      const form = formFor.get(type);
      if (exists.has(`${form.form_id}:${evaluatorId}`)) { skipped += 1; continue; }
      await connection.execute(
        `INSERT INTO evaluation_assignments
           (cycle_id, form_id, form_version_id, instructor_id, evaluator_id,
            course_title, course_code, batch, semester, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [input.cycleId, form.form_id, form.version_id, input.instructorId, evaluatorId,
          courseTitle, courseCode, input.batch ?? null, semester],
      );
      created += 1;
    }

    await writeAudit(connection, {
      userId: req.user.id,
      action: 'tasks.created',
      entityType: 'evaluation_cycle',
      entityId: input.cycleId,
      details: { instructorId: input.instructorId, assignmentId: input.assignmentId, courseCode, created, skipped, departmentId },
      ipAddress: req.ip,
    });
    await connection.commit();
    sendData(res, { created, skipped }, 201);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

// DELETE /api/tasks/:id - only tasks that nobody has started.
router.delete('/:id', asyncHandler(async (req, res) => {
  const taskId = parseId(req.params.id, 'task ID');
  const departmentId = await scopeFor(pool, req.user);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT a.id, a.instructor_id, a.status, cy.status AS cycle_status,
              (SELECT COUNT(*) FROM evaluations e WHERE e.assignment_id = a.id) AS evaluations
         FROM evaluation_assignments a JOIN evaluation_cycles cy ON cy.id = a.cycle_id
        WHERE a.id = ? FOR UPDATE`,
      [taskId],
    );
    const task = rows[0];
    if (!task) throw httpError(404, 'Task not found.', 'NOT_FOUND');
    if (departmentId !== null) {
      const allowed = await departmentUserIds(connection, departmentId);
      // Reported as "not found" so tasks of other departments are not revealed.
      if (!allowed.has(Number(task.instructor_id))) throw httpError(404, 'Task not found.', 'NOT_FOUND');
    }
    if (task.cycle_status === 'closed') throw httpError(409, 'This cycle is closed.', 'CYCLE_CLOSED');
    if (task.status !== 'pending' || Number(task.evaluations) > 0) {
      throw httpError(409, 'Only tasks that have not been started can be removed.', 'TASK_STARTED');
    }
    await connection.execute('DELETE FROM evaluation_assignments WHERE id = ?', [taskId]);
    await writeAudit(connection, {
      userId: req.user.id, action: 'task.deleted', entityType: 'evaluation_assignment',
      entityId: taskId, details: {}, ipAddress: req.ip,
    });
    await connection.commit();
    sendData(res, { deleted: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

export default router;