import express from 'express';
import userAuth from '../../middleware/userAuth.js';
import requireRole from '../../middleware/requireRole.js';
import * as grading from './grading.controller.js';

const gradingRouter = express.Router();

gradingRouter.use(userAuth, requireRole('lecturer', 'university_admin'));

gradingRouter.get('/queue', grading.queue);
gradingRouter.post('/bulk-confirm', grading.bulkConfirm);
gradingRouter.get('/:id', grading.getItem);
gradingRouter.post('/:id/suggest', grading.suggest);
gradingRouter.patch('/:id', grading.confirm);

export default gradingRouter;
