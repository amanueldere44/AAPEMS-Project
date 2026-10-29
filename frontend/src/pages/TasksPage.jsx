import { confirmAction } from '../utils/confirmAction.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { apiRequest } from '../services/api.js';

const PAGE_SIZE = 25;
const BATCHES = ['I', 'II', 'III', 'IV', 'V'];

const EMPTY_FORM = {
  cycleId: '',
  instructorId: '',
  assignmentId: '',
  batch: '',
  studentIds: [],
  departmentHeadId: '',
  peerIds: [],
  includeSelf: true,
};

const STATUS_LABEL = { pending: 'Pending', draft: 'Draft', submitted: 'Submitted' };
const STATUS_TONE = {
  pending: 'status-amber',
  draft: 'status-blue',
  submitted: 'status-green',
};

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-navy-800';
const ROW_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60';

function sameYear(a, b) {
  const clean = (value) => String(value ?? '').trim().toLowerCase();
  return clean(a) === clean(b);
}

// Course assignments usable for a cycle: those of the cycle's academic year (all, if either side has no year).
function coursesForCycle(assignments, cycle) {
  const year = String(cycle?.academicYear ?? '').trim();
  if (!year) return assignments;
  return assignments.filter((course) => !String(course.academicYear ?? '').trim() || sameYear(course.academicYear, year));
}

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function CheckList({ title, items, selected, onToggle, emptyText }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-700">
        {title} <span className="text-xs font-normal text-slate-400">({selected.length} selected)</span>
      </p>
      <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-2">
        {items.length === 0 ? (
          <p className="px-1 py-2 text-xs text-slate-400">{emptyText}</p>
        ) : (
          items.map((item) => (
            <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} />
              <span className="truncate">{item.name}</span>
              <span className="ml-auto truncate text-xs text-slate-400">{item.email}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export default function TasksPage({ user }) {
  const canManage = ['committee', 'department_head'].includes(user?.role);
  const isDepartmentScoped = user?.role === 'committee' || user?.role === 'department_head';

  const [cycles, setCycles] = useState([]);
  const [cycleFilter, setCycleFilter] = useState('');
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [dialog, setDialog] = useState(false);
  const [candidates, setCandidates] = useState({ instructors: [], students: [], departmentHeads: [] });
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (cycleFilter) params.set('cycleId', cycleFilter);
      const result = await apiRequest(`/tasks?${params}`);
      setTasks(result?.data?.tasks ?? []);
      setTotal(result?.data?.total ?? 0);
    } catch (err) {
      setError(err.message || 'Unable to load evaluation tasks.');
    } finally {
      setLoading(false);
    }
  }, [page, cycleFilter]);

  useEffect(() => {
    if (!canManage) return;
    apiRequest('/cycles')
      .then((result) => setCycles(result?.data?.cycles ?? []))
      .catch(() => {});
  }, [canManage]);

  useEffect(() => {
    if (canManage) loadTasks();
  }, [canManage, loadTasks]);

  useEffect(() => {
    if (!dialog) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape' && !saving) setDialog(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, saving]);

  const openCycles = useMemo(() => cycles.filter((cycle) => cycle.status !== 'closed'), [cycles]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedInstructor = candidates.instructors.find((person) => String(person.id) === form.instructorId);
  const selectedCycle = cycles.find((cycle) => String(cycle.id) === form.cycleId);
  const allCourses = selectedInstructor?.assignments ?? [];
  const instructorCourses = coursesForCycle(allCourses, selectedCycle);
  const noCourses = Boolean(selectedInstructor) && instructorCourses.length === 0;
  const wrongYearOnly = noCourses && allCourses.length > 0;
  // Only the head of the instructor's own department can evaluate them (when the department is known).
  const headsForInstructor = selectedInstructor?.departmentId
    ? candidates.departmentHeads.filter((head) => head.departmentId === selectedInstructor.departmentId)
    : candidates.departmentHeads;

  if (!canManage) {
    return (
      <section className="rounded-2xl border border-rose-100 bg-white p-8">
        <h1 className="text-xl font-semibold text-slate-900">Access restricted</h1>
        <p className="mt-2 text-sm text-slate-600">
          Evaluation tasks are managed by committee members and department heads. Your own assigned forms are under
          “My evaluations”.
        </p>
      </section>
    );
  }

  async function openCreate() {
    setNotice('');
    setDialogError('');
    setForm({ ...EMPTY_FORM, cycleId: openCycles[0] ? String(openCycles[0].id) : '' });
    setDialog(true);
    try {
      const result = await apiRequest('/tasks/candidates');
      setCandidates({
        instructors: result?.data?.instructors ?? [],
        students: result?.data?.students ?? [],
        departmentHeads: result?.data?.departmentHeads ?? [],
      });
    } catch (err) {
      setDialogError(err.message || 'Unable to load evaluator candidates.');
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  // Changing the cycle changes which course assignments (by academic year) are valid.
  function handleCycleChange(event) {
    const cycleId = event.target.value;
    const cycle = cycles.find((item) => String(item.id) === cycleId);
    const person = candidates.instructors.find((item) => String(item.id) === form.instructorId);
    const usable = coursesForCycle(person?.assignments ?? [], cycle);
    setForm((current) => ({
      ...current,
      cycleId,
      assignmentId: usable.length === 1 ? String(usable[0].id) : usable.some((c) => String(c.id) === current.assignmentId) ? current.assignmentId : '',
    }));
  }

  // Choosing an instructor fills the course list from that instructor's course assignments.
  function handleInstructorChange(event) {
    const instructorId = event.target.value;
    const person = candidates.instructors.find((item) => String(item.id) === instructorId);
    const cycle = cycles.find((item) => String(item.id) === form.cycleId);
    const assignments = coursesForCycle(person?.assignments ?? [], cycle);
    const heads = person?.departmentId
      ? candidates.departmentHeads.filter((head) => head.departmentId === person.departmentId)
      : candidates.departmentHeads;
    setForm((current) => ({
      ...current,
      instructorId,
      assignmentId: assignments.length === 1 ? String(assignments[0].id) : '',
      departmentHeadId: heads.length === 1 ? String(heads[0].id) : '',
      peerIds: current.peerIds.filter((peerId) => String(peerId) !== instructorId),
    }));
  }

  async function submitForm(event) {
    event.preventDefault();
    setDialogError('');

    if (!form.cycleId || !form.instructorId) {
      setDialogError('Choose a cycle and an instructor.');
      return;
    }
    if (!form.assignmentId) {
      setDialogError('Choose one of the instructor’s assigned courses.');
      return;
    }
    if (!form.studentIds.length && !form.departmentHeadId && !form.peerIds.length && !form.includeSelf) {
      setDialogError('Choose at least one evaluator.');
      return;
    }

    setSaving(true);
    try {
      const result = await apiRequest('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          cycleId: Number(form.cycleId),
          instructorId: Number(form.instructorId),
          assignmentId: Number(form.assignmentId),
          batch: form.batch || null,
          studentIds: form.studentIds,
          departmentHeadId: form.departmentHeadId ? Number(form.departmentHeadId) : null,
          peerIds: form.peerIds,
          includeSelf: form.includeSelf,
        }),
      });
      const { created = 0, skipped = 0 } = result?.data ?? {};
      setDialog(false);
      setNotice(`${created} task(s) created${skipped ? `, ${skipped} already existed` : ''}.`);
      setPage(1);
      await loadTasks();
    } catch (err) {
      setDialogError(err.message || 'Unable to create tasks.');
    } finally {
      setSaving(false);
    }
  }

  async function removeTask(task) {
    if (!await confirmAction(`Remove this task for ${task.evaluatorName}? This cannot be undone.`)) return;
    setBusyId(task.id);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/tasks/${task.id}`, { method: 'DELETE' });
      setNotice('Task removed.');
      await loadTasks();
    } catch (err) {
      setError(err.message || 'The task could not be removed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-500">Evaluations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Evaluation tasks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Assign eligible evaluators and track required component submissions.
            {isDepartmentScoped && ' You can manage tasks for your own department only.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadTasks}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button type="button" onClick={openCreate} className="primary-button">
            <Plus size={16} /> Assign evaluators
          </button>
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
          <button type="button" onClick={loadTasks} className="font-semibold underline">Try again</button>
        </div>
      )}

      <section className="panel-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <select
            aria-label="Filter by cycle"
            value={cycleFilter}
            onChange={(event) => { setCycleFilter(event.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-navy-800"
          >
            <option value="">All cycles</option>
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>{cycle.title} ({cycle.academicYear})</option>
            ))}
          </select>
          <p className="text-xs text-slate-500">{total} task{total === 1 ? '' : 's'}</p>
        </div>

        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading tasks…</p>
        ) : tasks.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-800">No evaluation tasks yet</p>
            <p className="mt-1 text-sm text-slate-500">Create some with “Assign evaluators”.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Course</th>
                  <th className="px-5 py-3 font-semibold">Instructor</th>
                  <th className="px-5 py-3 font-semibold">Evaluator</th>
                  <th className="px-5 py-3 font-semibold">Form</th>
                  <th className="px-5 py-3 font-semibold">Cycle</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-900">{task.courseTitle}</div>
                      <div className="text-xs text-slate-500">
                        {[task.courseCode, task.batch && `Batch ${task.batch}`, task.semester && `Sem ${task.semester}`]
                          .filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{task.instructorName}</td>
                    <td className="px-5 py-4 text-slate-600">{task.evaluatorName}</td>
                    <td className="px-5 py-4 text-slate-600">{task.formCode}</td>
                    <td className="px-5 py-4 text-slate-600">{task.cycleTitle}</td>
                    <td className="px-5 py-4">
                      <span className={`status-pill ${STATUS_TONE[task.status] ?? 'status-gray'}`}>
                        {STATUS_LABEL[task.status] ?? task.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {task.status === 'pending' && !task.evaluationStatus && (
                        <button
                          type="button"
                          disabled={busyId === task.id}
                          onClick={() => removeTask(task)}
                          className={`${ROW_BUTTON} !text-rose-600`}
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            <span>Page {page} of {pageCount}</span>
            <div className="flex gap-2">
              <button type="button" className={ROW_BUTTON} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={13} /> Previous
              </button>
              <button type="button" className={ROW_BUTTON} disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </section>

      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-dialog-title"
        >
          <form onSubmit={submitForm} className="panel-card my-auto w-full max-w-2xl space-y-4 p-6">
            <h2 id="task-dialog-title" className="text-lg font-semibold text-slate-900">Assign evaluators</h2>
            <p className="text-sm text-slate-500">
              Creates one task per evaluator for a single instructor and one of their assigned courses. Tasks that already
              exist are skipped.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="task-cycle" className="mb-1 block text-sm font-medium text-slate-700">Cycle</label>
                <select id="task-cycle" name="cycleId" required value={form.cycleId} onChange={handleCycleChange} className={INPUT_CLASS}>
                  <option value="">Select a cycle…</option>
                  {openCycles.map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>{cycle.title} ({cycle.academicYear})</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="task-instructor" className="mb-1 block text-sm font-medium text-slate-700">Instructor</label>
                <select id="task-instructor" name="instructorId" required value={form.instructorId} onChange={handleInstructorChange} className={INPUT_CLASS}>
                  <option value="">Select an instructor…</option>
                  {candidates.instructors.map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="task-course" className="mb-1 block text-sm font-medium text-slate-700">Course</label>
                <select
                  id="task-course"
                  name="assignmentId"
                  required
                  value={form.assignmentId}
                  onChange={handleChange}
                  disabled={!selectedInstructor || noCourses}
                  className={`${INPUT_CLASS} disabled:bg-slate-50 disabled:text-slate-400`}
                >
                  <option value="">{selectedInstructor ? 'Select a course…' : 'Choose an instructor first'}</option>
                  {instructorCourses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {[course.courseCode, course.courseTitle].filter(Boolean).join(' — ')}
                      {course.semester ? ` · Sem ${course.semester}` : ''}
                      {course.academicYear ? ` · ${course.academicYear}` : ''}
                    </option>
                  ))}
                </select>
                {noCourses && (
                  <p role="alert" className="mt-1 text-xs text-rose-600">
                    {wrongYearOnly
                      ? `This instructor has no course assigned for ${selectedCycle?.academicYear}. Assign a course under Courses & instructors first.`
                      : 'This instructor has no assigned course. Assign one under Courses & instructors first.'}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="task-batch" className="mb-1 block text-sm font-medium text-slate-700">Batch</label>
                <select id="task-batch" name="batch" value={form.batch} onChange={handleChange} className={INPUT_CLASS}>
                  <option value="">—</option>
                  {BATCHES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </div>

            <CheckList
              title="Student evaluators"
              items={candidates.students}
              selected={form.studentIds}
              onToggle={(id) => setForm((c) => ({ ...c, studentIds: toggle(c.studentIds, id) }))}
              emptyText="No active students."
            />

            <div>
              <label htmlFor="task-head" className="mb-1 block text-sm font-medium text-slate-700">Department head</label>
              <select id="task-head" name="departmentHeadId" value={form.departmentHeadId} onChange={handleChange} className={INPUT_CLASS}>
                <option value="">None</option>
                {headsForInstructor.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
            </div>

            <CheckList
              title="Peer evaluators"
              items={candidates.instructors.filter((person) => String(person.id) !== form.instructorId)}
              selected={form.peerIds}
              onToggle={(id) => setForm((c) => ({ ...c, peerIds: toggle(c.peerIds, id) }))}
              emptyText="No other active teachers."
            />

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.includeSelf}
                onChange={(event) => setForm((c) => ({ ...c, includeSelf: event.target.checked }))}
              />
              Include self-evaluation by the instructor
            </label>

            {dialogError && (
              <div role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{dialogError}</div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialog(false)}
                disabled={saving}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button type="submit" disabled={saving || noCourses} className="primary-button disabled:opacity-60">
                {saving ? 'Creating…' : 'Create tasks'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}