require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./config/database');
const initDatabase = require('./config/init');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Auth middleware
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token invalide' });
  }
};

const adminAuth = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
    if (!result.rows[0]?.is_admin) {
      return res.status(403).json({ error: 'Accès admin requis' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ============ AUTH ROUTES ============
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    const cleanPhone = phone.replace(/[\s-]/g, '');
    if (!/^(05|06|07)[0-9]{8}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Numéro de téléphone algérien invalide' });
    }
    const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [cleanPhone]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Ce numéro est déjà utilisé' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, phone, password) VALUES ($1, $2, $3) RETURNING id, name, phone, is_admin',
      [name, cleanPhone, hashedPassword]
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user: { ...user, total_points: 0 } });
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
    const result = await pool.query('SELECT id, name, phone, is_admin, total_points, created_at FROM users WHERE id = $1', [req.userId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/auth/verify', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, phone, is_admin, total_points FROM users WHERE id = $1', [req.userId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json({ valid: true, user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============ TEAMS ROUTES ============
app.get('/api/teams', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM teams ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/teams/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Équipe non trouvée' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/teams', auth, adminAuth, async (req, res) => {
  try {
    const { name, code, flag_url } = req.body;
    const result = await pool.query(
      'INSERT INTO teams (name, code, flag_url) VALUES ($1, $2, $3) RETURNING *',
      [name, code, flag_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
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
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/teams/:id', auth, adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM teams WHERE id = $1', [req.params.id]);
    res.json({ message: 'Équipe supprimée' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============ TOURNAMENTS ROUTES ============
app.get('/api/tournaments', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count
      FROM tournaments t ORDER BY start_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/tournaments/active', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count
      FROM tournaments t WHERE is_active = true ORDER BY start_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/tournaments/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, (SELECT COUNT(*) FROM matches m WHERE m.tournament_id = t.id) as match_count
      FROM tournaments t WHERE id = $1
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Tournoi non trouvé' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/tournaments/:id/matches', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.tournament_id = $1 ORDER BY m.match_date ASC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/tournaments', auth, adminAuth, async (req, res) => {
  try {
    const { name, description, start_date, end_date, logo_url, is_active } = req.body;
    const result = await pool.query(
      'INSERT INTO tournaments (name, description, start_date, end_date, logo_url, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, description, start_date, end_date, logo_url, is_active !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
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
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/tournaments/:id', auth, adminAuth, async (req, res) => {
  try {
    await pool.query('UPDATE matches SET tournament_id = NULL WHERE tournament_id = $1', [req.params.id]);
    await pool.query('DELETE FROM tournaments WHERE id = $1', [req.params.id]);
    res.json({ message: 'Tournoi supprimé' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============ MATCHES ROUTES ============
app.get('/api/matches', auth, adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag, tour.name as tournament_name
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      ORDER BY m.match_date ASC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/matches/visible', async (req, res) => {
  try {
    // Update live status
    await pool.query(`UPDATE matches SET status = 'live' WHERE status = 'upcoming' AND match_date <= NOW()`);
    
    const result = await pool.query(`
      SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag, tour.name as tournament_name
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      WHERE m.status IN ('completed', 'live') OR m.match_date <= NOW() + INTERVAL '24 hours'
      ORDER BY m.match_date ASC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/matches/upcoming', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag, tour.name as tournament_name
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      WHERE m.status = 'upcoming' ORDER BY m.match_date ASC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/matches/team/:teamId', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag, tour.name as tournament_name
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      WHERE m.team1_id = $1 OR m.team2_id = $1
      ORDER BY m.match_date DESC
    `, [req.params.teamId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/matches/tournament/:tournamentId', auth, adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.tournament_id = $1 ORDER BY m.match_date ASC
    `, [req.params.tournamentId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/matches/tournament/:tournamentId/visible', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.tournament_id = $1 AND (m.status IN ('completed', 'live') OR m.match_date <= NOW() + INTERVAL '24 hours')
      ORDER BY m.match_date ASC
    `, [req.params.tournamentId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/matches/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.id = $1
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Match non trouvé' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/matches/:id/can-predict', async (req, res) => {
  try {
    const result = await pool.query('SELECT status, match_date FROM matches WHERE id = $1', [req.params.id]);
    const match = result.rows[0];
    if (!match) return res.json({ canPredict: false, reason: 'Match not found' });
    if (match.status !== 'upcoming') return res.json({ canPredict: false, reason: 'Match started' });
    if (new Date(match.match_date) <= new Date()) return res.json({ canPredict: false, reason: 'Match started' });
    res.json({ canPredict: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/matches', auth, adminAuth, async (req, res) => {
  try {
    const { tournament_id, team1_id, team2_id, match_date, stage } = req.body;
    const result = await pool.query(
      'INSERT INTO matches (tournament_id, team1_id, team2_id, match_date, stage) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [tournament_id, team1_id, team2_id, match_date, stage]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/matches/:id', auth, adminAuth, async (req, res) => {
  try {
    const { tournament_id, team1_id, team2_id, match_date, stage } = req.body;
    const result = await pool.query(
      'UPDATE matches SET tournament_id=$1, team1_id=$2, team2_id=$3, match_date=$4, stage=$5 WHERE id=$6 RETURNING *',
      [tournament_id, team1_id, team2_id, match_date, stage, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/matches/:id/result', auth, adminAuth, async (req, res) => {
  try {
    const { team1_score, team2_score } = req.body;
    const matchId = req.params.id;
    
    await pool.query("UPDATE matches SET team1_score=$1, team2_score=$2, status='completed' WHERE id=$3", 
      [team1_score, team2_score, matchId]);
    
    // Update predictions
    const predictions = await pool.query('SELECT * FROM predictions WHERE match_id = $1', [matchId]);
    
    for (const pred of predictions.rows) {
      let points = 0;
      if (pred.team1_score === team1_score && pred.team2_score === team2_score) {
        points = 5;
      } else {
        const predWinner = pred.team1_score > pred.team2_score ? 1 : pred.team1_score < pred.team2_score ? 2 : 0;
        const actualWinner = team1_score > team2_score ? 1 : team1_score < team2_score ? 2 : 0;
        if (predWinner === actualWinner) points = actualWinner === 0 ? 3 : 2;
      }
      
      await pool.query('UPDATE predictions SET points_earned = $1 WHERE id = $2', [points, pred.id]);
      if (points > 0) {
        await pool.query('UPDATE users SET total_points = COALESCE(total_points, 0) + $1 WHERE id = $2', [points, pred.user_id]);
      }
    }
    
    res.json({ message: 'Résultat enregistré' });
  } catch (error) {
    console.error('Set result error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/matches/:id', auth, adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM predictions WHERE match_id = $1', [req.params.id]);
    await pool.query('DELETE FROM matches WHERE id = $1', [req.params.id]);
    res.json({ message: 'Match supprimé' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============ PREDICTIONS ROUTES ============
app.get('/api/predictions', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, m.match_date, m.team1_score as actual_team1_score, m.team2_score as actual_team2_score, m.status,
        t1.name as team1_name, t1.flag_url as team1_flag,
        t2.name as team2_name, t2.flag_url as team2_flag, tour.name as tournament_name
      FROM predictions p
      JOIN matches m ON p.match_id = m.id
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN tournaments tour ON m.tournament_id = tour.id
      WHERE p.user_id = $1 ORDER BY m.match_date DESC
    `, [req.userId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/predictions', auth, async (req, res) => {
  try {
    const { match_id, team1_score, team2_score } = req.body;
    
    // Check if match can be predicted
    const match = await pool.query('SELECT status, match_date FROM matches WHERE id = $1', [match_id]);
    if (!match.rows[0]) return res.status(404).json({ error: 'Match non trouvé' });
    if (match.rows[0].status !== 'upcoming' || new Date(match.rows[0].match_date) <= new Date()) {
      return res.status(400).json({ error: 'Les pronostics sont fermés pour ce match' });
    }
    
    const result = await pool.query(`
      INSERT INTO predictions (user_id, match_id, team1_score, team2_score)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, match_id) DO UPDATE SET team1_score = $3, team2_score = $4
      RETURNING *
    `, [req.userId, match_id, team1_score, team2_score]);
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============ LEADERBOARD ============
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, COALESCE(total_points, 0) as total_points
      FROM users ORDER BY total_points DESC NULLS LAST, id
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============ ADMIN ============
app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, phone, is_admin, total_points, created_at FROM users ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/admin/users/:id', auth, adminAuth, async (req, res) => {
  try {
    const { is_admin, total_points } = req.body;
    const result = await pool.query(
      'UPDATE users SET is_admin = COALESCE($1, is_admin), total_points = COALESCE($2, total_points) WHERE id = $3 RETURNING *',
      [is_admin, total_points, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/admin/users/:id', auth, adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM predictions WHERE user_id = $1', [req.params.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'Utilisateur supprimé' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============ DEBUG & HEALTH ============
app.get('/api/debug', async (req, res) => {
  try {
    const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const userCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`);
    res.json({
      tables: tables.rows.map(r => r.table_name),
      users_columns: userCols.rows.map(r => r.column_name)
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.json({ name: 'Prediction World API', version: '2.1.0' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

const PORT = process.env.PORT || 3000;
initDatabase().then(() => {
  app.listen(PORT, () => console.log(`🚀 API running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
