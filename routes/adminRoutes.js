const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { auth, adminAuth } = require('../middleware/auth');

// All routes require admin auth
router.use(auth, adminAuth);

// Users
router.get('/users', adminController.getUsers);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

// Scoring Rules
router.get('/scoring-rules', adminController.getScoringRules);
router.put('/scoring-rules', adminController.updateScoringRules);

// Site Settings (Colors)
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

// Tournament Teams (Groups)
router.get('/tournaments/:tournamentId/teams', adminController.getTournamentTeams);
router.post('/tournaments/:tournamentId/teams', adminController.addTournamentTeam);
router.post('/tournaments/:tournamentId/teams/bulk', adminController.bulkAddTournamentTeams);
router.delete('/tournaments/:tournamentId/teams/:teamId', adminController.removeTournamentTeam);

// Tournament Format Options
router.get('/tournament-formats', adminController.getFormatOptions);

// Award Tournament Winner
router.post('/award-tournament-winner', adminController.awardTournamentWinner);

module.exports = router;
