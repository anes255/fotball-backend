const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Diagnostic endpoint - check what columns exist
router.get('/debug', async (req, res) => {
  try {
    // Check users table structure
    const columnsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    // Try to get one user
    const userResult = await pool.query('SELECT * FROM users LIMIT 1');
    
    res.json({
      status: 'connected',
      users_columns: columnsResult.rows,
      sample_user: userResult.rows[0] || 'no users'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      error: error.message,
      stack: error.stack
    });
  }
});

// Safe leaderboard - only select columns that definitely exist
router.get('/', async (req, res) => {
  try {
    // First, check what columns exist
    const columnsResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    const columns = columnsResult.rows.map(r => r.column_name);
    
    // Build query based on available columns
    let selectFields = ['id', 'name'];
    
    if (columns.includes('total_points')) selectFields.push('total_points');
    else selectFields.push('0 as total_points');
    
    if (columns.includes('correct_predictions')) selectFields.push('correct_predictions');
    else selectFields.push('0 as correct_predictions');
    
    if (columns.includes('total_predictions')) selectFields.push('total_predictions');
    else selectFields.push('0 as total_predictions');
    
    const orderBy = columns.includes('total_points') 
      ? 'ORDER BY total_points DESC' 
      : 'ORDER BY id';
    
    const result = await pool.query(`
      SELECT ${selectFields.join(', ')}
      FROM users 
      ${orderBy}
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Get user predictions
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Try to get predictions
    let predictions = [];
    try {
      const predictionsResult = await pool.query(`
        SELECT p.team1_score, p.team2_score, p.points_earned,
          m.match_date, m.team1_score as actual_team1_score, m.team2_score as actual_team2_score, m.status,
          t1.name as team1_name, t1.flag_url as team1_flag,
          t2.name as team2_name, t2.flag_url as team2_flag
        FROM predictions p
        JOIN matches m ON p.match_id = m.id
        JOIN teams t1 ON m.team1_id = t1.id
        JOIN teams t2 ON m.team2_id = t2.id
        WHERE p.user_id = $1 AND (m.status = 'completed' OR m.status = 'live')
        ORDER BY m.match_date DESC
      `, [userId]);
      predictions = predictionsResult.rows;
    } catch (e) {
      console.error('Error getting predictions:', e.message);
    }

    res.json({
      user: userResult.rows[0],
      predictions
    });
  } catch (error) {
    console.error('Get user predictions error:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

module.exports = router;
