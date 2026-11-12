import institutionRepo from './institution.repo.js';
import { findTargetRole } from '../../services/targetRoles.js';
import { audit } from '../../services/audit.js';

export class InstitutionError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'InstitutionError';
    this.status = status;
    this.code = code;
  }
}

const MAX_DOMAINS = 50;
const MAX_ROLES = 30;
const MAX_SKILLS = 30;
const MAX_TITLE = 80;
const MAX_DESCRIPTION = 2000;
const MAX_SKILL_CHARS = 60;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const isId = (value) => /^[0-9a-f]{24}$/i.test(String(value));
const idOf = (value) => (value == null ? null : String(value));

export const roleView = (role) => ({
  id: idOf(role._id),
  title: role.title,
  description: role.description || '',
  skills: role.skills || [],
});

const rolesOf = (institution) => (institution.targetRoles || []).map(roleView);

const settingsView = (institution) => ({
  allowedEmailDomains: institution.allowedEmailDomains || [],
  selfSignup: !!institution.selfSignup,
  contractedStudentLimit: institution.contractedStudentLimit,
  targetRoles: rolesOf(institution),
});

const loadInstitution = async (institutionId) => {
  const institution = await institutionRepo.getInstitution(institutionId);
  if (!institution) throw new InstitutionError(404, 'Institution not found');
  return institution;
};

export const getSettings = async (institutionId) => settingsView(await loadInstitution(institutionId));

