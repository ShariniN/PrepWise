import express from 'express';
import userAuth from '../middleware/userAuth.js';
import requireRole from '../middleware/requireRole.js';
import {
  createCourse, myCourses, getCourse, createCohort, enrolStudents, cohortStudents, assignLecturer,
} from '../controllers/courseController.js';

const courseRouter = express.Router();
const teaching = requireRole('lecturer', 'university_admin');

courseRouter.use(userAuth);

courseRouter.get('/mine', requireRole('student', 'lecturer', 'university_admin'), myCourses);
courseRouter.post('/', teaching, createCourse);
courseRouter.get('/:courseId', teaching, getCourse);
courseRouter.post('/:courseId/cohorts', teaching, createCohort);
courseRouter.post('/:courseId/cohorts/:cohortId/enrol', teaching, enrolStudents);
courseRouter.get('/:courseId/cohorts/:cohortId/students', teaching, cohortStudents);
courseRouter.post('/:courseId/lecturers', requireRole('university_admin'), assignLecturer);

export default courseRouter;
