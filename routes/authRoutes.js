const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');

// POST /api/auth/register - Register new user
router.post('/register', authController.register);

// POST /api/auth/login - Login user
router.post('/login', authController.login);

// GET /api/auth/verify - Verify token
router.get('/verify', auth, authController.verify);

// GET /api/auth/profile - Get user profile
router.get('/profile', auth, authController.getProfile);

module.exports = router;
