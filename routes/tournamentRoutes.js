const express = require('express');
const router = express.Router();
const tournamentController = require('../controllers/tournamentController');
const TournamentTeam = require('../models/TournamentTeam');
const { auth, adminAuth } = require('../middleware/auth');

// Public routes
router.get('/', tournamentController.getAll);
router.get('/active', tournamentController.getActive);
router.get('/formats', (req, res) => {
  const Tournament = require('../models/Tournament');
  res.json(Tournament.getFormatOptions());
});
router.get('/:id', tournamentController.getById);
router.get('/:id/matches', tournamentController.getMatches);

// Get tournament teams/groups (public)
router.get('/:id/teams', async (req, res) => {
  try {
    const teams = await TournamentTeam.findByTournament(req.params.id);
    res.json(teams);
  } catch (error) {
    console.error('Get tournament teams error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get groups summary
router.get('/:id/groups', async (req, res) => {
  try {
    const Tournament = require('../models/Tournament');
    const tournament = await Tournament.findById(req.params.id);
    const teams = await TournamentTeam.findByTournament(req.params.id);
    
    // Group teams by group_name
    const groups = {};
    teams.forEach(team => {
      const groupName = team.group_name || 'A';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(team);
    });

    // Sort each group by points, goal diff, goals for
    Object.keys(groups).forEach(groupName => {
      groups[groupName].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const diffA = a.goals_for - a.goals_against;
        const diffB = b.goals_for - b.goals_against;
        if (diffB !== diffA) return diffB - diffA;
        return b.goals_for - a.goals_for;
      });
    });

    res.json({
      tournament,
      groups,
      groupNames: Object.keys(groups).sort()
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
