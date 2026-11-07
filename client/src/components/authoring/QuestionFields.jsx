import React from 'react';
import CodeEditor from '../CodeEditor';
import { QUESTION_TYPES, DIFFICULTIES, EDITOR_LANGUAGES, isCodeType } from '../../utils/practice';

const inp = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white disabled:bg-gray-100';
const Field = ({ label, children, className = '' }) => (
  <label className={`block text-xs text-gray-600 ${className}`}>{label}{children}</label>
);

// Metadata and content fields. `form` / `set(patch)` are owned by the page.
const QuestionFields = ({ form, set, isNew, disabled }) => {
  const code = isCodeType(form.type);
  const toggleLang = (l) => {
    const has = form.languages.includes(l);
    set({ languages: has ? form.languages.filter((x) => x !== l) : [...form.languages, l] });
  };
  const [starterLang, setStarterLang] = React.useState(form.languages[0] || 'python');
  const activeStarter = form.languages.includes(starterLang) ? starterLang : form.languages[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2">
          <input className={inp} disabled={disabled} value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className={inp} disabled={disabled || !isNew} value={form.type} onChange={(e) => set({ type: e.target.value })}>
            {QUESTION_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          {!isNew && <span className="text-gray-400">Type cannot be changed after creation.</span>}
        </Field>
        <Field label="Difficulty">
          <select className={inp} disabled={disabled} value={form.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
            {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Topic tags (comma separated)">
          <input className={inp} disabled={disabled} value={form.topic} onChange={(e) => set({ topic: e.target.value })} placeholder="arrays, sorting" />
        </Field>
        <Field label="Estimated minutes">
          <input type="number" min="1" className={inp} disabled={disabled} value={form.estimatedMinutes} onChange={(e) => set({ estimatedMinutes: e.target.value })} />
        </Field>
        <Field label="Learning outcome" className="sm:col-span-2">
          <input className={inp} disabled={disabled} value={form.learningOutcome} onChange={(e) => set({ learningOutcome: e.target.value })} />
        </Field>
      </div>

      <Field label="Statement (markdown: headings, lists, `code`, fenced blocks)">
        <textarea className={`${inp} font-mono`} rows={8} disabled={disabled} value={form.statement} onChange={(e) => set({ statement: e.target.value })} />
      </Field>

      {code && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Time limit (ms)">
              <input type="number" min="100" className={inp} disabled={disabled} value={form.timeLimitMs} onChange={(e) => set({ timeLimitMs: e.target.value })} />
            </Field>
            <Field label="Memory limit (KB)">
              <input type="number" min="1000" className={inp} disabled={disabled} value={form.memoryLimitKb} onChange={(e) => set({ memoryLimitKb: e.target.value })} />
            </Field>
          </div>
          <fieldset>
            <legend className="text-xs text-gray-600 mb-1">Languages students may use</legend>
            <div className="flex flex-wrap gap-3 text-sm">
              {EDITOR_LANGUAGES.map((l) => (
                <label key={l.value} className="flex items-center gap-1">
                  <input type="checkbox" disabled={disabled} checked={form.languages.includes(l.value)} onChange={() => toggleLang(l.value)} /> {l.label}
                </label>
              ))}
            </div>
          </fieldset>
          {activeStarter && (
            <div>
              <div className="text-xs text-gray-600 mb-1">Starter code</div>
              <CodeEditor
                height="200px"
                value={form.starterCode[activeStarter] || ''}
                language={activeStarter}
                languages={form.languages}
                onLanguageChange={setStarterLang}
                readOnly={disabled}
                ariaLabel="Starter code"
                onChange={(v) => set({ starterCode: { ...form.starterCode, [activeStarter]: v } })}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default QuestionFields;
