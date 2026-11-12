import express from 'express';
import userAuth from '../../middleware/userAuth.js';
import requireRole from '../../middleware/requireRole.js';
import * as dashboard from './dashboard.controller.js';

// One dashboard for lecturers (their assigned groups) and university admins (the whole university).
const dashboardRouter = express.Router();

dashboardRouter.use(userAuth, requireRole('lecturer', 'university_admin'));

dashboardRouter.get('/overview', dashboard.overview);
dashboardRouter.get('/students.csv', dashboard.studentsCsv); // before /students/:id
dashboardRouter.get('/students', dashboard.students);
dashboardRouter.get('/students/:id', dashboard.student);
dashboardRouter.get('/students/:id/interviews/:interviewId', dashboard.interview);

export default dashboardRouter;
