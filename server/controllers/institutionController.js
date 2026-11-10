import peopleRepo from '../repositories/peopleRepo.js';
import { institutionOf } from '../middleware/tenancy.js';
import {
  PeopleError, ROLES, publicUser, getUsage, inviteUser, importUsers,
  deactivateUser, reactivateUser, resendInvite, changeRole, setGroup, cleanGroup,
} from '../services/peopleService.js';

const STATUSES = ['invited', 'active', 'deactivated'];

// Runs a handler with the caller's institution loaded and turns PeopleError into a JSON response.
const withInstitution = (fn) => async (req, res) => {
  try {
    const institution = await peopleRepo.getInstitution(institutionOf(req));
    if (!institution) return res.status(404).json({ success: false, message: 'Institution not found' });
    return await fn(req, res, institution);
  } catch (error) {
    if (error instanceof PeopleError) {
      return res.status(error.status).json({ success: false, message: error.message, code: error.code });
    }
    throw error;
  }
};

export const listPeople = withInstitution(async (req, res, institution) => {
  const { role, status, search, group } = req.query;
  if (role && !ROLES.includes(role)) return res.status(400).json({ success: false, message: 'Unknown role filter' });
  if (status && !STATUSES.includes(status)) return res.status(400).json({ success: false, message: 'Unknown status filter' });
  const filters = {
    role, status,
    search: typeof search === 'string' ? search.trim().slice(0, 100) : undefined,
    group: typeof group === 'string' && group.trim() ? cleanGroup(group) : undefined,
  };

  const [people, groups] = await Promise.all([
    peopleRepo.findUsers(institution._id, filters),
    peopleRepo.countGroups(institution._id),
  ]);

  const counts = { total: 0, byRole: {}, byStatus: {} };
  for (const g of groups) {
    counts.total += g.count;
    counts.byRole[g.role] = (counts.byRole[g.role] || 0) + g.count;
    counts.byStatus[g.status] = (counts.byStatus[g.status] || 0) + g.count;
  }
  res.json({ success: true, people: people.map(publicUser), counts, usage: await getUsage(institution) });
});

export const usage = withInstitution(async (req, res, institution) => {
  res.json({ success: true, ...(await getUsage(institution)) });
});

export const invite = withInstitution(async (req, res, institution) => {
  const { email, name, role, group } = req.body || {};
  const result = await inviteUser({ institution, actor: req.user, email, name, role: role || 'student', group });
  res.status(201).json({ success: true, ...result });
});

export const importCsv = withInstitution(async (req, res, institution) => {
  const csvText = typeof req.body === 'string' ? req.body : req.body?.csv;
  if (typeof csvText !== 'string' || !csvText.trim()) {
    throw new PeopleError(400, 'Send the CSV as the request body (Content-Type: text/csv) or as {"csv": "..."}', 'INVALID_CSV');
  }
  const result = await importUsers({ institution, actor: req.user, csvText });
  res.json({ success: true, ...result });
});

export const deactivate = withInstitution(async (req, res, institution) => {
  res.json({ success: true, ...(await deactivateUser({ institution, actor: req.user, id: req.params.id })) });
});

export const reactivate = withInstitution(async (req, res, institution) => {
  res.json({ success: true, ...(await reactivateUser({ institution, actor: req.user, id: req.params.id })) });
});

export const resend = withInstitution(async (req, res, institution) => {
  res.json({ success: true, ...(await resendInvite({ institution, actor: req.user, id: req.params.id })) });
});

export const setGroupOf = withInstitution(async (req, res, institution) => {
  res.json({ success: true, ...(await setGroup({ institution, actor: req.user, id: req.params.id, group: req.body?.group })) });
});

export const setRole = withInstitution(async (req, res, institution) => {
  res.json({ success: true, ...(await changeRole({ institution, actor: req.user, id: req.params.id, role: req.body?.role })) });
});
