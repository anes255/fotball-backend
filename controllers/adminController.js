const pool = require('../config/database');

const adminController = {
  // Users Management
  async getUsers(req, res) {
    try {
      const result = await pool.query(`
        SELECT id, name, phone, is_admin, total_points, correct_predictions, 
               total_predictions, created_at
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
      const result = await pool.query('SELECT * FROM scoring_rules ORDER BY id');
      res.json(result.rows);
    } catch (error) {
      // Return defaults if table doesn't exist
      res.json([
        { id: 1, rule_type: 'exact_score', points: 5, description: 'Score exact' },
        { id: 2, rule_type: 'correct_winner', points: 2, description: 'Bon vainqueur' },
        { id: 3, rule_type: 'correct_draw', points: 3, description: 'Match nul correct' },
        { id: 4, rule_type: 'correct_goal_difference', points: 1, description: 'Bonne différence de buts' },
        { id: 5, rule_type: 'correct_goals_one_team', points: 1, description: 'Bon nombre de buts pour une équipe' },
        { id: 6, rule_type: 'tournament_winner', points: 10, description: 'Vainqueur du tournoi' }
      ]);
    }
  },

  async updateScoringRules(req, res) {
    try {
      const rules = req.body;
      for (const [rule_type, points] of Object.entries(rules)) {
        await pool.query(
          `INSERT INTO scoring_rules (rule_type, points) VALUES ($1, $2)
           ON CONFLICT (rule_type) DO UPDATE SET points = $2`,
          [rule_type, parseInt(points)]
        );
      }
      const result = await pool.query('SELECT * FROM scoring_rules ORDER BY id');
      res.json(result.rows);
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
      // Return defaults if table doesn't exist
      res.json({
        primary_color: '#6366f1',
        accent_color: '#8b5cf6',
        background_color: '#0f172a'
      });
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
      const result = await pool.query(`
        SELECT tt.*, t.name, t.flag_url, t.code
        FROM tournament_teams tt
        JOIN teams t ON tt.team_id = t.id
        WHERE tt.tournament_id = $1
        ORDER BY tt.group_name, tt.points DESC
      `, [tournamentId]);
      res.json(result.rows);
    } catch (error) {
      res.json([]);
    }
  },

  async addTournamentTeam(req, res) {
    try {
      const { tournamentId } = req.params;
      const { team_id, group_name, position } = req.body;
      const result = await pool.query(`
        INSERT INTO tournament_teams (tournament_id, team_id, group_name, group_position)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tournament_id, team_id) 
        DO UPDATE SET group_name = $3, group_position = $4
        RETURNING *
      `, [tournamentId, team_id, group_name, position || 0]);
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Add tournament team error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async removeTournamentTeam(req, res) {
    try {
      const { tournamentId, teamId } = req.params;
      await pool.query(
        'DELETE FROM tournament_teams WHERE tournament_id = $1 AND team_id = $2',
        [tournamentId, teamId]
      );
      res.json({ message: 'Équipe retirée du tournoi' });
    } catch (error) {
      console.error('Remove tournament team error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async bulkAddTournamentTeams(req, res) {
    try {
      const { tournamentId } = req.params;
      const { teams } = req.body;
      
      // Clear existing teams first
      await pool.query('DELETE FROM tournament_teams WHERE tournament_id = $1', [tournamentId]);
      
      // Add new teams
      for (const team of teams) {
        await pool.query(`
          INSERT INTO tournament_teams (tournament_id, team_id, group_name, group_position)
          VALUES ($1, $2, $3, $4)
        `, [tournamentId, team.teamId, team.groupName, team.position || 0]);
      }
      
      const result = await pool.query(`
        SELECT tt.*, t.name, t.flag_url
        FROM tournament_teams tt
        JOIN teams t ON tt.team_id = t.id
        WHERE tt.tournament_id = $1
      `, [tournamentId]);
      res.json(result.rows);
    } catch (error) {
      console.error('Bulk add teams error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Tournament Format Options
  async getFormatOptions(req, res) {
    res.json([
      { value: 'groups_4', label: '4 Groupes de 4 (16 équipes)', groups: 4, teamsPerGroup: 4 },
      { value: 'groups_6', label: '6 Groupes de 4 (24 équipes)', groups: 6, teamsPerGroup: 4 },
      { value: 'groups_8', label: '8 Groupes de 4 (32 équipes)', groups: 8, teamsPerGroup: 4 },
      { value: 'knockout_16', label: 'Élimination directe 16', groups: 0, teamsPerGroup: 0 },
      { value: 'knockout_32', label: 'Élimination directe 32', groups: 0, teamsPerGroup: 0 },
      { value: 'league', label: 'Championnat', groups: 1, teamsPerGroup: 0 }
    ]);
  },

  // Award Tournament Winner
  async awardTournamentWinner(req, res) {
    try {
      const { winner_team_id } = req.body;
      
      // Get bonus points from scoring rules
      let bonusPoints = 10;
      try {
        const rulesResult = await pool.query(
          "SELECT points FROM scoring_rules WHERE rule_type = 'tournament_winner'"
        );
        if (rulesResult.rows.length > 0) {
          bonusPoints = rulesResult.rows[0].points;
        }
      } catch (e) { /* use default */ }

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
  }
};

module.exports = adminController;
