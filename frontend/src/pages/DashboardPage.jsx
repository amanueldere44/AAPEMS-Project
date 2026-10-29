import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  RefreshCw,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import StatCard from '../components/StatCard.jsx';
import { apiRequest } from '../services/api.js';

function formatNumber(value) {
  const number = Number(value ?? 0);

  return Number.isFinite(number)
    ? new Intl.NumberFormat().format(number)
    : '—';
}

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function statusClass(status) {
  switch (String(status || '').toLowerCase()) {
    case 'submitted':
    case 'approved':
    case 'completed':
      return 'status-green';

    case 'pending':
    case 'in_progress':
      return 'status-amber';

    case 'draft':
      return 'status-blue';

    default:
      return 'status-gray';
  }
}

function SectionHeading({ title, description, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="asems-text-primary text-base font-semibold">
          {title}
        </h2>

        <p className="asems-muted mt-1 text-sm">
          {description}
        </p>
      </div>

      {action}
    </div>
  );
}

function DashboardLink({ to, children }) {
  return (
    <Link
      to={to}
      className="asems-dashboard-link inline-flex items-center gap-1 text-sm font-medium"
    >
      {children}
    </Link>
  );
}

function LoadingPanel() {
  return (
    <div className="asems-surface flex items-center gap-3 rounded-xl border p-8 text-sm">
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--asems-border)] border-t-[var(--asems-accent)]"
        aria-hidden="true"
      />

      <span className="asems-muted">
        Loading live dashboard data…
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* General dashboard (admin, committee, student, teacher, archives…)   */
/* ------------------------------------------------------------------ */

