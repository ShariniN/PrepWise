import React, { useState } from 'react';
import { draftWithAi } from '../../api/questions';
import { errorMessage, errorCode } from '../../api/client';
import { DIFFICULTIES, EDITOR_LANGUAGES } from '../../utils/practice';

// Asks the server to draft coding questions. Calls onCreated(questions) on success.
const AiDraftDialog = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ topic: '', difficulty: 'easy', language: 'python', count: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.topic.trim()) { setError('Enter a topic'); return; }
    setBusy(true); setError('');
    try {
      const data = await draftWithAi({ ...form, topic: form.topic.trim(), count: Math.min(3, Math.max(1, Number(form.count) || 1)) });
      onCreated(data.questions || [], data.note);
    } catch (err) {
      const code = errorCode(err);
      setError(code === 'AI_MONTHLY_CAP'
        ? 'Your university has used its monthly AI drafting allowance.'
        : err?.response?.status === 502
          ? 'The AI did not produce a usable question. Try a different topic.'
          : errorMessage(err, 'Could not draft questions'));
    } finally { setBusy(false); }
  };

  const inp = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="ai-title">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-3">
        <h2 id="ai-title" className="text-lg font-bold text-gray-800">Draft with AI</h2>
        <p className="text-xs text-gray-500">Creates draft coding questions with tests and a reference and wrong solution. Drafts are never published automatically: validate and review them first.</p>
        <label className="block text-xs text-gray-600">Topic
          <input className={inp} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. recursion" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block text-xs text-gray-600">Difficulty
            <select className={inp} value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
              {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label className="block text-xs text-gray-600">Language
            <select className={inp} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              {EDITOR_LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
          <label className="block text-xs text-gray-600">Count (1-3)
            <input type="number" min="1" max="3" className={inp} value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="px-3 py-2 text-sm rounded-lg bg-gray-200">Cancel</button>
          <button type="submit" disabled={busy} className="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white disabled:opacity-50">
            {busy ? 'Drafting... (can take a while)' : 'Create drafts'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AiDraftDialog;
