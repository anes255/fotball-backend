const Prediction = require('../models/Prediction');
const Match = require('../models/Match');

const predictionController = {
  // Get user's predictions
  async getMyPredictions(req, res) {
    try {
      const predictions = await Prediction.findByUser(req.user.id);
      res.json(predictions);
    } catch (error) {
      console.error('Get predictions error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Make or update prediction
  async create(req, res) {
    try {
      const { match_id, team1_score, team2_score } = req.body;

      if (match_id === undefined || team1_score === undefined || team2_score === undefined) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
      }

      if (team1_score < 0 || team2_score < 0) {
        return res.status(400).json({ error: 'Les scores doivent être positifs' });
      }

      // Check if match exists and is still open
      const match = await Match.findById(match_id);
      if (!match) {
        return res.status(404).json({ error: 'Match non trouvé' });
      }
      if (match.status === 'completed') {
        return res.status(400).json({ error: 'Match déjà terminé' });
      }
      if (new Date(match.match_date) < new Date()) {
        return res.status(400).json({ error: 'Match déjà commencé' });
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
  }
};

module.exports = predictionController;
