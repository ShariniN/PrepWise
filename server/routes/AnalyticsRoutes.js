import express from 'express';
import userAuth from '../middleware/userAuth.js';
import requireRole from '../middleware/requireRole.js';
import * as lecturer from '../analytics/lecturerController.js';
import * as careers from '../analytics/careersController.js';
import * as admin from '../analytics/adminController.js';

// Express 5 forwards rejected promises from async handlers to the error handler.
const analyticsRouter = express.Router();

analyticsRouter.use(userAuth);

const staff = requireRole('lecturer', 'university_admin');
analyticsRouter.get('/lecturer/failure-patterns', staff, lecturer.failurePatterns);
analyticsRouter.get('/lecturer/topic-heatmap', staff, lecturer.topicHeatmap);
analyticsRouter.get('/lecturer/students-needing-help', staff, lecturer.studentsNeedingHelp);
analyticsRouter.get('/lecturer/question-quality', staff, lecturer.questionQuality);
analyticsRouter.get('/lecturer/activity', staff, lecturer.activity);

const careerRole = requireRole('career_officer', 'university_admin');
analyticsRouter.get('/careers/readiness', careerRole, careers.readiness);
analyticsRouter.get('/careers/readiness.csv', careerRole, careers.readinessCsv);
analyticsRouter.get('/careers/coverage', careerRole, careers.coverage);
analyticsRouter.get('/careers/skills-gap', careerRole, careers.skillsGap);

const adminOnly = requireRole('university_admin');
analyticsRouter.get('/admin/overview', adminOnly, admin.overview);
analyticsRouter.get('/admin/evidence', adminOnly, admin.evidence);

export default analyticsRouter;
