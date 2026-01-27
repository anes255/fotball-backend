const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'pronostics-secret-key-2025';

// Verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token d\'authentification requis' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide ou expiré' });
    }
    req.user = decoded;
    next();
  });
};

// Check if user is admin
const isAdmin = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Accès administrateur requis' });
  }
  next();
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    req.user = null;
    return next();
  }
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    req.user = err ? null : decoded;
    next();
  });
};

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      name: user.name, 
      phone: user.phone,
      is_admin: user.is_admin 
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

module.exports = {
  authenticateToken,
  isAdmin,
  optionalAuth,
  generateToken,
  JWT_SECRET
};
