import React, { useState } from 'react';
import { lecturer } from '../../api/analytics';
import useAnalyticsData from '../../hooks/useAnalyticsData';
import { ErrorState, LoadingState, EmptyState } from './EmptyState';
import ExcludedNote from './ExcludedNote';
import { Badge, Button, Card, Field, Input } from '../ui';

const DEFAULTS = { inactiveDays: 14, declineWindow: 3, declineMin: 10, compileErrors: 3, compileWindow: 5 };
const FIELDS = [
  { key: 'inactiveDays', label: 'Inactive days' },
  { key: 'declineWindow', label: 'Decline window (attempts)' },
  { key: 'declineMin', label: 'Minimum drop (points)' },
  { key: 'compileErrors', label: 'Compile errors' },
  { key: 'compileWindow', label: 'Out of last (submissions)' },
];

const StudentsNeedingHelp = ({ courseId, cohortId }) => {
  const [draft, setDraft] = useState(DEFAULTS);
  const [applied, setApplied] = useState(DEFAULTS);
  const { data, error, loading, reload } = useAnalyticsData(
    () => lecturer.studentsNeedingHelp(courseId, cohortId, applied), `${courseId}|${cohortId}|${JSON.stringify(applied)}`);

  const apply = (e) => {
    e.preventDefault();
    const next = {};
    FIELDS.forEach(({ key }) => { next[key] = Math.max(1, parseInt(draft[key], 10) || DEFAULTS[key]); });
    setApplied(next);
  };

  return (
    <section className="space-y-5" aria-labelledby="sn-h">
      <div>
        <h2 id="sn-h" className="font-display text-xl font-semibold text-ink">Who to contact</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Students with at least one reason to check in. There is no score and no ranking: the list is alphabetical and
          each chip says why the student appears.
        </p>
      </div>

      <Card as="form" tone="sand" onSubmit={apply} className="!p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              {(p) => (
                <Input {...p} type="number" min="1" value={draft[f.key]}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
              )}
            </Field>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm">Apply thresholds</Button>
          <Button size="sm" variant="ghost" onClick={() => { setDraft(DEFAULTS); setApplied(DEFAULTS); }}>Reset</Button>
        </div>
      </Card>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && !loading && (
        <>
          <ExcludedNote excluded={data.excluded} note={data.note} />
          {!data.students?.length ? (
            <EmptyState title="No one to contact right now">No student matches the thresholds above.</EmptyState>
          ) : (
            <>
              <p className="text-sm text-ink-2">{data.students.length} student{data.students.length === 1 ? '' : 's'} listed, alphabetically.</p>
              <ul className="space-y-2">
                {data.students.map((s) => (
                  <li key={s.studentId} className="rounded-2xl border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-semibold text-ink">{s.name}</span>
                      <a href={`mailto:${s.email}`} className="break-all text-sm font-medium text-primary-700 underline underline-offset-2">{s.email}</a>
                    </div>
                    <ul className="flex flex-wrap gap-2 mt-2">
                      {s.reasons.map((r, i) => (
                        <li key={`${r.code}-${i}`} title={r.scores ? `Scores: ${r.scores.join(', ')}` : undefined}>
                          <Badge tone="primary" className="!whitespace-normal">
                            {r.message}
                            {r.code === 'declining_topic' && r.scores ? ` (${r.scores.join(' > ')})` : ''}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
};

export default StudentsNeedingHelp;
