import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Button, Card, Skeleton } from '../components/ui';
import VerdictBadge from '../components/VerdictBadge';
import { getSessionResults } from '../api/assessments';
import { errorMessage, errorCode } from '../api/client';

const AssessmentResults = () => {
  const { sessionId } = useParams();
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getSessionResults(sessionId);
        if (!cancelled) setResults(d.results || []);
      } catch (e) {
        if (cancelled) return;
        setError(errorCode(e) === 'RESULTS_NOT_RELEASED'
          ? 'Your lecturer has not released results for this assessment yet.'
          : errorMessage(e, 'Could not load results'));
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <AppShell
      width="narrow"
      eyebrow="Assessment"
      title="Results"
      actions={<Button as={Link} to="/assessments" variant="ghost" size="sm" icon={<ArrowLeft size={16} aria-hidden="true" />}>All assessments</Button>}
    >
      <Card>
        {error && <p role="status" className="text-sm text-ink-2">{error}</p>}
        {!error && !results && (
          <div role="status" aria-label="Loading results" className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        )}
        {results && (
          <ul className="divide-y divide-line">
            {results.map((r) => (
              <li key={r.questionId} className="flex flex-wrap items-center gap-3 py-3.5">
                <span className="min-w-[10rem] flex-1 text-ink">{r.index + 1}. {r.title}</span>
                {!r.answered ? <span className="text-sm text-ink-2">Not answered</span>
                  : r.pendingReview ? <VerdictBadge verdict="pending_review" size="sm" />
                  : <>
                      <VerdictBadge verdict={r.verdict} size="sm" />
                      {typeof r.score === 'number' && <span className="text-sm font-semibold text-ink">{r.score}/100</span>}
                    </>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
};

export default AssessmentResults;
