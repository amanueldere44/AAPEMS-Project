import { Router } from 'express';
import { requireAuth, allowRoles } from '../middlewares/auth.js';
import { asyncHandler, sendData } from '../utils/http.js';
import { parseId } from '../utils/db.js';
import * as improvement from '../services/improvementService.js';

// Improvement branch: referrals to concerned offices and support activities.
const router = Router();
router.use(requireAuth);

const REFERRERS = ['committee', 'department_head'];
const READERS = ['admin', 'committee', 'department_head', 'dean', 'concerned_office'];

/* Offices ---------------------------------------------------------- */

router.get('/offices', allowRoles(...READERS), asyncHandler(async (req, res) => {
  sendData(res, await improvement.listOffices(req.user));
}));
router.post('/offices', allowRoles('admin'), asyncHandler(async (req, res) => {
  sendData(res, await improvement.createOffice(req.user, req.body, req.ip), 201);
}));
router.patch('/offices/:id', allowRoles('admin'), asyncHandler(async (req, res) => {
  sendData(res, await improvement.updateOffice(req.user, parseId(req.params.id, 'office ID'), req.body, req.ip));
}));
router.get('/offices/:id/members', allowRoles('admin'), asyncHandler(async (req, res) => {
  sendData(res, await improvement.listMembers(parseId(req.params.id, 'office ID')));
}));
router.put('/offices/:id/members/:userId', allowRoles('admin'), asyncHandler(async (req, res) => {
  sendData(res, await improvement.addMember(req.user, parseId(req.params.id, 'office ID'), parseId(req.params.userId, 'user ID'), req.ip), 201);
}));
router.delete('/offices/:id/members/:userId', allowRoles('admin'), asyncHandler(async (req, res) => {
  sendData(res, await improvement.removeMember(req.user, parseId(req.params.id, 'office ID'), parseId(req.params.userId, 'user ID'), req.ip));
}));

/* Referrals -------------------------------------------------------- */

router.post('/referrals', allowRoles(...REFERRERS), asyncHandler(async (req, res) => {
  sendData(res, await improvement.createReferral(req.user, req.body, req.ip), 201);
}));
router.get('/referrals', allowRoles(...READERS), asyncHandler(async (req, res) => {
  sendData(res, await improvement.listReferrals(req.user, req.query));
}));
router.get('/referrals/:id', allowRoles(...READERS), asyncHandler(async (req, res) => {
  sendData(res, await improvement.getReferral(req.user, parseId(req.params.id, 'referral ID')));
}));
router.post('/referrals/:id/acknowledge', allowRoles('concerned_office'), asyncHandler(async (req, res) => {
  sendData(res, await improvement.acknowledgeReferral(req.user, parseId(req.params.id, 'referral ID'), req.ip));
}));
router.post('/referrals/:id/activities', allowRoles('concerned_office'), asyncHandler(async (req, res) => {
  sendData(res, await improvement.createActivity(req.user, parseId(req.params.id, 'referral ID'), req.body, req.ip), 201);
}));
router.patch('/activities/:id', allowRoles('concerned_office'), asyncHandler(async (req, res) => {
  sendData(res, await improvement.updateActivity(req.user, parseId(req.params.id, 'activity ID'), req.body, req.ip));
}));

export default router;