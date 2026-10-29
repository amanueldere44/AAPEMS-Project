import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireAuth, allowRoles } from '../middlewares/auth.js';
import { asyncHandler, httpError, sendData } from '../utils/http.js';
import { writeAudit } from '../utils/audit.js';
import {
  buildRatingScale,
  draftContentSchema,
  findContentProblems,
} from '../utils/formContent.js';

const router = Router();
router.use(requireAuth);

function parseId(value, label) {
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw httpError(400, `Invalid ${label}.`, 'VALIDATION_ERROR');
  }
  return Number(value);
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

function audit(connection, req, action, versionId, details = {}) {
  return writeAudit(connection, {
    userId: req.user.id,
    action,
    entityType: 'form_version',
    entityId: versionId,
    details,
    ipAddress: req.ip,
  });
}

// Loads one version with its sections and active criteria.
async function loadVersion(executor, versionId) {
  const [versions] = await executor.execute(
    `SELECT v.id, v.form_id, v.version_no, v.status, v.instructions, v.scale_min, v.scale_max,
            v.allow_na, v.scale_labels, v.published_at, v.created_at,
            f.code, f.title AS form_title, f.evaluator_type, f.weight
       FROM form_versions v
       JOIN evaluation_forms f ON f.id = v.form_id
      WHERE v.id = ?`,
    [versionId],
  );
  const version = versions[0];
  if (!version) return null;

  const [sections] = await executor.execute(
    `SELECT id, section_key, title, sort_order
       FROM form_sections WHERE form_version_id = ?
      ORDER BY sort_order, id`,
    [versionId],
  );
  const [criteria] = await executor.execute(
    `SELECT c.id, c.section_id, c.text, c.sort_order
       FROM form_criteria c
       JOIN form_sections s ON s.id = c.section_id
      WHERE s.form_version_id = ? AND c.is_active = 1
      ORDER BY s.sort_order, s.id, c.sort_order, c.id`,
    [versionId],
  );

  return {
    id: Number(version.id),
    formId: Number(version.form_id),
    code: version.code,
    title: version.form_title,
    evaluatorType: version.evaluator_type,
    weight: Number(version.weight),
    versionNo: version.version_no,
    status: version.status,
    instructions: version.instructions,
    allowNa: Number(version.allow_na) === 1,
    scaleMin: version.scale_min,
    scaleMax: version.scale_max,
    scaleLabels: version.scale_labels ?? null,
    ratingScale: buildRatingScale({
      scaleMin: version.scale_min,
      scaleMax: version.scale_max,
      allowNa: Number(version.allow_na) === 1,
    }),
    publishedAt: version.published_at,
    sections: sections.map((section) => ({
      id: Number(section.id),
      sectionKey: section.section_key,
      title: section.title,
      sortOrder: section.sort_order,
      criteria: criteria
        .filter((item) => String(item.section_id) === String(section.id))
        .map((item) => ({ id: Number(item.id), text: item.text, sortOrder: item.sort_order })),
    })),
  };
}

async function insertSections(connection, formId, versionId, sections) {
  for (const [sectionIndex, section] of sections.entries()) {
    const [result] = await connection.execute(
      `INSERT INTO form_sections (form_id, form_version_id, section_key, title, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [formId, versionId, section.sectionKey, section.title, sectionIndex + 1],
    );
    for (const [criterionIndex, criterion] of section.criteria.entries()) {
      await connection.execute(
        'INSERT INTO form_criteria (section_id, text, sort_order, is_active) VALUES (?, ?, ?, 1)',
        [result.insertId, criterion.text, criterionIndex + 1],
      );
    }
  }
}

async function lockDraft(connection, versionId) {
  const [rows] = await connection.execute(
    'SELECT id, form_id, status FROM form_versions WHERE id = ? FOR UPDATE',
    [versionId],
  );
  const version = rows[0];
  if (!version) throw httpError(404, 'Form version not found.', 'NOT_FOUND');
  if (version.status !== 'draft') {
    throw httpError(409, 'Only draft versions can be changed. Create a new draft instead.', 'VERSION_LOCKED');
  }
  const [used] = await connection.execute(
    'SELECT COUNT(*) AS count FROM evaluation_assignments WHERE form_version_id = ?',
    [versionId],
  );
  if (Number(used[0].count) > 0) {
    throw httpError(409, 'This version is already used by assignments.', 'VERSION_IN_USE');
  }
  return version;
}

// GET /api/forms - the currently published version of every active form (used to render evaluations).
router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT v.id FROM form_versions v
       JOIN evaluation_forms f ON f.id = v.form_id
      WHERE v.status = 'published' AND f.is_active = 1
      ORDER BY f.code`,
  );
  const forms = [];
  for (const row of rows) forms.push(await loadVersion(pool, row.id));
  sendData(res, { forms });
}));

