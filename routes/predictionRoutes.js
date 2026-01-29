const express = require('express');
const router = express.Router();
const predictionController = require('../controllers/predictionController');
const { auth } = require('../middleware/auth');

router.get('/', auth, predictionController.getMyPredictions);
router.get('/match/:matchId', auth, predictionController.getByMatch);
router.post('/', auth, predictionController.create);

module.exports = router;
