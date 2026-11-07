// Default deny: with no roles listed, nobody gets through.
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not Authorized. Please login again' });
  }
  if (!req.user.role || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to do this' });
  }
  next();
};

export default requireRole;
