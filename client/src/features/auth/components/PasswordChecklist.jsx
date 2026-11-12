import React from 'react';
import { PASSWORD_RULES } from '../../../lib/roles';

// The password rules, ticked off as the user types. Shared by accept-invite and email verification.
const PasswordChecklist = ({ id, password }) => (
  <ul id={id} className="mt-2 text-xs space-y-0.5">
    {PASSWORD_RULES.map((r) => (
      <li key={r.label} className={r.test(password) ? 'text-success-700' : 'text-ink-muted'}>
        {r.test(password) ? '✓' : '-'} {r.label}
      </li>
    ))}
  </ul>
);

export default PasswordChecklist;
