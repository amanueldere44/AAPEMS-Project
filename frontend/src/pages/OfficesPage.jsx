import { confirmAction } from '../utils/confirmAction.js';
﻿import { useCallback, useEffect, useState } from 'react';
import { Pencil, Power, Trash2, UserPlus, Users } from 'lucide-react';
import {
  addOfficeMember, createOffice, listOfficeMembers, listOfficeUsers, listOffices, removeOfficeMember, updateOffice,
} from '../services/improvementApi.js';
import { EmptyBlock, ErrorBanner, LoadingBlock, SuccessBanner } from './StateBlocks.jsx';

function Members({ office, onChanged, onError, onMessage }) {
  const [members, setMembers] = useState(null);
  const [users, setUsers] = useState([]);
  const [pick, setPick] = useState('');

  const load = useCallback(async () => {
    try {
      const [m, u] = await Promise.all([listOfficeMembers(office.id), listOfficeUsers()]);
      setMembers(m); setUsers(u);
    } catch (err) {
      onError(err.message);
    }
  }, [office.id, onError]);
  useEffect(() => { load(); }, [load]);

  if (!members) return <LoadingBlock label="Loading membersâ€¦" />;
  const available = users.filter((u) => !members.some((m) => m.id === Number(u.id)));

  async function add(event) {
    event.preventDefault();
    onError('');
    try {
      await addOfficeMember(office.id, Number(pick));
      setPick(''); onMessage('Member added.'); await load(); onChanged();
    } catch (err) { onError(err.message); }
  }
  async function remove(member) {
    if (!await confirmAction(`Remove ${member.name} from ${office.name}?`)) return;
    onError('');
    try {
      await removeOfficeMember(office.id, member.id);
      onMessage('Member removed.'); await load(); onChanged();
    } catch (err) { onError(err.message); }
  }

  return (
    <div className="space-y-4 border-t border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Members of {office.name}</h3>
      {members.length === 0 ? <p className="text-sm text-slate-500">No members yet. Members receive the referrals sent to this office.</p> : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between p-3 text-sm">
              <span>{m.name}<span className="ml-2 text-slate-500">{m.email}</span></span>
              <button type="button" className="icon-button" aria-label={`Remove ${m.name}`} onClick={() => remove(m)}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-slate-700">Add a member
          <select required className="mt-1 block min-w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
            value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{available.length ? 'Select a user' : 'No more users with the office role'}</option>
            {available.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </label>
        <button type="submit" className="primary-button" disabled={!pick}><UserPlus size={16} /> Add</button>
      </form>
      <p className="text-xs text-slate-500">Only active users with the â€œConcerned Officeâ€ role can be added. Create them in Users &amp; roles.</p>
    </div>
  );
}

export default function OfficesPage() {
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      setOffices(await listOffices());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(event) {
    event.preventDefault();
    setError(''); setMessage('');
    try {
      await createOffice(name.trim());
      setName(''); setMessage('Office created.'); await load();
    } catch (err) { setError(err.message); }
  }
  async function patch(office, body, text) {
    setError(''); setMessage('');
    try {
      await updateOffice(office.id, body);
      setEditing(null); setMessage(text); await load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Concerned offices and directorates</h1>
        <p className="mt-1 text-sm text-slate-600">
          Offices receive performance gaps from finalized evaluation summaries and plan support and capacity-building activities.
        </p>
      </header>
      <ErrorBanner message={error} onRetry={load} />
      <SuccessBanner message={message} />

      <form onSubmit={add} className="panel-card flex flex-wrap items-end gap-3 p-5" aria-label="Add an office">
        <label className="flex-1 text-sm font-medium text-slate-700">New office or directorate
          <input required maxLength={180} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
            value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="primary-button" disabled={!name.trim()}>Add office</button>
      </form>

      <section className="panel-card">
        {loading ? <LoadingBlock label="Loading officesâ€¦" /> : offices.length === 0 ? (
          <EmptyBlock title="No offices yet">Add the offices and directorates that handle capacity building.</EmptyBlock>
        ) : (
          <ul className="divide-y divide-slate-100">
            {offices.map((office) => (
              <li key={office.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  {editing?.id === office.id ? (
                    <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); patch(office, { name: editing.name.trim() }, 'Office renamed.'); }}>
                      <input aria-label="Office name" required maxLength={180} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                      <button type="submit" className="primary-button">Save</button>
                      <button type="button" className="rounded-lg border border-slate-300 px-3 text-sm" onClick={() => setEditing(null)}>Cancel</button>
                    </form>
                  ) : (
                    <div>
                      <div className="font-medium text-slate-900">{office.name}</div>
                      <div className="text-sm text-slate-500">{office.memberCount} members Â· {office.referralCount} referrals</div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className={`status-pill ${office.active ? 'status-green' : 'status-gray'}`}>{office.active ? 'Active' : 'Inactive'}</span>
                    <button type="button" className="icon-button" aria-label={`Members of ${office.name}`} aria-expanded={openId === office.id}
                      onClick={() => setOpenId(openId === office.id ? null : office.id)}><Users size={16} /></button>
                    <button type="button" className="icon-button" aria-label={`Rename ${office.name}`}
                      onClick={() => setEditing({ id: office.id, name: office.name })}><Pencil size={16} /></button>
                    <button type="button" className="icon-button" aria-label={office.active ? `Deactivate ${office.name}` : `Activate ${office.name}`}
                      onClick={() => patch(office, { active: !office.active }, office.active ? 'Office deactivated. It can no longer receive new referrals.' : 'Office activated.')}><Power size={16} /></button>
                  </div>
                </div>
                {openId === office.id && (
                  <Members office={office} onChanged={load} onError={setError} onMessage={setMessage} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
