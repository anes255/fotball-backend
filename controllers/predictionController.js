const Prediction = require('../models/Prediction');
const Match = require('../models/Match');

const PredictionController = {
  // Get user's predictions
  async getUserPredictions(req, res) {
    try {
      const predictions = await Prediction.findByUser(req.user.id);
      res.json(predictions);
    } catch (error) {
      console.error('Get predictions error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des pronostics' });
    }
  },

  // Get prediction for a specific match
  async getPredictionForMatch(req, res) {
    try {
      const prediction = await Prediction.findByUserAndMatch(req.user.id, req.params.matchId);
      res.json(prediction || null);
    } catch (error) {
      console.error('Get prediction error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération du pronostic' });
    }
  },

  // Create or update prediction
  async createOrUpdate(req, res) {
    try {
      const { match_id, team1_score, team2_score } = req.body;

      // Validation
      if (match_id === undefined || team1_score === undefined || team2_score === undefined) {
        return res.status(400).json({ error: 'Match ID et scores requis' });
      }

      if (team1_score < 0 || team2_score < 0) {
        return res.status(400).json({ error: 'Les scores ne peuvent pas être négatifs' });
      }

      // Check if match exists and predictions are still allowed
      const canPredict = await Match.canPredict(match_id);
      if (!canPredict) {
        return res.status(400).json({ 
          error: 'Les pronostics sont fermés pour ce match (match commencé ou terminé)' 
        });
      }

      // Create or update prediction
      const prediction = await Prediction.upsert(
        req.user.id,
        match_id,
        team1_score,
        team2_score
      );

      res.json({
        message: 'Pronostic enregistré',
        prediction
      });
    } catch (error) {
      console.error('Create prediction error:', error);
      res.status(500).json({ error: 'Erreur lors de l\'enregistrement du pronostic' });
    }
  },

  // Get predictions for multiple matches
  async getMultiple(req, res) {
    try {
      const { matchIds } = req.body;
      
      if (!matchIds || !Array.isArray(matchIds)) {
        return res.status(400).json({ error: 'Liste des matchs requise' });
      }

      const predictions = {};
      for (const matchId of matchIds) {
        const prediction = await Prediction.findByUserAndMatch(req.user.id, matchId);
        if (prediction) {
          predictions[matchId] = prediction;
        }
      }

      res.json(predictions);
    } catch (error) {
      console.error('Get multiple predictions error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des pronostics' });
    }
  },

  // Get statistics for user
  async getStats(req, res) {
    try {
      const predictions = await Prediction.findByUser(req.user.id);
      
      const stats = {
        total: predictions.length,
        correct: predictions.filter(p => p.points_earned > 0).length,
        exactScores: predictions.filter(p => 
          p.team1_score === p.actual_team1_score && 
          p.team2_score === p.actual_team2_score &&
          p.actual_team1_score !== null
        ).length,
        totalPoints: predictions.reduce((sum, p) => sum + (p.points_earned || 0), 0),
        pending: predictions.filter(p => p.status === 'upcoming').length
      };

      res.json(stats);
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
    }
  }
};

module.exports = PredictionController;
