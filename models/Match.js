const pool = require('../config/database');

const Match = {
  async findAll() {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag, t1.code as team1_code,
        t2.name as team2_name, t2.flag_url as team2_flag, t2.code as team2_code
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      ORDER BY m.match_date ASC
    `);
    return result.rows;
  },

  async findById(id) {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.id = $1
    `, [id]);
    return result.rows[0];
  },

  async create(matchData) {
    const { team1_id, team2_id, match_date, stage } = matchData;
    const result = await pool.query(
      'INSERT INTO matches (team1_id, team2_id, match_date, stage) VALUES ($1, $2, $3, $4) RETURNING *',
      [team1_id, team2_id, match_date, stage || 'Groupes']
    );
    return result.rows[0];
  },

  async update(id, matchData) {
    const { team1_id, team2_id, match_date, stage } = matchData;
    const result = await pool.query(
      'UPDATE matches SET team1_id = $1, team2_id = $2, match_date = $3, stage = $4 WHERE id = $5 RETURNING *',
      [team1_id, team2_id, match_date, stage, id]
    );
    return result.rows[0];
  },

  async setResult(id, team1_score, team2_score) {
    const result = await pool.query(
      'UPDATE matches SET team1_score = $1, team2_score = $2, status = $3 WHERE id = $4 RETURNING *',
      [team1_score, team2_score, 'completed', id]
    );
    return result.rows[0];
  },

  async delete(id) {
    await pool.query('DELETE FROM predictions WHERE match_id = $1', [id]);
    await pool.query('DELETE FROM matches WHERE id = $1', [id]);
  }
};

module.exports = Match;
