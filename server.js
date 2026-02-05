require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth middleware
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    req.userId = jwt.verify(token, JWT_SECRET).userId;
    next();
  } catch (e) { res.status(401).json({ error: 'Token invalide' }); }
};

const adminAuth = async (req, res, next) => {
  try {
    const r = await pool.query('SELECT is_admin FROM users WHERE id=$1', [req.userId]);
    if (!r.rows[0]?.is_admin) return res.status(403).json({ error: 'Admin requis' });
    next();
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
};

// Root
app.get('/', (req, res) => res.json({ name: 'Prediction World API', version: '1.0' }));

// Auth
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, password } = req.body || {};
    if (!name || !phone || !password) return res.status(400).json({ error: 'Champs requis' });
    const clean = phone.replace(/[\s-]/g, '');
    if (!/^(05|06|07)\d{8}$/.test(clean)) return res.status(400).json({ error: 'Numéro invalide' });
    const exists = await pool.query('SELECT id FROM users WHERE phone=$1', [clean]);
    if (exists.rows.length) return res.status(400).json({ error: 'Numéro déjà utilisé' });
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query('INSERT INTO users(name,phone,password) VALUES($1,$2,$3) RETURNING *', [name, clean, hash]);
    res.json({ token: jwt.sign({ userId: r.rows[0].id }, JWT_SECRET, { expiresIn: '30d' }), user: r.rows[0] });
  } catch (e) { console.error('Register error:', e); res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    if (!phone || !password) return res.status(400).json({ error: 'Téléphone et mot de passe requis' });
    const clean = phone.replace(/[\s-]/g, '');
    const r = await pool.query('SELECT * FROM users WHERE phone=$1', [clean]);
    if (!r.rows[0]) return res.status(401).json({ error: 'Identifiants incorrects' });
    const match = await bcrypt.compare(password, r.rows[0].password);
    if (!match) return res.status(401).json({ error: 'Identifiants incorrects' });
    const user = { id: r.rows[0].id, name: r.rows[0].name, phone: r.rows[0].phone, is_admin: r.rows[0].is_admin, total_points: r.rows[0].total_points || 0 };
    res.json({ token: jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' }), user });
  } catch (e) { console.error('Login error:', e); res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/auth/verify', auth, async (req, res) => {
  try { const r = await pool.query('SELECT id,name,phone,is_admin,total_points FROM users WHERE id=$1', [req.userId]); res.json({ valid: true, user: r.rows[0] }); }
  catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/auth/profile', auth, async (req, res) => {
  try { const r = await pool.query('SELECT * FROM users WHERE id=$1', [req.userId]); res.json(r.rows[0]); }
  catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Teams
app.get('/api/teams', async (req, res) => {
  try { const r = await pool.query('SELECT * FROM teams ORDER BY name'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/teams/:id', async (req, res) => {
  try { const r = await pool.query('SELECT * FROM teams WHERE id=$1', [req.params.id]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.post('/api/teams', auth, adminAuth, async (req, res) => {
  try { const { name, code, flag_url } = req.body; const r = await pool.query('INSERT INTO teams(name,code,flag_url) VALUES($1,$2,$3) RETURNING *', [name, code, flag_url]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.put('/api/teams/:id', auth, adminAuth, async (req, res) => {
  try { const { name, code, flag_url } = req.body; const r = await pool.query('UPDATE teams SET name=$1,code=$2,flag_url=$3 WHERE id=$4 RETURNING *', [name, code, flag_url, req.params.id]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.delete('/api/teams/:id', auth, adminAuth, async (req, res) => {
  try { await pool.query('DELETE FROM teams WHERE id=$1', [req.params.id]); res.json({ message: 'Supprimé' }); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Tournaments
app.get('/api/tournaments', async (req, res) => {
  try { const r = await pool.query('SELECT t.*, (SELECT COUNT(*) FROM matches WHERE tournament_id=t.id) as match_count FROM tournaments t ORDER BY start_date DESC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/tournaments/active', async (req, res) => {
  try { const r = await pool.query('SELECT t.*, (SELECT COUNT(*) FROM matches WHERE tournament_id=t.id) as match_count FROM tournaments t WHERE is_active=true ORDER BY start_date DESC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/tournaments/:id', async (req, res) => {
  try { const r = await pool.query('SELECT * FROM tournaments WHERE id=$1', [req.params.id]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/tournaments/:id/matches', async (req, res) => {
  try { const r = await pool.query(`SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag, t2.name as team2_name, t2.flag_url as team2_flag FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id WHERE tournament_id=$1 ORDER BY match_date`, [req.params.id]); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.post('/api/tournaments', auth, adminAuth, async (req, res) => {
  try { const { name, description, start_date, end_date, logo_url, is_active } = req.body; const r = await pool.query('INSERT INTO tournaments(name,description,start_date,end_date,logo_url,is_active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [name, description, start_date, end_date, logo_url, is_active !== false]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.put('/api/tournaments/:id', auth, adminAuth, async (req, res) => {
  try { const { name, description, start_date, end_date, logo_url, is_active } = req.body; const r = await pool.query('UPDATE tournaments SET name=$1,description=$2,start_date=$3,end_date=$4,logo_url=$5,is_active=$6 WHERE id=$7 RETURNING *', [name, description, start_date, end_date, logo_url, is_active, req.params.id]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.delete('/api/tournaments/:id', auth, adminAuth, async (req, res) => {
  try { await pool.query('UPDATE matches SET tournament_id=NULL WHERE tournament_id=$1', [req.params.id]); await pool.query('DELETE FROM tournaments WHERE id=$1', [req.params.id]); res.json({ message: 'Supprimé' }); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Matches
app.get('/api/matches', auth, adminAuth, async (req, res) => {
  try { const r = await pool.query(`SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag, t2.name as team2_name, t2.flag_url as team2_flag, tour.name as tournament_name FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id ORDER BY match_date`); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/matches/visible', async (req, res) => {
  try {
    await pool.query("UPDATE matches SET status='live' WHERE status='upcoming' AND match_date<=NOW()");
    const r = await pool.query(`SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag, t2.name as team2_name, t2.flag_url as team2_flag, tour.name as tournament_name FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id WHERE m.status IN ('completed','live') OR m.match_date <= NOW() + INTERVAL '24 hours' ORDER BY match_date`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/matches/upcoming', async (req, res) => {
  try { const r = await pool.query(`SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag, t2.name as team2_name, t2.flag_url as team2_flag FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id WHERE status='upcoming' ORDER BY match_date`); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/matches/team/:teamId', async (req, res) => {
  try { const r = await pool.query(`SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag, t2.name as team2_name, t2.flag_url as team2_flag FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id WHERE team1_id=$1 OR team2_id=$1 ORDER BY match_date DESC`, [req.params.teamId]); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/matches/tournament/:id/visible', async (req, res) => {
  try { const r = await pool.query(`SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag, t2.name as team2_name, t2.flag_url as team2_flag FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id WHERE tournament_id=$1 AND (status IN ('completed','live') OR match_date <= NOW() + INTERVAL '24 hours') ORDER BY match_date`, [req.params.id]); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/matches/:id', async (req, res) => {
  try { const r = await pool.query(`SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag, t2.name as team2_name, t2.flag_url as team2_flag FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id WHERE m.id=$1`, [req.params.id]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/matches/:id/can-predict', async (req, res) => {
  try { const r = await pool.query('SELECT status,match_date FROM matches WHERE id=$1', [req.params.id]); const m = r.rows[0]; res.json({ canPredict: m && m.status === 'upcoming' && new Date(m.match_date) > new Date() }); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.post('/api/matches', auth, adminAuth, async (req, res) => {
  try { const { tournament_id, team1_id, team2_id, match_date, stage } = req.body; const r = await pool.query('INSERT INTO matches(tournament_id,team1_id,team2_id,match_date,stage,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [tournament_id, team1_id, team2_id, match_date, stage, 'upcoming']); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.put('/api/matches/:id', auth, adminAuth, async (req, res) => {
  try { const { tournament_id, team1_id, team2_id, match_date, stage } = req.body; const r = await pool.query('UPDATE matches SET tournament_id=$1,team1_id=$2,team2_id=$3,match_date=$4,stage=$5 WHERE id=$6 RETURNING *', [tournament_id, team1_id, team2_id, match_date, stage, req.params.id]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.put('/api/matches/:id/result', auth, adminAuth, async (req, res) => {
  try {
    const { team1_score, team2_score } = req.body;
    await pool.query("UPDATE matches SET team1_score=$1,team2_score=$2,status='completed' WHERE id=$3", [team1_score, team2_score, req.params.id]);
    const preds = await pool.query('SELECT * FROM predictions WHERE match_id=$1', [req.params.id]);
    for (const p of preds.rows) {
      let pts = 0;
      if (p.team1_score === team1_score && p.team2_score === team2_score) pts = 5;
      else { const pW = p.team1_score > p.team2_score ? 1 : p.team1_score < p.team2_score ? 2 : 0; const aW = team1_score > team2_score ? 1 : team1_score < team2_score ? 2 : 0; if (pW === aW) pts = aW === 0 ? 3 : 2; }
      await pool.query('UPDATE predictions SET points_earned=$1 WHERE id=$2', [pts, p.id]);
      if (pts > 0) await pool.query('UPDATE users SET total_points=COALESCE(total_points,0)+$1 WHERE id=$2', [pts, p.user_id]);
    }
    res.json({ message: 'Résultat enregistré' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.delete('/api/matches/:id', auth, adminAuth, async (req, res) => {
  try { await pool.query('DELETE FROM predictions WHERE match_id=$1', [req.params.id]); await pool.query('DELETE FROM matches WHERE id=$1', [req.params.id]); res.json({ message: 'Supprimé' }); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Predictions
app.get('/api/predictions', auth, async (req, res) => {
  try { const r = await pool.query(`SELECT p.*, m.match_date, m.team1_score as actual_team1_score, m.team2_score as actual_team2_score, m.status, t1.name as team1_name, t1.flag_url as team1_flag, t2.name as team2_name, t2.flag_url as team2_flag, tour.name as tournament_name FROM predictions p JOIN matches m ON p.match_id=m.id JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id WHERE p.user_id=$1 ORDER BY m.match_date DESC`, [req.userId]); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.post('/api/predictions', auth, async (req, res) => {
  try {
    const { match_id, team1_score, team2_score } = req.body;
    const m = await pool.query('SELECT status,match_date FROM matches WHERE id=$1', [match_id]);
    if (!m.rows[0] || m.rows[0].status !== 'upcoming' || new Date(m.rows[0].match_date) <= new Date()) return res.status(400).json({ error: 'Pronostics fermés' });
    const r = await pool.query(`INSERT INTO predictions(user_id,match_id,team1_score,team2_score) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,match_id) DO UPDATE SET team1_score=$3,team2_score=$4 RETURNING *`, [req.userId, match_id, team1_score, team2_score]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try { const r = await pool.query('SELECT id,name,COALESCE(total_points,0) as total_points FROM users ORDER BY total_points DESC NULLS LAST'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Admin
app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  try { const r = await pool.query('SELECT id,name,phone,is_admin,total_points,created_at FROM users ORDER BY total_points DESC NULLS LAST'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.put('/api/admin/users/:id', auth, adminAuth, async (req, res) => {
  try { const { is_admin, total_points } = req.body; const r = await pool.query('UPDATE users SET is_admin=COALESCE($1,is_admin),total_points=COALESCE($2,total_points) WHERE id=$3 RETURNING *', [is_admin, total_points, req.params.id]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.delete('/api/admin/users/:id', auth, adminAuth, async (req, res) => {
  try { await pool.query('DELETE FROM predictions WHERE user_id=$1', [req.params.id]); await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]); res.json({ message: 'Supprimé' }); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// 404
app.use((req, res) => res.status(404).json({ error: 'Route non trouvée' }));

// Start and reset admin password
const PORT = process.env.PORT || 3000;
(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✓ DB connected');
    
    // Reset admin password to 'password'
    const hash = await bcrypt.hash('password', 10);
    const result = await pool.query('UPDATE users SET password=$1 WHERE phone=$2 RETURNING id', [hash, '0665448641']);
    if (result.rows.length) {
      console.log('✓ Admin password reset to: password');
    } else {
      // Create admin if not exists
      await pool.query('INSERT INTO users(name,phone,password,is_admin) VALUES($1,$2,$3,$4)', ['Admin', '0665448641', hash, true]);
      console.log('✓ Admin created - phone: 0665448641, password: password');
    }
    
    app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
  } catch (e) { console.error('Error:', e); process.exit(1); }
})();
