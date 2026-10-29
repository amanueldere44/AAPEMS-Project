import { confirmAction } from '../utils/confirmAction.js';
import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { apiRequest } from '../services/api.js';
import { Alert, Pager, Restricted, area, btn, field, fmtDate, label } from '../components/ui.jsx';

const PAGE_SIZE = 15;
const EVALUATORS = ['dean', 'academic_vp'];
const TYPES = {
  dean_evaluates_department_head: 'Dean / Vice Dean evaluates Department Head',
  vp_evaluates_dean: 'Academic Affairs VP / Vice Director evaluates Dean',
};
const TYPE_KEYS = Object.keys(TYPES);

/* ------------------------------------------------------------------ */
/* One evaluation form                                                 */
/* ------------------------------------------------------------------ */

function EvaluationForm({ id, readOnlyView, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [answers, setAnswers] = useState({});
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const hydrate = useCallback((data) => {
    setDetail(data);
    const map = {};
    for (const c of data.criteria) {
      map[c.id] = { score: c.answered && !c.isNa && c.score !== null ? String(c.score) : '', isNa: Boolean(c.isNa) };
    }
    setAnswers(map);
    setStrengths(data.commentStrengths || '');
    setImprovements(data.commentImprovements || '');
  }, []);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setError('');
    setNotice('');
    apiRequest(`/leadership/evaluations/${id}`)
      .then((result) => {
        if (active) hydrate(result.data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load this evaluation.');
      });
    return () => {
      active = false;
    };
  }, [id, hydrate]);

  if (error && !detail) return <Alert>{error}</Alert>;
  if (!detail) return <p className="text-sm text-slate-500">Loading evaluation…</p>;

  const locked = readOnlyView || detail.status === 'submitted';
  const { scaleMin, scaleMax, allowNa } = detail.form;
  const answeredCount = detail.criteria.filter((c) => {
    const a = answers[c.id];
    return a && (a.isNa || a.score !== '');
  }).length;

  function setAnswer(criterionId, patch) {
    setAnswers((current) => ({ ...current, [criterionId]: { ...current[criterionId], ...patch } }));
  }

  function buildPayload() {
    const scores = [];
    for (const c of detail.criteria) {
      const a = answers[c.id];
      if (!a) continue;
      if (a.isNa) {
        scores.push({ criterionId: c.id, score: null, isNa: true });
      } else if (a.score !== '') {
        const value = Number(a.score);
        if (!Number.isInteger(value) || value < scaleMin || value > scaleMax) {
          throw new Error(`Scores must be whole numbers from ${scaleMin} to ${scaleMax}.`);
        }
        scores.push({ criterionId: c.id, score: value, isNa: false });
      }
    }
    return { scores, commentStrengths: strengths.trim() || null, commentImprovements: improvements.trim() || null };
  }

  async function save(submit) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = buildPayload();
      if (submit) {
        if (answeredCount < detail.criteria.length) {
          throw new Error(`${detail.criteria.length - answeredCount} criteria are still unanswered.`);
        }
        if (!await confirmAction('Submit this evaluation? It cannot be changed after submission.')) {
          setBusy(false);
          return;
        }
      }
      await apiRequest(`/leadership/evaluations/${id}/${submit ? 'submit' : 'draft'}`, {
        method: submit ? 'POST' : 'PUT',
        body: JSON.stringify(payload),
      });
      const fresh = await apiRequest(`/leadership/evaluations/${id}`);
      hydrate(fresh.data);
      setNotice(submit ? 'Evaluation submitted.' : 'Draft saved.');
      onChanged();
    } catch (err) {
      setError(err.message || 'The evaluation could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const sections = [];
  for (const c of detail.criteria) {
    const title = c.sectionTitle || 'Criteria';
    let section = sections.find((s) => s.title === title);
    if (!section) {
      section = { title, items: [] };
      sections.push(section);
    }
    section.items.push(c);
  }

  return (
    <section className="panel-card space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {TYPES[detail.type]}: {detail.evaluateeName}
          </h2>
          <p className="text-sm text-slate-500">
            {detail.cycleTitle} · {detail.academicYear} · evaluator {detail.evaluatorName} · form version {detail.form.versionNo}
          </p>
        </div>
        <button type="button" className={btn} onClick={onClose}>
          Close
        </button>
      </div>

      {detail.cycleStatus !== 'active' && detail.status !== 'submitted' && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This evaluation cycle is {detail.cycleStatus}. The server decides whether answers can still be saved.
        </p>
      )}
      {detail.form.instructions && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{detail.form.instructions}</p>}
      <p className="text-sm text-slate-600">
        Scale {scaleMin} to {scaleMax}
        {allowNa ? ', or mark a criterion as not applicable' : ''}. Answered {answeredCount} of {detail.criteria.length}.
        {detail.status === 'submitted' && ` Submitted ${fmtDate(detail.submittedAt)}.`}
      </p>

      <Alert>{error}</Alert>
      <Alert tone="success">{notice}</Alert>

      {sections.map((section) => (
        <fieldset key={section.title} className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">{section.title}</legend>
          {section.items.map((c, index) => {
            const a = answers[c.id] || { score: '', isNa: false };
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                <p className="min-w-64 flex-1 text-sm text-slate-800">
                  {index + 1}. {c.text}
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label={`Score for criterion ${index + 1}`}
                    min={scaleMin}
                    max={scaleMax}
                    step={1}
                    disabled={locked || a.isNa}
                    value={a.score}
                    onChange={(e) => setAnswer(c.id, { score: e.target.value })}
                    className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-sm"
                  />
                  {allowNa && (
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={a.isNa}
                        onChange={(e) => setAnswer(c.id, { isNa: e.target.checked, score: e.target.checked ? '' : a.score })}
                      />
                      N/A
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </fieldset>
      ))}

      <label className={label}>
        Strengths
        <textarea className={`${area} mt-1`} rows={3} maxLength={10000} disabled={locked} value={strengths} onChange={(e) => setStrengths(e.target.value)} />
      </label>
      <label className={label}>
        Areas for improvement
        <textarea className={`${area} mt-1`} rows={3} maxLength={10000} disabled={locked} value={improvements} onChange={(e) => setImprovements(e.target.value)} />
      </label>

      {!locked && (
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} disabled={busy} onClick={() => save(false)}>
            Save draft
          </button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => save(true)}>
            Submit evaluation
          </button>
        </div>
      )}
      {readOnlyView && <p className="text-xs text-slate-500">Administrators can review leadership evaluations but not answer them.</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Evaluation list                                                     */
/* ------------------------------------------------------------------ */

function EvaluationList({ isAdmin, refreshKey, onChanged }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      const result = await apiRequest(`/leadership/evaluations?${params}`);
      setItems(result?.data?.items ?? []);
      setTotal(result?.data?.total ?? 0);
    } catch (err) {
      setError(err.message || 'Unable to load leadership evaluations.');
    } finally {
      setLoading(false);
    }
  }, [page, status, type]);

  useEffect(() => {
    load();
  }, [load, refreshKey, version]);

  async function remove(item) {
    if (!await confirmAction(`Remove the assignment for ${item.evaluateeName}?`)) return;
    try {
      await apiRequest(`/leadership/evaluations/${item.id}`, { method: 'DELETE' });
      if (openId === item.id) setOpenId(null);
      setVersion((v) => v + 1);
      onChanged();
    } catch (err) {
      setError(err.message || 'Unable to remove this assignment.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Filter by type" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">All evaluation types</option>
          {TYPE_KEYS.map((k) => (
            <option key={k} value={k}>
              {TYPES[k]}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Any status</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
        </select>
        <button type="button" className={btn} onClick={load} disabled={loading}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      <Alert>{error}</Alert>

      <section className="panel-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Evaluation</th>
                {isAdmin && <th className="px-4 py-3">Evaluator</th>}
                <th className="px-4 py-3">Cycle</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-slate-500">
                    No leadership evaluations to show.
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((item) => (
                  <tr key={item.id} className={openId === item.id ? 'bg-slate-50' : ''}>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {item.evaluateeName}
                      <span className="block text-xs font-normal text-slate-400">{TYPES[item.type]}</span>
                    </td>
                    {isAdmin && <td className="px-4 py-3 text-slate-600">{item.evaluatorName}</td>}
                    <td className="px-4 py-3 text-slate-600">
                      {item.cycleTitle}
                      <span className="block text-xs text-slate-400">{item.academicYear}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {item.answeredCriteria}/{item.totalCriteria}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`status-pill ${item.status === 'submitted' ? 'status-green' : 'status-amber'}`}>{item.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" className={btn} onClick={() => setOpenId(item.id)}>
                          {isAdmin || item.status === 'submitted' ? 'View' : 'Evaluate'}
                        </button>
                        {isAdmin && item.status === 'draft' && (
                          <button type="button" className={btn} onClick={() => remove(item)}>
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
      </section>

      {openId && (
        <EvaluationForm
          key={openId}
          id={openId}
          readOnlyView={isAdmin}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            setVersion((v) => v + 1);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Assign (administrator)                                              */
/* ------------------------------------------------------------------ */

function AssignTab({ onChanged }) {
  const [cycles, setCycles] = useState([]);
  const [type, setType] = useState(TYPE_KEYS[0]);
  const [people, setPeople] = useState({ evaluators: [], evaluatees: [] });
  const [form, setForm] = useState({ cycleId: '', evaluatorId: '', evaluateeId: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiRequest('/cycles')
      .then((r) => setCycles(r?.data?.cycles ?? []))
      .catch((err) => setError(err.message || 'Unable to load cycles.'));
  }, []);

  useEffect(() => {
    setForm((f) => ({ ...f, evaluatorId: '', evaluateeId: '' }));
    apiRequest(`/leadership/candidates/${type}`)
      .then((r) => setPeople({ evaluators: r?.data?.evaluators ?? [], evaluatees: r?.data?.evaluatees ?? [] }))
      .catch((err) => setError(err.message || 'Unable to load the people for this evaluation type.'));
  }, [type]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!form.cycleId || !form.evaluatorId || !form.evaluateeId) {
      setError('Choose a cycle, an evaluator and the person to be evaluated.');
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/leadership/evaluations', {
        method: 'POST',
        body: JSON.stringify({
          cycleId: Number(form.cycleId),
          type,
          evaluatorId: Number(form.evaluatorId),
          evaluateeId: Number(form.evaluateeId),
        }),
      });
      setNotice('Evaluation assigned.');
      setForm((f) => ({ ...f, evaluateeId: '' }));
      onChanged();
    } catch (err) {
      setError(err.message || 'Unable to assign this evaluation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel-card max-w-3xl space-y-4 p-5">
      <h2 className="text-lg font-semibold text-slate-900">Assign a leadership evaluation</h2>
      <Alert>{error}</Alert>
      <Alert tone="success">{notice}</Alert>
      <label className={label}>
        Evaluation type
        <select className={`${field} mt-1`} value={type} onChange={(e) => setType(e.target.value)}>
          {TYPE_KEYS.map((k) => (
            <option key={k} value={k}>
              {TYPES[k]}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Evaluation cycle
        <select className={`${field} mt-1`} value={form.cycleId} onChange={(e) => setForm({ ...form, cycleId: e.target.value })}>
          <option value="">Select a cycle…</option>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} {c.academic_year || c.academicYear || ''} ({c.status})
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className={label}>
          Evaluator
          <select className={`${field} mt-1`} value={form.evaluatorId} onChange={(e) => setForm({ ...form, evaluatorId: e.target.value })}>
            <option value="">Select the evaluator…</option>
            {people.evaluators.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Person to be evaluated
          <select className={`${field} mt-1`} value={form.evaluateeId} onChange={(e) => setForm({ ...form, evaluateeId: e.target.value })}>
            <option value="">Select the person…</option>
            {people.evaluatees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.departmentName ? ` — ${p.departmentName}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {people.evaluators.length === 0 && (
        <p className="text-xs text-amber-800">No active users with the evaluator role exist for this type yet.</p>
      )}
      <button type="submit" className="primary-button" disabled={busy}>
        {busy ? 'Assigning…' : 'Assign evaluation'}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Forms (administrator)                                               */
/* ------------------------------------------------------------------ */

function FormsTab() {
  const [forms, setForms] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ type: TYPE_KEYS[0], instructions: '', scaleMin: '1', scaleMax: '5', allowNa: false, criteria: '' });

  const load = useCallback(async () => {
    try {
      const result = await apiRequest('/leadership/forms');
      setForms(Array.isArray(result?.data) ? result.data : []);
    } catch (err) {
      setError(err.message || 'Unable to load the forms.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    const criteria = draft.criteria
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text) => ({ sectionTitle: null, text }));
    const scaleMin = Number(draft.scaleMin);
    const scaleMax = Number(draft.scaleMax);
    if (!criteria.length) return setError('Enter at least one criterion, one per line.');
    if (!Number.isInteger(scaleMin) || !Number.isInteger(scaleMax) || scaleMin >= scaleMax) {
      return setError('The scale minimum must be a whole number lower than the maximum.');
    }
    setBusy(true);
    try {
      await apiRequest(`/leadership/forms/${draft.type}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          instructions: draft.instructions.trim() || null,
          scaleMin,
          scaleMax,
          allowNa: draft.allowNa,
          criteria,
        }),
      });
      setNotice('A draft version was created. Publish it to make it available for new assignments.');
      setDraft({ ...draft, criteria: '', instructions: '' });
      await load();
    } catch (err) {
      setError(err.message || 'Unable to create the form version.');
    } finally {
      setBusy(false);
    }
  }

  async function publish(versionId) {
    if (!await confirmAction('Publish this version? Published versions cannot be edited.')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/leadership/versions/${versionId}/publish`, { method: 'POST', body: '{}' });
      setNotice('Version published.');
      await load();
    } catch (err) {
      setError(err.message || 'Unable to publish this version.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-slate-500">
        The criteria and scale of the leadership forms are entered here by an administrator from the official forms. No
        criteria, scale or weights are built into the system.
      </p>
      <Alert>{error}</Alert>
      <Alert tone="success">{notice}</Alert>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4">
          {forms.map((f) => (
            <div key={f.type} className="panel-card p-5">
              <h2 className="text-base font-semibold text-slate-900">{TYPES[f.type] || f.title}</h2>
              {f.versions.length === 0 && <p className="mt-2 text-sm text-slate-500">No versions yet.</p>}
              <ul className="mt-3 space-y-2">
                {f.versions.map((v) => (
                  <li key={v.versionId} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <span>
                      Version {v.versionNo} · {v.criteriaCount} criteria · scale {v.scaleMin}–{v.scaleMax}
                      {v.allowNa ? ' + N/A' : ''}
                      <span className={`status-pill ml-2 ${v.status === 'published' ? 'status-green' : 'status-gray'}`}>{v.status}</span>
                    </span>
                    {v.status === 'draft' && (
                      <button type="button" className={btn} disabled={busy} onClick={() => publish(v.versionId)}>
                        Publish
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <form onSubmit={create} className="panel-card space-y-4 p-5">
          <h2 className="text-base font-semibold text-slate-900">Create a new form version</h2>
          <label className={label}>
            Evaluation type
            <select className={`${field} mt-1`} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
              {TYPE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {TYPES[k]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className={label}>
              Scale minimum
              <input type="number" className={`${field} mt-1`} value={draft.scaleMin} onChange={(e) => setDraft({ ...draft, scaleMin: e.target.value })} />
            </label>
            <label className={label}>
              Scale maximum
              <input type="number" className={`${field} mt-1`} value={draft.scaleMax} onChange={(e) => setDraft({ ...draft, scaleMax: e.target.value })} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={draft.allowNa} onChange={(e) => setDraft({ ...draft, allowNa: e.target.checked })} />
            Allow “not applicable” answers
          </label>
          <label className={label}>
            Instructions (optional)
            <textarea className={`${area} mt-1`} rows={3} maxLength={10000} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
          </label>
          <label className={label}>
            Criteria — one per line, copied from the official form
            <textarea className={`${area} mt-1`} rows={8} value={draft.criteria} onChange={(e) => setDraft({ ...draft, criteria: e.target.value })} />
          </label>
          <button type="submit" className="primary-button" disabled={busy}>
            <Plus size={14} /> Create draft version
          </button>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function LeadershipPage({ user }) {
  const role = user?.role;
  const isAdmin = role === 'admin';
  const [tab, setTab] = useState('evaluations');
  const [refreshKey, setRefreshKey] = useState(0);

  if (!isAdmin && !EVALUATORS.includes(role)) {
    return <Restricted>Leadership evaluations are completed by deans and the Academic Affairs office, and managed by administrators.</Restricted>;
  }

  const tabClass = (key) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${tab === key ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Evaluations</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Leadership evaluations</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          A separate responsibility from the instructor evaluation: the Dean or Vice Dean evaluates the Department Head, and
          the Academic Affairs Vice President or Vice Director evaluates the Dean.
        </p>
      </header>

      {isAdmin && (
        <div className="flex gap-2" role="tablist" aria-label="Leadership sections">
          {[
            ['evaluations', 'Evaluations'],
            ['assign', 'Assign'],
            ['forms', 'Forms'],
          ].map(([key, text]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tabClass(key)} onClick={() => setTab(key)}>
              {text}
            </button>
          ))}
        </div>
      )}

      {tab === 'assign' && isAdmin ? (
        <AssignTab onChanged={() => setRefreshKey((k) => k + 1)} />
      ) : tab === 'forms' && isAdmin ? (
        <FormsTab />
      ) : (
        <EvaluationList isAdmin={isAdmin} refreshKey={refreshKey} onChanged={() => setRefreshKey((k) => k + 1)} />
      )}
    </div>
  );
}