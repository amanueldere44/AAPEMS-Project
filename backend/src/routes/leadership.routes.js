import { Router } from 'express';
import { requireAuth, allowRoles } from '../middlewares/auth.js';
import { asyncHandler, sendData } from '../utils/http.js';
import { parseId } from '../utils/db.js';
import * as leadership from '../services/leadershipService.js';

// Leadership evaluations (separate from the instructor workflow):
//   dean / vice dean -> department head, academic affairs VP / vice director -> dean.
// Form versions and assignments are managed by administrators; evaluators fill in
// and submit only the evaluations assigned to them.
const router = Router();
router.use(requireAuth);

const EVALUATORS = ['dean', 'academic_vp'];

/* Forms ----------------------------------------------------------- */

router.get('/forms', allowRoles('admin', ...EVALUATORS), asyncHandler(async (req, res) => {
  sendData(res, await leadership.listForms());
}));

router.post('/forms/:type/versions', allowRoles('admin'), asyncHandler(async (req, res) => {
  sendData(res, await leadership.createVersion(req.user, req.params.type, req.body, req.ip), 201);
}));

router.get('/versions/:versionId', allowRoles('admin'), asyncHandler(async (req, res) => {
  sendData(res, await leadership.getVersion(parseId(req.params.versionId, 'version ID')));
}));

router.put('/versions/:versionId', allowRoles('admin'), asyncHandler(async (req, res) => {
  sendData(res, await leadership.updateVersion(req.user, parseId(req.params.versionId, 'version ID'), req.body, req.ip));
}));

router.post('/versions/:versionId/publish', allowRoles('admin'), asyncHandler(async (req, res) => {
  sendData(res, await leadership.publishVersion(req.user, parseId(req.params.versionId, 'version ID'), req.ip));
}));

/* Assignments (administrator) -------------------------------------- */

router.get('/candidates/:type', allowRoles('admin'), asyncHandler(async (req, res) => {
  sendData(res, await leadership.listCandidates(req.params.type));
}));

router.post('/evaluations', allowRoles('admin'), asyncHandler(async (req, res) => {
  sendData(res, await leadership.createAssignment(req.user, req.body, req.ip), 201);
}));

router.delete('/evaluations/:id', allowRoles('admin'), asyncHandler(async (req, res) => {
  sendData(res, await leadership.deleteAssignment(req.user, parseId(req.params.id, 'evaluation ID'), req.ip));
}));

/* Evaluations ------------------------------------------------------ */

router.get('/evaluations', allowRoles('admin', ...EVALUATORS), asyncHandler(async (req, res) => {
  sendData(res, await leadership.listEvaluations(req.user, req.query));
}));

router.get('/evaluations/:id', allowRoles('admin', ...EVALUATORS), asyncHandler(async (req, res) => {
  sendData(res, await leadership.getEvaluation(req.user, parseId(req.params.id, 'evaluation ID')));
}));

router.put('/evaluations/:id/draft', allowRoles(...EVALUATORS), asyncHandler(async (req, res) => {
  sendData(res, await leadership.saveDraft(req.user, parseId(req.params.id, 'evaluation ID'), req.body));
}));

router.post('/evaluations/:id/submit', allowRoles(...EVALUATORS), asyncHandler(async (req, res) => {
  sendData(res, await leadership.submitEvaluation(req.user, parseId(req.params.id, 'evaluation ID'), req.body, req.ip));
}));

export default router;