const Prediction = require('../models/Prediction');
const Match = require('../models/Match');

const predictionController = {
  async getMyPredictions(req, res) {
    try {
      const predictions = await Prediction.findByUser(req.user.id);
      res.json(predictions);
    } catch (error) {
      console.error('Get predictions error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async create(req, res) {
    try {
      const { match_id, team1_score, team2_score } = req.body;

      if (match_id === undefined || team1_score === undefined || team2_score === undefined) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
      }

      if (team1_score < 0 || team2_score < 0) {
        return res.status(400).json({ error: 'Les scores doivent être positifs' });
      }

      // Check if user can still predict (MATCH TIME BLOCKING)
      const canPredictResult = await Match.canPredict(match_id);
      
      if (!canPredictResult.canPredict) {
        return res.status(400).json({ error: canPredictResult.reason });
      }

      const prediction = await Prediction.create({
        user_id: req.user.id,
        match_id,
        team1_score,
        team2_score
      });

      res.json(prediction);
    } catch (error) {
      console.error('Create prediction error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getByMatch(req, res) {
    try {
      const prediction = await Prediction.findByUserAndMatch(req.user.id, req.params.matchId);
      res.json(prediction || null);
    } catch (error) {
      console.error('Get prediction by match error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

module.exports = predictionController;
