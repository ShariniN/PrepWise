import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import userModel from '../../models/User.js';
import Institution from '../../models/Institution.js';
import transporter from '../../config/nodemailer.js';
import { VERIFY_LINK_TEMPLATE } from '../../config/emailTemplates.js';
import { hashToken } from '../../services/inviteTokens.js';
import { audit } from '../../services/audit.js';
import { passwordOk, PASSWORD_MESSAGE } from '../../services/accountRules.js';
import peopleRepo from '../people/people.repo.js';
import { seatsUsed } from '../people/people.service.js';
import { withSeatLock, SeatLockBusyError } from '../../services/seatLock.js';

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const SIGNUP_MESSAGE = 'Check your email for a link to finish signing up.';
export const RESEND_MESSAGE = 'If that address has an account waiting for verification, we have sent a new link.';
const DOMAIN_MESSAGE = "Sign-up isn't open for this email address. Use your university email, or ask your university for an invitation.";
const SEAT_MESSAGE = 'Your university has no free student seats right now. Ask your university administrator to make room.';

export class SignupError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'SignupError';
    this.status = status;
    this.code = code;
  }
}

export const signupRepo = {
  findSignupInstitution: (domain) =>
    Institution.findOne({ allowedEmailDomains: domain, selfSignup: true, status: 'active' }),
  findByEmail: (email) => userModel.findOne({ email }),
  findByVerifyHash: (hash) => userModel.findOne({ emailVerifyTokenHash: hash }),
  createUser: (data) => userModel.create(data),
};

// Read at request time so tests and deployments can change it. Same condition as the mail guard.
export const exposeVerifyLinks = () => process.env.NODE_ENV !== 'production';

const newVerifyToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashToken(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) };
};

const buildVerifyLink = (token) =>
  `${(process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '')}/verify-email?token=${token}`;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const sendVerifyEmail = async (user, link) => {
  try {
    await transporter.sendMail({
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject: 'Verify your PrepWise email',
      html: VERIFY_LINK_TEMPLATE.replace('{{email}}', escapeHtml(user.email)).replace('{{link}}', link),
    });
  } catch (error) {
    console.error('Verification email failed:', error.message);
  }
  if (exposeVerifyLinks()) console.log('[dev] verification link:', link);
};

// Gives the account a fresh link (the old one stops working) and mails it.
const issueLink = async (user) => {
  const { token, hash, expiresAt } = newVerifyToken();
  user.emailVerifyTokenHash = hash;
  user.emailVerifyExpiresAt = expiresAt;
  await user.save();
  const link = buildVerifyLink(token);
  await sendVerifyEmail(user, link);
  return link;
};

const seatsFull = async (institution) => (await seatsUsed(institution)) >= (institution.contractedStudentLimit || 0);

// The password is chosen at verify, by whoever opens the link in the mailbox. A password sent here is
// ignored, so someone who signs up another person's address can never choose or keep its password.
export const startSignup = async ({ name, email }) => {
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(cleanEmail)) throw new SignupError(400, 'INVALID_EMAIL', 'Enter a valid email address.');
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    throw new SignupError(400, 'INVALID_NAME', 'Name must be 1 to 100 characters.');
  }

  const institution = await signupRepo.findSignupInstitution(cleanEmail.split('@')[1]);
  if (!institution) throw new SignupError(400, 'SIGNUP_DOMAIN_NOT_ALLOWED', DOMAIN_MESSAGE);

  // An existing email gets the same answer as a new one, so the form cannot be used to find out who has an account.
  const existing = await signupRepo.findByEmail(cleanEmail);
  if (existing) {
    // A fresh link for a pending signup; the old link stops working.
    return { link: existing.status === 'unverified' ? await issueLink(existing) : null };
  }

  if (await seatsFull(institution)) throw new SignupError(409, 'SEAT_LIMIT_REACHED', SEAT_MESSAGE);

  const { token, hash, expiresAt } = newVerifyToken();
  let user;
  try {
    user = await signupRepo.createUser({
      name: name.trim(),
      email: cleanEmail,
      role: 'student',
      institutionId: institution._id,
      status: 'unverified',
      isAccountVerified: false,
      emailVerifyTokenHash: hash,
      emailVerifyExpiresAt: expiresAt,
    });
  } catch (error) {
    // Two signups for one address raced; the other one won, and this caller gets the same generic answer.
    if (error?.code === 11000) return { link: null };
    throw error;
  }
  const link = buildVerifyLink(token);
  await sendVerifyEmail(user, link);
  await audit({ actor: user._id, action: 'user.signup', target: user._id, institutionId: institution._id });
  return { link };
};

export const resendVerification = async (email) => {
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(cleanEmail)) return;
  const user = await signupRepo.findByEmail(cleanEmail);
  if (user && user.status === 'unverified') await issueLink(user);
};

// Activates the account behind a link and sets the password chosen there. Returns the activated user.
export const completeVerification = async (token, password) => {
  const invalid = new SignupError(400, 'VERIFY_INVALID', 'This verification link is not valid. Request a new one.');
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) throw invalid;
  const hash = hashToken(token);

  const first = await signupRepo.findByVerifyHash(hash);
  if (!first || first.status !== 'unverified') throw invalid;

  try {
    // Everything from reading the token to activating runs under the institution's seat lock, so two
    // verifications can neither take the last seat together nor activate the same token twice.
    return await withSeatLock(first.institutionId, async () => {
      const user = await signupRepo.findByVerifyHash(hash);
      if (!user || user.status !== 'unverified') throw invalid;
      if (!user.emailVerifyExpiresAt || new Date(user.emailVerifyExpiresAt).getTime() < Date.now()) {
        throw new SignupError(400, 'VERIFY_EXPIRED', 'This verification link has expired. Request a new one.');
      }
      // Checked before the seat so a weak password never costs the token; nothing is saved until all checks pass.
      if (!passwordOk(password)) throw new SignupError(400, 'WEAK_PASSWORD', PASSWORD_MESSAGE);
      const institution = await peopleRepo.getInstitution(user.institutionId);
      if (!institution || institution.status !== 'active') throw invalid;
      // The seat is taken now, not at signup, so unverified accounts never block real students.
      if (await seatsFull(institution)) throw new SignupError(409, 'SEAT_LIMIT_REACHED', SEAT_MESSAGE);

      user.password = await bcrypt.hash(password, 10);
      user.status = 'active';
      user.isAccountVerified = true;
      user.emailVerifyTokenHash = '';
      user.emailVerifyExpiresAt = null;
      await user.save();
      await audit({ actor: user._id, action: 'user.verify_email', target: user._id, institutionId: user.institutionId });
      return user;
    });
  } catch (error) {
    if (error instanceof SeatLockBusyError) throw new SignupError(503, 'TRY_AGAIN', error.message);
    throw error;
  }
};
