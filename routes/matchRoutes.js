const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');
const { auth, adminAuth } = require('../middleware/auth');

// Public routes
router.get('/visible', matchController.getVisible);  // Users see only 24h before
router.get('/upcoming', matchController.getUpcoming);
router.get('/team/:teamId', matchController.getByTeam);  // Matches for a team
router.get('/tournament/:tournamentId/visible', matchController.getByTournamentVisible);
router.get('/:id/can-predict', matchController.canPredict);
router.get('/:id', matchController.getById);

// Admin routes
router.get('/', auth, adminAuth, matchController.getAll);  // Admin sees all
router.get('/tournament/:tournamentId', auth, adminAuth, matchController.getByTournament);
router.post('/', auth, adminAuth, matchController.create);
router.put('/:id', auth, adminAuth, matchController.update);
router.put('/:id/result', auth, adminAuth, matchController.setResult);
router.delete('/:id', auth, adminAuth, matchController.delete);

module.exports = router;
