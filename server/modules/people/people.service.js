import transporter from '../../config/nodemailer.js';
import peopleRepo from './people.repo.js';
import { audit } from '../../services/audit.js';
import { createInviteToken, buildInviteLink, exposeInviteLinks } from '../../services/inviteTokens.js';
import { parseUsersCsv } from './people.csv.js';
import { withSeatLock, SeatLockBusyError } from '../../services/seatLock.js';

import { ROLES } from '../../config/roles.js';
import { cleanGroup as cleanGroupText, InvalidGroupError, MAX_GROUP_CHARS } from '../../services/groups.js';

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
  assignedGroups: u.role === 'lecturer' && Array.isArray(u.assignedGroups) ? [...u.assignedGroups] : [],
  isAccountVerified: !!u.isAccountVerified,
  lastActive: u.lastActive || null,
  createdAt: u.createdAt || null,
  inviteExpiresAt: u.status === 'invited' ? (u.inviteExpiresAt || null) : null,
});

export { MAX_GROUP_CHARS };

// Same rules as services/groups.js, reported as a 400 for the people endpoints.
export const cleanGroup = (group) => {
  try {
    return cleanGroupText(group);
  } catch (err) {
    if (err instanceof InvalidGroupError) throw new PeopleError(400, err.message, err.code);
    throw err;
  }
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

// Seat checks and the writes that take a seat run under the institution's seat lock (the same lock as email
// verification), so two requests can never both take the last seat. Emails are sent after the lock is released.
const withSeats = async (institution, fn, options) => {
  try {
    return await withSeatLock(institution._id, fn, options);
  } catch (error) {
    if (error instanceof SeatLockBusyError) {
      throw new PeopleError(503, 'Student seats are being updated right now. Try again in a moment.', 'TRY_AGAIN');
    }
    throw error;
  }
};

// A CSV import holds the lock for every row (up to 2000), so its lock lasts longer than one invite's.
const IMPORT_LOCK_MS = 60 * 1000;

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

// Validates one invitation and creates the invited user. A student takes a seat, so for students this runs under the
// seat lock: inviteUser takes it for one person, importUsers once for the whole file. `seats` ({ used }) is the
// import's shared counter. Returns what is needed to send the email once the lock is released.
const createInvite = async ({ institution, actor, email, name, role = 'student', group, seats }) => {
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
  return { user, link: buildInviteLink(invite.token), usedAfter };
};

/**
 * Invites one person. Throws PeopleError for anything the caller should see as a 4xx (503 TRY_AGAIN when the
 * seat lock stays busy).
 */
export const inviteUser = async ({ institution, actor, email, name, role = 'student', group }) => {
  const args = { institution, actor, email, name, role, group };
  const { user, link, usedAfter } = role === 'student'
    ? await withSeats(institution, () => createInvite(args))
    : await createInvite(args);

  const emailSent = await sendInviteEmail(institution, user, link);
  const warning = role === 'student' ? seatWarning(usedAfter, institution.contractedStudentLimit || 0) : undefined;
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

  const limit = institution.contractedStudentLimit || 0;
  const results = [];
  const created = []; // [result, { user, link }] to email once the lock is released
  let limitHit = false;
  const seenEmails = new Set();
  let seats;

  // Every row is validated first (email, role, group, domain, already exists) and labelled by its real problem.
  // createInvite checks the student limit last, so only valid new student rows become blocked_limit.
  // Staff rows are still added after the limit is reached, because they are free.
  await withSeats(institution, async () => {
    seats = { used: await seatsUsed(institution) };
    for (const row of parsed.rows) {
      const base = { line: row.line, email: row.email, role: row.role };
      if (row.email && seenEmails.has(row.email)) {
        results.push({ ...base, status: 'skipped', reason: 'Duplicate email in this file' });
        continue;
      }
      seenEmails.add(row.email);
      try {
        const invite = await createInvite({ institution, actor, email: row.email, name: row.name, role: row.role, group: row.group, seats });
        const result = { ...base, status: 'invited' };
        results.push(result);
        created.push([result, invite]);
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
  }, { ttlMs: IMPORT_LOCK_MS });

  for (const [result, { user, link }] of created) {
    result.emailSent = await sendInviteEmail(institution, user, link);
    if (exposeInviteLinks()) result.inviteLink = link;
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

  // Someone who never accepted their invitation goes back to 'invited' with a fresh link.
  const reactivate = async () => {
    if (user.role === 'student' && (await seatsUsed(institution)) >= limit) throw limitError(limit);
    let fresh;
    if (user.password) {
      user.status = 'active';
    } else {
      const invite = createInviteToken();
      user.status = 'invited';
      user.inviteTokenHash = invite.hash;
      user.inviteExpiresAt = invite.expiresAt;
      fresh = buildInviteLink(invite.token);
    }
    await user.save();
    return fresh;
  };
  const link = user.role === 'student' ? await withSeats(institution, reactivate) : await reactivate();
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

// Cancels a self-signup that was never verified. The account is removed (it has no password, seat or data),
// so the address can be invited, or sign up again, straight away.
export const cancelSignup = async ({ institution, actor, id }) => {
  const user = await loadTarget(institution, id);
  if (user.status !== 'unverified') throw new PeopleError(409, 'Only sign-ups waiting for email verification can be cancelled', 'NOT_UNVERIFIED');
  if (!(await peopleRepo.deleteUnverified(institution._id, user._id))) {
    throw new PeopleError(409, 'Only sign-ups waiting for email verification can be cancelled', 'NOT_UNVERIFIED');
  }
  await audit({ actor: actor.id, action: 'user.signup_cancel', target: user._id, institutionId: institution._id, meta: { email: user.email } });
  return { cancelled: true, id: String(user._id) };
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

export const MAX_ASSIGNED_GROUPS = 20;

// The groups whose students a lecturer sees on the dashboard. Every value is cleaned before it reaches the model.
export const setAssignedGroups = async ({ institution, actor, id, groups }) => {
  const user = await loadTarget(institution, id);
  if (user.role !== 'lecturer') throw new PeopleError(400, 'Groups can only be assigned to lecturers', 'NOT_A_LECTURER');
  if (!Array.isArray(groups)) throw new PeopleError(400, 'groups must be a list of group names', 'INVALID_GROUPS');
  const cleaned = [...new Set(groups.map((g) => cleanGroup(g)).filter(Boolean))];
  if (cleaned.length > MAX_ASSIGNED_GROUPS) {
    throw new PeopleError(400, `A lecturer can have at most ${MAX_ASSIGNED_GROUPS} groups`, 'TOO_MANY_GROUPS');
  }
  const from = Array.isArray(user.assignedGroups) ? [...user.assignedGroups] : [];
  const updated = await peopleRepo.updateAssignedGroups(institution._id, user._id, cleaned);
  if (!updated) throw new PeopleError(404, 'Person not found', 'NOT_FOUND');
  await audit({ actor: actor.id, action: 'user.assigned_groups_change', target: user._id, institutionId: institution._id, meta: { from, to: cleaned } });
  return { user: publicUser(updated) };
};

export const listStudentGroups = async (institution) =>
  [...new Set(await peopleRepo.distinctStudentGroups(institution._id))].sort((a, b) => a.localeCompare(b));

export const changeRole = async ({ institution, actor, id, role }) => {
  if (!ROLES.includes(role)) throw new PeopleError(400, `Role must be one of: ${ROLES.join(', ')}`, 'INVALID_ROLE');
  const user = await loadTarget(institution, id);
  if (String(user._id) === String(actor.id)) throw new PeopleError(400, 'You cannot change your own role', 'SELF');
  // A self-signup is a student until it is verified; changing its role would create staff nobody invited.
  if (user.status === 'unverified') throw new PeopleError(400, "This person hasn't verified their email yet.", 'ACCOUNT_NOT_VERIFIED');
  if (user.role === role) throw new PeopleError(409, 'This person already has that role', 'SAME_ROLE');
  const limit = institution.contractedStudentLimit || 0;
  const countsAsSeat = user.status === 'active' || user.status === 'invited';
  await guardLastAdmin(institution, user);
  const from = user.role;
  const apply = async () => {
    if (role === 'student' && countsAsSeat && (await seatsUsed(institution)) >= limit) throw limitError(limit);
    user.role = role;
    await user.save();
  };
  if (role === 'student' && countsAsSeat) await withSeats(institution, apply);
  else await apply();
  await audit({ actor: actor.id, action: 'user.role_change', target: user._id, institutionId: institution._id, meta: { from, to: role } });
  return { user: publicUser(user) };
};
