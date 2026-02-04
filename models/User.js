const pool = require('../config/database');

const User = {
  async findByPhone(phone) {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    return result.rows[0];
  },

  async findById(id) {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0];
  },

  async create(userData) {
    const { name, phone, password, predicted_winner_id } = userData;
    const result = await pool.query(
      `INSERT INTO users (name, phone, password, predicted_winner_id) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, phone, password, predicted_winner_id || null]
    );
    return result.rows[0];
  },

  async updateProfile(id, data) {
    const { name, predicted_winner_id } = data;
    const result = await pool.query(
      `UPDATE users SET 
        name = COALESCE($1, name),
        predicted_winner_id = $2
       WHERE id = $3 RETURNING *`,
      [name, predicted_winner_id, id]
    );
    return result.rows[0];
  },

  async updatePoints(id, points) {
    const result = await pool.query(
      'UPDATE users SET total_points = total_points + $1 WHERE id = $2 RETURNING *',
      [points, id]
    );
    return result.rows[0];
  },

  async getLeaderboard() {
    const result = await pool.query(`
      SELECT id, name, total_points, correct_predictions, total_predictions, predicted_winner_id
      FROM users 
      ORDER BY total_points DESC, correct_predictions DESC
    `);
    return result.rows;
  }
};

module.exports = User;
