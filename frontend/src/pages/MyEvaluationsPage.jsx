import { confirmAction } from '../utils/confirmAction.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, RefreshCw, Save, Search, Send, X } from 'lucide-react';
import { apiRequest } from '../services/api.js';

const EDITABLE = [null, undefined, 'draft', 'returned', 'rejected'];

const STATUS_LABEL = {
  pending: 'Not started',
  draft: 'In progress',
  submitted: 'Submitted',
  returned: 'Returned',
  rejected: 'Rejected',
  approved: 'Approved',
};
const STATUS_TONE = {
  pending: 'status-gray',
  draft: 'status-amber',
  submitted: 'status-blue',
  returned: 'status-amber',
  rejected: 'status-gray',
  approved: 'status-green',
};
const TYPE_LABEL = {
  student: 'Student evaluation',
  department_head: 'Department head evaluation',
  peer: 'Peer evaluation',
  self: 'Self evaluation',
};
const TYPE_HINT = {
  student: 'You are evaluating this instructor as a student.',
  department_head: 'You are evaluating this instructor as their department head.',
  peer: 'You are evaluating this instructor as a peer.',
  self: 'You are evaluating your own teaching (self-evaluation).',
};

const ROW_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60';
const SECONDARY_BUTTON =
  'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60';

function effectiveStatus(row) {
  return row.evaluation_status ?? row.status;
}

function isEditable(row, readOnly = false) {
  return !readOnly && row.cycle_status === 'active' && EDITABLE.includes(row.evaluation_status ?? null);
}

