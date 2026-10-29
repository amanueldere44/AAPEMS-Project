const VALID_ROLES = new Set([
  'admin',
  'student',
  'teacher',
  'department_head',
  'dean',
  'committee',
  'management',
  'academic_vp',
  'archives',
  'concerned_office',
]);

export function authorize(...allowedRoles) {
  if (allowedRoles.length === 0) {
    throw new Error(
      'Authorization requires at least one allowed role.',
    );
  }

  const invalidRoles = allowedRoles.filter(
    (role) => !VALID_ROLES.has(role),
  );

  if (invalidRoles.length > 0) {
    throw new Error(
      `Invalid authorization role(s): ${invalidRoles.join(', ')}`,
    );
  }

  return function roleAuthorization(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication is required.',
        code: 'AUTHENTICATION_REQUIRED',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
        code: 'FORBIDDEN',
      });
    }

    return next();
  };
}

// Backward-compatible alias for existing route files.
export const allowRoles = authorize;