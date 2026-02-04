require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// ============================================
// CONFIGURATION
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================
// AUTH MIDDLEWARE
// ============================================
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Token requis' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};

const adminAuth = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
    if (!result.rows[0] || !result.rows[0].is_admin) {
      return res.status(403).json({ error: 'Accès admin requis' });
    }
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ============================================
// ROOT & HEALTH ROUTES
// ============================================
app.get('/', (req, res) => {
  res.json({ 
    name: 'Prediction World API',
    version: '3.0.0',
    status: 'running',
    endpoints: {
      auth: '/api/auth/*',
      teams: '/api/teams/*',
      matches: '/api/matches/*',
      tournaments: '/api/tournaments/*',
      predictions: '/api/predictions/*',
      leaderboard: '/api/leaderboard/*',
      admin: '/api/admin/*'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/debug', async (req, res) => {
  try {
    const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const userCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`);
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    res.json({
      status: 'connected',
      tables: tables.rows.map(r => r.table_name),
      users_columns: userCols.rows.map(r => r.column_name),
      user_count: userCount.rows[0].count
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// ============================================
// AUTH ROUTES
// ============================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    
    const cleanPhone = phone.replace(/[\s-]/g, '');
    if (!/^(05|06|07)[0-9]{8}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Numéro de téléphone algérien invalide (doit commencer par 05, 06 ou 07)' });
    }
    
    const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [cleanPhone]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Ce numéro est déjà utilisé' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, phone, password, total_points, correct_predictions, total_predictions) VALUES ($1, $2, $3, 0, 0, 0) RETURNING id, name, phone, is_admin, total_points, created_at',
      [name, cleanPhone, hashedPassword]
    );
    
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    
    res.status(201).json({ token, user });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    
    if (!phone || !password) {
      return res.status(400).json({ error: 'Téléphone et mot de passe requis' });
    }
    
    const cleanPhone = phone.replace(/[\s-]/g, '');
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [cleanPhone]);
    const user = result.rows[0];
    
    if (!user) {
      return res.status(401).json({ error: 'Numéro de téléphone ou mot de passe incorrect' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Numéro de téléphone ou mot de passe incorrect' });
    }
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        is_admin: user.is_admin || false,
        total_points: user.total_points || 0,
        correct_predictions: user.correct_predictions || 0,
        total_predictions: user.total_predictions || 0,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/auth/profile', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, phone, is_admin, total_points, correct_predictions, total_predictions, created_at FROM users WHERE id = $1',
      [req.userId]
    );
    
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/auth/verify', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, phone, is_admin, total_points FROM users WHERE id = $1',
      [req.userId]
    );
    
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    res.json({ valid: true, user: result.rows[0] });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// TEAMS ROUTES
// ============================================
app.get('/api/teams', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM teams ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/teams/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Équipe non trouvée' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/teams', auth, adminAuth, async (req, res) => {
  try {
    const { name, code, flag_url } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nom requis' });
    }
    const result = await pool.query(
      'INSERT INTO teams (name, code, flag_url) VALUES ($1, $2, $3) RETURNING *',
      [name, code || null, flag_url || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/teams/:id', auth, adminAuth, async (req, res) => {
  try {
    const { name, code, flag_url } = req.body;
    const result = await pool.query(
      'UPDATE teams SET name = $1, code = $2, flag_url = $3 WHERE id = $4 RETURNING *',
      [name, code, flag_url, req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Équipe non trouvée' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/teams/:id', auth, adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM teams WHERE id = $1', [req.params.id]);
    res.json({ message: 'Équipe supprimée' });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// TOURNAMENTS ROUTES
// ============================================
app.get('/api/tournaments', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count
      FROM tournaments t 
      ORDER BY t.start_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get tournaments error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/tournaments/active', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count
      FROM tournaments t 
      WHERE t.is_active = true 
      ORDER BY t.start_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get active tournaments error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/tournaments/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count
      FROM tournaments t 
      WHERE t.id = $1
    `, [req.params.id]);
    
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Tournoi non trouvé' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get tournament error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/tournaments/:id/matches', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.tournament_id = $1 
      ORDER BY m.match_date ASC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Get tournament matches error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/tournaments', auth, adminAuth, async (req, res) => {
  try {
    const { name, description, start_date, end_date, logo_url, is_active } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nom requis' });
    }
    const result = await pool.query(
      'INSERT INTO tournaments (name, description, start_date, end_date, logo_url, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, description || null, start_date || null, end_date || null, logo_url || null, is_active !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create tournament error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/tournaments/:id', auth, adminAuth, async (req, res) => {
  try {
    const { name, description, start_date, end_date, logo_url, is_active } = req.body;
    const result = await pool.query(
      'UPDATE tournaments SET name=$1, description=$2, start_date=$3, end_date=$4, logo_url=$5, is_active=$6 WHERE id=$7 RETURNING *',
      [name, description, start_date, end_date, logo_url, is_active, req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Tournoi non trouvé' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update tournament error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/tournaments/:id', auth, adminAuth, async (req, res) => {
  try {
    await pool.query('UPDATE matches SET tournament_id = NULL WHERE tournament_id = $1', [req.params.id]);
    await pool.query('DELETE FROM tournaments WHERE id = $1', [req.params.id]);
    res.json({ message: 'Tournoi supprimé' });
  } catch (error) {
    console.error('Delete tournament error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// MATCHES ROUTES
// ============================================
// Admin: Get all matches
app.get('/api/matches', auth, adminAuth, async (req, res) => {
  try {
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
    res.json(result.rows);
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Public: Get visible matches (24h rule)
app.get('/api/matches/visible', async (req, res) => {
  try {
    // Update status for started matches
    await pool.query(`
      UPDATE matches 
      SET status = 'live' 
      WHERE status = 'upcoming' AND match_date <= NOW()
    `);
    
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag, 
        tour.name as tournament_name
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      WHERE m.status IN ('completed', 'live') 
        OR m.match_date <= NOW() + INTERVAL '24 hours'
      ORDER BY m.match_date ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get visible matches error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Public: Get upcoming matches
app.get('/api/matches/upcoming', async (req, res) => {
  try {
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
    res.json(result.rows);
  } catch (error) {
    console.error('Get upcoming matches error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Public: Get matches by team
app.get('/api/matches/team/:teamId', async (req, res) => {
  try {
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
    `, [req.params.teamId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Get team matches error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Admin: Get matches by tournament
app.get('/api/matches/tournament/:tournamentId', auth, adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.tournament_id = $1 
      ORDER BY m.match_date ASC
    `, [req.params.tournamentId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Get tournament matches error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Public: Get visible matches by tournament (24h rule)
app.get('/api/matches/tournament/:tournamentId/visible', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, 
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.tournament_id = $1 
        AND (m.status IN ('completed', 'live') OR m.match_date <= NOW() + INTERVAL '24 hours')
      ORDER BY m.match_date ASC
    `, [req.params.tournamentId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Get tournament visible matches error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Public: Check if can predict
app.get('/api/matches/:id/can-predict', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT status, match_date FROM matches WHERE id = $1', 
      [req.params.id]
    );
    const match = result.rows[0];
    
    if (!match) {
      return res.json({ canPredict: false, reason: 'Match not found' });
    }
    if (match.status !== 'upcoming') {
      return res.json({ canPredict: false, reason: 'Match already started' });
    }
    if (new Date(match.match_date) <= new Date()) {
      return res.json({ canPredict: false, reason: 'Match already started' });
    }
    
    res.json({ canPredict: true });
  } catch (error) {
    console.error('Can predict error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Public: Get match by ID
app.get('/api/matches/:id', async (req, res) => {
  try {
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
    `, [req.params.id]);
    
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get match error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Admin: Create match
app.post('/api/matches', auth, adminAuth, async (req, res) => {
  try {
    const { tournament_id, team1_id, team2_id, match_date, stage } = req.body;
    
    if (!team1_id || !team2_id || !match_date) {
      return res.status(400).json({ error: 'Équipes et date requis' });
    }
    
    const result = await pool.query(
      'INSERT INTO matches (tournament_id, team1_id, team2_id, match_date, stage, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [tournament_id || null, team1_id, team2_id, match_date, stage || null, 'upcoming']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create match error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Admin: Update match
app.put('/api/matches/:id', auth, adminAuth, async (req, res) => {
  try {
    const { tournament_id, team1_id, team2_id, match_date, stage, status } = req.body;
    const result = await pool.query(
      'UPDATE matches SET tournament_id=$1, team1_id=$2, team2_id=$3, match_date=$4, stage=$5, status=COALESCE($6, status) WHERE id=$7 RETURNING *',
      [tournament_id, team1_id, team2_id, match_date, stage, status, req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update match error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Admin: Set match result
app.put('/api/matches/:id/result', auth, adminAuth, async (req, res) => {
  try {
    const { team1_score, team2_score } = req.body;
    const matchId = req.params.id;
    
    if (team1_score === undefined || team2_score === undefined) {
      return res.status(400).json({ error: 'Scores requis' });
    }
    
    // Update match
    await pool.query(
      "UPDATE matches SET team1_score=$1, team2_score=$2, status='completed' WHERE id=$3",
      [team1_score, team2_score, matchId]
    );
    
    // Get all predictions for this match
    const predictions = await pool.query(
      'SELECT * FROM predictions WHERE match_id = $1', 
      [matchId]
    );
    
    // Calculate and update points for each prediction
    for (const pred of predictions.rows) {
      let points = 0;
      
      // Exact score = 5 points
      if (pred.team1_score === team1_score && pred.team2_score === team2_score) {
        points = 5;
      } else {
        // Check if predicted correct winner/draw
        const predWinner = pred.team1_score > pred.team2_score ? 1 : pred.team1_score < pred.team2_score ? 2 : 0;
        const actualWinner = team1_score > team2_score ? 1 : team1_score < team2_score ? 2 : 0;
        
        if (predWinner === actualWinner) {
          points = actualWinner === 0 ? 3 : 2; // Draw = 3 points, Winner = 2 points
        }
      }
      
      // Update prediction with points earned
      await pool.query(
        'UPDATE predictions SET points_earned = $1 WHERE id = $2', 
        [points, pred.id]
      );
      
      // Update user's total points and correct predictions
      if (points > 0) {
        await pool.query(
          'UPDATE users SET total_points = COALESCE(total_points, 0) + $1, correct_predictions = COALESCE(correct_predictions, 0) + 1 WHERE id = $2',
          [points, pred.user_id]
        );
      }
    }
    
    res.json({ 
      message: 'Résultat enregistré', 
      predictionsUpdated: predictions.rows.length 
    });
  } catch (error) {
    console.error('Set result error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Admin: Delete match
app.delete('/api/matches/:id', auth, adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM predictions WHERE match_id = $1', [req.params.id]);
    await pool.query('DELETE FROM matches WHERE id = $1', [req.params.id]);
    res.json({ message: 'Match supprimé' });
  } catch (error) {
    console.error('Delete match error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// PREDICTIONS ROUTES
// ============================================
// Get user's predictions
app.get('/api/predictions', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, p.match_id,
        m.match_date, m.team1_score as actual_team1_score, m.team2_score as actual_team2_score, m.status,
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag, 
        tour.name as tournament_name
      FROM predictions p
      JOIN matches m ON p.match_id = m.id
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      WHERE p.user_id = $1 
      ORDER BY m.match_date DESC
    `, [req.userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Get predictions error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get prediction for specific match
app.get('/api/predictions/match/:matchId', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM predictions WHERE user_id = $1 AND match_id = $2',
      [req.userId, req.params.matchId]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Get prediction error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create or update prediction
app.post('/api/predictions', auth, async (req, res) => {
  try {
    const { match_id, team1_score, team2_score } = req.body;
    
    if (match_id === undefined || team1_score === undefined || team2_score === undefined) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    
    // Check if match exists and can be predicted
    const matchResult = await pool.query(
      'SELECT status, match_date FROM matches WHERE id = $1', 
      [match_id]
    );
    
    if (!matchResult.rows[0]) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }
    
    const match = matchResult.rows[0];
    if (match.status !== 'upcoming') {
      return res.status(400).json({ error: 'Les pronostics sont fermés pour ce match' });
    }
    if (new Date(match.match_date) <= new Date()) {
      return res.status(400).json({ error: 'Les pronostics sont fermés pour ce match' });
    }
    
    // Insert or update prediction
    const result = await pool.query(`
      INSERT INTO predictions (user_id, match_id, team1_score, team2_score)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, match_id) 
      DO UPDATE SET team1_score = $3, team2_score = $4, updated_at = NOW()
      RETURNING *
    `, [req.userId, match_id, team1_score, team2_score]);
    
    // Update user's total predictions count
    await pool.query(
      'UPDATE users SET total_predictions = (SELECT COUNT(*) FROM predictions WHERE user_id = $1) WHERE id = $1',
      [req.userId]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create prediction error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// LEADERBOARD ROUTES
// ============================================
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, 
        COALESCE(total_points, 0) as total_points, 
        COALESCE(correct_predictions, 0) as correct_predictions,
        COALESCE(total_predictions, 0) as total_predictions
      FROM users 
      ORDER BY total_points DESC NULLS LAST, correct_predictions DESC NULLS LAST, id
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/leaderboard/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user
    const userResult = await pool.query(
      'SELECT id, name, phone, total_points, correct_predictions, total_predictions, created_at FROM users WHERE id = $1', 
      [userId]
    );
    
    if (!userResult.rows[0]) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    // Get user's completed predictions
    const predictionsResult = await pool.query(`
      SELECT p.team1_score, p.team2_score, p.points_earned,
        m.match_date, m.team1_score as actual_team1_score, m.team2_score as actual_team2_score, m.status,
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag,
        tour.name as tournament_name
      FROM predictions p
      JOIN matches m ON p.match_id = m.id
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      WHERE p.user_id = $1 AND (m.status = 'completed' OR m.status = 'live')
      ORDER BY m.match_date DESC
    `, [userId]);
    
    // Calculate rank
    const rankResult = await pool.query(
      'SELECT COUNT(*) + 1 as rank FROM users WHERE COALESCE(total_points, 0) > COALESCE((SELECT total_points FROM users WHERE id = $1), 0)',
      [userId]
    );

    res.json({
      user: {
        ...userResult.rows[0],
        rank: parseInt(rankResult.rows[0].rank)
      },
      predictions: predictionsResult.rows
    });
  } catch (error) {
    console.error('Get user predictions error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================
app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, phone, is_admin, 
        COALESCE(total_points, 0) as total_points, 
        COALESCE(correct_predictions, 0) as correct_predictions, 
        COALESCE(total_predictions, 0) as total_predictions, 
        created_at 
      FROM users 
      ORDER BY total_points DESC NULLS LAST
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/admin/users/:id', auth, adminAuth, async (req, res) => {
  try {
    const { is_admin, total_points, name } = req.body;
    const result = await pool.query(
      'UPDATE users SET is_admin = COALESCE($1, is_admin), total_points = COALESCE($2, total_points), name = COALESCE($3, name) WHERE id = $4 RETURNING id, name, is_admin, total_points',
      [is_admin, total_points, name, req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/admin/users/:id', auth, adminAuth, async (req, res) => {
  try {
    // Don't allow deleting yourself
    if (parseInt(req.params.id) === req.userId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }
    
    await pool.query('DELETE FROM predictions WHERE user_id = $1', [req.params.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'Utilisateur supprimé' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Scoring rules (simplified)
app.get('/api/admin/scoring-rules', auth, adminAuth, async (req, res) => {
  res.json([
    { id: 1, name: 'Score exact', points: 5, description: 'Pronostic parfait' },
    { id: 2, name: 'Bon vainqueur', points: 2, description: 'Bonne équipe gagnante' },
    { id: 3, name: 'Match nul correct', points: 3, description: 'Match nul prédit correctement' }
  ]);
});

app.get('/api/scoring-rules', async (req, res) => {
  res.json([
    { id: 1, name: 'Score exact', points: 5, description: 'Pronostic parfait' },
    { id: 2, name: 'Bon vainqueur', points: 2, description: 'Bonne équipe gagnante' },
    { id: 3, name: 'Match nul correct', points: 3, description: 'Match nul prédit correctement' }
  ]);
});

// ============================================
// 404 HANDLER - Must be last
// ============================================
app.use((req, res) => {
  console.log(`404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Route non trouvée' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Erreur serveur interne' });
});

// ============================================
// DATABASE INITIALIZATION
// ============================================
const initDatabase = async () => {
  try {
    console.log('Initializing database...');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✓ Connected to PostgreSQL');
    
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        total_points INTEGER DEFAULT 0,
        correct_predictions INTEGER DEFAULT 0,
        total_predictions INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Users table ready');
    
    // Create tournaments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        start_date DATE,
        end_date DATE,
        logo_url TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Tournaments table ready');
    
    // Create teams table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(10),
        flag_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Teams table ready');
    
    // Create matches table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER REFERENCES tournaments(id),
        team1_id INTEGER REFERENCES teams(id) NOT NULL,
        team2_id INTEGER REFERENCES teams(id) NOT NULL,
        match_date TIMESTAMP NOT NULL,
        team1_score INTEGER,
        team2_score INTEGER,
        status VARCHAR(20) DEFAULT 'upcoming',
        stage VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Matches table ready');
    
    // Create predictions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS predictions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        match_id INTEGER REFERENCES matches(id) NOT NULL,
        team1_score INTEGER NOT NULL,
        team2_score INTEGER NOT NULL,
        points_earned INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, match_id)
      )
    `);
    console.log('✓ Predictions table ready');
    
    // Add missing columns if they don't exist
    const addColumnIfNotExists = async (table, column, type) => {
      try {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
      } catch (e) {
        // Column might already exist
      }
    };
    
    await addColumnIfNotExists('users', 'total_points', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('users', 'correct_predictions', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('users', 'total_predictions', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('predictions', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    
    // Create admin user if not exists
    const adminExists = await pool.query("SELECT id FROM users WHERE phone = '0665448641'");
    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('password', 10);
      await pool.query(
        'INSERT INTO users (name, phone, password, is_admin, total_points) VALUES ($1, $2, $3, $4, $5)',
        ['Admin', '0665448641', hashedPassword, true, 0]
      );
      console.log('✓ Admin user created (phone: 0665448641, password: password)');
    } else {
      console.log('✓ Admin user exists');
    }
    
    console.log('✅ Database initialization complete!\n');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
};

// ============================================
// START SERVER
// ============================================
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Prediction World API v3.0 running on port ${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/api/health`);
      console.log(`   Debug:  http://localhost:${PORT}/api/debug\n`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
