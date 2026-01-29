const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { auth, adminAuth } = require('../middleware/auth');

router.use(auth, adminAuth);

router.get('/users', adminController.getUsers);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.get('/leaderboard', adminController.getLeaderboard);
router.put('/scoring-rules', adminController.updateScoringRules);
router.put('/settings', adminController.updateSettings);
router.post('/award-tournament-winner', adminController.awardTournamentWinner);

module.exports = router;
