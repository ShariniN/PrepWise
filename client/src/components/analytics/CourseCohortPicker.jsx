import React, { useEffect, useState } from 'react';
import api, { errorMessage } from '../../api/client';
import { Field, Select, Skeleton } from '../ui';

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

  if (courses === null) return <div role="status" aria-label="Loading courses"><Skeleton className="h-11 w-64" rounded="rounded-2xl" /></div>;
  if (error) return <p className="text-sm text-danger-600" role="alert">{error}</p>;
  if (!courses.length && !includeAllCourses) {
    return <p className="text-sm text-ink-2">You have no courses yet. Create one in the Courses tab first.</p>;
  }

  const course = courses.find((c) => c.id === value.courseId);
  return (
    <div className="grid gap-4 sm:flex sm:flex-wrap sm:items-end">
      <Field label="Course" className="sm:min-w-[16rem]">
        {(p) => (
          <Select {...p} value={value.courseId} onChange={(e) => onChange({ courseId: e.target.value, cohortId: '' })}>
            {includeAllCourses && <option value="">All programmes</option>}
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.title}</option>)}
          </Select>
        )}
      </Field>
      {(!includeAllCourses || value.courseId) && (
        <Field label="Cohort" className="sm:min-w-[12rem]">
          {(p) => (
            <Select {...p} value={value.cohortId} onChange={(e) => onChange({ ...value, cohortId: e.target.value })}>
              <option value="">All cohorts</option>
              {(course?.cohorts || []).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </Select>
          )}
        </Field>
      )}
    </div>
  );
};

export default CourseCohortPicker;
