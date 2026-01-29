require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import routes
const authRoutes = require('./routes/authRoutes');
const teamRoutes = require('./routes/teamRoutes');
const matchRoutes = require('./routes/matchRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Import models for public endpoints
const User = require('./models/User');
const ScoringRule = require('./models/ScoringRule');
const Setting = require('./models/Setting');

// Import database initialization
const initDatabase = require('./config/init');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased for base64 images

// Request logging (optional)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==================== ROUTES ====================

// Auth routes
app.use('/api/auth', authRoutes);

// Team routes
app.use('/api/teams', teamRoutes);

// Match routes
app.use('/api/matches', matchRoutes);

// Prediction routes
app.use('/api/predictions', predictionRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// ==================== PUBLIC ENDPOINTS ====================

// GET /api/leaderboard - Public leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const leaderboard = await User.getLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/scoring-rules - Public scoring rules
app.get('/api/scoring-rules', async (req, res) => {
  try {
    const rules = await ScoringRule.findAll();
    res.json(rules);
  } catch (error) {
    console.error('Scoring rules error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/settings - Public settings
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await Setting.findAll();
    res.json(settings);
  } catch (error) {
    console.error('Settings error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint - API info
app.get('/', (req, res) => {
  res.json({ 
    name: 'Prediction World API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth/* (register, login, verify, profile)',
      teams: '/api/teams/* (CRUD)',
      matches: '/api/matches/* (CRUD + result)',
      predictions: '/api/predictions (GET, POST)',
      leaderboard: '/api/leaderboard',
      scoringRules: '/api/scoring-rules',
      settings: '/api/settings',
      admin: '/api/admin/* (users, scoring-rules, settings, award-winner)'
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
  res.status(500).json({ error: 'Erreur serveur interne' });
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000;

// Initialize database then start server
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 Prediction World API running on port ${PORT}`);
      console.log(`   http://localhost:${PORT}\n`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
