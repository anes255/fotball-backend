const Match = require('../models/Match');
const Prediction = require('../models/Prediction');
const ScoringRule = require('../models/ScoringRule');
const pool = require('../config/database');

const matchController = {
  // Get all matches
  async getAll(req, res) {
    try {
      const matches = await Match.findAll();
      res.json(matches);
    } catch (error) {
      console.error('Get matches error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
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
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Create match (admin)
  async create(req, res) {
    try {
      const { team1_id, team2_id, match_date, stage } = req.body;
      
      if (!team1_id || !team2_id || !match_date) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
      }

      if (team1_id === team2_id) {
        return res.status(400).json({ error: 'Les deux équipes doivent être différentes' });
      }

      const match = await Match.create({ team1_id, team2_id, match_date, stage });
      res.status(201).json(match);
    } catch (error) {
      console.error('Create match error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Update match (admin)
  async update(req, res) {
    try {
      const { team1_id, team2_id, match_date, stage } = req.body;
      
      const match = await Match.update(req.params.id, { team1_id, team2_id, match_date, stage });
      if (!match) {
        return res.status(404).json({ error: 'Match non trouvé' });
      }
      res.json(match);
    } catch (error) {
      console.error('Update match error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Set match result and calculate points (admin)
  async setResult(req, res) {
    try {
      const { team1_score, team2_score } = req.body;
      const matchId = req.params.id;

      if (team1_score === undefined || team2_score === undefined) {
        return res.status(400).json({ error: 'Les scores sont requis' });
      }

      // Update match result
      await Match.setResult(matchId, team1_score, team2_score);

      // Get scoring rules
      const rules = await ScoringRule.getAsObject();

      // Get all predictions for this match
      const predictions = await Prediction.findByMatch(matchId);
      
      // Calculate and award points
      for (const pred of predictions) {
        let points = 0;
        
        // Exact score
        if (pred.team1_score === team1_score && pred.team2_score === team2_score) {
          points = rules.exact_score || 3;
        }
        // Correct winner
        else if (
          (pred.team1_score > pred.team2_score && team1_score > team2_score) ||
          (pred.team1_score < pred.team2_score && team1_score < team2_score)
        ) {
          points = rules.correct_winner || 2;
        }
        // Correct draw
        else if (pred.team1_score === pred.team2_score && team1_score === team2_score) {
          points = rules.correct_draw || 3;
        }

        // Update prediction points
        await Prediction.updatePoints(pred.id, points);
        
        // Update user points
        if (points > 0) {
          await pool.query(
            'UPDATE users SET total_points = total_points + $1, correct_predictions = correct_predictions + 1 WHERE id = $2',
            [points, pred.user_id]
          );
        }
      }

      res.json({ 
        message: 'Résultat enregistré et points calculés', 
        predictionsUpdated: predictions.length 
      });
    } catch (error) {
      console.error('Set result error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Delete match (admin)
  async delete(req, res) {
    try {
      await Match.delete(req.params.id);
      res.json({ message: 'Match supprimé' });
    } catch (error) {
      console.error('Delete match error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

module.exports = matchController;
