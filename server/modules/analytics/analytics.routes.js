import express from 'express';
import userAuth from '../../middleware/userAuth.js';
import requireRole from '../../middleware/requireRole.js';
import * as admin from './analytics.controller.js';

// Express 5 forwards rejected promises from async handlers to the error handler.
// Lecturer views live under /api/lecturer (see modules/lecturer).
const analyticsRouter = express.Router();

analyticsRouter.use(userAuth);

const adminOnly = requireRole('university_admin');
analyticsRouter.get('/admin/overview', adminOnly, admin.overview);
analyticsRouter.get('/admin/evidence', adminOnly, admin.evidence);

export default analyticsRouter;
