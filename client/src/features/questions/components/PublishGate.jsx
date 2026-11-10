import React from 'react';
import { isCodeType } from '../../../utils/practice';
import { publishBlockers } from '../questionForm';
import { Badge, Button, Card } from '../../../components/ui';

const MOVES = {
  draft: ['in_review', 'published'],
  in_review: ['draft', 'published'],
  published: ['retired', 'draft'],
  retired: ['draft'],
};
const LABEL = { draft: 'Back to draft', in_review: 'Send to review', published: 'Publish', retired: 'Retire' };
const STATUS_TONE = { draft: 'neutral', in_review: 'primary', published: 'success', retired: 'danger' };

const PublishGate = ({ question, dirty, busy, onStatus, onValidate, canValidate }) => {
  const blockers = publishBlockers(question, dirty);
  const moves = MOVES[question.status] || [];
  const v = question.validation;
  return (
    <Card as="section" tone="primary" className="space-y-3" aria-label="Publish gate">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg font-semibold text-ink">Publish gate</h3>
        <Badge tone={STATUS_TONE[question.status] || 'neutral'} dot>Status: {question.status.replace('_', ' ')}</Badge>
        <span className="text-xs text-ink-2">Version {question.version}</span>
      </div>
      {isCodeType(question.type) && (
        <p className="text-sm text-ink">
          Validation: {!v ? <span className="text-ink-2">never run</span>
            : v.current && v.passed ? <span className="font-semibold text-success-700">passed for the current content ({v.testsRun} tests)</span>
            : !v.current ? <span className="font-semibold text-sun-700">out of date</span>
            : <span className="font-semibold text-danger-700">failed</span>}
        </p>
      )}
      {blockers.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink" role="status">
          {blockers.map((b) => <li key={b}>{b}</li>)}
        </ul>
      ) : <p className="text-sm font-semibold text-success-700">Ready to publish.</p>}
      <div className="flex flex-wrap gap-2">
        {isCodeType(question.type) && (
          <Button size="sm" variant="secondary" loading={busy === 'validate'} disabled={!!busy || !canValidate} onClick={onValidate}>
            {busy === 'validate' ? 'Validating...' : 'Validate in sandbox'}
          </Button>
        )}
        {moves.map((s) => {
          const blocked = s === 'published' && blockers.length > 0;
          return (
            <Button key={s} size="sm" variant={s === 'published' ? 'primary' : 'secondary'}
              disabled={!!busy || blocked || !question.editable}
              title={blocked ? blockers[0] : undefined} onClick={() => onStatus(s)}>
              {LABEL[s]}
            </Button>
          );
        })}
      </div>
      {question.status === 'published' && <p className="text-xs text-ink-2">Editing a published question moves it back to draft until it is validated and published again.</p>}
    </Card>
  );
};

export default PublishGate;
