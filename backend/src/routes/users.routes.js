
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { authorize } from '../middlewares/authorize.js';
import {
  listUsers,
  createUser,
  updateUser,
  changeUserStatus,
} from '../services/users.service.js';

const router = Router();

// Every endpoint in this router requires an authenticated administrator.
router.use(authenticate, authorize('admin'));

router.get('/', async (req, res, next) => {
  try {
    const result = await listUsers(req.query, req);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const user = await createUser(req.body, req);
    res.status(201).json({
      success: true,
      message: 'User created successfully.',
      data: { user },
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const user = await updateUser(req.params.id, req.body, req);
    res.json({
      success: true,
      message: 'User updated successfully.',
      data: { user },
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const result = await changeUserStatus(
      req.params.id,
      req.body.status,
      req,
    );

    res.json({
      success: true,
      message: 'Account status updated successfully.',
      data: { user: result },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
