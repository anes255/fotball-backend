const User = require('../models/User');
const Prediction = require('../models/Prediction');
const { Settings, ScoringRules } = require('../models/Settings');

const AdminController = {
  // Get all users
  async getUsers(req, res) {
    try {
      const users = await User.findAll();
      res.json(users);
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
    }
  },

  // Get user by ID
  async getUserById(req, res) {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }
      res.json(user);
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération de l\'utilisateur' });
    }
  },

  // Update user (admin status, etc.)
  async updateUser(req, res) {
    try {
      const { is_admin, name } = req.body;
      const user = await User.update(req.params.id, { is_admin, name });
      
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      res.json(user);
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }
  },

  // Delete user
  async deleteUser(req, res) {
    try {
      // Prevent deleting own account
      if (parseInt(req.params.id) === req.user.id) {
        return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
      }

      const user = await User.delete(req.params.id);
      
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      res.json({ message: 'Utilisateur supprimé avec succès' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
  },

  // Get user's predictions (for admin view)
  async getUserPredictions(req, res) {
    try {
      const predictions = await Prediction.findByUserWithDetails(req.params.id);
      res.json(predictions);
    } catch (error) {
      console.error('Get user predictions error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des pronostics' });
    }
  },

  // Get scoring rules
  async getScoringRules(req, res) {
    try {
      const rules = await ScoringRules.findAll();
      res.json(rules);
    } catch (error) {
      console.error('Get scoring rules error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des règles' });
    }
  },

  // Update scoring rules
  async updateScoringRules(req, res) {
    try {
      const { exact_score, correct_winner, correct_draw, tournament_winner } = req.body;
      
      await ScoringRules.updateAll({
        exact_score,
        correct_winner,
        correct_draw,
        tournament_winner
      });

      res.json({ message: 'Règles de scoring mises à jour' });
    } catch (error) {
      console.error('Update scoring rules error:', error);
      res.status(500).json({ error: 'Erreur lors de la mise à jour des règles' });
    }
  },

  // Get settings
  async getSettings(req, res) {
    try {
      const settings = await Settings.findAll();
      res.json(settings);
    } catch (error) {
      console.error('Get settings error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des paramètres' });
    }
  },

  // Update settings
  async updateSettings(req, res) {
    try {
      await Settings.updateMultiple(req.body);
      res.json({ message: 'Paramètres mis à jour' });
    } catch (error) {
      console.error('Update settings error:', error);
      res.status(500).json({ error: 'Erreur lors de la mise à jour des paramètres' });
    }
  },

  // Award tournament winner points
  async awardTournamentWinner(req, res) {
    try {
      const { winner_team_id } = req.body;
      
      if (!winner_team_id) {
        return res.status(400).json({ error: 'ID de l\'équipe vainqueur requis' });
      }

      // Get scoring rules for tournament winner points
      const scoringRules = await ScoringRules.getAsObject();
      const points = scoringRules.tournament_winner || 5;

      // Find all users who predicted this team
      const users = await User.findByPredictedWinner(winner_team_id);
      
      // Award points to each user
      for (const user of users) {
        await User.addPoints(user.id, points, false);
      }

      // Save the winner in settings
      await Settings.set('tournament_winner_id', winner_team_id.toString());
      await Settings.set('tournament_winner_awarded', 'true');

      res.json({
        message: `Points attribués à ${users.length} utilisateur(s)`,
        usersAwarded: users.length,
        pointsPerUser: points
      });
    } catch (error) {
      console.error('Award tournament winner error:', error);
      res.status(500).json({ error: 'Erreur lors de l\'attribution des points' });
    }
  },

  // Get leaderboard
  async getLeaderboard(req, res) {
    try {
      const leaderboard = await User.getLeaderboard();
      res.json(leaderboard);
    } catch (error) {
      console.error('Get leaderboard error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération du classement' });
    }
  }
};

module.exports = AdminController;
