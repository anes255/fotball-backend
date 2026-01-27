const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const teamRoutes = require('./teams');
const matchRoutes = require('./matches');
const predictionRoutes = require('./predictions');
const adminRoutes = require('./admin');

// Mount routes
router.use('/auth', authRoutes);
router.use('/teams', teamRoutes);
router.use('/matches', matchRoutes);
router.use('/predictions', predictionRoutes);
router.use('/admin', adminRoutes);

// Public endpoints
const AdminController = require('../controllers/adminController');
router.get('/leaderboard', AdminController.getLeaderboard);
router.get('/scoring-rules', AdminController.getScoringRules);
router.get('/settings', AdminController.getSettings);

module.exports = router;
