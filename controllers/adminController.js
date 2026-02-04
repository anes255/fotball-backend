const pool = require('../config/database');
const ScoringRule = require('../models/ScoringRule');
const TournamentTeam = require('../models/TournamentTeam');
const Tournament = require('../models/Tournament');

const adminController = {
  // Users Management
  async getUsers(req, res) {
    try {
      const result = await pool.query(`
        SELECT id, name, phone, is_admin, total_points, correct_predictions, 
               total_predictions, predicted_winner_id, created_at
        FROM users ORDER BY total_points DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { is_admin, total_points } = req.body;
      
      const result = await pool.query(
        'UPDATE users SET is_admin = COALESCE($1, is_admin), total_points = COALESCE($2, total_points) WHERE id = $3 RETURNING id, name, is_admin, total_points',
        [is_admin, total_points, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async deleteUser(req, res) {
    try {
      const { id } = req.params;
      await pool.query('DELETE FROM predictions WHERE user_id = $1', [id]);
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      res.json({ message: 'Utilisateur supprimé' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Scoring Rules
  async getScoringRules(req, res) {
    try {
      const rules = await ScoringRule.getAll();
      res.json(rules);
    } catch (error) {
      console.error('Get scoring rules error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async updateScoringRules(req, res) {
    try {
      const rules = req.body;
      const updated = await ScoringRule.update(rules);
      res.json(updated);
    } catch (error) {
      console.error('Update scoring rules error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Site Settings (Colors)
  async getSettings(req, res) {
    try {
      const result = await pool.query('SELECT key, value FROM settings');
      const settings = {};
      result.rows.forEach(r => { settings[r.key] = r.value; });
      res.json(settings);
    } catch (error) {
      console.error('Get settings error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async updateSettings(req, res) {
    try {
      const settings = req.body;
      for (const [key, value] of Object.entries(settings)) {
        await pool.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
          [key, value]
        );
      }
      res.json({ message: 'Paramètres mis à jour' });
    } catch (error) {
      console.error('Update settings error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Tournament Teams (Groups)
  async getTournamentTeams(req, res) {
    try {
      const { tournamentId } = req.params;
      const teams = await TournamentTeam.findByTournament(tournamentId);
      res.json(teams);
    } catch (error) {
      console.error('Get tournament teams error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async addTournamentTeam(req, res) {
    try {
      const { tournamentId } = req.params;
      const { team_id, group_name, position } = req.body;
      const team = await TournamentTeam.addTeam(tournamentId, team_id, group_name, position);
      res.json(team);
    } catch (error) {
      console.error('Add tournament team error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async removeTournamentTeam(req, res) {
    try {
      const { tournamentId, teamId } = req.params;
      await TournamentTeam.removeTeam(tournamentId, teamId);
      res.json({ message: 'Équipe retirée du tournoi' });
    } catch (error) {
      console.error('Remove tournament team error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async bulkAddTournamentTeams(req, res) {
    try {
      const { tournamentId } = req.params;
      const { teams } = req.body; // [{ teamId, groupName, position }]
      
      // Clear existing teams first
      await TournamentTeam.removeAllTeams(tournamentId);
      
      // Add new teams
      const result = await TournamentTeam.bulkAddTeams(tournamentId, teams);
      res.json(result);
    } catch (error) {
      console.error('Bulk add teams error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Tournament Format Options
  async getFormatOptions(req, res) {
    try {
      const formats = Tournament.getFormatOptions();
      res.json(formats);
    } catch (error) {
      console.error('Get format options error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Award Tournament Winner
  async awardTournamentWinner(req, res) {
    try {
      const { winner_team_id } = req.body;
      const rules = await ScoringRule.getAsObject();
      const bonusPoints = rules.tournament_winner || 10;

      const result = await pool.query(
        'UPDATE users SET total_points = total_points + $1 WHERE predicted_winner_id = $2 RETURNING id, name',
        [bonusPoints, winner_team_id]
      );

      res.json({
        message: `${result.rowCount} utilisateurs ont reçu ${bonusPoints} points bonus`,
        users: result.rows
      });
    } catch (error) {
      console.error('Award winner error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Get user predictions (public)
  async getUserPredictions(req, res) {
    try {
      const { userId } = req.params;
      const Prediction = require('../models/Prediction');
      
      // Get user info
      const userResult = await pool.query(
        'SELECT id, name, total_points, correct_predictions, total_predictions FROM users WHERE id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      const predictions = await Prediction.getPublicPredictions(userId);
      
      res.json({
        user: userResult.rows[0],
        predictions
      });
    } catch (error) {
      console.error('Get user predictions error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

module.exports = adminController;
