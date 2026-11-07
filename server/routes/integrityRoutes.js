import express from 'express';
import userAuth from '../middleware/userAuth.js';
import requireRole from '../middleware/requireRole.js';
import * as review from '../controllers/integrityReviewController.js';
import * as evidence from '../controllers/integrityEvidenceController.js';

const integrityRouter = express.Router();
const student = requireRole('student');
const staff = requireRole('lecturer', 'university_admin');

integrityRouter.use(userAuth);

// ---- student: only their own escalated cases ----
integrityRouter.get('/my/cases', student, review.myCases);
integrityRouter.get('/my/cases/:id', student, review.myCase);
integrityRouter.post('/my/cases/:id/response', student, review.respondToCase);

// ---- staff review queue ----
integrityRouter.get('/cases', staff, review.listCases);
integrityRouter.get('/cases/:id', staff, review.getCase);
integrityRouter.patch('/cases/:id', staff, review.updateCase);
integrityRouter.post('/sessions/:id/analyse', staff, review.analyseOneSession);
integrityRouter.post('/assessments/:id/analyse', staff, review.analyseAssessment);
integrityRouter.post('/assessments/:id/similarity/run', staff, evidence.runSimilarity);
integrityRouter.get('/assessments/:id/similarity', staff, evidence.listSimilarity);

export default integrityRouter;
