const pool = require('../config/database');

const Match = {
  async findAll() {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag, t1.code as team1_code,
        t2.name as team2_name, t2.flag_url as team2_flag, t2.code as team2_code,
        tour.name as tournament_name, tour.logo_url as tournament_logo
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      ORDER BY m.match_date ASC
    `);
    return result.rows;
  },

  async findById(id) {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag,
        tour.name as tournament_name, tour.logo_url as tournament_logo
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      WHERE m.id = $1
    `, [id]);
    return result.rows[0];
  },

  async findByTournament(tournamentId) {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag, t1.code as team1_code,
        t2.name as team2_name, t2.flag_url as team2_flag, t2.code as team2_code
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.tournament_id = $1
      ORDER BY m.match_date ASC
    `, [tournamentId]);
    return result.rows;
  },

  async findUpcoming() {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag, t1.code as team1_code,
        t2.name as team2_name, t2.flag_url as team2_flag, t2.code as team2_code,
        tour.name as tournament_name
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      WHERE m.status = 'upcoming' AND m.match_date > NOW()
      ORDER BY m.match_date ASC
    `);
    return result.rows;
  },

  async create(matchData) {
    const { tournament_id, team1_id, team2_id, match_date, stage } = matchData;
    const result = await pool.query(
      `INSERT INTO matches (tournament_id, team1_id, team2_id, match_date, stage) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tournament_id || null, team1_id, team2_id, match_date, stage || 'Groupes']
    );
    return result.rows[0];
  },

  async update(id, matchData) {
    const { tournament_id, team1_id, team2_id, match_date, stage } = matchData;
    const result = await pool.query(
      `UPDATE matches 
       SET tournament_id = $1, team1_id = $2, team2_id = $3, match_date = $4, stage = $5 
       WHERE id = $6 RETURNING *`,
      [tournament_id || null, team1_id, team2_id, match_date, stage, id]
    );
    return result.rows[0];
  },

  async setResult(id, team1_score, team2_score) {
    const result = await pool.query(
      'UPDATE matches SET team1_score = $1, team2_score = $2, status = $3 WHERE id = $4 RETURNING *',
      [team1_score, team2_score, 'completed', id]
    );
    return result.rows[0];
  },

  async delete(id) {
    await pool.query('DELETE FROM predictions WHERE match_id = $1', [id]);
    await pool.query('DELETE FROM matches WHERE id = $1', [id]);
  },

  // Check if match has started - BLOCKS predictions after match time
  async canPredict(id) {
    const result = await pool.query(
      'SELECT match_date, status FROM matches WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return { canPredict: false, reason: 'Match non trouvé' };
    
    const match = result.rows[0];
    const now = new Date();
    const matchDate = new Date(match.match_date);
    
    if (match.status === 'completed') {
      return { canPredict: false, reason: 'Match déjà terminé' };
    }
    
    if (match.status === 'live') {
      return { canPredict: false, reason: 'Match en cours' };
    }
    
    if (now >= matchDate) {
      return { canPredict: false, reason: 'Match déjà commencé' };
    }
    
    return { canPredict: true };
  },

  // Update match statuses (called periodically or on access)
  async updateStatuses() {
    const now = new Date().toISOString();
    // Mark matches as 'live' when they start
    await pool.query(`
      UPDATE matches 
      SET status = 'live' 
      WHERE status = 'upcoming' AND match_date <= $1
    `, [now]);
  }
};

module.exports = Match;
