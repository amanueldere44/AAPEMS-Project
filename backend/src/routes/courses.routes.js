import { Router } from 'express';
import { requireAuth, allowRoles } from '../middlewares/auth.js';
import { asyncHandler, sendData } from '../utils/http.js';
import { parseId } from '../utils/db.js';
import * as courses from '../services/courseService.js';

// Course catalogue and instructor assignments (administrator only).
const router = Router();
router.use(requireAuth, allowRoles('admin'));

/* Instructor assignments */
router.get('/assignments', asyncHandler(async (req, res) => sendData(res, await courses.listAssignments(req.query))));
router.post('/assignments', asyncHandler(async (req, res) =>
  sendData(res, await courses.createAssignment(req.user, req.body, req.ip), 201)));
router.delete('/assignments/:id', asyncHandler(async (req, res) =>
  sendData(res, await courses.deleteAssignment(req.user, parseId(req.params.id, 'assignment ID'), req.ip))));

/* Form options */
router.get('/options', asyncHandler(async (req, res) => sendData(res, await courses.listOptions())));

/* Courses */
router.get('/', asyncHandler(async (req, res) => sendData(res, await courses.listCourses(req.query))));
router.post('/', asyncHandler(async (req, res) => sendData(res, await courses.createCourse(req.user, req.body, req.ip), 201)));
router.patch('/:id', asyncHandler(async (req, res) =>
  sendData(res, await courses.updateCourse(req.user, parseId(req.params.id, 'course ID'), req.body, req.ip))));

export default router;