const pool = require('../config/db');
const bcrypt = require('bcryptjs');

const User = {
  // Find user by phone
  async findByPhone(phone) {
    const result = await pool.query(
      'SELECT * FROM users WHERE phone = $1',
      [phone]
    );
    return result.rows[0];
  },

  // Find user by ID
  async findById(id) {
    const result = await pool.query(
      `SELECT u.*, t.name as predicted_winner 
       FROM users u 
       LEFT JOIN teams t ON u.predicted_winner_id = t.id 
       WHERE u.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  // Create new user
  async create({ name, phone, password, predicted_winner_id }) {
    const hashedPassword = await bcrypt.hashSync(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, phone, password, predicted_winner_id) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, name, phone, predicted_winner_id, total_points, correct_predictions, is_admin, created_at`,
      [name, phone, hashedPassword, predicted_winner_id]
    );
    return result.rows[0];
  },

  // Verify password
  async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compareSync(plainPassword, hashedPassword);
  },

  // Get all users
  async findAll() {
    const result = await pool.query(
      `SELECT u.id, u.name, u.phone, u.total_points, u.correct_predictions, 
              u.is_admin, u.created_at, t.name as predicted_winner,
              (SELECT COUNT(*) FROM predictions WHERE user_id = u.id) as total_predictions
       FROM users u 
       LEFT JOIN teams t ON u.predicted_winner_id = t.id 
       ORDER BY u.created_at DESC`
    );
    return result.rows;
  },

  // Update user
  async update(id, data) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(data.name);
    }
    if (data.is_admin !== undefined) {
      fields.push(`is_admin = $${paramCount++}`);
      values.push(data.is_admin);
    }
    if (data.total_points !== undefined) {
      fields.push(`total_points = $${paramCount++}`);
      values.push(data.total_points);
    }
    if (data.correct_predictions !== undefined) {
      fields.push(`correct_predictions = $${paramCount++}`);
      values.push(data.correct_predictions);
    }

    if (fields.length === 0) return null;

    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  },

  // Delete user
  async delete(id) {
    await pool.query('DELETE FROM predictions WHERE user_id = $1', [id]);
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  },

  // Get leaderboard
  async getLeaderboard() {
    const result = await pool.query(
      `SELECT u.id, u.name, u.total_points, u.correct_predictions, u.created_at,
              t.name as predicted_winner,
              (SELECT COUNT(*) FROM predictions WHERE user_id = u.id) as total_predictions
       FROM users u 
       LEFT JOIN teams t ON u.predicted_winner_id = t.id 
       WHERE u.is_admin = false
       ORDER BY u.total_points DESC, u.correct_predictions DESC, u.created_at ASC`
    );
    return result.rows;
  },

  // Get users who predicted a specific team as winner
  async findByPredictedWinner(teamId) {
    const result = await pool.query(
      'SELECT * FROM users WHERE predicted_winner_id = $1',
      [teamId]
    );
    return result.rows;
  },

  // Award points to user
  async addPoints(userId, points, incrementCorrect = false) {
    const result = await pool.query(
      `UPDATE users 
       SET total_points = total_points + $1,
           correct_predictions = correct_predictions + $2
       WHERE id = $3 
       RETURNING *`,
      [points, incrementCorrect ? 1 : 0, userId]
    );
    return result.rows[0];
  }
};

module.exports = User;