// GET /api/forms/:formId/versions - version history (admin).
router.get('/:formId/versions', allowRoles('admin'), asyncHandler(async (req, res) => {
  const formId = parseId(req.params.formId, 'form ID');
  const [rows] = await pool.execute(
    `SELECT v.id, v.version_no, v.status, v.published_at, v.created_at,
            (SELECT COUNT(*) FROM form_sections s WHERE s.form_version_id = v.id) AS section_count,
            (SELECT COUNT(*) FROM form_criteria c JOIN form_sections s ON s.id = c.section_id
              WHERE s.form_version_id = v.id AND c.is_active = 1) AS criterion_count
       FROM form_versions v WHERE v.form_id = ? ORDER BY v.version_no DESC`,
    [formId],
  );
  if (rows.length === 0) throw httpError(404, 'Form not found.', 'NOT_FOUND');
  sendData(res, {
    versions: rows.map((row) => ({
      id: row.id,
      versionNo: row.version_no,
      status: row.status,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      sectionCount: Number(row.section_count),
      criterionCount: Number(row.criterion_count),
    })),
  });
}));

// GET /api/forms/versions/:versionId - drafts are visible to admins only.
router.get('/versions/:versionId', asyncHandler(async (req, res) => {
  const versionId = parseId(req.params.versionId, 'version ID');
  const version = await loadVersion(pool, versionId);
  if (!version || (version.status === 'draft' && req.user.role !== 'admin')) {
    throw httpError(404, 'Form version not found.', 'NOT_FOUND');
  }
  sendData(res, { version });
}));

