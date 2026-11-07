import React, { useState } from 'react';
import { draftWithAi } from '../../api/questions';
import { errorMessage, errorCode } from '../../api/client';
import { DIFFICULTIES, EDITOR_LANGUAGES } from '../../utils/practice';
import { Button, Field, Input, Modal, Select } from '../ui';

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

  return (
    <Modal
      open
      onClose={onClose}
      title="Draft with AI"
      description="Creates draft coding questions with tests and a reference and wrong solution. Drafts are never published automatically: validate and review them first."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Topic">
          {(p) => <Input {...p} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. recursion" />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Difficulty">
            {(p) => (
              <Select {...p} value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Language">
            {(p) => (
              <Select {...p} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                {EDITOR_LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Count (1-3)">
            {(p) => <Input {...p} type="number" min="1" max="3" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />}
          </Field>
        </div>
        {error && <p role="alert" className="rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" loading={busy}>{busy ? 'Drafting... (can take a while)' : 'Create drafts'}</Button>
        </div>
      </form>
    </Modal>
  );
};

export default AiDraftDialog;
