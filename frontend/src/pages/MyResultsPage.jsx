import { useCallback, useEffect, useState } from 'react';
import { Award, Clock, FileDown, RefreshCw } from 'lucide-react';
import { apiRequest } from '../services/api.js';

const VIEW_ROLES = ['teacher'];
const TYPES = ['student', 'department_head', 'peer', 'self'];
const TYPE_LABEL = {
  student: 'Students',
  department_head: 'Department head',
  peer: 'Peers',
  self: 'Self evaluation',
};
const SCALE_MAX = 5;

const fmt = (value, digits = 2) => {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : '—';
};

function formatDate(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

// Every component that has tasks is fully approved, so only the final Form E step is missing.
function allComponentsApproved(cycle) {
  const withTasks = TYPES.filter((type) => cycle.progress?.[type]?.total > 0);
  return (
    withTasks.length > 0 &&
    withTasks.every((type) => cycle.progress[type].approved === cycle.progress[type].total)
  );
}

function Bar({ percent, tone = 'bg-navy-800' }) {
  const safePercent = Number.isFinite(Number(percent))
    ? Math.max(0, Math.min(100, Number(percent)))
    : 0;

  return (
    <div className="h-2 rounded-full bg-slate-100" aria-hidden="true">
      <div
        className={`h-2 rounded-full ${tone}`}
        style={{ width: `${safePercent}%` }}
      />
    </div>
  );
}

function ReleasedCycle({ cycle }) {
  const { scores, comments } = cycle;
  const max = Number(scores.maxTotal) || 100;
  const total = Number(scores.total) || 0;
  const percent = max > 0 ? (total / max) * 100 : 0;

  return (
    <div className="space-y-6 p-5">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Final score
          </p>
          <p className="text-4xl font-bold tabular-nums text-slate-900">
            {fmt(scores.total)}{' '}
            <span className="text-lg font-medium text-slate-400">
              / {fmt(max, 0)}
            </span>
          </p>
        </div>

        <div className="min-w-[200px] flex-1">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>Overall</span>
            <span className="tabular-nums">{Math.round(percent)}%</span>
          </div>
          <Bar percent={percent} tone="bg-gold-500" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Component</th>
              <th className="px-4 py-3 font-semibold">Average</th>
              <th className="px-4 py-3 font-semibold">Weighted score</th>
              <th className="w-48 px-4 py-3 font-semibold">Level</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {TYPES.map((type) => {
              const item = scores.components[type];
              const level =
                item.average === null
                  ? 0
                  : (item.average / SCALE_MAX) * 100;

              return (
                <tr key={type}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {TYPE_LABEL[type]}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">
                    {fmt(item.average)} / {SCALE_MAX}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">
                    {fmt(item.weighted)}
                    {item.weight !== null && ` / ${item.weight}`}
                  </td>
                  <td className="px-4 py-3">
                    <Bar percent={level} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {comments &&
        (comments.strengths.length > 0 ||
          comments.improvements.length > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              ['Strengths', comments.strengths],
              ['Areas for improvement', comments.improvements],
            ].map(([title, list]) => (
              <div
                key={title}
                className="rounded-lg border border-slate-200 p-4"
              >
                <h3 className="text-sm font-semibold text-slate-800">
                  {title}
                </h3>
                {list.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">
                    No comments.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {list.map((item, index) => (
                      <li
                        key={`${item.type}-${index}`}
                        className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"
                      >
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {TYPE_LABEL[item.type] ?? item.type}
                        </span>
                        <span className="whitespace-pre-line">
                          {item.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

      <p className="text-xs text-slate-500">
        Results are aggregated and anonymous. Individual evaluator answers
        are never shown.
      </p>
    </div>
  );
}

function PendingCycle({ cycle }) {
  const allApproved = allComponentsApproved(cycle);

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Clock size={18} className="mt-0.5 shrink-0" />
        <p>
          {allApproved
            ? 'All evaluations are approved. Your results are released after the Committee or Department Head records the final Form E comments.'
            : 'Your results are not released yet. They appear after every component is submitted and approved, and the Committee or Department Head records the final Form E comments.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TYPES.map((type) => {
          const item = cycle.progress[type];
          const percent =
            item?.total > 0 ? (item.approved / item.total) * 100 : 0;

          return (
            <div
              key={type}
              className="rounded-lg border border-slate-200 p-4"
            >
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-slate-900">
                  {TYPE_LABEL[type]}
                </p>
                <p className="text-xs tabular-nums text-slate-500">
                  {item ? `${item.submitted}/${item.total} submitted` : 'Not assigned'}
                </p>
              </div>
              <div className="mt-2">
                <Bar percent={percent} tone="bg-emerald-500" />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {item
                  ? `${item.approved}/${item.total} approved`
                  : 'No tasks created yet'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MyResultsPage({ user }) {
  const allowed = VIEW_ROLES.includes(user?.role);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await apiRequest('/results/me');
      setResults(result?.data?.results ?? []);
    } catch (err) {
      setError(err.message || 'Unable to load your results.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const releasedResults = results.filter((cycle) => cycle.released);

  function printReleasedResults() {
    if (releasedResults.length === 0) return;
    window.print();
  }

  if (!allowed) {
    return (
      <section className="rounded-2xl border border-rose-100 bg-white p-8">
        <h1 className="text-xl font-semibold text-slate-900">
          Access restricted
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Evaluation results are shown to the instructor who was evaluated.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 14mm;
        }

        @media print {
          html, body {
            background: #fff !important;
            color: #0f172a !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          body * {
            visibility: hidden !important;
          }

          .my-results-print,
          .my-results-print * {
            visibility: visible !important;
          }

          .my-results-print {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
          }

          .no-print {
            display: none !important;
          }

          .print-cycle {
            break-inside: avoid;
            page-break-inside: avoid;
            border: 0 !important;
            box-shadow: none !important;
            margin-bottom: 12mm !important;
          }

          .print-cycle-header {
            background: #fff !important;
            border-bottom: 1px solid #cbd5e1 !important;
          }

          .print-brand {
            display: block !important;
          }

          .my-results-print table {
            width: 100% !important;
            border-collapse: collapse !important;
          }

          .my-results-print th,
          .my-results-print td {
            border: 1px solid #cbd5e1 !important;
            padding: 6px !important;
            font-size: 10px !important;
          }

          .my-results-print li,
          .my-results-print section {
            break-inside: avoid;
          }
        }
      `}</style>

      <div className="no-print flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-500">Evaluations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            My results
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Your evaluation score for each cycle, released once every
            evaluation is approved and the final Form E review is recorded.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            type="button"
            onClick={printReleasedResults}
            disabled={loading || releasedResults.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileDown size={16} />
            Print / Save PDF
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="no-print rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="no-print text-sm text-slate-500">Loading results…</p>
      ) : results.length === 0 ? (
        <section className="no-print panel-card px-6 py-14 text-center">
          <p className="text-sm font-medium text-slate-800">
            No evaluations of your teaching yet
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Results appear here after an administrator assigns evaluators to you.
          </p>
        </section>
      ) : (
        <div className="my-results-print space-y-6">
          <header className="print-brand mb-6 hidden border-b-2 border-slate-800 pb-4 text-center">
            <h1 className="text-xl font-extrabold tracking-wide">
              AMBO UNIVERSITY
            </h1>
            <p className="mt-1 text-sm font-semibold">
              Academic Staff Evaluation Management System
            </p>
            <h2 className="mt-3 text-lg font-bold">
              Academic Staff Evaluation Report
            </h2>
            <p className="mt-1 text-xs">
              Prepared on {formatDate()} · Confidential
            </p>
          </header>

          {results.map((cycle) => (
            <section
              key={cycle.cycleId}
              className={`panel-card print-cycle overflow-hidden ${
                cycle.released ? '' : 'no-print'
              }`}
            >
              <div className="print-cycle-header flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    {cycle.cycleTitle}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Academic year {cycle.academicYear}
                  </p>
                </div>

                <span
                  className={`status-pill ${
                    cycle.released ? 'status-green' : 'status-amber'
                  }`}
                >
                  {cycle.released ? (
                    <span className="inline-flex items-center gap-1">
                      <Award size={12} /> Released
                    </span>
                  ) : allComponentsApproved(cycle) ? (
                    'Awaiting final review'
                  ) : (
                    'In progress'
                  )}
                </span>
              </div>

              {cycle.released ? (
                <ReleasedCycle cycle={cycle} />
              ) : (
                <PendingCycle cycle={cycle} />
              )}
            </section>
          ))}

          <footer className="print-brand hidden border-t border-slate-200 pt-3 text-center text-xs text-slate-500">
            ASEMS · Ambo University · Results are aggregated and anonymous.
          </footer>
        </div>
      )}
    </div>
  );
}