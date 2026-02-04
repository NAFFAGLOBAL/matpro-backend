const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch full user details
    const result = await pool.query(
      'SELECT id, phone, full_name, role, store_id, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const ownerOnly = (req, res, next) => {
  if (req.user.role !== 'OWNER') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
};

const storeAccess = (storeId) => {
  return (req, res, next) => {
    if (req.user.role === 'OWNER') {
      return next(); // Owner has access to all stores
    }
    
    if (req.user.store_id !== storeId) {
      return res.status(403).json({ error: 'Access denied to this store' });
    }
    next();
  };
};

module.exports = { authMiddleware, ownerOnly, storeAccess };