// POST /api/forms/:formId/versions - start a new draft as a copy of the latest version.
router.post('/:formId/versions', allowRoles('admin'), asyncHandler(async (req, res) => {
  const formId = parseId(req.params.formId, 'form ID');

  const versionId = await inTransaction(async (connection) => {
    const [forms] = await connection.execute(
      'SELECT id FROM evaluation_forms WHERE id = ? FOR UPDATE',
      [formId],
    );
    if (!forms[0]) throw httpError(404, 'Form not found.', 'NOT_FOUND');

    const [drafts] = await connection.execute(
      "SELECT id FROM form_versions WHERE form_id = ? AND status = 'draft' LIMIT 1",
      [formId],
    );
    if (drafts[0]) {
      throw httpError(409, 'This form already has a draft version.', 'DRAFT_EXISTS');
    }

    const [latest] = await connection.execute(
      `SELECT id, version_no, instructions, scale_min, scale_max, allow_na, scale_labels
         FROM form_versions WHERE form_id = ?
        ORDER BY (status = 'published') DESC, version_no DESC LIMIT 1`,
      [formId],
    );
    const [maxRow] = await connection.execute(
      'SELECT MAX(version_no) AS max_no FROM form_versions WHERE form_id = ?',
      [formId],
    );
    const source = latest[0];
    const nextNo = Number(maxRow[0].max_no ?? 0) + 1;

    const [inserted] = await connection.execute(
      `INSERT INTO form_versions
         (form_id, version_no, status, instructions, scale_min, scale_max, allow_na, scale_labels, created_by)
       VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
      [
        formId, nextNo, source?.instructions ?? null, source?.scale_min ?? 0, source?.scale_max ?? 5,
        source?.allow_na ?? 1,
        source?.scale_labels == null ? null : JSON.stringify(source.scale_labels),
        req.user.id,
      ],
    );

    if (source) {
      const copy = await loadVersion(connection, source.id);
      await insertSections(connection, formId, inserted.insertId, copy.sections);
    }

    await audit(connection, req, 'form_version.created', inserted.insertId, {
      formId, versionNo: nextNo, copiedFromVersionId: source?.id ?? null,
    });
    return inserted.insertId;
  });

  sendData(res, { version: await loadVersion(pool, versionId) }, 201);
}));

// PUT /api/forms/versions/:versionId - replace the content of a draft.
router.put('/versions/:versionId', allowRoles('admin'), asyncHandler(async (req, res) => {
  const versionId = parseId(req.params.versionId, 'version ID');
  const parsed = draftContentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw httpError(400, `${issue.path.join('.') || 'body'}: ${issue.message}`, 'VALIDATION_ERROR');
  }
  const problems = findContentProblems(parsed.data.sections);
  if (problems.length) throw httpError(400, problems[0], 'VALIDATION_ERROR');

  await inTransaction(async (connection) => {
    const version = await lockDraft(connection, versionId);

    // Criteria are removed with their sections (ON DELETE CASCADE). Only drafts reach this point.
    await connection.execute('DELETE FROM form_sections WHERE form_version_id = ?', [versionId]);
    await insertSections(connection, version.form_id, versionId, parsed.data.sections);

    const sets = ['instructions = ?'];
    const values = [parsed.data.instructions ?? null];
    if (parsed.data.allowNa !== undefined) {
      sets.push('allow_na = ?');
      values.push(parsed.data.allowNa ? 1 : 0);
    }
    await connection.execute(`UPDATE form_versions SET ${sets.join(', ')} WHERE id = ?`, [...values, versionId]);

    await audit(connection, req, 'form_version.updated', versionId, {
      sectionCount: parsed.data.sections.length,
      criterionCount: parsed.data.sections.reduce((sum, section) => sum + section.criteria.length, 0),
    });
  });

  sendData(res, { version: await loadVersion(pool, versionId) });
}));

// POST /api/forms/versions/:versionId/publish - the previously published version becomes retired.
router.post('/versions/:versionId/publish', allowRoles('admin'), asyncHandler(async (req, res) => {
  const versionId = parseId(req.params.versionId, 'version ID');

  await inTransaction(async (connection) => {
    const [formRows] = await connection.execute(
      `SELECT f.id FROM evaluation_forms f JOIN form_versions v ON v.form_id = f.id
        WHERE v.id = ? FOR UPDATE`,
      [versionId],
    );
    if (!formRows[0]) throw httpError(404, 'Form version not found.', 'NOT_FOUND');
    const version = await lockDraft(connection, versionId);

    const [empty] = await connection.execute(
      `SELECT COUNT(*) AS count FROM form_sections s
        WHERE s.form_version_id = ?
          AND NOT EXISTS (SELECT 1 FROM form_criteria c WHERE c.section_id = s.id AND c.is_active = 1)`,
      [versionId],
    );
    const [total] = await connection.execute(
      'SELECT COUNT(*) AS count FROM form_sections WHERE form_version_id = ?',
      [versionId],
    );
    if (Number(total[0].count) === 0 || Number(empty[0].count) > 0) {
      throw httpError(400, 'Every section needs at least one criterion before publishing.', 'INCOMPLETE_FORM');
    }

    await connection.execute(
      "UPDATE form_versions SET status = 'retired' WHERE form_id = ? AND status = 'published'",
      [version.form_id],
    );
    await connection.execute(
      "UPDATE form_versions SET status = 'published', published_by = ?, published_at = NOW() WHERE id = ?",
      [req.user.id, versionId],
    );
    await audit(connection, req, 'form_version.published', versionId, { formId: version.form_id });
  });

  sendData(res, { version: await loadVersion(pool, versionId) });
}));

// DELETE /api/forms/versions/:versionId - discard an unused draft.
router.delete('/versions/:versionId', allowRoles('admin'), asyncHandler(async (req, res) => {
  const versionId = parseId(req.params.versionId, 'version ID');

  await inTransaction(async (connection) => {
    const version = await lockDraft(connection, versionId);
    await connection.execute('DELETE FROM form_sections WHERE form_version_id = ?', [versionId]);
    await connection.execute('DELETE FROM form_versions WHERE id = ?', [versionId]);
    await audit(connection, req, 'form_version.deleted', versionId, { formId: version.form_id });
  });

  sendData(res, { deleted: true });
}));

export default router;