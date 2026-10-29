import { useEffect, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { apiRequest } from '../services/api.js';

const TONE = {
  done: ['status-green', 'Done'],
  in_progress: ['status-blue', 'In progress'],
  ready: ['status-amber', 'Ready for the next action'],
  blocked: ['status-gray', 'Waiting for an earlier step'],
  not_started: ['status-gray', 'Not started'],
};

const GROUP_LABEL = { student: 'Students', department_head: 'Department head', peer: 'Peers', self: 'Self' };

function detailText(stage) {
  const d = stage.detail;
  if (!d) return null;
  if (stage.key === 'evaluations') {
    return d.groups
      .map((g) => `${GROUP_LABEL[g.type] || g.type}: ${g.approved}/${g.assigned} approved`)
      .join(' · ');
  }
  if (stage.key === 'copies' || stage.key === 'archive') return `${d.recorded.length} of ${d.total} recorded`;
  if (stage.key === 'improvement') {
    return d.referrals ? `${d.referrals} referral(s), ${d.acknowledged} acknowledged` : 'No referral has been made';
  }
  return null;
}

// Traces one evaluation summary through the official workflow. Read-only.
export default function LifecycleTimeline({ summaryId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    apiRequest(`/lifecycle/summaries/${summaryId}`)
      .then((result) => {
        if (active) setData(result.data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load the workflow trace.');
      });
    return () => {
      active = false;
    };
  }, [summaryId]);

  if (error) return <p className="text-sm text-rose-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading workflow trace…</p>;

  return (
    <div>
      <ol className="space-y-3">
        {data.stages.map((stage) => {
          const [tone, text] = TONE[stage.state] || TONE.not_started;
          const detail = detailText(stage);
          return (
            <li key={stage.key} className="flex gap-3">
              {stage.state === 'done' ? (
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <Circle size={18} className="mt-0.5 shrink-0 text-slate-300" aria-hidden="true" />
              )}
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {stage.label} <span className={`status-pill ${tone} ml-1`}>{text}</span>
                </p>
                {detail && <p className="text-xs text-slate-500">{detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        {data.endReached
          ? 'Every stage of the workflow is complete for this summary.'
          : 'The workflow is not complete yet.'}{' '}
        This indicator is calculated from the records above; it is not an official status.
      </p>
    </div>
  );
}