function GeneralDashboard({ user }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError('');

    try {
      const response = await apiRequest('/dashboard');

      if (!response?.success || !response?.data) {
        throw new Error(
          'The dashboard API returned an unexpected response.',
        );
      }

      setDashboard(response.data);
    } catch (err) {
      setError(err.message || 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const counts = dashboard?.counts ?? {};
  const users = dashboard?.users;
  const cycles = dashboard?.cycles ?? [];
  const recent = dashboard?.recent ?? [];

  // Teachers and students take part in evaluations; they do not manage cycles or tasks.
  const isParticipant = user?.role === 'teacher' || user?.role === 'student';
  const openCycles = cycles.filter((cycle) => cycle.status === 'active');

  const totalAssignments = Number(counts.total ?? 0);
  const submittedAssignments = Number(counts.submitted ?? 0);

  const completion =
    totalAssignments > 0
      ? Math.round(
          (submittedAssignments / totalAssignments) * 100,
        )
      : 0;

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="asems-dashboard-eyebrow mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em]">
            <span className="h-px w-6 bg-gold-500" />
            Academic performance
          </div>

          <h1 className="asems-text-primary text-2xl font-semibold tracking-tight sm:text-[30px]">
            Evaluation overview
          </h1>

          <p className="asems-muted mt-2 max-w-2xl text-sm leading-6">
            Live evaluation statistics and recent records from ASEMS.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadDashboard(true)}
          disabled={loading || refreshing}
          className="asems-secondary-button inline-flex items-center gap-2"
        >
          <RefreshCw
            size={16}
            className={refreshing ? 'animate-spin' : ''}
            aria-hidden="true"
          />

          {refreshing ? 'Refreshing…' : 'Refresh data'}
        </button>
      </section>

      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="asems-error-panel rounded-xl border p-4 text-sm"
        >
          <p className="font-semibold">
            Dashboard data could not be loaded
          </p>

          <p className="mt-1">{error}</p>

          <button
            type="button"
            onClick={() => loadDashboard()}
            className="mt-3 font-semibold underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      {loading && !dashboard ? (
        <LoadingPanel />
      ) : (
        <>
          {/* Statistics */}
          <section
            aria-label="Evaluation statistics"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {users !== null && users !== undefined && (
              <StatCard
                label="Total users"
                value={formatNumber(users.total)}
                note={`${formatNumber(users.active)} active accounts`}
                icon={UsersRound}
                tone="navy"
              />
            )}

            <StatCard
              label="Active evaluation cycles"
              value={formatNumber(dashboard?.activeCycles)}
              note="Cycles currently marked active"
              icon={CalendarDays}
              tone="teal"
            />

            <StatCard
              label="Evaluation assignments"
              value={formatNumber(counts.total)}
              note={`${formatNumber(counts.submitted)} submitted`}
              icon={ClipboardCheck}
              tone="gold"
            />

            <StatCard
              label="Pending assignments"
              value={formatNumber(counts.pending)}
              note={`${formatNumber(counts.draft)} drafts`}
              icon={Clock3}
              tone="slate"
            />
          </section>

          {/* Completion and evaluation cycles */}
          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="asems-surface rounded-xl border p-5 shadow-sm sm:p-6">
              <SectionHeading
                title="Assignment completion"
                description="Based on actual assignment statuses"
              />

              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="asems-text-primary text-3xl font-semibold">
                    {completion}%
                  </p>

                  <p className="asems-muted mt-1 text-sm">
                    Submitted assignments
                  </p>
                </div>

                <CheckCircle2
                  className="mb-1 text-teal-500"
                  size={28}
                  aria-hidden="true"
                />
              </div>

              <div
                className="asems-progress-track mt-5 h-3 overflow-hidden rounded-full"
                role="progressbar"
                aria-label="Assignment completion"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={completion}
              >
                <div
                  className="h-full rounded-full bg-teal-500 transition-all duration-500"
                  style={{ width: `${completion}%` }}
                />
              </div>

              <div className="asems-muted mt-4 flex flex-wrap justify-between gap-2 text-xs">
                <span>
                  {formatNumber(counts.submitted)} submitted
                </span>

                <span>
                  {formatNumber(counts.total)} total assignments
                </span>
              </div>

              {totalAssignments === 0 && (
                <p className="asems-muted mt-4 text-sm">
                  No assignments are available for this dashboard scope yet.
                </p>
              )}
            </div>

            <div className="asems-surface rounded-xl border p-5 shadow-sm sm:p-6">
              <SectionHeading
                title={isParticipant ? 'Current evaluation cycle' : 'Evaluation cycles'}
                description={
                  isParticipant
                    ? 'The cycle that is open for evaluation now'
                    : 'Most recent cycles returned by the API'
                }
                action={
                  isParticipant ? null : (
                    <DashboardLink to="/cycles">
                      View all <ArrowRight size={15} />
                    </DashboardLink>
                  )
                }
              />

              {(isParticipant ? openCycles : cycles).length === 0 ? (
                <p className="asems-muted py-4 text-sm">
                  {isParticipant
                    ? 'No evaluation cycle is open right now.'
                    : 'No evaluation cycles were found.'}
                </p>
              ) : (
                <div className="divide-y divide-[var(--asems-border)]">
                  {(isParticipant ? openCycles : cycles).slice(0, 5).map((cycle) => (
                    <div
                      key={cycle.id}
                      className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="asems-text-primary truncate text-sm font-medium">
                          {cycle.title}
                        </p>

                        <p className="asems-muted mt-1 text-xs">
                          {cycle.academic_year ||
                            'Academic year not specified'}
                        </p>

                        <p className="asems-muted mt-1 text-xs">
                          {formatDate(cycle.start_date)} –{' '}
                          {formatDate(cycle.end_date)}
                        </p>
                      </div>

                      <span
                        className={`status-pill shrink-0 ${statusClass(cycle.status)}`}
                      >
                        {cycle.status || 'Unknown'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Recent evaluation activity */}
          <section className="asems-surface overflow-hidden rounded-xl border shadow-sm">
            <div className="p-5 sm:p-6">
              <SectionHeading
                title="Recent evaluation activity"
                description="Latest assignment records returned by the backend"
                action={
                  isParticipant ? (
                    <DashboardLink to="/my-evaluations">
                      Open my evaluations <ArrowRight size={15} />
                    </DashboardLink>
                  ) : user?.role === 'admin' ? null : (
                    <DashboardLink to="/tasks">
                      View tasks <ArrowRight size={15} />
                    </DashboardLink>
                  )
                }
              />
            </div>

            <div className="overflow-x-auto">
              <table className="asems-dashboard-table min-w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-5 py-3">Form</th>
                    <th className="px-5 py-3">Instructor</th>
                    <th className="px-5 py-3">Evaluation cycle</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Submitted</th>
                  </tr>
                </thead>

                <tbody>
                  {recent.map((item) => {
                    const status =
                      item.evaluation_status || item.assignment_status;

                    return (
                      <tr key={item.assignment_id}>
                        <td className="px-5 py-4">
                          <p className="asems-text-primary font-medium">
                            {item.form_title || 'Untitled form'}
                          </p>

                          <p className="asems-muted mt-1 text-xs">
                            {item.form_code ||
                              `Assignment #${item.assignment_id}`}
                          </p>
                        </td>

                        <td className="asems-table-secondary px-5 py-4">
                          {item.instructor_name || '—'}
                        </td>

                        <td className="asems-table-secondary px-5 py-4">
                          {item.cycle_title || '—'}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`status-pill ${statusClass(status)}`}
                          >
                            {status || 'Unknown'}
                          </span>
                        </td>

                        <td className="asems-muted whitespace-nowrap px-5 py-4">
                          {formatDate(item.submitted_at)}
                        </td>
                      </tr>
                    );
                  })}

                  {recent.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="asems-muted px-5 py-10 text-center text-sm"
                      >
                        <Activity
                          className="mx-auto mb-2 opacity-70"
                          size={22}
                          aria-hidden="true"
                        />

                        No evaluation activity is available yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <p className="asems-muted text-xs">
            Figures reflect the records returned by the current dashboard API.
            Final weighted evaluation scores are not calculated here.
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Concerned office dashboard (referral-focused)                       */
/* ------------------------------------------------------------------ */

function ConcernedOfficeDashboard() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiRequest(
        '/improvement/referrals?page=1&pageSize=100',
      );

      setItems(response?.data?.items ?? []);
      setTotal(Number(response?.data?.total ?? 0));
    } catch (err) {
      setError(err.message || 'Unable to load your referrals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const acknowledged = items.filter((r) => r.acknowledgedAt).length;
  const waiting = items.length - acknowledged;
  const planned = items.reduce(
    (sum, r) => sum + Number(r.activityCount ?? 0),
    0,
  );
  const done = items.reduce(
    (sum, r) => sum + Number(r.completedCount ?? 0),
    0,
  );

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="asems-dashboard-eyebrow mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em]">
            <span className="h-px w-6 bg-gold-500" />
            Support planning
          </div>

          <h1 className="asems-text-primary text-2xl font-semibold tracking-tight sm:text-[30px]">
            Referral overview
          </h1>

          <p className="asems-muted mt-2 max-w-2xl text-sm leading-6">
            Performance gaps referred to your office, and the support and
            capacity-building activities you have planned.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="asems-secondary-button inline-flex items-center gap-2"
        >
          <RefreshCw
            size={16}
            className={loading ? 'animate-spin' : ''}
            aria-hidden="true"
          />
          {loading ? 'Refreshing…' : 'Refresh data'}
        </button>
      </section>

      {error && (
        <div
          role="alert"
          className="asems-error-panel rounded-xl border p-4 text-sm"
        >
          <p className="font-semibold">Referrals could not be loaded</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {loading && items.length === 0 && !error ? (
        <LoadingPanel />
      ) : (
        <>
          <section
            aria-label="Referral statistics"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <StatCard
              label="Referrals received"
              value={formatNumber(total)}
              note="Sent to your office"
              icon={ClipboardCheck}
              tone="navy"
            />

            <StatCard
              label="Waiting for acknowledgement"
              value={formatNumber(waiting)}
              note="Open the referral to acknowledge it"
              icon={Clock3}
              tone="gold"
            />

            <StatCard
              label="Acknowledged"
              value={formatNumber(acknowledged)}
              note="Support planning can start"
              icon={CheckCircle2}
              tone="teal"
            />

            <StatCard
              label="Activities completed"
              value={`${formatNumber(done)} / ${formatNumber(planned)}`}
              note="Planned support activities"
              icon={Activity}
              tone="slate"
            />
          </section>

          <section className="asems-surface rounded-xl border p-5 shadow-sm sm:p-6">
            <SectionHeading
              title="Next step"
              description={
                waiting > 0
                  ? `${formatNumber(waiting)} referral(s) are waiting for you.`
                  : 'No referral is waiting for acknowledgement.'
              }
              action={
                <DashboardLink to="/improvement">
                  My referrals <ArrowRight size={15} />
                </DashboardLink>
              }
            />
          </section>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dean, Academic VP, Department Head and College administration       */
/* ------------------------------------------------------------------ */

const EMPTY_DATA = { evaluations: [], summaries: [], referrals: [] };

const SUMMARY_PILL = {
  complete: 'status-blue',
  reviewed: 'status-green',
  archived: 'status-gray',
  incomplete: 'status-amber',
};

const ROLE_COPY = {
  dean: {
    eyebrow: 'College administration',
    title: 'Dean overview',
    text: 'Your leadership evaluations of department heads, the final reports of your college, and the improvement referrals that follow them.',
  },
  academic_vp: {
    eyebrow: 'Academic Affairs',
    title: 'Academic Affairs VP overview',
    text: 'Your leadership evaluations of deans, and the final reports that colleges forwarded to your office.',
  },
  department_head: {
    eyebrow: 'Department',
    title: 'Department head overview',
    text: 'Final summaries of your department and the improvement referrals you sent to the concerned offices.',
  },
  management: {
    eyebrow: 'College / school administration',
    title: 'College administration overview',
    text: 'Final summaries received from the departments, and the reports that still have to be forwarded to the Academic Affairs VP office.',
  },
};

const countBy = (items, predicate) => items.filter(predicate).length;

async function fetchItems(path) {
  const response = await apiRequest(path);
  return response?.data?.items ?? [];
}

function SimpleTable({ title, description, action, columns, rows, empty }) {
  return (
    <section className="asems-surface overflow-hidden rounded-xl border shadow-sm">
      <div className="p-5 sm:p-6">
        <SectionHeading
          title={title}
          description={description}
          action={action}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="asems-dashboard-table min-w-full text-left text-sm">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-5 py-3">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className="asems-table-secondary px-5 py-4"
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="asems-muted px-5 py-10 text-center text-sm"
                >
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RoleDashboard({ role }) {
  const copy = ROLE_COPY[role];
  const usesLeadership = role === 'dean' || role === 'academic_vp';
  const usesReferrals = role === 'dean' || role === 'department_head';

  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    const jobs = [
      ['evaluations', usesLeadership ? '/leadership/evaluations?pageSize=100' : null],
      ['summaries', '/reports/summaries?limit=100'],
      ['referrals', usesReferrals ? '/improvement/referrals?pageSize=100' : null],
    ];

    const results = await Promise.allSettled(
      jobs.map(([, path]) => (path ? fetchItems(path) : Promise.resolve([]))),
    );

    const next = { ...EMPTY_DATA };
    const failures = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        next[jobs[index][0]] = result.value;
      } else {
        failures.push(result.reason?.message || 'A request failed.');
      }
    });

    setData(next);
    setError(failures[0] || '');
    setLoading(false);
  }, [usesLeadership, usesReferrals]);

  useEffect(() => {
    load();
  }, [load]);

  const { evaluations, summaries, referrals } = data;

  const draftEvaluations = countBy(evaluations, (item) => item.status === 'draft');
  const submittedEvaluations = countBy(evaluations, (item) => item.status === 'submitted');

  const byStatus = (status) =>
    countBy(summaries, (item) => String(item.status || '').toLowerCase() === status);
  const readyToFinalize = byStatus('complete');
  const incomplete = byStatus('incomplete');
  const reviewed = byStatus('reviewed');
  const archived = byStatus('archived');

  // Reviewed reports that were not forwarded to the Academic Affairs VP office yet.
  const waitingToForward = countBy(
    summaries,
    (item) =>
      String(item.status || '').toLowerCase() === 'reviewed' &&
      !item.forwarded_to_vp,
  );

  const waitingReferrals = countBy(referrals, (item) => !item.acknowledgedAt);

  let cards = [];
  const steps = [];

  if (role === 'dean') {
    cards = [
      { label: 'Leadership evaluations', value: evaluations.length, note: `${submittedEvaluations} submitted`, icon: ClipboardCheck, tone: 'navy' },
      { label: 'Drafts to finish', value: draftEvaluations, note: 'Saved but not submitted', icon: Clock3, tone: 'gold' },
      { label: 'Waiting to forward', value: waitingToForward, note: 'Reviewed, not yet sent to the VP office', icon: CheckCircle2, tone: 'teal' },
      { label: 'Referrals', value: referrals.length, note: `${waitingReferrals} waiting for the office`, icon: Activity, tone: 'slate' },
    ];
    if (draftEvaluations > 0) {
      steps.push({ text: `Finish ${draftEvaluations} leadership evaluation(s)`, to: '/leadership' });
    }
    if (waitingToForward > 0) {
      steps.push({ text: `${waitingToForward} reviewed report(s) are waiting to be forwarded to the Academic Affairs VP office`, to: '/reports' });
    }
  } else if (role === 'academic_vp') {
    cards = [
      { label: 'Leadership evaluations', value: evaluations.length, note: `${submittedEvaluations} submitted`, icon: ClipboardCheck, tone: 'navy' },
      { label: 'Drafts to finish', value: draftEvaluations, note: 'Saved but not submitted', icon: Clock3, tone: 'gold' },
      { label: 'Reports received', value: summaries.length, note: `${archived} archived`, icon: CheckCircle2, tone: 'teal' },
      { label: 'Awaiting copies or archive', value: reviewed, note: 'Record the three report copies', icon: Activity, tone: 'slate' },
    ];
    if (draftEvaluations > 0) {
      steps.push({ text: `Finish ${draftEvaluations} leadership evaluation(s)`, to: '/leadership' });
    }
    if (reviewed > 0) {
      steps.push({ text: `${reviewed} report(s) need the teacher, department and college copies`, to: '/reports' });
    }
  } else if (role === 'management') {
    cards = [
      { label: 'Summaries received', value: summaries.length, note: `${incomplete} still incomplete`, icon: ClipboardCheck, tone: 'navy' },
      { label: 'Waiting to forward', value: waitingToForward, note: 'Reviewed, not yet sent to the VP office', icon: Clock3, tone: 'gold' },
      { label: 'Ready to finalize', value: readyToFinalize, note: 'Waiting for the final Form E comments', icon: Activity, tone: 'slate' },
      { label: 'Archived', value: archived, note: 'Archived at all three levels', icon: CheckCircle2, tone: 'teal' },
    ];
    if (waitingToForward > 0) {
      steps.push({ text: `${waitingToForward} reviewed report(s) are waiting to be forwarded to the Academic Affairs VP office`, to: '/reports' });
    }
  } else {
    cards = [
      { label: 'Ready to finalize', value: readyToFinalize, note: 'All forms approved', icon: ClipboardCheck, tone: 'navy' },
      { label: 'Incomplete', value: incomplete, note: 'Waiting for approved forms', icon: Clock3, tone: 'gold' },
      { label: 'Reviewed', value: reviewed, note: `${archived} archived`, icon: CheckCircle2, tone: 'teal' },
      { label: 'Referrals sent', value: referrals.length, note: `${waitingReferrals} waiting for the office`, icon: Activity, tone: 'slate' },
    ];
    if (readyToFinalize > 0) {
      steps.push({ text: `${readyToFinalize} summary(ies) are ready for the final Form E comments`, to: '/reports' });
    }
    if (waitingReferrals > 0) {
      steps.push({ text: `${waitingReferrals} referral(s) are waiting for the concerned office`, to: '/improvement' });
    }
  }

  const evaluationColumns = [
    { key: 'who', label: 'Evaluatee', render: (row) => row.evaluateeName || '—' },
    { key: 'cycle', label: 'Evaluation cycle', render: (row) => row.cycleTitle || '—' },
    { key: 'progress', label: 'Progress', render: (row) => `${row.answeredCriteria ?? 0} / ${row.totalCriteria ?? 0}` },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={`status-pill ${statusClass(row.status)}`}>
          {row.status || 'Unknown'}
        </span>
      ),
    },
  ];

  const summaryColumns = [
    { key: 'who', label: 'Instructor', render: (row) => row.instructor_name || '—' },
    { key: 'cycle', label: 'Evaluation cycle', render: (row) => row.cycle_title || '—' },
    {
      key: 'total',
      label: 'Total / 100',
      render: (row) =>
        ['complete', 'reviewed', 'archived'].includes(String(row.status || '').toLowerCase())
          ? Number(row.total_score ?? 0).toFixed(2)
          : '—',
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => {
        const status = String(row.status || '').toLowerCase();
        return (
          <span className={`status-pill ${SUMMARY_PILL[status] || 'status-gray'}`}>
            {status || 'unknown'}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="asems-dashboard-eyebrow mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em]">
            <span className="h-px w-6 bg-gold-500" />
            {copy.eyebrow}
          </div>

          <h1 className="asems-text-primary text-2xl font-semibold tracking-tight sm:text-[30px]">
            {copy.title}
          </h1>

          <p className="asems-muted mt-2 max-w-2xl text-sm leading-6">
            {copy.text}
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="asems-secondary-button inline-flex items-center gap-2"
        >
          <RefreshCw
            size={16}
            className={loading ? 'animate-spin' : ''}
            aria-hidden="true"
          />
          {loading ? 'Refreshing…' : 'Refresh data'}
        </button>
      </section>

      {error && (
        <div
          role="alert"
          className="asems-error-panel rounded-xl border p-4 text-sm"
        >
          <p className="font-semibold">Some dashboard data could not be loaded</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {loading &&
      evaluations.length === 0 &&
      summaries.length === 0 &&
      referrals.length === 0 &&
      !error ? (
        <LoadingPanel />
      ) : (
        <>
          <section
            aria-label="Overview statistics"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {cards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={formatNumber(card.value)}
                note={card.note}
                icon={card.icon}
                tone={card.tone}
              />
            ))}
          </section>

          <section className="asems-surface rounded-xl border p-5 shadow-sm sm:p-6">
            <SectionHeading
              title="Next steps"
              description={
                steps.length > 0
                  ? 'Work that is waiting for you.'
                  : 'Nothing is waiting for you right now.'
              }
            />

            {steps.length > 0 && (
              <ul className="divide-y divide-[var(--asems-border)]">
                {steps.map((step) => (
                  <li
                    key={step.text}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="asems-text-primary text-sm">{step.text}</span>
                    <DashboardLink to={step.to}>
                      Open <ArrowRight size={15} />
                    </DashboardLink>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {usesLeadership ? (
            <SimpleTable
              title="My leadership evaluations"
              description="Evaluations assigned to you by the administrator"
              action={
                <DashboardLink to="/leadership">
                  View all <ArrowRight size={15} />
                </DashboardLink>
              }
              columns={evaluationColumns}
              rows={evaluations.slice(0, 5)}
              empty="No leadership evaluation has been assigned to you yet."
            />
          ) : (
            <SimpleTable
              title="Recent summaries"
              description="Latest final evaluation summaries in your scope"
              action={
                <DashboardLink to="/reports">
                  View all <ArrowRight size={15} />
                </DashboardLink>
              }
              columns={summaryColumns}
              rows={summaries.slice(0, 5)}
              empty="No evaluation summary is available yet."
            />
          )}

          <p className="asems-muted text-xs">
            Figures are counted from the most recent 100 records returned by the backend.
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function DashboardPage({ user }) {
  if (user?.role === 'concerned_office') {
    return <ConcernedOfficeDashboard />;
  }

  if (['dean', 'academic_vp', 'department_head', 'management'].includes(user?.role)) {
    return <RoleDashboard key={user.role} role={user.role} />;
  }

  return <GeneralDashboard user={user} />;
}