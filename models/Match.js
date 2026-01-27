const pool = require('../config/db');

const Match = {
  // Get all matches with team details
  async findAll() {
    const result = await pool.query(
      `SELECT m.*, 
              t1.name as team1_name, t1.code as team1_code, t1.flag_url as team1_flag,
              t2.name as team2_name, t2.code as team2_code, t2.flag_url as team2_flag
       FROM matches m
       JOIN teams t1 ON m.team1_id = t1.id
       JOIN teams t2 ON m.team2_id = t2.id
       ORDER BY m.match_date ASC`
    );
    return result.rows;
  },

  // Find match by ID
  async findById(id) {
    const result = await pool.query(
      `SELECT m.*, 
              t1.name as team1_name, t1.code as team1_code, t1.flag_url as team1_flag,
              t2.name as team2_name, t2.code as team2_code, t2.flag_url as team2_flag
       FROM matches m
       JOIN teams t1 ON m.team1_id = t1.id
       JOIN teams t2 ON m.team2_id = t2.id
       WHERE m.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  // Get upcoming matches
  async findUpcoming() {
    const result = await pool.query(
      `SELECT m.*, 
              t1.name as team1_name, t1.code as team1_code, t1.flag_url as team1_flag,
              t2.name as team2_name, t2.code as team2_code, t2.flag_url as team2_flag
       FROM matches m
       JOIN teams t1 ON m.team1_id = t1.id
       JOIN teams t2 ON m.team2_id = t2.id
       WHERE m.status = 'upcoming' AND m.match_date > NOW()
       ORDER BY m.match_date ASC`
    );
    return result.rows;
  },

  // Get completed matches
  async findCompleted() {
    const result = await pool.query(
      `SELECT m.*, 
              t1.name as team1_name, t1.code as team1_code, t1.flag_url as team1_flag,
              t2.name as team2_name, t2.code as team2_code, t2.flag_url as team2_flag
       FROM matches m
       JOIN teams t1 ON m.team1_id = t1.id
       JOIN teams t2 ON m.team2_id = t2.id
       WHERE m.status = 'completed'
       ORDER BY m.match_date DESC`
    );
    return result.rows;
  },

  // Create new match
  async create({ team1_id, team2_id, match_date, stage }) {
    const result = await pool.query(
      `INSERT INTO matches (team1_id, team2_id, match_date, stage, status) 
       VALUES ($1, $2, $3, $4, 'upcoming') 
       RETURNING *`,
      [team1_id, team2_id, match_date, stage || 'Groupes']
    );
    return result.rows[0];
  },

  // Update match
  async update(id, { team1_id, team2_id, match_date, stage, status }) {
    const result = await pool.query(
      `UPDATE matches 
       SET team1_id = COALESCE($1, team1_id),
           team2_id = COALESCE($2, team2_id),
           match_date = COALESCE($3, match_date),
           stage = COALESCE($4, stage),
           status = COALESCE($5, status)
       WHERE id = $6 
       RETURNING *`,
      [team1_id, team2_id, match_date, stage, status, id]
    );
    return result.rows[0];
  },

  // Set match result
  async setResult(id, team1_score, team2_score) {
    const result = await pool.query(
      `UPDATE matches 
       SET team1_score = $1, team2_score = $2, status = 'completed'
       WHERE id = $3 
       RETURNING *`,
      [team1_score, team2_score, id]
    );
    return result.rows[0];
  },

  // Delete match
  async delete(id) {
    // Delete associated predictions first
    await pool.query('DELETE FROM predictions WHERE match_id = $1', [id]);
    
    const result = await pool.query(
      'DELETE FROM matches WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  },

  // Check if predictions are still allowed
  async canPredict(matchId) {
    const result = await pool.query(
      `SELECT * FROM matches 
       WHERE id = $1 AND status = 'upcoming' AND match_date > NOW()`,
      [matchId]
    );
    return result.rows.length > 0;
  },

  // Update match statuses based on time
  async updateStatuses() {
    // Set matches that have started to 'live'
    await pool.query(
      `UPDATE matches 
       SET status = 'live' 
       WHERE status = 'upcoming' AND match_date <= NOW()`
    );
  }
};

module.exports = Match;
