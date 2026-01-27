const pool = require('../config/db');

const Team = {
  // Get all teams
  async findAll() {
    const result = await pool.query(
      'SELECT * FROM teams ORDER BY group_name, name'
    );
    return result.rows;
  },

  // Find team by ID
  async findById(id) {
    const result = await pool.query(
      'SELECT * FROM teams WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  // Find team by name
  async findByName(name) {
    const result = await pool.query(
      'SELECT * FROM teams WHERE LOWER(name) = LOWER($1)',
      [name]
    );
    return result.rows[0];
  },

  // Create new team
  async create({ name, code, flag_url, group_name }) {
    const result = await pool.query(
      `INSERT INTO teams (name, code, flag_url, group_name) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [name, code, flag_url, group_name]
    );
    return result.rows[0];
  },

  // Update team
  async update(id, { name, code, flag_url, group_name }) {
    const result = await pool.query(
      `UPDATE teams 
       SET name = COALESCE($1, name), 
           code = COALESCE($2, code), 
           flag_url = COALESCE($3, flag_url), 
           group_name = COALESCE($4, group_name)
       WHERE id = $5 
       RETURNING *`,
      [name, code, flag_url, group_name, id]
    );
    return result.rows[0];
  },

  // Delete team
  async delete(id) {
    // Check if team is used in matches
    const matchCheck = await pool.query(
      'SELECT COUNT(*) FROM matches WHERE team1_id = $1 OR team2_id = $1',
      [id]
    );
    
    if (parseInt(matchCheck.rows[0].count) > 0) {
      throw new Error('Cette équipe est utilisée dans des matchs');
    }

    // Check if team is predicted by users
    const userCheck = await pool.query(
      'SELECT COUNT(*) FROM users WHERE predicted_winner_id = $1',
      [id]
    );
    
    if (parseInt(userCheck.rows[0].count) > 0) {
      throw new Error('Cette équipe est prédite par des utilisateurs');
    }

    const result = await pool.query(
      'DELETE FROM teams WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  },

  // Get teams by group
  async findByGroup(groupName) {
    const result = await pool.query(
      'SELECT * FROM teams WHERE group_name = $1 ORDER BY name',
      [groupName]
    );
    return result.rows;
  }
};

module.exports = Team;