const cleanDomains = (value) => {
  if (!Array.isArray(value)) throw new InstitutionError(400, 'Allowed email domains must be a list.');
  const domains = [...new Set(value.map((d) => String(d).trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];
  if (domains.length > MAX_DOMAINS) throw new InstitutionError(400, `You can list up to ${MAX_DOMAINS} email domains.`);
  const bad = domains.find((d) => !DOMAIN_RE.test(d));
  if (bad) throw new InstitutionError(400, `"${bad}" is not a valid email domain. Use a form like university.edu.`);
  return domains;
};

export const updateSettings = async (institutionId, actorId, body = {}) => {
  if ('contractedStudentLimit' in body) {
    throw new InstitutionError(400, 'The student limit is set in your contract. Contact us to change it.', 'LIMIT_NOT_EDITABLE');
  }
  const patch = {};
  if ('allowedEmailDomains' in body) patch.allowedEmailDomains = cleanDomains(body.allowedEmailDomains);
  if ('selfSignup' in body) {
    if (typeof body.selfSignup !== 'boolean') throw new InstitutionError(400, 'Self sign-up must be on or off.');
    patch.selfSignup = body.selfSignup;
  }
  if (Object.keys(patch).length === 0) throw new InstitutionError(400, 'Nothing to change.');
  const updated = await institutionRepo.updateSettings(institutionId, patch);
  if (!updated) throw new InstitutionError(404, 'Institution not found');
  await audit({ actor: actorId, action: 'institution.settings', institutionId, meta: { fields: Object.keys(patch) } });
  return settingsView(updated);
};

const cleanSkills = (value) => {
  if (!Array.isArray(value)) throw new InstitutionError(400, 'Skills must be a list.');
  const skills = [...new Set(value.map((s) => String(s).trim()).filter(Boolean))];
  if (skills.length > MAX_SKILLS) throw new InstitutionError(400, `A role can list up to ${MAX_SKILLS} skills.`);
  if (skills.some((s) => s.length > MAX_SKILL_CHARS)) throw new InstitutionError(400, `Each skill can be up to ${MAX_SKILL_CHARS} characters.`);
  return skills;
};

// Only the fields present in the body are returned, so an edit keeps the rest. A new role needs a title.
const cleanRoleFields = (body = {}, { requireTitle }) => {
  const fields = {};
  if ('title' in body || requireTitle) {
    const title = String(body.title ?? '').trim();
    if (!title) throw new InstitutionError(400, 'A role needs a title.');
    if (title.length > MAX_TITLE) throw new InstitutionError(400, `The title can be up to ${MAX_TITLE} characters.`);
    fields.title = title;
  }
  if ('description' in body) {
    const description = String(body.description ?? '').trim();
    if (description.length > MAX_DESCRIPTION) throw new InstitutionError(400, `The description can be up to ${MAX_DESCRIPTION} characters.`);
    fields.description = description;
  }
  if ('skills' in body) fields.skills = cleanSkills(body.skills);
  return fields;
};

export const createTargetRole = async (institutionId, actorId, body) => {
  const fields = cleanRoleFields(body, { requireTitle: true });
  const institution = await loadInstitution(institutionId);
  if ((institution.targetRoles || []).length >= MAX_ROLES) {
    throw new InstitutionError(400, `You can have up to ${MAX_ROLES} target roles.`);
  }
  const updated = await institutionRepo.addTargetRole(institutionId, { description: '', skills: [], ...fields });
  const targetRoles = rolesOf(updated);
  const targetRole = targetRoles[targetRoles.length - 1];
  await audit({ actor: actorId, action: 'targetRole.create', target: targetRole.id, institutionId });
  return { targetRole, targetRoles };
};

export const updateTargetRole = async (institutionId, actorId, roleId, body) => {
  if (!isId(roleId)) throw new InstitutionError(404, 'Target role not found');
  const fields = cleanRoleFields(body, { requireTitle: false });
  if (Object.keys(fields).length === 0) throw new InstitutionError(400, 'Nothing to change.');
  const updated = await institutionRepo.updateTargetRole(institutionId, roleId, fields);
  if (!updated) throw new InstitutionError(404, 'Target role not found');
  const targetRoles = rolesOf(updated);
  await audit({ actor: actorId, action: 'targetRole.update', target: String(roleId), institutionId });
  return { targetRole: targetRoles.find((r) => r.id === String(roleId)), targetRoles };
};

export const deleteTargetRole = async (institutionId, actorId, roleId) => {
  if (!isId(roleId)) throw new InstitutionError(404, 'Target role not found');
  const updated = await institutionRepo.deleteTargetRole(institutionId, roleId);
  if (!updated) {
    const institution = await loadInstitution(institutionId);
    if (!findTargetRole(institution, roleId)) throw new InstitutionError(404, 'Target role not found');
    throw new InstitutionError(409, 'You need at least one target role. Add another before deleting this one.', 'LAST_TARGET_ROLE');
  }
  await institutionRepo.clearTargetRole(institutionId, roleId);
  await audit({ actor: actorId, action: 'targetRole.delete', target: String(roleId), institutionId });
  return { targetRoles: rolesOf(updated) };
};

// What any signed-in user of the institution may see: no skills list.
export const listTargetRoles = async (institutionId) => {
  const institution = await loadInstitution(institutionId);
  return (institution.targetRoles || []).map((r) => ({ id: idOf(r._id), title: r.title, description: r.description || '' }));
};

export const setStudentTargetRole = async (user, targetRoleId) => {
  const institution = await loadInstitution(user.institutionId);
  const role = isId(targetRoleId) ? findTargetRole(institution, targetRoleId) : null;
  if (!role) throw new InstitutionError(400, 'Choose one of the roles your university offers.', 'TARGET_ROLE_INVALID');
  await institutionRepo.setStudentTargetRole(user.institutionId, user._id || user.id, role._id);
  return { targetRoleId: idOf(role._id), targetRoleTitle: role.title };
};

// The student's chosen role as stored on the institution. Null when they have none or it no longer exists.
export const targetRoleOf = async (user) => {
  if (!user.targetRoleId) return null;
  const institution = await institutionRepo.getInstitution(user.institutionId);
  return findTargetRole(institution, user.targetRoleId);
};

export const targetRoleTitleFor = async (user) => (await targetRoleOf(user))?.title || null;
