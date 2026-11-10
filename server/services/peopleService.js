import transporter from '../config/nodemailer.js';
import peopleRepo from '../repositories/peopleRepo.js';
import { audit } from './audit.js';
import { createInviteToken, buildInviteLink, exposeInviteLinks } from './inviteTokens.js';
import { parseUsersCsv } from './csv.js';

import { ROLES } from '../config/roles.js';

export { ROLES };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class PeopleError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'PeopleError';
    this.status = status;
    this.code = code;
  }
}

export const publicUser = (u) => ({
  id: String(u._id || u.id),
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  group: u.group || '',
  isAccountVerified: !!u.isAccountVerified,
  lastActive: u.lastActive || null,
  createdAt: u.createdAt || null,
  inviteExpiresAt: u.status === 'invited' ? (u.inviteExpiresAt || null) : null,
});

export const MAX_GROUP_CHARS = 60;

// Optional free-text group ('CS 2026'). Returns the trimmed value ('' clears it) or throws a 400.
// Over-long values are rejected, never silently truncated.
export const cleanGroup = (group) => {
  if (group === undefined || group === null) return '';
  if (typeof group !== 'string') throw new PeopleError(400, 'group must be text', 'INVALID_GROUP');
  const g = group.trim().replace(/\s+/g, ' ');
  if (g.length > MAX_GROUP_CHARS) throw new PeopleError(400, `group must be at most ${MAX_GROUP_CHARS} characters`, 'INVALID_GROUP');
  return g;
};

export const emailDomainAllowed = (institution, email) => {
  const domains = institution.allowedEmailDomains || [];
  if (!domains.length) return true;
  const domain = String(email).split('@')[1]?.toLowerCase();
  return domains.includes(domain);
};

// Students count against the contract while invited or active. Staff are free.
export const seatsUsed = async (institution) => {
  const { active, invited } = await peopleRepo.countStudentsByStatus(institution._id);
  return active + invited;
};

export const getUsage = async (institution) => {
  const { active, invited } = await peopleRepo.countStudentsByStatus(institution._id);
  const limit = institution.contractedStudentLimit || 0;
  return {
    studentLimit: limit,
    activeStudents: active,
    invitedStudents: invited,
    remaining: Math.max(0, limit - active - invited),
  };
};

const seatWarning = (used, limit) =>
  limit > 0 && used / limit >= 0.9
    ? `${used} of ${limit} student seats are used. Contact PrepWise to raise the limit before you run out.`
    : undefined;

const limitError = (limit) =>
  new PeopleError(409, `The student limit of ${limit} has been reached. Deactivate students or ask PrepWise to raise the limit.`, 'STUDENT_LIMIT_REACHED');

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const sendInviteEmail = async (institution, user, link) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject: `You have been invited to PrepWise by ${institution.name}`,
      html: `<p>Hello ${escapeHtml(user.name)},</p>
<p>${escapeHtml(institution.name)} has invited you to PrepWise as a ${user.role.replace('_', ' ')}.</p>
<p><a href="${link}">Accept your invitation and set a password</a></p>
<p>This link is valid for 7 days. If you did not expect this email, you can ignore it.</p>`,
    });
    // false when the email was suppressed outside production (see config/nodemailer.js)
    return !info?.suppressed;
  } catch (error) {
    console.error('Invite email failed:', error.message);
    return false;
  }
};

/**
 * Invites one person. `seats` is an optional shared counter ({ used }) so an import counts seats once.
 * Throws PeopleError for anything the caller should see as a 4xx.
 */
