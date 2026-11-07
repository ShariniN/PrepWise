import React, { useState } from 'react';
import CoursesPanel from '../CoursesPanel';
import CourseCohortPicker from './CourseCohortPicker';
import FailurePatterns from './FailurePatterns';
import TopicHeatmap from './TopicHeatmap';
import StudentsNeedingHelp from './StudentsNeedingHelp';
import QuestionQuality from './QuestionQuality';
import ActivityTab from './ActivityTab';
import { Card, Tabs, TabPanel } from '../ui';

const TABS = [
  { id: 'reteach', label: 'What to re-teach', Comp: FailurePatterns },
  { id: 'heatmap', label: 'Topic heatmap', Comp: TopicHeatmap },
  { id: 'contact', label: 'Who to contact', Comp: StudentsNeedingHelp },
  { id: 'quality', label: 'Question quality', Comp: QuestionQuality },
  { id: 'activity', label: 'Activity', Comp: ActivityTab },
  { id: 'courses', label: 'Courses', Comp: null },
];

const LecturerDashboard = () => {
  const [tab, setTab] = useState('reteach');
  const [scope, setScope] = useState({ courseId: '', cohortId: '' });
  const Current = TABS.find((t) => t.id === tab).Comp;

  return (
    <div className="space-y-5">
      <Tabs tabs={TABS.map(({ id, label }) => ({ id, label }))} value={tab} onChange={setTab} idBase="lect" ariaLabel="Lecturer views" />

      {tab === 'courses' ? (
        <TabPanel id="courses" value={tab} idBase="lect"><CoursesPanel /></TabPanel>
      ) : (
        <>
          <Card tone="sand" className="!p-4">
            <CourseCohortPicker value={scope} onChange={setScope} />
          </Card>
          <TabPanel id={tab} value={tab} idBase="lect">
            <Card>
              {scope.courseId
                ? <Current key={tab} courseId={scope.courseId} cohortId={scope.cohortId} />
                : <p className="text-sm text-ink-2">Choose a course to see this view.</p>}
            </Card>
          </TabPanel>
        </>
      )}
    </div>
  );
};

export default LecturerDashboard;
