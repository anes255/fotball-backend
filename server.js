require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const teamRoutes = require('./routes/teamRoutes');
const matchRoutes = require('./routes/matchRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const tournamentRoutes = require('./routes/tournamentRoutes');
const initDatabase = require('./config/init');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tournaments', tournamentRoutes);

// DEBUG ENDPOINT - Shows database structure
app.get('/api/debug', async (req, res) => {
  try {
    const usersColumns = await pool.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'users'
    `);
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `);
    const sampleUser = await pool.query('SELECT * FROM users LIMIT 1');
    
    res.json({
      status: 'connected',
      tables: tables.rows.map(r => r.table_name),
      users_columns: usersColumns.rows.map(r => r.column_name),
      sample_user: sampleUser.rows[0] || 'no users'
    });
  } catch (error) {
    res.json({ error: error.message, stack: error.stack });
  }
});

// Leaderboard - Direct query (no model dependency)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, total_points, correct_predictions, total_predictions
      FROM users 
      ORDER BY total_points DESC, correct_predictions DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Leaderboard user predictions
app.get('/api/leaderboard/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const predictionsResult = await pool.query(`
      SELECT p.team1_score, p.team2_score, p.points_earned,
        m.match_date, m.team1_score as actual_team1_score, m.team2_score as actual_team2_score, m.status,
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag
      FROM predictions p
      JOIN matches m ON p.match_id = m.id
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE p.user_id = $1 AND (m.status = 'completed' OR m.status = 'live')
      ORDER BY m.match_date DESC
    `, [userId]);

    res.json({
      user: userResult.rows[0],
      predictions: predictionsResult.rows
    });
  } catch (error) {
    console.error('User predictions error:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Scoring rules
app.get('/api/scoring-rules', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM scoring_rules ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error('Scoring rules error:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Settings
app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (error) {
    console.error('Settings error:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root
app.get('/', (req, res) => {
  res.json({ 
    name: 'Prediction World API',
    version: '2.0.0',
    features: ['Tournaments', 'Match Time Blocking'],
    endpoints: {
      auth: '/api/auth/*',
      teams: '/api/teams/*',
      matches: '/api/matches/*',
      tournaments: '/api/tournaments/*',
      predictions: '/api/predictions',
      leaderboard: '/api/leaderboard',
      admin: '/api/admin/*',
      debug: '/api/debug'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Erreur serveur interne', details: err.message });
});

const PORT = process.env.PORT || 3000;

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 Prediction World API v2.0 running on port ${PORT}\n`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
