const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');
const { auth, adminAuth } = require('../middleware/auth');

// GET /api/matches - Get all matches (public)
router.get('/', matchController.getAll);

// GET /api/matches/:id - Get match by ID (public)
router.get('/:id', matchController.getById);

// POST /api/matches - Create match (admin only)
router.post('/', auth, adminAuth, matchController.create);

// PUT /api/matches/:id - Update match (admin only)
router.put('/:id', auth, adminAuth, matchController.update);

// PUT /api/matches/:id/result - Set match result (admin only)
router.put('/:id/result', auth, adminAuth, matchController.setResult);

// DELETE /api/matches/:id - Delete match (admin only)
router.delete('/:id', auth, adminAuth, matchController.delete);

module.exports = router;
