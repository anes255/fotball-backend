const express = require('express');
const router = express.Router();
const PredictionController = require('../controllers/predictionController');
const { authenticateToken } = require('../middleware/auth');

// All prediction routes require authentication
router.use(authenticateToken);

// Get user's predictions
router.get('/', PredictionController.getUserPredictions);

// Get user's prediction stats
router.get('/stats', PredictionController.getStats);

// Get prediction for specific match
router.get('/match/:matchId', PredictionController.getPredictionForMatch);

// Get predictions for multiple matches
router.post('/multiple', PredictionController.getMultiple);

// Create or update prediction
router.post('/', PredictionController.createOrUpdate);

module.exports = router;
