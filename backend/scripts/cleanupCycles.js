// Deletes whole evaluation cycles (test data) together with everything that depends on them.
// Dependent tables are discovered from the foreign keys, children first, in ONE transaction.
//
//   cd backend
//   node scripts/cleanupCycles.js 3 4 5            <- dry run: only shows what WOULD be deleted
//   node scripts/cleanupCycles.js 3 4 5 --confirm  <- really deletes (take a backup first!)
//
// Audit log rows are kept. An ACTIVE cycle is refused unless you add --allow-active.

import { pool } from '../src/config/database.js';

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const allowActive = args.includes('--allow-active');
const ids = args.filter((arg) => /^[1-9]\d*$/.test(arg)).map(Number);

if (!ids.length) {
  console.error('Give at least one cycle id, e.g.: node scripts/cleanupCycles.js 3 4 5');
  process.exit(1);
}

const connection = await pool.getConnection();
try {
  const idList = ids.join(', ');
  const [cycles] = await connection.query(
    `SELECT id, title, academic_year, status FROM evaluation_cycles WHERE id IN (${idList}) ORDER BY id`,
  );
  console.log('Cycles selected:');
  for (const cycle of cycles) console.log(`  #${cycle.id}  ${cycle.title}  (${cycle.academic_year}, ${cycle.status})`);
  const missing = ids.filter((id) => !cycles.some((cycle) => Number(cycle.id) === id));
  if (missing.length) console.log(`  not found: ${missing.join(', ')}`);
  if (!cycles.length) process.exit(1);
  if (!allowActive && cycles.some((cycle) => cycle.status === 'active')) {
    console.error('\nAn active cycle is selected. Close it first, or add --allow-active if you really mean it.');
    process.exit(1);
  }

  // Foreign keys: which tables reference which.
  const [fks] = await connection.query(
    `SELECT table_name AS child, column_name AS childCol,
            referenced_table_name AS parent, referenced_column_name AS parentCol
       FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL`,
  );

  // Children first, then the parent itself.
  function plan(table, where, path) {
    const steps = [];
    for (const fk of fks.filter((item) => item.parent === table)) {
      if (path.includes(fk.child) || fk.child === table) continue;
      const childWhere = `\`${fk.childCol}\` IN (SELECT \`${fk.parentCol}\` FROM \`${table}\` WHERE ${where})`;
      steps.push(...plan(fk.child, childWhere, [...path, table]));
    }
    steps.push({ table, where });
    return steps;
  }

  const steps = plan('evaluation_cycles', `\`id\` IN (${idList})`, []);

  console.log(`\n${confirm ? 'DELETING' : 'DRY RUN - would delete'}:`);
  let total = 0;
  const counted = [];
  for (const step of steps) {
    const [[{ n }]] = await connection.query(`SELECT COUNT(*) AS n FROM \`${step.table}\` WHERE ${step.where}`);
    total += Number(n);
    counted.push({ ...step, n: Number(n) });
    if (Number(n)) console.log(`  ${String(n).padStart(6)}  ${step.table}`);
  }
  console.log(`  ${String(total).padStart(6)}  rows in total`);

  if (!confirm) {
    console.log('\nNothing was deleted. Check the list, take a backup, then run again with --confirm.');
  } else {
    await connection.beginTransaction();
    try {
      for (const step of counted) {
        if (step.n) await connection.query(`DELETE FROM \`${step.table}\` WHERE ${step.where}`);
      }
      await connection.commit();
      console.log('\nDone. The cycles and their data were deleted.');
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
} catch (error) {
  console.error('the cleanup stopped, nothing was changed:', error.message);
  process.exitCode = 1;
} finally {
  connection.release();
  await pool.end();
}