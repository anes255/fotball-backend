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

// Initialize DB
const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(255), phone VARCHAR(20) UNIQUE, password VARCHAR(255), is_admin BOOLEAN DEFAULT FALSE, total_points INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS teams (id SERIAL PRIMARY KEY, name VARCHAR(255), code VARCHAR(10), flag_url TEXT);
    CREATE TABLE IF NOT EXISTS tournaments (id SERIAL PRIMARY KEY, name VARCHAR(255), description TEXT, logo_url TEXT, start_date DATE, end_date DATE, is_active BOOLEAN DEFAULT TRUE, format VARCHAR(50) DEFAULT 'groups_4');
    CREATE TABLE IF NOT EXISTS tournament_teams (id SERIAL PRIMARY KEY, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE, group_name VARCHAR(10), UNIQUE(tournament_id, team_id));
    CREATE TABLE IF NOT EXISTS matches (id SERIAL PRIMARY KEY, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, team1_id INTEGER REFERENCES teams(id), team2_id INTEGER REFERENCES teams(id), team1_score INTEGER DEFAULT 0, team2_score INTEGER DEFAULT 0, match_date TIMESTAMP, stage VARCHAR(100), status VARCHAR(20) DEFAULT 'upcoming');
    CREATE TABLE IF NOT EXISTS predictions (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE, team1_score INTEGER, team2_score INTEGER, points_earned INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, match_id));
    CREATE TABLE IF NOT EXISTS scoring_rules (id SERIAL PRIMARY KEY, rule_type VARCHAR(50) UNIQUE, points INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS site_settings (id SERIAL PRIMARY KEY, setting_key VARCHAR(100) UNIQUE, setting_value TEXT);
    CREATE TABLE IF NOT EXISTS tournament_winner_predictions (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE, points_earned INTEGER DEFAULT 0, UNIQUE(user_id, tournament_id));
  `);
  const rules = [['exact_score',5],['correct_winner',2],['correct_draw',3],['correct_goal_diff',1],['one_team_goals',1],['tournament_winner',10]];
  for (const [t,p] of rules) await pool.query('INSERT INTO scoring_rules(rule_type,points) VALUES($1,$2) ON CONFLICT DO NOTHING',[t,p]);
  const colors = [['primary_color','#6366f1'],['accent_color','#8b5cf6'],['bg_color','#0f172a'],['card_color','#1e293b']];
  for (const [k,v] of colors) await pool.query('INSERT INTO site_settings(setting_key,setting_value) VALUES($1,$2) ON CONFLICT DO NOTHING',[k,v]);
};

// Calculate points
const calcPoints = async (pred, t1, t2) => {
  const rules = {}; (await pool.query('SELECT rule_type,points FROM scoring_rules')).rows.forEach(r => rules[r.rule_type]=r.points);
  if (pred.team1_score===t1 && pred.team2_score===t2) return rules.exact_score||5;
  let pts = 0;
  const aW = t1>t2?1:t1<t2?2:0, pW = pred.team1_score>pred.team2_score?1:pred.team1_score<pred.team2_score?2:0;
  if (aW===pW) { pts += aW===0 ? (rules.correct_draw||3) : (rules.correct_winner||2); if ((t1-t2)===(pred.team1_score-pred.team2_score)) pts += rules.correct_goal_diff||1; }
  if (pred.team1_score===t1) pts += rules.one_team_goals||1;
  if (pred.team2_score===t2) pts += rules.one_team_goals||1;
  return pts;
};

app.get('/', (req, res) => res.json({ name: 'Prediction World API', version: '2.7' }));

// Auth
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, password } = req.body || {};
    if (!name || !phone || !password) return res.status(400).json({ error: 'Champs requis' });
    const clean = phone.replace(/[\s-]/g, '');
    if (!/^(05|06|07)\d{8}$/.test(clean)) return res.status(400).json({ error: 'Numéro invalide' });
    if ((await pool.query('SELECT id FROM users WHERE phone=$1', [clean])).rows.length) return res.status(400).json({ error: 'Numéro déjà utilisé' });
    const r = await pool.query('INSERT INTO users(name,phone,password) VALUES($1,$2,$3) RETURNING *', [name, clean, await bcrypt.hash(password, 10)]);
    res.json({ token: jwt.sign({ userId: r.rows[0].id }, JWT_SECRET, { expiresIn: '30d' }), user: r.rows[0] });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    const clean = phone?.replace(/[\s-]/g, '');
    const r = await pool.query('SELECT * FROM users WHERE phone=$1', [clean]);
    if (!r.rows[0] || !(await bcrypt.compare(password, r.rows[0].password))) return res.status(401).json({ error: 'Identifiants incorrects' });
    res.json({ token: jwt.sign({ userId: r.rows[0].id }, JWT_SECRET, { expiresIn: '30d' }), user: { id: r.rows[0].id, name: r.rows[0].name, phone: r.rows[0].phone, is_admin: r.rows[0].is_admin, total_points: r.rows[0].total_points || 0 } });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/auth/verify', auth, async (req, res) => {
  try { res.json({ valid: true, user: (await pool.query('SELECT id,name,phone,is_admin,total_points FROM users WHERE id=$1', [req.userId])).rows[0] }); } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

// Teams - PUBLIC
app.get('/api/teams', async (req, res) => { try { res.json((await pool.query('SELECT * FROM teams ORDER BY name')).rows); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});
app.get('/api/teams/:id', async (req, res) => { try { res.json((await pool.query('SELECT * FROM teams WHERE id=$1', [req.params.id])).rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});
app.post('/api/teams', auth, adminAuth, async (req, res) => { try { const {name,code,flag_url}=req.body; res.json((await pool.query('INSERT INTO teams(name,code,flag_url) VALUES($1,$2,$3) RETURNING *', [name,code,flag_url])).rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});
app.put('/api/teams/:id', auth, adminAuth, async (req, res) => { try { const {name,code,flag_url}=req.body; res.json((await pool.query('UPDATE teams SET name=$1,code=$2,flag_url=$3 WHERE id=$4 RETURNING *', [name,code,flag_url,req.params.id])).rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});
app.delete('/api/teams/:id', auth, adminAuth, async (req, res) => { try { await pool.query('DELETE FROM teams WHERE id=$1', [req.params.id]); res.json({ message: 'OK' }); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});

// Tournaments - PUBLIC
app.get('/api/tournaments', async (req, res) => { try { res.json((await pool.query(`SELECT t.*, (SELECT COUNT(*) FROM matches WHERE tournament_id=t.id) as match_count, (SELECT COUNT(*) FROM tournament_teams WHERE tournament_id=t.id) as team_count FROM tournaments t ORDER BY start_date DESC`)).rows); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});
app.get('/api/tournaments/active', async (req, res) => { try { res.json((await pool.query(`SELECT t.*, (SELECT COUNT(*) FROM matches WHERE tournament_id=t.id) as match_count, (SELECT COUNT(*) FROM tournament_teams WHERE tournament_id=t.id) as team_count FROM tournaments t WHERE is_active=true`)).rows); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});
app.get('/api/tournaments/formats', (req, res) => res.json([{value:'groups_4',label:'4 Groupes (16 équipes)',groups:4},{value:'groups_6',label:'6 Groupes (24 équipes)',groups:6},{value:'groups_8',label:'8 Groupes (32 équipes)',groups:8},{value:'knockout_16',label:'Élimination (16)',groups:0},{value:'knockout_8',label:'Élimination (8)',groups:0}]));
app.get('/api/tournaments/:id', async (req, res) => { try { res.json((await pool.query('SELECT * FROM tournaments WHERE id=$1', [req.params.id])).rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});
app.get('/api/tournaments/:id/teams', async (req, res) => { 
  try { 
    const result = await pool.query('SELECT tt.id, tt.tournament_id, tt.team_id, tt.group_name, t.name, t.code, t.flag_url FROM tournament_teams tt JOIN teams t ON tt.team_id=t.id WHERE tt.tournament_id=$1 ORDER BY tt.group_name, t.name', [req.params.id]);
    res.json(result.rows); 
  } catch (e) { 
    console.error('Error fetching tournament teams:', e);
    res.status(500).json({ error: 'Erreur' }); 
  }
});
app.post('/api/tournaments', auth, adminAuth, async (req, res) => { try { const {name,description,start_date,end_date,logo_url,is_active,format}=req.body; res.json((await pool.query('INSERT INTO tournaments(name,description,start_date,end_date,logo_url,is_active,format) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [name,description,start_date,end_date,logo_url,is_active!==false,format||'groups_4'])).rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});
app.put('/api/tournaments/:id', auth, adminAuth, async (req, res) => { try { const {name,description,start_date,end_date,logo_url,is_active,format}=req.body; res.json((await pool.query('UPDATE tournaments SET name=$1,description=$2,start_date=$3,end_date=$4,logo_url=$5,is_active=$6,format=$7 WHERE id=$8 RETURNING *', [name,description,start_date,end_date,logo_url,is_active,format,req.params.id])).rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});
app.delete('/api/tournaments/:id', auth, adminAuth, async (req, res) => { try { await pool.query('DELETE FROM tournaments WHERE id=$1', [req.params.id]); res.json({ message: 'OK' }); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});

// Tournament Teams (bulk) - NO POSITION COLUMN
app.post('/api/admin/tournaments/:id/teams', auth, adminAuth, async (req, res) => {
  try {
    const tournamentId = req.params.id;
    const teams = req.body.teams || [];
    
    console.log('Saving tournament teams:', { tournamentId, teamsCount: teams.length });
    
    await pool.query('DELETE FROM tournament_teams WHERE tournament_id=$1', [tournamentId]);
    
    let inserted = 0;
    for (const t of teams) {
      if (t.teamId && t.groupName) {
        await pool.query(
          'INSERT INTO tournament_teams(tournament_id, team_id, group_name) VALUES($1, $2, $3)',
          [tournamentId, t.teamId, t.groupName]
        );
        inserted++;
      }
    }
    
    console.log('Inserted teams:', inserted);
    res.json({ message: 'OK', inserted });
  } catch (e) { 
    console.error('Error saving tournament teams:', e);
    res.status(500).json({ error: 'Erreur: ' + e.message }); 
  }
});

// =====================================================
// MATCHES - PUBLIC ENDPOINTS (with 24h filter for users)
// =====================================================

app.get('/api/matches/visible', async (req, res) => { 
  try { 
    const result = await pool.query(`
      SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag, 
             t2.name as team2_name, t2.flag_url as team2_flag, 
             tour.name as tournament_name 
      FROM matches m 
      JOIN teams t1 ON m.team1_id=t1.id 
      JOIN teams t2 ON m.team2_id=t2.id 
      LEFT JOIN tournaments tour ON m.tournament_id=tour.id 
      WHERE m.status IN ('completed','live') 
         OR (m.status='upcoming' AND m.match_date <= NOW() + INTERVAL '24 hours' AND m.match_date > NOW())
      ORDER BY CASE WHEN m.status='live' THEN 0 WHEN m.status='upcoming' THEN 1 ELSE 2 END, match_date
    `);
    res.json(result.rows); 
  } catch (e) { 
    console.error('Error fetching visible matches:', e);
    res.status(500).json({ error: 'Erreur' }); 
  }
});

app.get('/api/matches/tournament/:id', async (req, res) => { 
  try { 
    const result = await pool.query(`
      SELECT m.*, t1.name as team1_name, t1.flag_url as team1_flag, 
             t2.name as team2_name, t2.flag_url as team2_flag 
      FROM matches m 
      JOIN teams t1 ON m.team1_id=t1.id 
      JOIN teams t2 ON m.team2_id=t2.id 
      WHERE m.tournament_id=$1 
        AND (m.status IN ('completed','live') 
             OR (m.status='upcoming' AND m.match_date <= NOW() + INTERVAL '24 hours' AND m.match_date > NOW()))
      ORDER BY CASE WHEN m.status='live' THEN 0 WHEN m.status='upcoming' THEN 1 ELSE 2 END, match_date
    `, [req.params.id]);
    res.json(result.rows); 
  } catch (e) { 
    console.error('Error fetching tournament matches:', e);
    res.status(500).json({ error: 'Erreur' }); 
  }
});

app.get('/api/matches/:id', async (req, res) => { 
  try { 
    res.json((await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id WHERE m.id=$1`, [req.params.id])).rows[0]); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

