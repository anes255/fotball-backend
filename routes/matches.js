const express = require('express');
const router = express.Router();
const MatchController = require('../controllers/matchController');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// Public routes
router.get('/', MatchController.getAll);
router.get('/upcoming', MatchController.getUpcoming);
router.get('/completed', MatchController.getCompleted);
router.get('/:id', MatchController.getById);

// Admin routes
router.post('/', authenticateToken, isAdmin, MatchController.create);
router.put('/:id', authenticateToken, isAdmin, MatchController.update);
router.put('/:id/result', authenticateToken, isAdmin, MatchController.setResult);
router.delete('/:id', authenticateToken, isAdmin, MatchController.delete);

module.exports = router;
