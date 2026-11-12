import {
  InstitutionError, getSettings, updateSettings, createTargetRole, updateTargetRole, deleteTargetRole,
  listTargetRoles, setStudentTargetRole,
} from './institution.service.js';

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof InstitutionError) {
      return res.status(err.status).json({ success: false, message: err.message, ...(err.code && { code: err.code }) });
    }
    return next(err);
  }
};

const scope = (req) => [req.user.institutionId, req.user.id];

export const readSettings = handle(async (req, res) => {
  res.json({ success: true, ...(await getSettings(req.user.institutionId)) });
});

export const patchSettings = handle(async (req, res) => {
  res.json({ success: true, ...(await updateSettings(...scope(req), req.body)) });
});

export const addRole = handle(async (req, res) => {
  res.status(201).json({ success: true, ...(await createTargetRole(...scope(req), req.body)) });
});

export const editRole = handle(async (req, res) => {
  res.json({ success: true, ...(await updateTargetRole(...scope(req), req.params.id, req.body)) });
});

export const removeRole = handle(async (req, res) => {
  res.json({ success: true, ...(await deleteTargetRole(...scope(req), req.params.id)) });
});

// GET /api/me/target-roles: a plain array, as the onboarding and profile pickers read it.
export const myInstitutionRoles = handle(async (req, res) => {
  res.json(await listTargetRoles(req.user.institutionId));
});

// PUT /api/me/target-role
export const setMyRole = handle(async (req, res) => {
  res.json({ success: true, ...(await setStudentTargetRole(req.user, req.body?.targetRoleId)) });
});