// =====================================================
// MATCHES - ADMIN ENDPOINTS
// =====================================================

app.get('/api/matches', auth, adminAuth, async (req, res) => { 
  try { 
    res.json((await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id ORDER BY match_date`)).rows); 
  } catch (e) { 
    console.error('Error fetching matches:', e);
    res.status(500).json({ error: 'Erreur' }); 
  }
});

app.get('/api/admin/matches/tournament/:id', auth, adminAuth, async (req, res) => { 
  try { 
    res.json((await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id WHERE m.tournament_id=$1 ORDER BY match_date`, [req.params.id])).rows); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/matches', auth, adminAuth, async (req, res) => { 
  try { 
    const {tournament_id,team1_id,team2_id,match_date,stage}=req.body; 
    res.json((await pool.query('INSERT INTO matches(tournament_id,team1_id,team2_id,match_date,stage,status,team1_score,team2_score) VALUES($1,$2,$3,$4,$5,$6,0,0) RETURNING *', [tournament_id,team1_id,team2_id,match_date,stage,'upcoming'])).rows[0]); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.put('/api/matches/:id', auth, adminAuth, async (req, res) => { 
  try { 
    const {tournament_id,team1_id,team2_id,match_date,stage}=req.body; 
    res.json((await pool.query('UPDATE matches SET tournament_id=$1,team1_id=$2,team2_id=$3,match_date=$4,stage=$5 WHERE id=$6 RETURNING *', [tournament_id,team1_id,team2_id,match_date,stage,req.params.id])).rows[0]); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.delete('/api/matches/:id', auth, adminAuth, async (req, res) => { 
  try { 
    await pool.query('DELETE FROM predictions WHERE match_id=$1', [req.params.id]); 
    await pool.query('DELETE FROM matches WHERE id=$1', [req.params.id]); 
    res.json({ message: 'OK' }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.put('/api/matches/:id/start', auth, adminAuth, async (req, res) => {
  try {
    const result = await pool.query("UPDATE matches SET status='live', team1_score=COALESCE(team1_score,0), team2_score=COALESCE(team2_score,0) WHERE id=$1 RETURNING *", [req.params.id]);
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.put('/api/matches/:id/score', auth, adminAuth, async (req, res) => {
  try {
    const { team1_score, team2_score } = req.body;
    const result = await pool.query("UPDATE matches SET team1_score=$1, team2_score=$2 WHERE id=$3 RETURNING *", [team1_score, team2_score, req.params.id]);
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.put('/api/matches/:id/complete', auth, adminAuth, async (req, res) => {
  try {
    const { team1_score, team2_score } = req.body;
    await pool.query("UPDATE matches SET team1_score=$1, team2_score=$2, status='completed' WHERE id=$3", [team1_score, team2_score, req.params.id]);
    const preds = (await pool.query('SELECT * FROM predictions WHERE match_id=$1', [req.params.id])).rows;
    for (const p of preds) {
      const pts = await calcPoints(p, team1_score, team2_score);
      await pool.query('UPDATE predictions SET points_earned=$1 WHERE id=$2', [pts, p.id]);
      if (pts > 0) await pool.query('UPDATE users SET total_points=COALESCE(total_points,0)+$1 WHERE id=$2', [pts, p.user_id]);
    }
    res.json({ message: 'OK', predictions_processed: preds.length });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.put('/api/matches/:id/result', auth, adminAuth, async (req, res) => {
  try {
    const { team1_score, team2_score } = req.body;
    await pool.query("UPDATE matches SET team1_score=$1,team2_score=$2,status='completed' WHERE id=$3", [team1_score, team2_score, req.params.id]);
    const preds = (await pool.query('SELECT * FROM predictions WHERE match_id=$1', [req.params.id])).rows;
    for (const p of preds) {
      const pts = await calcPoints(p, team1_score, team2_score);
      await pool.query('UPDATE predictions SET points_earned=$1 WHERE id=$2', [pts, p.id]);
      if (pts > 0) await pool.query('UPDATE users SET total_points=COALESCE(total_points,0)+$1 WHERE id=$2', [pts, p.user_id]);
    }
    res.json({ message: 'OK' });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

// Predictions
app.get('/api/predictions', auth, async (req, res) => { 
  try { 
    res.json((await pool.query(`SELECT p.*,m.match_date,m.team1_score as actual_team1_score,m.team2_score as actual_team2_score,m.status,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name FROM predictions p JOIN matches m ON p.match_id=m.id JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id WHERE p.user_id=$1 ORDER BY m.match_date DESC`, [req.userId])).rows); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/predictions', auth, async (req, res) => {
  try {
    const { match_id, team1_score, team2_score } = req.body;
    const m = (await pool.query('SELECT status,match_date FROM matches WHERE id=$1', [match_id])).rows[0];
    if (!m || m.status !== 'upcoming' || new Date(m.match_date) <= new Date()) return res.status(400).json({ error: 'Pronostics fermés' });
    res.json((await pool.query('INSERT INTO predictions(user_id,match_id,team1_score,team2_score) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,match_id) DO UPDATE SET team1_score=$3,team2_score=$4 RETURNING *', [req.userId, match_id, team1_score, team2_score])).rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/users/:id/predictions', async (req, res) => {
  try {
    const user = (await pool.query('SELECT id,name,total_points FROM users WHERE id=$1', [req.params.id])).rows[0];
    const predictions = (await pool.query(`SELECT p.*,m.match_date,m.team1_score as actual_team1_score,m.team2_score as actual_team2_score,m.status,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name FROM predictions p JOIN matches m ON p.match_id=m.id JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id WHERE p.user_id=$1 AND m.status='completed' ORDER BY m.match_date DESC`, [req.params.id])).rows;
    const winnerPred = (await pool.query('SELECT twp.*,t.name as team_name,t.flag_url,tour.name as tournament_name FROM tournament_winner_predictions twp JOIN teams t ON twp.team_id=t.id JOIN tournaments tour ON twp.tournament_id=tour.id WHERE twp.user_id=$1', [req.params.id])).rows;
    res.json({ user, predictions, winnerPredictions: winnerPred });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

// Tournament winner prediction - FIXED: Check if any match has STARTED (status live or completed)
app.get('/api/tournament-winner/:tournamentId', auth, async (req, res) => { 
  try { 
    res.json((await pool.query('SELECT twp.*,t.name as team_name,t.flag_url FROM tournament_winner_predictions twp JOIN teams t ON twp.team_id=t.id WHERE twp.user_id=$1 AND twp.tournament_id=$2', [req.userId, req.params.tournamentId])).rows[0] || null); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/tournament-winner', auth, async (req, res) => {
  try {
    const { tournament_id, team_id } = req.body;
    
    // Check if any match has actually started (status = 'live' or 'completed')
    const startedMatch = (await pool.query(
      "SELECT id FROM matches WHERE tournament_id=$1 AND status IN ('live', 'completed') LIMIT 1", 
      [tournament_id]
    )).rows[0];
    
    if (startedMatch) {
      return res.status(400).json({ error: 'Tournoi déjà commencé' });
    }
    
    // If no match has started, allow the prediction
    res.json((await pool.query(
      'INSERT INTO tournament_winner_predictions(user_id,tournament_id,team_id) VALUES($1,$2,$3) ON CONFLICT(user_id,tournament_id) DO UPDATE SET team_id=$3 RETURNING *', 
      [req.userId, tournament_id, team_id]
    )).rows[0]);
  } catch (e) { 
    console.error('Error saving tournament winner prediction:', e);
    res.status(500).json({ error: 'Erreur' }); 
  }
});

// Leaderboard - PUBLIC
app.get('/api/leaderboard', async (req, res) => { 
  try { 
    res.json((await pool.query(`SELECT id,name,COALESCE(total_points,0) as total_points, (SELECT COUNT(*) FROM predictions WHERE user_id=users.id) as total_predictions FROM users ORDER BY total_points DESC NULLS LAST`)).rows); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

// Admin
app.get('/api/admin/users', auth, adminAuth, async (req, res) => { try { res.json((await pool.query('SELECT id,name,phone,is_admin,total_points,created_at FROM users ORDER BY total_points DESC NULLS LAST')).rows); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});
app.put('/api/admin/users/:id', auth, adminAuth, async (req, res) => { try { const {is_admin,total_points}=req.body; res.json((await pool.query('UPDATE users SET is_admin=COALESCE($1,is_admin),total_points=COALESCE($2,total_points) WHERE id=$3 RETURNING *', [is_admin,total_points,req.params.id])).rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});
app.delete('/api/admin/users/:id', auth, adminAuth, async (req, res) => { try { await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]); res.json({ message: 'OK' }); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});

app.get('/api/admin/scoring-rules', auth, adminAuth, async (req, res) => { try { res.json((await pool.query('SELECT * FROM scoring_rules')).rows); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});
app.put('/api/admin/scoring-rules', auth, adminAuth, async (req, res) => { try { for (const [k,v] of Object.entries(req.body)) await pool.query('UPDATE scoring_rules SET points=$1 WHERE rule_type=$2', [v,k]); res.json({ message: 'OK' }); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});

app.get('/api/settings', async (req, res) => { try { const s={}; (await pool.query('SELECT * FROM site_settings')).rows.forEach(r=>s[r.setting_key]=r.setting_value); res.json(s); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});
app.put('/api/admin/settings', auth, adminAuth, async (req, res) => { try { for (const [k,v] of Object.entries(req.body)) await pool.query('INSERT INTO site_settings(setting_key,setting_value) VALUES($1,$2) ON CONFLICT(setting_key) DO UPDATE SET setting_value=$2', [k,v]); res.json({ message: 'OK' }); } catch (e) { res.status(500).json({ error: 'Erreur' }); }});

app.post('/api/admin/award-winner', auth, adminAuth, async (req, res) => {
  try {
    const { tournament_id, team_id } = req.body;
    const pts = (await pool.query("SELECT points FROM scoring_rules WHERE rule_type='tournament_winner'")).rows[0]?.points || 10;
    const winners = (await pool.query('SELECT user_id FROM tournament_winner_predictions WHERE tournament_id=$1 AND team_id=$2', [tournament_id, team_id])).rows;
    for (const w of winners) {
      await pool.query('UPDATE tournament_winner_predictions SET points_earned=$1 WHERE tournament_id=$2 AND user_id=$3', [pts, tournament_id, w.user_id]);
      await pool.query('UPDATE users SET total_points=COALESCE(total_points,0)+$1 WHERE id=$2', [pts, w.user_id]);
    }
    res.json({ message: `${winners.length} utilisateurs récompensés` });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

const PORT = process.env.PORT || 3000;
(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✓ DB connected');
    await initDB();
    const hash = await bcrypt.hash('password', 10);
    await pool.query('INSERT INTO users(name,phone,password,is_admin) VALUES($1,$2,$3,$4) ON CONFLICT(phone) DO UPDATE SET password=$3', ['Admin','0665448641',hash,true]);
    app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
  } catch (e) { console.error('Error:', e); process.exit(1); }
})();
