const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const Prediction = require('../models/Prediction');

// Get leaderboard
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, total_points, correct_predictions, total_predictions, predicted_winner_id
      FROM users 
      ORDER BY total_points DESC, correct_predictions DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get user public profile and predictions
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user info
    const userResult = await pool.query(
      `SELECT id, name, total_points, correct_predictions, total_predictions, created_at
       FROM users WHERE id = $1`,
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Get public predictions (only for matches that have started)
    const predictions = await Prediction.getPublicPredictions(userId);
    
    // Get user rank
    const rankResult = await pool.query(`
      SELECT COUNT(*) + 1 as rank
      FROM users 
      WHERE total_points > (SELECT total_points FROM users WHERE id = $1)
    `, [userId]);

    res.json({
      user: {
        ...userResult.rows[0],
        rank: parseInt(rankResult.rows[0].rank)
      },
      predictions
    });
  } catch (error) {
    console.error('Get user predictions error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
