const pool = require('../config/database');

const TournamentTeam = {
  // Get all teams in a tournament with groups
  async findByTournament(tournamentId) {
    const result = await pool.query(`
      SELECT tt.*, t.name, t.flag_url, t.code
      FROM tournament_teams tt
      JOIN teams t ON tt.team_id = t.id
      WHERE tt.tournament_id = $1
      ORDER BY tt.group_name, tt.group_position, tt.points DESC, (tt.goals_for - tt.goals_against) DESC
    `, [tournamentId]);
    return result.rows;
  },

  // Get teams by group
  async findByGroup(tournamentId, groupName) {
    const result = await pool.query(`
      SELECT tt.*, t.name, t.flag_url, t.code
      FROM tournament_teams tt
      JOIN teams t ON tt.team_id = t.id
      WHERE tt.tournament_id = $1 AND tt.group_name = $2
      ORDER BY tt.points DESC, (tt.goals_for - tt.goals_against) DESC, tt.goals_for DESC
    `, [tournamentId, groupName]);
    return result.rows;
  },

  // Add team to tournament
  async addTeam(tournamentId, teamId, groupName, position = 0) {
    const result = await pool.query(`
      INSERT INTO tournament_teams (tournament_id, team_id, group_name, group_position)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tournament_id, team_id) 
      DO UPDATE SET group_name = $3, group_position = $4
      RETURNING *
    `, [tournamentId, teamId, groupName, position]);
    return result.rows[0];
  },

  // Remove team from tournament
  async removeTeam(tournamentId, teamId) {
    await pool.query(
      'DELETE FROM tournament_teams WHERE tournament_id = $1 AND team_id = $2',
      [tournamentId, teamId]
    );
  },

  // Update team stats after a match
  async updateStats(tournamentId, teamId, won, drawn, lost, goalsFor, goalsAgainst) {
    const result = await pool.query(`
      UPDATE tournament_teams SET
        played = played + 1,
        won = won + $3,
        drawn = drawn + $4,
        lost = lost + $5,
        goals_for = goals_for + $6,
        goals_against = goals_against + $7,
        points = points + ($3 * 3) + ($4 * 1)
      WHERE tournament_id = $1 AND team_id = $2
      RETURNING *
    `, [tournamentId, teamId, won ? 1 : 0, drawn ? 1 : 0, lost ? 1 : 0, goalsFor, goalsAgainst]);
    return result.rows[0];
  },

  // Reset all stats for a tournament
  async resetStats(tournamentId) {
    await pool.query(`
      UPDATE tournament_teams SET
        points = 0, played = 0, won = 0, drawn = 0, lost = 0,
        goals_for = 0, goals_against = 0
      WHERE tournament_id = $1
    `, [tournamentId]);
  },

  // Get groups summary
  async getGroupsSummary(tournamentId) {
    const result = await pool.query(`
      SELECT DISTINCT group_name
      FROM tournament_teams
      WHERE tournament_id = $1
      ORDER BY group_name
    `, [tournamentId]);
    return result.rows.map(r => r.group_name);
  },

  // Bulk add teams to groups
  async bulkAddTeams(tournamentId, teams) {
    // teams = [{ teamId, groupName, position }, ...]
    for (const team of teams) {
      await this.addTeam(tournamentId, team.teamId, team.groupName, team.position || 0);
    }
    return this.findByTournament(tournamentId);
  },

  // Remove all teams from tournament
  async removeAllTeams(tournamentId) {
    await pool.query('DELETE FROM tournament_teams WHERE tournament_id = $1', [tournamentId]);
  }
};

module.exports = TournamentTeam;
