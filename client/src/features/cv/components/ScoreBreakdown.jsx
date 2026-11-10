import { useState } from 'react';
import { AlertTriangle, ChevronDown, Info } from 'lucide-react';

// Explains a CV match score: the AI's evidence-based score, the keyword check, and which job skills
// were found or missing. Shows an honest "unavailable" state when the AI could not run.
const pct = (n) => (typeof n === 'number' ? `${Math.round(n * 100)}%` : '-');

// Turn the provider's raw error into a reason a student or lecturer can act on.
const reasonFor = (aiError = '') => {
  if (/429|quota/i.test(aiError)) return "The AI service's usage limit has been reached (the free plan allows a small number of requests per model each day). It resets daily, or sooner with a paid API key.";
  if (/503|overloaded|high demand/i.test(aiError)) return 'The AI service is busy right now. Please try again in a few minutes.';
  if (/404|no longer available/i.test(aiError)) return 'The configured AI model is no longer offered by Google. An administrator needs to update GEMINI_CV_MODELS.';
  if (/401|403|api key/i.test(aiError)) return 'The AI service rejected the API key. An administrator needs to check GEMINI_API_KEY.';
  return 'The AI service could not be reached. Please try again in a minute.';
};

// For lecturers looking at a student's stored analysis: neutral, past tense, nothing for them to retry.
const lecturerReasonFor = (aiError = '') => {
  if (/429|quota/i.test(aiError)) return "The AI service's usage limit had been reached at the time.";
  if (/503|overloaded|high demand/i.test(aiError)) return 'The AI service was busy at the time.';
  if (/404|no longer available|401|403|api key/i.test(aiError)) return 'The AI service was not configured correctly at the time.';
  return 'The AI service could not be reached at the time.';
};

const SkillList = ({ title, items, tone }) => (
  <div>
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
    {items?.length ? (
      <div className="flex flex-wrap gap-1.5">
        {items.map((s) => (
          <span
            key={s}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              tone === 'good' ? 'border-success-100 bg-success-50 text-success-700' : 'border-danger-100 bg-danger-50 text-danger-700'
            }`}
          >
            {s}
          </span>
        ))}
      </div>
    ) : (
      <p className="text-sm text-ink-muted">None</p>
    )}
  </div>
);

// audience: 'student' (default: their own analysis, they can retry) or 'lecturer' (a student's stored analysis).
const ScoreBreakdown = ({ breakdown, audience = 'student' }) => {
  const lecturer = audience === 'lecturer';
  const [open, setOpen] = useState(false);
  if (!breakdown) return null;
  const { aiAvailable, aiScore, aiWeight = 0.7, keywordScore, keywordWeight = 0.3, matchedSkills, missingSkills, requiredSkills, aiError } = breakdown;

  if (!aiAvailable) {
    return (
      <div className="mb-6 rounded-2xl border border-sun-200 bg-sun-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-sun-600" />
          <div className="space-y-3">
            <p className="font-semibold text-sun-700">
              {lecturer
                ? 'AI analysis was unavailable for this result, so no match score was calculated. It is not counted in averages.'
                : 'AI analysis is unavailable, so no match score was calculated.'}
            </p>
            <p className="text-sm text-ink-2">{lecturer ? lecturerReasonFor(aiError) : reasonFor(aiError)}</p>
            <p className="text-sm text-ink-2">
              The keyword check still ran: {matchedSkills?.length || 0} of {requiredSkills?.length || 0} skills from the job description appear in this CV.
            </p>
            <SkillList title="Skills found" items={matchedSkills} tone="good" />
            <SkillList title="Skills missing" items={missingSkills} tone="bad" />
            {aiError && !lecturer && (
              <details className="text-xs text-ink-muted">
                <summary className="cursor-pointer">Technical detail</summary>
                <p className="mt-1 break-words">{aiError.replace(/\[GoogleGenerativeAI Error\]: Error fetching from \S+/g, '').slice(0, 600)}</p>
              </details>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-line bg-sand/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Info className="h-4 w-4 text-primary-600" />
          How this score was worked out
        </span>
        <ChevronDown className={`h-4 w-4 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-line p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs text-ink-muted">AI assessment of the evidence ({Math.round(aiWeight * 100)}% of the score)</p>
              <p className="font-display text-2xl font-semibold text-ink">{pct(aiScore)}</p>
              <p className="text-xs text-ink-muted">Rewards skills shown in real projects and experience. Lists of keywords without evidence, vague content and spelling problems score low.</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs text-ink-muted">Keyword check ({Math.round(keywordWeight * 100)}% of the score)</p>
              <p className="font-display text-2xl font-semibold text-ink">{pct(keywordScore)}</p>
              <p className="text-xs text-ink-muted">Share of the job's required skills that the CV names.</p>
            </div>
          </div>
          <SkillList title="Required skills found" items={matchedSkills} tone="good" />
          <SkillList title="Required skills missing" items={missingSkills} tone="bad" />
          {breakdown.model && <p className="text-xs text-ink-muted">Scored by {breakdown.model}.</p>}
        </div>
      )}
    </div>
  );
};

export default ScoreBreakdown;
