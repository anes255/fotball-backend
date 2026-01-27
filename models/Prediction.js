const pool = require('../config/db');

const Prediction = {
  // Get user's prediction for a match
  async findByUserAndMatch(userId, matchId) {
    const result = await pool.query(
      'SELECT * FROM predictions WHERE user_id = $1 AND match_id = $2',
      [userId, matchId]
    );
    return result.rows[0];
  },

  // Get all predictions for a user
  async findByUser(userId) {
    const result = await pool.query(
      `SELECT p.*, 
              m.match_date, m.team1_score as actual_team1_score, m.team2_score as actual_team2_score, m.status,
              t1.name as team1_name, t1.flag_url as team1_flag,
              t2.name as team2_name, t2.flag_url as team2_flag
       FROM predictions p
       JOIN matches m ON p.match_id = m.id
       JOIN teams t1 ON m.team1_id = t1.id
       JOIN teams t2 ON m.team2_id = t2.id
       WHERE p.user_id = $1
       ORDER BY m.match_date DESC`,
      [userId]
    );
    return result.rows;
  },

  // Get all predictions for a match
  async findByMatch(matchId) {
    const result = await pool.query(
      `SELECT p.*, u.name as user_name
       FROM predictions p
       JOIN users u ON p.user_id = u.id
       WHERE p.match_id = $1`,
      [matchId]
    );
    return result.rows;
  },

  // Create or update prediction
  async upsert(userId, matchId, team1Score, team2Score) {
    const result = await pool.query(
      `INSERT INTO predictions (user_id, match_id, team1_score, team2_score) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, match_id) 
       DO UPDATE SET team1_score = $3, team2_score = $4
       RETURNING *`,
      [userId, matchId, team1Score, team2Score]
    );
    return result.rows[0];
  },

  // Update points for a prediction
  async updatePoints(id, points) {
    const result = await pool.query(
      'UPDATE predictions SET points_earned = $1 WHERE id = $2 RETURNING *',
      [points, id]
    );
    return result.rows[0];
  },

  // Calculate and award points for all predictions of a match
  async calculatePointsForMatch(matchId, actualTeam1Score, actualTeam2Score, scoringRules) {
    const predictions = await this.findByMatch(matchId);
    const results = [];

    for (const prediction of predictions) {
      let points = 0;
      let isCorrect = false;

      const predictedWinner = prediction.team1_score > prediction.team2_score ? 1 : 
                              prediction.team1_score < prediction.team2_score ? 2 : 0;
      const actualWinner = actualTeam1Score > actualTeam2Score ? 1 : 
                          actualTeam1Score < actualTeam2Score ? 2 : 0;

      // Exact score
      if (prediction.team1_score === actualTeam1Score && prediction.team2_score === actualTeam2Score) {
        points = scoringRules.exact_score || 3;
        isCorrect = true;
      }
      // Correct draw (but not exact score)
      else if (predictedWinner === 0 && actualWinner === 0) {
        points = scoringRules.correct_draw || 3;
        isCorrect = true;
      }
      // Correct winner (but not exact score)
      else if (predictedWinner === actualWinner && predictedWinner !== 0) {
        points = scoringRules.correct_winner || 2;
        isCorrect = true;
      }

      // Update prediction with points
      await this.updatePoints(prediction.id, points);

      // Update user's total points
      if (points > 0) {
        await pool.query(
          `UPDATE users 
           SET total_points = total_points + $1,
               correct_predictions = correct_predictions + $2
           WHERE id = $3`,
          [points, isCorrect ? 1 : 0, prediction.user_id]
        );
      }

      results.push({
        predictionId: prediction.id,
        userId: prediction.user_id,
        points,
        isCorrect
      });
    }

    return results;
  },

  // Get predictions with user details for admin
  async findByUserWithDetails(userId) {
    const result = await pool.query(
      `SELECT p.*, 
              m.team1_score as actual_team1_score, m.team2_score as actual_team2_score,
              t1.name as team1_name, t2.name as team2_name,
              CASE 
                WHEN m.status = 'completed' THEN CONCAT(m.team1_score, ' - ', m.team2_score)
                ELSE NULL 
              END as actual_score
       FROM predictions p
       JOIN matches m ON p.match_id = m.id
       JOIN teams t1 ON m.team1_id = t1.id
       JOIN teams t2 ON m.team2_id = t2.id
       WHERE p.user_id = $1
       ORDER BY m.match_date DESC`,
      [userId]
    );
    return result.rows;
  }
};

module.exports = Prediction;
