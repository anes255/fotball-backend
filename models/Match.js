const pool = require('../config/database');

const Match = {
  async findAll() {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag,
        tour.name as tournament_name
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      ORDER BY m.match_date ASC
    `);
    return result.rows;
  },

  async findVisibleToUsers() {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag,
        tour.name as tournament_name
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      WHERE m.status = 'completed' OR m.status = 'live' OR m.match_date <= NOW() + INTERVAL '24 hours'
      ORDER BY m.match_date ASC
    `);
    return result.rows;
  },

  async findById(id) {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag,
        tour.name as tournament_name
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
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.tournament_id = $1
      ORDER BY m.match_date ASC
    `, [tournamentId]);
    return result.rows;
  },

  async findByTournamentVisible(tournamentId) {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.tournament_id = $1
        AND (m.status = 'completed' OR m.status = 'live' OR m.match_date <= NOW() + INTERVAL '24 hours')
      ORDER BY m.match_date ASC
    `, [tournamentId]);
    return result.rows;
  },

  async findByTeam(teamId) {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag,
        tour.name as tournament_name
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      WHERE m.team1_id = $1 OR m.team2_id = $1
      ORDER BY m.match_date DESC
    `, [teamId]);
    return result.rows;
  },

  async findUpcoming() {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag,
        tour.name as tournament_name
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      WHERE m.status = 'upcoming'
      ORDER BY m.match_date ASC
    `);
    return result.rows;
  },

  async create(data) {
    const { tournament_id, team1_id, team2_id, match_date, stage } = data;
    const result = await pool.query(
      'INSERT INTO matches (tournament_id, team1_id, team2_id, match_date, stage) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [tournament_id, team1_id, team2_id, match_date, stage]
    );
    return result.rows[0];
  },

  async update(id, data) {
    const { tournament_id, team1_id, team2_id, match_date, stage } = data;
    const result = await pool.query(
      'UPDATE matches SET tournament_id = $1, team1_id = $2, team2_id = $3, match_date = $4, stage = $5 WHERE id = $6 RETURNING *',
      [tournament_id, team1_id, team2_id, match_date, stage, id]
    );
    return result.rows[0];
  },

  async setResult(id, team1_score, team2_score) {
    const result = await pool.query(
      "UPDATE matches SET team1_score = $1, team2_score = $2, status = 'completed' WHERE id = $3 RETURNING *",
      [team1_score, team2_score, id]
    );
    return result.rows[0];
  },

  async delete(id) {
    await pool.query('DELETE FROM predictions WHERE match_id = $1', [id]);
    await pool.query('DELETE FROM matches WHERE id = $1', [id]);
  },

  async updateStatuses() {
    await pool.query(`
      UPDATE matches SET status = 'live' 
      WHERE status = 'upcoming' AND match_date <= NOW() AND match_date > NOW() - INTERVAL '3 hours'
    `);
  },

  async canPredict(id) {
    const result = await pool.query(
      "SELECT id, status, match_date FROM matches WHERE id = $1",
      [id]
    );
    const match = result.rows[0];
    if (!match) return { canPredict: false, reason: 'Match not found' };
    if (match.status !== 'upcoming') return { canPredict: false, reason: 'Match already started' };
    if (new Date(match.match_date) <= new Date()) return { canPredict: false, reason: 'Match already started' };
    return { canPredict: true };
  }
};

module.exports = Match;
