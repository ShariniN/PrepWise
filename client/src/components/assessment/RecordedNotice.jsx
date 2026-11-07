import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Card } from '../ui';

// Plain statement of what a level 1 timed assessment records. Shown before the student starts.
const RecordedNotice = ({ integrityLevel }) => {
  if (!integrityLevel) {
    return (
      <Card as="section" tone="sand">
        <h2 className="font-display text-lg font-semibold text-ink">What is recorded</h2>
        <p className="mt-1 text-sm text-ink-2">This assessment does not record browser activity. Your answers and the time you start and finish are saved.</p>
      </Card>
    );
  }
  return (
    <Card as="section" tone="primary" className="space-y-5 border-2 border-primary-200 text-sm text-ink" aria-labelledby="rec-title">
      <h2 id="rec-title" className="font-display text-xl font-semibold text-primary-900">What is recorded during this assessment</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-surface p-4">
          <p className="flex items-center gap-2 font-semibold text-ink"><Eye size={16} className="text-primary-600" aria-hidden="true" />Recorded</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
            <li>When you switch tabs or windows, and for how long</li>
            <li>When you leave full screen</li>
            <li>When you paste, copy or cut text (and how long a paste is)</li>
            <li>When your connection drops and returns (marked as technical, never held against you)</li>
            <li>How you type in the editor: when text is added or removed, so your lecturer can replay it</li>
          </ul>
        </div>
        <div className="rounded-2xl bg-surface p-4">
          <p className="flex items-center gap-2 font-semibold text-ink"><EyeOff size={16} className="text-success-600" aria-hidden="true" />Not recorded</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
            <li>No camera, no microphone</li>
            <li>No screen recording or screenshots</li>
            <li>Nothing outside this page</li>
          </ul>
        </div>
      </div>
      <p className="text-ink">
        These records are only used to give your lecturer reasons to take a closer look. They never change your mark on their own,
        a person reviews them, and you are told and can respond if a case is escalated. Nothing here blocks you or ends your attempt.
        If something goes wrong with your computer or connection, keep working: technical problems are not counted against you.
      </p>
      <p className="text-xs text-ink-2">Your lecturer may switch off some of these signals for you if you have an agreed adjustment.</p>
    </Card>
  );
};

export default RecordedNotice;
