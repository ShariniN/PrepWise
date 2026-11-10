import React from 'react';
import CodeEditor from '../../../components/CodeEditor';
import { QUESTION_TYPES, DIFFICULTIES, EDITOR_LANGUAGES, isCodeType } from '../../../utils/practice';
import { Field, Input, Select, Textarea } from '../../../components/ui';

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
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2">
          {(p) => <Input {...p} disabled={disabled} value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />}
        </Field>
        <Field label="Type" hint={!isNew ? 'Type cannot be changed after creation.' : undefined}>
          {(p) => (
            <Select {...p} disabled={disabled || !isNew} value={form.type} onChange={(e) => set({ type: e.target.value })}>
              {QUESTION_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Difficulty">
          {(p) => (
            <Select {...p} disabled={disabled} value={form.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
              {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Topic tags (comma separated)">
          {(p) => <Input {...p} disabled={disabled} value={form.topic} onChange={(e) => set({ topic: e.target.value })} placeholder="arrays, sorting" />}
        </Field>
        <Field label="Estimated minutes">
          {(p) => <Input {...p} type="number" min="1" disabled={disabled} value={form.estimatedMinutes} onChange={(e) => set({ estimatedMinutes: e.target.value })} />}
        </Field>
        <Field label="Learning outcome" className="sm:col-span-2">
          {(p) => <Input {...p} disabled={disabled} value={form.learningOutcome} onChange={(e) => set({ learningOutcome: e.target.value })} />}
        </Field>
      </div>

      <Field label="Statement (markdown: headings, lists, `code`, fenced blocks)">
        {(p) => <Textarea {...p} className="font-mono" rows={8} disabled={disabled} value={form.statement} onChange={(e) => set({ statement: e.target.value })} />}
      </Field>

      {code && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Time limit (ms)">
              {(p) => <Input {...p} type="number" min="100" disabled={disabled} value={form.timeLimitMs} onChange={(e) => set({ timeLimitMs: e.target.value })} />}
            </Field>
            <Field label="Memory limit (KB)">
              {(p) => <Input {...p} type="number" min="1000" disabled={disabled} value={form.memoryLimitKb} onChange={(e) => set({ memoryLimitKb: e.target.value })} />}
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">Languages students may use</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink">
              {EDITOR_LANGUAGES.map((l) => (
                <label key={l.value} className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-primary-600" disabled={disabled} checked={form.languages.includes(l.value)} onChange={() => toggleLang(l.value)} /> {l.label}
                </label>
              ))}
            </div>
          </fieldset>
          {activeStarter && (
            <div>
              <div className="mb-1.5 text-sm font-medium text-ink">Starter code</div>
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
