const Match = require('../models/Match');
const Prediction = require('../models/Prediction');
const { ScoringRules } = require('../models/Settings');

const MatchController = {
  // Get all matches
  async getAll(req, res) {
    try {
      // Update match statuses first
      await Match.updateStatuses();
      
      const matches = await Match.findAll();
      res.json(matches);
    } catch (error) {
      console.error('Get matches error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des matchs' });
    }
  },

  // Get match by ID
  async getById(req, res) {
    try {
      const match = await Match.findById(req.params.id);
      if (!match) {
        return res.status(404).json({ error: 'Match non trouvé' });
      }
      res.json(match);
    } catch (error) {
      console.error('Get match error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération du match' });
    }
  },

  // Get upcoming matches
  async getUpcoming(req, res) {
    try {
      const matches = await Match.findUpcoming();
      res.json(matches);
    } catch (error) {
      console.error('Get upcoming matches error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des matchs à venir' });
    }
  },

  // Get completed matches
  async getCompleted(req, res) {
    try {
      const matches = await Match.findCompleted();
      res.json(matches);
    } catch (error) {
      console.error('Get completed matches error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des matchs terminés' });
    }
  },

  // Create match (Admin)
  async create(req, res) {
    try {
      const { team1_id, team2_id, match_date, stage } = req.body;

      if (!team1_id || !team2_id || !match_date) {
        return res.status(400).json({ error: 'Équipes et date requis' });
      }

      if (team1_id === team2_id) {
        return res.status(400).json({ error: 'Les deux équipes doivent être différentes' });
      }

      const match = await Match.create({ team1_id, team2_id, match_date, stage });
      const fullMatch = await Match.findById(match.id);
      res.status(201).json(fullMatch);
    } catch (error) {
      console.error('Create match error:', error);
      res.status(500).json({ error: 'Erreur lors de la création du match' });
    }
  },

  // Update match (Admin)
  async update(req, res) {
    try {
      const { team1_id, team2_id, match_date, stage, status } = req.body;
      const match = await Match.update(req.params.id, { team1_id, team2_id, match_date, stage, status });
      
      if (!match) {
        return res.status(404).json({ error: 'Match non trouvé' });
      }

      const fullMatch = await Match.findById(match.id);
      res.json(fullMatch);
    } catch (error) {
      console.error('Update match error:', error);
      res.status(500).json({ error: 'Erreur lors de la mise à jour du match' });
    }
  },

  // Set match result (Admin)
  async setResult(req, res) {
    try {
      const { team1_score, team2_score } = req.body;

      if (team1_score === undefined || team2_score === undefined) {
        return res.status(400).json({ error: 'Scores requis' });
      }

      // Set the result
      const match = await Match.setResult(req.params.id, team1_score, team2_score);
      
      if (!match) {
        return res.status(404).json({ error: 'Match non trouvé' });
      }

      // Get scoring rules and calculate points
      const scoringRules = await ScoringRules.getAsObject();
      const results = await Prediction.calculatePointsForMatch(
        req.params.id,
        team1_score,
        team2_score,
        scoringRules
      );

      res.json({
        message: 'Résultat enregistré et points calculés',
        match: await Match.findById(req.params.id),
        pointsAwarded: results.length,
        totalPoints: results.reduce((sum, r) => sum + r.points, 0)
      });
    } catch (error) {
      console.error('Set result error:', error);
      res.status(500).json({ error: 'Erreur lors de l\'enregistrement du résultat' });
    }
  },

  // Delete match (Admin)
  async delete(req, res) {
    try {
      const match = await Match.delete(req.params.id);
      
      if (!match) {
        return res.status(404).json({ error: 'Match non trouvé' });
      }

      res.json({ message: 'Match supprimé avec succès' });
    } catch (error) {
      console.error('Delete match error:', error);
      res.status(500).json({ error: 'Erreur lors de la suppression du match' });
    }
  }
};

module.exports = MatchController;
