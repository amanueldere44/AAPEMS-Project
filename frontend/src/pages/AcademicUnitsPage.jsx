import { confirmAction } from '../utils/confirmAction.js';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { createUnit, deleteUnit, listUnits, updateUnit } from '../services/organizationApi.js';
import { EmptyBlock, ErrorBanner, LoadingBlock, SuccessBanner } from '../components/StateBlocks.jsx';

// Academic units are the colleges, schools and institutes that departments belong to.
// A dean sees the reports of the departments in their own academic unit.
export default function AcademicUnitsPage() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUnits(await listUnits());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
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
    if (await run(() => createUnit(name.trim()), 'Academic unit created.')) setName('');
  }
  async function rename(event) {
    event.preventDefault();
    if (await run(() => updateUnit(editing.id, editing.name.trim()), 'Academic unit renamed.')) setEditing(null);
  }
  async function remove(unit) {
    if (!await confirmAction(`Delete the academic unit “${unit.name}”?`)) return;
    await run(() => deleteUnit(unit.id), 'Academic unit deleted.');
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Academic units</h1>
        <p className="mt-1 text-sm text-slate-600">
          Colleges, schools and institutes. Each department belongs to one academic unit, and a dean sees the evaluation
          reports of the departments in their own unit.
        </p>
      </header>
      <ErrorBanner message={error} onRetry={load} />
      <SuccessBanner message={message} />

      <form onSubmit={add} className="panel-card flex flex-wrap items-end gap-3 p-5" aria-label="Add an academic unit">
        <label className="flex-1 text-sm font-medium text-slate-700">New academic unit
          <input required maxLength={255} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
            value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="primary-button" disabled={busy || !name.trim()}>Add unit</button>
      </form>

      <section className="panel-card">
        {loading ? <LoadingBlock label="Loading academic units…" /> : units.length === 0 ? (
          <EmptyBlock title="No academic units yet">Add the colleges, schools and institutes first, then their departments.</EmptyBlock>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-5 py-3">Academic unit</th><th className="px-5 py-3">Departments</th><th className="px-5 py-3">Staff</th><th className="px-5 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {units.map((unit) => (
                  <tr key={unit.id}>
                    <td className="px-5 py-3">
                      {editing?.id === unit.id ? (
                        <form className="flex gap-2" onSubmit={rename}>
                          <input aria-label="Academic unit name" required maxLength={255} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                          <button type="submit" className="primary-button" disabled={busy}>Save</button>
                          <button type="button" className="rounded-lg border border-slate-300 px-3 text-sm" onClick={() => setEditing(null)}>Cancel</button>
                        </form>
                      ) : <span className="font-medium text-slate-900">{unit.name}</span>}
                    </td>
                    <td className="px-5 py-3">{unit.departmentCount}</td>
                    <td className="px-5 py-3">{unit.memberCount}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="icon-button" aria-label={`Rename ${unit.name}`} onClick={() => setEditing({ id: unit.id, name: unit.name })}><Pencil size={16} /></button>
                        <button type="button" className="icon-button" aria-label={`Delete ${unit.name}`} disabled={busy} onClick={() => remove(unit)}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}