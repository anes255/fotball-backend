const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');
const { auth, adminAuth } = require('../middleware/auth');

// Public routes
router.get('/', matchController.getAll);
router.get('/upcoming', matchController.getUpcoming);
router.get('/:id', matchController.getById);
router.get('/:id/can-predict', matchController.canPredict);
router.get('/tournament/:tournamentId', matchController.getByTournament);

// Admin routes
router.post('/', auth, adminAuth, matchController.create);
router.put('/:id', auth, adminAuth, matchController.update);
router.put('/:id/result', auth, adminAuth, matchController.setResult);
router.delete('/:id', auth, adminAuth, matchController.delete);

module.exports = router;
