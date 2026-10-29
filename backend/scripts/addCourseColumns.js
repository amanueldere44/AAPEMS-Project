// One-time, idempotent migration for courseService.js:
// adds courses.department_id and courses.credit_hours, then fills department_id from the old
// text column courses.department (exact name match, ignoring case and spaces).
// Nothing is deleted; existing values are never overwritten. Safe to run more than once.
//
//   cd backend
//   node scripts/addCourseColumns.js

import { pool } from '../src/config/database.js';

async function hasColumn(name) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'courses' AND column_name = ?`,
    [name],
  );
  return rows.length > 0;
}

try {
  if (!(await hasColumn('department_id'))) {
    await pool.query('ALTER TABLE courses ADD COLUMN department_id BIGINT UNSIGNED NULL AFTER department');
    console.log('added courses.department_id');
  } else {
    console.log('courses.department_id already exists');
  }

  if (!(await hasColumn('credit_hours'))) {
    await pool.query('ALTER TABLE courses ADD COLUMN credit_hours DECIMAL(4,1) NULL AFTER department_id');
    console.log('added courses.credit_hours');
  } else {
    console.log('courses.credit_hours already exists');
  }

  const [fk] = await pool.query(
    `SELECT 1 FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE() AND table_name = 'courses'
        AND column_name = 'department_id' AND referenced_table_name = 'departments'`,
  );
  if (!fk.length) {
    await pool.query(
      `ALTER TABLE courses
         ADD INDEX idx_courses_department_id (department_id),
         ADD CONSTRAINT fk_courses_department FOREIGN KEY (department_id)
           REFERENCES departments (id) ON DELETE SET NULL`,
    );
    console.log('added index and foreign key on courses.department_id');
  }

  const [filled] = await pool.query(
    `UPDATE courses c JOIN departments d ON LOWER(TRIM(d.name)) = LOWER(TRIM(c.department))
        SET c.department_id = d.id
      WHERE c.department_id IS NULL`,
  );
  console.log(`department_id filled for ${filled.affectedRows} course(s)`);

  const [unmatched] = await pool.query(
    'SELECT id, course_code, title, department FROM courses WHERE department_id IS NULL',
  );
  if (unmatched.length) {
    console.log('\nCourses still without a department (set one with Edit on the Courses page):');
    for (const row of unmatched) console.log(`  #${row.id} ${row.course_code} "${row.title}" (department text: "${row.department}")`);
    const [departments] = await pool.query('SELECT id, name FROM departments ORDER BY id');
    console.log('\nAvailable departments:');
  for (const row of departments) console.log(`  ${row.id}  ${row.name}`);
  }
  console.log('\nDone.');
} catch (error) {
  console.error('the migration stopped:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}