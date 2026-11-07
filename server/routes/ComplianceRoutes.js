import express from 'express';
import { subprocessors } from '../controllers/complianceController.js';

const complianceRouter = express.Router();

// Public on purpose: universities ask for this list before they sign.
complianceRouter.get('/subprocessors', subprocessors);

export default complianceRouter;