function formatRole(role) {
  return (role || '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Same rule as the server: N/A is excluded from the mean; weighted = average * weight / 5.
function computeScore(criteria, scores, weight, scaleMax) {
  let sum = 0;
  let counted = 0;
  let na = 0;
  let answered = 0;

  criteria.forEach((criterion) => {
    const value = scores[criterion.id];
    if (value === undefined || value === null) return;
    answered += 1;
    if (value === 'NA') {
      na += 1;
    } else {
      sum += Number(value);
      counted += 1;
    }
  });

  const average = counted ? sum / counted : null;
  return {
    answered,
    na,
    counted,
    average,
    weighted: average === null ? null : (average * weight) / 5,
    percent: average === null ? null : Math.max(0, Math.min(100, (average / (scaleMax || 5)) * 100)),
  };
}

function labelFor(version, value) {
  try {
    let labels = version?.scaleLabels;
    if (typeof labels === 'string') labels = JSON.parse(labels);
    if (!labels) return '';
    const found = Array.isArray(labels)
      ? labels[value - version.scaleMin]
      : labels[value] ?? labels[String(value)];
    if (found && typeof found === 'object') return String(found.label ?? found.text ?? '');
    return found ? String(found) : '';
  } catch {
    return '';
  }
}

const fmt = (value, digits = 2) => (value === null || value === undefined ? '—' : Number(value).toFixed(digits));

function StatTile({ label, value, hint }) {
  return (
    <div className="min-w-[96px]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-lg font-bold tabular-nums leading-tight text-slate-900">{value}</p>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function EvaluationForm({ assignmentId, onBack, readOnly = false }) {
  const [assignment, setAssignment] = useState(null);
  const [version, setVersion] = useState(null);
  const [scores, setScores] = useState({});
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [savedAt, setSavedAt] = useState(null);
  const [showMissing, setShowMissing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const changeRef = useRef(0);
  const latest = useRef({ scores: {}, strengths: '', improvements: '' });
  latest.current = { scores, strengths, improvements };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const detail = (await apiRequest(`/assignments/${assignmentId}`))?.data;
      const form = (await apiRequest(`/forms/versions/${detail.form_version_id}`))?.data?.version;
      const saved = {};
      (detail.scores ?? []).forEach((row) => {
        saved[row.criterion_id] = row.is_na ? 'NA' : row.score;
      });
      setAssignment(detail);
      setVersion(form);
      setScores(saved);
      setStrengths(detail.comment_strengths ?? '');
      setImprovements(detail.comment_improvements ?? '');
      setDirty(false);
      setShowMissing(false);
    } catch (err) {
      setError(err.message || 'Unable to load this evaluation.');
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => { load(); }, [load]);

  const criteria = useMemo(() => version?.sections.flatMap((section) => section.criteria) ?? [], [version]);
  const weight = version?.weight ?? 0;
  const stats = useMemo(
    () => computeScore(criteria, scores, weight, version?.scaleMax),
    [criteria, scores, weight, version],
  );
  const editable = Boolean(assignment) && isEditable(assignment, readOnly);
  const remaining = criteria.length - stats.answered;
  const progress = criteria.length ? Math.round((stats.answered / criteria.length) * 100) : 0;

  const options = useMemo(() => {
    if (!version) return [];
    const list = [];
    for (let value = version.scaleMin; value <= version.scaleMax; value += 1) list.push(value);
    return list;
  }, [version]);

  const saveDraft = useCallback(async () => {
    const current = latest.current;
    const list = Object.entries(current.scores)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([criterionId, score]) => ({ criterionId: Number(criterionId), score }));
    if (!list.length) return false;
    await apiRequest(`/evaluations/${assignmentId}/draft`, {
      method: 'PUT',
      body: JSON.stringify({
        scores: list,
        commentStrengths: current.strengths || null,
        commentImprovements: current.improvements || null,
      }),
    });
    return true;
  }, [assignmentId]);

  // Autosave 1.5 seconds after the last change.
  useEffect(() => {
    if (!editable || !dirty || busy) return undefined;
    const timer = setTimeout(async () => {
      const stamp = changeRef.current;
      setSaveState('saving');
      try {
        const saved = await saveDraft();
        if (!saved) {
          setSaveState('idle');
          return;
        }
        setSavedAt(new Date());
        setSaveState('saved');
        if (changeRef.current === stamp) setDirty(false);
      } catch {
        setSaveState('error');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [dirty, scores, strengths, improvements, editable, busy, saveDraft]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    function warn(event) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!confirmOpen) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape' && !busy) setConfirmOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmOpen, busy]);

  function touch() {
    changeRef.current += 1;
    setDirty(true);
    setSaveState('idle');
    setNotice('');
  }

  function setScore(criterionId, value) {
    setScores((current) => {
      const next = { ...current };
      if (next[criterionId] === value) delete next[criterionId];
      else next[criterionId] = value;
      return next;
    });
    touch();
  }

  async function handleBack() {
    if (dirty && !await confirmAction('You have unsaved changes. Leave without saving?')) return;
    onBack();
  }

  function jumpToNext() {
    const first = criteria.find((item) => scores[item.id] === undefined || scores[item.id] === null);
    if (first) {
      document.getElementById(`criterion-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  async function handleSave() {
    setBusy(true);
    setError('');
    setNotice('');
    const stamp = changeRef.current;
    try {
      const saved = await saveDraft();
      if (!saved) {
        setError('Answer at least one criterion before saving.');
      } else {
        setSavedAt(new Date());
        setSaveState('saved');
        if (changeRef.current === stamp) setDirty(false);
        setNotice('Draft saved.');
      }
    } catch (err) {
      setSaveState('error');
      setError(err.message || 'Unable to save the draft.');
    } finally {
      setBusy(false);
    }
  }

  function reviewAndSubmit() {
    if (remaining > 0) {
      setShowMissing(true);
      setError(`${remaining} criteri${remaining === 1 ? 'on still needs' : 'a still need'} an answer before you can submit.`);
      jumpToNext();
      return;
    }
    setError('');
    setConfirmOpen(true);
  }

  async function doSubmit() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await saveDraft();
      await apiRequest(`/evaluations/${assignmentId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          commentStrengths: strengths || null,
          commentImprovements: improvements || null,
        }),
      });
      setConfirmOpen(false);
      setDirty(false);
      await load(true);
      setNotice('Evaluation submitted. Thank you.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setConfirmOpen(false);
      setError(err.message || 'Unable to submit the evaluation.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading evaluation…</p>;

  if (!assignment || !version) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className={ROW_BUTTON}><ArrowLeft size={13} /> Back</button>
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error || 'Evaluation not found.'}
        </div>
      </div>
    );
  }

  const status = effectiveStatus(assignment);
  const saveText =
    saveState === 'saving' ? 'Saving…'
      : saveState === 'error' ? 'Autosave failed. Click Save draft.'
        : dirty ? 'Unsaved changes'
          : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : '';
  const legend = options.map((value) => [value, labelFor(version, value)]).filter(([, text]) => text);

  return (
    <div className="space-y-5">
      <div>
        <button type="button" onClick={handleBack} className={ROW_BUTTON}><ArrowLeft size={13} /> Back to list</button>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-navy-900 px-2.5 py-1 text-[11px] font-medium text-white">
            {TYPE_LABEL[version.evaluatorType] ?? version.title}
          </span>
          <span className={`status-pill ${STATUS_TONE[status] ?? 'status-gray'}`}>{STATUS_LABEL[status] ?? status}</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{version.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Instructor <strong className="font-semibold text-slate-700">{assignment.instructor_name}</strong>
          {' · '}{assignment.course_title}
          {assignment.course_code ? ` (${assignment.course_code})` : ''}
          {assignment.batch ? ` · Batch ${assignment.batch}` : ''}
          {assignment.semester ? ` · Semester ${assignment.semester}` : ''}
          {' · '}{assignment.cycle_title}
        </p>
        <p className="mt-1 text-xs text-slate-500">{TYPE_HINT[version.evaluatorType]}</p>
      </div>

      <div className="sticky top-[78px] z-10 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="min-w-[180px] flex-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-slate-700">{stats.answered}/{criteria.length} answered</span>
              <span className="tabular-nums text-slate-500">{progress}%</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-slate-100" aria-hidden="true">
              <div
                className={`h-2 rounded-full transition-all ${progress === 100 ? 'bg-emerald-500' : 'bg-navy-800'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {saveText && (
              <p className={`mt-1.5 text-[11px] ${saveState === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>{saveText}</p>
            )}
          </div>

          <StatTile
            label="Live average"
            value={stats.average === null ? '—' : `${fmt(stats.average)} / ${version.scaleMax}`}
            hint={stats.na ? `${stats.na} N/A excluded` : undefined}
          />
          <StatTile
            label="Weighted score"
            value={stats.weighted === null ? '—' : `${fmt(stats.weighted)} / ${weight}`}
          />
          <div className="min-w-[120px]">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Performance</p>
            <p className="text-lg font-bold tabular-nums leading-tight text-slate-900">
              {stats.percent === null ? '—' : `${Math.round(stats.percent)}%`}
            </p>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100" aria-hidden="true">
              <div className="h-1.5 rounded-full bg-gold-500 transition-all" style={{ width: `${stats.percent ?? 0}%` }} />
            </div>
          </div>

          {editable && (
            <div className="ml-auto flex flex-wrap gap-2">
              {remaining > 0 && (
                <button type="button" onClick={jumpToNext} className={ROW_BUTTON}>
                  <ArrowDown size={13} /> Next unanswered
                </button>
              )}
              <button type="button" onClick={handleSave} disabled={busy} className={SECONDARY_BUTTON}>
                <Save size={15} /> Save draft
              </button>
              <button type="button" onClick={reviewAndSubmit} disabled={busy} className="primary-button disabled:opacity-60">
                <Send size={15} /> Review &amp; submit
              </button>
            </div>
          )}
        </div>
      </div>

           {!editable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {readOnly
            ? 'Administrators can view evaluations but cannot fill them in on behalf of an evaluator.'
            : assignment.cycle_status !== 'active'
              ? 'This evaluation cycle is not active, so the form is read-only.'
              : `This evaluation is ${STATUS_LABEL[status]?.toLowerCase() ?? status}${
                assignment.submitted_at ? ` (submitted ${new Date(assignment.submitted_at).toLocaleString()})` : ''
              } and can no longer be edited.`}
        </div>
      )}
      {(status === 'returned' || status === 'rejected') && editable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This evaluation was {status} by a reviewer. Update your answers and submit it again.
        </div>
      )}
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {version.instructions && (
        <p className="panel-card whitespace-pre-line p-4 text-sm leading-6 text-slate-600">{version.instructions}</p>
      )}

      {legend.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-slate-100 px-4 py-2.5 text-xs text-slate-600">
          {legend.map(([value, text]) => (
            <span key={value}><strong className="text-slate-800">{value}</strong> = {text}</span>
          ))}
          {version.allowNa && <span><strong className="text-slate-800">N/A</strong> = not applicable (excluded from the average)</span>}
        </div>
      )}

      {version.sections.map((section) => {
        const sectionStats = computeScore(section.criteria, scores, weight, version.scaleMax);
        return (
          <section key={section.id} className="panel-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-800">{section.title}</h2>
              <p className="text-xs tabular-nums text-slate-500">
                {sectionStats.answered}/{section.criteria.length} answered
                {sectionStats.average !== null && ` · average ${fmt(sectionStats.average)}`}
              </p>
            </div>
            <ul className="divide-y divide-slate-100">
              {section.criteria.map((criterion, index) => {
                const value = scores[criterion.id];
                const missing = showMissing && editable && (value === undefined || value === null);
                return (
                  <li
                    key={criterion.id}
                    id={`criterion-${criterion.id}`}
                    className={`flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between ${
                      missing ? 'border-l-4 border-rose-400 bg-rose-50/50' : 'border-l-4 border-transparent'
                    }`}
                  >
                    <p className="text-sm text-slate-800">
                      {index + 1}. {criterion.text}
                      {missing && <span className="ml-2 text-xs font-medium text-rose-600">Required</span>}
                    </p>
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={criterion.text}>
                      {[...options, ...(version.allowNa ? ['NA'] : [])].map((option) => {
                        const selected = value === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            title={option === 'NA' ? 'Not applicable' : labelFor(version, option)}
                            disabled={!editable || busy}
                            onClick={() => setScore(criterion.id, option)}
                            className={`h-9 min-w-9 rounded-lg border px-2.5 text-sm font-medium transition disabled:cursor-not-allowed ${
                              selected
                                ? 'border-navy-900 bg-navy-900 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:hover:bg-white'
                            }`}
                          >
                            {option === 'NA' ? 'N/A' : option}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <section className="panel-card grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label htmlFor="strengths" className="mb-1 block text-sm font-medium text-slate-700">Strengths</label>
          <textarea
            id="strengths"
            rows={4}
            maxLength={10000}
            disabled={!editable || busy}
            value={strengths}
            onChange={(event) => { setStrengths(event.target.value); touch(); }}
            className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-navy-800 disabled:bg-slate-50"
          />
        </div>
        <div>
          <label htmlFor="improvements" className="mb-1 block text-sm font-medium text-slate-700">Areas for improvement</label>
          <textarea
            id="improvements"
            rows={4}
            maxLength={10000}
            disabled={!editable || busy}
            value={improvements}
            onChange={(event) => { setImprovements(event.target.value); touch(); }}
            className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-navy-800 disabled:bg-slate-50"
          />
        </div>
      </section>

      <p className="text-xs leading-5 text-slate-500">
        This is the score for your component only. The instructor&apos;s final score is calculated after
        all four components (student, department head, peer, self) are submitted.
      </p>

      {editable && (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={handleSave} disabled={busy} className={SECONDARY_BUTTON}>
            <Save size={15} /> Save draft
          </button>
          <button type="button" onClick={reviewAndSubmit} disabled={busy} className="primary-button disabled:opacity-60">
            <Send size={15} /> Review &amp; submit
          </button>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="panel-card w-full max-w-md space-y-4 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="confirm-title" className="text-lg font-semibold text-slate-900">Submit evaluation?</h2>
                <p className="mt-1 text-sm text-slate-500">
                  You will not be able to edit it after submitting, unless a reviewer returns it.
                </p>
              </div>
              <button type="button" aria-label="Close" disabled={busy} onClick={() => setConfirmOpen(false)} className="icon-button -mr-2 -mt-2">
                <X size={18} />
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
              <div><dt className="text-xs text-slate-500">Instructor</dt><dd className="font-medium text-slate-900">{assignment.instructor_name}</dd></div>
              <div><dt className="text-xs text-slate-500">Course</dt><dd className="font-medium text-slate-900">{assignment.course_title}</dd></div>
              <div><dt className="text-xs text-slate-500">Answered</dt><dd className="font-medium tabular-nums text-slate-900">{stats.answered}/{criteria.length}{stats.na ? ` (${stats.na} N/A)` : ''}</dd></div>
              <div><dt className="text-xs text-slate-500">Average</dt><dd className="font-medium tabular-nums text-slate-900">{fmt(stats.average)} / {version.scaleMax}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-slate-500">Weighted score</dt><dd className="font-medium tabular-nums text-slate-900">{fmt(stats.weighted)} / {weight}</dd></div>
            </dl>

            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setConfirmOpen(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60">
                Keep editing
              </button>
              <button type="button" disabled={busy} onClick={doSubmit} className="primary-button disabled:opacity-60">
                <Send size={15} /> {busy ? 'Submitting…' : 'Submit now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function matchesFilter(row, filter) {
  const status = effectiveStatus(row);
  if (filter === 'all') return true;
  if (filter === 'returned') return status === 'returned' || status === 'rejected';
  return status === filter;
}

export default function MyEvaluationsPage({ user }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [cycle, setCycle] = useState('');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  // Administrators oversee evaluations but never fill them in for an evaluator.
  const readOnly = user?.role === 'admin';

  const load = useCallback(async () => {
    // Administrators are not evaluators: they do not load anyone's evaluations.
    if (readOnly) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/assignments');
      setRows(Array.isArray(result?.data) ? result.data : []);
    } catch (err) {
      setError(err.message || 'Unable to load your evaluations.');
    } finally {
      setLoading(false);
    }
  }, [readOnly]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const result = { all: rows.length, pending: 0, draft: 0, returned: 0, submitted: 0, approved: 0 };
    rows.forEach((row) => {
      const status = effectiveStatus(row);
      if (status === 'rejected') result.returned += 1;
      else if (result[status] !== undefined) result[status] += 1;
    });
    return result;
  }, [rows]);

  const cycles = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => map.set(String(row.cycle_id), row.cycle_title));
    return [...map.entries()];
  }, [rows]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return rows
      .filter((row) => matchesFilter(row, filter))
      .filter((row) => !cycle || String(row.cycle_id) === cycle)
      .filter((row) => !text || `${row.instructor_name} ${row.course_title} ${row.course_code}`.toLowerCase().includes(text))
          .sort((a, b) => Number(isEditable(b, readOnly)) - Number(isEditable(a, readOnly)));
  }, [rows, filter, cycle, query, readOnly]);

  if (openId) {
    return (
      <EvaluationForm
        assignmentId={openId}
        readOnly={readOnly}
        onBack={() => { setOpenId(null); load(); }}
      />
    );
  }

  const done = counts.submitted + counts.approved;
  const completion = counts.all ? Math.round((done / counts.all) * 100) : 0;
  const filters = [
    ['all', 'All'],
    ['pending', 'Not started'],
    ['draft', 'In progress'],
    ['returned', 'Returned'],
    ['submitted', 'Submitted'],
    ['approved', 'Approved'],
  ];

  if (readOnly) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8">
        <h1 className="text-xl font-semibold text-slate-900">Not available for administrators</h1>
        <p className="mt-2 text-sm text-slate-600">
          Evaluations are filled in and read only by the evaluators and the offices that receive their results.
          Administrators can follow progress per cycle under “Evaluation tasks”.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-500">Evaluations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">My evaluations</h1>
          <p className="mt-1 text-sm text-slate-500">
            {readOnly ? (
              <>
                Overview of every assigned evaluation, shown as{' '}
                <strong className="font-semibold text-slate-700">{formatRole(user?.role)}</strong> (read-only).
                Administrators cannot fill evaluations in.
              </>
            ) : (
              <>
                Evaluating as <strong className="font-semibold text-slate-700">{formatRole(user?.role) || 'evaluator'}</strong>.
                Open a form to answer, track your live score and submit.
              </>
            )}
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading} className={SECONDARY_BUTTON}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {!loading && counts.all > 0 && (
        <section className="panel-card p-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatTile label="Assigned" value={counts.all} />
            <StatTile label="Not started" value={counts.pending} />
            <StatTile label="In progress" value={counts.draft + counts.returned} />
            <StatTile label="Completed" value={done} />
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Overall completion</span>
              <span className="tabular-nums">{completion}%</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-slate-100" aria-hidden="true">
              <div className={`h-2 rounded-full transition-all ${completion === 100 ? 'bg-emerald-500' : 'bg-navy-800'}`} style={{ width: `${completion}%` }} />
            </div>
          </div>
        </section>
      )}

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      )}

      <section className="panel-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
            {filters.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  filter === value ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label} <span className="opacity-70">{counts[value]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {cycles.length > 1 && (
              <select
                aria-label="Filter by cycle"
                value={cycle}
                onChange={(event) => setCycle(event.target.value)}
                className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-navy-800"
              >
                <option value="">All cycles</option>
                {cycles.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
              </select>
            )}
            <label className="relative block sm:w-60">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search instructor or course…"
                aria-label="Search evaluations"
                className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-navy-800"
              />
            </label>
          </div>
        </div>

        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading evaluations…</p>
        ) : visible.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-800">
              {rows.length === 0 ? 'No evaluations assigned to you yet' : 'No evaluations match your filters'}
            </p>
            {rows.length === 0 && (
              <p className="mt-1 text-sm text-slate-500">An administrator assigns evaluation tasks to you for each cycle.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Instructor</th>
                  <th className="px-5 py-3 font-semibold">Course</th>
                  <th className="px-5 py-3 font-semibold">Form</th>
                  <th className="px-5 py-3 font-semibold">Cycle</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((row) => {
                  const status = effectiveStatus(row);
                  const canEdit = isEditable(row, readOnly);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-4 font-medium text-slate-900">{row.instructor_name}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {row.course_title}
                        {row.course_code && <span className="block text-xs text-slate-400">{row.course_code}</span>}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{TYPE_LABEL[row.evaluator_type] ?? row.form_title}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {row.cycle_title}
                        {row.cycle_status !== 'active' && (
                          <span className="block text-xs text-slate-400">
                            {row.cycle_status === 'closed' ? 'Cycle closed' : 'Cycle not active'}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`status-pill ${STATUS_TONE[status] ?? 'status-gray'}`}>
                          {STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <button type="button" onClick={() => setOpenId(row.id)} className={ROW_BUTTON}>
                          {canEdit ? (status === 'pending' ? 'Start' : 'Continue') : 'View'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}