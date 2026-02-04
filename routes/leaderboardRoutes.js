const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, total_points, correct_predictions, total_predictions
      FROM users 
      ORDER BY total_points DESC, correct_predictions DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const userResult = await pool.query(
      'SELECT id, name, total_points, correct_predictions, total_predictions, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const predictionsResult = await pool.query(`
      SELECT p.team1_score, p.team2_score, p.points_earned,
        m.match_date, m.team1_score as actual_team1_score, m.team2_score as actual_team2_score, m.status,
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag,
        tour.name as tournament_name
      FROM predictions p
      JOIN matches m ON p.match_id = m.id
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      WHERE p.user_id = $1 AND (m.status = 'completed' OR m.status = 'live')
      ORDER BY m.match_date DESC
    `, [userId]);
    
    const rankResult = await pool.query(
      'SELECT COUNT(*) + 1 as rank FROM users WHERE total_points > (SELECT total_points FROM users WHERE id = $1)',
      [userId]
    );

    res.json({
      user: { ...userResult.rows[0], rank: parseInt(rankResult.rows[0].rank) },
      predictions: predictionsResult.rows
    });
  } catch (error) {
    console.error('Get user predictions error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
