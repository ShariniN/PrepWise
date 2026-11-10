import React from 'react';
import CodeEditor from '../../../components/CodeEditor';

// Reference solution (must pass every test) and optional wrong solution (must fail at least one).
const SolutionEditors = ({ form, set, disabled, aiDrafted }) => (
  <div className="space-y-6">
    <div>
      <h3 className="font-display text-lg font-semibold text-ink">Reference solution</h3>
      <p className="mb-2 text-sm text-ink-2">Must pass every test during validation. Java must use <code className="rounded bg-sand px-1 font-mono text-xs">public class Main</code>.</p>
      <CodeEditor
        height="260px"
        value={form.referenceSolution.source}
        language={form.referenceSolution.language}
        onLanguageChange={(l) => set({ referenceSolution: { ...form.referenceSolution, language: l } })}
        onChange={(v) => set({ referenceSolution: { ...form.referenceSolution, source: v } })}
        readOnly={disabled}
        ariaLabel="Reference solution"
      />
    </div>
    <div>
      <h3 className="font-display text-lg font-semibold text-ink">Wrong solution {aiDrafted ? '(required for AI drafts)' : '(optional)'}</h3>
      <p className="mb-2 text-sm text-ink-2">A plausible but incorrect program. Validation checks that it fails at least one test, which proves the tests can catch mistakes.</p>
      <CodeEditor
        height="220px"
        value={form.wrongSolution.source}
        language={form.wrongSolution.language}
        onLanguageChange={(l) => set({ wrongSolution: { ...form.wrongSolution, language: l } })}
        onChange={(v) => set({ wrongSolution: { ...form.wrongSolution, source: v } })}
        readOnly={disabled}
        ariaLabel="Wrong solution"
      />
    </div>
  </div>
);

export default SolutionEditors;
