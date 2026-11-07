import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import CoursesPanel from '../components/CoursesPanel';
import UsageHeader from '../components/people/UsageHeader';
import PeopleTable from '../components/people/PeopleTable';
import InviteForm from '../components/people/InviteForm';
import ImportCsv from '../components/people/ImportCsv';
import { Tabs, TabPanel } from '../components/ui';
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
    <AppShell
      title="Manage your university"
      subtitle={<Link to="/admin-overview" className="font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800">Adoption and renewal overview</Link>}
    >
      <div className="space-y-6">
        <Tabs tabs={TABS} value={tab} onChange={setTab} idBase="mp" ariaLabel="Sections" />

        <TabPanel id="people" value={tab} idBase="mp" className="space-y-6">
          <UsageHeader usage={usage} error={usage ? '' : usageError} />
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <InviteForm onDone={refresh} />
            <ImportCsv onDone={refresh} />
          </div>
          <PeopleTable people={people} loading={loading} error={peopleError} filters={filters} setFilters={setFilters} onChanged={refresh} />
        </TabPanel>
        <TabPanel id="courses" value={tab} idBase="mp">
          <CoursesPanel />
        </TabPanel>
      </div>
    </AppShell>
  );
};

export default ManagePeople;
