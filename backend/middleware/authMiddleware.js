function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const sessionUser = req.session?.user;

    if (!sessionUser) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const userRole = String(sessionUser.userLevel || "")
      .trim()
      .toLowerCase();

    const allowed = allowedRoles.map((role) =>
      String(role).trim().toLowerCase()
    );

    if (!allowed.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};