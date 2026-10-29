import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Tabs from '../components/Tabs.jsx';
import { EmptyBlock } from '../components/StateBlocks.jsx';
import LeadershipAssignmentsPage from './LeadershipAssignmentsPage.jsx';
import LeadershipEvaluationsPage from './LeadershipEvaluationsPage.jsx';
import LeadershipFormsPage from './LeadershipFormsPage.jsx';

// One menu entry ("Leadership evaluations", /leadership) for every role that uses it:
//   - dean and academic_vp fill in the evaluations assigned to them,
//   - admin manages the forms and the assignments and can open any evaluation read-only.
const TABS = [
  { key: 'assignments', label: 'Assignments & progress' },
  { key: 'forms', label: 'Evaluation forms' },
];

export default function LeadershipHubPage({ user }) {
  const [params] = useSearchParams();
  const [tab, setTab] = useState('assignments');
  const role = user?.role;

  // An evaluation is open (dean, VP, or an administrator viewing one): show the evaluation itself.
  if (role === 'dean' || role === 'academic_vp' || (role === 'admin' && params.get('open'))) {
    return <LeadershipEvaluationsPage user={user} />;
  }

  if (role === 'admin') {
    return (
      <div className="space-y-6">
        <Tabs tabs={TABS} active={tab} onChange={setTab} label="Leadership evaluations" />
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'assignments' ? <LeadershipAssignmentsPage /> : <LeadershipFormsPage />}
        </div>
      </div>
    );
  }

  return (
    <section className="panel-card">
      <EmptyBlock title="Leadership evaluations">
        These evaluations are completed by deans (of department heads) and by the Academic Affairs Vice President
        (of deans), and managed by administrators.
      </EmptyBlock>
    </section>
  );
}