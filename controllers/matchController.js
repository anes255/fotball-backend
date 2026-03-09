const Match = require('../models/Match');
const Prediction = require('../models/Prediction');
const pool = require('../config/database');

const matchController = {
  async getAll(req, res) {
    try {
      await Match.updateStatuses();
      const matches = await Match.findAll();
      res.json(matches);
    } catch (error) {
      console.error('Get matches error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getVisible(req, res) {
    try {
      await Match.updateStatuses();
      const matches = await Match.findVisibleToUsers();
      res.json(matches);
    } catch (error) {
      console.error('Get visible matches error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getById(req, res) {
    try {
      const match = await Match.findById(req.params.id);
      if (!match) return res.status(404).json({ error: 'Match non trouvé' });
      res.json(match);
    } catch (error) {
      console.error('Get match error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getUpcoming(req, res) {
    try {
      await Match.updateStatuses();
      const matches = await Match.findUpcoming();
      res.json(matches);
    } catch (error) {
      console.error('Get upcoming error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getByTournament(req, res) {
    try {
      const matches = await Match.findByTournament(req.params.tournamentId);
      res.json(matches);
    } catch (error) {
      console.error('Get tournament matches error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getByTournamentVisible(req, res) {
    try {
      const matches = await Match.findByTournamentVisible(req.params.tournamentId);
      res.json(matches);
    } catch (error) {
      console.error('Get tournament visible error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getByTeam(req, res) {
    try {
      const matches = await Match.findByTeam(req.params.teamId);
      res.json(matches);
    } catch (error) {
      console.error('Get team matches error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async create(req, res) {
    try {
      const { tournament_id, team1_id, team2_id, match_date, stage } = req.body;
      if (!team1_id || !team2_id || !match_date) {
        return res.status(400).json({ error: 'Tous les champs requis' });
      }
      if (team1_id === team2_id) {
        return res.status(400).json({ error: 'Équipes doivent être différentes' });
      }
      const match = await Match.create({ tournament_id, team1_id, team2_id, match_date, stage });
      res.status(201).json(match);
    } catch (error) {
      console.error('Create match error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async update(req, res) {
    try {
      const { tournament_id, team1_id, team2_id, match_date, stage } = req.body;
      const match = await Match.update(req.params.id, { tournament_id, team1_id, team2_id, match_date, stage });
      if (!match) return res.status(404).json({ error: 'Match non trouvé' });
      res.json(match);
    } catch (error) {
      console.error('Update match error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async setResult(req, res) {
    try {
      const { team1_score, team2_score } = req.body;
      const matchId = req.params.id;

      if (team1_score === undefined || team2_score === undefined) {
        return res.status(400).json({ error: 'Scores requis' });
      }

      await Match.setResult(matchId, team1_score, team2_score);
      const predictions = await Prediction.findByMatch(matchId);
      const ScoringRule = require('../models/ScoringRule');
      const rules = await ScoringRule.getAsObject();

      for (const pred of predictions) {
        const oldPoints = pred.points_earned || 0;
        const { points } = ScoringRule.calculatePoints(pred, { team1_score, team2_score }, rules);
        
        await Prediction.updatePoints(pred.id, points);
        const diff = points - oldPoints;
        if (diff !== 0) {
          await pool.query(
            'UPDATE users SET total_points = GREATEST(0, COALESCE(total_points, 0) + $1) WHERE id = $2',
            [diff, pred.user_id]
          );
        }
      }

      res.json({ message: 'Résultat enregistré', predictionsUpdated: predictions.length });
    } catch (error) {
      console.error('Set result error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async delete(req, res) {
    try {
      await Match.delete(req.params.id);
      res.json({ message: 'Match supprimé' });
    } catch (error) {
      console.error('Delete match error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async canPredict(req, res) {
    try {
      const result = await Match.canPredict(req.params.id);
      res.json(result);
    } catch (error) {
      console.error('Can predict error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

module.exports = matchController;
