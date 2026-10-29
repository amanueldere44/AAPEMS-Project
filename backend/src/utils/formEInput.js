// Pure helper: turns rows loaded from the database into the `groupsInput`
// object that computeFormE() expects. No database access here, so it can be
// tested with plain objects.

import { EVALUATOR_TYPES, SCORING_CONFIG, responseFromDbRow, scoreEvaluation } from './evaluationSummary.js';

/**
 * assignments: one row per evaluation_assignment of the instructor in the cycle
 *   { form_version_id, evaluator_type, evaluation_id | null, evaluation_status | null }
 * criteriaByVersion: Map(formVersionId -> [{ id, sectionKey, sectionTitle }])
 * scoresByEvaluation: Map(evaluationId -> [{ criterion_id, score, is_na }])
 *
 * Every assignment counts toward `assignedCount`, so an evaluator who has not
 * submitted keeps the result incomplete. Only submitted/approved evaluations
 * are scored; the others are passed on with their status so Form E can list
 * them as excluded.
 */
export function buildGroupsInput({ assignments, criteriaByVersion, scoresByEvaluation }, options = {}) {
  const counted = options.countedStatuses ?? SCORING_CONFIG.countedStatuses;
  const groups = Object.fromEntries(EVALUATOR_TYPES.map((type) => [type, { evaluations: [], assignedCount: 0 }]));

  for (const assignment of assignments) {
    const group = groups[assignment.evaluator_type];
    if (!group) continue;
    group.assignedCount += 1;

    if (assignment.evaluation_id === null || assignment.evaluation_id === undefined) continue;
    const base = { id: Number(assignment.evaluation_id), status: assignment.evaluation_status };
    if (!counted.includes(assignment.evaluation_status)) {
      group.evaluations.push(base);
      continue;
    }

    const criteria = criteriaByVersion.get(Number(assignment.form_version_id)) ?? [];
    const responses = (scoresByEvaluation.get(base.id) ?? []).map(responseFromDbRow);
    group.evaluations.push({ ...base, ...scoreEvaluation(responses, criteria, options) });
  }
  return groups;
}