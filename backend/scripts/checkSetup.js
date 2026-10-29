// Read-only health check of the ASEMS installation. It changes nothing.
//
//   cd backend
//   node scripts/checkSetup.js
//
// Prints PASS / WARN / FAIL lines. Exit code 1 if anything FAILs.

import { readFileSync } from 'node:fs';
import { pool } from '../src/config/database.js';
import { calculateFormE } from '../src/services/summaryService.js';
import { EVALUATOR_TYPES, OFFICIAL_WEIGHTS } from '../src/utils/evaluationSummary.js';

const counts = { PASS: 0, WARN: 0, FAIL: 0 };
const report = (level, label, detail = '') => {
  counts[level] += 1;
  console.log(`[${level}] ${label}${detail ? ` - ${detail}` : ''}`);
};
const section = (title) => console.log(`\n== ${title} ==`);

function readSource(relativePath) {
  try {
    return readFileSync(new URL(`../src/${relativePath}`, import.meta.url), 'utf8');
  } catch {
    return null;
  }
}

function readFrontend(relativePath) {
  try {
    return readFileSync(new URL(`../../frontend/src/${relativePath}`, import.meta.url), 'utf8');
  } catch {
    return null;
  }
}

function checkFile(relativePath, mustContain, mustNotContain = [], reader = readSource, label = `src/${relativePath}`) {
  const text = reader(relativePath);
  if (text === null) {
    return report(reader === readSource ? 'FAIL' : 'WARN', `${label} exists`, 'file not found');
  }
  const missing = mustContain.filter((needle) => !text.includes(needle));
  const forbidden = mustNotContain.filter((needle) => text.includes(needle));
  if (missing.length || forbidden.length) {
    const parts = [];
    if (missing.length) parts.push(`missing: ${missing.join(' | ')}`);
    if (forbidden.length) parts.push(`should not contain: ${forbidden.join(' | ')}`);
    return report('FAIL', `${label} has the expected content`, `${parts.join('; ')} (${text.length} bytes)`);
  }
  return report('PASS', `${label} has the expected content`);
}

const REQUIRED_TABLES = [
  'users', 'employees', 'departments', 'faculties', 'evaluation_cycles', 'evaluation_forms',
  'form_versions', 'form_sections', 'form_criteria', 'evaluation_assignments', 'evaluations',
  'evaluation_scores', 'evaluation_reviews', 'evaluation_summaries', 'audit_logs',
  'evaluation_report_distributions', 'evaluation_report_routing', 'evaluation_report_archives',
];
const REQUIRED_SUMMARY_COLUMNS = ['committee_strengths', 'committee_improvements', 'finalized_by', 'finalized_at'];
const EXPECTED_CRITERIA = { student: 30, department_head: 27, peer: 26, self: 62 };
const ROLES = ['admin', 'student', 'teacher', 'department_head', 'committee', 'dean', 'management'];

