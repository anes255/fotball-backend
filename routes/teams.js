const express = require('express');
const router = express.Router();
const TeamController = require('../controllers/teamController');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// Public routes
router.get('/', TeamController.getAll);
router.get('/:id', TeamController.getById);

// Admin routes
router.post('/', authenticateToken, isAdmin, TeamController.create);
router.put('/:id', authenticateToken, isAdmin, TeamController.update);
router.delete('/:id', authenticateToken, isAdmin, TeamController.delete);

module.exports = router;
