const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');
const { auth, adminAuth } = require('../middleware/auth');

// Public routes - specific routes MUST come before parameterized routes
router.get('/visible', matchController.getVisible);
router.get('/upcoming', matchController.getUpcoming);
router.get('/team/:teamId', matchController.getByTeam);
router.get('/tournament/:tournamentId/visible', matchController.getByTournamentVisible);
router.get('/tournament/:tournamentId', auth, adminAuth, matchController.getByTournament);

// Parameterized routes
router.get('/:id/can-predict', matchController.canPredict);
router.get('/:id', matchController.getById);

// Admin routes
router.get('/', auth, adminAuth, matchController.getAll);
router.post('/', auth, adminAuth, matchController.create);
router.put('/:id', auth, adminAuth, matchController.update);
router.put('/:id/result', auth, adminAuth, matchController.setResult);
router.delete('/:id', auth, adminAuth, matchController.delete);

module.exports = router;
