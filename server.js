require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

// Simple in-memory cache to reduce DB calls
const cache = {};
const cacheGet = (key) => { const c = cache[key]; if (c && Date.now() - c.time < c.ttl) return c.data; delete cache[key]; return null; };
const cacheSet = (key, data, ttl = 30000) => { cache[key] = { data, time: Date.now(), ttl }; };
const cacheClear = (prefix) => { Object.keys(cache).forEach(k => { if (!prefix || k.startsWith(prefix)) delete cache[k]; }); };

app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Auto-clear cache on write operations
app.use((req, res, next) => {
  if (['POST','PUT','DELETE'].includes(req.method)) {
    const p = req.path;
    if (p.includes('team')) cacheClear('teams');
    if (p.includes('tournament')) cacheClear('tournaments');
    if (p.includes('player') || p.includes('goal')) cacheClear('players');
    if (p.includes('player') || p.includes('goal')) cacheClear('gs_');
    if (p.includes('player') || p.includes('goal')) cacheClear('all_players');
    if (p.includes('match')) cacheClear();
  }
  next();
});

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
    const r = await pool.query('SELECT is_admin, is_employee FROM users WHERE id=$1', [req.userId]);
    if (!r.rows[0]?.is_admin && !r.rows[0]?.is_employee) return res.status(403).json({ error: 'Accès requis' });
    req.isAdmin = r.rows[0]?.is_admin || false;
    req.isEmployee = r.rows[0]?.is_employee || false;
    next();
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
};

// Strict admin only - for destructive actions
const strictAdmin = async (req, res, next) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin requis' });
  next();
};

