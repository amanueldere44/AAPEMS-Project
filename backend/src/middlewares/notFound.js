export function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint was not found.',
      ...(process.env.NODE_ENV !== 'production' && {
        method: req.method,
        path: req.path,
      }),
    },
  });
}