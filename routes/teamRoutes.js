const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { auth, adminAuth } = require('../middleware/auth');

// GET /api/teams - Get all teams (public)
router.get('/', teamController.getAll);

// GET /api/teams/:id - Get team by ID (public)
router.get('/:id', teamController.getById);

// POST /api/teams - Create team (admin only)
router.post('/', auth, adminAuth, teamController.create);

// PUT /api/teams/:id - Update team (admin only)
router.put('/:id', auth, adminAuth, teamController.update);

// DELETE /api/teams/:id - Delete team (admin only)
router.delete('/:id', auth, adminAuth, teamController.delete);

module.exports = router;
