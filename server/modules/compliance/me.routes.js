import express from 'express';
import userAuth from '../../middleware/userAuth.js';
import { exportMyData, deleteMyAccount, recordConsent } from './compliance.controller.js';

const meRouter = express.Router();

meRouter.use(userAuth);
meRouter.get('/export', exportMyData);
meRouter.post('/consent', recordConsent);
meRouter.delete('/', deleteMyAccount);

export default meRouter;
