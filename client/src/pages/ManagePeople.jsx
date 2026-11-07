import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import NavBar from '../components/NavBar';
import CoursesPanel from '../components/CoursesPanel';
import UsageHeader from '../components/people/UsageHeader';
import PeopleTable from '../components/people/PeopleTable';
import InviteForm from '../components/people/InviteForm';
import ImportCsv from '../components/people/ImportCsv';
import api, { errorMessage } from '../api/client';

const TABS = [
  { id: 'people', label: 'People' },
  { id: 'courses', label: 'Courses' },
];

const ManagePeople = () => {
  const [tab, setTab] = useState('people');
  const [usage, setUsage] = useState(null);
  const [usageError, setUsageError] = useState('');
  const [people, setPeople] = useState(null);
  const [peopleError, setPeopleError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', role: '', status: '' });
  const [debounced, setDebounced] = useState(filters);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), 250);
    return () => clearTimeout(t);
  }, [filters]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = {};
        if (debounced.search.trim()) params.search = debounced.search.trim();
        if (debounced.role) params.role = debounced.role;
        if (debounced.status) params.status = debounced.status;
        const { data } = await api.get('/api/institution/people', { params });
        if (cancelled) return;
        setPeople(data.people);
        if (data.usage) setUsage(data.usage);
        setPeopleError('');
        setUsageError('');
      } catch (err) {
        if (!cancelled) setPeopleError(errorMessage(err, 'Could not load people'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debounced, tick]);

  // Usage also has its own endpoint; use it to refresh the header after changes
  // and as a fallback if the people request failed.
  useEffect(() => {
    let cancelled = false;
    api.get('/api/institution/usage')
      .then(({ data }) => { if (!cancelled) { setUsage(data); setUsageError(''); } })
      .catch((err) => { if (!cancelled) setUsageError(errorMessage(err, 'Could not load usage')); });
    return () => { cancelled = true; };
  }, [tick]);

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Manage your university</h1>
        <p className="text-sm text-gray-600">
          <Link to="/admin-overview" className="text-indigo-700 underline">Adoption and renewal overview</Link>
        </p>

        <div role="tablist" aria-label="Sections" className="flex gap-2 border-b border-gray-300">
          {TABS.map((t) => (
            <button
              key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'people' ? (
          <div role="tabpanel" id="panel-people" aria-labelledby="tab-people" className="space-y-6">
            <UsageHeader usage={usage} error={usage ? '' : usageError} />
            <div className="grid gap-6 lg:grid-cols-2">
              <InviteForm onDone={refresh} />
              <ImportCsv onDone={refresh} />
            </div>
            <PeopleTable people={people} loading={loading} error={peopleError} filters={filters} setFilters={setFilters} onChanged={refresh} />
          </div>
        ) : (
          <div role="tabpanel" id="panel-courses" aria-labelledby="tab-courses">
            <CoursesPanel />
          </div>
        )}
      </main>
    </div>
  );
};

export default ManagePeople;
