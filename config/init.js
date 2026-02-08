const pool = require('./database');
const bcrypt = require('bcryptjs');

const initDatabase = async () => {
  try {
    console.log('Initializing database...\n');

    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT false,
        predicted_winner_id INTEGER,
        total_points INTEGER DEFAULT 0,
        correct_predictions INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Users table ready');

    // Tournaments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        start_date DATE,
        end_date DATE,
        logo_url TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Tournaments table ready');

    // Teams table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        code VARCHAR(10),
        flag_url TEXT,
        group_name VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Teams table ready');

    // Players table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
        photo_url TEXT,
        position VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Players table ready');

    // Add best player and goal scorer columns to tournaments
    await pool.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='best_player_id') THEN
          ALTER TABLE tournaments ADD COLUMN best_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='best_goal_scorer_id') THEN
          ALTER TABLE tournaments ADD COLUMN best_goal_scorer_id INTEGER REFERENCES players(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Matches table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        team1_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        team2_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        match_date TIMESTAMP NOT NULL,
        team1_score INTEGER,
        team2_score INTEGER,
        status VARCHAR(20) DEFAULT 'upcoming',
        stage VARCHAR(50) DEFAULT 'Groupes',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add tournament_id column if not exists
    await pool.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='matches' AND column_name='tournament_id') THEN
          ALTER TABLE matches ADD COLUMN tournament_id INTEGER REFERENCES tournaments(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    console.log('✓ Matches table ready');

    // Predictions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS predictions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
        team1_score INTEGER NOT NULL,
        team2_score INTEGER NOT NULL,
        points_earned INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, match_id)
      )
    `);
    console.log('✓ Predictions table ready');

    // Tournament predictions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_predictions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
        best_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
        best_goal_scorer_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
        points_earned INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, tournament_id)
      )
    `);
    console.log('✓ Tournament predictions table ready');

    // Scoring rules table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scoring_rules (
        id SERIAL PRIMARY KEY,
        rule_type VARCHAR(50) UNIQUE NOT NULL,
        points INTEGER NOT NULL,
        description TEXT
      )
    `);

    await pool.query(`
      INSERT INTO scoring_rules (rule_type, points, description)
      VALUES 
        ('exact_score', 3, 'Score exact'),
        ('correct_winner', 2, 'Bon vainqueur'),
        ('correct_draw', 3, 'Match nul correct'),
        ('tournament_winner', 5, 'Vainqueur du tournoi'),
        ('best_player', 10, 'Meilleur joueur correct'),
        ('best_goal_scorer', 10, 'Meilleur buteur correct')
      ON CONFLICT (rule_type) DO NOTHING
    `);
    console.log('✓ Scoring rules table ready');

    // Settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT
      )
    `);

    await pool.query(`
      INSERT INTO settings (key, value)
      VALUES 
        ('predictions_open', 'true'),
        ('show_leaderboard', 'true')
      ON CONFLICT (key) DO NOTHING
    `);
    console.log('✓ Settings table ready');

    // Create default admin
    const adminPhone = process.env.ADMIN_PHONE || '0665448641';
    const adminPassword = process.env.ADMIN_PASSWORD || "hkjwdiuasc3';sdr";
    
    const existingAdmin = await pool.query('SELECT id FROM users WHERE phone = $1', [adminPhone]);
    if (existingAdmin.rows.length === 0) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await pool.query(
        'INSERT INTO users (name, phone, password, is_admin) VALUES ($1, $2, $3, $4)',
        ['Admin', adminPhone, hashedPassword, true]
      );
      console.log('✓ Default admin created');
    } else {
      console.log('✓ Admin already exists');
    }

    console.log('\n✅ Database initialization complete!\n');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
};

module.exports = initDatabase;
