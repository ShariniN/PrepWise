import express from 'express';
import userAuth from '../middleware/userAuth.js';
import requireRole from '../middleware/requireRole.js';
import {
  listPeople, usage, invite, importCsv, deactivate, reactivate, resend, setRole, setGroupOf,
} from '../controllers/institutionController.js';

const institutionRouter = express.Router();

// Everything here is for the university administrator of the caller's own institution.
institutionRouter.use(userAuth, requireRole('university_admin'));

institutionRouter.get('/people', listPeople);
institutionRouter.get('/usage', usage);
institutionRouter.post('/people/invite', invite);
institutionRouter.post('/people/import', express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }), importCsv);
institutionRouter.patch('/people/:id/deactivate', deactivate);
institutionRouter.patch('/people/:id/reactivate', reactivate);
institutionRouter.patch('/people/:id/role', setRole);
institutionRouter.patch('/people/:id/group', setGroupOf);
institutionRouter.post('/people/:id/resend-invite', resend);

export default institutionRouter;
