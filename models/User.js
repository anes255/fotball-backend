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
    // Check if total_points column exists
    try {
      const result = await pool.query(
        'UPDATE users SET total_points = COALESCE(total_points, 0) + $1 WHERE id = $2 RETURNING *',
        [points, id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('updatePoints error:', error.message);
      return null;
    }
  },

  async getLeaderboard() {
    try {
      // Check what columns exist
      const columnsResult = await pool.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'users'
      `);
      const columns = columnsResult.rows.map(r => r.column_name);
      
      let selectFields = ['id', 'name'];
      if (columns.includes('total_points')) selectFields.push('total_points');
      if (columns.includes('correct_predictions')) selectFields.push('correct_predictions');
      if (columns.includes('total_predictions')) selectFields.push('total_predictions');
      
      const orderBy = columns.includes('total_points') ? 'ORDER BY total_points DESC' : 'ORDER BY id';
      
      const result = await pool.query(`SELECT ${selectFields.join(', ')} FROM users ${orderBy}`);
      
      return result.rows.map(user => ({
        id: user.id,
        name: user.name,
        total_points: user.total_points || 0,
        correct_predictions: user.correct_predictions || 0,
        total_predictions: user.total_predictions || 0
      }));
    } catch (error) {
      console.error('getLeaderboard error:', error.message);
      return [];
    }
  }
};

module.exports = User;
