import express from 'express';
import userAuth from '../../middleware/userAuth.js';
import requireRole from '../../middleware/requireRole.js';
import { readSettings, patchSettings, addRole, editRole, removeRole } from './institution.controller.js';

// Mounted at /api/institution next to the people router (which owns /people and /usage).
// The admin check is per route so this router does not answer for the paths that belong to people.
const settingsRouter = express.Router();
const admin = [userAuth, requireRole('university_admin')];

settingsRouter.get('/settings', ...admin, readSettings);
settingsRouter.patch('/settings', ...admin, patchSettings);
settingsRouter.post('/target-roles', ...admin, addRole);
settingsRouter.patch('/target-roles/:id', ...admin, editRole);
settingsRouter.delete('/target-roles/:id', ...admin, removeRole);

export default settingsRouter;
