const pool = require('../config/database');

const Prediction = {
  async findByUser(userId) {
    const result = await pool.query(`
      SELECT p.*, 
        m.match_date, m.team1_score as actual_team1_score, m.team2_score as actual_team2_score, m.status, m.stage,
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag,
        tour.name as tournament_name
      FROM predictions p
      JOIN matches m ON p.match_id = m.id
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      WHERE p.user_id = $1
      ORDER BY m.match_date DESC
    `, [userId]);
    return result.rows;
  },

  async findByMatch(matchId) {
    const result = await pool.query('SELECT * FROM predictions WHERE match_id = $1', [matchId]);
    return result.rows;
  },

  async findByUserAndMatch(userId, matchId) {
    const result = await pool.query(
      'SELECT * FROM predictions WHERE user_id = $1 AND match_id = $2',
      [userId, matchId]
    );
    return result.rows[0];
  },

  async create(predictionData) {
    const { user_id, match_id, team1_score, team2_score } = predictionData;
    const result = await pool.query(`
      INSERT INTO predictions (user_id, match_id, team1_score, team2_score)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, match_id) 
      DO UPDATE SET team1_score = $3, team2_score = $4
      RETURNING *
    `, [user_id, match_id, team1_score, team2_score]);
    return result.rows[0];
  },

  async updatePoints(id, points) {
    await pool.query('UPDATE predictions SET points_earned = $1 WHERE id = $2', [points, id]);
  },

  async getUserStats(userId) {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_predictions,
        SUM(CASE WHEN points_earned > 0 THEN 1 ELSE 0 END) as correct_predictions,
        SUM(points_earned) as total_points
      FROM predictions 
      WHERE user_id = $1
    `, [userId]);
    return result.rows[0];
  }
};

module.exports = Prediction;
