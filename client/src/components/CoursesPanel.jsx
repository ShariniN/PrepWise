import React, { useCallback, useContext, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api, { errorMessage } from '../api/client';
import { AppContext } from '../context/AppContext';
import { ROLES } from '../utils/roles';
import CourseCard from './CourseCard';

const inputCls = 'w-full bg-gray-100 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400';

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
    <section aria-labelledby="courses-heading" className="space-y-4">
      <h2 id="courses-heading" className="text-xl font-bold text-gray-800">Courses and cohorts</h2>

      {canManage && (
        <form onSubmit={create} className="bg-white rounded-xl shadow p-5 grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label htmlFor="course-code" className="block text-sm font-medium text-gray-700 mb-1">Course code</label>
            <input id="course-code" className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CS101" />
          </div>
          <div className="sm:col-span-4">
            <label htmlFor="course-title" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input id="course-title" className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="sm:col-span-5">
            <label htmlFor="course-desc" className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <input id="course-desc" className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="sm:col-span-1 flex items-end">
            <button type="submit" disabled={busy} className="w-full px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
              Create course
            </button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-md p-3">{error}</p>}

      {courses === null ? (
        <p className="text-sm text-gray-500" role="status">Loading courses...</p>
      ) : courses.length === 0 ? (
        <p className="text-sm text-gray-500 bg-white rounded-xl shadow p-5">
          {canManage ? 'No courses yet. Create your first course above.' : 'No courses are assigned to you yet.'}
        </p>
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
