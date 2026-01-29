const express = require('express');
const router = express.Router();
const tournamentController = require('../controllers/tournamentController');
const { auth, adminAuth } = require('../middleware/auth');

// Public routes
router.get('/', tournamentController.getAll);
router.get('/active', tournamentController.getActive);
router.get('/:id', tournamentController.getById);
router.get('/:id/matches', tournamentController.getMatches);

// Admin routes
router.post('/', auth, adminAuth, tournamentController.create);
router.put('/:id', auth, adminAuth, tournamentController.update);
router.delete('/:id', auth, adminAuth, tournamentController.delete);

module.exports = router;
