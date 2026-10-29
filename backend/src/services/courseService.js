import { z } from 'zod';
import { pool } from '../config/database.js';
import { httpError } from '../utils/http.js';
import { writeAudit } from '../utils/audit.js';
import { parseBody } from '../utils/db.js';

/**
 * Course catalogue and instructor assignments (administrator only).
 *
 * - `courses`: one row per course, owned by a department. Courses are never deleted;
 *   they are deactivated so that history stays intact.
 * - `course_instructors`: which instructor (a user with the teacher role) teaches which
 *   course in which academic year / semester.
 *
 * The evaluation tasks keep their own course fields, so nothing here changes how existing
 * evaluations, results or reports behave.
 */

const num = (value) => Number(value);
const likeOf = (text) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;
const decimalOrNull = (value) => (value === null || value === undefined ? null : Number(value));

const code = z.string().trim().min(1).max(50);
const title = z.string().trim().min(1).max(200);
const departmentId = z.number().int().positive();
const creditHours = z.number().min(0).max(30).nullable();

const courseSchema = z.object({ code, title, departmentId, creditHours: creditHours.optional() });
const coursePatchSchema = z
  .object({
    title: title.optional(),
    departmentId: departmentId.optional(),
    creditHours: creditHours.optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), { message: 'Nothing to update.' });

const courseListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const assignmentSchema = z.object({
  courseId: z.number().int().positive(),
  instructorId: z.number().int().positive(),
  academicYear: z.string().trim().min(1).max(20),
  semester: z.string().trim().max(20).default(''),
});

