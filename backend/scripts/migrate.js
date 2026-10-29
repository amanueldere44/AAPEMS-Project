// Applies migrations/*.sql in filename order, once each, and records them in schema_migrations.
// Needs a MySQL account that may CREATE/ALTER tables. The normal app account (SELECT/INSERT/UPDATE/DELETE)
// is not enough, so set MIGRATE_DB_USER and MIGRATE_DB_PASSWORD for this command only.
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.MIGRATE_DB_USER || process.env.DB_USER,
  password: process.env.MIGRATE_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME || 'ambo_performance_evaluation',
  multipleStatements: true,
});

try {
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(190) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  const [done] = await connection.query('SELECT filename FROM schema_migrations');
  const applied = new Set(done.map((row) => row.filename));
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  let count = 0;

  for (const file of files) {
    if (applied.has(file)) { console.log(`skip   ${file}`); continue; }
    console.log(`apply  ${file}`);
    await connection.query(await readFile(path.join(dir, file), 'utf8'));
    await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
    count += 1;
  }
  console.log(count ? `Done. ${count} migration(s) applied.` : 'Database is up to date.');
} catch (error) {
  console.error('Migration failed:', error.message);
  console.error('Part of the migration may already have been applied. Restore your backup before retrying.');
  process.exitCode = 1;
} finally {
  await connection.end();
}