const pool = require('../config/database');

const Player = {
  async findByTournament(tournamentId) {
    const result = await pool.query(`
      SELECT p.*, t.name as team_name, t.flag_url as team_flag
      FROM players p
      LEFT JOIN teams t ON p.team_id = t.id
      WHERE p.tournament_id = $1
      ORDER BY p.name
    `, [tournamentId]);
    return result.rows;
  },

  async findById(id) {
    const result = await pool.query(`
      SELECT p.*, t.name as team_name, t.flag_url as team_flag
      FROM players p
      LEFT JOIN teams t ON p.team_id = t.id
      WHERE p.id = $1
    `, [id]);
    return result.rows[0];
  },

  async create(data) {
    const { tournament_id, name, team_id, photo_url, position } = data;
    const result = await pool.query(
      'INSERT INTO players (tournament_id, name, team_id, photo_url, position) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [tournament_id, name, team_id, photo_url, position]
    );
    return result.rows[0];
  },

  async update(id, data) {
    const { name, team_id, photo_url, position } = data;
    const result = await pool.query(
      'UPDATE players SET name = $1, team_id = $2, photo_url = $3, position = $4 WHERE id = $5 RETURNING *',
      [name, team_id, photo_url, position, id]
    );
    return result.rows[0];
  },

  async delete(id) {
    await pool.query('DELETE FROM players WHERE id = $1', [id]);
  }
};

module.exports = Player;
