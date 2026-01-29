const User = require('../models/User');
const ScoringRule = require('../models/ScoringRule');
const Setting = require('../models/Setting');

const adminController = {
  async getUsers(req, res) {
    try {
      const users = await User.findAll();
      res.json(users);
    } catch (error) {
      console.error('Admin get users error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async updateUser(req, res) {
    try {
      const { is_admin } = req.body;
      const user = await User.update(req.params.id, { is_admin });
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }
      res.json(user);
    } catch (error) {
      console.error('Admin update user error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async deleteUser(req, res) {
    try {
      if (parseInt(req.params.id) === req.user.id) {
        return res.status(400).json({ error: 'Vous ne pouvez pas vous supprimer' });
      }
      await User.delete(req.params.id);
      res.json({ message: 'Utilisateur supprimé' });
    } catch (error) {
      console.error('Admin delete user error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getLeaderboard(req, res) {
    try {
      const leaderboard = await User.getLeaderboard();
      res.json(leaderboard);
    } catch (error) {
      console.error('Admin leaderboard error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getScoringRules(req, res) {
    try {
      const rules = await ScoringRule.findAll();
      res.json(rules);
    } catch (error) {
      console.error('Get scoring rules error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async updateScoringRules(req, res) {
    try {
      await ScoringRule.updateAll(req.body);
      res.json({ message: 'Règles mises à jour' });
    } catch (error) {
      console.error('Update scoring rules error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getSettings(req, res) {
    try {
      const settings = await Setting.findAll();
      res.json(settings);
    } catch (error) {
      console.error('Get settings error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async updateSettings(req, res) {
    try {
      await Setting.updateAll(req.body);
      res.json({ message: 'Paramètres mis à jour' });
    } catch (error) {
      console.error('Update settings error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async awardTournamentWinner(req, res) {
    try {
      const { team_id } = req.body;
      if (!team_id) {
        return res.status(400).json({ error: 'ID équipe requis' });
      }
      const rules = await ScoringRule.getAsObject();
      const bonusPoints = rules.tournament_winner || 5;
      const usersAwarded = await User.awardTournamentBonus(team_id, bonusPoints);
      res.json({ message: 'Points attribués', usersAwarded, pointsAwarded: bonusPoints });
    } catch (error) {
      console.error('Award tournament winner error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

module.exports = adminController;
