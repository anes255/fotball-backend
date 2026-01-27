const pool = require('../config/db');

const Settings = {
  // Get all settings
  async findAll() {
    const result = await pool.query('SELECT * FROM settings');
    return result.rows;
  },

  // Get setting by key
  async get(key) {
    const result = await pool.query(
      'SELECT * FROM settings WHERE key_name = $1',
      [key]
    );
    return result.rows[0];
  },

  // Set setting value
  async set(key, value) {
    const result = await pool.query(
      `INSERT INTO settings (key_name, value) 
       VALUES ($1, $2)
       ON CONFLICT (key_name) 
       DO UPDATE SET value = $2
       RETURNING *`,
      [key, value]
    );
    return result.rows[0];
  },

  // Update multiple settings
  async updateMultiple(settings) {
    const results = [];
    for (const [key, value] of Object.entries(settings)) {
      const result = await this.set(key, String(value));
      results.push(result);
    }
    return results;
  }
};

const ScoringRules = {
  // Get all scoring rules
  async findAll() {
    const result = await pool.query('SELECT * FROM scoring_rules');
    return result.rows;
  },

  // Get scoring rules as object
  async getAsObject() {
    const rules = await this.findAll();
    const rulesObj = {};
    rules.forEach(rule => {
      rulesObj[rule.rule_type] = rule.points;
    });
    return {
      exact_score: rulesObj.exact_score || 3,
      correct_winner: rulesObj.correct_winner || 2,
      correct_draw: rulesObj.correct_draw || 3,
      tournament_winner: rulesObj.tournament_winner || 5
    };
  },

  // Update scoring rule
  async update(ruleType, points) {
    const result = await pool.query(
      `INSERT INTO scoring_rules (rule_type, points) 
       VALUES ($1, $2)
       ON CONFLICT (rule_type) 
       DO UPDATE SET points = $2
       RETURNING *`,
      [ruleType, points]
    );
    return result.rows[0];
  },

  // Update all scoring rules
  async updateAll(rules) {
    const results = [];
    for (const [ruleType, points] of Object.entries(rules)) {
      const result = await this.update(ruleType, points);
      results.push(result);
    }
    return results;
  }
};

module.exports = { Settings, ScoringRules };