try {
  section('Source files (catches pasted-into-the-wrong-file mistakes)');
  checkFile('routes/evaluations.routes.js', ['/:assignmentId/draft', '/:assignmentId/submit', 'scoreEvaluation'], ['/queue', 'finalize']);
  checkFile('routes/workflow.routes.js', ['/queue', '/:evaluationId/review', '/:evaluationId/reopen', '/finalize', '/forward-to-vp', '/archive/:level', '/routing'], ['/:assignmentId/draft', 'forward-to-archive']);
  checkFile('routes/reports.routes.js', ['formEReportService.js'], ['legacyEvaluationSummary.js']);
  checkFile('services/summaryService.js', ["approved: 'complete'", 'calculateFormEDetailed', 'OFFICIAL_WEIGHT_MISMATCH']);
  checkFile('services/formEReportService.js', ["const FINAL_STATUSES = ['reviewed', 'archived'];", "form.state === 'approved'"]);
  checkFile('utils/evaluationSummary.js', ['export function computeFormE', 'export const EVALUATOR_TYPES']);
  checkFile('utils/formEInput.js', ['export function buildGroupsInput']);
  checkFile('pages/ReportsWorkflowPage.jsx', ['forward-to-vp', 'Reporting chain'], ['Forms are approved in this order', 'forwardToArchive'], readFrontend, 'frontend/src/pages/ReportsWorkflowPage.jsx');

  section('Database');
  const [[{ db }]] = await pool.query('SELECT DATABASE() AS db');
  report('PASS', 'connected', `database ${db}`);

  const [tableRows] = await pool.query('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()');
  const tables = new Set(tableRows.map((row) => String(row.name).toLowerCase()));
  for (const table of REQUIRED_TABLES) {
    if (tables.has(table)) report('PASS', `table ${table}`);
    else report('FAIL', `table ${table} is missing`, table.startsWith('evaluation_report_') ? 'run the CREATE TABLE script for report copies and archive routing' : 'restore from your database dump');
  }

  const [columnRows] = await pool.query(
    "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'evaluation_summaries'",
  );
  const columns = new Set(columnRows.map((row) => String(row.name).toLowerCase()));
  for (const column of REQUIRED_SUMMARY_COLUMNS) {
    if (columns.has(column)) report('PASS', `evaluation_summaries.${column}`);
    else report('FAIL', `evaluation_summaries.${column} is missing`);
  }

  section('Official weights and forms');
  const [weightRows] = await pool.query('SELECT evaluator_type, weight FROM evaluation_forms WHERE is_active = 1');
  const weights = Object.fromEntries(weightRows.map((row) => [row.evaluator_type, Number(row.weight)]));
  for (const type of EVALUATOR_TYPES) {
    if (weights[type] === OFFICIAL_WEIGHTS[type]) report('PASS', `${type} weight is ${OFFICIAL_WEIGHTS[type]}`);
    else report('FAIL', `${type} weight`, `database has ${weights[type] ?? 'none'}, official is ${OFFICIAL_WEIGHTS[type]}`);
  }
  const [criteriaRows] = await pool.query(
    `SELECT f.evaluator_type, COUNT(c.id) AS criteria
       FROM evaluation_forms f
       JOIN form_versions fv ON fv.form_id = f.id AND fv.status = 'published'
       JOIN form_sections fs ON fs.form_version_id = fv.id
       JOIN form_criteria c ON c.section_id = fs.id AND c.is_active = 1
      WHERE f.is_active = 1
      GROUP BY f.evaluator_type`,
  );
  const criteria = Object.fromEntries(criteriaRows.map((row) => [row.evaluator_type, Number(row.criteria)]));
  for (const type of EVALUATOR_TYPES) {
    if (criteria[type] === undefined) report('FAIL', `no published form for ${type}`);
    else if (criteria[type] === EXPECTED_CRITERIA[type]) report('PASS', `${type} form has ${criteria[type]} criteria`);
    else report('WARN', `${type} form has ${criteria[type]} criteria`, `the official form has ${EXPECTED_CRITERIA[type]}`);
  }

  section('Users, roles and departments');
  const [roleRows] = await pool.query("SELECT role, COUNT(*) AS total, SUM(status = 'active') AS active FROM users GROUP BY role");
  const byRole = Object.fromEntries(roleRows.map((row) => [row.role, Number(row.active)]));
  for (const role of ROLES) {
    if (byRole[role] > 0) report('PASS', `${byRole[role]} active ${role} user(s)`);
    else report(role === 'admin' ? 'FAIL' : 'WARN', `no active ${role} user`, role === 'management' ? 'nobody can record report copies or archive reports' : '');
  }
  const officeRole = process.env.ASEMS_REPORT_OFFICE_ROLE || 'management';
  console.log(`   (report office role in use: ${officeRole})`);

  const [peopleRows] = await pool.query(
    `SELECT u.name, u.role, e.department_id
       FROM users u LEFT JOIN employees e ON e.user_id = u.id
      WHERE u.status = 'active' AND u.role IN ('teacher', 'department_head', 'dean', 'committee')
      ORDER BY u.role, u.name`,
  );
  for (const role of ['department_head', 'dean', 'committee', 'teacher']) {
    const people = peopleRows.filter((row) => row.role === role);
    const unlinked = people.filter((row) => row.department_id === null);
    if (!people.length) continue;
    if (!unlinked.length) report('PASS', `every ${role} is linked to a department`);
    else {
      const names = unlinked.slice(0, 8).map((row) => row.name).join(', ');
      const effect = role === 'department_head' || role === 'dean' ? 'they will see no instructors' : 'Form E shows "Department not configured"';
      report('WARN', `${unlinked.length} of ${people.length} ${role}(s) have no department`, `${names}${unlinked.length > 8 ? ', ...' : ''} - ${effect}`);
    }
  }

  section('Evaluations and summaries');
  const [[evalCounts]] = await pool.query(
    `SELECT SUM(status = 'submitted') AS submitted, SUM(status = 'returned') AS returned,
            SUM(status = 'rejected') AS rejected, SUM(status = 'approved') AS approved FROM evaluations`,
  );
  console.log(`   evaluations: ${evalCounts.submitted ?? 0} submitted, ${evalCounts.approved ?? 0} approved, ${evalCounts.returned ?? 0} returned, ${evalCounts.rejected ?? 0} rejected`);

  const [summaries] = await pool.query(
    `SELECT s.id, s.cycle_id, s.instructor_id, s.status, s.total_score, s.finalized_by,
            u.name AS instructor,
            (COALESCE(s.committee_strengths, '') <> '' AND COALESCE(s.committee_improvements, '') <> '') AS has_comments
       FROM evaluation_summaries s JOIN users u ON u.id = s.instructor_id ORDER BY s.cycle_id, s.id`,
  );
  if (!summaries.length) report('WARN', 'no evaluation summaries yet');
  const connection = await pool.getConnection();
  try {
    for (const row of summaries) {
      const name = `summary ${row.id} (cycle ${row.cycle_id}, ${row.instructor}, ${row.status})`;
      const form = await calculateFormE(connection, Number(row.cycle_id), Number(row.instructor_id));
      const problems = [];
      if (['reviewed', 'archived'].includes(row.status) && !Number(row.has_comments)) problems.push('final but has no final comments (finalized by older code)');
      if (['reviewed', 'archived'].includes(row.status) && form.state !== 'approved') problems.push('final but the live data is not fully approved');
      const stored = Number(row.total_score);
      const live = form.total ?? 0;
      if (Math.abs(stored - live) >= 0.0005) problems.push(`stored total ${stored} differs from live ${live} (run scripts/recomputeSummaries.js)`);
      if (row.status === 'complete' && form.state === 'incomplete') problems.push('marked complete but the live data is incomplete (run scripts/recomputeSummaries.js)');
      if (problems.length) report('WARN', name, problems.join('; '));
      else report('PASS', name, `total ${form.total ?? '-'} state ${form.state}`);
    }
  } finally {
    connection.release();
  }
} catch (error) {
  report('FAIL', 'the check itself stopped', error.message);
} finally {
  await pool.end();
}

console.log(`\nResult: ${counts.PASS} PASS, ${counts.WARN} WARN, ${counts.FAIL} FAIL`);
process.exit(counts.FAIL ? 1 : 0);