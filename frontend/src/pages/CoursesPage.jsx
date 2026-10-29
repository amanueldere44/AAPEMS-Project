import { confirmAction } from '../utils/confirmAction.js';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Power, RefreshCw, Search, Trash2, UserPlus } from 'lucide-react';
import { apiRequest } from '../services/api.js';
import Tabs from '../components/Tabs.jsx';
import {
  EmptyBlock,
  ErrorBanner,
  LoadingBlock,
  Pagination,
  StatusPill,
  SuccessBanner,
  formatDate,
} from './StateBlocks.jsx';

const PAGE_SIZE = 20;

const TABS = [
  { key: 'courses', label: 'Courses' },
  { key: 'assignments', label: 'Instructor assignments' },
];

const INPUT =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-800 disabled:bg-slate-50 disabled:text-slate-500';
const SECONDARY_BUTTON =
  'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60';
const ROW_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const EMPTY_OPTIONS = { departments: [], courses: [], instructors: [] };

/* ------------------------------------------------------------------ */
/* Courses                                                             */
/* ------------------------------------------------------------------ */

function CourseForm({ course, departments, onCancel, onSaved }) {
  const editing = Boolean(course);
  const [code, setCode] = useState(course?.code ?? '');
  const [title, setTitle] = useState(course?.title ?? '');
  const [departmentId, setDepartmentId] = useState(course?.departmentId ? String(course.departmentId) : '');
  const [creditHours, setCreditHours] = useState(
    course?.creditHours === null || course?.creditHours === undefined ? '' : String(course.creditHours),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');

    if (!editing && !code.trim()) return setError('Enter the course code.');
    if (!title.trim()) return setError('Enter the course title.');
    if (!departmentId) return setError('Select the department that owns the course.');

    let hours = null;
    if (creditHours.trim() !== '') {
      hours = Number(creditHours);
      if (!Number.isFinite(hours) || hours < 0 || hours > 30) {
        return setError('Credit hours must be a number between 0 and 30.');
      }
    }

    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/courses/${course.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: title.trim(), departmentId: Number(departmentId), creditHours: hours }),
        });
      } else {
        await apiRequest('/courses', {
          method: 'POST',
          body: JSON.stringify({
            code: code.trim(),
            title: title.trim(),
            departmentId: Number(departmentId),
            creditHours: hours,
          }),
        });
      }
      onSaved(editing ? 'Course updated.' : 'Course created.');
    } catch (err) {
      setError(err.message || 'Unable to save the course.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel-card space-y-4 p-5" aria-label={editing ? 'Edit course' : 'Add course'}>
      <h2 className="text-base font-semibold text-slate-900">{editing ? `Edit ${course.code}` : 'Add a course'}</h2>
      <ErrorBanner message={error} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Course code">
          <input
            value={code}
            maxLength={50}
            disabled={editing}
            onChange={(event) => setCode(event.target.value)}
            placeholder="e.g. CS101"
            className={INPUT}
          />
        </Field>
        <Field label="Course title">
          <input value={title} maxLength={255} onChange={(event) => setTitle(event.target.value)} className={INPUT} />
        </Field>
        <Field label="Owning department">
          <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className={INPUT}>
            <option value="">Select a department…</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
                {department.unitName ? ` — ${department.unitName}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Credit hours (optional)">
          <input
            type="number"
            min="0"
            max="30"
            step="0.5"
            value={creditHours}
            onChange={(event) => setCreditHours(event.target.value)}
            className={INPUT}
          />
        </Field>
      </div>

      {editing && <p className="text-xs text-slate-500">The course code cannot be changed after creation.</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className="primary-button disabled:opacity-60">
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Create course'}
        </button>
      </div>
    </form>
  );
}

function CoursesTab({ options, onChanged }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | course

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      if (departmentId) params.set('departmentId', departmentId);
      if (status) params.set('status', status);
      const response = await apiRequest(`/courses?${params.toString()}`);
      setItems(response?.data?.items ?? []);
      setTotal(Number(response?.data?.total ?? 0));
    } catch (err) {
      setError(err.message || 'Unable to load the courses.');
    } finally {
      setLoading(false);
    }
  }, [page, search, departmentId, status]);

  useEffect(() => {
    load();
  }, [load]);

  function applySearch(event) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function toggleStatus(course) {
    const next = course.status === 'active' ? 'inactive' : 'active';
    if (
      next === 'inactive' &&
      !await confirmAction(`Deactivate ${course.code}? It can no longer be assigned to instructors, but nothing is deleted.`)
    ) {
      return;
    }
    setError('');
    setNotice('');
    try {
      await apiRequest(`/courses/${course.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      setNotice(`${course.code} is now ${next}.`);
      await load();
      onChanged();
    } catch (err) {
      setError(err.message || 'Unable to change the status.');
    }
  }

  async function handleSaved(message) {
    setEditing(null);
    setNotice(message);
    await load();
    onChanged();
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} onRetry={load} />
      <SuccessBanner message={notice} />

      {editing && (
        <CourseForm
          key={editing === 'new' ? 'new' : editing.id}
          course={editing === 'new' ? null : editing}
          departments={options.departments}
          onCancel={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      <section className="panel-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between">
          <form onSubmit={applySearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Search">
              <span className="relative block sm:w-60">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Code or title…"
                  className={`${INPUT} pl-9`}
                />
              </span>
            </Field>
            <Field label="Department">
              <select
                value={departmentId}
                onChange={(event) => {
                  setDepartmentId(event.target.value);
                  setPage(1);
                }}
                className={`${INPUT} sm:w-56`}
              >
                <option value="">All departments</option>
                {options.departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                className={`${INPUT} sm:w-36`}
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <button type="submit" className={SECONDARY_BUTTON}>Search</button>
          </form>

          <div className="flex gap-2">
            <button type="button" onClick={load} disabled={loading} className={SECONDARY_BUTTON}>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button type="button" onClick={() => setEditing('new')} className="primary-button">
              <Plus size={15} /> Add course
            </button>
          </div>
        </div>

        {loading && items.length === 0 ? (
          <LoadingBlock label="Loading courses…" />
        ) : items.length === 0 ? (
          <EmptyBlock title="No courses found">
            Add the first course, or change the filters.
          </EmptyBlock>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Code</th>
                  <th className="px-5 py-3 font-semibold">Title</th>
                  <th className="px-5 py-3 font-semibold">Department</th>
                  <th className="px-5 py-3 font-semibold">Credit hours</th>
                  <th className="px-5 py-3 font-semibold">Instructors</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((course) => (
                  <tr key={course.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-4 font-medium text-slate-900">{course.code}</td>
                    <td className="px-5 py-4 text-slate-700">{course.title}</td>
                    <td className="px-5 py-4 text-slate-600">
                      {course.departmentName}
                      {course.unitName && <span className="block text-xs text-slate-400">{course.unitName}</span>}
                                              {course.departmentId === null && (
                        <span className="block text-xs text-amber-700">Not linked to a department yet. Edit to link it.</span>
                      )}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-slate-600">{course.creditHours ?? '—'}</td>
                    <td className="px-5 py-4 tabular-nums text-slate-600">{course.instructorCount}</td>
                    <td className="px-5 py-4"><StatusPill status={course.status} /></td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => setEditing(course)} className={ROW_BUTTON}>
                          <Pencil size={13} /> Edit
                        </button>
                        <button type="button" onClick={() => toggleStatus(course)} className={ROW_BUTTON}>
                          <Power size={13} /> {course.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Instructor assignments                                              */
/* ------------------------------------------------------------------ */

function AssignmentsTab({ options }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [courseFilter, setCourseFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [yearInput, setYearInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [courseId, setCourseId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [semester, setSemester] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (courseFilter) params.set('courseId', courseFilter);
      if (yearFilter) params.set('academicYear', yearFilter);
      const response = await apiRequest(`/courses/assignments?${params.toString()}`);
      setItems(response?.data?.items ?? []);
      setTotal(Number(response?.data?.total ?? 0));
    } catch (err) {
      setError(err.message || 'Unable to load the assignments.');
    } finally {
      setLoading(false);
    }
  }, [page, courseFilter, yearFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function assign(event) {
    event.preventDefault();
    setFormError('');
    setNotice('');

    if (!courseId) return setFormError('Select a course.');
    if (!instructorId) return setFormError('Select an instructor.');
    if (!academicYear.trim()) return setFormError('Enter the academic year, for example 2026.');

    setSaving(true);
    try {
      await apiRequest('/courses/assignments', {
        method: 'POST',
        body: JSON.stringify({
          courseId: Number(courseId),
          instructorId: Number(instructorId),
          academicYear: academicYear.trim(),
          semester: semester.trim(),
        }),
      });
      setNotice('Instructor assigned to the course.');
      setInstructorId('');
      await load();
    } catch (err) {
      setFormError(err.message || 'Unable to assign the instructor.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(item) {
    if (!await confirmAction(`Remove ${item.instructorName} from ${item.courseCode} (${item.academicYear})?`)) return;
    setError('');
    setNotice('');
    try {
      await apiRequest(`/courses/assignments/${item.id}`, { method: 'DELETE' });
      setNotice('Assignment removed.');
      await load();
    } catch (err) {
      setError(err.message || 'Unable to remove the assignment.');
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={assign} className="panel-card space-y-4 p-5" aria-label="Assign an instructor to a course">
        <h2 className="text-base font-semibold text-slate-900">Assign an instructor to a course</h2>
        <ErrorBanner message={formError} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Course">
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)} className={INPUT}>
              <option value="">Select a course…</option>
              {options.courses.map((course) => (
                <option key={course.id} value={course.id}>{course.code} — {course.title}</option>
              ))}
            </select>
          </Field>
          <Field label="Instructor">
            <select value={instructorId} onChange={(event) => setInstructorId(event.target.value)} className={INPUT}>
              <option value="">Select an instructor…</option>
              {options.instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.name}
                  {instructor.departmentName ? ` (${instructor.departmentName})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Academic year">
            <input
              value={academicYear}
              maxLength={20}
              onChange={(event) => setAcademicYear(event.target.value)}
              placeholder="e.g. 2026"
              className={INPUT}
            />
          </Field>
          <Field label="Semester (optional)">
            <input
              value={semester}
              maxLength={20}
              onChange={(event) => setSemester(event.target.value)}
              placeholder="e.g. 1"
              className={INPUT}
            />
          </Field>
          <div className="flex items-end">
            <button type="submit" disabled={saving} className="primary-button w-full disabled:opacity-60">
              <UserPlus size={15} /> {saving ? 'Assigning…' : 'Assign instructor'}
            </button>
          </div>
        </div>

        {options.instructors.length === 0 && (
          <p className="text-xs text-amber-700">
            No active user with the Teacher role was found. Create instructors in Users &amp; roles first.
          </p>
        )}
      </form>

      <ErrorBanner message={error} onRetry={load} />
      <SuccessBanner message={notice} />

      <section className="panel-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Course">
              <select
                value={courseFilter}
                onChange={(event) => {
                  setCourseFilter(event.target.value);
                  setPage(1);
                }}
                className={`${INPUT} sm:w-64`}
              >
                <option value="">All courses</option>
                {options.courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.code} — {course.title}</option>
                ))}
              </select>
            </Field>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setYearFilter(yearInput.trim());
              }}
              className="flex items-end gap-2"
            >
              <Field label="Academic year">
                <input
                  value={yearInput}
                  onChange={(event) => setYearInput(event.target.value)}
                  placeholder="e.g. 2026"
                  className={`${INPUT} sm:w-32`}
                />
              </Field>
              <button type="submit" className={SECONDARY_BUTTON}>Filter</button>
            </form>
          </div>
          <button type="button" onClick={load} disabled={loading} className={SECONDARY_BUTTON}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {loading && items.length === 0 ? (
          <LoadingBlock label="Loading assignments…" />
        ) : items.length === 0 ? (
          <EmptyBlock title="No assignments found">
            Assign an instructor above, or change the filters.
          </EmptyBlock>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Course</th>
                  <th className="px-5 py-3 font-semibold">Instructor</th>
                  <th className="px-5 py-3 font-semibold">Department</th>
                  <th className="px-5 py-3 font-semibold">Academic year</th>
                  <th className="px-5 py-3 font-semibold">Semester</th>
                  <th className="px-5 py-3 font-semibold">Assigned</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">{item.courseCode}</p>
                      <p className="text-xs text-slate-500">{item.courseTitle}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-slate-800">{item.instructorName}</p>
                      <p className="text-xs text-slate-500">{item.instructorEmail}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{item.departmentName || '—'}</td>
                    <td className="px-5 py-4 text-slate-600">{item.academicYear}</td>
                    <td className="px-5 py-4 text-slate-600">{item.semester || '—'}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDate(item.createdAt)}</td>
                    <td className="px-5 py-4">
                      <button type="button" onClick={() => remove(item)} className={`${ROW_BUTTON} text-rose-700`}>
                        <Trash2 size={13} /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function CoursesPage() {
  const [tab, setTab] = useState('courses');
  const [options, setOptions] = useState(EMPTY_OPTIONS);
  const [optionsError, setOptionsError] = useState('');

  const loadOptions = useCallback(async () => {
    try {
      const response = await apiRequest('/courses/options');
      setOptions({ ...EMPTY_OPTIONS, ...(response?.data ?? {}) });
      setOptionsError('');
    } catch (err) {
      setOptionsError(err.message || 'Unable to load the department and instructor lists.');
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-slate-500">Organization</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Courses &amp; instructors</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Keep the course catalogue of each department and record which instructor teaches which course in each
          academic year. Courses are deactivated, never deleted, so history stays intact.
        </p>
      </div>

      <ErrorBanner message={optionsError} onRetry={loadOptions} />

      <Tabs tabs={TABS} active={tab} onChange={setTab} label="Courses and instructors" />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'courses' ? (
          <CoursesTab options={options} onChanged={loadOptions} />
        ) : (
          <AssignmentsTab options={options} />
        )}
      </div>
    </div>
  );
}