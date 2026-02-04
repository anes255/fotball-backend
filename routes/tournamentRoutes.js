const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { auth, adminAuth } = require('../middleware/auth');

// Get all tournaments
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count
      FROM tournaments t 
      ORDER BY t.start_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get tournaments error:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Get active tournaments
router.get('/active', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count
      FROM tournaments t 
      WHERE t.is_active = true 
      ORDER BY t.start_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get active tournaments error:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Get tournament by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count
      FROM tournaments t 
      WHERE t.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tournoi non trouvé' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get tournament error:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Get tournament matches
router.get('/:id/matches', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.tournament_id = $1
      ORDER BY m.match_date ASC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Get tournament matches error:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Admin: Create tournament
router.post('/', auth, adminAuth, async (req, res) => {
  try {
    const { name, description, start_date, end_date, logo_url, is_active } = req.body;
    const result = await pool.query(
      'INSERT INTO tournaments (name, description, start_date, end_date, logo_url, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, description, start_date, end_date, logo_url, is_active !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create tournament error:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Admin: Update tournament
router.put('/:id', auth, adminAuth, async (req, res) => {
  try {
    const { name, description, start_date, end_date, logo_url, is_active } = req.body;
    const result = await pool.query(
      'UPDATE tournaments SET name = $1, description = $2, start_date = $3, end_date = $4, logo_url = $5, is_active = $6 WHERE id = $7 RETURNING *',
      [name, description, start_date, end_date, logo_url, is_active, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tournoi non trouvé' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update tournament error:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Admin: Delete tournament
router.delete('/:id', auth, adminAuth, async (req, res) => {
  try {
    await pool.query('UPDATE matches SET tournament_id = NULL WHERE tournament_id = $1', [req.params.id]);
    await pool.query('DELETE FROM tournaments WHERE id = $1', [req.params.id]);
    res.json({ message: 'Tournoi supprimé' });
  } catch (error) {
    console.error('Delete tournament error:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

module.exports = router;
