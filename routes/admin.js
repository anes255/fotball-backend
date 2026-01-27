const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');
const TeamController = require('../controllers/teamController');
const MatchController = require('../controllers/matchController');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// All admin routes require authentication and admin status
router.use(authenticateToken, isAdmin);

// User management
router.get('/users', AdminController.getUsers);
router.get('/users/:id', AdminController.getUserById);
router.get('/users/:id/predictions', AdminController.getUserPredictions);
router.put('/users/:id', AdminController.updateUser);
router.delete('/users/:id', AdminController.deleteUser);

// Team management (duplicated from teams routes for admin prefix)
router.post('/teams', TeamController.create);
router.put('/teams/:id', TeamController.update);
router.delete('/teams/:id', TeamController.delete);

// Match management (duplicated from matches routes for admin prefix)
router.post('/matches', MatchController.create);
router.put('/matches/:id', MatchController.update);
router.put('/matches/:id/result', MatchController.setResult);
router.delete('/matches/:id', MatchController.delete);

// Scoring rules
router.get('/scoring-rules', AdminController.getScoringRules);
router.put('/scoring-rules', AdminController.updateScoringRules);

// Settings
router.get('/settings', AdminController.getSettings);
router.put('/settings', AdminController.updateSettings);

// Tournament winner
router.post('/award-tournament-winner', AdminController.awardTournamentWinner);

// Leaderboard (for admin dashboard)
router.get('/leaderboard', AdminController.getLeaderboard);

module.exports = router;
