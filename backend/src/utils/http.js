export function httpError(statusCode, message, code = 'REQUEST_ERROR') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function sendData(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}
