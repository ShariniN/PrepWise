import express from 'express';
import userAuth from '../../middleware/userAuth.js';
import requireRole from '../../middleware/requireRole.js';
import * as lecturer from './lecturer.controller.js';

// Lecturer dashboard. Lecturers and university admins only; always the caller's own university.
const lecturerRouter = express.Router();

lecturerRouter.use(userAuth, requireRole('lecturer', 'university_admin'));

lecturerRouter.get('/overview', lecturer.overview);
lecturerRouter.get('/students.csv', lecturer.studentsCsv); // before /students/:id
lecturerRouter.get('/students', lecturer.students);
lecturerRouter.get('/students/:id', lecturer.student);
lecturerRouter.get('/students/:id/interviews/:interviewId', lecturer.interview);

export default lecturerRouter;
