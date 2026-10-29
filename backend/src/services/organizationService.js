import { z } from 'zod';
import { pool } from '../config/database.js';
import { httpError } from '../utils/http.js';
import { writeAudit } from '../utils/audit.js';
import { inTransaction, parseBody } from '../utils/db.js';

/**
 * Organization structure: academic units (stored in `faculties`: colleges, schools,
 * institutes), their departments, and the staff members assigned to each department.
 *
 * The department and unit of a staff member decide what a department head or a dean may
 * see in the reports and the improvement referrals, so every change is audited.
 * Names are unique (per unit for departments) through the existing unique indexes.
 */

const name = z.string().trim().min(1).max(255);
const unitSchema = z.object({ name });
const departmentSchema = z.object({ name, facultyId: z.number().int().positive() });
const departmentPatchSchema = z
  .object({ name: name.optional(), facultyId: z.number().int().positive().optional() })
  .refine((v) => v.name !== undefined || v.facultyId !== undefined, { message: 'Nothing to update.' });
const memberSchema = z.object({
  employeeType: z.enum(['academic', 'administrative']),
  jobTitle: z.string().trim().max(150).nullable().optional(),
});
const listSchema = z.object({
  facultyId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const searchSchema = z.object({ search: z.string().trim().max(100).optional() });

const duplicate = (what) => httpError(409, `${what} with this name already exists.`, 'DUPLICATE_NAME');
const likeOf = (text) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;
const num = (value) => Number(value);

/* ------------------------------------------------------------------ */
/* Academic units (faculties table)                                    */
/* ------------------------------------------------------------------ */

export async function listUnits() {
  const [rows] = await pool.query(
    `SELECT f.id, f.name, f.created_at AS createdAt,
            (SELECT COUNT(*) FROM departments d WHERE d.faculty_id = f.id) AS departmentCount,
            (SELECT COUNT(*) FROM employees e JOIN departments d ON d.id = e.department_id
              WHERE d.faculty_id = f.id) AS memberCount
       FROM faculties f ORDER BY f.name`,
  );
  return rows.map((r) => ({ ...r, id: num(r.id), departmentCount: num(r.departmentCount), memberCount: num(r.memberCount) }));
}

export async function createUnit(user, body, ipAddress) {
  const data = parseBody(unitSchema, body, 'Invalid academic unit.');
  return inTransaction(async (connection) => {
    let id;
    try {
      const [res] = await connection.execute('INSERT INTO faculties (name) VALUES (?)', [data.name]);
      id = num(res.insertId);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw duplicate('An academic unit');
      throw error;
    }
    await writeAudit(connection, {
      userId: num(user.id), action: 'academic_unit_created', entityType: 'faculty',
      entityId: id, details: { name: data.name }, ipAddress,
    });
    return { id, name: data.name };
  });
}

export async function updateUnit(user, unitId, body, ipAddress) {
  const data = parseBody(unitSchema, body, 'Invalid academic unit.');
  return inTransaction(async (connection) => {
    const [[unit]] = await connection.execute('SELECT id, name FROM faculties WHERE id = ? FOR UPDATE', [unitId]);
    if (!unit) throw httpError(404, 'Academic unit not found.', 'NOT_FOUND');
    try {
      await connection.execute('UPDATE faculties SET name = ? WHERE id = ?', [data.name, unitId]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw duplicate('An academic unit');
      throw error;
    }
    await writeAudit(connection, {
      userId: num(user.id), action: 'academic_unit_updated', entityType: 'faculty',
      entityId: unitId, details: { from: unit.name, to: data.name }, ipAddress,
    });
    return { id: unitId, name: data.name };
  });
}

export async function deleteUnit(user, unitId, ipAddress) {
  return inTransaction(async (connection) => {
    const [[unit]] = await connection.execute('SELECT id, name FROM faculties WHERE id = ? FOR UPDATE', [unitId]);
    if (!unit) throw httpError(404, 'Academic unit not found.', 'NOT_FOUND');
    const [[{ total }]] = await connection.execute('SELECT COUNT(*) AS total FROM departments WHERE faculty_id = ?', [unitId]);
    if (num(total) > 0) {
      throw httpError(409, 'Move or delete the departments of this academic unit first.', 'HAS_DEPARTMENTS');
    }
    await connection.execute('DELETE FROM faculties WHERE id = ?', [unitId]);
    await writeAudit(connection, {
      userId: num(user.id), action: 'academic_unit_deleted', entityType: 'faculty',
      entityId: unitId, details: { name: unit.name }, ipAddress,
    });
    return { id: unitId, deleted: true };
  });
}

/* ------------------------------------------------------------------ */
/* Departments                                                         */
/* ------------------------------------------------------------------ */

export async function listDepartments(query) {
  const q = parseBody(listSchema, query, 'Invalid filter.');
  const where = [];
  const params = [];
  if (q.facultyId) { where.push('d.faculty_id = ?'); params.push(q.facultyId); }
  if (q.search) { where.push('d.name LIKE ?'); params.push(likeOf(q.search)); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM departments d ${clause}`, params);
  const [rows] = await pool.query(
    `SELECT d.id, d.name, d.faculty_id AS facultyId, f.name AS facultyName,
            (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id) AS memberCount
       FROM departments d JOIN faculties f ON f.id = d.faculty_id
       ${clause}
      ORDER BY f.name, d.name
      LIMIT ? OFFSET ?`,
    [...params, q.pageSize, (q.page - 1) * q.pageSize],
  );
  return {
    items: rows.map((r) => ({ ...r, id: num(r.id), facultyId: num(r.facultyId), memberCount: num(r.memberCount) })),
    page: q.page, pageSize: q.pageSize, total: num(total),
  };
}

export async function createDepartment(user, body, ipAddress) {
  const data = parseBody(departmentSchema, body, 'Invalid department.');
  return inTransaction(async (connection) => {
    const [[unit]] = await connection.execute('SELECT id FROM faculties WHERE id = ? FOR SHARE', [data.facultyId]);
    if (!unit) throw httpError(404, 'Academic unit not found.', 'NOT_FOUND');
    let id;
    try {
      const [res] = await connection.execute('INSERT INTO departments (faculty_id, name) VALUES (?, ?)', [data.facultyId, data.name]);
      id = num(res.insertId);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw duplicate('A department in this academic unit');
      throw error;
    }
    await writeAudit(connection, {
      userId: num(user.id), action: 'department_created', entityType: 'department',
      entityId: id, details: { name: data.name, facultyId: data.facultyId }, ipAddress,
    });
    return { id, name: data.name, facultyId: data.facultyId };
  });
}

export async function updateDepartment(user, departmentId, body, ipAddress) {
  const data = parseBody(departmentPatchSchema, body, 'Invalid department.');
  return inTransaction(async (connection) => {
    const [[department]] = await connection.execute(
      'SELECT id, name, faculty_id FROM departments WHERE id = ? FOR UPDATE', [departmentId],
    );
    if (!department) throw httpError(404, 'Department not found.', 'NOT_FOUND');
    if (data.facultyId !== undefined) {
      const [[unit]] = await connection.execute('SELECT id FROM faculties WHERE id = ? FOR SHARE', [data.facultyId]);
      if (!unit) throw httpError(404, 'Academic unit not found.', 'NOT_FOUND');
    }
    const next = { name: data.name ?? department.name, facultyId: data.facultyId ?? num(department.faculty_id) };
    try {
      await connection.execute('UPDATE departments SET name = ?, faculty_id = ? WHERE id = ?', [next.name, next.facultyId, departmentId]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw duplicate('A department in this academic unit');
      throw error;
    }
    await writeAudit(connection, {
      userId: num(user.id), action: 'department_updated', entityType: 'department', entityId: departmentId,
      details: { from: { name: department.name, facultyId: num(department.faculty_id) }, to: next }, ipAddress,
    });
    return { id: departmentId, ...next };
  });
}

export async function deleteDepartment(user, departmentId, ipAddress) {
  return inTransaction(async (connection) => {
         const [[{ courseTotal }]] = await connection.execute(
      'SELECT COUNT(*) AS courseTotal FROM courses WHERE department_id = ? OR department = ?',
      [departmentId, department.name],
    );
    if (num(courseTotal) > 0) {
      throw httpError(409, 'This department still owns courses. Move them to another department first.', 'HAS_COURSES');
    }
    const [[department]] = await connection.execute('SELECT id, name FROM departments WHERE id = ? FOR UPDATE', [departmentId]);
    if (!department) throw httpError(404, 'Department not found.', 'NOT_FOUND');
    const [[{ total }]] = await connection.execute('SELECT COUNT(*) AS total FROM employees WHERE department_id = ?', [departmentId]);
    if (num(total) > 0) {
      throw httpError(409, 'Remove or move the staff members of this department first.', 'HAS_MEMBERS');
    }
    await connection.execute('DELETE FROM departments WHERE id = ?', [departmentId]);
    await writeAudit(connection, {
      userId: num(user.id), action: 'department_deleted', entityType: 'department',
      entityId: departmentId, details: { name: department.name }, ipAddress,
    });
    return { id: departmentId, deleted: true };
  });
}

/* ------------------------------------------------------------------ */
/* Department staff (employees table)                                  */
/* ------------------------------------------------------------------ */

export async function listMembers(departmentId) {
  const [[department]] = await pool.execute('SELECT id FROM departments WHERE id = ?', [departmentId]);
  if (!department) throw httpError(404, 'Department not found.', 'NOT_FOUND');
  const [rows] = await pool.execute(
    `SELECT e.user_id AS userId, u.name, u.email, u.role, u.status,
            e.employee_type AS employeeType, e.job_title AS jobTitle
       FROM employees e JOIN users u ON u.id = e.user_id
      WHERE e.department_id = ? ORDER BY u.name`,
    [departmentId],
  );
  return rows.map((r) => ({ ...r, userId: num(r.userId) }));
}

// Active non-student users who are not assigned to any department yet.
export async function listUnassignedUsers(query) {
  const q = parseBody(searchSchema, query, 'Invalid filter.');
  const params = [];
  let search = '';
  if (q.search) {
    search = 'AND (u.name LIKE ? OR u.email LIKE ?)';
    params.push(likeOf(q.search), likeOf(q.search));
  }
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.role
       FROM users u
      WHERE u.status = 'active' AND u.role <> 'student'
        AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id AND e.department_id IS NOT NULL)
        ${search}
      ORDER BY u.name LIMIT 200`,
    params,
  );
  return rows.map((r) => ({ ...r, id: num(r.id) }));
}

export async function setMember(user, departmentId, userId, body, ipAddress) {
  const data = parseBody(memberSchema, body, 'Invalid staff assignment.');
  return inTransaction(async (connection) => {
    const [[department]] = await connection.execute('SELECT id FROM departments WHERE id = ? FOR SHARE', [departmentId]);
    if (!department) throw httpError(404, 'Department not found.', 'NOT_FOUND');
    const [[person]] = await connection.execute('SELECT id, role, status FROM users WHERE id = ?', [userId]);
    if (!person || person.status !== 'active') throw httpError(404, 'Active user not found.', 'NOT_FOUND');
    if (person.role === 'student') {
      throw httpError(422, 'Students cannot be assigned to a department as staff.', 'INVALID_PARTICIPANT');
    }
    const [[previous]] = await connection.execute('SELECT department_id FROM employees WHERE user_id = ? FOR UPDATE', [userId]);
    await connection.execute(
      `INSERT INTO employees (user_id, department_id, employee_type, job_title) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE department_id = VALUES(department_id),
                               employee_type = VALUES(employee_type),
                               job_title = VALUES(job_title)`,
      [userId, departmentId, data.employeeType, data.jobTitle || null],
    );
    await writeAudit(connection, {
      userId: num(user.id), action: 'department_member_set', entityType: 'employee', entityId: userId,
      details: {
        departmentId,
        previousDepartmentId: previous?.department_id ? num(previous.department_id) : null,
        employeeType: data.employeeType,
      },
      ipAddress,
    });
    return { departmentId, userId, employeeType: data.employeeType, jobTitle: data.jobTitle || null };
  });
}

// The staff record is kept (job title, type); only the department link is cleared.
export async function removeMember(user, departmentId, userId, ipAddress) {
  return inTransaction(async (connection) => {
    const [[row]] = await connection.execute(
      'SELECT id FROM employees WHERE user_id = ? AND department_id = ? FOR UPDATE', [userId, departmentId],
    );
    if (!row) throw httpError(404, 'This user is not a member of the department.', 'NOT_FOUND');
    await connection.execute('UPDATE employees SET department_id = NULL WHERE id = ?', [row.id]);
    await writeAudit(connection, {
      userId: num(user.id), action: 'department_member_removed', entityType: 'employee', entityId: userId,
      details: { departmentId }, ipAddress,
    });
    return { departmentId, userId, removed: true };
  });
}