

module.exports = function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    const user = req.user; 

    if (!user || !user.role) {
      return res.status(403).json({ error: 'Access denied: No role found' });
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Access denied: Insufficient permissions' });
    }
    next();
  };
};
