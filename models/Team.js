const pool = require('../config/database');

const Team = {
  async findAll() {
    const result = await pool.query('SELECT * FROM teams ORDER BY group_name, name');
    return result.rows;
  },

  async findById(id) {
    const result = await pool.query('SELECT * FROM teams WHERE id = $1', [id]);
    return result.rows[0];
  },

  async create(teamData) {
    const { name, code, flag_url, group_name } = teamData;
    const result = await pool.query(
      'INSERT INTO teams (name, code, flag_url, group_name) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, code || null, flag_url || null, group_name || null]
    );
    return result.rows[0];
  },

  async update(id, teamData) {
    const { name, code, flag_url, group_name } = teamData;
    const result = await pool.query(
      'UPDATE teams SET name = $1, code = $2, flag_url = $3, group_name = $4 WHERE id = $5 RETURNING *',
      [name, code || null, flag_url || null, group_name || null, id]
    );
    return result.rows[0];
  },

  async delete(id) {
    await pool.query('DELETE FROM teams WHERE id = $1', [id]);
  },

  async isUsedInMatches(id) {
    const result = await pool.query(
      'SELECT id FROM matches WHERE team1_id = $1 OR team2_id = $1 LIMIT 1',
      [id]
    );
    return result.rows.length > 0;
  }
};

module.exports = Team;