export const inviteUser = async ({ institution, actor, email, name, role = 'student', group, seats }) => {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) throw new PeopleError(400, 'A valid email is required', 'INVALID_EMAIL');
  if (!ROLES.includes(role)) throw new PeopleError(400, `Role must be one of: ${ROLES.join(', ')}`, 'INVALID_ROLE');
  const cleanedGroup = cleanGroup(group);
  if (!emailDomainAllowed(institution, cleanEmail)) {
    throw new PeopleError(400, `Email must use one of the approved domains: ${institution.allowedEmailDomains.join(', ')}`, 'DOMAIN_NOT_ALLOWED');
  }
  const cleanName = String(name || '').trim().slice(0, 100) || cleanEmail.split('@')[0];

  // Email is unique across the platform. The message must not reveal which institution holds it.
  if (await peopleRepo.findByEmail(cleanEmail)) {
    throw new PeopleError(409, 'A user with this email already exists', 'EMAIL_IN_USE');
  }

  const limit = institution.contractedStudentLimit || 0;
  let usedAfter;
  if (role === 'student') {
    const used = seats ? seats.used : await seatsUsed(institution);
    if (used >= limit) throw limitError(limit);
    usedAfter = used + 1;
  }

  const invite = createInviteToken();
  const user = await peopleRepo.createUser({
    name: cleanName,
    email: cleanEmail,
    role,
    group: cleanedGroup,
    institutionId: institution._id,
    status: 'invited',
    inviteTokenHash: invite.hash,
    inviteExpiresAt: invite.expiresAt,
  });
  if (seats && role === 'student') seats.used = usedAfter;

  await audit({ actor: actor?.id, action: 'user.invite', target: user._id, institutionId: institution._id, meta: { email: cleanEmail, role } });

  const link = buildInviteLink(invite.token);
  const emailSent = await sendInviteEmail(institution, user, link);
  const warning = role === 'student' ? seatWarning(usedAfter, limit) : undefined;

  return {
    user: publicUser(user),
    emailSent,
    ...(warning ? { warning } : {}),
    ...(exposeInviteLinks() ? { inviteLink: link } : {}),
  };
};

export const importUsers = async ({ institution, actor, csvText }) => {
  const parsed = parseUsersCsv(csvText);
  if (parsed.error) throw new PeopleError(parsed.tooMany ? 413 : 400, parsed.error, parsed.tooMany ? 'TOO_MANY_ROWS' : 'INVALID_CSV');

  const seats = { used: await seatsUsed(institution) };
  const limit = institution.contractedStudentLimit || 0;
  const results = [];
  let limitHit = false;
  const seenEmails = new Set();

  // Every row is validated first (email, role, group, domain, already exists) and labelled by its real problem.
  // inviteUser checks the student limit last, so only valid new student rows become blocked_limit.
  // Staff rows are still added after the limit is reached, because they are free.
  for (const row of parsed.rows) {
    const base = { line: row.line, email: row.email, role: row.role };
    if (row.email && seenEmails.has(row.email)) {
      results.push({ ...base, status: 'skipped', reason: 'Duplicate email in this file' });
      continue;
    }
    seenEmails.add(row.email);
    try {
      const r = await inviteUser({ institution, actor, email: row.email, name: row.name, role: row.role, group: row.group, seats });
      results.push({ ...base, status: 'invited', emailSent: r.emailSent, ...(r.inviteLink ? { inviteLink: r.inviteLink } : {}) });
    } catch (error) {
      if (!(error instanceof PeopleError)) throw error;
      if (error.code === 'STUDENT_LIMIT_REACHED') limitHit = true;
      results.push({
        ...base,
        status: error.code === 'EMAIL_IN_USE' ? 'skipped' : error.code === 'STUDENT_LIMIT_REACHED' ? 'blocked_limit' : 'error',
        reason: error.code === 'STUDENT_LIMIT_REACHED' ? `Student limit of ${limit} reached` : error.message,
      });
    }
  }

  const summary = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), { total: results.length });
  await audit({ actor: actor?.id, action: 'user.import', institutionId: institution._id, meta: summary });

  const warning = seatWarning(seats.used, limit);
  return { results, summary, ...(limitHit ? { limitReached: true } : {}), ...(warning ? { warning } : {}) };
};

const loadTarget = async (institution, id) => {
  const user = /^[a-f\d]{24}$/i.test(String(id)) ? await peopleRepo.findByIdInInstitution(id, institution._id) : null;
  if (!user) throw new PeopleError(404, 'Person not found', 'NOT_FOUND');
  return user;
};

const guardLastAdmin = async (institution, user) => {
  if (user.role === 'university_admin' && user.status === 'active' && (await peopleRepo.countActiveAdmins(institution._id)) <= 1) {
    throw new PeopleError(409, 'This is the only active administrator. Invite another administrator first.', 'LAST_ADMIN');
  }
};

