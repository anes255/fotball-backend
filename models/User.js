const pool = require('../config/database');
const bcrypt = require('bcryptjs');

const User = {
  async findById(id) {
    const result = await pool.query(
      'SELECT id, name, phone, is_admin, predicted_winner_id, total_points, correct_predictions, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  async findByPhone(phone) {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    return result.rows[0];
  },

  async create(userData) {
    const { name, phone, password, predicted_winner_id } = userData;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      'INSERT INTO users (name, phone, password, predicted_winner_id) VALUES ($1, $2, $3, $4) RETURNING id, name, phone, is_admin, total_points',
      [name, phone, hashedPassword, predicted_winner_id || null]
    );
    return result.rows[0];
  },

  async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  },

  async findAll() {
    const result = await pool.query(`
      SELECT u.id, u.name, u.phone, u.is_admin, u.total_points, u.correct_predictions, u.created_at,
        (SELECT COUNT(*) FROM predictions WHERE user_id = u.id) as total_predictions
      FROM users u ORDER BY u.total_points DESC
    `);
    return result.rows;
  },

  async update(id, data) {
    const { is_admin } = data;
    const result = await pool.query(
      'UPDATE users SET is_admin = $1 WHERE id = $2 RETURNING id, name, phone, is_admin, total_points',
      [is_admin, id]
    );
    return result.rows[0];
  },

  async delete(id) {
    await pool.query('DELETE FROM predictions WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
  },

  async getProfile(id) {
    const result = await pool.query(`
      SELECT u.id, u.name, u.phone, u.is_admin, u.total_points, u.correct_predictions, 
        u.predicted_winner_id, u.created_at, t.name as predicted_winner 
      FROM users u 
      LEFT JOIN teams t ON u.predicted_winner_id = t.id 
      WHERE u.id = $1
    `, [id]);
    return result.rows[0];
  },

  async getLeaderboard() {
    const result = await pool.query(`
      SELECT id, name, total_points, correct_predictions,
        (SELECT COUNT(*) FROM predictions WHERE user_id = users.id) as total_predictions
      FROM users ORDER BY total_points DESC, correct_predictions DESC LIMIT 100
    `);
    return result.rows;
  },

  async awardTournamentBonus(teamId, points) {
    const result = await pool.query(
      'UPDATE users SET total_points = total_points + $1 WHERE predicted_winner_id = $2 RETURNING id',
      [points, teamId]
    );
    return result.rowCount;
  }
};

module.exports = User;
