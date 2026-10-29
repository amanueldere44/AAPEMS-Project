import { Router } from 'express';
import { requireAuth, allowRoles } from '../middlewares/auth.js';
import { asyncHandler, sendData } from '../utils/http.js';
import { parseId } from '../utils/db.js';
import * as archive from '../services/archiveService.js';

// Archiving at department, college/school/institute and university level.
// Archive staff record each level; administrators can read.
const router = Router();
router.use(requireAuth);

router.get('/summaries', allowRoles('archives', 'admin'), asyncHandler(async (req, res) => {
  sendData(res, await archive.listSummaries(req.query));
}));

router.get('/summaries/:summaryId/levels', allowRoles('archives', 'admin'), asyncHandler(async (req, res) => {
  sendData(res, await archive.listLevels(parseId(req.params.summaryId, 'summary ID')));
}));

router.post('/summaries/:summaryId/levels/:level', allowRoles('archives'), asyncHandler(async (req, res) => {
  sendData(res, await archive.recordLevel(req.user, parseId(req.params.summaryId, 'summary ID'), req.params.level, req.body, req.ip), 201);
}));

export default router;