export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = Number.isInteger(error.statusCode)
    ? error.statusCode
    : error.name === 'ZodError'
      ? 400
      : error.type === 'entity.parse.failed'
        ? 400
        : 500;

  const safeClientErrors = {
    400: 'The request is invalid.',
    401: 'Authentication is required.',
    403: 'You are not permitted to perform this action.',
    404: 'The requested resource was not found.',
    409: 'The request conflicts with the current resource state.',
    422: 'The request could not be processed.',
    429: 'Too many requests. Please try again later.',
  };

  const isServerError = statusCode >= 500;

  if (isServerError) {
    console.error('ASEMS request failed.', {
      method: req.method,
      path: req.path,
      code: error.code,
      message: error.message,
      ...(process.env.NODE_ENV !== 'production' && {
        stack: error.stack,
      }),
    });
  }

  // Errors created with httpError() have a numeric statusCode and a string code,
  // and their messages were written for users (for example "hia is already active.
  // Close it first."). Show those. Parser, library and unknown errors keep the
  // generic text so internal details never leak.
  const isDeliberate =
    !isServerError &&
    Number.isInteger(error.statusCode) &&
    typeof error.code === 'string' &&
    !error.type;

  const message = isServerError
    ? 'An unexpected server error occurred.'
    : isDeliberate
      ? error.message
      : safeClientErrors[statusCode] || error.message;

  return res.status(statusCode).json({
    success: false,
    error: {
      code: isServerError
        ? 'INTERNAL_SERVER_ERROR'
        : error.code || 'REQUEST_ERROR',
      message,
    },
  });
}