const pool = require('../config/database');

const ScoringRule = {
  async getAll() {
    const result = await pool.query('SELECT * FROM scoring_rules ORDER BY id');
    return result.rows;
  },

  async getAsObject() {
    const result = await pool.query('SELECT rule_type, points FROM scoring_rules');
    const rules = {};
    result.rows.forEach(r => { rules[r.rule_type] = r.points; });
    return rules;
  },

  async update(rules) {
    for (const [rule_type, points] of Object.entries(rules)) {
      await pool.query(
        `INSERT INTO scoring_rules (rule_type, points) VALUES ($1, $2)
         ON CONFLICT (rule_type) DO UPDATE SET points = $2`,
        [rule_type, parseInt(points)]
      );
    }
    return this.getAll();
  },

  // Enhanced point calculation
  calculatePoints(prediction, actualScore, rules) {
    const pred = { team1: prediction.team1_score, team2: prediction.team2_score };
    const actual = { team1: actualScore.team1_score, team2: actualScore.team2_score };

    let points = 0;
    let breakdown = [];

    // Exact score - highest reward, no stacking
    if (pred.team1 === actual.team1 && pred.team2 === actual.team2) {
      points = rules.exact_score || 5;
      breakdown.push({ type: 'exact_score', points: rules.exact_score || 5, label: 'Score exact' });
      return { points, breakdown };
    }

    // Determine winners
    const predWinner = pred.team1 > pred.team2 ? 'team1' : pred.team1 < pred.team2 ? 'team2' : 'draw';
    const actualWinner = actual.team1 > actual.team2 ? 'team1' : actual.team1 < actual.team2 ? 'team2' : 'draw';

    // Correct winner/draw
    if (predWinner === actualWinner) {
      if (predWinner === 'draw') {
        const pts = rules.correct_draw || 3;
        points += pts;
        breakdown.push({ type: 'correct_draw', points: pts, label: 'Nul correct' });
      } else {
        const pts = rules.correct_winner || 2;
        points += pts;
        breakdown.push({ type: 'correct_winner', points: pts, label: 'Bon vainqueur' });

        // Correct goal difference (bonus when winner is correct)
        const predDiff = Math.abs(pred.team1 - pred.team2);
        const actualDiff = Math.abs(actual.team1 - actual.team2);
        if (predDiff === actualDiff) {
          const diffPts = rules.correct_goal_difference || 1;
          points += diffPts;
          breakdown.push({ type: 'correct_goal_difference', points: diffPts, label: 'Bonne différence' });
        }
      }
    }

    // Correct goals for individual teams (can stack)
    if (pred.team1 === actual.team1) {
      const pts = rules.correct_goals_one_team || 1;
      points += pts;
      breakdown.push({ type: 'correct_team1_goals', points: pts, label: 'Buts équipe 1' });
    }
    if (pred.team2 === actual.team2) {
      const pts = rules.correct_goals_one_team || 1;
      points += pts;
      breakdown.push({ type: 'correct_team2_goals', points: pts, label: 'Buts équipe 2' });
    }

    return { points, breakdown };
  }
};

module.exports = ScoringRule;
