import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, FileText, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../services/api.js';


const VIEW_ROLES = ['admin', 'committee', 'department_head', 'dean', 'management', 'academic_vp'];
const REVIEW_ROLES = ['committee', 'department_head'];
const CHAIN_ROLES = ['admin', 'department_head', 'dean', 'management', 'academic_vp'];


const SUMMARY_TONE = {
  incomplete: 'status-amber',
  complete: 'status-blue',
  reviewed: 'status-green',
  archived: 'status-gray',
};
const RECIPIENTS = [
  ['teacher', 'Teacher'],
  ['department', 'Department'],
  ['college', 'College / Institute / School'],
];

const ARCHIVE_LEVELS = [
  ['department', 'Department archives', 'the archives office'],
  ['college', 'College / School / Institute archives', 'the archives office'],
  ['university', 'University archives', 'the archives office'],
];

const fmt = (value, digits = 2) => value === null || value === undefined ? '—' : Number(value).toFixed(digits);
const date = (value) => value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-navy-900 px-3 py-2 text-xs font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50';

export default function ReportsWorkflowPage({ user }) {
  const allowed = VIEW_ROLES.includes(user?.role);
  const canReview = REVIEW_ROLES.includes(user?.role);
  const canAdmin = user?.role === 'admin';
  const canChain = CHAIN_ROLES.includes(user?.role);
  const [cycles, setCycles] = useState([]);
  const [cycleId, setCycleId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [summaries, setSummaries] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 100, total: 0, totalPages: 1 });
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [review, setReview] = useState(null);
  const [reviewError, setReviewError] = useState('');
  const [reopen, setReopen] = useState(null);
  const [reopenError, setReopenError] = useState('');
  const [finalize, setFinalize] = useState(null);
  const [routing, setRouting] = useState(null);
  const [routingError, setRoutingError] = useState('');
  const [routingNotice, setRoutingNotice] = useState('');
  const [distributionNote, setDistributionNote] = useState('');
  const [archiveReference, setArchiveReference] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: '1', limit: '100' });
    if (cycleId) params.set('cycleId', cycleId);
    if (statusFilter) params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());
    return params.toString();
  }, [cycleId, statusFilter, search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const requests = [apiRequest(`/reports/summaries?${query}`)];
      if (REVIEW_ROLES.includes(user?.role) || user?.role === 'admin') {
        requests.push(apiRequest('/workflow/queue'));
      }
      const [summaryResult, queueResult] = await Promise.all(requests);
      const payload = summaryResult?.data;
      setSummaries(Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : []);
      setPagination(payload?.pagination ?? { page: 1, limit: 100, total: (payload?.items ?? payload ?? []).length, totalPages: 1 });
      setQueue(Array.isArray(queueResult?.data) ? queueResult.data : []);
    } catch (err) {
      setError(err.message || 'Unable to load reports and workflow queues.');
    } finally {
      setLoading(false);
    }
  }, [query, user?.role]);

  useEffect(() => {
    if (!allowed) return;
    apiRequest('/cycles').then((result) => setCycles(result?.data?.cycles ?? [])).catch(() => {});
  }, [allowed]);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  if (!allowed) {
    return <section className="rounded-2xl border border-rose-100 bg-white p-8"><h1 className="text-xl font-semibold text-slate-900">Access restricted</h1><p className="mt-2 text-sm text-slate-600">Reports are available only to authorized institutional roles.</p></section>;
  }

  async function submitReview(action) {
    if (action !== 'approved' && !review?.comment?.trim()) {
      setReviewError('Add a comment explaining why this evaluation is returned or rejected.');
      return;
    }
    setSaving(true);
    setReviewError('');
    try {
      await apiRequest(`/workflow/${review.item.evaluation_id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action, comment: review.comment.trim() || null }),
      });
      setReview(null);
      setNotice(`Evaluation ${action}.`);
      await load();
    } catch (err) {
      setReviewError(err.message || 'Unable to record the review.');
    } finally {
      setSaving(false);
    }
  }

  async function submitReopen() {
    if (!reopen?.comment?.trim()) {
      setReopenError('A reason is required to reopen a rejected evaluation.');
      return;
    }
    setSaving(true);
    setReopenError('');
    try {
      await apiRequest(`/workflow/${reopen.item.evaluation_id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ comment: reopen.comment.trim() }),
      });
      setReopen(null);
      setNotice('Rejected evaluation reopened for correction. The assigned evaluator can now revise and resubmit it.');
      await load();
    } catch (err) {
      setReopenError(err.message || 'Unable to reopen this evaluation.');
    } finally {
      setSaving(false);
    }
  }

  async function submitFinalization() {
    if (!finalize?.strengths?.trim() || !finalize?.improvements?.trim()) {
      setReviewError('Complete both final-comment fields from Form E.');
      return;
    }
    setSaving(true);
    setReviewError('');
    try {
      await apiRequest(`/workflow/summaries/${finalize.item.id}/finalize`, {
        method: 'POST',
        body: JSON.stringify({ strengths: finalize.strengths.trim(), improvements: finalize.improvements.trim() }),
      });
      setFinalize(null);
      setNotice('Form E finalized. The college administration can now forward it to the Academic Affairs VP office from the Reporting chain.');
      await load();
    } catch (err) {
      setReviewError(err.message || 'Unable to finalize Form E.');
    } finally {
      setSaving(false);
    }
  }

  async function loadChain(summaryId) {
    const result = await apiRequest(`/workflow/summaries/${summaryId}/routing`);
    setRouting(result.data);
  }

  async function openRouting(item) {
    setRoutingError('');
    setRoutingNotice('');
    setDistributionNote('');
    setArchiveReference('');
    try {
      await loadChain(item.id);
    } catch (err) {
      setError(err.message || 'Unable to load the reporting chain for this summary.');
    }
  }

  async function runChainAction(path, body, successMessage) {
    if (!routing) return;
    setSaving(true);
    setRoutingError('');
    try {
      await apiRequest(`/workflow/summaries/${routing.summary.id}/${path}`, { method: 'POST', body: JSON.stringify(body) });
      await loadChain(routing.summary.id);
      setRoutingNotice(successMessage);
      await load();
    } catch (err) {
      setRoutingError(err.message || 'Unable to record this step.');
    } finally {
      setSaving(false);
    }
  }

  const forwardToVp = () => runChainAction('forward-to-vp', {}, 'The summary was forwarded to the Academic Affairs VP office.');
  const recordCopy = async (recipientType) => {
    await runChainAction(`distribution/${recipientType}/record`, { note: distributionNote.trim() || null }, `${recipientType} copy recorded.`);
    setDistributionNote('');
  };
  const archiveAt = async (level) => {
    await runChainAction(`archive/${level}`, { archiveReference: archiveReference.trim() || null }, `${level} archive recorded.`);
    setArchiveReference('');
  };

  const actions = routing?.actions ?? { canForwardToVp: false, recordCopies: [], archiveLevels: [] };
  const copyOf = (recipientType) => routing?.copies?.find((item) => item.recipientType === recipientType);
  const archiveOf = (level) => routing?.archives?.find((item) => item.level === level);
  const canWriteSomething = actions.canForwardToVp || actions.recordCopies.length > 0 || actions.archiveLevels.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">Institutional reporting</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Reports &amp; workflow</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Review submitted forms, finalize official Form E comments, record the three required report copies, and track forwarding and archive events. This view does not impose an undocumented four-role approval chain.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className={button}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </div>

      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <section className="panel-card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Evaluation review queue</h2>
          <p className="mt-1 text-xs text-slate-500">Committee members and department heads can review submitted forms within their permitted scope. Administrators can reopen rejected forms with a documented reason; reviewers cannot review their own submitted evaluation.</p>
        </div>
        {loading ? <p className="p-8 text-sm text-slate-500">Loading submitted forms…</p> : queue.length === 0 ? <p className="px-6 py-10 text-center text-sm text-slate-500">No evaluation forms are waiting for review or administrator action.</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Instructor</th><th className="px-4 py-3">Evaluator</th><th className="px-4 py-3">Form</th><th className="px-4 py-3">Average</th><th className="px-4 py-3">Submitted</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {queue.map((item) => <tr key={item.evaluation_id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-4 font-medium text-slate-900">{item.instructor_name}</td><td className="px-4 py-4 text-slate-600">{item.evaluator_name}</td><td className="px-4 py-4 text-slate-600">{item.form_code} · {item.form_title}</td><td className="px-4 py-4 tabular-nums">{fmt(item.overall_average)}</td><td className="px-4 py-4">{date(item.submitted_at)}</td>
                  <td className="px-4 py-4"><span className={`status-pill ${item.evaluation_status === 'rejected' ? 'status-gray' : 'status-blue'}`}>{item.evaluation_status}</span></td>
                  <td className="px-4 py-4">{canReview && item.evaluation_status === 'submitted' ? <button type="button" className={button} onClick={() => { setReview({ item, comment: '' }); setReviewError(''); }}>Review form</button> : canAdmin && item.evaluation_status === 'rejected' ? <button type="button" className={button} onClick={() => { setReopen({ item, comment: '' }); setReopenError(''); }}>Reopen</button> : <span className="text-xs text-slate-400">Read-only</span>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 className="text-sm font-semibold text-slate-900">Form E summaries</h2><p className="mt-1 text-xs text-slate-500">A summary becomes final only after all assigned forms are approved and the Committee/Head records the final comments.</p></div>
          <div className="grid gap-2 sm:grid-cols-3">
            <select aria-label="Filter by cycle" value={cycleId} onChange={(event) => setCycleId(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">All cycles</option>{cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.title} ({cycle.academicYear ?? cycle.academic_year})</option>)}</select>
            <select aria-label="Filter by summary status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">All statuses</option><option value="incomplete">Incomplete</option><option value="complete">Complete</option><option value="reviewed">Reviewed</option><option value="archived">Archived</option></select>
            <input aria-label="Search reports" placeholder="Search instructor / unit" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 min-w-48 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-navy-800" />
          </div>
        </div>
        {loading ? <p className="p-8 text-sm text-slate-500">Loading summaries…</p> : summaries.length === 0 ? <p className="px-6 py-10 text-center text-sm text-slate-500">No summaries match these filters.</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Instructor</th><th className="px-4 py-3">Department / college</th><th className="px-4 py-3">Cycle</th><th className="px-4 py-3">Student /40</th><th className="px-4 py-3">Head /35</th><th className="px-4 py-3">Peer /15</th><th className="px-4 py-3">Self /10</th><th className="px-4 py-3">Total /100</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {summaries.map((row) => <tr key={row.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-4 font-medium text-slate-900">{row.instructor_name}</td>
                  <td className="px-4 py-4 text-slate-600">{row.department_name || 'Department not configured'}<span className="block text-xs text-slate-400">{row.faculty_name || 'College not configured'}</span></td>
                  <td className="px-4 py-4 text-slate-600">{row.cycle_title}<span className="block text-xs text-slate-400">{row.academic_year}</span></td>
                  <td className="px-4 py-4 tabular-nums">{fmt(row.student_average)}</td><td className="px-4 py-4 tabular-nums">{fmt(row.department_head_average)}</td><td className="px-4 py-4 tabular-nums">{fmt(row.peer_average)}</td><td className="px-4 py-4 tabular-nums">{fmt(row.self_average)}</td>
                  <td className="px-4 py-4 font-semibold tabular-nums">{['reviewed', 'archived'].includes(row.status) ? fmt(row.total_score) : '—'}</td>
                  <td className="px-4 py-4"><span className={`status-pill ${SUMMARY_TONE[row.status] || 'status-gray'}`}>{row.status}</span><span className="mt-1 block text-xs text-slate-400">{row.approved_assignments}/{row.total_assignments} forms approved</span></td>
                  <td className="min-w-52 px-4 py-4"><div className="flex flex-wrap gap-2">
                    <button type="button" className={button} onClick={() => window.location.assign(`/final-report?summaryId=${row.id}`)}><FileText size={13} /> Form E</button>
                    {canReview && row.status === 'complete' && row.all_evaluations_approved && <button type="button" className={primaryButton} onClick={() => { setFinalize({ item: row, strengths: '', improvements: '' }); setReviewError(''); }}>Finalize</button>}
                    {canChain && ['reviewed', 'archived'].includes(row.status) && <button type="button" className={button} onClick={() => openRouting(row)}><Send size={13} /> Reporting chain</button>}
                    {row.status === 'complete' && !row.all_evaluations_approved && <span className="text-xs text-amber-700">Awaiting form review</span>}
                  </div></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500"><span>{pagination.total} summaries · page {pagination.page} of {Math.max(1, pagination.totalPages)}</span><span>Category-level weights are not defined by the supplied official forms; Form E will flag them instead of inventing allocations.</span></div>
      </section>

      {review && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="review-title"><div className="panel-card w-full max-w-xl space-y-4 p-6">
        <h2 id="review-title" className="text-lg font-semibold text-slate-900">Review submitted form</h2><p className="text-sm text-slate-600">{review.item.form_title} for <strong>{review.item.instructor_name}</strong>. Average {fmt(review.item.overall_average)} / 5.</p>
        <label className="block text-sm font-medium text-slate-700">Review comment <span className="font-normal text-slate-400">(required for Return or Reject)</span><textarea rows={4} maxLength={10000} value={review.comment} onChange={(event) => setReview((current) => ({ ...current, comment: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-navy-800" /></label>
        {reviewError && !finalize && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{reviewError}</p>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} disabled={saving} onClick={() => setReview(null)}>Cancel</button><button type="button" className={primaryButton} disabled={saving} onClick={() => submitReview('approved')}>Approve form</button><button type="button" className={button} disabled={saving} onClick={() => submitReview('returned')}>Return</button><button type="button" className={`${button} border-rose-200 text-rose-700`} disabled={saving} onClick={() => submitReview('rejected')}>Reject</button></div>
      </div></div>}

      {reopen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="reopen-title"><div className="panel-card w-full max-w-xl space-y-4 p-6">
        <h2 id="reopen-title" className="text-lg font-semibold text-slate-900">Reopen rejected evaluation</h2><p className="text-sm text-slate-600">{reopen.item.form_title} for <strong>{reopen.item.instructor_name}</strong>. Record why this rejected submission is being reopened.</p>
        <label className="block text-sm font-medium text-slate-700">Reason for reopening<textarea rows={4} maxLength={10000} required value={reopen.comment} onChange={(event) => setReopen((current) => ({ ...current, comment: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-navy-800" /></label>
        {reopenError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{reopenError}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={button} disabled={saving} onClick={() => setReopen(null)}>Cancel</button><button type="button" className={primaryButton} disabled={saving} onClick={submitReopen}>Reopen for correction</button></div>
      </div></div>}

      {finalize && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="finalize-title"><div className="panel-card w-full max-w-2xl space-y-4 p-6">
        <h2 id="finalize-title" className="text-lg font-semibold text-slate-900">Finalize official Form E</h2><p className="text-sm text-slate-600">{finalize.item.instructor_name} · {finalize.item.cycle_title}. Both final-comment sections are required.</p>
        <label className="block text-sm font-medium text-slate-700">Appreciable strengths of the teacher<textarea rows={3} maxLength={10000} value={finalize.strengths} onChange={(event) => setFinalize((current) => ({ ...current, strengths: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-navy-800" /></label>
        <label className="block text-sm font-medium text-slate-700">Points to be improved<textarea rows={3} maxLength={10000} value={finalize.improvements} onChange={(event) => setFinalize((current) => ({ ...current, improvements: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-navy-800" /></label>
        {reviewError && finalize && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{reviewError}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={button} disabled={saving} onClick={() => setFinalize(null)}>Cancel</button><button type="button" className={primaryButton} disabled={saving} onClick={submitFinalization}><CheckCircle2 size={14} /> Finalize Form E</button></div>
      </div></div>}

      {routing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="routing-title"><div className="panel-card max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4"><div><h2 id="routing-title" className="text-lg font-semibold text-slate-900">Reporting chain</h2><p className="mt-1 text-sm text-slate-500">{routing.summary.instructorName} · {routing.summary.cycleTitle}</p></div><button className={button} onClick={() => setRouting(null)}>Close</button></div>
        {routingError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{routingError}</p>}{routingNotice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{routingNotice}</p>}

        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-900">1. College / School / Institute administration</h3>
          <p className="text-xs text-slate-500">Receives the final summary and forwards it to the Academic Affairs VP office or Campus Academic Vice Director.</p>
          {routing.forwardedToVp
            ? <p className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 size={14} /> Forwarded on {date(routing.forwardedToVp.at)} by {routing.forwardedToVp.byName || 'the college administration'}</p>
            : <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-amber-700">Waiting for the college administration to forward this summary.</span>{actions.canForwardToVp && <button type="button" disabled={saving} className={primaryButton} onClick={forwardToVp}><Send size={14} /> Forward to the Academic Affairs VP office</button>}</div>}
        </section>

        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-900">2. Copies provided by the Academic Affairs VP office</h3>
          {RECIPIENTS.map(([type, label]) => { const item = copyOf(type); return <div key={type} className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-slate-800">{label} copy</p><p className="text-xs text-slate-500">{item?.recorded ? `Recorded ${date(item.recordedAt)} by ${item.recordedByName || 'the VP office'}` : routing.forwardedToVp ? 'Pending record of the copy' : 'Available after the college forwards the summary'}</p></div>{item?.recorded ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} /> Recorded</span> : actions.recordCopies.includes(type) ? <button type="button" disabled={saving} className={button} onClick={() => recordCopy(type)}>Mark copy recorded</button> : <span className="text-xs text-slate-400">Pending</span>}</div>; })}
          {actions.recordCopies.length > 0 && <label className="block text-sm font-medium text-slate-700">Distribution note (optional)<input value={distributionNote} onChange={(event) => setDistributionNote(event.target.value)} maxLength={1000} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" placeholder="e.g. physical copy handed to the department office" /></label>}
        </section>

        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-900">3. Archives</h3>
          <p className="text-xs text-slate-500">The record is archived at three levels. The summary is marked Archived when all three are recorded.</p>
          {ARCHIVE_LEVELS.map(([level, label, owner]) => { const item = archiveOf(level); return <div key={level} className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-slate-800">{label}</p><p className="text-xs text-slate-500">{item?.archived ? `Archived ${date(item.archivedAt)} by ${item.archivedByName || owner}${item.reference ? ` · Ref. ${item.reference}` : ''}` : routing.forwardedToVp ? `Waiting for: ${owner}` : 'Available after the college forwards the summary'}</p></div>{item?.archived ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Archive size={14} /> Archived</span> : actions.archiveLevels.includes(level) ? <button type="button" disabled={saving} className={primaryButton} onClick={() => archiveAt(level)}><Archive size={14} /> Record archive</button> : <span className="text-xs text-slate-400">Pending</span>}</div>; })}
          {actions.archiveLevels.length > 0 && <label className="block text-sm font-medium text-slate-700">Archive reference (optional)<input value={archiveReference} onChange={(event) => setArchiveReference(event.target.value)} maxLength={120} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" placeholder="Registry / archive reference" /></label>}
        </section>

        {!canWriteSomething && routing.summary.status !== 'archived' && <p className="flex items-start gap-2 text-xs text-slate-600"><ShieldAlert size={15} className="mt-0.5 shrink-0" />You have no step to take on this report right now. Steps appear here when it is your role's turn.</p>}
        {routing.summary.status === 'archived' && <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} /> This report is archived at all three levels.</p>}
      </div></div>}
    </div>
  );
}