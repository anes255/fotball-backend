const express = require('express');
const router = express.Router();
const tournamentController = require('../controllers/tournamentController');
const { auth, adminAuth } = require('../middleware/auth');
const pool = require('../config/database');

// Public routes
router.get('/', tournamentController.getAll);
router.get('/active', tournamentController.getActive);

router.get('/formats', (req, res) => {
  res.json([
    { value: 'groups_4', label: '4 Groupes de 4 (16 équipes)', groups: 4, teamsPerGroup: 4 },
    { value: 'groups_6', label: '6 Groupes de 4 (24 équipes)', groups: 6, teamsPerGroup: 4 },
    { value: 'groups_8', label: '8 Groupes de 4 (32 équipes)', groups: 8, teamsPerGroup: 4 },
    { value: 'knockout_16', label: 'Élimination directe 16', groups: 0, teamsPerGroup: 0 },
    { value: 'knockout_32', label: 'Élimination directe 32', groups: 0, teamsPerGroup: 0 },
    { value: 'league', label: 'Championnat', groups: 1, teamsPerGroup: 0 }
  ]);
});

router.get('/:id', tournamentController.getById);
router.get('/:id/matches', tournamentController.getMatches);

// Get tournament teams/groups (with fallback)
router.get('/:id/teams', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT tt.*, t.name, t.flag_url, t.code
      FROM tournament_teams tt
      JOIN teams t ON tt.team_id = t.id
      WHERE tt.tournament_id = $1
      ORDER BY tt.group_name, tt.points DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (error) {
    // Table doesn't exist, return empty
    res.json([]);
  }
});

// Get groups summary
router.get('/:id/groups', async (req, res) => {
  try {
    // Get tournament
    const tourResult = await pool.query('SELECT * FROM tournaments WHERE id = $1', [req.params.id]);
    const tournament = tourResult.rows[0];
    
    if (!tournament) {
      return res.status(404).json({ error: 'Tournoi non trouvé' });
    }

    // Try to get teams from tournament_teams table
    let teams = [];
    let groups = {};
    let groupNames = [];
    
    try {
      const teamsResult = await pool.query(`
        SELECT tt.*, t.name, t.flag_url, t.code
        FROM tournament_teams tt
        JOIN teams t ON tt.team_id = t.id
        WHERE tt.tournament_id = $1
        ORDER BY tt.group_name, tt.points DESC, (tt.goals_for - tt.goals_against) DESC
      `, [req.params.id]);
      teams = teamsResult.rows;
      
      // Group teams by group_name
      teams.forEach(team => {
        const groupName = team.group_name || 'A';
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push(team);
      });
      groupNames = Object.keys(groups).sort();
    } catch (error) {
      // Table doesn't exist
    }

    res.json({
      tournament,
      groups,
      groupNames
    });
  } catch (error) {
    console.error('Get tournament groups error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Admin routes
router.post('/', auth, adminAuth, tournamentController.create);
router.put('/:id', auth, adminAuth, tournamentController.update);
router.delete('/:id', auth, adminAuth, tournamentController.delete);

module.exports = router;
