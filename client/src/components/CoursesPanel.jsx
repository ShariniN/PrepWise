import React, { useCallback, useContext, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api, { errorMessage } from '../api/client';
import { AppContext } from '../context/AppContext';
import { ROLES } from '../utils/roles';
import CourseCard from './CourseCard';
import { Button, Card, EmptyState, Field, Input, Skeleton } from './ui';

// Courses list plus "create course", for lecturers and university admins.
// Career officers can see courses only if the API returns any (it returns none for them).
const CoursesPanel = () => {
  const { role } = useContext(AppContext);
  const canManage = role === ROLES.LECTURER || role === ROLES.ADMIN;

  const [courses, setCourses] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ code: '', title: '', description: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/courses/mine');
      setCourses(data.courses || []);
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Could not load courses'));
      setCourses((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!form.code.trim() || !form.title.trim()) return toast.error('Code and title are required');
    setBusy(true);
    try {
      await api.post('/api/courses', {
        code: form.code.trim(),
        title: form.title.trim(),
        description: form.description.trim() || undefined,
      });
      toast.success('Course created');
      setForm({ code: '', title: '', description: '' });
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create course'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="courses-heading" className="space-y-5">
      <h2 id="courses-heading" className="font-display text-2xl font-semibold text-ink">Courses and cohorts</h2>

      {canManage && (
        <Card as="form" onSubmit={create}>
          <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <Field label="Course code">
              {(p) => <Input {...p} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CS101" />}
            </Field>
            <Field label="Title">
              {(p) => <Input {...p} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label="Description (optional)">
              {(p) => <Input {...p} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
            </Field>
            <Button type="submit" loading={busy}>Create course</Button>
          </div>
        </Card>
      )}

      {error && <p role="alert" className="rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}

      {courses === null ? (
        <div role="status" className="space-y-3">
          <Skeleton className="h-32 w-full" rounded="rounded-3xl" />
          <span className="sr-only">Loading courses...</span>
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          title={canManage ? 'No courses yet' : 'No courses'}
          description={canManage ? 'No courses yet. Create your first course above.' : 'No courses are assigned to you yet.'}
        />
      ) : (
        <div className="space-y-4">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} canManage={canManage} isAdmin={role === ROLES.ADMIN} onChanged={load} />
          ))}
        </div>
      )}
    </section>
  );
};

export default CoursesPanel;
