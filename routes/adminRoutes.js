const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { auth, adminAuth } = require('../middleware/auth');

// All admin routes require authentication and admin privileges
router.use(auth, adminAuth);

// GET /api/admin/users - Get all users
router.get('/users', adminController.getUsers);

// PUT /api/admin/users/:id - Update user
router.put('/users/:id', adminController.updateUser);

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id', adminController.deleteUser);

// GET /api/admin/leaderboard - Get leaderboard
router.get('/leaderboard', adminController.getLeaderboard);

// PUT /api/admin/scoring-rules - Update scoring rules
router.put('/scoring-rules', adminController.updateScoringRules);

// PUT /api/admin/settings - Update settings
router.put('/settings', adminController.updateSettings);

// POST /api/admin/award-tournament-winner - Award tournament winner bonus
router.post('/award-tournament-winner', adminController.awardTournamentWinner);

module.exports = router;
