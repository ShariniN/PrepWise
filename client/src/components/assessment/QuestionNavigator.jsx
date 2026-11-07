import React from 'react';
import { Check } from 'lucide-react';

// Numbered question buttons. `submitted` is a list of question ids with at least one submission.
const QuestionNavigator = ({ questions, current, submitted, onSelect }) => (
  <nav aria-label="Questions" className="flex flex-wrap gap-2">
    {questions.map((q, i) => {
      const done = submitted.includes(q.questionId);
      const active = i === current;
      return (
        <button
          key={q.questionId}
          type="button"
          onClick={() => onSelect(i)}
          aria-current={active ? 'step' : undefined}
          title={`${q.title}${done ? ' (answer saved)' : ''}`}
          className={`inline-flex h-10 min-w-[2.5rem] items-center justify-center gap-1 rounded-full border px-3 text-sm font-semibold transition ${
            active
              ? 'border-primary-600 bg-primary-600 text-white shadow-pill'
              : done
                ? 'border-success-500/40 bg-success-50 text-success-700 hover:border-success-500'
                : 'border-line bg-surface text-ink-2 hover:border-primary-300 hover:bg-primary-50'}`}
        >
          {i + 1}
          {done && !active ? <><Check size={14} aria-hidden="true" /><span className="sr-only"> (answer saved)</span></> : null}
        </button>
      );
    })}
  </nav>
);

export default QuestionNavigator;
