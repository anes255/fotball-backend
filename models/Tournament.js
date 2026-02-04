const pool = require('../config/database');

const Tournament = {
  async findAll() {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count
      FROM tournaments t 
      ORDER BY t.start_date DESC
    `);
    return result.rows;
  },

  async findActive() {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count
      FROM tournaments t 
      WHERE t.is_active = true 
      ORDER BY t.start_date DESC
    `);
    return result.rows;
  },

  async findById(id) {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count
      FROM tournaments t 
      WHERE t.id = $1
    `, [id]);
    return result.rows[0];
  },

  async create(data) {
    const { name, description, start_date, end_date, logo_url, is_active } = data;
    const result = await pool.query(
      'INSERT INTO tournaments (name, description, start_date, end_date, logo_url, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, description, start_date, end_date, logo_url, is_active !== false]
    );
    return result.rows[0];
  },

  async update(id, data) {
    const { name, description, start_date, end_date, logo_url, is_active } = data;
    const result = await pool.query(
      'UPDATE tournaments SET name = $1, description = $2, start_date = $3, end_date = $4, logo_url = $5, is_active = $6 WHERE id = $7 RETURNING *',
      [name, description, start_date, end_date, logo_url, is_active, id]
    );
    return result.rows[0];
  },

  async delete(id) {
    await pool.query('UPDATE matches SET tournament_id = NULL WHERE tournament_id = $1', [id]);
    await pool.query('DELETE FROM tournaments WHERE id = $1', [id]);
  }
};

module.exports = Tournament;
