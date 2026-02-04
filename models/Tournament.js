const pool = require('../config/database');

const Tournament = {
  async findAll() {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count,
        (SELECT COUNT(*) FROM tournament_teams tt WHERE tt.tournament_id = t.id) as team_count
      FROM tournaments t 
      ORDER BY t.start_date DESC
    `);
    return result.rows;
  },

  async findActive() {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count,
        (SELECT COUNT(*) FROM tournament_teams tt WHERE tt.tournament_id = t.id) as team_count
      FROM tournaments t 
      WHERE t.is_active = true 
      ORDER BY t.start_date DESC
    `);
    return result.rows;
  },

  async findById(id) {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count,
        (SELECT COUNT(*) FROM tournament_teams tt WHERE tt.tournament_id = t.id) as team_count
      FROM tournaments t 
      WHERE t.id = $1
    `, [id]);
    return result.rows[0];
  },

  async create(data) {
    const { name, description, start_date, end_date, logo_url, is_active, format } = data;
    const result = await pool.query(
      `INSERT INTO tournaments (name, description, start_date, end_date, logo_url, is_active, format)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, description, start_date, end_date, logo_url, is_active !== false, format || 'groups_4']
    );
    return result.rows[0];
  },

  async update(id, data) {
    const { name, description, start_date, end_date, logo_url, is_active, format } = data;
    const result = await pool.query(
      `UPDATE tournaments 
       SET name = $1, description = $2, start_date = $3, end_date = $4, 
           logo_url = $5, is_active = $6, format = COALESCE($7, format)
       WHERE id = $8 RETURNING *`,
      [name, description, start_date, end_date, logo_url, is_active, format, id]
    );
    return result.rows[0];
  },

  async delete(id) {
    await pool.query('DELETE FROM tournament_teams WHERE tournament_id = $1', [id]);
    await pool.query('UPDATE matches SET tournament_id = NULL WHERE tournament_id = $1', [id]);
    await pool.query('DELETE FROM tournaments WHERE id = $1', [id]);
  },

  async setActive(id, isActive) {
    const result = await pool.query(
      'UPDATE tournaments SET is_active = $1 WHERE id = $2 RETURNING *',
      [isActive, id]
    );
    return result.rows[0];
  },

  getFormatOptions() {
    return [
      { value: 'groups_4', label: '4 Groupes de 4 (16 équipes)', groups: 4, teamsPerGroup: 4 },
      { value: 'groups_6', label: '6 Groupes de 4 (24 équipes)', groups: 6, teamsPerGroup: 4 },
      { value: 'groups_8', label: '8 Groupes de 4 (32 équipes)', groups: 8, teamsPerGroup: 4 },
      { value: 'knockout_16', label: 'Élimination directe 16', groups: 0, teamsPerGroup: 0 },
      { value: 'knockout_32', label: 'Élimination directe 32', groups: 0, teamsPerGroup: 0 },
      { value: 'league', label: 'Championnat', groups: 1, teamsPerGroup: 0 }
    ];
  }
};

module.exports = Tournament;
