const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, adminAuth } = require('../middleware/auth');

router.use(auth, adminAuth);

// Get all users
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, phone, is_admin, total_points, correct_predictions, total_predictions, created_at
      FROM users ORDER BY total_points DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update user
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_admin, total_points } = req.body;
    const result = await pool.query(
      'UPDATE users SET is_admin = COALESCE($1, is_admin), total_points = COALESCE($2, total_points) WHERE id = $3 RETURNING id, name, is_admin, total_points',
      [is_admin, total_points, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM predictions WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'Utilisateur supprimé' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get scoring rules
router.get('/scoring-rules', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM scoring_rules ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    res.json([
      { id: 1, rule_type: 'exact_score', points: 5 },
      { id: 2, rule_type: 'correct_winner', points: 2 },
      { id: 3, rule_type: 'correct_draw', points: 3 }
    ]);
  }
});

// Update scoring rules
router.put('/scoring-rules', async (req, res) => {
  try {
    const rules = req.body;
    for (const [rule_type, points] of Object.entries(rules)) {
      await pool.query(
        'INSERT INTO scoring_rules (rule_type, points) VALUES ($1, $2) ON CONFLICT (rule_type) DO UPDATE SET points = $2',
        [rule_type, parseInt(points)]
      );
    }
    const result = await pool.query('SELECT * FROM scoring_rules ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error('Update scoring rules error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
