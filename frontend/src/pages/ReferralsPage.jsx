import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Circle, Plus } from 'lucide-react';
import {
  acknowledgeReferral, addActivity, createReferral, getReferral, listOffices, listReferableSummaries,
  listReferrals, updateActivity,
} from '../services/improvementApi.js';
import {
  EmptyBlock, ErrorBanner, LoadingBlock, Pagination, SuccessBanner, formatDate,
} from './StateBlocks.jsx';

const PAGE_SIZE = 10;
const REFERRER_ROLES = ['committee', 'department_head'];
const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal';

function AckPill({ referral }) {
  return referral.acknowledgedAt
    ? <span className="status-pill status-green">Acknowledged {formatDate(referral.acknowledgedAt)}</span>
    : <span className="status-pill status-amber">Awaiting acknowledgement</span>;
}

function NewReferral({ onCreated, onCancel }) {
  const [summaries, setSummaries] = useState(null);
  const [offices, setOffices] = useState([]);
  const [form, setForm] = useState({ summaryId: '', officeId: '', performanceGaps: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([listReferableSummaries(), listOffices()])
      .then(([s, o]) => { setSummaries(s); setOffices(o); })
      .catch((err) => setError(err.message));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const created = await createReferral({
        summaryId: Number(form.summaryId), officeId: Number(form.officeId),
        performanceGaps: form.performanceGaps.trim() || undefined,
      });
      onCreated(created.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel-card space-y-4 p-5" aria-label="New referral">
      <h2 className="text-base font-semibold text-slate-900">Refer performance gaps to an office</h2>
      <ErrorBanner message={error} />
      {!summaries ? <LoadingBlock label="Loading finalized summariesâ€¦" /> : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Finalized evaluation summary
              <select required className={field} value={form.summaryId} onChange={(e) => setForm({ ...form, summaryId: e.target.value })}>
                <option value="">{summaries.length ? 'Select a summary' : 'No finalized summaries available'}</option>
                {summaries.map((s) => <option key={s.id} value={s.id}>{s.instructor_name} â€” {s.cycle_title} ({s.academic_year})</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">Concerned office
              <select required className={field} value={form.officeId} onChange={(e) => setForm({ ...form, officeId: e.target.value })}>
                <option value="">{offices.length ? 'Select an office' : 'No active offices'}</option>
                {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Performance gaps (optional)
            <textarea rows={4} maxLength={10000} className={field} value={form.performanceGaps}
              placeholder="Leave blank to use the areas for improvement recorded when the summary was finalized."
              onChange={(e) => setForm({ ...form, performanceGaps: e.target.value })} />
          </label>
        </>
      )}
      <div className="flex gap-3">
        <button type="submit" className="primary-button" disabled={saving || !summaries}>{saving ? 'Sendingâ€¦' : 'Send referral'}</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
      </div>
    </form>
  );
}

function Detail({ id, user, onBack }) {
  const isOffice = user?.role === 'concerned_office';
  const [referral, setReferral] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activity, setActivity] = useState({ title: '', description: '', targetDate: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setReferral(await getReferral(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function run(action, text) {
    setBusy(true); setError(''); setMessage('');
    try {
      await action();
      if (text) setMessage(text);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading referralâ€¦" />;
  if (!referral) return (<><ErrorBanner message={error} /><button type="button" className="mt-4 text-sm font-medium underline" onClick={onBack}>Back to the list</button></>);

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-medium text-slate-600"><ArrowLeft size={16} /> Back to the list</button>
      <ErrorBanner message={error} />
      <SuccessBanner message={message} />

      <header className="panel-card space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{referral.instructorName}</h1>
            <p className="text-sm text-slate-500">{referral.cycleTitle} ({referral.academicYear}) Â· referred to <strong>{referral.officeName}</strong></p>
            <p className="text-sm text-slate-500">By {referral.referredByName} on {formatDate(referral.referredAt)}</p>
          </div>
          <AckPill referral={referral} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Performance gaps</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{referral.performanceGaps}</p>
        </div>
        {isOffice && !referral.acknowledgedAt && (
          <button type="button" className="primary-button" disabled={busy}
            onClick={() => run(() => acknowledgeReferral(id), 'Referral acknowledged.')}>Acknowledge referral</button>
        )}
      </header>

      <section className="panel-card">
        <h2 className="border-b border-slate-200 px-5 py-3 text-base font-semibold text-slate-900">
          Support and capacity-building activities ({referral.completedCount} of {referral.activityCount} completed)
        </h2>
        {referral.activities.length === 0 ? (
          <EmptyBlock title="No activities planned yet">{isOffice ? 'Add the first activity below.' : 'The office has not planned any activity yet.'}</EmptyBlock>
        ) : (
          <ul className="divide-y divide-slate-100">
            {referral.activities.map((a) => (
              <li key={a.id} className="flex items-start gap-3 p-4">
                {isOffice ? (
                  <button type="button" className="mt-0.5 text-slate-500" disabled={busy}
                    aria-label={a.completedAt ? `Reopen ${a.title}` : `Mark ${a.title} completed`}
                    onClick={() => run(() => updateActivity(a.id, { completed: !a.completedAt }))}>
                    {a.completedAt ? <CheckCircle2 size={20} className="text-emerald-600" /> : <Circle size={20} />}
                  </button>
                ) : (a.completedAt ? <CheckCircle2 size={20} className="mt-0.5 text-emerald-600" aria-label="Completed" /> : <Circle size={20} className="mt-0.5 text-slate-400" aria-label="Not completed" />)}
                <div className="text-sm">
                  <div className="font-medium text-slate-900">{a.title}</div>
                  {a.description && <div className="whitespace-pre-line text-slate-600">{a.description}</div>}
                  <div className="mt-1 text-xs text-slate-500">
                    {a.targetDate ? `Target ${a.targetDate} Â· ` : ''}{a.completedAt ? `Completed ${formatDate(a.completedAt)} Â· ` : ''}Added by {a.createdByName}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {isOffice && (
          <form className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 md:grid-cols-[2fr_2fr_1fr_auto]" aria-label="Add an activity"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await addActivity(id, { title: activity.title.trim(), description: activity.description.trim() || null, targetDate: activity.targetDate || null });
                setActivity({ title: '', description: '', targetDate: '' });
              }, 'Activity added.');
            }}>
            <input required aria-label="Activity title" placeholder="Activity title" maxLength={255} className={field.replace('mt-1 ', '')}
              value={activity.title} onChange={(e) => setActivity({ ...activity, title: e.target.value })} />
            <input aria-label="Description" placeholder="Description (optional)" className={field.replace('mt-1 ', '')}
              value={activity.description} onChange={(e) => setActivity({ ...activity, description: e.target.value })} />
            <input type="date" aria-label="Target date" className={field.replace('mt-1 ', '')}
              value={activity.targetDate} onChange={(e) => setActivity({ ...activity, targetDate: e.target.value })} />
            <button type="submit" className="primary-button" disabled={busy || !activity.title.trim()}><Plus size={16} /> Add</button>
          </form>
        )}
      </section>
    </div>
  );
}

function List({ user, onOpen }) {
  const canRefer = REFERRER_ROLES.includes(user?.role);
  const [filters, setFilters] = useState({ acknowledged: '', officeId: '' });
  const [offices, setOffices] = useState([]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { listOffices().then(setOffices).catch(() => {}); }, []);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setResult(await listReferrals({ ...filters, page, pageSize: PAGE_SIZE }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);
  useEffect(() => { load(); }, [load]);

  const setFilter = (key, value) => { setFilters({ ...filters, [key]: value }); setPage(1); };
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Improvement referrals</h1>
          <p className="mt-1 text-sm text-slate-600">
            Performance gaps from finalized evaluation summaries, referred to the concerned offices that plan support and capacity building.
          </p>
        </div>
        {canRefer && !creating && <button type="button" className="primary-button" onClick={() => setCreating(true)}><Plus size={16} /> New referral</button>}
      </header>
      {creating && <NewReferral onCancel={() => setCreating(false)} onCreated={onOpen} />}
      <ErrorBanner message={error} onRetry={load} />
      <section className="panel-card">
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Acknowledgement
            <select className={field} value={filters.acknowledged} onChange={(e) => setFilter('acknowledged', e.target.value)}>
              <option value="">All</option><option value="no">Awaiting acknowledgement</option><option value="yes">Acknowledged</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Office
            <select className={field} value={filters.officeId} onChange={(e) => setFilter('officeId', e.target.value)}>
              <option value="">All offices</option>
              {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        </div>
        {loading ? <LoadingBlock label="Loading referralsâ€¦" /> : result.items.length === 0 ? (
          <EmptyBlock title="No referrals found">{canRefer ? 'Use â€œNew referralâ€ to send performance gaps to an office.' : 'Referrals will appear here when they are sent to your office.'}</EmptyBlock>
        ) : (
          <ul className="divide-y divide-slate-100">
            {result.items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-medium text-slate-900">{r.instructorName} â†’ {r.officeName}</div>
                  <div className="text-sm text-slate-500">{r.cycleTitle} ({r.academicYear}) Â· {formatDate(r.referredAt)} Â· {r.completedCount} of {r.activityCount} activities completed</div>
                </div>
                <div className="flex items-center gap-3">
                  <AckPill referral={r} />
                  <button type="button" className="primary-button" onClick={() => onOpen(r.id)}>Open</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} onChange={setPage} />
      </section>
    </div>
  );
}

export default function ReferralsPage({ user }) {
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  if (openId && /^[1-9]\d*$/.test(openId)) {
    return <Detail key={openId} id={Number(openId)} user={user} onBack={() => setParams({})} />;
  }
  return <List user={user} onOpen={(id) => setParams({ open: String(id) })} />;
}
