import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plus, RefreshCw } from 'lucide-react';
import { apiRequest } from '../services/api.js';
import { Alert, Pager, Restricted, area, btn, field, fmtDate, label } from '../components/ui.jsx';

const PAGE_SIZE = 15;
const READ_ROLES = ['admin', 'committee', 'department_head', 'dean', 'concerned_office'];

/* ------------------------------------------------------------------ */
/* Referrals                                                           */
/* ------------------------------------------------------------------ */

function ReferralsTab({ canRefer, isOffice }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [ackFilter, setAckFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState({ title: '', description: '', targetDate: '' });

  const [creating, setCreating] = useState(false);
  const [options, setOptions] = useState({ summaries: [], offices: [] });
  const [form, setForm] = useState({ summaryId: '', officeId: '', performanceGaps: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (ackFilter) params.set('acknowledged', ackFilter);
      const result = await apiRequest(`/improvement/referrals?${params}`);
      setItems(result?.data?.items ?? []);
      setTotal(result?.data?.total ?? 0);
    } catch (err) {
      setError(err.message || 'Unable to load referrals.');
    } finally {
      setLoading(false);
    }
  }, [page, ackFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function openReferral(id) {
    setNotice('');
    setDetailError('');
    try {
      const result = await apiRequest(`/improvement/referrals/${id}`);
      setDetail(result.data);
    } catch (err) {
      setDetailError(err.message || 'Unable to load this referral.');
    }
  }

  async function run(action, success) {
    setBusy(true);
    setDetailError('');
    setNotice('');
    try {
      await action();
      await openReferral(detail.id);
      await load();
      setNotice(success);
    } catch (err) {
      setDetailError(err.message || 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  const acknowledge = () =>
    run(() => apiRequest(`/improvement/referrals/${detail.id}/acknowledge`, { method: 'POST', body: '{}' }), 'Referral acknowledged.');

  const completeActivity = (id) =>
    run(
      () => apiRequest(`/improvement/activities/${id}`, { method: 'PATCH', body: JSON.stringify({ completed: true }) }),
      'Activity marked as completed.',
    );

  async function addActivity(event) {
    event.preventDefault();
    if (!activity.title.trim()) {
      setDetailError('Give the activity a title.');
      return;
    }
    await run(
      () =>
        apiRequest(`/improvement/referrals/${detail.id}/activities`, {
          method: 'POST',
          body: JSON.stringify({
            title: activity.title.trim(),
            description: activity.description.trim() || null,
            targetDate: activity.targetDate || null,
          }),
        }),
      'Support activity added.',
    );
    setActivity({ title: '', description: '', targetDate: '' });
  }

  async function startCreate() {
    setCreating(true);
    setError('');
    try {
      const [reviewed, archived, offices] = await Promise.all([
        apiRequest('/reports/summaries?status=reviewed&limit=100'),
        apiRequest('/reports/summaries?status=archived&limit=100'),
        apiRequest('/improvement/offices'),
      ]);
      const pick = (r) => (Array.isArray(r?.data?.items) ? r.data.items : []);
      setOptions({ summaries: [...pick(reviewed), ...pick(archived)], offices: Array.isArray(offices?.data) ? offices.data : [] });
    } catch (err) {
      setError(err.message || 'Unable to load finalized summaries and offices.');
      setCreating(false);
    }
  }

  async function submitReferral(event) {
    event.preventDefault();
    if (!form.summaryId || !form.officeId) {
      setError('Choose a finalized summary and a concerned office.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = { summaryId: Number(form.summaryId), officeId: Number(form.officeId) };
      if (form.performanceGaps.trim()) body.performanceGaps = form.performanceGaps.trim();
      await apiRequest('/improvement/referrals', { method: 'POST', body: JSON.stringify(body) });
      setCreating(false);
      setForm({ summaryId: '', officeId: '', performanceGaps: '' });
      setPage(1);
      await load();
    } catch (err) {
      setError(err.message || 'Unable to create the referral.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          aria-label="Filter by acknowledgement"
          value={ackFilter}
          onChange={(event) => {
            setAckFilter(event.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="">All referrals</option>
          <option value="no">Waiting for acknowledgement</option>
          <option value="yes">Acknowledged</option>
        </select>
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={load} disabled={loading}>
            <RefreshCw size={13} /> Refresh
          </button>
          {canRefer && (
            <button type="button" className="primary-button" onClick={startCreate} disabled={creating}>
              <Plus size={14} /> New referral
            </button>
          )}
        </div>
      </div>

      <Alert>{error}</Alert>

      {creating && (
        <form onSubmit={submitReferral} className="panel-card space-y-4 p-5">
          <h2 className="text-lg font-semibold text-slate-900">Refer performance gaps to a concerned office</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={label}>
              Finalized evaluation summary
              <select className={`${field} mt-1`} value={form.summaryId} onChange={(e) => setForm({ ...form, summaryId: e.target.value })}>
                <option value="">Select a summary…</option>
                {options.summaries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.instructor_name} — {s.cycle_title}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Concerned office or directorate
              <select className={`${field} mt-1`} value={form.officeId} onChange={(e) => setForm({ ...form, officeId: e.target.value })}>
                <option value="">Select an office…</option>
                {options.offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={label}>
            Performance gaps (optional — the areas for improvement recorded on the summary are used if left empty)
            <textarea
              className={`${area} mt-1`}
              rows={4}
              maxLength={10000}
              value={form.performanceGaps}
              onChange={(e) => setForm({ ...form, performanceGaps: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={btn} onClick={() => setCreating(false)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? 'Sending…' : 'Send referral'}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="panel-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Instructor</th>
                  <th className="px-4 py-3">Office</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Activities</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No referrals to show.
                    </td>
                  </tr>
                )}
                {!loading &&
                  items.map((r) => (
                    <tr key={r.id} className={detail?.id === r.id ? 'bg-slate-50' : ''}>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {r.instructorName}
                        <span className="block text-xs font-normal text-slate-400">{r.cycleTitle}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.officeName}</td>
                      <td className="px-4 py-3">
                        <span className={`status-pill ${r.acknowledgedAt ? 'status-green' : 'status-amber'}`}>
                          {r.acknowledgedAt ? 'Acknowledged' : 'Waiting'}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">
                        {r.completedCount}/{r.activityCount} done
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" className={btn} onClick={() => openReferral(r.id)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
        </section>

        <section className="panel-card space-y-4 p-5" aria-live="polite">
          {!detail && !detailError && <p className="text-sm text-slate-500">Select a referral to see its details.</p>}
          <Alert>{detailError}</Alert>
          <Alert tone="success">{notice}</Alert>
          {detail && (
            <>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{detail.instructorName}</h2>
                <p className="text-sm text-slate-500">
                  {detail.cycleTitle} · referred to {detail.officeName} on {fmtDate(detail.referredAt)} by {detail.referredByName}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Performance gaps</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{detail.performanceGaps}</p>
              </div>

              {detail.acknowledgedAt ? (
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 size={16} /> Acknowledged {fmtDate(detail.acknowledgedAt)}
                </p>
              ) : (
                isOffice && (
                  <button type="button" className="primary-button" disabled={busy} onClick={acknowledge}>
                    Acknowledge this referral
                  </button>
                )
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Support and capacity-building activities</h3>
                {detail.activities.length === 0 && <p className="text-sm text-slate-500">No activities have been planned yet.</p>}
                <ul className="space-y-2">
                  {detail.activities.map((a) => (
                    <li key={a.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <p className="font-medium text-slate-800">{a.title}</p>
                      {a.description && <p className="mt-1 whitespace-pre-wrap text-slate-600">{a.description}</p>}
                      <p className="mt-1 text-xs text-slate-500">
                        Target: {fmtDate(a.targetDate)} · Added by {a.createdByName}
                      </p>
                      {a.completedAt ? (
                        <span className="status-pill status-green mt-2">Completed {fmtDate(a.completedAt)}</span>
                      ) : (
                        isOffice && (
                          <button type="button" className={`${btn} mt-2`} disabled={busy} onClick={() => completeActivity(a.id)}>
                            Mark completed
                          </button>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {isOffice && (
                <form onSubmit={addActivity} className="space-y-3 rounded-lg border border-slate-200 p-3">
                  <h3 className="text-sm font-semibold text-slate-900">Plan a new activity</h3>
                  <label className={label}>
                    Title
                    <input className={`${field} mt-1`} maxLength={255} value={activity.title} onChange={(e) => setActivity({ ...activity, title: e.target.value })} />
                  </label>
                  <label className={label}>
                    Description (optional)
                    <textarea className={`${area} mt-1`} rows={3} maxLength={10000} value={activity.description} onChange={(e) => setActivity({ ...activity, description: e.target.value })} />
                  </label>
                  <label className={label}>
                    Target date (optional)
                    <input type="date" className={`${field} mt-1`} value={activity.targetDate} onChange={(e) => setActivity({ ...activity, targetDate: e.target.value })} />
                  </label>
                  <button type="submit" className="primary-button" disabled={busy}>
                    Add activity
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Offices (administrator)                                             */
/* ------------------------------------------------------------------ */

function OfficesTab() {
  const [offices, setOffices] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [office, setOffice] = useState(null);
  const [members, setMembers] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [candidateId, setCandidateId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/improvement/offices');
      setOffices(Array.isArray(result?.data) ? result.data : []);
    } catch (err) {
      setError(err.message || 'Unable to load offices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function guarded(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message || 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  const loadMembers = async (id) => {
    const result = await apiRequest(`/improvement/offices/${id}/members`);
    setMembers(Array.isArray(result?.data) ? result.data : []);
  };

  const createOffice = (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Enter the office name.');
      return;
    }
    return guarded(async () => {
      await apiRequest('/improvement/offices', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      setName('');
      await load();
    });
  };

  const toggleActive = (o) =>
    guarded(async () => {
      await apiRequest(`/improvement/offices/${o.id}`, { method: 'PATCH', body: JSON.stringify({ active: !o.active }) });
      await load();
    });

  const openMembers = (o) =>
    guarded(async () => {
      setOffice(o);
      setCandidateId('');
      await loadMembers(o.id);
      const users = await apiRequest('/users?role=concerned_office&status=active&limit=100');
      setCandidates(users?.data?.users ?? []);
    });

  const addMember = () =>
    guarded(async () => {
      if (!candidateId) throw new Error('Choose a user to add.');
      await apiRequest(`/improvement/offices/${office.id}/members/${candidateId}`, { method: 'PUT', body: '{}' });
      setCandidateId('');
      await loadMembers(office.id);
      await load();
    });

  const removeMember = (userId) =>
    guarded(async () => {
      await apiRequest(`/improvement/offices/${office.id}/members/${userId}`, { method: 'DELETE' });
      await loadMembers(office.id);
      await load();
    });

  const available = candidates.filter((c) => !members.some((m) => Number(m.id) === Number(c.id)));

  return (
    <div className="space-y-6">
      <Alert>{error}</Alert>
      <form onSubmit={createOffice} className="panel-card flex flex-wrap items-end gap-3 p-5">
        <label className={`${label} min-w-64 flex-1`}>
          New concerned office or directorate
          <input className={`${field} mt-1`} maxLength={180} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="primary-button" disabled={busy}>
          <Plus size={14} /> Add office
        </button>
      </form>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel-card overflow-hidden">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Office</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Referrals</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && offices.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No offices have been created yet.
                  </td>
                </tr>
              )}
              {offices.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {o.name}
                    {!o.active && <span className="status-pill status-gray ml-2">Inactive</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{o.memberCount}</td>
                  <td className="px-4 py-3 tabular-nums">{o.referralCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" className={btn} disabled={busy} onClick={() => openMembers(o)}>
                        Members
                      </button>
                      <button type="button" className={btn} disabled={busy} onClick={() => toggleActive(o)}>
                        {o.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel-card space-y-4 p-5">
          {!office && <p className="text-sm text-slate-500">Choose an office to manage its members.</p>}
          {office && (
            <>
              <h2 className="text-lg font-semibold text-slate-900">{office.name}</h2>
              <ul className="space-y-2">
                {members.length === 0 && <li className="text-sm text-slate-500">No members yet.</li>}
                {members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <span>
                      {m.name}
                      <span className="block text-xs text-slate-400">{m.email}</span>
                    </span>
                    <button type="button" className={btn} disabled={busy} onClick={() => removeMember(m.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <select aria-label="User to add" className={field} value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
                  <option value="">Add a concerned-office user…</option>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
                <button type="button" className="primary-button" disabled={busy} onClick={addMember}>
                  Add
                </button>
              </div>
              {available.length === 0 && (
                <p className="text-xs text-slate-500">Only active users with the “concerned office” role can be added. Create them on the Users page.</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ImprovementPage({ user }) {
  const role = user?.role;
  const [tab, setTab] = useState('referrals');

  if (!READ_ROLES.includes(role)) {
    return <Restricted>Your role does not use the improvement workflow.</Restricted>;
  }

  const tabClass = (key) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${tab === key ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Improvement</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Performance improvement</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          After a final evaluation summary, strengths and areas for improvement are referred to the concerned offices and
          directorates, which plan support and capacity-building activities.
        </p>
      </header>
      {role === 'admin' && (
        <div className="flex gap-2" role="tablist" aria-label="Improvement sections">
          <button type="button" role="tab" aria-selected={tab === 'referrals'} className={tabClass('referrals')} onClick={() => setTab('referrals')}>
            Referrals
          </button>
          <button type="button" role="tab" aria-selected={tab === 'offices'} className={tabClass('offices')} onClick={() => setTab('offices')}>
            Offices
          </button>
        </div>
      )}
      {tab === 'offices' && role === 'admin' ? (
        <OfficesTab />
      ) : (
        <ReferralsTab canRefer={['committee', 'department_head'].includes(role)} isOffice={role === 'concerned_office'} />
      )}
    </div>
  );
}