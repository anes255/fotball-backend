const pool = require('../config/database');

const Setting = {
  async findAll() {
    const result = await pool.query('SELECT * FROM settings');
    return result.rows;
  },

  async get(key) {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    return result.rows[0]?.value;
  },

  async set(key, value) {
    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
      [key, value]
    );
  },

  async updateAll(settings) {
    const { predictions_open, show_leaderboard } = settings;
    
    if (predictions_open !== undefined) {
      await pool.query('UPDATE settings SET value = $1 WHERE key = $2', [predictions_open, 'predictions_open']);
    }
    if (show_leaderboard !== undefined) {
      await pool.query('UPDATE settings SET value = $1 WHERE key = $2', [show_leaderboard, 'show_leaderboard']);
    }
  }
};

module.exports = Setting;
