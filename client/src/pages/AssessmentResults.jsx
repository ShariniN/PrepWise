import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import NavBar from '../components/NavBar';
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
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <Link to="/assessments" className="text-sm text-indigo-700 hover:underline">&larr; All assessments</Link>
        <section className="bg-white rounded-2xl shadow p-6 space-y-3">
          <h1 className="text-2xl font-bold text-gray-800">Results</h1>
          {error && <p role="status" className="text-sm text-gray-700">{error}</p>}
          {!error && !results && <p className="text-gray-500" role="status">Loading...</p>}
          {results && (
            <ul className="divide-y">
              {results.map((r) => (
                <li key={r.questionId} className="py-3 flex flex-wrap items-center gap-3">
                  <span className="flex-1 min-w-[10rem] text-gray-800">{r.index + 1}. {r.title}</span>
                  {!r.answered ? <span className="text-sm text-gray-500">Not answered</span>
                    : r.pendingReview ? <VerdictBadge verdict="pending_review" size="sm" />
                    : <>
                        <VerdictBadge verdict={r.verdict} size="sm" />
                        {typeof r.score === 'number' && <span className="text-sm font-semibold">{r.score}/100</span>}
                      </>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
};

export default AssessmentResults;
