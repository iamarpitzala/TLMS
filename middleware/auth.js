// Authentication & authorization middleware

function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
}

// operator or administrator
function requireOperator(req, res, next) {
  return requireRole('operator', 'administrator')(req, res, next);
}

function requireAdmin(req, res, next) {
  return requireRole('administrator')(req, res, next);
}

// viewer, operator, or administrator (e.g. verify payments)
function requireVerifier(req, res, next) {
  return requireRole('viewer', 'operator', 'administrator')(req, res, next);
}

module.exports = { requireLogin, requireRole, requireOperator, requireAdmin, requireVerifier };
