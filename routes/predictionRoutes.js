const express = require('express');
const router = express.Router();
const predictionController = require('../controllers/predictionController');
const { auth } = require('../middleware/auth');

// GET /api/predictions - Get user's predictions (authenticated)
router.get('/', auth, predictionController.getMyPredictions);

// POST /api/predictions - Make or update prediction (authenticated)
router.post('/', auth, predictionController.create);

module.exports = router;
