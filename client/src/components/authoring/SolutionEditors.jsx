import React from 'react';
import CodeEditor from '../CodeEditor';

// Reference solution (must pass every test) and optional wrong solution (must fail at least one).
const SolutionEditors = ({ form, set, disabled, aiDrafted }) => (
  <div className="space-y-4">
    <div>
      <h3 className="text-sm font-semibold text-gray-700">Reference solution</h3>
      <p className="text-xs text-gray-500 mb-1">Must pass every test during validation. Java must use <code>public class Main</code>.</p>
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
      <h3 className="text-sm font-semibold text-gray-700">Wrong solution {aiDrafted ? '(required for AI drafts)' : '(optional)'}</h3>
      <p className="text-xs text-gray-500 mb-1">A plausible but incorrect program. Validation checks that it fails at least one test, which proves the tests can catch mistakes.</p>
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
