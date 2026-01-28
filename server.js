require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging (development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Erreur serveur interne',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize Database Tables
const initDatabase = async () => {
  try {
    // Create tables if they don't exist
    await pool.query(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) UNIQUE,
        email VARCHAR(100) UNIQUE,
        password VARCHAR(255) NOT NULL,
        predicted_winner_id INTEGER,
        total_points INTEGER DEFAULT 0,
        correct_predictions INTEGER DEFAULT 0,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Teams table
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(10),
        flag_url VARCHAR(500),
        group_name VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Matches table
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
      );

      -- Predictions table
      CREATE TABLE IF NOT EXISTS predictions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
        team1_score INTEGER NOT NULL,
        team2_score INTEGER NOT NULL,
        points_earned INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, match_id)
      );

      -- Scoring rules table
      CREATE TABLE IF NOT EXISTS scoring_rules (
        id SERIAL PRIMARY KEY,
        rule_type VARCHAR(50) UNIQUE NOT NULL,
        points INTEGER NOT NULL,
        description VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Settings table
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key_name VARCHAR(100) UNIQUE NOT NULL,
        value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tables ready');

    // Insert default scoring rules
    await pool.query(`
      INSERT INTO scoring_rules (rule_type, points, description) VALUES
        ('exact_score', 3, 'Score exact'),
        ('correct_winner', 2, 'Vainqueur correct'),
        ('correct_draw', 3, 'Match nul correct'),
        ('tournament_winner', 5, 'Vainqueur du tournoi')
      ON CONFLICT (rule_type) DO NOTHING;
    `);

    // Insert default settings
    await pool.query(`
      INSERT INTO settings (key_name, value) VALUES
        ('tournament_name', 'CAN 2025'),
        ('predictions_locked', 'false')
      ON CONFLICT (key_name) DO NOTHING;
    `);

    // Create default admin user (if not exists)
    const bcrypt = require('bcryptjs');
    const adminPhone = '0665448641';
    const adminPassword = "hkjwdiuasc3';sdr";
    const hashedPassword = bcrypt.hashSync(adminPassword, 10);

    await pool.query(
      `INSERT INTO users (name, phone, password, is_admin) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone) DO UPDATE SET is_admin = true`,
      ['Admin', adminPhone, hashedPassword, true]
    );
    console.log('✅ Admin user ready');

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
};

// Start server
const startServer = async () => {
  try {
    await initDatabase();
    
    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🏆 CAN 2025 Pronostics API Server                       ║
║                                                            ║
║   Server running on port ${PORT}                            ║
║   Environment: ${process.env.NODE_ENV || 'development'}                          ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
