import { confirmAction } from '../utils/confirmAction.js';
﻿import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Send } from 'lucide-react';
import {
  LEADERSHIP_TYPES,
  getLeadershipEvaluation,
  listLeadershipEvaluations,
  saveLeadershipDraft,
  submitLeadershipEvaluation,
} from '../services/leadershipApi.js';
import {
  EmptyBlock, ErrorBanner, LoadingBlock, Pagination, StatusPill, SuccessBanner, formatDate,
} from './StateBlocks.jsx';

const PAGE_SIZE = 10;

function EvaluationForm({ id, user, onBack }) {
  const [evaluation, setEvaluation] = useState(null);
  const [answers, setAnswers] = useState({});
  const [comments, setComments] = useState({ strengths: '', improvements: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [missing, setMissing] = useState([]);

  const hydrate = useCallback((data) => {
    setEvaluation(data);
    setAnswers(Object.fromEntries(data.criteria.filter((c) => c.answered).map((c) => [c.id, { score: c.score, isNa: c.isNa }])));
    setComments({ strengths: data.commentStrengths || '', improvements: data.commentImprovements || '' });
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getLeadershipEvaluation(id)
      .then((data) => { if (active) hydrate(data); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, hydrate]);

  const sections = useMemo(() => {
    const groups = [];
    (evaluation?.criteria || []).forEach((criterion) => {
      const title = criterion.sectionTitle || '';
      const last = groups[groups.length - 1];
      if (last && last.title === title) last.items.push(criterion);
      else groups.push({ title, items: [criterion] });
    });
    return groups;
  }, [evaluation]);

  if (loading) return <LoadingBlock label="Loading evaluationâ€¦" />;
  if (!evaluation) return (<><ErrorBanner message={error} /><button type="button" className="mt-4 text-sm font-medium underline" onClick={onBack}>Back to the list</button></>);

  const { form } = evaluation;
  const readOnly = evaluation.status === 'submitted' || evaluation.cycleStatus !== 'active'
    || user?.role === 'admin' || Number(user?.id) !== evaluation.evaluatorId;
  const scale = Array.from({ length: form.scaleMax - form.scaleMin + 1 }, (_, i) => form.scaleMin + i);
  const answeredCount = evaluation.criteria.filter((c) => answers[c.id]).length;

  const setAnswer = (criterionId, value) => {
    setAnswers({ ...answers, [criterionId]: value });
    setMissing(missing.filter((m) => m !== criterionId));
  };

  const payload = () => ({
    scores: Object.entries(answers).map(([criterionId, a]) => (
      a.isNa ? { criterionId: Number(criterionId), isNa: true } : { criterionId: Number(criterionId), score: a.score }
    )),
    commentStrengths: comments.strengths.trim() || null,
    commentImprovements: comments.improvements.trim() || null,
  });

  async function saveDraft() {
    setBusy('save'); setError(''); setMessage('');
    try {
      await saveLeadershipDraft(id, payload());
      setMessage('Draft saved. You can continue later.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function submit() {
    const unanswered = evaluation.criteria.filter((c) => !answers[c.id]).map((c) => c.id);
    if (unanswered.length) {
      setMissing(unanswered);
      setError(`${unanswered.length} of ${evaluation.criteria.length} criteria are still unanswered.`);
      return;
    }
    if (!await confirmAction('Submit this evaluation? Once submitted it cannot be changed.')) return;
    setBusy('submit'); setError(''); setMessage('');
    try {
      await submitLeadershipEvaluation(id, payload());
      hydrate(await getLeadershipEvaluation(id));
      setMessage('Evaluation submitted. Thank you.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
        <ArrowLeft size={16} /> Back to the list
      </button>

      <header className="panel-card flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{LEADERSHIP_TYPES[evaluation.type]?.label}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Evaluatee: <strong>{evaluation.evaluateeName}</strong> Â· Evaluator: {evaluation.evaluatorName}
          </p>
          <p className="text-sm text-slate-500">{evaluation.cycleTitle} ({evaluation.academicYear}) Â· form version {form.versionNo}</p>
        </div>
        <div className="text-right text-sm">
          <StatusPill status={evaluation.status} />
          <div className="mt-2 text-slate-500">{answeredCount} of {evaluation.criteria.length} answered</div>
        </div>
      </header>

      {readOnly && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700" role="note">
          {evaluation.status === 'submitted'
            ? `This evaluation was submitted on ${formatDate(evaluation.submittedAt)} and can no longer be changed.`
            : evaluation.cycleStatus !== 'active'
              ? 'The evaluation cycle is not active, so this evaluation is read-only.'
              : 'You are viewing this evaluation read-only.'}
        </div>
      )}
      <ErrorBanner message={error} />
      <SuccessBanner message={message} />

      {form.instructions && (
        <div className="panel-card whitespace-pre-line p-5 text-sm text-slate-700">{form.instructions}</div>
      )}
      <p className="text-sm text-slate-600">
        Score each criterion from {form.scaleMin} (lowest) to {form.scaleMax} (highest){form.allowNa ? ', or mark it not applicable' : ''}.
      </p>

      {sections.map((section, sectionIndex) => (
        <section key={`${section.title}-${sectionIndex}`} className="panel-card">
          {section.title && <h2 className="border-b border-slate-200 px-5 py-3 text-base font-semibold text-slate-900">{section.title}</h2>}
          <div className="divide-y divide-slate-100">
            {section.items.map((criterion) => {
              const answer = answers[criterion.id];
              const flagged = missing.includes(criterion.id);
              return (
                <fieldset key={criterion.id} disabled={readOnly || Boolean(busy)}
                  className={`p-5 ${flagged ? 'bg-rose-50' : ''}`}>
                  <legend className="mb-3 text-sm font-medium text-slate-900">{criterion.text}</legend>
                  <div className="flex flex-wrap gap-2">
                    {scale.map((value) => (
                      <label key={value} className={`inline-flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium ${
                        answer && !answer.isNa && answer.score === value ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                        <input type="radio" className="sr-only" name={`criterion-${criterion.id}`} checked={Boolean(answer && !answer.isNa && answer.score === value)}
                          onChange={() => setAnswer(criterion.id, { score: value, isNa: false })} />
                        {value}
                      </label>
                    ))}
                    {form.allowNa && (
                      <label className={`inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium ${
                        answer?.isNa ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                        <input type="radio" className="sr-only" name={`criterion-${criterion.id}`} checked={Boolean(answer?.isNa)}
                          onChange={() => setAnswer(criterion.id, { score: null, isNa: true })} />
                        N/A
                      </label>
                    )}
                  </div>
                  {flagged && <p className="mt-2 text-xs font-medium text-rose-700">An answer is required.</p>}
                </fieldset>
              );
            })}
          </div>
        </section>
      ))}

      <section className="panel-card grid gap-4 p-5 md:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">Strengths
          <textarea rows={4} maxLength={10000} readOnly={readOnly} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
            value={comments.strengths} onChange={(e) => setComments({ ...comments, strengths: e.target.value })} />
        </label>
        <label className="block text-sm font-medium text-slate-700">Areas for improvement
          <textarea rows={4} maxLength={10000} readOnly={readOnly} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
            value={comments.improvements} onChange={(e) => setComments({ ...comments, improvements: e.target.value })} />
        </label>
      </section>

      {!readOnly && (
        <div className="flex flex-wrap gap-3">
          <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800"
            disabled={Boolean(busy)} onClick={saveDraft}><Save size={16} /> {busy === 'save' ? 'Savingâ€¦' : 'Save draft'}</button>
          <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={submit}>
            <Send size={16} /> {busy === 'submit' ? 'Submittingâ€¦' : 'Submit evaluation'}
          </button>
        </div>
      )}
    </div>
  );
}

function EvaluationList({ onOpen }) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setResult(await listLeadershipEvaluations({ status, page, pageSize: PAGE_SIZE }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Leadership evaluations</h1>
        <p className="mt-1 text-sm text-slate-600">Evaluations assigned to you. Open one to score it, save a draft, and submit when complete.</p>
      </header>
      <ErrorBanner message={error} onRetry={load} />
      <section className="panel-card">
        <div className="border-b border-slate-200 p-4">
          <label className="text-sm font-medium text-slate-700">Status
            <select className="ml-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All</option><option value="draft">Draft</option><option value="submitted">Submitted</option>
            </select>
          </label>
        </div>
        {loading ? <LoadingBlock label="Loading your evaluationsâ€¦" /> : result.items.length === 0 ? (
          <EmptyBlock title="No evaluations assigned">When an administrator assigns you an evaluation it will appear here.</EmptyBlock>
        ) : (
          <ul className="divide-y divide-slate-100">
            {result.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-medium text-slate-900">{item.evaluateeName}</div>
                  <div className="text-sm text-slate-500">{LEADERSHIP_TYPES[item.type]?.label} Â· {item.cycleTitle} ({item.academicYear})</div>
                  <div className="mt-1 text-xs text-slate-500">{item.answeredCriteria} of {item.totalCriteria} criteria answered</div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill status={item.status} />
                  <button type="button" className="primary-button" onClick={() => onOpen(item.id)}>
                    {item.status === 'draft' ? 'Open' : 'View'}
                  </button>
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

export default function LeadershipEvaluationsPage({ user }) {
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  if (openId && /^[1-9]\d*$/.test(openId)) {
    return <EvaluationForm key={openId} id={Number(openId)} user={user} onBack={() => setParams({})} />;
  }
  return <EvaluationList onOpen={(id) => setParams({ open: String(id) })} />;
}
