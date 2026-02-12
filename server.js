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

const initDB = async () => {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(255), phone VARCHAR(20) UNIQUE, password VARCHAR(255), is_admin BOOLEAN DEFAULT FALSE, total_points INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS teams (id SERIAL PRIMARY KEY, name VARCHAR(255), code VARCHAR(10), flag_url TEXT)`,
    `CREATE TABLE IF NOT EXISTS tournaments (id SERIAL PRIMARY KEY, name VARCHAR(255), description TEXT, logo_url TEXT, start_date DATE, end_date DATE, is_active BOOLEAN DEFAULT TRUE, format VARCHAR(50) DEFAULT 'groups_4', max_teams INTEGER DEFAULT 32)`,
    `CREATE TABLE IF NOT EXISTS tournament_teams (id SERIAL PRIMARY KEY, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE, group_name VARCHAR(10), UNIQUE(tournament_id, team_id))`,
    `CREATE TABLE IF NOT EXISTS matches (id SERIAL PRIMARY KEY, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, team1_id INTEGER REFERENCES teams(id), team2_id INTEGER REFERENCES teams(id), team1_score INTEGER DEFAULT 0, team2_score INTEGER DEFAULT 0, match_date TIMESTAMP, stage VARCHAR(100), status VARCHAR(20) DEFAULT 'upcoming')`,
    `CREATE TABLE IF NOT EXISTS predictions (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE, team1_score INTEGER, team2_score INTEGER, points_earned INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, match_id))`,
    `CREATE TABLE IF NOT EXISTS scoring_rules (id SERIAL PRIMARY KEY, rule_type VARCHAR(50) UNIQUE, points INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS tournament_scoring_rules (id SERIAL PRIMARY KEY, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, rule_type VARCHAR(50) NOT NULL, points INTEGER DEFAULT 0, UNIQUE(tournament_id, rule_type))`,
    `CREATE TABLE IF NOT EXISTS site_settings (id SERIAL PRIMARY KEY, setting_key VARCHAR(100) UNIQUE, setting_value TEXT)`,
    `CREATE TABLE IF NOT EXISTS tournament_winner_predictions (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE, points_earned INTEGER DEFAULT 0, UNIQUE(user_id, tournament_id))`,
    `CREATE TABLE IF NOT EXISTS tournament_players (id SERIAL PRIMARY KEY, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL, name VARCHAR(255) NOT NULL, photo_url TEXT, position VARCHAR(100))`,
    `CREATE TABLE IF NOT EXISTS player_predictions (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, best_player_id INTEGER REFERENCES tournament_players(id) ON DELETE SET NULL, best_goal_scorer_id INTEGER REFERENCES tournament_players(id) ON DELETE SET NULL, points_earned INTEGER DEFAULT 0, UNIQUE(user_id, tournament_id))`,
  ];
  for (const sql of tables) { try { await pool.query(sql); } catch(e) { console.log('Table note:', e.message); } }

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
  ];
  for (const sql of alts) { try { await pool.query(sql); } catch(e) {} }

  const rules = [['exact_score',5],['correct_winner',2],['correct_draw',3],['correct_goal_diff',1],['one_team_goals',1],['tournament_winner',10],['best_player',7],['best_goal_scorer',7]];
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
    ['site_name','Prediction World'],['site_logo','']
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

const calcPoints = async (pred, t1, t2, tournamentId) => {
  const rules = await getTournamentRules(tournamentId);
  if (pred.team1_score===t1 && pred.team2_score===t2) return rules.exact_score||5;
  let pts = 0;
  const aW = t1>t2?1:t1<t2?2:0, pW = pred.team1_score>pred.team2_score?1:pred.team1_score<pred.team2_score?2:0;
  if (aW===pW) { pts += aW===0?(rules.correct_draw||3):(rules.correct_winner||2); if((t1-t2)===(pred.team1_score-pred.team2_score)) pts+=rules.correct_goal_diff||1; }
  if (pred.team1_score===t1) pts+=rules.one_team_goals||1;
  if (pred.team2_score===t2) pts+=rules.one_team_goals||1;
  return pts;
};

app.get('/', (req, res) => res.json({ name: 'Prediction World API', version: '4.0' }));

// Auth
app.post('/api/auth/register', async (req, res) => { try { const {name,phone,password}=req.body||{}; if(!name||!phone||!password) return res.status(400).json({error:'Champs requis'}); const clean=phone.replace(/[\s-]/g,''); if(!/^(05|06|07)\d{8}$/.test(clean)) return res.status(400).json({error:'Numéro invalide'}); if((await pool.query('SELECT id FROM users WHERE phone=$1',[clean])).rows.length) return res.status(400).json({error:'Numéro déjà utilisé'}); const r=await pool.query('INSERT INTO users(name,phone,password) VALUES($1,$2,$3) RETURNING *',[name,clean,await bcrypt.hash(password,10)]); res.json({token:jwt.sign({userId:r.rows[0].id},JWT_SECRET,{expiresIn:'30d'}),user:r.rows[0]}); } catch(e) { res.status(500).json({error:'Erreur serveur'}); }});
app.post('/api/auth/login', async (req, res) => { try { const {phone,password}=req.body||{}; const clean=phone?.replace(/[\s-]/g,''); const r=await pool.query('SELECT * FROM users WHERE phone=$1',[clean]); if(!r.rows[0]||!(await bcrypt.compare(password,r.rows[0].password))) return res.status(401).json({error:'Identifiants incorrects'}); res.json({token:jwt.sign({userId:r.rows[0].id},JWT_SECRET,{expiresIn:'30d'}),user:{id:r.rows[0].id,name:r.rows[0].name,phone:r.rows[0].phone,is_admin:r.rows[0].is_admin,total_points:r.rows[0].total_points||0}}); } catch(e) { res.status(500).json({error:'Erreur serveur'}); }});
app.get('/api/auth/verify', auth, async (req, res) => { try { res.json({valid:true,user:(await pool.query('SELECT id,name,phone,is_admin,total_points FROM users WHERE id=$1',[req.userId])).rows[0]}); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// Teams
app.get('/api/teams', async (req, res) => { try { res.json((await pool.query('SELECT * FROM teams ORDER BY name')).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
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
app.get('/api/tournaments', async (req, res) => { try { res.json((await pool.query(`SELECT t.*, (SELECT COUNT(*) FROM matches WHERE tournament_id=t.id) as match_count, (SELECT COUNT(*) FROM tournament_teams WHERE tournament_id=t.id) as team_count FROM tournaments t ORDER BY start_date DESC`)).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
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
app.put('/api/admin/tournaments/:id/scoring-rules', auth, adminAuth, async (req, res) => { try { for(const [rt,pts] of Object.entries(req.body)) await pool.query('INSERT INTO tournament_scoring_rules(tournament_id,rule_type,points) VALUES($1,$2,$3) ON CONFLICT(tournament_id,rule_type) DO UPDATE SET points=$3',[req.params.id,rt,parseInt(pts)||0]); res.json({message:'OK'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// Tournament Players
app.get('/api/tournaments/:id/players', async (req, res) => { try { res.json((await pool.query('SELECT tp.*,t.name as team_name,t.flag_url as team_flag FROM tournament_players tp LEFT JOIN teams t ON tp.team_id=t.id WHERE tp.tournament_id=$1 ORDER BY t.name,tp.name',[req.params.id])).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.post('/api/tournaments/:id/players', auth, adminAuth, async (req, res) => { try { const {name,team_id,photo_url,position}=req.body; res.json((await pool.query('INSERT INTO tournament_players(tournament_id,team_id,name,photo_url,position) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.params.id,team_id||null,name,photo_url||null,position||null])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/players/:id', auth, adminAuth, async (req, res) => { try { const {name,team_id,photo_url,position}=req.body; res.json((await pool.query('UPDATE tournament_players SET name=$1,team_id=$2,photo_url=$3,position=$4 WHERE id=$5 RETURNING *',[name,team_id||null,photo_url||null,position||null,req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.delete('/api/players/:id', auth, adminAuth, async (req, res) => { try { await pool.query('DELETE FROM tournament_players WHERE id=$1',[req.params.id]); res.json({message:'OK'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// Player predictions
app.get('/api/tournaments/:id/my-player-prediction', auth, async (req, res) => { try { res.json((await pool.query('SELECT pp.*,bp.name as best_player_name,bp.photo_url as best_player_photo,bp.position as best_player_position,bpt.name as best_player_team,bpt.flag_url as best_player_team_flag,gs.name as best_goal_scorer_name,gs.photo_url as best_goal_scorer_photo,gs.position as best_goal_scorer_position,gst.name as best_goal_scorer_team,gst.flag_url as best_goal_scorer_team_flag FROM player_predictions pp LEFT JOIN tournament_players bp ON pp.best_player_id=bp.id LEFT JOIN teams bpt ON bp.team_id=bpt.id LEFT JOIN tournament_players gs ON pp.best_goal_scorer_id=gs.id LEFT JOIN teams gst ON gs.team_id=gst.id WHERE pp.user_id=$1 AND pp.tournament_id=$2',[req.userId,req.params.id])).rows[0]||null); } catch(e) { res.status(500).json({error:'Erreur'}); }});

app.post('/api/tournaments/:id/player-prediction', auth, async (req, res) => { try { const tid=req.params.id; const {best_player_id,best_goal_scorer_id}=req.body; const t=(await pool.query('SELECT has_started FROM tournaments WHERE id=$1',[tid])).rows[0]; if(t?.has_started) return res.status(400).json({error:'Tournoi déjà commencé'}); res.json((await pool.query('INSERT INTO player_predictions(user_id,tournament_id,best_player_id,best_goal_scorer_id) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,tournament_id) DO UPDATE SET best_player_id=COALESCE($3,player_predictions.best_player_id),best_goal_scorer_id=COALESCE($4,player_predictions.best_goal_scorer_id) RETURNING *',[req.userId,tid,best_player_id||null,best_goal_scorer_id||null])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});

app.post('/api/admin/tournaments/:id/set-player-winners', auth, adminAuth, async (req, res) => { try { const tid=parseInt(req.params.id); const bpId=req.body.best_player_id?parseInt(req.body.best_player_id):null; const gsId=req.body.best_goal_scorer_id?parseInt(req.body.best_goal_scorer_id):null; await pool.query('UPDATE tournaments SET best_player_id=$1,best_goal_scorer_id=$2 WHERE id=$3',[bpId,gsId,tid]); const rules=await getTournamentRules(tid); const bpPts=rules.best_player||7; const gsPts=rules.best_goal_scorer||7; let tot=0; if(bpId){const c=(await pool.query('SELECT user_id FROM player_predictions WHERE tournament_id=$1 AND best_player_id=$2',[tid,bpId])).rows; for(const u of c){await pool.query('UPDATE users SET total_points=COALESCE(total_points,0)+$1 WHERE id=$2',[bpPts,u.user_id]);tot++;}} if(gsId){const c=(await pool.query('SELECT user_id FROM player_predictions WHERE tournament_id=$1 AND best_goal_scorer_id=$2',[tid,gsId])).rows; for(const u of c){await pool.query('UPDATE users SET total_points=COALESCE(total_points,0)+$1 WHERE id=$2',[gsPts,u.user_id]);tot++;}} const all=(await pool.query('SELECT * FROM player_predictions WHERE tournament_id=$1',[tid])).rows; for(const pp of all){let p=0; if(bpId&&pp.best_player_id===bpId)p+=bpPts; if(gsId&&pp.best_goal_scorer_id===gsId)p+=gsPts; await pool.query('UPDATE player_predictions SET points_earned=$1 WHERE id=$2',[p,pp.id]);} res.json({message:`Gagnants définis ! ${tot} récompense(s)`}); } catch(e) { console.error(e.message); res.status(500).json({error:'Erreur: '+e.message}); }});

// Matches
app.get('/api/matches/visible', async (req, res) => { try { res.json((await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id WHERE m.status IN ('completed','live') OR (m.status='upcoming' AND m.match_date<=NOW()+INTERVAL '24 hours' AND m.match_date>NOW()) ORDER BY CASE WHEN m.status='live' THEN 0 WHEN m.status='upcoming' THEN 1 ELSE 2 END,match_date`)).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/matches/tournament/:id', async (req, res) => { try { res.json((await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id WHERE m.tournament_id=$1 AND (m.status IN ('completed','live') OR (m.status='upcoming' AND m.match_date<=NOW()+INTERVAL '24 hours' AND m.match_date>NOW())) ORDER BY CASE WHEN m.status='live' THEN 0 WHEN m.status='upcoming' THEN 1 ELSE 2 END,match_date`,[req.params.id])).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/matches/tournament/:id/visible', async (req, res) => { try { res.json((await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id WHERE m.tournament_id=$1 AND (m.status IN ('completed','live') OR (m.status='upcoming' AND m.match_date<=NOW()+INTERVAL '24 hours' AND m.match_date>NOW())) ORDER BY CASE WHEN m.status='live' THEN 0 WHEN m.status='upcoming' THEN 1 ELSE 2 END,match_date`,[req.params.id])).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/matches/:id', async (req, res) => { try { res.json((await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id WHERE m.id=$1`,[req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/matches', auth, adminAuth, async (req, res) => { try { res.json((await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id ORDER BY match_date`)).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/admin/matches/tournament/:id', auth, adminAuth, async (req, res) => { try { res.json((await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id WHERE m.tournament_id=$1 ORDER BY match_date`,[req.params.id])).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.post('/api/matches', auth, adminAuth, async (req, res) => { try { const {tournament_id,team1_id,team2_id,match_date,stage}=req.body; res.json((await pool.query('INSERT INTO matches(tournament_id,team1_id,team2_id,match_date,stage,status,team1_score,team2_score) VALUES($1,$2,$3,$4,$5,$6,0,0) RETURNING *',[tournament_id,team1_id,team2_id,match_date,stage,'upcoming'])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/matches/:id', auth, adminAuth, async (req, res) => { try { const {tournament_id,team1_id,team2_id,match_date,stage}=req.body; res.json((await pool.query('UPDATE matches SET tournament_id=$1,team1_id=$2,team2_id=$3,match_date=$4,stage=$5 WHERE id=$6 RETURNING *',[tournament_id,team1_id,team2_id,match_date,stage,req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.delete('/api/matches/:id', auth, adminAuth, async (req, res) => { try { await pool.query('DELETE FROM predictions WHERE match_id=$1',[req.params.id]); await pool.query('DELETE FROM matches WHERE id=$1',[req.params.id]); res.json({message:'OK'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/matches/:id/start', auth, adminAuth, async (req, res) => { try { res.json((await pool.query("UPDATE matches SET status='live',team1_score=COALESCE(team1_score,0),team2_score=COALESCE(team2_score,0) WHERE id=$1 RETURNING *",[req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/matches/:id/score', auth, adminAuth, async (req, res) => { try { const {team1_score,team2_score}=req.body; res.json((await pool.query("UPDATE matches SET team1_score=$1,team2_score=$2 WHERE id=$3 RETURNING *",[team1_score,team2_score,req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});

app.put('/api/matches/:id/complete', auth, adminAuth, async (req, res) => {
  try {
    const {team1_score,team2_score}=req.body;
    const match=(await pool.query('SELECT tournament_id FROM matches WHERE id=$1',[req.params.id])).rows[0];
    await pool.query("UPDATE matches SET team1_score=$1,team2_score=$2,status='completed' WHERE id=$3",[team1_score,team2_score,req.params.id]);
    const preds=(await pool.query('SELECT * FROM predictions WHERE match_id=$1',[req.params.id])).rows;
    for(const p of preds){const pts=await calcPoints(p,team1_score,team2_score,match?.tournament_id); await pool.query('UPDATE predictions SET points_earned=$1 WHERE id=$2',[pts,p.id]); if(pts>0) await pool.query('UPDATE users SET total_points=COALESCE(total_points,0)+$1 WHERE id=$2',[pts,p.user_id]);}
    res.json({message:'OK',predictions_processed:preds.length});
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

app.put('/api/matches/:id/result', auth, adminAuth, async (req, res) => {
  try {
    const {team1_score,team2_score}=req.body;
    const match=(await pool.query('SELECT tournament_id FROM matches WHERE id=$1',[req.params.id])).rows[0];
    await pool.query("UPDATE matches SET team1_score=$1,team2_score=$2,status='completed' WHERE id=$3",[team1_score,team2_score,req.params.id]);
    const preds=(await pool.query('SELECT * FROM predictions WHERE match_id=$1',[req.params.id])).rows;
    for(const p of preds){const pts=await calcPoints(p,team1_score,team2_score,match?.tournament_id); await pool.query('UPDATE predictions SET points_earned=$1 WHERE id=$2',[pts,p.id]); if(pts>0) await pool.query('UPDATE users SET total_points=COALESCE(total_points,0)+$1 WHERE id=$2',[pts,p.user_id]);}
    res.json({message:'OK'});
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

// Predictions
app.get('/api/predictions', auth, async (req, res) => { try { res.json((await pool.query(`SELECT p.*,m.match_date,m.team1_score as actual_team1_score,m.team2_score as actual_team2_score,m.status,m.tournament_id,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name FROM predictions p JOIN matches m ON p.match_id=m.id JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id WHERE p.user_id=$1 ORDER BY m.match_date DESC`,[req.userId])).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.post('/api/predictions', auth, async (req, res) => { try { const {match_id,team1_score,team2_score}=req.body; const m=(await pool.query('SELECT status,match_date FROM matches WHERE id=$1',[match_id])).rows[0]; if(!m||m.status!=='upcoming'||new Date(m.match_date)<=new Date()) return res.status(400).json({error:'Pronostics fermés'}); res.json((await pool.query('INSERT INTO predictions(user_id,match_id,team1_score,team2_score) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,match_id) DO UPDATE SET team1_score=$3,team2_score=$4 RETURNING *',[req.userId,match_id,team1_score,team2_score])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});

app.get('/api/users/:id/predictions', async (req, res) => {
  try {
    const user=(await pool.query('SELECT id,name,total_points FROM users WHERE id=$1',[req.params.id])).rows[0];
    const predictions=(await pool.query(`SELECT p.*,m.match_date,m.team1_score as actual_team1_score,m.team2_score as actual_team2_score,m.status,m.tournament_id,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name FROM predictions p JOIN matches m ON p.match_id=m.id JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id WHERE p.user_id=$1 AND m.status='completed' ORDER BY tour.name,m.match_date DESC`,[req.params.id])).rows;
    const winnerPred=(await pool.query('SELECT twp.*,t.name as team_name,t.flag_url,tour.name as tournament_name,twp.tournament_id FROM tournament_winner_predictions twp JOIN teams t ON twp.team_id=t.id JOIN tournaments tour ON twp.tournament_id=tour.id WHERE twp.user_id=$1',[req.params.id])).rows;
    const playerPred=(await pool.query(`SELECT pp.*,tour.name as tournament_name,pp.tournament_id,bp.name as best_player_name,bpt.name as best_player_team,gs.name as best_goal_scorer_name,gst.name as best_goal_scorer_team FROM player_predictions pp JOIN tournaments tour ON pp.tournament_id=tour.id LEFT JOIN tournament_players bp ON pp.best_player_id=bp.id LEFT JOIN teams bpt ON bp.team_id=bpt.id LEFT JOIN tournament_players gs ON pp.best_goal_scorer_id=gs.id LEFT JOIN teams gst ON gs.team_id=gst.id WHERE pp.user_id=$1`,[req.params.id])).rows;
    res.json({user,predictions,winnerPredictions:winnerPred,playerPredictions:playerPred});
  } catch(e) { res.status(500).json({error:'Erreur'}); }
});

// Tournament winner
app.get('/api/tournament-winner/:tournamentId', auth, async (req, res) => { try { res.json((await pool.query('SELECT twp.*,t.name as team_name,t.flag_url FROM tournament_winner_predictions twp JOIN teams t ON twp.team_id=t.id WHERE twp.user_id=$1 AND twp.tournament_id=$2',[req.userId,req.params.tournamentId])).rows[0]||null); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.post('/api/tournament-winner', auth, async (req, res) => { try { const {tournament_id,team_id}=req.body; const t=(await pool.query('SELECT has_started FROM tournaments WHERE id=$1',[tournament_id])).rows[0]; if(t?.has_started) return res.status(400).json({error:'Tournoi déjà commencé'}); res.json((await pool.query('INSERT INTO tournament_winner_predictions(user_id,tournament_id,team_id) VALUES($1,$2,$3) ON CONFLICT(user_id,tournament_id) DO UPDATE SET team_id=$3 RETURNING *',[req.userId,tournament_id,team_id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});

app.get('/api/tournaments/:id/started', async (req, res) => { try { const t=(await pool.query('SELECT has_started FROM tournaments WHERE id=$1',[req.params.id])).rows[0]; res.json({started:t?.has_started||false}); } catch(e) { res.status(500).json({error:'Erreur'}); }});

// Group standings for a tournament
app.get('/api/tournaments/:id/standings', async (req, res) => {
  try {
    const tid = req.params.id;
    const teams = (await pool.query(`SELECT tt.team_id, tt.group_name, t.name, t.flag_url
      FROM tournament_teams tt JOIN teams t ON tt.team_id=t.id WHERE tt.tournament_id=$1 ORDER BY tt.group_name,t.name`, [tid])).rows;
    // Get ALL completed matches for this tournament
    const matches = (await pool.query(`SELECT * FROM matches WHERE tournament_id=$1 AND status='completed'`, [tid])).rows;

    const stats = {};
    teams.forEach(t => {
      stats[t.team_id] = { team_id: t.team_id, name: t.name, flag_url: t.flag_url, group_name: t.group_name,
        played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
    });

    matches.forEach(m => {
      const t1 = stats[m.team1_id], t2 = stats[m.team2_id];
      if (!t1 || !t2) return;
      // Only count if both teams are in the same group (group stage match)
      if (t1.group_name && t2.group_name && t1.group_name === t2.group_name) {
        t1.played++; t2.played++;
        t1.gf += m.team1_score; t1.ga += m.team2_score;
        t2.gf += m.team2_score; t2.ga += m.team1_score;
        if (m.team1_score > m.team2_score) { t1.won++; t1.points += 3; t2.lost++; }
        else if (m.team1_score < m.team2_score) { t2.won++; t2.points += 3; t1.lost++; }
        else { t1.drawn++; t2.drawn++; t1.points += 1; t2.points += 1; }
      }
    });

    Object.values(stats).forEach(s => { s.gd = s.gf - s.ga; });

    const groups = {};
    Object.values(stats).forEach(s => {
      const g = s.group_name || 'Sans groupe';
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    });
    Object.values(groups).forEach(arr => arr.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name)));

    res.json(groups);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur' }); }
});

// Leaderboard - computed from predictions
app.get('/api/leaderboard', async (req, res) => { try { res.json((await pool.query(`SELECT u.id,u.name,COALESCE((SELECT SUM(p.points_earned) FROM predictions p JOIN matches m ON p.match_id=m.id WHERE p.user_id=u.id AND m.status='completed'),0)+COALESCE((SELECT SUM(twp.points_earned) FROM tournament_winner_predictions twp WHERE twp.user_id=u.id),0)+COALESCE((SELECT SUM(pp.points_earned) FROM player_predictions pp WHERE pp.user_id=u.id),0) AS total_points,(SELECT COUNT(*) FROM predictions WHERE user_id=u.id) as total_predictions,(SELECT COUNT(*) FROM predictions p3 JOIN matches m3 ON p3.match_id=m3.id WHERE p3.user_id=u.id AND m3.status='completed') as completed_predictions,(SELECT COUNT(*) FROM predictions p4 JOIN matches m4 ON p4.match_id=m4.id WHERE p4.user_id=u.id AND m4.status='completed' AND p4.points_earned>0) as correct_predictions,(SELECT COUNT(*) FROM predictions p5 JOIN matches m5 ON p5.match_id=m5.id WHERE p5.user_id=u.id AND m5.status='completed' AND p5.team1_score=m5.team1_score AND p5.team2_score=m5.team2_score) as exact_predictions FROM users u ORDER BY total_points DESC,u.name`)).rows); } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }});

// Per-tournament leaderboard with full stats
app.get('/api/leaderboard/tournament/:id', async (req, res) => { try { const tid=req.params.id; res.json((await pool.query(`SELECT * FROM (SELECT u.id,u.name,COALESCE((SELECT SUM(p.points_earned) FROM predictions p JOIN matches m ON p.match_id=m.id WHERE p.user_id=u.id AND m.tournament_id=$1 AND m.status='completed'),0)+COALESCE((SELECT SUM(twp.points_earned) FROM tournament_winner_predictions twp WHERE twp.user_id=u.id AND twp.tournament_id=$1),0)+COALESCE((SELECT SUM(pp.points_earned) FROM player_predictions pp WHERE pp.user_id=u.id AND pp.tournament_id=$1),0) AS total_points,(SELECT COUNT(*) FROM predictions p2 JOIN matches m2 ON p2.match_id=m2.id WHERE p2.user_id=u.id AND m2.tournament_id=$1) as total_predictions,(SELECT COUNT(*) FROM predictions p3 JOIN matches m3 ON p3.match_id=m3.id WHERE p3.user_id=u.id AND m3.tournament_id=$1 AND m3.status='completed') as completed_predictions,(SELECT COUNT(*) FROM predictions p4 JOIN matches m4 ON p4.match_id=m4.id WHERE p4.user_id=u.id AND m4.tournament_id=$1 AND m4.status='completed' AND p4.points_earned>0) as correct_predictions,(SELECT COUNT(*) FROM predictions p5 JOIN matches m5 ON p5.match_id=m5.id WHERE p5.user_id=u.id AND m5.tournament_id=$1 AND m5.status='completed' AND p5.team1_score=m5.team1_score AND p5.team2_score=m5.team2_score) as exact_predictions FROM users u) sub WHERE sub.total_points>0 OR sub.total_predictions>0 ORDER BY sub.total_points DESC,sub.name`,[tid])).rows); } catch(e) { console.error(e); res.status(500).json({error:'Erreur'}); }});

// Daily correct predictions - users who got it right today
app.get('/api/daily-winners', async (req, res) => {
  try {
    const dateParam = req.query.date || new Date().toISOString().split('T')[0];

    // Get matches completed on this date (compare date part only)
    const matches = (await pool.query(`SELECT m.*,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name
      FROM matches m JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id
      WHERE m.status='completed' AND m.match_date::date=$1::date ORDER BY m.match_date`, [dateParam])).rows;

    // Get all correct predictions for these matches
    const matchIds = matches.map(m => m.id);
    let winners = [];
    if (matchIds.length > 0) {
      winners = (await pool.query(`SELECT p.*,u.name as user_name,m.team1_score as actual_team1_score,m.team2_score as actual_team2_score,
        m.match_date,t1.name as team1_name,t1.flag_url as team1_flag,t2.name as team2_name,t2.flag_url as team2_flag,tour.name as tournament_name,
        CASE WHEN p.team1_score=m.team1_score AND p.team2_score=m.team2_score THEN 'exact' ELSE 'correct' END as prediction_type
        FROM predictions p JOIN users u ON p.user_id=u.id JOIN matches m ON p.match_id=m.id
        JOIN teams t1 ON m.team1_id=t1.id JOIN teams t2 ON m.team2_id=t2.id LEFT JOIN tournaments tour ON m.tournament_id=tour.id
        WHERE p.match_id=ANY($1) AND p.points_earned>0
        ORDER BY p.points_earned DESC,u.name`, [matchIds])).rows;
    }

    // Group by user
    const userMap = {};
    winners.forEach(w => {
      if (!userMap[w.user_id]) userMap[w.user_id] = { user_id: w.user_id, user_name: w.user_name, total_points: 0, exact_count: 0, correct_count: 0, predictions: [] };
      userMap[w.user_id].total_points += w.points_earned || 0;
      if (w.prediction_type === 'exact') userMap[w.user_id].exact_count++;
      else userMap[w.user_id].correct_count++;
      userMap[w.user_id].predictions.push(w);
    });
    const userSummary = Object.values(userMap).sort((a, b) => b.total_points - a.total_points);

    res.json({ date: dateParam, matches, winners: userSummary, total_matches: matches.length });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur' }); }
});

// Admin
app.get('/api/admin/users', auth, adminAuth, async (req, res) => { try { res.json((await pool.query('SELECT id,name,phone,is_admin,total_points,created_at FROM users ORDER BY total_points DESC NULLS LAST')).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/admin/users/:id', auth, adminAuth, async (req, res) => { try { const {is_admin,total_points}=req.body; res.json((await pool.query('UPDATE users SET is_admin=COALESCE($1,is_admin),total_points=COALESCE($2,total_points) WHERE id=$3 RETURNING *',[is_admin,total_points,req.params.id])).rows[0]); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.delete('/api/admin/users/:id', auth, adminAuth, async (req, res) => { try { await pool.query('DELETE FROM users WHERE id=$1',[req.params.id]); res.json({message:'OK'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/admin/scoring-rules', auth, adminAuth, async (req, res) => { try { res.json((await pool.query('SELECT * FROM scoring_rules')).rows); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/admin/scoring-rules', auth, adminAuth, async (req, res) => { try { for(const [k,v] of Object.entries(req.body)) await pool.query('UPDATE scoring_rules SET points=$1 WHERE rule_type=$2',[v,k]); res.json({message:'OK'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.get('/api/settings', async (req, res) => { try { const s={}; (await pool.query('SELECT * FROM site_settings')).rows.forEach(r=>s[r.setting_key]=r.setting_value); res.json(s); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.put('/api/admin/settings', auth, adminAuth, async (req, res) => { try { for(const [k,v] of Object.entries(req.body)) await pool.query('INSERT INTO site_settings(setting_key,setting_value) VALUES($1,$2) ON CONFLICT(setting_key) DO UPDATE SET setting_value=$2',[k,v]); res.json({message:'OK'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});

app.post('/api/admin/tournaments/:id/start', auth, adminAuth, async (req, res) => { try { await pool.query('UPDATE tournaments SET has_started=true WHERE id=$1',[req.params.id]); res.json({message:'Tournoi démarré !'}); } catch(e) { res.status(500).json({error:'Erreur'}); }});
app.post('/api/admin/award-winner', auth, adminAuth, async (req, res) => { try { const {tournament_id,team_id}=req.body; const rules=await getTournamentRules(tournament_id); const pts=rules.tournament_winner||10; const winners=(await pool.query('SELECT user_id FROM tournament_winner_predictions WHERE tournament_id=$1 AND team_id=$2',[tournament_id,team_id])).rows; for(const w of winners){await pool.query('UPDATE tournament_winner_predictions SET points_earned=$1 WHERE tournament_id=$2 AND user_id=$3',[pts,tournament_id,w.user_id]); await pool.query('UPDATE users SET total_points=COALESCE(total_points,0)+$1 WHERE id=$2',[pts,w.user_id]);} await pool.query('UPDATE tournaments SET is_active=false,has_started=true WHERE id=$1',[tournament_id]); res.json({message:`${winners.length} utilisateurs récompensés. Tournoi terminé !`}); } catch(e) { res.status(500).json({error:'Erreur'}); }});

const PORT = process.env.PORT || 3000;
(async () => { try { await pool.query('SELECT 1'); console.log('✓ DB connected'); await initDB(); const hash=await bcrypt.hash('password',10); await pool.query('INSERT INTO users(name,phone,password,is_admin) VALUES($1,$2,$3,$4) ON CONFLICT(phone) DO UPDATE SET password=$3',['Admin','0665448641',hash,true]); app.listen(PORT,()=>console.log(`🚀 Server on port ${PORT}`)); } catch(e) { console.error('Error:',e); process.exit(1); }})();