const assignmentListSchema = z.object({
  courseId: z.coerce.number().int().positive().optional(),
  instructorId: z.coerce.number().int().positive().optional(),
  academicYear: z.string().trim().max(20).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/* ------------------------------------------------------------------ */
/* Courses                                                             */
/* ------------------------------------------------------------------ */

// The existing `courses` table uses course_code, title, department (text) and active (0/1).
// department_id and credit_hours were added next to it (nullable), so older rows stay valid.
const COURSE_SELECT = `
  SELECT c.id, c.course_code AS code, c.title, c.department_id AS departmentId,
         COALESCE(d.name, c.department) AS departmentName,
         f.name AS unitName, c.credit_hours AS creditHours,
         IF(c.active = 1, 'active', 'inactive') AS status,
         (SELECT COUNT(*) FROM course_instructors ci WHERE ci.course_id = c.id) AS instructorCount
    FROM courses c
    LEFT JOIN departments d ON d.id = c.department_id
    LEFT JOIN faculties f ON f.id = d.faculty_id`;

function shapeCourse(row) {
  return {
    id: num(row.id),
    code: row.code,
    title: row.title,
    departmentId: row.departmentId === null || row.departmentId === undefined ? null : num(row.departmentId),
    departmentName: row.departmentName ?? '',
    unitName: row.unitName ?? null,
    creditHours: decimalOrNull(row.creditHours),
    status: row.status,
    instructorCount: num(row.instructorCount),
  };
}

async function getCourse(id) {
  const [rows] = await pool.query(`${COURSE_SELECT} WHERE c.id = ?`, [id]);
  if (!rows[0]) throw httpError(404, 'Course not found.', 'NOT_FOUND');
  return shapeCourse(rows[0]);
}

export async function listCourses(query) {
  const filters = parseBody(courseListSchema, query, 'Invalid filters.');
  const clauses = [];
  const values = [];

  if (filters.search) {
    clauses.push('(c.course_code LIKE ? OR c.title LIKE ?)');
    values.push(likeOf(filters.search), likeOf(filters.search));
  }
  if (filters.departmentId) {
    clauses.push('c.department_id = ?');
    values.push(filters.departmentId);
  }
  if (filters.status) {
    clauses.push('c.active = ?');
    values.push(filters.status === 'active' ? 1 : 0);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM courses c ${where}`, values);
  const [rows] = await pool.query(
    `${COURSE_SELECT} ${where} ORDER BY c.course_code LIMIT ? OFFSET ?`,
    [...values, filters.pageSize, (filters.page - 1) * filters.pageSize],
  );

  return { items: rows.map(shapeCourse), total: num(total), page: filters.page, pageSize: filters.pageSize };
}

// Everything the forms need: departments, active courses and active teachers.
export async function listOptions() {
  const [departments] = await pool.query(
    `SELECT d.id, d.name, f.name AS unitName
       FROM departments d LEFT JOIN faculties f ON f.id = d.faculty_id
      ORDER BY d.name`,
  );
  const [courses] = await pool.query(
    "SELECT id, course_code AS code, title FROM courses WHERE active = 1 ORDER BY course_code",
  );
  const [instructors] = await pool.query(
    `SELECT u.id, u.name, u.email, d.name AS departmentName
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE u.role = 'teacher' AND u.status = 'active'
      ORDER BY u.name`,
  );

  return {
    departments: departments.map((row) => ({ id: num(row.id), name: row.name, unitName: row.unitName ?? null })),
    courses: courses.map((row) => ({ id: num(row.id), code: row.code, title: row.title })),
    instructors: instructors.map((row) => ({
      id: num(row.id), name: row.name, email: row.email, departmentName: row.departmentName ?? null,
    })),
  };
}

async function getDepartment(departmentIdValue) {
  const [rows] = await pool.execute('SELECT id, name FROM departments WHERE id = ?', [departmentIdValue]);
  if (!rows[0]) throw httpError(400, 'The selected department does not exist.', 'VALIDATION_ERROR');
  // The legacy `department` column is varchar(150).
  if (String(rows[0].name).length > 150) {
    throw httpError(400, 'The department name is too long for the course record.', 'VALIDATION_ERROR');
  }
  return rows[0];
}

export async function createCourse(user, body, ipAddress) {
  const data = parseBody(courseSchema, body, 'Invalid course.');
  const department = await getDepartment(data.departmentId);

  const [existing] = await pool.execute('SELECT id FROM courses WHERE course_code = ? LIMIT 1', [data.code]);
  if (existing[0]) {
    throw httpError(409, 'A course with this code already exists.', 'DUPLICATE_CODE');
  }

  const [result] = await pool.execute(
    `INSERT INTO courses (course_code, title, department, department_id, credit_hours, active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [data.code, data.title, department.name, data.departmentId, data.creditHours ?? null],
  );
  const id = num(result.insertId);

  await writeAudit(pool, {
    userId: num(user.id), action: 'course.created', entityType: 'course', entityId: id,
    details: { code: data.code, title: data.title, departmentId: data.departmentId }, ipAddress,
  });
  return getCourse(id);
}

export async function updateCourse(user, id, body, ipAddress) {
  const data = parseBody(coursePatchSchema, body, 'Invalid course.');
  await getCourse(id);

  const sets = [];
  const values = [];
  if (data.title !== undefined) { sets.push('title = ?'); values.push(data.title); }
  if (data.departmentId !== undefined) {
    const department = await getDepartment(data.departmentId);
    sets.push('department_id = ?', 'department = ?');
    values.push(data.departmentId, department.name);
  }
  if (data.creditHours !== undefined) { sets.push('credit_hours = ?'); values.push(data.creditHours); }
  if (data.status !== undefined) { sets.push('active = ?'); values.push(data.status === 'active' ? 1 : 0); }

  await pool.execute(`UPDATE courses SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
  await writeAudit(pool, {
    userId: num(user.id), action: 'course.updated', entityType: 'course', entityId: id,
    details: data, ipAddress,
  });
  return getCourse(id);
}

/* ------------------------------------------------------------------ */
/* Instructor assignments                                              */
/* ------------------------------------------------------------------ */

const ASSIGNMENT_SELECT = `
  SELECT ci.id, ci.course_id AS courseId, c.course_code AS courseCode, c.title AS courseTitle,
         ci.instructor_id AS instructorId, u.name AS instructorName, u.email AS instructorEmail,
         d.name AS departmentName, ci.academic_year AS academicYear, ci.semester
    FROM course_instructors ci
    JOIN courses c ON c.id = ci.course_id
    JOIN users u ON u.id = ci.instructor_id
    LEFT JOIN employees e ON e.user_id = u.id
    LEFT JOIN departments d ON d.id = e.department_id`;

function shapeAssignment(row) {
  return {
    id: num(row.id),
    courseId: num(row.courseId),
    courseCode: row.courseCode,
    courseTitle: row.courseTitle,
    instructorId: num(row.instructorId),
    instructorName: row.instructorName,
    instructorEmail: row.instructorEmail,
    departmentName: row.departmentName ?? null,
    academicYear: row.academicYear,
    semester: row.semester || '',
  };
}

export async function listAssignments(query) {
  const filters = parseBody(assignmentListSchema, query, 'Invalid filters.');
  const clauses = [];
  const values = [];

  if (filters.courseId) { clauses.push('ci.course_id = ?'); values.push(filters.courseId); }
  if (filters.instructorId) { clauses.push('ci.instructor_id = ?'); values.push(filters.instructorId); }
  if (filters.academicYear) { clauses.push('ci.academic_year = ?'); values.push(filters.academicYear); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM course_instructors ci ${where}`, values);
  const [rows] = await pool.query(
    `${ASSIGNMENT_SELECT} ${where} ORDER BY ci.academic_year DESC, c.course_code, u.name LIMIT ? OFFSET ?`,
    [...values, filters.pageSize, (filters.page - 1) * filters.pageSize],
  );

  return { items: rows.map(shapeAssignment), total: num(total), page: filters.page, pageSize: filters.pageSize };
}

export async function createAssignment(user, body, ipAddress) {
  const data = parseBody(assignmentSchema, body, 'Invalid assignment.');

  const [courses] = await pool.execute(
    'SELECT id, course_code AS code, active FROM courses WHERE id = ?',
    [data.courseId],
  );
  if (!courses[0]) throw httpError(404, 'Course not found.', 'NOT_FOUND');
  if (Number(courses[0].active) !== 1) {
    throw httpError(409, 'This course is inactive. Activate it before assigning an instructor.', 'COURSE_INACTIVE');
  }

  const [instructors] = await pool.execute(
    "SELECT id FROM users WHERE id = ? AND role = 'teacher' AND status = 'active'",
    [data.instructorId],
  );
  if (!instructors[0]) {
    throw httpError(400, 'The selected user is not an active instructor.', 'VALIDATION_ERROR');
  }

  const [duplicate] = await pool.execute(
    `SELECT id FROM course_instructors
      WHERE course_id = ? AND instructor_id = ? AND academic_year = ? AND COALESCE(semester, '') = ?
      LIMIT 1`,
    [data.courseId, data.instructorId, data.academicYear, data.semester],
  );
  if (duplicate[0]) {
    throw httpError(409, 'This instructor is already assigned to this course for the same term.', 'DUPLICATE_ASSIGNMENT');
  }

  const [result] = await pool.execute(
    'INSERT INTO course_instructors (course_id, instructor_id, academic_year, semester) VALUES (?, ?, ?, ?)',
    [data.courseId, data.instructorId, data.academicYear, data.semester],
  );
  const id = num(result.insertId);

  await writeAudit(pool, {
    userId: num(user.id), action: 'course_assignment.created', entityType: 'course', entityId: data.courseId,
    details: {
      courseCode: courses[0].code, instructorId: data.instructorId,
      academicYear: data.academicYear, semester: data.semester,
    },
    ipAddress,
  });

  const [rows] = await pool.query(`${ASSIGNMENT_SELECT} WHERE ci.id = ?`, [id]);
  return shapeAssignment(rows[0]);
}

export async function deleteAssignment(user, id, ipAddress) {
  const [rows] = await pool.query(`${ASSIGNMENT_SELECT} WHERE ci.id = ?`, [id]);
  if (!rows[0]) throw httpError(404, 'Assignment not found.', 'NOT_FOUND');

  await pool.execute('DELETE FROM course_instructors WHERE id = ?', [id]);
  await writeAudit(pool, {
    userId: num(user.id), action: 'course_assignment.deleted', entityType: 'course', entityId: num(rows[0].courseId),
    details: {
      courseCode: rows[0].courseCode, instructorId: num(rows[0].instructorId),
      academicYear: rows[0].academicYear, semester: rows[0].semester || '',
    },
    ipAddress,
  });
  return { id, deleted: true };
}