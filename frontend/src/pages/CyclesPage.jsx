import { confirmAction } from '../utils/confirmAction.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Lock,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../services/api.js';

const VIEW_ROLES = ['admin', 'committee', 'department_head', 'dean', 'management'];

const EMPTY_FORM = { title: '', academicYear: '', startDate: '', endDate: '' };

const STATUS_LABEL = { upcoming: 'Upcoming', active: 'Active', closed: 'Closed' };
const STATUS_TONE = {
  upcoming: 'status-blue',
  active: 'status-green',
  closed: 'status-gray',
};
const FILTERS = [
  ['all', 'All'],
  ['active', 'Active'],
  ['upcoming', 'Upcoming'],
  ['closed', 'Closed'],
];

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-navy-800';
const ROW_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60';

function parseDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T00:00:00`) : null;
}

function formatDate(value) {
  const date = parseDate(value);
  return date
    ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
}

function daysUntil(value) {
  const end = parseDate(value);
  if (!end) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end - today) / 86400000);
}

function describeDeadline(cycle) {
  const days = daysUntil(cycle.endDate);
  if (days === null) return '';
  if (days > 0) return `closes ${formatDate(cycle.endDate)} (${days} day${days === 1 ? '' : 's'} left)`;
  if (days === 0) return `scheduled end date is today (${formatDate(cycle.endDate)})`;
  return `scheduled end date passed ${-days} day${days === -1 ? '' : 's'} ago`;
}

export default function CyclesPage({ user }) {
  const isAdmin = user?.role === 'admin';
  const allowed = VIEW_ROLES.includes(user?.role);

  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null); // { mode: 'create' } | { mode: 'edit', cycle }
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const loadCycles = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await apiRequest('/cycles');
      setCycles(result?.data?.cycles ?? []);
    } catch (err) {
      setError(err.message || 'Unable to load evaluation cycles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) loadCycles();
  }, [allowed, loadCycles]);

  useEffect(() => {
    if (!dialog) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape' && !saving) setDialog(null);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, saving]);

  const activeCycle = useMemo(
    () => cycles.find((cycle) => cycle.status === 'active') ?? null,
    [cycles],
  );

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();

    return cycles.filter(
      (cycle) =>
        (filter === 'all' || cycle.status === filter) &&
        (!text || `${cycle.title} ${cycle.academicYear}`.toLowerCase().includes(text)),
    );
  }, [cycles, filter, query]);

  if (!allowed) {
    return (
      <section className="rounded-2xl border border-rose-100 bg-white p-8">
        <h1 className="text-xl font-semibold text-slate-900">Access restricted</h1>
        <p className="mt-2 text-sm text-slate-600">
          Evaluation cycles are available to administrators, committee members, department
          heads, deans and management.
        </p>
      </section>
    );
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialogError('');
    setNotice('');
    setDialog({ mode: 'create' });
  }

  function openEdit(cycle) {
    setForm({
      title: cycle.title,
      academicYear: cycle.academicYear,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
    });
    setDialogError('');
    setNotice('');
    setDialog({ mode: 'edit', cycle });
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submitForm(event) {
    event.preventDefault();
    setDialogError('');

    if (form.endDate < form.startDate) {
      setDialogError('End date must not be before the start date.');
      return;
    }

    const editing = dialog?.mode === 'edit';
    setSaving(true);

    try {
      await apiRequest(editing ? `/cycles/${dialog.cycle.id}` : '/cycles', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          academicYear: form.academicYear.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
        }),
      });

      setDialog(null);
      setNotice(editing ? 'Evaluation cycle updated.' : 'Evaluation cycle created.');
      await loadCycles();
    } catch (err) {
      setDialogError(err.message || 'Unable to save the cycle.');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(cycle, request, successMessage) {
    setBusyId(cycle.id);
    setError('');
    setNotice('');

    try {
      await request();
      setNotice(successMessage);
      await loadCycles();
    } catch (err) {
      setError(err.message || 'The action could not be completed.');
    } finally {
      setBusyId(null);
    }
  }

  function setStatus(cycle, status) {
    return apiRequest(`/cycles/${cycle.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async function activate(cycle) {
    const confirmed = await confirmAction(
      `Activate "${cycle.title}"? Evaluators will be able to save and submit evaluations. ` +
        'Only one cycle can be active at a time.',
    );
    if (confirmed) {
      runAction(cycle, () => setStatus(cycle, 'active'), `"${cycle.title}" is now active.`);
    }
  }

  async function closeCycle(cycle) {
    const pending = cycle.assignmentCount - cycle.submittedCount;
    const warning =
      pending > 0
        ? `${pending} of ${cycle.assignmentCount} assignment(s) are not submitted and can no longer be completed. `
        : '';

    const confirmed = await confirmAction(
      `Close "${cycle.title}"? ${warning}A closed cycle cannot be reopened.`,
    );
    if (confirmed) {
      runAction(cycle, () => setStatus(cycle, 'closed'), `"${cycle.title}" is now closed.`);
    }
  }

  async function removeCycle(cycle) {
    if (!await confirmAction(`Delete "${cycle.title}"? This cannot be undone.`)) return;

    runAction(
      cycle,
      () => apiRequest(`/cycles/${cycle.id}`, { method: 'DELETE' }),
      `"${cycle.title}" was deleted.`,
    );
  }

  const editing = dialog?.mode === 'edit';

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-500">Evaluations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Evaluation cycles
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Evaluation periods. Evaluations can only be saved or submitted while a cycle is
            active.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadCycles}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {isAdmin && (
            <button type="button" onClick={openCreate} className="primary-button">
              <Plus size={16} /> New cycle
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={loadCycles} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}

      {!loading && (
        <section
          className={`flex items-start gap-3 rounded-xl border px-5 py-4 text-sm ${
            activeCycle
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <CalendarClock size={20} className="mt-0.5 shrink-0" />
          {activeCycle ? (
            <p>
              <span className="font-semibold">Current cycle: {activeCycle.title}</span>{' '}
              ({activeCycle.academicYear}) — {describeDeadline(activeCycle)}.
            </p>
          ) : (
            <p>
              <span className="font-semibold">No active cycle.</span> Evaluators cannot save or
              submit evaluations until an administrator activates a cycle.
            </p>
          )}
        </section>
      )}

      <section className="panel-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
            {FILTERS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  filter === value
                    ? 'bg-navy-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="relative block sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title or year…"
              aria-label="Search cycles"
              className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-navy-800"
            />
          </label>
        </div>

        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading cycles…</p>
        ) : visible.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-800">
              {cycles.length === 0 ? 'No evaluation cycles yet' : 'No cycles match your filter'}
            </p>
            {isAdmin && cycles.length === 0 && (
              <p className="mt-1 text-sm text-slate-500">Create the first cycle with “New cycle”.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Title</th>
                  <th className="px-5 py-3 font-semibold">Academic year</th>
                  <th className="px-5 py-3 font-semibold">Period</th>
                  <th className="px-5 py-3 font-semibold">Submitted</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  {isAdmin && <th className="px-5 py-3 font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((cycle) => {
                  const percent = cycle.assignmentCount
                    ? Math.round((cycle.submittedCount / cycle.assignmentCount) * 100)
                    : 0;
                  const busy = busyId === cycle.id;

                  return (
                    <tr key={cycle.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-4 font-medium text-slate-900">{cycle.title}</td>
                      <td className="px-5 py-4 text-slate-600">{cycle.academicYear}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-slate-600">
                        {formatDate(cycle.startDate)} – {formatDate(cycle.endDate)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 w-24 rounded-full bg-slate-100" aria-hidden="true">
                            <div className="h-1.5 rounded-full bg-navy-800" style={{ width: `${percent}%` }} />
                          </div>
                          <span className="whitespace-nowrap text-xs tabular-nums text-slate-600">
                            {cycle.submittedCount}/{cycle.assignmentCount}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`status-pill ${STATUS_TONE[cycle.status] ?? 'status-gray'}`}>
                          {STATUS_LABEL[cycle.status] ?? cycle.status}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            {cycle.status === 'upcoming' && (
                              <button type="button" disabled={busy} onClick={() => activate(cycle)} className={ROW_BUTTON}>
                                <Play size={13} /> Activate
                              </button>
                            )}
                            {cycle.status === 'active' && (
                              <button type="button" disabled={busy} onClick={() => closeCycle(cycle)} className={ROW_BUTTON}>
                                <Lock size={13} /> Close
                              </button>
                            )}
                            {cycle.canEdit && (
                              <button type="button" disabled={busy} onClick={() => openEdit(cycle)} className={ROW_BUTTON}>
                                <Pencil size={13} /> Edit
                              </button>
                            )}
                            {cycle.canDelete && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => removeCycle(cycle)}
                                className={`${ROW_BUTTON} !text-rose-600`}
                              >
                                <Trash2 size={13} /> Delete
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cycle-dialog-title"
        >
          <form onSubmit={submitForm} className="panel-card w-full max-w-lg space-y-4 p-6">
            <h2 id="cycle-dialog-title" className="text-lg font-semibold text-slate-900">
              {editing ? 'Edit evaluation cycle' : 'New evaluation cycle'}
            </h2>

            {!editing && (
              <p className="text-sm text-slate-500">
                A new cycle starts as “Upcoming”. Activate it when evaluations should begin.
              </p>
            )}

            <div>
              <label htmlFor="cycle-title" className="mb-1 block text-sm font-medium text-slate-700">Title</label>
              <input
                id="cycle-title"
                name="title"
                required
                autoFocus
                minLength={3}
                maxLength={255}
                value={form.title}
                onChange={handleChange}
                className={INPUT_CLASS}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="cycle-year" className="mb-1 block text-sm font-medium text-slate-700">Academic year</label>
                <input
                  id="cycle-year"
                  name="academicYear"
                  required
                  minLength={4}
                  maxLength={20}
                  placeholder="e.g. 2026"
                  value={form.academicYear}
                  onChange={handleChange}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="cycle-start" className="mb-1 block text-sm font-medium text-slate-700">Start date</label>
                <input
                  id="cycle-start"
                  name="startDate"
                  type="date"
                  required
                  value={form.startDate}
                  onChange={handleChange}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="cycle-end" className="mb-1 block text-sm font-medium text-slate-700">End date</label>
                <input
                  id="cycle-end"
                  name="endDate"
                  type="date"
                  required
                  min={form.startDate || undefined}
                  value={form.endDate}
                  onChange={handleChange}
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            {dialogError && (
              <div role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {dialogError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialog(null)}
                disabled={saving}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className="primary-button disabled:opacity-60">
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create cycle'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}