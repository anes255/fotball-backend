const pool = require('../config/database');

const Tournament = {
  async findAll() {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches WHERE tournament_id = t.id) as match_count,
        (SELECT COUNT(*) FROM matches WHERE tournament_id = t.id AND status = 'completed') as completed_matches
      FROM tournaments t 
      ORDER BY t.is_active DESC, t.start_date DESC
    `);
    return result.rows;
  },

  async findActive() {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches WHERE tournament_id = t.id) as match_count,
        (SELECT COUNT(*) FROM matches WHERE tournament_id = t.id AND status = 'completed') as completed_matches
      FROM tournaments t 
      WHERE t.is_active = true 
      ORDER BY t.start_date DESC
    `);
    return result.rows;
  },

  async findById(id) {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches WHERE tournament_id = t.id) as match_count,
        (SELECT COUNT(*) FROM matches WHERE tournament_id = t.id AND status = 'completed') as completed_matches
      FROM tournaments t 
      WHERE t.id = $1
    `, [id]);
    return result.rows[0];
  },

  async create(data) {
    const { name, description, start_date, end_date, logo_url, is_active } = data;
    const result = await pool.query(
      `INSERT INTO tournaments (name, description, start_date, end_date, logo_url, is_active) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, description || null, start_date || null, end_date || null, logo_url || null, is_active !== false]
    );
    return result.rows[0];
  },

  async update(id, data) {
    const { name, description, start_date, end_date, logo_url, is_active } = data;
    const result = await pool.query(
      `UPDATE tournaments 
       SET name = $1, description = $2, start_date = $3, end_date = $4, logo_url = $5, is_active = $6
       WHERE id = $7 RETURNING *`,
      [name, description || null, start_date || null, end_date || null, logo_url || null, is_active, id]
    );
    return result.rows[0];
  },

  async delete(id) {
    await pool.query('UPDATE matches SET tournament_id = NULL WHERE tournament_id = $1', [id]);
    await pool.query('DELETE FROM tournaments WHERE id = $1', [id]);
  },

  async getMatches(id) {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag, t1.code as team1_code,
        t2.name as team2_name, t2.flag_url as team2_flag, t2.code as team2_code
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.tournament_id = $1
      ORDER BY m.match_date ASC
    `, [id]);
    return result.rows;
  },

  async getStandings(id) {
    // Get matches for this tournament that are completed
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.group_name as team1_group,
        t2.name as team2_name, t2.group_name as team2_group
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.tournament_id = $1 AND m.status = 'completed'
    `, [id]);
    return result.rows;
  }
};

module.exports = Tournament;
