import crypto from 'node:crypto';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// The raw token only ever goes to the invitee; the database keeps the SHA-256 hash.
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export const createInviteToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) };
};

export const buildInviteLink = (token) =>
  `${(process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '')}/accept-invite?token=${token}`;

// Read at request time on purpose, so tests and deployments can change it.
export const exposeInviteLinks = () => process.env.NODE_ENV !== 'production';
