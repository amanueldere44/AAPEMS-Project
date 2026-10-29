// Pure function: turns the rows that describe one evaluation summary into the stages of the
// official flowchart (evaluate -> compile/review -> final summary -> copies -> forward -> archive,
// with the improvement branch alongside). No database, no HTTP.
//
// "endReached" is DERIVED for display only. It is not stored and is not an official status:
// the documents do not define when the whole process is "complete". It is true when the report
// branch is finished (evaluations approved, finalized, three copies, forwarded, three archive
// levels) and the improvement branch is either not used or fully worked through.

export const EVALUATOR_TYPES = ['student', 'department_head', 'peer', 'self'];
export const COPY_RECIPIENTS = ['teacher', 'department', 'college'];
export const ARCHIVE_LEVELS = ['department', 'college_school_institute', 'university'];

const FINAL_STATUSES = ['reviewed', 'archived'];

function stage(key, label, state, detail = null) {
  return { key, label, state, detail };
}

export function deriveLifecycle({ summary, evaluators = [], copies = [], routing = null, levels = [], referrals = [] }) {
  const byType = new Map(evaluators.map((row) => [row.type, row]));
  const groups = EVALUATOR_TYPES.map((type) => {
    const row = byType.get(type) || {};
    return { type, assigned: Number(row.assigned || 0), submitted: Number(row.submitted || 0), approved: Number(row.approved || 0) };
  });
  const evaluationsDone = groups.every((g) => g.assigned > 0 && g.approved === g.assigned);
  const anyAssigned = groups.some((g) => g.assigned > 0);

  const finalized = FINAL_STATUSES.includes(summary.status);
  const copiesRecorded = COPY_RECIPIENTS.filter((r) => copies.includes(r));
  const levelsRecorded = ARCHIVE_LEVELS.filter((l) => levels.includes(l));
  const forwarded = Boolean(routing?.forwardedAt);

  const referralCount = referrals.length;
  const improvementWorked = referralCount > 0
    && referrals.every((r) => r.acknowledged && r.activityCount > 0 && r.completedCount === r.activityCount);

  const improvementState = referralCount === 0 ? 'not_started' : improvementWorked ? 'done' : 'in_progress';

  const stages = [
    stage('evaluations', 'Evaluations submitted and approved',
      evaluationsDone ? 'done' : anyAssigned ? 'in_progress' : 'not_started', { groups }),
    stage('final_summary', 'Final evaluation summary (Form E)', finalized ? 'done' : evaluationsDone ? 'ready' : 'blocked'),
    stage('copies', 'Copies to instructor, department and college',
      copiesRecorded.length === COPY_RECIPIENTS.length ? 'done' : finalized ? 'in_progress' : 'blocked',
      { recorded: copiesRecorded, total: COPY_RECIPIENTS.length }),
    stage('forwarded', 'Forwarded to the Academic Affairs office',
      forwarded ? 'done' : copiesRecorded.length === COPY_RECIPIENTS.length ? 'ready' : 'blocked'),
    stage('archive', 'Archived at department, college and university levels',
      levelsRecorded.length === ARCHIVE_LEVELS.length ? 'done' : forwarded ? 'in_progress' : 'blocked',
      { recorded: levelsRecorded, total: ARCHIVE_LEVELS.length }),
    stage('improvement', 'Improvement referrals and support activities', improvementState,
      { referrals: referralCount, acknowledged: referrals.filter((r) => r.acknowledged).length }),
  ];

  const reportBranchDone = stages.slice(0, 5).every((s) => s.state === 'done');
  const endReached = reportBranchDone && (referralCount === 0 || improvementWorked);

  return { summaryId: Number(summary.id), status: summary.status, stages, endReached, endReachedIsDerived: true };
}