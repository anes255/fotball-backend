const pool = require('../config/database');

const ScoringRule = {
  async findAll() {
    const result = await pool.query('SELECT * FROM scoring_rules ORDER BY id');
    return result.rows;
  },

  async getAsObject() {
    const result = await pool.query('SELECT * FROM scoring_rules');
    const rules = {};
    result.rows.forEach(r => { rules[r.rule_type] = r.points; });
    return rules;
  },

  async update(ruleType, points) {
    await pool.query('UPDATE scoring_rules SET points = $1 WHERE rule_type = $2', [points, ruleType]);
  },

  async updateAll(rules) {
    const { exact_score, correct_winner, correct_draw, tournament_winner } = rules;
    
    if (exact_score !== undefined) {
      await pool.query('UPDATE scoring_rules SET points = $1 WHERE rule_type = $2', [exact_score, 'exact_score']);
    }
    if (correct_winner !== undefined) {
      await pool.query('UPDATE scoring_rules SET points = $1 WHERE rule_type = $2', [correct_winner, 'correct_winner']);
    }
    if (correct_draw !== undefined) {
      await pool.query('UPDATE scoring_rules SET points = $1 WHERE rule_type = $2', [correct_draw, 'correct_draw']);
    }
    if (tournament_winner !== undefined) {
      await pool.query('UPDATE scoring_rules SET points = $1 WHERE rule_type = $2', [tournament_winner, 'tournament_winner']);
    }
  }
};

module.exports = ScoringRule;
