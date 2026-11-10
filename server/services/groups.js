// Free-text group labels ('CS 2026'). A leaf module: it imports nothing from modules/ or models/.
export const MAX_GROUP_CHARS = 60;

export class InvalidGroupError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidGroupError';
    this.code = 'INVALID_GROUP';
  }
}

// Returns the trimmed value ('' clears it) or throws InvalidGroupError.
// Over-long values are rejected, never silently truncated.
export const cleanGroup = (group) => {
  if (group === undefined || group === null) return '';
  if (typeof group !== 'string') throw new InvalidGroupError('group must be text');
  const g = group.trim().replace(/\s+/g, ' ');
  if (g.length > MAX_GROUP_CHARS) throw new InvalidGroupError(`group must be at most ${MAX_GROUP_CHARS} characters`);
  return g;
};
