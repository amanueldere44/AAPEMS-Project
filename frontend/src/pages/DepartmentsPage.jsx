import { confirmAction } from '../utils/confirmAction.js';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import {
  createDepartment, deleteDepartment, listDepartmentMembers, listDepartments, listUnassignedUsers, listUnits,
  removeDepartmentMember, setDepartmentMember, updateDepartment,
} from '../services/organizationApi.js';
import {
  EmptyBlock, ErrorBanner, LoadingBlock, Pagination, SuccessBanner, titleCase,
} from '../components/StateBlocks.jsx';

const PAGE_SIZE = 10;
const input = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal';

function Staff({ department, onChanged, onError, onMessage }) {
  const [members, setMembers] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [form, setForm] = useState({ userId: '', employeeType: 'academic', jobTitle: '' });

  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([listDepartmentMembers(department.id), listUnassignedUsers()]);
      setMembers(m); setCandidates(c);
    } catch (err) { onError(err.message); }
  }, [department.id, onError]);
  useEffect(() => { load(); }, [load]);

  async function add(event) {
    event.preventDefault();
    onError('');
    try {
      await setDepartmentMember(department.id, Number(form.userId), {
        employeeType: form.employeeType, jobTitle: form.jobTitle.trim() || null,
      });
      setForm({ userId: '', employeeType: 'academic', jobTitle: '' });
      onMessage('Staff member assigned.');
      await load(); onChanged();
    } catch (err) { onError(err.message); }
  }
  async function remove(member) {
    if (!await confirmAction(`Remove ${member.name} from ${department.name}? Their reports and referrals will no longer be visible to this department's head.`)) return;
    onError('');
    try {
      await removeDepartmentMember(department.id, member.userId);
      onMessage('Staff member removed from the department.');
      await load(); onChanged();
    } catch (err) { onError(err.message); }
  }

  if (!members) return <LoadingBlock label="Loading staff…" />;
  return (
    <div className="space-y-4 border-t border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Staff of {department.name}</h3>
      {members.length === 0 ? <p className="text-sm text-slate-500">No staff assigned yet.</p> : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>
                <span className="font-medium text-slate-900">{m.name}</span>
                <span className="ml-2 text-slate-500">{m.email}</span>
                <span className="ml-2 text-xs text-slate-500">{titleCase(m.role)} · {titleCase(m.employeeType)}{m.jobTitle ? ` · ${m.jobTitle}` : ''}</span>
              </span>
              <button type="button" className="icon-button" aria-label={`Remove ${m.name}`} onClick={() => remove(m)}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid gap-3 md:grid-cols-[2fr_1fr_1.5fr_auto]" aria-label="Assign a staff member">
        <label className="text-sm font-medium text-slate-700">Staff member
          <select required className={`mt-1 w-full ${input}`} value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
            <option value="">{candidates.length ? 'Select a user' : 'Everyone is already assigned'}</option>
            {candidates.map((u) => <option key={u.id} value={u.id}>{u.name} ({titleCase(u.role)})</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Type
          <select className={`mt-1 w-full ${input}`} value={form.employeeType} onChange={(e) => setForm({ ...form, employeeType: e.target.value })}>
            <option value="academic">Academic</option><option value="administrative">Administrative</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Job title (optional)
          <input maxLength={150} className={`mt-1 w-full ${input}`} value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
        </label>
        <div className="flex items-end"><button type="submit" className="primary-button" disabled={!form.userId}><UserPlus size={16} /> Assign</button></div>
      </form>
      <p className="text-xs text-slate-500">
        A department head sees the reports of this department; a dean sees those of the whole academic unit. A user can belong to
        one department at a time, so remove someone from their current department before assigning them to another.
      </p>
    </div>
  );
}

export default function DepartmentsPage() {
  const [units, setUnits] = useState([]);
  const [filters, setFilters] = useState({ facultyId: '', search: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [newDept, setNewDept] = useState({ name: '', facultyId: '' });
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { listUnits().then(setUnits).catch((err) => setError(err.message)); }, []);
  useEffect(() => {
    const timer = setTimeout(() => { setFilters((f) => ({ ...f, search: search.trim() })); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await listDepartments({ ...filters, page, pageSize: PAGE_SIZE }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);
  useEffect(() => { load(); }, [load]);

  async function run(action, text) {
    setBusy(true); setError(''); setMessage('');
    try {
      await action();
      setMessage(text);
      await load();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function add(event) {
    event.preventDefault();
    if (await run(() => createDepartment({ name: newDept.name.trim(), facultyId: Number(newDept.facultyId) }), 'Department created.')) {
      setNewDept({ name: '', facultyId: newDept.facultyId });
    }
  }
  async function save(event) {
    event.preventDefault();
    if (await run(() => updateDepartment(editing.id, { name: editing.name.trim(), facultyId: Number(editing.facultyId) }), 'Department updated.')) setEditing(null);
  }
  async function remove(department) {
    if (!await confirmAction(`Delete the department “${department.name}”?`)) return;
    await run(() => deleteDepartment(department.id), 'Department deleted.');
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Departments</h1>
        <p className="mt-1 text-sm text-slate-600">
          Departments and their staff. The department and academic unit of a staff member decide which evaluation reports and
          improvement referrals a department head or dean can see.
        </p>
      </header>
      <ErrorBanner message={error} />
      <SuccessBanner message={message} />

      <form onSubmit={add} className="panel-card grid gap-4 p-5 md:grid-cols-[2fr_2fr_auto]" aria-label="Add a department">
        <label className="text-sm font-medium text-slate-700">Department name
          <input required maxLength={255} className={`mt-1 w-full ${input}`} value={newDept.name} onChange={(e) => setNewDept({ ...newDept, name: e.target.value })} />
        </label>
        <label className="text-sm font-medium text-slate-700">Academic unit
          <select required className={`mt-1 w-full ${input}`} value={newDept.facultyId} onChange={(e) => setNewDept({ ...newDept, facultyId: e.target.value })}>
            <option value="">{units.length ? 'Select an academic unit' : 'Create an academic unit first'}</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <div className="flex items-end"><button type="submit" className="primary-button" disabled={busy || !newDept.name.trim() || !newDept.facultyId}>Add department</button></div>
      </form>

      <section className="panel-card">
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Search
            <input type="search" className={`mt-1 w-full ${input}`} placeholder="Department name" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-700">Academic unit
            <select className={`mt-1 w-full ${input}`} value={filters.facultyId} onChange={(e) => { setFilters({ ...filters, facultyId: e.target.value }); setPage(1); }}>
              <option value="">All academic units</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        </div>

        {loading ? <LoadingBlock label="Loading departments…" /> : result.items.length === 0 ? (
          <EmptyBlock title="No departments found">Add a department above, or change the search and filter.</EmptyBlock>
        ) : (
          <ul className="divide-y divide-slate-100">
            {result.items.map((d) => (
              <li key={d.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  {editing?.id === d.id ? (
                    <form className="flex flex-1 flex-wrap gap-2" onSubmit={save}>
                      <input aria-label="Department name" required maxLength={255} className={`flex-1 ${input}`} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                      <select aria-label="Academic unit" className={input} value={editing.facultyId} onChange={(e) => setEditing({ ...editing, facultyId: e.target.value })}>
                        {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      <button type="submit" className="primary-button" disabled={busy}>Save</button>
                      <button type="button" className="rounded-lg border border-slate-300 px-3 text-sm" onClick={() => setEditing(null)}>Cancel</button>
                    </form>
                  ) : (
                    <div>
                      <div className="font-medium text-slate-900">{d.name}</div>
                      <div className="text-sm text-slate-500">{d.facultyName} · {d.memberCount} staff</div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button type="button" className="icon-button" aria-label={`Staff of ${d.name}`} aria-expanded={openId === d.id} onClick={() => setOpenId(openId === d.id ? null : d.id)}><Users size={16} /></button>
                    <button type="button" className="icon-button" aria-label={`Edit ${d.name}`} onClick={() => setEditing({ id: d.id, name: d.name, facultyId: String(d.facultyId) })}><Pencil size={16} /></button>
                    <button type="button" className="icon-button" aria-label={`Delete ${d.name}`} disabled={busy} onClick={() => remove(d)}><Trash2 size={16} /></button>
                  </div>
                </div>
                {openId === d.id && <Staff department={d} onChanged={load} onError={setError} onMessage={setMessage} />}
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} onChange={setPage} />
      </section>
    </div>
  );
}