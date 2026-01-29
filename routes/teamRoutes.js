const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { auth, adminAuth } = require('../middleware/auth');

router.get('/', teamController.getAll);
router.get('/:id', teamController.getById);
router.post('/', auth, adminAuth, teamController.create);
router.put('/:id', auth, adminAuth, teamController.update);
router.delete('/:id', auth, adminAuth, teamController.delete);

module.exports = router;
