require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const teamRoutes = require('./routes/teamRoutes');
const matchRoutes = require('./routes/matchRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const tournamentRoutes = require('./routes/tournamentRoutes');

const User = require('./models/User');
const ScoringRule = require('./models/ScoringRule');
const Setting = require('./models/Setting');

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

// Public endpoints
app.get('/api/leaderboard', async (req, res) => {
  try {
    const leaderboard = await User.getLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/scoring-rules', async (req, res) => {
  try {
    const rules = await ScoringRule.findAll();
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const settings = await Setting.findAll();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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
      admin: '/api/admin/*'
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Erreur serveur interne' });
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
