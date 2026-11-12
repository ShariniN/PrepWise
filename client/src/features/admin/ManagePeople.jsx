import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import UsageHeader from './components/UsageHeader';
import PeopleTable from './components/PeopleTable';
import InviteForm from './components/InviteForm';
import ImportCsv from './components/ImportCsv';
import api, { errorMessage } from '../../lib/apiClient';

const ManagePeople = () => {
  const [usage, setUsage] = useState(null);
  const [usageError, setUsageError] = useState('');
  const [people, setPeople] = useState(null);
  const [peopleError, setPeopleError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', role: '', status: '', group: '' });
  const [groups, setGroups] = useState([]);
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
        if (debounced.group) params.group = debounced.group;
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

  // Every group in use, for the filter and the suggestions (from an unfiltered list, so filtering never hides a group).
  useEffect(() => {
    let cancelled = false;
    api.get('/api/institution/people')
      .then(({ data }) => {
        if (cancelled) return;
        setGroups([...new Set((data.people || []).map((p) => (p.group || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tick]);

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
      subtitle={<Link to="/dashboard" className="font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800">Student progress and seat usage are on the dashboard</Link>}
    >
      <datalist id="people-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
      <div className="space-y-6">
        <UsageHeader usage={usage} error={usage ? '' : usageError} />
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <InviteForm onDone={refresh} />
          <ImportCsv onDone={refresh} />
        </div>
        <PeopleTable people={people} loading={loading} error={peopleError} filters={filters} setFilters={setFilters} groups={groups} onChanged={refresh} />
      </div>
    </AppShell>
  );
};

export default ManagePeople;