const initDB = async () => {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(255), phone VARCHAR(20) UNIQUE, password VARCHAR(255), is_admin BOOLEAN DEFAULT FALSE, total_points INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS teams (id SERIAL PRIMARY KEY, name VARCHAR(255), code VARCHAR(10), flag_url TEXT)`,
    `CREATE TABLE IF NOT EXISTS tournaments (id SERIAL PRIMARY KEY, name VARCHAR(255), description TEXT, logo_url TEXT, start_date DATE, end_date DATE, is_active BOOLEAN DEFAULT TRUE, format VARCHAR(50) DEFAULT 'groups_4', max_teams INTEGER DEFAULT 32)`,
    `CREATE TABLE IF NOT EXISTS tournament_teams (id SERIAL PRIMARY KEY, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE, group_name VARCHAR(10), UNIQUE(tournament_id, team_id))`,
    `CREATE TABLE IF NOT EXISTS matches (id SERIAL PRIMARY KEY, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, team1_id INTEGER REFERENCES teams(id), team2_id INTEGER REFERENCES teams(id), team1_score INTEGER DEFAULT 0, team2_score INTEGER DEFAULT 0, match_date TIMESTAMP, stage VARCHAR(100), status VARCHAR(20) DEFAULT 'upcoming', bracket_round INTEGER, bracket_position INTEGER, next_match_id INTEGER, next_match_slot INTEGER)`,
    `CREATE TABLE IF NOT EXISTS predictions (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE, team1_score INTEGER, team2_score INTEGER, points_earned INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, match_id))`,
    `CREATE TABLE IF NOT EXISTS scoring_rules (id SERIAL PRIMARY KEY, rule_type VARCHAR(50) UNIQUE, points INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS tournament_scoring_rules (id SERIAL PRIMARY KEY, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, rule_type VARCHAR(50) NOT NULL, points INTEGER DEFAULT 0, UNIQUE(tournament_id, rule_type))`,
    `CREATE TABLE IF NOT EXISTS site_settings (id SERIAL PRIMARY KEY, setting_key VARCHAR(100) UNIQUE, setting_value TEXT)`,
    `CREATE TABLE IF NOT EXISTS tournament_winner_predictions (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE, points_earned INTEGER DEFAULT 0, UNIQUE(user_id, tournament_id))`,
    `CREATE TABLE IF NOT EXISTS tournament_players (id SERIAL PRIMARY KEY, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL, name VARCHAR(255) NOT NULL, photo_url TEXT, position VARCHAR(100))`,
    `CREATE TABLE IF NOT EXISTS player_predictions (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, best_player_id INTEGER REFERENCES tournament_players(id) ON DELETE SET NULL, best_goal_scorer_id INTEGER REFERENCES tournament_players(id) ON DELETE SET NULL, points_earned INTEGER DEFAULT 0, UNIQUE(user_id, tournament_id))`,
    `CREATE TABLE IF NOT EXISTS goal_events (id SERIAL PRIMARY KEY, player_id INTEGER REFERENCES tournament_players(id) ON DELETE CASCADE, match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, minute INTEGER, created_at TIMESTAMP DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS sanctions (id SERIAL PRIMARY KEY, player_id INTEGER REFERENCES tournament_players(id) ON DELETE CASCADE, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL, type VARCHAR(50) NOT NULL, reason TEXT, match_ban_count INTEGER DEFAULT 0, minute INTEGER, created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW(), is_active BOOLEAN DEFAULT TRUE)`,
    `CREATE TABLE IF NOT EXISTS point_adjustments (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, points INTEGER NOT NULL, reason TEXT, created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS team_sanctions (id SERIAL PRIMARY KEY, team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, points_deducted INTEGER NOT NULL DEFAULT 0, reason TEXT, created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS group_qualifications (id SERIAL PRIMARY KEY, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, group_name VARCHAR(10) NOT NULL, qualify_count INTEGER NOT NULL DEFAULT 2, UNIQUE(tournament_id, group_name))`,
  ];
  for (const sql of tables) { try { await pool.query(sql); } catch(e) { console.log('Table note:', e.message); } }

  // Migration: drop old sanctions table if it has user_id column (old schema targeting users instead of players)
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='sanctions' AND column_name='user_id'");
    if (colCheck.rows.length > 0) {
      console.log('Migrating sanctions table from old user-based schema to player-based schema...');
      await pool.query('DROP TABLE IF EXISTS sanctions CASCADE');
      await pool.query(`CREATE TABLE IF NOT EXISTS sanctions (id SERIAL PRIMARY KEY, player_id INTEGER REFERENCES tournament_players(id) ON DELETE CASCADE, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL, type VARCHAR(50) NOT NULL, reason TEXT, match_ban_count INTEGER DEFAULT 0, minute INTEGER, created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW(), is_active BOOLEAN DEFAULT TRUE)`);
      console.log('Sanctions table migrated successfully');
    }
  } catch(e) { console.log('Sanctions migration note:', e.message); }

  const dropFKs = [
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tournaments_best_player_id_fkey') THEN ALTER TABLE tournaments DROP CONSTRAINT tournaments_best_player_id_fkey; END IF; END $$`,
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tournaments_best_goal_scorer_id_fkey') THEN ALTER TABLE tournaments DROP CONSTRAINT tournaments_best_goal_scorer_id_fkey; END IF; END $$`,
  ];
  for (const sql of dropFKs) { try { await pool.query(sql); } catch(e) {} }

  const alts = [
    'ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS best_player_id INTEGER',
    'ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS best_goal_scorer_id INTEGER',
    'ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS format VARCHAR(50) DEFAULT \'groups_4\'',
    'ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS max_teams INTEGER DEFAULT 32',
    'ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS has_started BOOLEAN DEFAULT FALSE',
    'ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS enable_player_predictions BOOLEAN DEFAULT FALSE',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_employee BOOLEAN DEFAULT FALSE',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS correct_predictions INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS total_predictions INTEGER DEFAULT 0',
    'ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS lock_match_predictions BOOLEAN DEFAULT FALSE',
    'ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS lock_winner_prediction BOOLEAN DEFAULT FALSE',
    'ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS lock_player_predictions BOOLEAN DEFAULT FALSE',
    'ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS lock_finalist_prediction BOOLEAN DEFAULT FALSE',
    'ALTER TABLE matches ADD COLUMN IF NOT EXISTS bracket_round INTEGER',
    'ALTER TABLE matches ADD COLUMN IF NOT EXISTS bracket_position INTEGER',
    'ALTER TABLE matches ADD COLUMN IF NOT EXISTS next_match_id INTEGER',
    'ALTER TABLE matches ADD COLUMN IF NOT EXISTS next_match_slot INTEGER',
    'ALTER TABLE tournament_players ADD COLUMN IF NOT EXISTS goals INTEGER DEFAULT 0',
    'ALTER TABLE matches ADD COLUMN IF NOT EXISTS predictions_locked BOOLEAN DEFAULT FALSE',
    'ALTER TABLE matches ADD COLUMN IF NOT EXISTS team1_shots INTEGER DEFAULT 0',
    'ALTER TABLE matches ADD COLUMN IF NOT EXISTS team2_shots INTEGER DEFAULT 0',
    'ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS rank_override INTEGER',
    'ALTER TABLE matches ADD COLUMN IF NOT EXISTS admin_note TEXT',
    'ALTER TABLE sanctions ADD COLUMN IF NOT EXISTS bans_remaining INTEGER',
  ];
  for (const sql of alts) { try { await pool.query(sql); } catch(e) {} }

  // Finalist predictions table
  try { await pool.query('CREATE TABLE IF NOT EXISTS finalist_predictions (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE, points_earned INTEGER DEFAULT 0, UNIQUE(user_id, tournament_id))'); } catch(e) {}

  const rules = [['exact_score',5],['correct_winner',2],['correct_draw',3],['correct_goal_diff',1],['one_team_goals',1],['tournament_winner',10],['tournament_runner_up',5],['tournament_finalist',3],['best_player',7],['best_goal_scorer',7],['final_exact_score',15]];
  for (const [t,p] of rules) await pool.query('INSERT INTO scoring_rules(rule_type,points) VALUES($1,$2) ON CONFLICT DO NOTHING',[t,p]);

  const defaults = [
    ['primary_color','#f9ad00'],['accent_color','#ff6b00'],['secondary_color','#22c55e'],
    ['bg_color','#0f172a'],['bg_color_2','#1e293b'],
    ['card_color','rgba(255, 255, 255, 0.05)'],['card_border','rgba(255, 255, 255, 0.1)'],
    ['navbar_bg','rgba(15, 23, 42, 0.95)'],['navbar_text','#ffffff'],
    ['text_color','#ffffff'],['text_muted','#9ca3af'],
    ['gradient_start','#f9ad00'],['gradient_end','#ff6b00'],
    ['success_color','#22c55e'],['error_color','#ef4444'],['warning_color','#f59e0b'],['live_color','#ef4444'],
    ['scrollbar_thumb','#f9ad00'],['scrollbar_track','#1e293b'],
    ['btn_primary_bg','#f9ad00'],['btn_primary_hover','#d97706'],
    ['btn_secondary_bg','#2e7d32'],['btn_secondary_hover','#15803d'],
    ['input_bg','#374151'],['input_border','#4b5563'],
    ['font_heading','Bebas Neue'],['font_body','Poppins'],['border_radius','12'],
    ['header_name','Prediction World'],['header_logo',''],
    ['home_name','Prediction World'],['home_logo',''],
    ['site_name','Prediction World'],['site_logo',''],
    ['prediction_cutoff_minutes','60']
  ];
  for (const [k,v] of defaults) await pool.query('INSERT INTO site_settings(setting_key,setting_value) VALUES($1,$2) ON CONFLICT DO NOTHING',[k,v]);
  console.log('DB initialized');
};

const getTournamentRules = async (tournamentId) => {
  const rules = {};
  (await pool.query('SELECT rule_type, points FROM scoring_rules')).rows.forEach(r => rules[r.rule_type] = r.points);
  if (tournamentId) {
    const tRules = (await pool.query('SELECT rule_type, points FROM tournament_scoring_rules WHERE tournament_id=$1', [tournamentId])).rows;
    if (tRules.length > 0) tRules.forEach(r => rules[r.rule_type] = r.points);
  }
  return rules;
};

// Decrement bans_remaining for all active suspended players of a team after their team plays a match
const decrementSuspensions = async (teamId, tournamentId) => {
  try {
    // Get all active sanctions with bans_remaining > 0 for players in this team
    const sanctions = (await pool.query(`
      SELECT s.id, s.bans_remaining FROM sanctions s
      JOIN tournament_players tp ON s.player_id = tp.id
      WHERE tp.team_id = $1 AND s.tournament_id = $2
        AND s.is_active = true AND s.bans_remaining > 0
    `, [teamId, tournamentId])).rows;
    for (const s of sanctions) {
      const newRemaining = s.bans_remaining - 1;
      if (newRemaining <= 0) {
        // Suspension served — mark as no longer active
        await pool.query('UPDATE sanctions SET bans_remaining = 0, is_active = false WHERE id = $1', [s.id]);
      } else {
        await pool.query('UPDATE sanctions SET bans_remaining = $1 WHERE id = $2', [newRemaining, s.id]);
      }
    }
  } catch(e) { console.error('decrementSuspensions error:', e); }
};

const calcPoints = async (pred, t1, t2, tournamentId) => {
  const rules = await getTournamentRules(tournamentId);
  const isExact = pred.team1_score===t1 && pred.team2_score===t2;
  
  // Exact score = exclusive reward, no stacking
  if (isExact) {
    return rules.exact_score ?? 5;
  }
  
  let pts = 0;
  const aW = t1>t2?1:t1<t2?2:0, pW = pred.team1_score>pred.team2_score?1:pred.team1_score<pred.team2_score?2:0;
  
  // Correct winner or draw
  if (aW===pW) {
    pts += aW===0?(rules.correct_draw ?? 3):(rules.correct_winner ?? 2);
    // Goal difference bonus only when winner is correct
    if ((t1-t2)===(pred.team1_score-pred.team2_score)) pts+=rules.correct_goal_diff ?? 1;
    // Individual team goals bonus only when winner/draw is correct
    if (pred.team1_score===t1) pts+=rules.one_team_goals ?? 1;
    if (pred.team2_score===t2) pts+=rules.one_team_goals ?? 1;
  }
  // No points if winner prediction is wrong
  return pts;
};

app.get('/', (req, res) => res.json({ name: 'Prediction World API', version: '4.0' }));

// Helper: check if user is within 1-hour new-user grace period
const isNewUserGracePeriod = async (userId) => {
  try {
    const user = (await pool.query('SELECT created_at FROM users WHERE id=$1', [userId])).rows[0];
    if (!user) return false;
    const hourAgo = new Date(Date.now() - 3600000);
    return new Date(user.created_at) > hourAgo;
  } catch(e) { return false; }
};

// Auth
app.post('/api/auth/register', async (req, res) => { try { const {name,phone,password,avatar_url}=req.body||{}; if(!name||!phone||!password) return res.status(400).json({error:'Champs requis'}); const clean=phone.replace(/[\s-]/g,''); if(!/^(05|06|07)\d{8}$/.test(clean)) return res.status(400).json({error:'Numéro invalide'}); if((await pool.query('SELECT id FROM users WHERE phone=$1',[clean])).rows.length) return res.status(400).json({error:'Numéro déjà utilisé'}); const r=await pool.query('INSERT INTO users(name,phone,password,avatar_url) VALUES($1,$2,$3,$4) RETURNING *',[name,clean,await bcrypt.hash(password,10),avatar_url||null]); res.json({token:jwt.sign({userId:r.rows[0].id},JWT_SECRET,{expiresIn:'30d'}),user:{...r.rows[0],password:undefined}}); } catch(e) { console.error(e); res.status(500).json({error:'Erreur serveur'}); }});
app.post('/api/auth/login', async (req, res) => { try { const {phone,password}=req.body||{}; const clean=phone?.replace(/[\s-]/g,''); const r=await pool.query('SELECT * FROM users WHERE phone=$1',[clean]); if(!r.rows[0]||!(await bcrypt.compare(password,r.rows[0].password))) return res.status(401).json({error:'Identifiants incorrects'}); res.json({token:jwt.sign({userId:r.rows[0].id},JWT_SECRET,{expiresIn:'30d'}),user:{id:r.rows[0].id,name:r.rows[0].name,phone:r.rows[0].phone,is_admin:r.rows[0].is_admin,is_employee:r.rows[0].is_employee||false,total_points:r.rows[0].total_points||0,avatar_url:r.rows[0].avatar_url||null}}); } catch(e) { res.status(500).json({error:'Erreur serveur'}); }});
app.get('/api/auth/verify', auth, async (req, res) => { try { res.json({valid:true,user:(await pool.query('SELECT id,name,phone,is_admin,is_employee,total_points,avatar_url FROM users WHERE id=$1',[req.userId])).rows[0]}); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/auth/avatar', auth, async (req, res) => { try { const {avatar_url}=req.body; res.json((await pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2 RETURNING id,name,phone,is_admin,is_employee,total_points,avatar_url',[avatar_url||null,req.userId])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// Teams
app.get('/api/teams', async (req, res) => { try { const c=cacheGet('teams'); if(c) return res.json(c); const d=(await pool.query('SELECT * FROM teams ORDER BY name')).rows; cacheSet('teams',d,60000); res.json(d); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/teams/:id', async (req, res) => { try { res.json((await pool.query('SELECT * FROM teams WHERE id=$1',[req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.post('/api/teams', auth, adminAuth, async (req, res) => { try { const {name,code,flag_url}=req.body; res.json((await pool.query('INSERT INTO teams(name,code,flag_url) VALUES($1,$2,$3) RETURNING *',[name,code,flag_url])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/teams/:id', auth, adminAuth, async (req, res) => { try { const {name,code,flag_url}=req.body; res.json((await pool.query('UPDATE teams SET name=$1,code=$2,flag_url=$3 WHERE id=$4 RETURNING *',[name,code,flag_url,req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.delete('/api/teams/:id', auth, adminAuth, async (req, res) => { try { await pool.query('DELETE FROM teams WHERE id=$1',[req.params.id]); res.json({message:'OK'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// Teams by tournament
app.get('/api/teams-by-tournament', async (req, res) => {
  try {
    res.json((await pool.query(`SELECT t.id as tournament_id, t.name as tournament_name, t.logo_url as tournament_logo, t.is_active, tt.group_name, tm.id as team_id, tm.name as team_name, tm.code as team_code, tm.flag_url FROM tournaments t JOIN tournament_teams tt ON t.id = tt.tournament_id JOIN teams tm ON tt.team_id = tm.id ORDER BY t.start_date DESC, tt.group_name, tm.name`)).rows);
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

// Tournaments
app.get('/api/tournaments', async (req, res) => { try { const c=cacheGet('tournaments'); if(c) return res.json(c); const d=(await pool.query(`SELECT t.*, (SELECT COUNT(*) FROM matches WHERE tournament_id=t.id) as match_count, (SELECT COUNT(*) FROM tournament_teams WHERE tournament_id=t.id) as team_count FROM tournaments t ORDER BY start_date DESC`)).rows; cacheSet('tournaments',d,30000); res.json(d); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/tournaments/active', async (req, res) => { try { res.json((await pool.query(`SELECT t.*, (SELECT COUNT(*) FROM matches WHERE tournament_id=t.id) as match_count, (SELECT COUNT(*) FROM tournament_teams WHERE tournament_id=t.id) as team_count FROM tournaments t WHERE is_active=true`)).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/tournaments/formats', (req, res) => res.json([{value:'groups_4',label:'4 Groupes',groups:4},{value:'groups_6',label:'6 Groupes',groups:6},{value:'groups_8',label:'8 Groupes',groups:8},{value:'knockout_16',label:'Élimination (16)',groups:0},{value:'knockout_8',label:'Élimination (8)',groups:0},{value:'custom',label:'Personnalisé',groups:0}]));
app.get('/api/tournaments/:id', async (req, res) => { try { res.json((await pool.query('SELECT * FROM tournaments WHERE id=$1',[req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/tournaments/:id/teams', async (req, res) => { try { res.json((await pool.query('SELECT tt.id,tt.tournament_id,tt.team_id,tt.group_name,t.name,t.code,t.flag_url FROM tournament_teams tt JOIN teams t ON tt.team_id=t.id WHERE tt.tournament_id=$1 ORDER BY tt.group_name,t.name',[req.params.id])).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.post('/api/tournaments', auth, adminAuth, async (req, res) => { try { const {name,description,start_date,end_date,logo_url,is_active,format,max_teams,enable_player_predictions}=req.body; const t=(await pool.query('INSERT INTO tournaments(name,description,start_date,end_date,logo_url,is_active,format,max_teams,enable_player_predictions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[name,description,start_date,end_date,logo_url,is_active!==false,format||'groups_4',max_teams||32,enable_player_predictions||false])).rows[0]; const gr=(await pool.query('SELECT rule_type,points FROM scoring_rules')).rows; for(const r of gr) await pool.query('INSERT INTO tournament_scoring_rules(tournament_id,rule_type,points) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[t.id,r.rule_type,r.points]); res.json(t); } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }});
app.put('/api/tournaments/:id', auth, adminAuth, async (req, res) => { try { const {name,description,start_date,end_date,logo_url,is_active,format,max_teams,enable_player_predictions}=req.body; res.json((await pool.query('UPDATE tournaments SET name=$1,description=$2,start_date=$3,end_date=$4,logo_url=$5,is_active=$6,format=$7,max_teams=$8,enable_player_predictions=$9 WHERE id=$10 RETURNING *',[name,description,start_date,end_date,logo_url,is_active,format,max_teams||32,enable_player_predictions||false,req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.delete('/api/tournaments/:id', auth, adminAuth, async (req, res) => { try { await pool.query('DELETE FROM tournaments WHERE id=$1',[req.params.id]); res.json({message:'OK'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// Tournament Teams bulk
app.post('/api/admin/tournaments/:id/teams', auth, adminAuth, async (req, res) => { try { const tid=req.params.id; const teams=req.body.teams||[]; await pool.query('DELETE FROM tournament_teams WHERE tournament_id=$1',[tid]); let ins=0; for(const t of teams) { if(t.teamId&&t.groupName) { await pool.query('INSERT INTO tournament_teams(tournament_id,team_id,group_name) VALUES($1,$2,$3)',[tid,t.teamId,t.groupName]); ins++; } } res.json({message:'OK',inserted:ins}); } catch(e) { res.status(500).json({error:'Erreur: '+e.message}); }});

// Tournament scoring rules
app.get('/api/tournaments/:id/scoring-rules', async (req, res) => { try { res.json(await getTournamentRules(req.params.id)); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/admin/tournaments/:id/scoring-rules', auth, adminAuth, async (req, res) => {
  try {
    const tid = req.params.id;
    for(const [rt,pts] of Object.entries(req.body)) await pool.query('INSERT INTO tournament_scoring_rules(tournament_id,rule_type,points) VALUES($1,$2,$3) ON CONFLICT(tournament_id,rule_type) DO UPDATE SET points=$3',[tid,rt,parseInt(pts)||0]);
    // Auto-recalculate this tournament
    const matches = (await pool.query("SELECT * FROM matches WHERE tournament_id=$1 AND status='completed'", [tid])).rows;
    let totalUpdated = 0;
    const userPointsMap = {};
    for (const m of matches) {
      const preds = (await pool.query('SELECT * FROM predictions WHERE match_id=$1', [m.id])).rows;
      for (const p of preds) {
        const oldPts = p.points_earned || 0;
        const newPts = await calcPoints(p, m.team1_score, m.team2_score, tid);
        if (oldPts !== newPts) {
          await pool.query('UPDATE predictions SET points_earned=$1 WHERE id=$2', [newPts, p.id]);
          if (!userPointsMap[p.user_id]) userPointsMap[p.user_id] = 0;
          userPointsMap[p.user_id] += (newPts - oldPts);
          totalUpdated++;
        }
      }
    }
    for (const [uid, diff] of Object.entries(userPointsMap)) {
      await pool.query('UPDATE users SET total_points=GREATEST(0,COALESCE(total_points,0)+$1) WHERE id=$2', [diff, uid]);
    }
    cacheClear('lb');
    res.json({message:`Règles sauvegardées. ${totalUpdated} pronostics recalculés.`, recalculated: totalUpdated});
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

// Recalculate all scores for a tournament after rule changes
app.post('/api/admin/tournaments/:id/recalculate', auth, adminAuth, async (req, res) => {
  try {
    const tid = req.params.id;
    // Get all completed matches for this tournament
    const matches = (await pool.query("SELECT * FROM matches WHERE tournament_id=$1 AND status='completed'", [tid])).rows;
    let updated = 0;
    // Reset user points first - we'll recompute
    const userPointsMap = {};
    for (const m of matches) {
      const preds = (await pool.query('SELECT * FROM predictions WHERE match_id=$1', [m.id])).rows;
      for (const p of preds) {
        const oldPts = p.points_earned || 0;
        const newPts = await calcPoints(p, m.team1_score, m.team2_score, tid);
        if (oldPts !== newPts) {
          await pool.query('UPDATE predictions SET points_earned=$1 WHERE id=$2', [newPts, p.id]);
          if (!userPointsMap[p.user_id]) userPointsMap[p.user_id] = 0;
          userPointsMap[p.user_id] += (newPts - oldPts);
          updated++;
        }
      }
    }
    // Update user total points
    for (const [uid, diff] of Object.entries(userPointsMap)) {
      await pool.query('UPDATE users SET total_points=GREATEST(0,COALESCE(total_points,0)+$1) WHERE id=$2', [diff, uid]);
    }
    res.json({ message: `${updated} pronostics recalculés`, updated });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur: ' + e.message }); }
});

// Tournament Players
app.get('/api/tournaments/:id/players', async (req, res) => { try { const k='players_'+req.params.id; const c=cacheGet(k); if(c) return res.json(c); const d=(await pool.query('SELECT tp.*,t.name as team_name,t.flag_url as team_flag FROM tournament_players tp LEFT JOIN teams t ON tp.team_id=t.id WHERE tp.tournament_id=$1 ORDER BY t.name,tp.name',[req.params.id])).rows; cacheSet(k,d,120000); res.json(d); } catch(e) { res.status(500).json({error:'Erreur'}); }});
// Get ALL players across all tournaments (for reuse)
app.get('/api/players/all', async (req, res) => { try { const c=cacheGet('all_players'); if(c) return res.json(c); const d=(await pool.query('SELECT DISTINCT ON (tp.name, tp.team_id) tp.id, tp.name, tp.team_id, tp.photo_url, tp.position, t.name as team_name, t.flag_url as team_flag FROM tournament_players tp LEFT JOIN teams t ON tp.team_id=t.id ORDER BY tp.name, tp.team_id, tp.id DESC')).rows; cacheSet('all_players',d,60000); res.json(d); } catch(e) { res.status(500).json({error:'Erreur'}); }});
// Get players for a specific team (across all tournaments)
app.get('/api/teams/:id/players', async (req, res) => { try { const k='tp_'+req.params.id; const c=cacheGet(k); if(c) return res.json(c); const d=(await pool.query('SELECT DISTINCT ON (tp.name) tp.id, tp.name, tp.team_id, tp.photo_url, tp.position, t.name as team_name, t.flag_url as team_flag FROM tournament_players tp LEFT JOIN teams t ON tp.team_id=t.id WHERE tp.team_id=$1 ORDER BY tp.name, tp.id DESC',[req.params.id])).rows; cacheSet(k,d,120000); res.json(d); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.post('/api/tournaments/:id/players', auth, adminAuth, async (req, res) => { try { const {name,team_id,photo_url,position}=req.body; res.json((await pool.query('INSERT INTO tournament_players(tournament_id,team_id,name,photo_url,position) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.params.id,team_id||null,name,photo_url||null,position||null])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
// Import player from another tournament
app.post('/api/tournaments/:id/players/import', auth, adminAuth, async (req, res) => { try { const {player_id}=req.body; const src=(await pool.query('SELECT name,team_id,photo_url,position FROM tournament_players WHERE id=$1',[player_id])).rows[0]; if(!src) return res.status(404).json({error:'Joueur non trouvé'}); const existing=(await pool.query('SELECT id FROM tournament_players WHERE tournament_id=$1 AND name=$2 AND team_id=$3',[req.params.id,src.name,src.team_id])).rows[0]; if(existing) return res.status(400).json({error:'Joueur déjà dans ce tournoi'}); res.json((await pool.query('INSERT INTO tournament_players(tournament_id,team_id,name,photo_url,position) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.params.id,src.team_id,src.name,src.photo_url,src.position])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/players/:id', auth, adminAuth, async (req, res) => { try { const {name,team_id,photo_url,position,goals}=req.body; res.json((await pool.query('UPDATE tournament_players SET name=$1,team_id=$2,photo_url=$3,position=$4,goals=COALESCE($5,goals) WHERE id=$6 RETURNING *',[name,team_id||null,photo_url||null,position||null,goals!=null?goals:null,req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
// Update just goals for a player
app.put('/api/players/:id/goals', auth, adminAuth, async (req, res) => { try { const {goals}=req.body; res.json((await pool.query('UPDATE tournament_players SET goals=$1 WHERE id=$2 RETURNING *',[goals||0,req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// Player detail with goal events
app.get('/api/players/:id/detail', async (req, res) => {
  try {
    const player = (await pool.query('SELECT tp.*, t.name as team_name, t.flag_url as team_flag, tour.name as tournament_name FROM tournament_players tp LEFT JOIN teams t ON tp.team_id=t.id LEFT JOIN tournaments tour ON tp.tournament_id=tour.id WHERE tp.id=$1', [req.params.id])).rows[0];
    if (!player) return res.status(404).json({ error: 'Joueur non trouvé' });
    const goals = (await pool.query('SELECT ge.*, m.team1_id, m.team2_id, m.team1_score, m.team2_score, m.match_date, m.stage, t1.name as team1_name, t1.flag_url as team1_flag, t2.name as team2_name, t2.flag_url as team2_flag, tour.name as tournament_name FROM goal_events ge JOIN matches m ON ge.match_id=m.id LEFT JOIN teams t1 ON m.team1_id=t1.id LEFT JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON ge.tournament_id=tour.id WHERE ge.player_id=$1 ORDER BY m.match_date DESC, ge.minute', [req.params.id])).rows;
    const allVersions = (await pool.query('SELECT tp.id, tp.tournament_id, tp.goals, tour.name as tournament_name FROM tournament_players tp JOIN tournaments tour ON tp.tournament_id=tour.id WHERE tp.name=$1 AND tp.team_id=$2 ORDER BY tour.start_date DESC', [player.name, player.team_id])).rows;
    // Get sanctions - wrapped in try/catch so it never breaks the endpoint
    let sanctions = [];
    try {
      sanctions = (await pool.query(`
        SELECT s.*, s.bans_remaining, m.match_date, m.stage as match_stage,
          mt1.name as match_team1_name, mt2.name as match_team2_name
        FROM sanctions s
        LEFT JOIN matches m ON s.match_id = m.id
        LEFT JOIN teams mt1 ON m.team1_id = mt1.id
        LEFT JOIN teams mt2 ON m.team2_id = mt2.id
        WHERE s.player_id = $1
        ORDER BY s.created_at DESC
      `, [req.params.id])).rows;
    } catch(e) { console.log('Sanctions not available:', e.message); }
    res.json({ player, goals, tournaments: allVersions, sanctions });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur' }); }
});

// Add goal event
// Match events: goals + cards for a specific match (public)
app.get('/api/matches/:id/events', async (req, res) => {
  try {
    const mid = req.params.id;
    const goals = (await pool.query(`
      SELECT ge.id, ge.minute, 'goal' as type,
        tp.name as player_name, tp.photo_url as player_photo,
        t.id as team_id, t.name as team_name, t.flag_url as team_flag,
        m.team1_id, m.team2_id
      FROM goal_events ge
      JOIN tournament_players tp ON ge.player_id = tp.id
      LEFT JOIN teams t ON tp.team_id = t.id
      JOIN matches m ON ge.match_id = m.id
      WHERE ge.match_id = $1
      ORDER BY ge.minute ASC NULLS LAST, ge.id ASC
    `, [mid])).rows;

    const cards = (await pool.query(`
      SELECT s.id, s.minute, s.type,
        tp.name as player_name, tp.photo_url as player_photo,
        t.id as team_id, t.name as team_name, t.flag_url as team_flag,
        m.team1_id, m.team2_id
      FROM sanctions s
      JOIN tournament_players tp ON s.player_id = tp.id
      LEFT JOIN teams t ON tp.team_id = t.id
      JOIN matches m ON s.match_id = m.id
      WHERE s.match_id = $1
        AND s.type IN ('yellow_card','red_card','second_yellow')
        AND s.is_active = true
      ORDER BY s.minute ASC NULLS LAST, s.id ASC
    `, [mid])).rows;

    // Merge and sort all events by minute
    const events = [...goals, ...cards].sort((a, b) => {
      if (a.minute === null && b.minute === null) return 0;
      if (a.minute === null) return 1;
      if (b.minute === null) return -1;
      return a.minute - b.minute;
    });

    res.json({ events, goals, cards });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/players/:id/goal-events', auth, adminAuth, async (req, res) => {
  try {
    const { match_id, minute } = req.body;
    const player = (await pool.query('SELECT tournament_id FROM tournament_players WHERE id=$1', [req.params.id])).rows[0];
    if (!player) return res.status(404).json({ error: 'Joueur non trouvé' });
    const ge = (await pool.query('INSERT INTO goal_events(player_id, match_id, tournament_id, minute) VALUES($1,$2,$3,$4) RETURNING *', [req.params.id, match_id, player.tournament_id, minute || null])).rows[0];
    // Update goals count
    await pool.query('UPDATE tournament_players SET goals=(SELECT COUNT(*) FROM goal_events WHERE player_id=$1) WHERE id=$1', [req.params.id]);
    res.json(ge);
  } catch(e) { res.status(500).json({ error: 'Erreur' }); }
});

// Delete goal event
app.delete('/api/goal-events/:id', auth, adminAuth, async (req, res) => {
  try {
    const ge = (await pool.query('SELECT player_id FROM goal_events WHERE id=$1', [req.params.id])).rows[0];
    if (!ge) return res.status(404).json({ error: 'But non trouvé' });
    await pool.query('DELETE FROM goal_events WHERE id=$1', [req.params.id]);
    await pool.query('UPDATE tournament_players SET goals=(SELECT COUNT(*) FROM goal_events WHERE player_id=$1) WHERE id=$1', [ge.player_id]);
    res.json({ message: 'OK' });
  } catch(e) { res.status(500).json({ error: 'Erreur' }); }
});
app.delete('/api/players/:id', auth, adminAuth, strictAdmin, async (req, res) => { try { await pool.query('DELETE FROM tournament_players WHERE id=$1',[req.params.id]); res.json({message:'OK'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// Goalscorer ranking for a tournament
app.get('/api/tournaments/:id/goalscorers', async (req, res) => { try { const k='gs_'+req.params.id; const c=cacheGet(k); if(c) return res.json(c); const d=(await pool.query('SELECT tp.*,t.name as team_name,t.flag_url as team_flag FROM tournament_players tp LEFT JOIN teams t ON tp.team_id=t.id WHERE tp.tournament_id=$1 AND tp.goals>0 ORDER BY tp.goals DESC,tp.name',[req.params.id])).rows; cacheSet(k,d,30000); res.json(d); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// Finalist predictions (predict team that reaches the final)
app.get('/api/finalist/:tournamentId', auth, async (req, res) => { try { res.json((await pool.query('SELECT fp.*,t.name as team_name,t.flag_url FROM finalist_predictions fp JOIN teams t ON fp.team_id=t.id WHERE fp.user_id=$1 AND fp.tournament_id=$2',[req.userId,req.params.tournamentId])).rows[0]||null); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.post('/api/finalist', auth, async (req, res) => { try { const {tournament_id,team_id}=req.body; const t=(await pool.query('SELECT lock_finalist_prediction FROM tournaments WHERE id=$1',[tournament_id])).rows[0]; const isNewUser = await isNewUserGracePeriod(req.userId); if(t?.lock_finalist_prediction && !isNewUser) return res.status(400).json({error:'Prédictions verrouillées par l\'admin'}); const finalMatch=(await pool.query("SELECT id FROM matches WHERE tournament_id=$1 AND bracket_round=2 AND status IN ('live','completed') LIMIT 1",[tournament_id])).rows[0]; if(finalMatch && !isNewUser) return res.status(400).json({error:'La finale a commencé'}); const existing=(await pool.query('SELECT id FROM finalist_predictions WHERE user_id=$1 AND tournament_id=$2',[req.userId,tournament_id])).rows[0]; if(existing) return res.status(400).json({error:'Prédiction déjà confirmée'}); res.json((await pool.query('INSERT INTO finalist_predictions(user_id,tournament_id,team_id) VALUES($1,$2,$3) RETURNING *',[req.userId,tournament_id,team_id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// Player predictions
app.get('/api/tournaments/:id/my-player-prediction', auth, async (req, res) => { try { res.json((await pool.query('SELECT pp.*,bp.name as best_player_name,bp.photo_url as best_player_photo,bp.position as best_player_position,bpt.name as best_player_team,bpt.flag_url as best_player_team_flag,gs.name as best_goal_scorer_name,gs.photo_url as best_goal_scorer_photo,gs.position as best_goal_scorer_position,gst.name as best_goal_scorer_team,gst.flag_url as best_goal_scorer_team_flag FROM player_predictions pp LEFT JOIN tournament_players bp ON pp.best_player_id=bp.id LEFT JOIN teams bpt ON bp.team_id=bpt.id LEFT JOIN tournament_players gs ON pp.best_goal_scorer_id=gs.id LEFT JOIN teams gst ON gs.team_id=gst.id WHERE pp.user_id=$1 AND pp.tournament_id=$2',[req.userId,req.params.id])).rows[0]||null); } catch(e) { res.status(500).json({error:'Erreur'}); }});

app.post('/api/tournaments/:id/player-prediction', auth, async (req, res) => { try { const tid=req.params.id; const {best_player_id,best_goal_scorer_id}=req.body; const t=(await pool.query('SELECT lock_player_predictions FROM tournaments WHERE id=$1',[tid])).rows[0]; const isNewUser = await isNewUserGracePeriod(req.userId); if(t?.lock_player_predictions && !isNewUser) return res.status(400).json({error:'Prédictions verrouillées par l\'admin'}); const finalStarted=(await pool.query("SELECT 1 FROM matches WHERE tournament_id=$1 AND bracket_round=2 AND status IN ('live','completed') LIMIT 1",[tid])).rows.length>0; if(finalStarted && !isNewUser) return res.status(400).json({error:'La finale a commencé, prédictions fermées'}); res.json((await pool.query('INSERT INTO player_predictions(user_id,tournament_id,best_player_id,best_goal_scorer_id) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,tournament_id) DO UPDATE SET best_player_id=COALESCE($3,player_predictions.best_player_id),best_goal_scorer_id=COALESCE($4,player_predictions.best_goal_scorer_id) RETURNING *',[req.userId,tid,best_player_id||null,best_goal_scorer_id||null])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});

app.post('/api/admin/tournaments/:id/set-player-winners', auth, adminAuth, async (req, res) => { try { const tid=parseInt(req.params.id); const bpId=req.body.best_player_id?parseInt(req.body.best_player_id):null; const gsId=req.body.best_goal_scorer_id?parseInt(req.body.best_goal_scorer_id):null; await pool.query('UPDATE tournaments SET best_player_id=$1,best_goal_scorer_id=$2 WHERE id=$3',[bpId,gsId,tid]); const rules=await getTournamentRules(tid); const bpPts=rules.best_player??7; const gsPts=rules.best_goal_scorer??7; let tot=0; if(bpId){const c=(await pool.query('SELECT user_id FROM player_predictions WHERE tournament_id=$1 AND best_player_id=$2',[tid,bpId])).rows; for(const u of c){await pool.query('UPDATE users SET total_points=COALESCE(total_points,0)+$1 WHERE id=$2',[bpPts,u.user_id]);tot++;}} if(gsId){const c=(await pool.query('SELECT user_id FROM player_predictions WHERE tournament_id=$1 AND best_goal_scorer_id=$2',[tid,gsId])).rows; for(const u of c){await pool.query('UPDATE users SET total_points=COALESCE(total_points,0)+$1 WHERE id=$2',[gsPts,u.user_id]);tot++;}} const all=(await pool.query('SELECT * FROM player_predictions WHERE tournament_id=$1',[tid])).rows; for(const pp of all){let p=0; if(bpId&&pp.best_player_id===bpId)p+=bpPts; if(gsId&&pp.best_goal_scorer_id===gsId)p+=gsPts; await pool.query('UPDATE player_predictions SET points_earned=$1 WHERE id=$2',[p,pp.id]);} res.json({message:`Gagnants définis ! ${tot} récompense(s)`}); } catch(e) { console.error(e.message); res.status(500).json({error:'Erreur: '+e.message}); }});

// Matches
app.get('/api/matches/visible', async (req, res) => { try { const c=cacheGet('matches_vis'); if(c) return res.json(c); const d=(await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id ORDER BY CASE WHEN m.status='live' THEN 0 WHEN m.status='upcoming' THEN 1 ELSE 2 END,match_date`)).rows; cacheSet('matches_vis',d,15000); res.json(d); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/matches/tournament/:id', async (req, res) => { try { res.json((await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id WHERE m.tournament_id=$1 ORDER BY CASE WHEN m.status='live' THEN 0 WHEN m.status='upcoming' THEN 1 ELSE 2 END,match_date`,[req.params.id])).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/matches/tournament/:id/visible', async (req, res) => { try { res.json((await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id WHERE m.tournament_id=$1 ORDER BY CASE WHEN m.status='live' THEN 0 WHEN m.status='upcoming' THEN 1 ELSE 2 END,match_date`,[req.params.id])).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/matches/:id', async (req, res) => { try { res.json((await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id WHERE m.id=$1`,[req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/matches', auth, adminAuth, async (req, res) => { try { res.json((await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id ORDER BY match_date`)).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/admin/matches/tournament/:id', auth, adminAuth, async (req, res) => { try { res.json((await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag FROM matches m LEFT JOIN teams t1 ON m.team1_id=t1.id LEFT JOIN teams t2 ON m.team2_id=t2.id WHERE m.tournament_id=$1 ORDER BY match_date`,[req.params.id])).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.post('/api/matches', auth, adminAuth, async (req, res) => { try { const {tournament_id,team1_id,team2_id,match_date,stage,bracket_round,bracket_position,next_match_id,next_match_slot}=req.body; res.json((await pool.query('INSERT INTO matches(tournament_id,team1_id,team2_id,match_date,stage,status,team1_score,team2_score,bracket_round,bracket_position,next_match_id,next_match_slot) VALUES($1,$2,$3,$4,$5,$6,0,0,$7,$8,$9,$10) RETURNING *',[tournament_id,team1_id||null,team2_id||null,match_date,stage,'upcoming',bracket_round||null,bracket_position||null,next_match_id||null,next_match_slot||null])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/matches/:id', auth, adminAuth, async (req, res) => { try { const {tournament_id,team1_id,team2_id,match_date,stage}=req.body; res.json((await pool.query('UPDATE matches SET tournament_id=$1,team1_id=$2,team2_id=$3,match_date=$4,stage=$5 WHERE id=$6 RETURNING *',[tournament_id,team1_id,team2_id,match_date,stage,req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.delete('/api/matches/:id', auth, adminAuth, async (req, res) => { try { await pool.query('DELETE FROM predictions WHERE match_id=$1',[req.params.id]); await pool.query('DELETE FROM matches WHERE id=$1',[req.params.id]); res.json({message:'OK'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/matches/:id/start', auth, adminAuth, async (req, res) => { try { res.json((await pool.query("UPDATE matches SET status='live',team1_score=COALESCE(team1_score,0),team2_score=COALESCE(team2_score,0) WHERE id=$1 RETURNING *",[req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/matches/:id/score', auth, adminAuth, async (req, res) => { try { const {team1_score,team2_score}=req.body; res.json((await pool.query("UPDATE matches SET team1_score=$1,team2_score=$2 WHERE id=$3 RETURNING *",[team1_score,team2_score,req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});

app.put('/api/matches/:id/complete', auth, adminAuth, async (req, res) => {
  try {
    const {team1_score,team2_score}=req.body;
    const match=(await pool.query('SELECT tournament_id,team1_id,team2_id,next_match_id,next_match_slot,bracket_round,stage FROM matches WHERE id=$1',[req.params.id])).rows[0];
    await pool.query("UPDATE matches SET team1_score=$1,team2_score=$2,status='completed' WHERE id=$3",[team1_score,team2_score,req.params.id]);
    const preds=(await pool.query('SELECT * FROM predictions WHERE match_id=$1',[req.params.id])).rows;
    const isFinal = match?.bracket_round===2 || (match?.stage && match.stage.toLowerCase().includes('finale') && !match.stage.toLowerCase().includes('demi'));
    for(const p of preds){
      let pts=await calcPoints(p,team1_score,team2_score,match?.tournament_id);
      // Bonus for exact final score
      if(isFinal && p.team1_score===team1_score && p.team2_score===team2_score){
        const rules=await getTournamentRules(match?.tournament_id);
        pts+=(rules.final_exact_score??15);
      }
      const oldPts = p.points_earned || 0;
      await pool.query('UPDATE predictions SET points_earned=$1 WHERE id=$2',[pts,p.id]);
      // Subtract old points and add new (safe for re-completion)
      const diff = pts - oldPts;
      if(diff !== 0) await pool.query('UPDATE users SET total_points=GREATEST(0,COALESCE(total_points,0)+$1) WHERE id=$2',[diff,p.user_id]);
    }
    if(match?.next_match_id && match.team1_id && match.team2_id && team1_score!==team2_score){const wId=team1_score>team2_score?match.team1_id:match.team2_id;const lId=team1_score>team2_score?match.team2_id:match.team1_id;const sl=match.next_match_slot===2?'team2_id':'team1_id';await pool.query(`UPDATE matches SET ${sl}=$1 WHERE id=$2`,[wId,match.next_match_id]);if(match.bracket_round===4){const third=(await pool.query('SELECT id FROM matches WHERE tournament_id=$1 AND bracket_round=3 LIMIT 1',[match.tournament_id])).rows[0];if(third){const tsl=match.bracket_position===1?'team1_id':'team2_id';await pool.query(`UPDATE matches SET ${tsl}=$1 WHERE id=$2`,[lId,third.id]);}}}
    // Decrement bans_remaining for suspended players whose team played this match
    if (match?.team1_id && match?.team2_id) {
      await decrementSuspensions(match.team1_id, match.tournament_id);
      await decrementSuspensions(match.team2_id, match.tournament_id);
    }
    res.json({message:'OK',predictions_processed:preds.length});
  } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }
});

app.put('/api/matches/:id/result', auth, adminAuth, async (req, res) => {
  try {
    const {team1_score,team2_score}=req.body;
    const match=(await pool.query('SELECT tournament_id,team1_id,team2_id,next_match_id,next_match_slot,bracket_round,bracket_position,stage FROM matches WHERE id=$1',[req.params.id])).rows[0];
    await pool.query("UPDATE matches SET team1_score=$1,team2_score=$2,status='completed' WHERE id=$3",[team1_score,team2_score,req.params.id]);
    const preds=(await pool.query('SELECT * FROM predictions WHERE match_id=$1',[req.params.id])).rows;
    const isFinal = match?.bracket_round===2 || (match?.stage && match.stage.toLowerCase().includes('finale') && !match.stage.toLowerCase().includes('demi'));
    for(const p of preds){
      let pts=await calcPoints(p,team1_score,team2_score,match?.tournament_id);
      if(isFinal && p.team1_score===team1_score && p.team2_score===team2_score){
        const rules=await getTournamentRules(match?.tournament_id);
        pts+=(rules.final_exact_score??15);
      }
      const oldPts = p.points_earned || 0;
      await pool.query('UPDATE predictions SET points_earned=$1 WHERE id=$2',[pts,p.id]);
      const diff = pts - oldPts;
      if(diff !== 0) await pool.query('UPDATE users SET total_points=GREATEST(0,COALESCE(total_points,0)+$1) WHERE id=$2',[diff,p.user_id]);
    }
    if(match?.next_match_id && match.team1_id && match.team2_id && team1_score!==team2_score){const wId=team1_score>team2_score?match.team1_id:match.team2_id;const lId=team1_score>team2_score?match.team2_id:match.team1_id;const sl=match.next_match_slot===2?'team2_id':'team1_id';await pool.query(`UPDATE matches SET ${sl}=$1 WHERE id=$2`,[wId,match.next_match_id]);if(match.bracket_round===4){const third=(await pool.query('SELECT id FROM matches WHERE tournament_id=$1 AND bracket_round=3 LIMIT 1',[match.tournament_id])).rows[0];if(third){const tsl=match.bracket_position===1?'team1_id':'team2_id';await pool.query(`UPDATE matches SET ${tsl}=$1 WHERE id=$2`,[lId,third.id]);}}}
    res.json({message:'OK'});
  } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }
});

// Bracket generation - supports any number of teams (3-32) with byes
app.post('/api/admin/tournaments/:id/generate-bracket', auth, adminAuth, async (req, res) => {
  try {
    const tid=req.params.id;
    const {team_ids, include_third_place}=req.body;
    if(!team_ids||team_ids.length<3) return res.status(400).json({error:'Minimum 3 équipes'});
    if(team_ids.length>32) return res.status(400).json({error:'Maximum 32 équipes'});
    const n=team_ids.length;
    // Round up to next power of 2
    let bracketSize=4; while(bracketSize<n) bracketSize*=2;
    const numByes=bracketSize-n;
    await pool.query('DELETE FROM predictions WHERE match_id IN (SELECT id FROM matches WHERE tournament_id=$1 AND bracket_round IS NOT NULL)',[tid]);
    await pool.query('DELETE FROM matches WHERE tournament_id=$1 AND bracket_round IS NOT NULL',[tid]);
    const stNames={32:'32èmes',16:'Huitièmes',8:'Quarts',4:'Demi-finales',2:'Finale',3:'3ème place'};
    const defaultDate=new Date();defaultDate.setDate(defaultDate.getDate()+7);
    const createdByRound={};
    // Create final
    const finalM=(await pool.query('INSERT INTO matches(tournament_id,match_date,stage,status,team1_score,team2_score,bracket_round,bracket_position) VALUES($1,$2,$3,$4,0,0,$5,$6) RETURNING id',[tid,defaultDate,stNames[2],'upcoming',2,1])).rows[0];
    createdByRound[2]=[finalM.id];
    // 3rd place
    let thirdId=null;
    if(include_third_place){
      const thirdM=(await pool.query('INSERT INTO matches(tournament_id,match_date,stage,status,team1_score,team2_score,bracket_round,bracket_position) VALUES($1,$2,$3,$4,0,0,$5,$6) RETURNING id',[tid,defaultDate,'3ème place','upcoming',3,1])).rows[0];
      thirdId=thirdM.id;createdByRound[3]=[thirdId];
    }
    // Create semi-finals
    if(bracketSize>=4){
      const sfIds=[];
      for(let p=1;p<=2;p++){
        const m=(await pool.query('INSERT INTO matches(tournament_id,match_date,stage,status,team1_score,team2_score,bracket_round,bracket_position,next_match_id,next_match_slot) VALUES($1,$2,$3,$4,0,0,$5,$6,$7,$8) RETURNING id',[tid,defaultDate,stNames[4],'upcoming',4,p,finalM.id,p])).rows[0];
        sfIds.push(m.id);
      }
      createdByRound[4]=sfIds;
    }
    // Create deeper rounds
    let prevRound=4;
    for(let round=8;round<=bracketSize;round*=2){
      const parentIds=createdByRound[prevRound];
      const roundIds=[];const matchCount=round/2;
      for(let p=1;p<=matchCount;p++){
        const parentIdx=Math.ceil(p/2)-1;const nextId=parentIds[parentIdx];const nextSlot=((p-1)%2)+1;
        const m=(await pool.query('INSERT INTO matches(tournament_id,match_date,stage,status,team1_score,team2_score,bracket_round,bracket_position,next_match_id,next_match_slot) VALUES($1,$2,$3,$4,0,0,$5,$6,$7,$8) RETURNING id',[tid,defaultDate,stNames[round]||('Tour '+round),'upcoming',round,p,nextId,nextSlot])).rows[0];
        roundIds.push(m.id);
      }
      createdByRound[round]=roundIds;prevRound=round;
    }
    // Place teams with byes - top seeds get byes
    // Seeding: 1v(last), 2v(last-1), etc. Byes go to top seeds
    const firstRound=bracketSize;const firstRoundIds=createdByRound[firstRound];
    // Build seed positions: classic bracket seeding
    const seeds=[];
    for(let i=0;i<bracketSize/2;i++){seeds.push([i*2, i*2+1]);}
    // Place teams - positions beyond n get null (bye)
    for(let i=0;i<team_ids.length;i++){
      const matchIdx=Math.floor(i/2);const slot=i%2===0?'team1_id':'team2_id';
      await pool.query(`UPDATE matches SET ${slot}=$1 WHERE id=$2`,[team_ids[i],firstRoundIds[matchIdx]]);
    }
    // Auto-advance byes: matches where one team is null auto-advance the other
    const firstRoundMatches=(await pool.query('SELECT id,team1_id,team2_id,next_match_id,next_match_slot FROM matches WHERE id=ANY($1)',[firstRoundIds])).rows;
    for(const m of firstRoundMatches){
      if(m.team1_id && !m.team2_id){
        // Team1 gets a bye - auto advance
        await pool.query("UPDATE matches SET status='completed',team1_score=0,team2_score=0 WHERE id=$1",[m.id]);
        if(m.next_match_id){const sl=m.next_match_slot===2?'team2_id':'team1_id';await pool.query(`UPDATE matches SET ${sl}=$1 WHERE id=$2`,[m.team1_id,m.next_match_id]);}
      } else if(!m.team1_id && !m.team2_id){
        // Empty match - just mark completed
        await pool.query("UPDATE matches SET status='completed' WHERE id=$1",[m.id]);
      }
    }
    const total=Object.values(createdByRound).reduce((s,r)=>s+r.length,0);
    res.json({message:`Bracket ${n} équipes créé (${numByes} bye${numByes>1?'s':''})`,rounds:createdByRound});
  } catch(e) { console.error(e); res.status(500).json({error:'Erreur: '+e.message}); }
});

app.get('/api/tournaments/:id/bracket', async (req, res) => {
  try {
    const matches=(await pool.query('SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag FROM matches m LEFT JOIN teams t1 ON m.team1_id=t1.id LEFT JOIN teams t2 ON m.team2_id=t2.id WHERE m.tournament_id=$1 AND m.bracket_round IS NOT NULL ORDER BY m.bracket_round DESC,m.bracket_position',[req.params.id])).rows;
    if(!matches.length) return res.json({rounds:{},matches:[]});
    const rounds={};
    matches.forEach(m=>{const key=m.bracket_round;if(!rounds[key]) rounds[key]=[];rounds[key].push(m);});
    res.json({rounds,matches});
  } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }
});

app.delete('/api/admin/tournaments/:id/bracket', auth, adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM predictions WHERE match_id IN (SELECT id FROM matches WHERE tournament_id=$1 AND bracket_round IS NOT NULL)',[req.params.id]);
    await pool.query('DELETE FROM matches WHERE tournament_id=$1 AND bracket_round IS NOT NULL',[req.params.id]);
    res.json({message:'Bracket supprimé'});
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

// Predictions
app.get('/api/predictions', auth, async (req, res) => { try { res.json((await pool.query(`SELECT p.*,m.match_date,m.team1_score as actual_team1_score,m.team2_score as actual_team2_score,m.status,m.tournament_id,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name FROM predictions p JOIN matches m ON p.match_id=m.id JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id WHERE p.user_id=$1 ORDER BY m.match_date DESC`,[req.userId])).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.post('/api/predictions', auth, async (req, res) => { try { const {match_id,team1_score,team2_score}=req.body; const m=(await pool.query('SELECT status,match_date,tournament_id,predictions_locked FROM matches WHERE id=$1',[match_id])).rows[0]; if(!m||m.status!=='upcoming') return res.status(400).json({error:'Pronostics fermés'});
    if(m.predictions_locked) return res.status(400).json({error:'Pronostics verrouillés pour ce match'});
    // Get cutoff minutes from settings (default 60)
    let cutoffMinutes = 60;
    try { const cutoffRow = (await pool.query("SELECT setting_value FROM site_settings WHERE setting_key='prediction_cutoff_minutes'")).rows[0]; if(cutoffRow) cutoffMinutes = parseInt(cutoffRow.setting_value) || 60; } catch(e) {}
    const cutoffTime = new Date(new Date(m.match_date).getTime() - cutoffMinutes * 60000);
    if(new Date() >= cutoffTime) return res.status(400).json({error:`Pronostics fermés (${cutoffMinutes} min avant le match)`});
    const t=(await pool.query('SELECT lock_match_predictions FROM tournaments WHERE id=$1',[m.tournament_id])).rows[0]; if(t?.lock_match_predictions) return res.status(400).json({error:'Pronostics verrouillés par l\'admin'}); res.json((await pool.query('INSERT INTO predictions(user_id,match_id,team1_score,team2_score) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,match_id) DO UPDATE SET team1_score=$3,team2_score=$4 RETURNING *',[req.userId,match_id,team1_score,team2_score])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});

app.get('/api/users/:id/predictions', async (req, res) => {
  try {
    const user=(await pool.query('SELECT id,name,total_points,avatar_url FROM users WHERE id=$1',[req.params.id])).rows[0];
    const predictions=(await pool.query(`SELECT p.*,m.match_date,m.team1_score as actual_team1_score,m.team2_score as actual_team2_score,m.status,m.tournament_id,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name FROM predictions p JOIN matches m ON p.match_id=m.id JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id WHERE p.user_id=$1 ORDER BY tour.name,m.match_date DESC`,[req.params.id])).rows;
    const winnerPred=(await pool.query('SELECT twp.*,t.name as team_name,t.flag_url,tour.name as tournament_name,twp.tournament_id FROM tournament_winner_predictions twp JOIN teams t ON twp.team_id=t.id JOIN tournaments tour ON twp.tournament_id=tour.id WHERE twp.user_id=$1',[req.params.id])).rows;
    const playerPred=(await pool.query(`SELECT pp.*,tour.name as tournament_name,pp.tournament_id,bp.name as best_player_name,bpt.name as best_player_team,gs.name as best_goal_scorer_name,gst.name as best_goal_scorer_team FROM player_predictions pp JOIN tournaments tour ON pp.tournament_id=tour.id LEFT JOIN tournament_players bp ON pp.best_player_id=bp.id LEFT JOIN teams bpt ON bp.team_id=bpt.id LEFT JOIN tournament_players gs ON pp.best_goal_scorer_id=gs.id LEFT JOIN teams gst ON gs.team_id=gst.id WHERE pp.user_id=$1`,[req.params.id])).rows;
    res.json({user,predictions,winnerPredictions:winnerPred,playerPredictions:playerPred});
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

// Tournament winner
app.get('/api/tournament-winner/:tournamentId', auth, async (req, res) => { try { res.json((await pool.query('SELECT twp.*,t.name as team_name,t.flag_url FROM tournament_winner_predictions twp JOIN teams t ON twp.team_id=t.id WHERE twp.user_id=$1 AND twp.tournament_id=$2',[req.userId,req.params.tournamentId])).rows[0]||null); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.post('/api/tournament-winner', auth, async (req, res) => { try { const {tournament_id,team_id}=req.body; const t=(await pool.query('SELECT lock_winner_prediction FROM tournaments WHERE id=$1',[tournament_id])).rows[0]; const isNewUser = await isNewUserGracePeriod(req.userId); if(t?.lock_winner_prediction && !isNewUser) return res.status(400).json({error:'Prédictions verrouillées par l\'admin'}); const finalMatch=(await pool.query("SELECT id,status FROM matches WHERE tournament_id=$1 AND bracket_round=2 AND status IN ('live','completed') LIMIT 1",[tournament_id])).rows[0]; if(finalMatch && !isNewUser) return res.status(400).json({error:'La finale a commencé, prédictions fermées'}); const existing=(await pool.query('SELECT id FROM tournament_winner_predictions WHERE user_id=$1 AND tournament_id=$2',[req.userId,tournament_id])).rows[0]; if(existing) return res.status(400).json({error:'Vous avez déjà confirmé votre prédiction. Impossible de la modifier.'}); res.json((await pool.query('INSERT INTO tournament_winner_predictions(user_id,tournament_id,team_id) VALUES($1,$2,$3) RETURNING *',[req.userId,tournament_id,team_id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});

app.get('/api/tournaments/:id/started', async (req, res) => { try { const tid=req.params.id; const t=(await pool.query('SELECT has_started,lock_match_predictions,lock_winner_prediction,lock_player_predictions,lock_finalist_prediction FROM tournaments WHERE id=$1',[tid])).rows[0]; const hasCompleted=(await pool.query('SELECT 1 FROM matches WHERE tournament_id=$1 AND status=$2 LIMIT 1',[tid,'completed'])).rows.length>0; const hasFinalStarted=(await pool.query("SELECT 1 FROM matches WHERE tournament_id=$1 AND bracket_round=2 AND status IN ('live','completed') LIMIT 1",[tid])).rows.length>0; res.json({started:t?.has_started||false,hasCompletedMatch:hasCompleted,hasFinalStarted,locks:{match:t?.lock_match_predictions||false,winner:t?.lock_winner_prediction||false,player:t?.lock_player_predictions||false,finalist:t?.lock_finalist_prediction||false}}); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// Admin toggle prediction locks
app.put('/api/admin/tournaments/:id/locks', auth, adminAuth, async (req, res) => { try { const {lock_match_predictions,lock_winner_prediction,lock_player_predictions,lock_finalist_prediction}=req.body; await pool.query('UPDATE tournaments SET lock_match_predictions=COALESCE($1,lock_match_predictions),lock_winner_prediction=COALESCE($2,lock_winner_prediction),lock_player_predictions=COALESCE($3,lock_player_predictions),lock_finalist_prediction=COALESCE($4,lock_finalist_prediction) WHERE id=$5',[lock_match_predictions,lock_winner_prediction,lock_player_predictions,lock_finalist_prediction,req.params.id]); cacheClear('tournaments'); res.json({message:'Verrous mis à jour'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// Group standings + knockout bracket for a tournament
app.get('/api/tournaments/:id/standings', async (req, res) => {
  try {
    const tid = req.params.id;
    const teams = (await pool.query(`SELECT tt.team_id, tt.group_name, tt.rank_override, t.name, t.flag_url
      FROM tournament_teams tt JOIN teams t ON tt.team_id=t.id WHERE tt.tournament_id=$1 ORDER BY tt.group_name,t.name`, [tid])).rows;
    const allMatches = (await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag FROM matches m LEFT JOIN teams t1 ON m.team1_id=t1.id LEFT JOIN teams t2 ON m.team2_id=t2.id WHERE m.tournament_id=$1 ORDER BY m.match_date`, [tid])).rows;

    // --- GROUP STANDINGS ---
    const stats = {};
    teams.forEach(t => {
      stats[t.team_id] = { team_id: t.team_id, name: t.name, flag_url: t.flag_url, group_name: t.group_name,
        rank_override: t.rank_override,
        played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, deduction: 0 };
    });

    allMatches.filter(m => m.status === 'completed').forEach(m => {
      const t1 = stats[m.team1_id], t2 = stats[m.team2_id];
      if (!t1 || !t2) return;
      if (t1.group_name && t2.group_name && t1.group_name === t2.group_name) {
        t1.played++; t2.played++;
        t1.gf += m.team1_score; t1.ga += m.team2_score;
        t2.gf += m.team2_score; t2.ga += m.team1_score;
        if (m.team1_score > m.team2_score) { t1.won++; t1.points += 3; t2.lost++; }
        else if (m.team1_score < m.team2_score) { t2.won++; t2.points += 3; t1.lost++; }
        else { t1.drawn++; t2.drawn++; t1.points += 1; t2.points += 1; }
      }
    });

    // Apply team sanctions (point deductions)
    let teamSanctions = [];
    try {
      teamSanctions = (await pool.query(
        'SELECT team_id, SUM(points_deducted) as total_deducted FROM team_sanctions WHERE tournament_id=$1 GROUP BY team_id',
        [tid]
      )).rows;
    } catch(e) { /* table may not exist yet */ }
    teamSanctions.forEach(s => {
      if (stats[s.team_id]) {
        const ded = parseInt(s.total_deducted) || 0;
        stats[s.team_id].points -= ded;
        stats[s.team_id].deduction = ded;
      }
    });

    Object.values(stats).forEach(s => { s.gd = s.gf - s.ga; });

    const groups = {};
    Object.values(stats).forEach(s => {
      const g = s.group_name || 'Sans groupe';
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    });
    Object.values(groups).forEach(arr => {
      const completedGroupMatches = allMatches.filter(m => m.status === 'completed');
      // If any team in this group has a rank_override, use admin ordering
      const hasOverrides = arr.some(t => t.rank_override !== null && t.rank_override !== undefined);
      if (hasOverrides) {
        arr.sort((a, b) => {
          const ra = a.rank_override ?? 9999;
          const rb = b.rank_override ?? 9999;
          if (ra !== rb) return ra - rb;
          // Fallback to standard for teams without override
          if (b.points !== a.points) return b.points - a.points;
          if (b.gd !== a.gd) return b.gd - a.gd;
          if (b.gf !== a.gf) return b.gf - a.gf;
          return a.name.localeCompare(b.name);
        });
      } else {
      // Sort with proper tiebreakers: points → direct matchups → goal difference → goals for
      arr.sort((a, b) => {
        // 1. Points
        if (b.points !== a.points) return b.points - a.points;
        // 2. Direct matchups (head-to-head between tied teams)
        const directMatch = completedGroupMatches.find(m =>
          (m.team1_id === a.team_id && m.team2_id === b.team_id) ||
          (m.team1_id === b.team_id && m.team2_id === a.team_id)
        );
        if (directMatch) {
          const aIsTeam1 = directMatch.team1_id === a.team_id;
          const aGoals = aIsTeam1 ? directMatch.team1_score : directMatch.team2_score;
          const bGoals = aIsTeam1 ? directMatch.team2_score : directMatch.team1_score;
          if (aGoals !== bGoals) return bGoals < aGoals ? -1 : 1; // winner of direct match ranks higher
        }
        // 3. Goal difference
        if (b.gd !== a.gd) return b.gd - a.gd;
        // 4. Strongest attack (most goals for)
        if (b.gf !== a.gf) return b.gf - a.gf;
        // 5. Name
        return a.name.localeCompare(b.name);
      });
      }
    });

    // Get per-group qualification counts (admin-configurable)
    let qualifications = {};
    try {
      const qRows = (await pool.query('SELECT group_name, qualify_count FROM group_qualifications WHERE tournament_id=$1', [tid])).rows;
      qRows.forEach(q => { qualifications[q.group_name] = parseInt(q.qualify_count); });
    } catch(e) {}

    // --- KNOCKOUT BRACKET ---
    const knockoutStages = ['Huitièmes', 'Quarts', 'Demi-finales', '3ème place', 'Finale'];
    const knockout = {};
    allMatches.forEach(m => {
      const stage = m.stage || '';
      if (knockoutStages.some(ks => stage.toLowerCase().includes(ks.toLowerCase()) || ks.toLowerCase().includes(stage.toLowerCase()))) {
        // Normalize stage name
        const normalizedStage = knockoutStages.find(ks => stage.toLowerCase().includes(ks.toLowerCase()) || ks.toLowerCase().includes(stage.toLowerCase())) || stage;
        if (!knockout[normalizedStage]) knockout[normalizedStage] = [];
        knockout[normalizedStage].push({
          id: m.id, team1_id: m.team1_id, team2_id: m.team2_id,
          team1_name: m.team1_name, team2_name: m.team2_name,
          team1_flag: m.team1_flag, team2_flag: m.team2_flag,
          team1_score: m.team1_score, team2_score: m.team2_score,
          status: m.status, stage: normalizedStage, match_date: m.match_date
        });
      }
    });
    // Sort knockout by stage order
    const sortedKnockout = {};
    knockoutStages.forEach(s => { if (knockout[s]) sortedKnockout[s] = knockout[s]; });

    res.json({ groups, knockout: sortedKnockout, qualifications });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur' }); }
});

// Leaderboard - computed from predictions
app.get('/api/leaderboard', async (req, res) => { try { const c=cacheGet('lb'); if(c) return res.json(c); const d=(await pool.query(`SELECT u.id,u.name,u.avatar_url,COALESCE((SELECT SUM(p.points_earned) FROM predictions p JOIN matches m ON p.match_id=m.id WHERE p.user_id=u.id AND m.status='completed'),0)+COALESCE((SELECT SUM(twp.points_earned) FROM tournament_winner_predictions twp WHERE twp.user_id=u.id),0)+COALESCE((SELECT SUM(pp.points_earned) FROM player_predictions pp WHERE pp.user_id=u.id),0)+COALESCE((SELECT SUM(pa.points) FROM point_adjustments pa WHERE pa.user_id=u.id),0) AS total_points,(SELECT COUNT(*) FROM predictions WHERE user_id=u.id) as total_predictions,(SELECT COUNT(*) FROM predictions p3 JOIN matches m3 ON p3.match_id=m3.id WHERE p3.user_id=u.id AND m3.status='completed') as completed_predictions,(SELECT COUNT(*) FROM predictions p4 JOIN matches m4 ON p4.match_id=m4.id WHERE p4.user_id=u.id AND m4.status='completed' AND p4.points_earned>0) as correct_predictions,(SELECT COUNT(*) FROM predictions p5 JOIN matches m5 ON p5.match_id=m5.id WHERE p5.user_id=u.id AND m5.status='completed' AND p5.team1_score=m5.team1_score AND p5.team2_score=m5.team2_score) as exact_predictions FROM users u ORDER BY total_points DESC,u.name`)).rows; cacheSet('lb',d,30000); res.json(d); } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }});

// Per-tournament leaderboard with full stats
app.get('/api/leaderboard/tournament/:id', async (req, res) => { try { const tid=req.params.id; res.json((await pool.query(`SELECT * FROM (SELECT u.id,u.name,COALESCE((SELECT SUM(p.points_earned) FROM predictions p JOIN matches m ON p.match_id=m.id WHERE p.user_id=u.id AND m.tournament_id=$1 AND m.status='completed'),0)+COALESCE((SELECT SUM(twp.points_earned) FROM tournament_winner_predictions twp WHERE twp.user_id=u.id AND twp.tournament_id=$1),0)+COALESCE((SELECT SUM(pp.points_earned) FROM player_predictions pp WHERE pp.user_id=u.id AND pp.tournament_id=$1),0)+COALESCE((SELECT SUM(pa.points) FROM point_adjustments pa WHERE pa.user_id=u.id AND pa.tournament_id=$1),0) AS total_points,(SELECT COUNT(*) FROM predictions p2 JOIN matches m2 ON p2.match_id=m2.id WHERE p2.user_id=u.id AND m2.tournament_id=$1) as total_predictions,(SELECT COUNT(*) FROM predictions p3 JOIN matches m3 ON p3.match_id=m3.id WHERE p3.user_id=u.id AND m3.tournament_id=$1 AND m3.status='completed') as completed_predictions,(SELECT COUNT(*) FROM predictions p4 JOIN matches m4 ON p4.match_id=m4.id WHERE p4.user_id=u.id AND m4.tournament_id=$1 AND m4.status='completed' AND p4.points_earned>0) as correct_predictions,(SELECT COUNT(*) FROM predictions p5 JOIN matches m5 ON p5.match_id=m5.id WHERE p5.user_id=u.id AND m5.tournament_id=$1 AND m5.status='completed' AND p5.team1_score=m5.team1_score AND p5.team2_score=m5.team2_score) as exact_predictions FROM users u) sub WHERE sub.total_points>0 OR sub.total_predictions>0 ORDER BY sub.total_points DESC,sub.name`,[tid])).rows); } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }});

// Daily correct predictions - users who got it right today
app.get('/api/daily-winners', async (req, res) => {
  try {
    const dateParam = req.query.date || new Date().toISOString().split('T')[0];
    const matches = (await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name
      FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id
      WHERE m.status='completed' AND m.match_date::date=$1::date ORDER BY m.match_date`, [dateParam])).rows;
    const matchIds = matches.map(m => m.id);
    let winners = [];
    if (matchIds.length > 0) {
      winners = (await pool.query(`SELECT p.*,u.name as user_name,u.avatar_url,m.team1_score as actual_team1_score,m.team2_score as actual_team2_score,
        m.match_date,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name,
        CASE WHEN p.team1_score=m.team1_score AND p.team2_score=m.team2_score THEN 'exact'
             WHEN (p.team1_score>p.team2_score AND m.team1_score>m.team2_score) OR (p.team1_score<p.team2_score AND m.team1_score<m.team2_score) OR (p.team1_score=p.team2_score AND m.team1_score=m.team2_score) THEN 'correct'
             ELSE 'partial' END as prediction_type
        FROM predictions p JOIN users u ON p.user_id=u.id JOIN matches m ON p.match_id=m.id
        JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id
        WHERE p.match_id=ANY($1) AND p.points_earned>0
        ORDER BY p.points_earned DESC,u.name`, [matchIds])).rows;
    }
    const userMap = {};
    winners.forEach(w => {
      if (!userMap[w.user_id]) userMap[w.user_id] = { user_id: w.user_id, user_name: w.user_name, avatar_url: w.avatar_url, total_points: 0, exact_count: 0, correct_count: 0, predictions: [] };
      userMap[w.user_id].total_points += w.points_earned || 0;
      if (w.prediction_type === 'exact') userMap[w.user_id].exact_count++;
      else userMap[w.user_id].correct_count++;
      userMap[w.user_id].predictions.push(w);
    });
    const userSummary = Object.values(userMap).sort((a, b) => b.total_points - a.total_points || b.exact_count - a.exact_count);
    res.json({ date: dateParam, matches, winners: userSummary, total_matches: matches.length });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur' }); }
});

// Admin
app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  try {
    const d = (await pool.query(`
      SELECT u.id, u.name, u.phone, u.is_admin, u.is_employee, u.created_at, u.avatar_url,
        COALESCE((SELECT SUM(p.points_earned) FROM predictions p JOIN matches m ON p.match_id=m.id WHERE p.user_id=u.id AND m.status='completed'),0)
        + COALESCE((SELECT SUM(twp.points_earned) FROM tournament_winner_predictions twp WHERE twp.user_id=u.id),0)
        + COALESCE((SELECT SUM(pp.points_earned) FROM player_predictions pp WHERE pp.user_id=u.id),0)
        + COALESCE((SELECT SUM(pa.points) FROM point_adjustments pa WHERE pa.user_id=u.id),0)
        AS total_points,
        (SELECT COUNT(*) FROM predictions WHERE user_id=u.id) as total_predictions
      FROM users u ORDER BY total_points DESC NULLS LAST, u.name
    `)).rows;
    res.json(d);
  } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }
});
app.put('/api/admin/users/:id', auth, adminAuth, strictAdmin, async (req, res) => { try { const {is_admin,is_employee,total_points}=req.body; res.json((await pool.query('UPDATE users SET is_admin=COALESCE($1,is_admin),is_employee=COALESCE($2,is_employee),total_points=COALESCE($3,total_points) WHERE id=$4 RETURNING *',[is_admin,is_employee,total_points,req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.delete('/api/admin/users/:id', auth, adminAuth, strictAdmin, async (req, res) => { try { await pool.query('DELETE FROM users WHERE id=$1',[req.params.id]); res.json({message:'OK'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// === PLAYER SANCTIONS MANAGEMENT ===
// Get all sanctions (with player, team, tournament info)
app.get('/api/admin/sanctions', auth, adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, tp.name as player_name, tp.photo_url as player_photo,
        t.name as team_name, t.flag_url as team_flag,
        tour.name as tournament_name, tour.id as tournament_id,
        m.match_date, m.stage as match_stage,
        mt1.name as match_team1_name, mt2.name as match_team2_name,
        c.name as created_by_name
      FROM sanctions s
      JOIN tournament_players tp ON s.player_id = tp.id
      LEFT JOIN teams t ON tp.team_id = t.id
      LEFT JOIN tournaments tour ON s.tournament_id = tour.id
      LEFT JOIN matches m ON s.match_id = m.id
      LEFT JOIN teams mt1 ON m.team1_id = mt1.id
      LEFT JOIN teams mt2 ON m.team2_id = mt2.id
      LEFT JOIN users c ON s.created_by = c.id
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch(e) { console.log('Sanctions query error:', e.message); res.json([]); }
});

// Get sanctions for a specific player
app.get('/api/players/:id/sanctions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, m.match_date, m.stage as match_stage,
        mt1.name as match_team1_name, mt2.name as match_team2_name,
        c.name as created_by_name
      FROM sanctions s
      LEFT JOIN matches m ON s.match_id = m.id
      LEFT JOIN teams mt1 ON m.team1_id = mt1.id
      LEFT JOIN teams mt2 ON m.team2_id = mt2.id
      LEFT JOIN users c ON s.created_by = c.id
      WHERE s.player_id = $1
      ORDER BY s.created_at DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch(e) { res.json([]); }
});

// Get sanctions for a tournament
app.get('/api/admin/sanctions/tournament/:tournamentId', auth, adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, tp.name as player_name, tp.photo_url as player_photo,
        t.name as team_name, t.flag_url as team_flag,
        m.match_date, m.stage as match_stage,
        mt1.name as match_team1_name, mt2.name as match_team2_name,
        c.name as created_by_name
      FROM sanctions s
      JOIN tournament_players tp ON s.player_id = tp.id
      LEFT JOIN teams t ON tp.team_id = t.id
      LEFT JOIN matches m ON s.match_id = m.id
      LEFT JOIN teams mt1 ON m.team1_id = mt1.id
      LEFT JOIN teams mt2 ON m.team2_id = mt2.id
      LEFT JOIN users c ON s.created_by = c.id
      WHERE s.tournament_id = $1
      ORDER BY s.created_at DESC
    `, [req.params.tournamentId]);
    res.json(result.rows);
  } catch(e) { res.json([]); }
});

// Create a player sanction
app.post('/api/admin/sanctions', auth, adminAuth, async (req, res) => {
  try {
    const { player_id, tournament_id, match_id, type, reason, match_ban_count, minute } = req.body;
    if (!player_id || !type) return res.status(400).json({error:'Joueur et type requis'});
    
    const sanction = (await pool.query(
      'INSERT INTO sanctions(player_id, tournament_id, match_id, type, reason, match_ban_count, bans_remaining, minute, created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [player_id, tournament_id || null, match_id || null, type, reason || null, match_ban_count || 0, match_ban_count || 0, minute || null, req.userId]
    )).rows[0];
    
    // Get player info for response
    const player = (await pool.query(`
      SELECT tp.name as player_name, t.name as team_name, t.flag_url as team_flag, tour.name as tournament_name
      FROM tournament_players tp LEFT JOIN teams t ON tp.team_id=t.id LEFT JOIN tournaments tour ON tp.tournament_id=tour.id
      WHERE tp.id=$1
    `, [player_id])).rows[0];
    
    res.json({ ...sanction, ...player });
  } catch(e) { console.error(e); res.status(500).json({error:'Erreur: ' + e.message}); }
});

// Revoke a sanction
app.put('/api/admin/sanctions/:id/revoke', auth, adminAuth, async (req, res) => {
  try {
    const sanction = (await pool.query('SELECT * FROM sanctions WHERE id=$1', [req.params.id])).rows[0];
    if (!sanction) return res.status(404).json({error:'Sanction non trouvée'});
    await pool.query('UPDATE sanctions SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({message:'Sanction révoquée'});
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

// Delete a sanction record
app.delete('/api/admin/sanctions/:id', auth, adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM sanctions WHERE id=$1', [req.params.id]);
    res.json({message:'OK'});
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

// === TEAM SANCTIONS (point deductions from group standings) ===
// Get all team sanctions for a tournament
app.get('/api/admin/team-sanctions/tournament/:tournamentId', auth, adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ts.*, t.name as team_name, t.flag_url as team_flag, tour.name as tournament_name, c.name as created_by_name
      FROM team_sanctions ts
      JOIN teams t ON ts.team_id = t.id
      JOIN tournaments tour ON ts.tournament_id = tour.id
      LEFT JOIN users c ON ts.created_by = c.id
      WHERE ts.tournament_id = $1
      ORDER BY ts.created_at DESC
    `, [req.params.tournamentId]);
    res.json(result.rows);
  } catch(e) { res.json([]); }
});

// Get all team sanctions across all tournaments
app.get('/api/admin/team-sanctions', auth, adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ts.*, t.name as team_name, t.flag_url as team_flag, tour.name as tournament_name, c.name as created_by_name
      FROM team_sanctions ts
      JOIN teams t ON ts.team_id = t.id
      JOIN tournaments tour ON ts.tournament_id = tour.id
      LEFT JOIN users c ON ts.created_by = c.id
      ORDER BY ts.created_at DESC
    `);
    res.json(result.rows);
  } catch(e) { res.json([]); }
});

// Create a team sanction
app.post('/api/admin/team-sanctions', auth, adminAuth, async (req, res) => {
  try {
    const { team_id, tournament_id, points_deducted, reason } = req.body;
    if (!team_id || !tournament_id || !points_deducted) return res.status(400).json({error:'Équipe, tournoi et points requis'});
    const sanction = (await pool.query(
      'INSERT INTO team_sanctions(team_id, tournament_id, points_deducted, reason, created_by) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [team_id, tournament_id, parseInt(points_deducted), reason || null, req.userId]
    )).rows[0];
    const team = (await pool.query('SELECT name FROM teams WHERE id=$1', [team_id])).rows[0];
    cacheClear();
    res.json({ ...sanction, team_name: team?.name });
  } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }
});

// Delete a team sanction
app.delete('/api/admin/team-sanctions/:id', auth, adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM team_sanctions WHERE id=$1', [req.params.id]);
    cacheClear();
    res.json({message:'OK'});
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

// === GROUP QUALIFICATIONS ===
// Get qualification counts for a tournament
app.get('/api/tournaments/:id/qualifications', async (req, res) => {
  try {
    const result = await pool.query('SELECT group_name, qualify_count FROM group_qualifications WHERE tournament_id=$1', [req.params.id]);
    const obj = {};
    result.rows.forEach(r => { obj[r.group_name] = r.qualify_count; });
    res.json(obj);
  } catch(e) { res.json({}); }
});

// Set qualification count for a group
app.put('/api/admin/tournaments/:id/qualifications', auth, adminAuth, async (req, res) => {
  try {
    const tid = req.params.id;
    const { qualifications } = req.body; // { "A": 2, "B": 3, "C": 2 }
    for (const [groupName, count] of Object.entries(qualifications || {})) {
      await pool.query(
        'INSERT INTO group_qualifications(tournament_id, group_name, qualify_count) VALUES($1,$2,$3) ON CONFLICT(tournament_id, group_name) DO UPDATE SET qualify_count=$3',
        [tid, groupName, parseInt(count) || 2]
      );
    }
    cacheClear();
    res.json({message:'OK'});
  } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }
});


// Admin: Save manual ranking override for teams in a tournament group
// Body: { overrides: [ { team_id, rank_override } ] }
app.put('/api/admin/tournaments/:id/ranking-override', auth, adminAuth, async (req, res) => {
  try {
    const tid = req.params.id;
    const { overrides } = req.body; // array of { team_id, rank_override }
    if (!Array.isArray(overrides)) return res.status(400).json({ error: 'overrides must be an array' });
    for (const { team_id, rank_override } of overrides) {
      await pool.query(
        'UPDATE tournament_teams SET rank_override = $1 WHERE tournament_id = $2 AND team_id = $3',
        [rank_override === null ? null : parseInt(rank_override), tid, team_id]
      );
    }
    cacheClear();
    res.json({ message: 'OK' });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur' }); }
});

// Admin: Set or clear the admin note on a match (sanction warning for upcoming match)
// Body: { note: "string or empty to clear" }
app.put('/api/admin/matches/:id/note', auth, adminAuth, async (req, res) => {
  try {
    const { note } = req.body;
    await pool.query('UPDATE matches SET admin_note = $1 WHERE id = $2', [note || null, req.params.id]);
    res.json({ message: 'OK' });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/admin/scoring-rules', auth, adminAuth, async (req, res) => { try { res.json((await pool.query('SELECT * FROM scoring_rules')).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// Admin dashboard stats - per tournament
app.get('/api/admin/stats', auth, adminAuth, async (req, res) => {
  try {
    const tid = req.query.tournament_id;
    let matchFilter = '', predJoin = '';
    const params = [];
    if (tid && tid !== 'all') {
      matchFilter = ' AND m.tournament_id=$1';
      params.push(tid);
    }
    const totalUsers = (await pool.query('SELECT COUNT(*) as c FROM users')).rows[0]?.c || 0;
    const totalMatches = (await pool.query(`SELECT COUNT(*) as c FROM matches m WHERE 1=1${matchFilter}`, params)).rows[0]?.c || 0;
    const completedMatches = (await pool.query(`SELECT COUNT(*) as c FROM matches m WHERE m.status='completed'${matchFilter}`, params)).rows[0]?.c || 0;
    const totalPredictions = (await pool.query(`SELECT COUNT(*) as c FROM predictions p JOIN matches m ON p.match_id=m.id WHERE 1=1${matchFilter}`, params)).rows[0]?.c || 0;
    const totalTeams = tid && tid !== 'all'
      ? (await pool.query('SELECT COUNT(*) as c FROM tournament_teams WHERE tournament_id=$1', [tid])).rows[0]?.c || 0
      : (await pool.query('SELECT COUNT(*) as c FROM teams')).rows[0]?.c || 0;
    res.json({ users: parseInt(totalUsers), matches: parseInt(totalMatches), completed_matches: parseInt(completedMatches), predictions: parseInt(totalPredictions), teams: parseInt(totalTeams) });
  } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }
});

// Public statistics per tournament
// Public sanctions list for a tournament (for stats page detail view)
app.get('/api/sanctions/tournament/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.type, s.reason, s.minute, s.match_ban_count, s.is_active, s.created_at,
        tp.name as player_name, tp.photo_url as player_photo,
        t.name as team_name, t.flag_url as team_flag,
        m.id as match_id, t1.name as match_team1, t2.name as match_team2
      FROM sanctions s
      JOIN tournament_players tp ON s.player_id = tp.id
      LEFT JOIN teams t ON tp.team_id = t.id
      LEFT JOIN matches m ON s.match_id = m.id
      LEFT JOIN teams t1 ON m.team1_id = t1.id
      LEFT JOIN teams t2 ON m.team2_id = t2.id
      WHERE s.tournament_id = $1 AND s.is_active = true
      ORDER BY s.created_at DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch(e) { res.json([]); }
});

app.get('/api/stats/tournament/:id', async (req, res) => {
  try {
    const tid = req.params.id;
    const totalMatches = parseInt((await pool.query("SELECT COUNT(*) as c FROM matches WHERE tournament_id=$1", [tid])).rows[0]?.c) || 0;
    const completedMatches = parseInt((await pool.query("SELECT COUNT(*) as c FROM matches WHERE tournament_id=$1 AND status='completed'", [tid])).rows[0]?.c) || 0;
    const totalPredictions = parseInt((await pool.query("SELECT COUNT(*) as c FROM predictions p JOIN matches m ON p.match_id=m.id WHERE m.tournament_id=$1", [tid])).rows[0]?.c) || 0;
    const totalGoals = parseInt((await pool.query("SELECT COALESCE(SUM(team1_score+team2_score),0) as c FROM matches WHERE tournament_id=$1 AND status='completed'", [tid])).rows[0]?.c) || 0;
    const totalShots = parseInt((await pool.query("SELECT COALESCE(SUM(COALESCE(team1_shots,0)+COALESCE(team2_shots,0)),0) as c FROM matches WHERE tournament_id=$1 AND status='completed'", [tid])).rows[0]?.c) || 0;
    const totalTeams = parseInt((await pool.query("SELECT COUNT(*) as c FROM tournament_teams WHERE tournament_id=$1", [tid])).rows[0]?.c) || 0;
    const totalPlayers = parseInt((await pool.query("SELECT COUNT(*) as c FROM tournament_players WHERE tournament_id=$1", [tid])).rows[0]?.c) || 0;
    const totalUsers = parseInt((await pool.query("SELECT COUNT(DISTINCT p.user_id) as c FROM predictions p JOIN matches m ON p.match_id=m.id WHERE m.tournament_id=$1", [tid])).rows[0]?.c) || 0;
    
    // Sanctions split by type
    let yellowCards = 0, redCards = 0, totalSanctions = 0;
    try {
      yellowCards = parseInt((await pool.query("SELECT COUNT(*) as c FROM sanctions WHERE tournament_id=$1 AND is_active=true AND type='yellow_card'", [tid])).rows[0]?.c) || 0;
      redCards = parseInt((await pool.query("SELECT COUNT(*) as c FROM sanctions WHERE tournament_id=$1 AND is_active=true AND (type='red_card' OR type='second_yellow')", [tid])).rows[0]?.c) || 0;
      totalSanctions = parseInt((await pool.query("SELECT COUNT(*) as c FROM sanctions WHERE tournament_id=$1 AND is_active=true", [tid])).rows[0]?.c) || 0;
    } catch(e) {}

    const topScorers = (await pool.query("SELECT tp.name, tp.goals, t.name as team_name, t.flag_url FROM tournament_players tp LEFT JOIN teams t ON tp.team_id=t.id WHERE tp.tournament_id=$1 AND tp.goals>0 ORDER BY tp.goals DESC LIMIT 5", [tid])).rows;
    
    // Team stats: attack, defense, clean sheets, fair play
    const teamGoals = (await pool.query(`
      SELECT t.id, t.name, t.flag_url, 
        COALESCE(SUM(CASE WHEN m.team1_id=t.id THEN m.team1_score WHEN m.team2_id=t.id THEN m.team2_score ELSE 0 END),0) as goals_for,
        COALESCE(SUM(CASE WHEN m.team1_id=t.id THEN m.team2_score WHEN m.team2_id=t.id THEN m.team1_score ELSE 0 END),0) as goals_against,
        COUNT(m.id) as matches_played,
        COALESCE(SUM(CASE WHEN (m.team1_id=t.id AND m.team2_score=0) OR (m.team2_id=t.id AND m.team1_score=0) THEN 1 ELSE 0 END),0) as clean_sheets
      FROM tournament_teams tt JOIN teams t ON tt.team_id=t.id
      LEFT JOIN matches m ON m.tournament_id=$1 AND m.status='completed' AND (m.team1_id=t.id OR m.team2_id=t.id)
      WHERE tt.tournament_id=$1 GROUP BY t.id,t.name,t.flag_url
      ORDER BY goals_for DESC
    `, [tid])).rows;
    
    const bestAttack = teamGoals.slice(0, 3);
    const bestDefense = [...teamGoals].sort((a, b) => parseInt(a.goals_against) - parseInt(b.goals_against)).slice(0, 3);
    const bestCleanSheets = [...teamGoals].sort((a, b) => parseInt(b.clean_sheets) - parseInt(a.clean_sheets)).filter(t => parseInt(t.clean_sheets) > 0).slice(0, 3);
    
    // Fair play: fewest sanctions per team
    let fairPlay = [];
    try {
      fairPlay = (await pool.query(`
        SELECT t.id, t.name, t.flag_url,
          COALESCE(COUNT(s.id),0) as total_sanctions,
          COALESCE(SUM(CASE WHEN s.type='yellow_card' THEN 1 ELSE 0 END),0) as yellows,
          COALESCE(SUM(CASE WHEN s.type IN ('red_card','second_yellow') THEN 1 ELSE 0 END),0) as reds
        FROM tournament_teams tt JOIN teams t ON tt.team_id=t.id
        LEFT JOIN tournament_players tp ON tp.tournament_id=$1 AND tp.team_id=t.id
        LEFT JOIN sanctions s ON s.tournament_id=$1 AND s.player_id=tp.id AND s.is_active=true
        WHERE tt.tournament_id=$1
        GROUP BY t.id,t.name,t.flag_url
        ORDER BY total_sanctions ASC, reds ASC, yellows ASC
        LIMIT 3
      `, [tid])).rows;
    } catch(e) {}

    const avgGoalsPerMatch = completedMatches > 0 ? (totalGoals / completedMatches).toFixed(1) : 0;
    res.json({ totalMatches, completedMatches, totalPredictions, totalGoals, totalShots, totalTeams, totalPlayers, totalUsers, totalSanctions, yellowCards, redCards, avgGoalsPerMatch, topScorers, bestAttack, bestDefense, bestCleanSheets, fairPlay });
  } catch(e) { console.error(e); res.json({}); }
});

// Save global scoring rules + auto-recalculate ALL tournaments
app.put('/api/admin/scoring-rules', auth, adminAuth, strictAdmin, async (req, res) => {
  try {
    for(const [k,v] of Object.entries(req.body)) await pool.query('UPDATE scoring_rules SET points=$1 WHERE rule_type=$2',[v,k]);
    // Auto-recalculate all tournaments that use global rules (no tournament-specific overrides)
    const allTournaments = (await pool.query('SELECT id FROM tournaments')).rows;
    let totalUpdated = 0;
    for (const tour of allTournaments) {
      const hasOverrides = (await pool.query('SELECT COUNT(*) as c FROM tournament_scoring_rules WHERE tournament_id=$1', [tour.id])).rows[0]?.c > 0;
      // Recalc tournaments that either have no overrides, or recalc all to be safe
      const matches = (await pool.query("SELECT * FROM matches WHERE tournament_id=$1 AND status='completed'", [tour.id])).rows;
      const userPointsMap = {};
      for (const m of matches) {
        const preds = (await pool.query('SELECT * FROM predictions WHERE match_id=$1', [m.id])).rows;
        for (const p of preds) {
          const oldPts = p.points_earned || 0;
          const newPts = await calcPoints(p, m.team1_score, m.team2_score, tour.id);
          if (oldPts !== newPts) {
            await pool.query('UPDATE predictions SET points_earned=$1 WHERE id=$2', [newPts, p.id]);
            if (!userPointsMap[p.user_id]) userPointsMap[p.user_id] = 0;
            userPointsMap[p.user_id] += (newPts - oldPts);
            totalUpdated++;
          }
        }
      }
      for (const [uid, diff] of Object.entries(userPointsMap)) {
        await pool.query('UPDATE users SET total_points=GREATEST(0,COALESCE(total_points,0)+$1) WHERE id=$2', [diff, uid]);
      }
    }
    cacheClear('lb');
    res.json({message:`Règles sauvegardées. ${totalUpdated} pronostics recalculés.`, recalculated: totalUpdated});
  } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }
});

// Admin: per-tournament point adjustment
app.post('/api/admin/users/:id/adjust-points', auth, adminAuth, strictAdmin, async (req, res) => {
  try {
    const { points, reason, tournament_id } = req.body;
    const amount = parseInt(points);
    if (!amount || amount === 0) return res.status(400).json({error:'Montant invalide'});
    if (!tournament_id) return res.status(400).json({error:'Tournoi requis'});
    await pool.query(
      'INSERT INTO point_adjustments(user_id, tournament_id, points, reason, created_by) VALUES($1,$2,$3,$4,$5)',
      [req.params.id, tournament_id, amount, reason || null, req.userId]
    );
    cacheClear('lb');
    const user = (await pool.query('SELECT name FROM users WHERE id=$1', [req.params.id])).rows[0];
    res.json({message:`${amount > 0 ? '+' : ''}${amount} points pour ${user?.name || 'Utilisateur'}`});
  } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }
});

// Get per-tournament breakdown for a user
app.get('/api/admin/users/:id/tournament-points', auth, adminAuth, async (req, res) => {
  try {
    const uid = req.params.id;
    const tournaments = (await pool.query('SELECT id, name FROM tournaments ORDER BY start_date DESC')).rows;
    const result = [];
    for (const t of tournaments) {
      const predPts = (await pool.query("SELECT COALESCE(SUM(p.points_earned),0) as pts FROM predictions p JOIN matches m ON p.match_id=m.id WHERE p.user_id=$1 AND m.tournament_id=$2 AND m.status='completed'", [uid, t.id])).rows[0]?.pts || 0;
      const winnerPts = (await pool.query("SELECT COALESCE(SUM(points_earned),0) as pts FROM tournament_winner_predictions WHERE user_id=$1 AND tournament_id=$2", [uid, t.id])).rows[0]?.pts || 0;
      const playerPts = (await pool.query("SELECT COALESCE(SUM(points_earned),0) as pts FROM player_predictions WHERE user_id=$1 AND tournament_id=$2", [uid, t.id])).rows[0]?.pts || 0;
      const adjPts = (await pool.query("SELECT COALESCE(SUM(points),0) as pts FROM point_adjustments WHERE user_id=$1 AND tournament_id=$2", [uid, t.id])).rows[0]?.pts || 0;
      const total = parseInt(predPts) + parseInt(winnerPts) + parseInt(playerPts) + parseInt(adjPts);
      if (total !== 0 || parseInt(adjPts) !== 0) {
        result.push({ tournament_id: t.id, tournament_name: t.name, prediction_points: parseInt(predPts), winner_points: parseInt(winnerPts), player_points: parseInt(playerPts), adjustment_points: parseInt(adjPts), total });
      }
    }
    // Get adjustments history
    const adjustments = (await pool.query(`
      SELECT pa.*, tour.name as tournament_name, c.name as created_by_name
      FROM point_adjustments pa
      JOIN tournaments tour ON pa.tournament_id = tour.id
      LEFT JOIN users c ON pa.created_by = c.id
      WHERE pa.user_id = $1
      ORDER BY pa.created_at DESC
    `, [uid])).rows;
    res.json({ tournaments: result, adjustments });
  } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }
});

// Delete a point adjustment
app.delete('/api/admin/point-adjustments/:id', auth, adminAuth, strictAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM point_adjustments WHERE id=$1', [req.params.id]);
    cacheClear('lb');
    res.json({message:'OK'});
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

// Admin: edit score of a completed match (recalculates all predictions)
app.put('/api/admin/matches/:id/edit-score', auth, adminAuth, async (req, res) => {
  try {
    const { team1_score, team2_score } = req.body;
    const match = (await pool.query('SELECT * FROM matches WHERE id=$1', [req.params.id])).rows[0];
    if (!match) return res.status(404).json({error:'Match non trouvé'});
    await pool.query('UPDATE matches SET team1_score=$1, team2_score=$2 WHERE id=$3', [team1_score, team2_score, req.params.id]);
    // Recalculate all predictions for this match
    const preds = (await pool.query('SELECT * FROM predictions WHERE match_id=$1', [req.params.id])).rows;
    const isFinal = match.bracket_round===2 || (match.stage && match.stage.toLowerCase().includes('finale') && !match.stage.toLowerCase().includes('demi'));
    let updated = 0;
    for (const p of preds) {
      const oldPts = p.points_earned || 0;
      let pts = await calcPoints(p, team1_score, team2_score, match.tournament_id);
      if (isFinal && p.team1_score === team1_score && p.team2_score === team2_score) {
        const rules = await getTournamentRules(match.tournament_id);
        pts += (rules.final_exact_score ?? 15);
      }
      if (oldPts !== pts) {
        await pool.query('UPDATE predictions SET points_earned=$1 WHERE id=$2', [pts, p.id]);
        updated++;
      }
    }
    cacheClear('lb');
    res.json({message:`Score modifié. ${updated} pronostics recalculés.`, updated});
  } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }
});

// Per-match prediction lock toggle
app.put('/api/admin/matches/:id/lock-predictions', auth, adminAuth, async (req, res) => {
  try {
    const { locked } = req.body;
    const match = (await pool.query('UPDATE matches SET predictions_locked=$1 WHERE id=$2 RETURNING id,predictions_locked', [!!locked, req.params.id])).rows[0];
    cacheClear('matches');
    res.json({ message: locked ? 'Pronostics verrouillés' : 'Pronostics déverrouillés', match });
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

// Update match stats (shots)
app.put('/api/admin/matches/:id/stats', auth, adminAuth, async (req, res) => {
  try {
    const { team1_shots, team2_shots } = req.body;
    await pool.query('UPDATE matches SET team1_shots=$1, team2_shots=$2 WHERE id=$3', [team1_shots||0, team2_shots||0, req.params.id]);
    cacheClear();
    res.json({message:'OK'});
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

// Get all user predictions for a match (visible after match started/completed)
app.get('/api/matches/:id/predictions', async (req, res) => {
  try {
    const match = (await pool.query('SELECT * FROM matches WHERE id=$1', [req.params.id])).rows[0];
    if (!match) return res.status(404).json({error:'Match non trouvé'});
    
    // Always compute prediction stats (percentages) - these are safe to show
    const allPreds = (await pool.query('SELECT team1_score, team2_score FROM predictions WHERE match_id=$1', [req.params.id])).rows;
    const totalPreds = allPreds.length;
    let team1Wins = 0, team2Wins = 0, draws = 0;
    allPreds.forEach(p => {
      if (p.team1_score > p.team2_score) team1Wins++;
      else if (p.team1_score < p.team2_score) team2Wins++;
      else draws++;
    });
    const stats = {
      total: totalPreds,
      team1_win_pct: totalPreds ? Math.round((team1Wins / totalPreds) * 100) : 0,
      team2_win_pct: totalPreds ? Math.round((team2Wins / totalPreds) * 100) : 0,
      draw_pct: totalPreds ? Math.round((draws / totalPreds) * 100) : 0,
    };
    
    // Show individual predictions for all match states
    const result = await pool.query(`
      SELECT p.team1_score, p.team2_score, p.points_earned, u.id as user_id, u.name as user_name, u.avatar_url,
        CASE WHEN p.team1_score=m.team1_score AND p.team2_score=m.team2_score THEN 'exact'
             WHEN (p.team1_score>p.team2_score AND m.team1_score>m.team2_score) OR (p.team1_score<p.team2_score AND m.team1_score<m.team2_score) OR (p.team1_score=p.team2_score AND m.team1_score=m.team2_score) THEN 'correct'
             ELSE 'wrong' END as prediction_type
      FROM predictions p
      JOIN users u ON p.user_id = u.id
      JOIN matches m ON p.match_id = m.id
      WHERE p.match_id = $1
      ORDER BY p.points_earned DESC, u.name
    `, [req.params.id]);
    res.json({ predictions: result.rows, stats });
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

// User reminders: what predictions are missing for active tournaments
app.get('/api/reminders', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const activeTournaments = (await pool.query('SELECT id, name, enable_player_predictions FROM tournaments WHERE is_active=true')).rows;
    const reminders = [];
    for (const t of activeTournaments) {
      // Check tournament winner prediction
      const winnerPred = (await pool.query('SELECT id FROM tournament_winner_predictions WHERE user_id=$1 AND tournament_id=$2', [userId, t.id])).rows[0];
      if (!winnerPred) reminders.push({ type: 'winner', tournament_id: t.id, tournament_name: t.name, message: `Choisissez le vainqueur du ${t.name}` });
      // Check finalist prediction
      const finalistPred = (await pool.query('SELECT id FROM finalist_predictions WHERE user_id=$1 AND tournament_id=$2', [userId, t.id])).rows[0];
      if (!finalistPred) reminders.push({ type: 'finalist', tournament_id: t.id, tournament_name: t.name, message: `Prédisez le finaliste du ${t.name}` });
      // Check player predictions
      if (t.enable_player_predictions) {
        const playerPred = (await pool.query('SELECT id, best_player_id, best_goal_scorer_id FROM player_predictions WHERE user_id=$1 AND tournament_id=$2', [userId, t.id])).rows[0];
        if (!playerPred?.best_player_id) reminders.push({ type: 'best_player', tournament_id: t.id, tournament_name: t.name, message: `Choisissez le meilleur joueur du ${t.name}` });
        if (!playerPred?.best_goal_scorer_id) reminders.push({ type: 'best_scorer', tournament_id: t.id, tournament_name: t.name, message: `Choisissez le meilleur buteur du ${t.name}` });
      }
    }
    res.json(reminders);
  } catch(e) { res.json([]); }
});

app.get('/api/settings', async (req, res) => { try { const c=cacheGet('settings'); if(c) return res.json(c); const s={}; (await pool.query('SELECT * FROM site_settings')).rows.forEach(r=>s[r.setting_key]=r.setting_value); cacheSet('settings',s,300000); res.json(s); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/admin/settings', auth, adminAuth, strictAdmin, async (req, res) => { try { for(const [k,v] of Object.entries(req.body)) await pool.query('INSERT INTO site_settings(setting_key,setting_value) VALUES($1,$2) ON CONFLICT(setting_key) DO UPDATE SET setting_value=$2',[k,v]); cacheClear('settings'); res.json({message:'OK'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});

app.post('/api/admin/tournaments/:id/start', auth, adminAuth, async (req, res) => { try { await pool.query('UPDATE tournaments SET has_started=true WHERE id=$1',[req.params.id]); res.json({message:'Tournoi démarré !'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.post('/api/admin/award-winner', auth, adminAuth, strictAdmin, async (req, res) => {
  try {
    const {tournament_id,team_id,runner_up_team_id}=req.body;
    const rules=await getTournamentRules(tournament_id);
    const pts=rules.tournament_winner??10;
    const runnerPts=rules.tournament_runner_up??5;
    const finalistPts=rules.tournament_finalist??3;
    let totalRewarded=0;
    // Winner predictions
    const winnerUserIds=new Set();
    const winners=(await pool.query('SELECT user_id FROM tournament_winner_predictions WHERE tournament_id=$1 AND team_id=$2',[tournament_id,team_id])).rows;
    for(const w of winners){
      await pool.query('UPDATE tournament_winner_predictions SET points_earned=$1 WHERE tournament_id=$2 AND user_id=$3',[pts,tournament_id,w.user_id]);
      await pool.query('UPDATE users SET total_points=COALESCE(total_points,0)+$1 WHERE id=$2',[pts,w.user_id]);
      winnerUserIds.add(w.user_id);
    }
    totalRewarded+=winners.length;
    // Runner-up predictions (exclude users who already won)
    if(runner_up_team_id && runnerPts>0){
      const runners=(await pool.query('SELECT user_id FROM tournament_winner_predictions WHERE tournament_id=$1 AND team_id=$2 AND points_earned=0',[tournament_id,runner_up_team_id])).rows;
      for(const r of runners){
        await pool.query('UPDATE tournament_winner_predictions SET points_earned=$1 WHERE tournament_id=$2 AND user_id=$3',[runnerPts,tournament_id,r.user_id]);
        await pool.query('UPDATE users SET total_points=COALESCE(total_points,0)+$1 WHERE id=$2',[runnerPts,r.user_id]);
      }
      totalRewarded+=runners.length;
    }
    // Finalist predictions - both finalists qualify (winner + runner_up)
    // Users who predicted either finalist team get points, BUT NOT if they already got winner points
    let finalistCount=0;
    const finalistTeams=[team_id];
    if(runner_up_team_id) finalistTeams.push(runner_up_team_id);
    for(const fTeam of finalistTeams){
      const fps=(await pool.query('SELECT user_id FROM finalist_predictions WHERE tournament_id=$1 AND team_id=$2 AND points_earned=0',[tournament_id,fTeam])).rows;
      for(const f of fps){
        if(winnerUserIds.has(f.user_id)) continue; // Skip: winner pts are higher
        await pool.query('UPDATE finalist_predictions SET points_earned=$1 WHERE tournament_id=$2 AND user_id=$3',[finalistPts,tournament_id,f.user_id]);
        await pool.query('UPDATE users SET total_points=COALESCE(total_points,0)+$1 WHERE id=$2',[finalistPts,f.user_id]);
        finalistCount++;
      }
    }
    await pool.query('UPDATE tournaments SET is_active=false,has_started=true WHERE id=$1',[tournament_id]);
    res.json({message:`${totalRewarded+finalistCount} récompensés (${winners.length} vainqueur, ${runner_up_team_id?totalRewarded-winners.length:0} finaliste, ${finalistCount} prédiction finale). Tournoi terminé !`});
  } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }
});

const PORT = process.env.PORT || 3000;
(async () => {
  const startServer = () => app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
  try {
    await pool.query('SELECT 1');
    console.log('✓ DB connected');
    await initDB();
    const hash = await bcrypt.hash('password', 10);
    await pool.query('INSERT INTO users(name,phone,password,is_admin) VALUES($1,$2,$3,$4) ON CONFLICT(phone) DO UPDATE SET password=$3', ['Admin', '0665448641', hash, true]);
    startServer();
  } catch (e) {
    console.error('DB init error:', e.message);
    console.log('⚠️ Starting server anyway - DB may be temporarily unavailable');
    startServer();
    // Retry DB init after 30s
    setTimeout(async () => { try { await initDB(); console.log('✓ DB init retry succeeded'); } catch (e2) { console.error('DB retry failed:', e2.message); } }, 30000);
  }
})();
