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

    if (!allowedRoles.includes(sessionUser.userLevel)) {
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