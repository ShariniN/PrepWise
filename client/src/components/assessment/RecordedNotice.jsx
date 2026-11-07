import React from 'react';

// Plain statement of what a level 1 timed assessment records. Shown before the student starts.
const RecordedNotice = ({ integrityLevel }) => {
  if (!integrityLevel) {
    return (
      <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
        <h2 className="font-semibold text-gray-800">What is recorded</h2>
        <p className="mt-1">This assessment does not record browser activity. Your answers and the time you start and finish are saved.</p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-gray-800 space-y-3" aria-labelledby="rec-title">
      <h2 id="rec-title" className="font-semibold text-indigo-900">What is recorded during this assessment</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="font-medium">Recorded</p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li>When you switch tabs or windows, and for how long</li>
            <li>When you leave full screen</li>
            <li>When you paste, copy or cut text (and how long a paste is)</li>
            <li>When your connection drops and returns (marked as technical, never held against you)</li>
            <li>How you type in the editor: when text is added or removed, so your lecturer can replay it</li>
          </ul>
        </div>
        <div>
          <p className="font-medium">Not recorded</p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li>No camera, no microphone</li>
            <li>No screen recording or screenshots</li>
            <li>Nothing outside this page</li>
          </ul>
        </div>
      </div>
      <p>
        These records are only used to give your lecturer reasons to take a closer look. They never change your mark on their own,
        a person reviews them, and you are told and can respond if a case is escalated. Nothing here blocks you or ends your attempt.
        If something goes wrong with your computer or connection, keep working: technical problems are not counted against you.
      </p>
      <p className="text-xs text-gray-600">Your lecturer may switch off some of these signals for you if you have an agreed adjustment.</p>
    </section>
  );
};

export default RecordedNotice;
