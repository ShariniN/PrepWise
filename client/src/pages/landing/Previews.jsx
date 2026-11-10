import React from 'react';
import { Check, AlertTriangle, Sparkles, FileText, Users, BarChart3, Clock } from 'lucide-react';
import { ProgressBar, Badge } from '../../components/ui';
import { Gauge, Heatmap } from './HeroVisual';

const Shell = ({ children, className = '' }) => (
  <div className={`rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-7 ${className}`}>{children}</div>
);
const Row = ({ ok, children }) => (
  <li className="flex items-center gap-2.5 text-sm text-ink-2">
    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${ok ? 'bg-success-100 text-success-700' : 'bg-sand text-ink-muted'}`}>{ok ? <Check size={12} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-ink-muted/60" />}</span>
    {children}
  </li>
);

/* ---------- Student journey states ---------- */
export const JourneyPreview = ({ state }) => {
  if (state === 'practising') {
    return (
      <Shell>
        <div className="mb-4 flex items-center justify-between"><Badge tone="primary" dot>Practising</Badge><span className="text-xs text-ink-muted">Two Sum - Easy</span></div>
        <ProgressBar value={60} label="Hidden tests passing" showValue />
        <ul className="m-0 mt-5 list-none space-y-2.5 p-0"><Row ok>Basic case</Row><Row ok>Duplicates</Row><Row ok>Negative numbers</Row><Row>Large input (running)</Row><Row>Edge cases</Row></ul>
        <p className="mt-5 rounded-2xl bg-primary-50 px-4 py-3 text-sm text-primary-900">Run against the examples as often as you like. Experiment, fail, retry.</p>
      </Shell>
    );
  }
  if (state === 'stuck') {
    return (
      <Shell>
        <div className="mb-4 flex items-center justify-between"><Badge tone="warning" dot>Stuck</Badge><span className="text-xs text-ink-muted">Wrong answer again</span></div>
        <div className="rounded-2xl bg-ink-deep p-4 font-mono text-xs leading-5 text-white/80">
          <div className="text-danger-500">Wrong answer  hidden test 3 of 5</div>
          <div className="text-white/50">visible examples: 2 of 2 passed</div>
        </div>
        <ul className="m-0 mt-5 list-none space-y-2.5 p-0"><Row>Re-read the examples and edge cases</Row><Row>Run your code against the examples again</Row><Row>Try another question from the practice list</Row></ul>
        <p className="mt-5 flex items-start gap-2 rounded-2xl bg-sun-50 px-4 py-3 text-sm text-sun-700"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />Getting stuck is part of practice, not a grade.</p>
      </Shell>
    );
  }
  return (
    <Shell>
      <div className="mb-4 flex items-center justify-between"><Badge tone="success" dot>Ready</Badge><span className="text-xs text-ink-muted">Interview and CV readiness</span></div>
      <div className="flex items-center gap-6">
        <Gauge value={82} size={112} />
        <ul className="m-0 list-none space-y-2.5 p-0"><Row ok>Core problems solved</Row><Row ok>Mock interview complete</Row><Row ok>CV matched to a job description</Row></ul>
      </div>
      <p className="mt-5 flex items-start gap-2 rounded-2xl bg-success-50 px-4 py-3 text-sm text-success-700"><Sparkles size={16} className="mt-0.5 shrink-0" aria-hidden="true" />Evidence you can show: coding practice, mock interviews and CV analysis in one place.</p>
    </Shell>
  );
};

/* ---------- Use-case previews ---------- */
export const UseCasePreview = ({ id }) => {
  if (id === 'students') {
    return (
      <Shell>
        <p className="mb-3 text-sm font-semibold text-ink">Your week</p>
        <div className="space-y-4">
          <ProgressBar value={72} label="Practice set: arrays" showValue />
          <ProgressBar value={40} tone="warning" label="Mock interview" showValue />
          <ProgressBar value={100} tone="success" label="CV review" showValue />
        </div>
        <div className="mt-5 flex items-center gap-2 text-sm text-ink-2"><FileText size={16} className="text-primary-600" aria-hidden="true" /> CV feedback ready for the Backend Intern role</div>
      </Shell>
    );
  }
  if (id === 'lecturers') {
    return (
      <Shell>
        <div className="mb-4 flex items-center justify-between"><p className="text-sm font-semibold text-ink">Group 1 - mock interviews</p><Badge tone="primary">Example</Badge></div>
        <Heatmap />
        <div className="mt-4 flex items-center gap-4 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-sand" />no mock interview</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-sun-300" />score under 50</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-primary-600" />score 50 or more</span>
        </div>
        <p className="mt-4 text-sm text-ink-2">Each square is a student. See who has not tried a mock interview yet, and who may need help, while there is still time.</p>
      </Shell>
    );
  }
  return (
    <Shell>
      <div className="mb-4 grid grid-cols-3 gap-3 text-center">
        {[['Registered', '1,240'], ['Licence limit', '1,500'], ['Active, 7 days', '412']].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-sand px-2 py-3"><div className="font-display text-2xl font-semibold text-ink">{v}</div><div className="text-[11px] text-ink-muted">{k}</div></div>
        ))}
      </div>
      <p className="flex items-center gap-2 text-sm text-ink-2"><BarChart3 size={16} className="text-primary-600" aria-hidden="true" />Invite people by email or CSV import, and organise students into groups.</p>
      <p className="mt-2 flex items-center gap-2 text-sm text-ink-2"><Users size={16} className="text-sun-600" aria-hidden="true" />Registered students count towards your per-student licence limit.</p>
      <p className="mt-2 flex items-center gap-2 text-xs text-ink-muted"><Clock size={14} aria-hidden="true" />Illustrative numbers.</p>
    </Shell>
  );
};
