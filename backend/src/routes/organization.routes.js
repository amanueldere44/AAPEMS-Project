import { Router } from 'express';
import { requireAuth, allowRoles } from '../middlewares/auth.js';
import { asyncHandler, sendData } from '../utils/http.js';
import { parseId } from '../utils/db.js';
import * as org from '../services/organizationService.js';

// Organization structure (administrator only): academic units, departments and department staff.
const router = Router();
router.use(requireAuth, allowRoles('admin'));

/* Academic units */
router.get('/units', asyncHandler(async (req, res) => sendData(res, await org.listUnits())));
router.post('/units', asyncHandler(async (req, res) => sendData(res, await org.createUnit(req.user, req.body, req.ip), 201)));
router.patch('/units/:id', asyncHandler(async (req, res) =>
  sendData(res, await org.updateUnit(req.user, parseId(req.params.id, 'unit ID'), req.body, req.ip))));
router.delete('/units/:id', asyncHandler(async (req, res) =>
  sendData(res, await org.deleteUnit(req.user, parseId(req.params.id, 'unit ID'), req.ip))));

/* Departments */
router.get('/departments', asyncHandler(async (req, res) => sendData(res, await org.listDepartments(req.query))));
router.post('/departments', asyncHandler(async (req, res) => sendData(res, await org.createDepartment(req.user, req.body, req.ip), 201)));
router.patch('/departments/:id', asyncHandler(async (req, res) =>
  sendData(res, await org.updateDepartment(req.user, parseId(req.params.id, 'department ID'), req.body, req.ip))));
router.delete('/departments/:id', asyncHandler(async (req, res) =>
  sendData(res, await org.deleteDepartment(req.user, parseId(req.params.id, 'department ID'), req.ip))));

/* Department staff */
router.get('/unassigned-users', asyncHandler(async (req, res) => sendData(res, await org.listUnassignedUsers(req.query))));
router.get('/departments/:id/members', asyncHandler(async (req, res) =>
  sendData(res, await org.listMembers(parseId(req.params.id, 'department ID')))));
router.put('/departments/:id/members/:userId', asyncHandler(async (req, res) =>
  sendData(res, await org.setMember(req.user, parseId(req.params.id, 'department ID'), parseId(req.params.userId, 'user ID'), req.body, req.ip))));
router.delete('/departments/:id/members/:userId', asyncHandler(async (req, res) =>
  sendData(res, await org.removeMember(req.user, parseId(req.params.id, 'department ID'), parseId(req.params.userId, 'user ID'), req.ip))));

export default router;