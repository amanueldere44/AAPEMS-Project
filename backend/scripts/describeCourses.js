// Read-only: prints the structure that "evaluation tasks from course assignments" depends on.
// It changes nothing.
//
//   cd backend
//   node scripts/describeCourses.js

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { pool } from '../src/config/database.js';

const routesDir = new URL('../src/routes/', import.meta.url);

console.log('== route files (and the endpoints of those that mention "course") ==');
for (const name of readdirSync(routesDir).filter((file) => file.endsWith('.js')).sort()) {
  const text = readFileSync(new URL(name, routesDir), 'utf8');
  const size = statSync(new URL(name, routesDir)).size;
  const mentions = /course/i.test(text);
  console.log(`${name}  ${size} bytes${mentions ? '  <-- mentions course' : ''}`);
  if (mentions) {
    for (const match of text.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)) {
      console.log(`    ${match[1].toUpperCase()} ${match[2]}`);
    }
  }
}

try {
  const [tables] = await pool.query(
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND (table_name LIKE '%course%' OR table_name LIKE '%instructor%' OR table_name LIKE '%teach%'
             OR table_name IN ('evaluation_assignments', 'departments', 'employees'))
      ORDER BY table_name`,
  );
  console.log('\n== tables ==');
  for (const { name } of tables) {
    const [[{ row_count: rowCount }]] = await pool.query(`SELECT COUNT(*) AS row_count FROM \`${name}\``);
    console.log(`\n${name}  (${rowCount} rows)`);
    const [columns] = await pool.query(
      `SELECT column_name AS c, column_type AS t, is_nullable AS n, column_key AS k, column_default AS d
         FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position`,
      [name],
    );
    for (const column of columns) {
      console.log(`  ${column.c}  ${column.t}${column.n === 'NO' ? ' NOT NULL' : ''}${column.k ? ` [${column.k}]` : ''}${column.d !== null ? ` default ${column.d}` : ''}`);
    }
    const [keys] = await pool.query(
      `SELECT column_name AS c, referenced_table_name AS rt, referenced_column_name AS rc
         FROM information_schema.key_column_usage
        WHERE table_schema = DATABASE() AND table_name = ? AND referenced_table_name IS NOT NULL`,
      [name],
    );
    for (const key of keys) console.log(`  FK ${key.c} -> ${key.rt}.${key.rc}`);
  }
} catch (error) {
  console.error('the check stopped:', error.message);
} finally {
  await pool.end();
}