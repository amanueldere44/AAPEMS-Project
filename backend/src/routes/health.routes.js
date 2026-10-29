import { Router } from 'express';
import { pool } from '../config/database.js';

const router = Router();

// Liveness: confirms that the Node.js process is responding.
router.get('/live', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      service: 'ASEMS API',
      status: 'alive',
      timestamp: new Date().toISOString(),
    },
  });
});

// Readiness: confirms that MySQL is reachable.
router.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');

    return res.status(200).json({
      success: true,
      data: {
        service: 'ASEMS API',
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The service is temporarily unavailable.',
      },
    });
  }
});

// Backwards-compatible health URL: /api/health
router.get('/', async (_req, res) => {
  try {
    await pool.query('SELECT 1');

    return res.status(200).json({
      success: true,
      data: {
        service: 'ASEMS API',
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The service is temporarily unavailable.',
      },
    });
  }
});

export default router;