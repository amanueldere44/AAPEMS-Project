import { confirmAction } from '../utils/confirmAction.js';
﻿import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Trash2 } from 'lucide-react';
import {
  LEADERSHIP_TYPES,
  assignLeadershipEvaluation,
  getCycles,
  getLeadershipCandidates,
  listLeadershipEvaluations,
  removeLeadershipEvaluation,
} from '../services/leadershipApi.js';
import {
  EmptyBlock, ErrorBanner, LoadingBlock, Pagination, StatusPill, SuccessBanner, formatDate,
} from '../components/StateBlocks.jsx';

const PAGE_SIZE = 15;
const TYPE_KEYS = Object.keys(LEADERSHIP_TYPES);

function Progress({ answered, total }) {
  const percent = total ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200" role="progressbar"
        aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Criteria answered">
        <div className="h-full bg-teal-600" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-slate-600">{answered}/{total}</span>
    </div>
  );
}

export default function LeadershipAssignmentsPage() {
  const navigate = useNavigate();
  const [cycles, setCycles] = useState([]);
  const [candidates, setCandidates] = useState(null);
  const [form, setForm] = useState({ cycleId: '', type: TYPE_KEYS[0], evaluatorId: '', evaluateeId: '' });
  const [filters, setFilters] = useState({ type: '', status: '', cycleId: '' });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    getCycles().then((list) => setCycles(list.filter((c) => c.status !== 'closed'))).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    let active = true;
    setCandidates(null);
    getLeadershipCandidates(form.type)
      .then((data) => { if (active) setCandidates(data); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [form.type]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await listLeadershipEvaluations({ ...filters, page, pageSize: PAGE_SIZE }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  async function assign(event) {
    event.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      await assignLeadershipEvaluation({
        cycleId: Number(form.cycleId), type: form.type,
        evaluatorId: Number(form.evaluatorId), evaluateeId: Number(form.evaluateeId),
      });
      setMessage('Evaluation assigned. The evaluator can now open it.');
      setForm({ ...form, evaluatorId: '', evaluateeId: '' });
      setPage(1);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(item) {
    if (!await confirmAction(`Remove the draft evaluation of ${item.evaluateeName} by ${item.evaluatorName}?`)) return;
    setError(''); setMessage('');
    try {
      await removeLeadershipEvaluation(item.id);
      setMessage('Assignment removed.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const setFilter = (key, value) => { setFilters({ ...filters, [key]: value }); setPage(1); };
  const select = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Leadership evaluations</h1>
        <p className="mt-1 text-sm text-slate-600">
          Assign who evaluates whom, then follow progress. A form version must be published for the evaluation type first.
        </p>
      </header>

      <ErrorBanner message={error} />
      <SuccessBanner message={message} />

      <form onSubmit={assign} className="panel-card grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5" aria-label="Assign a leadership evaluation">
        <label className="block text-sm font-medium text-slate-700">Cycle
          <select required className={select} value={form.cycleId} onChange={(e) => setForm({ ...form, cycleId: e.target.value })}>
            <option value="">Select a cycle</option>
            {cycles.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.academicYear})</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">Evaluation type
          <select className={select} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, evaluatorId: '', evaluateeId: '' })}>
            {TYPE_KEYS.map((key) => <option key={key} value={key}>{LEADERSHIP_TYPES[key].label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">Evaluator ({LEADERSHIP_TYPES[form.type].evaluator})
          <select required className={select} value={form.evaluatorId} disabled={!candidates} onChange={(e) => setForm({ ...form, evaluatorId: e.target.value })}>
            <option value="">{candidates ? 'Select evaluator' : 'Loading…'}</option>
            {candidates?.evaluators.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">Evaluatee ({LEADERSHIP_TYPES[form.type].evaluatee})
          <select required className={select} value={form.evaluateeId} disabled={!candidates} onChange={(e) => setForm({ ...form, evaluateeId: e.target.value })}>
            <option value="">{candidates ? 'Select evaluatee' : 'Loading…'}</option>
            {candidates?.evaluatees.map((u) => <option key={u.id} value={u.id}>{u.name}{u.departmentName ? ` — ${u.departmentName}` : ''}</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className="primary-button w-full" disabled={saving}>{saving ? 'Assigning…' : 'Assign evaluation'}</button>
        </div>
      </form>

      <section className="panel-card">
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">Type
            <select className={select} value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
              <option value="">All types</option>
              {TYPE_KEYS.map((key) => <option key={key} value={key}>{LEADERSHIP_TYPES[key].label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Status
            <select className={select} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Cycle
            <select className={select} value={filters.cycleId} onChange={(e) => setFilter('cycleId', e.target.value)}>
              <option value="">All open cycles</option>
              {cycles.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.academicYear})</option>)}
            </select>
          </label>
        </div>

        {loading ? <LoadingBlock label="Loading evaluations…" /> : result.items.length === 0 ? (
          <EmptyBlock title="No leadership evaluations found">Assign an evaluation above, or change the filters.</EmptyBlock>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Cycle</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Evaluator</th>
                  <th className="px-4 py-3">Evaluatee</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Submitted</th><th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">{item.cycleTitle}<div className="text-xs text-slate-500">{item.academicYear}</div></td>
                    <td className="px-4 py-3">{LEADERSHIP_TYPES[item.type]?.label}</td>
                    <td className="px-4 py-3">{item.evaluatorName}</td>
                    <td className="px-4 py-3">{item.evaluateeName}</td>
                    <td className="px-4 py-3"><Progress answered={item.answeredCriteria} total={item.totalCriteria} /></td>
                    <td className="px-4 py-3"><StatusPill status={item.status} /></td>
                    <td className="px-4 py-3">{formatDate(item.submittedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="icon-button" aria-label="View evaluation" onClick={() => navigate(`/leadership?open=${item.id}`)}><Eye size={16} /></button>
                        {item.status === 'draft' && (
                          <button type="button" className="icon-button" aria-label="Remove assignment" onClick={() => remove(item)}><Trash2 size={16} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} onChange={setPage} />
      </section>
    </div>
  );
}