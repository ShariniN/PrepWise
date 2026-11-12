import express from 'express';
import userAuth from '../../middleware/userAuth.js';
import requireRole from '../../middleware/requireRole.js';
import { myInstitutionRoles, setMyRole } from '../institution/institution.controller.js';
import { exportMyData, deleteMyAccount, recordConsent } from './compliance.controller.js';

const meRouter = express.Router();

meRouter.use(userAuth);
meRouter.get('/export', exportMyData);
meRouter.post('/consent', recordConsent);
meRouter.delete('/', deleteMyAccount);
meRouter.get('/target-roles', myInstitutionRoles);
meRouter.put('/target-role', requireRole('student'), setMyRole);

export default meRouter;