export const deactivateUser = async ({ institution, actor, id }) => {
  const user = await loadTarget(institution, id);
  if (String(user._id) === String(actor.id)) throw new PeopleError(400, 'You cannot deactivate your own account', 'SELF');
  if (user.status === 'deactivated') throw new PeopleError(409, 'This person is already deactivated', 'ALREADY');
  await guardLastAdmin(institution, user);
  // Deactivating someone who never accepted cancels the invitation: the link stops working and the seat is freed.
  const inviteCancelled = user.status === 'invited';
  user.status = 'deactivated';
  if (inviteCancelled) {
    user.inviteTokenHash = '';
    user.inviteExpiresAt = null;
  }
  await user.save();
  await audit({
    actor: actor.id, action: 'user.deactivate', target: user._id, institutionId: institution._id,
    ...(inviteCancelled ? { meta: { inviteCancelled: true } } : {}),
  });
  return { user: publicUser(user) };
};

export const reactivateUser = async ({ institution, actor, id }) => {
  const user = await loadTarget(institution, id);
  if (user.status !== 'deactivated') throw new PeopleError(409, 'This person is not deactivated', 'NOT_DEACTIVATED');
  const limit = institution.contractedStudentLimit || 0;
  if (user.role === 'student' && (await seatsUsed(institution)) >= limit) throw limitError(limit);

  // Someone who never accepted their invitation goes back to 'invited' with a fresh link.
  let link;
  if (user.password) {
    user.status = 'active';
  } else {
    const invite = createInviteToken();
    user.status = 'invited';
    user.inviteTokenHash = invite.hash;
    user.inviteExpiresAt = invite.expiresAt;
    link = buildInviteLink(invite.token);
  }
  await user.save();
  const emailSent = link ? await sendInviteEmail(institution, user, link) : undefined;
  await audit({ actor: actor.id, action: 'user.reactivate', target: user._id, institutionId: institution._id });
  return {
    user: publicUser(user),
    ...(link && exposeInviteLinks() ? { inviteLink: link } : {}),
    ...(emailSent === undefined ? {} : { emailSent }),
  };
};

export const resendInvite = async ({ institution, actor, id }) => {
  const user = await loadTarget(institution, id);
  if (user.status !== 'invited') throw new PeopleError(409, 'Only people with a pending invitation can be sent a new one', 'NOT_INVITED');
  const invite = createInviteToken();
  user.inviteTokenHash = invite.hash;
  user.inviteExpiresAt = invite.expiresAt;
  await user.save();
  const link = buildInviteLink(invite.token);
  const emailSent = await sendInviteEmail(institution, user, link);
  await audit({ actor: actor.id, action: 'user.invite_resend', target: user._id, institutionId: institution._id });
  return { user: publicUser(user), emailSent, ...(exposeInviteLinks() ? { inviteLink: link } : {}) };
};

export const setGroup = async ({ institution, actor, id, group }) => {
  if (group === undefined) throw new PeopleError(400, 'group is required (send "" to clear it)', 'INVALID_GROUP');
  const g = cleanGroup(group);
  const user = await loadTarget(institution, id);
  const from = user.group || '';
  const updated = await peopleRepo.updateGroup(institution._id, user._id, g);
  if (!updated) throw new PeopleError(404, 'Person not found', 'NOT_FOUND');
  await audit({ actor: actor.id, action: 'user.group_change', target: user._id, institutionId: institution._id, meta: { from, to: g } });
  return { user: publicUser(updated) };
};

export const changeRole = async ({ institution, actor, id, role }) => {
  if (!ROLES.includes(role)) throw new PeopleError(400, `Role must be one of: ${ROLES.join(', ')}`, 'INVALID_ROLE');
  const user = await loadTarget(institution, id);
  if (String(user._id) === String(actor.id)) throw new PeopleError(400, 'You cannot change your own role', 'SELF');
  if (user.role === role) throw new PeopleError(409, 'This person already has that role', 'SAME_ROLE');
  const limit = institution.contractedStudentLimit || 0;
  const countsAsSeat = user.status === 'active' || user.status === 'invited';
  if (role === 'student' && countsAsSeat && (await seatsUsed(institution)) >= limit) throw limitError(limit);
  await guardLastAdmin(institution, user);
  const from = user.role;
  user.role = role;
  await user.save();
  await audit({ actor: actor.id, action: 'user.role_change', target: user._id, institutionId: institution._id, meta: { from, to: role } });
  return { user: publicUser(user) };
};
