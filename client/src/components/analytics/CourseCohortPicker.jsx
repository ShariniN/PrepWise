import React, { useEffect, useState } from 'react';
import api, { errorMessage } from '../../api/client';

const selectCls = 'bg-gray-100 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400';

// Loads GET /api/courses/mine and reports { courseId, cohortId } upward.
// With includeAllCourses (career officer / admin) a "All programmes" option is offered.
const CourseCohortPicker = ({ value, onChange, includeAllCourses = false }) => {
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get('/api/courses/mine')
      .then(({ data }) => {
        if (cancelled) return;
        const list = data.courses || [];
        setCourses(list);
        if (list.length && !value.courseId && !includeAllCourses) onChange({ courseId: list[0].id, cohortId: '' });
      })
      .catch((e) => { if (!cancelled) { setError(errorMessage(e, 'Could not load courses')); setCourses([]); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (courses === null) return <p className="text-sm text-gray-500" role="status">Loading courses...</p>;
  if (error) return <p className="text-sm text-red-600" role="alert">{error}</p>;
  if (!courses.length && !includeAllCourses) {
    return <p className="text-sm text-gray-500">You have no courses yet. Create one in the Courses tab first.</p>;
  }

  const course = courses.find((c) => c.id === value.courseId);
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <label className="text-sm text-gray-600">
        <span className="block mb-1">Course</span>
        <select className={selectCls} value={value.courseId} onChange={(e) => onChange({ courseId: e.target.value, cohortId: '' })}>
          {includeAllCourses && <option value="">All programmes</option>}
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.title}</option>)}
        </select>
      </label>
      {(!includeAllCourses || value.courseId) && (
        <label className="text-sm text-gray-600">
          <span className="block mb-1">Cohort</span>
          <select className={selectCls} value={value.cohortId} onChange={(e) => onChange({ ...value, cohortId: e.target.value })}>
            <option value="">All cohorts</option>
            {(course?.cohorts || []).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
};

export default CourseCohortPicker;
