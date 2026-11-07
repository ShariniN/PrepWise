import React, { useState } from 'react';
import CoursesPanel from '../CoursesPanel';
import CourseCohortPicker from './CourseCohortPicker';
import FailurePatterns from './FailurePatterns';
import TopicHeatmap from './TopicHeatmap';
import StudentsNeedingHelp from './StudentsNeedingHelp';
import QuestionQuality from './QuestionQuality';
import ActivityTab from './ActivityTab';

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
  const current = TABS.find((t) => t.id === tab);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Lecturer views" className="flex flex-wrap gap-1 border-b border-gray-300">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium rounded-t-md ${tab === t.id ? 'bg-white text-indigo-700 border border-b-white border-gray-300 -mb-px' : 'text-gray-600 hover:text-indigo-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'courses' ? (
        <CoursesPanel />
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow p-4">
            <CourseCohortPicker value={scope} onChange={setScope} />
          </div>
          <div className="bg-white rounded-2xl shadow p-6" role="tabpanel">
            {scope.courseId
              ? <current.Comp key={tab} courseId={scope.courseId} cohortId={scope.cohortId} />
              : <p className="text-sm text-gray-500">Choose a course to see this view.</p>}
          </div>
        </>
      )}
    </div>
  );
};

export default LecturerDashboard;
