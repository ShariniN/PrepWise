import React from 'react';

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
          className={`min-w-[2.5rem] px-3 py-1.5 rounded-lg border text-sm font-semibold ${
            active ? 'bg-indigo-600 text-white border-indigo-600' : done ? 'bg-green-50 text-green-800 border-green-300' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
        >
          {i + 1}{done && !active ? <span className="sr-only"> (answer saved)</span> : null}
        </button>
      );
    })}
  </nav>
);

export default QuestionNavigator;
