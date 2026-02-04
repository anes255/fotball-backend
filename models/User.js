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
    const { name, phone, password } = userData;
    const result = await pool.query(
      'INSERT INTO users (name, phone, password) VALUES ($1, $2, $3) RETURNING *',
      [name, phone, password]
    );
    return result.rows[0];
  },

  async updatePoints(id, points) {
    const result = await pool.query(
      'UPDATE users SET total_points = total_points + $1 WHERE id = $2 RETURNING *',
      [points, id]
    );
    return result.rows[0];
  }
};

module.exports = User;
