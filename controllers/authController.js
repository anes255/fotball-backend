const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const authController = {
  async register(req, res) {
    try {
      const { name, phone, password } = req.body;

      if (!name || !phone || !password) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
      }

      const cleanPhone = phone.replace(/[\s-]/g, '');
      if (!/^(05|06|07)[0-9]{8}$/.test(cleanPhone)) {
        return res.status(400).json({ error: 'Numéro de téléphone algérien invalide' });
      }

      const existingResult = await pool.query('SELECT id FROM users WHERE phone = $1', [cleanPhone]);
      if (existingResult.rows.length > 0) {
        return res.status(400).json({ error: 'Ce numéro est déjà utilisé' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await pool.query(
        'INSERT INTO users (name, phone, password) VALUES ($1, $2, $3) RETURNING *',
        [name, cleanPhone, hashedPassword]
      );
      
      const user = result.rows[0];
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

      res.status(201).json({
        token,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          is_admin: user.is_admin || false,
          total_points: user.total_points || 0
        }
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async login(req, res) {
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
  },

  async getProfile(req, res) {
    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
      const user = result.rows[0];
      
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      res.json({
        id: user.id,
        name: user.name,
        phone: user.phone,
        is_admin: user.is_admin || false,
        total_points: user.total_points || 0,
        correct_predictions: user.correct_predictions || 0,
        total_predictions: user.total_predictions || 0,
        created_at: user.created_at
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async verify(req, res) {
    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
      const user = result.rows[0];
      
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      res.json({
        valid: true,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          is_admin: user.is_admin || false,
          total_points: user.total_points || 0
        }
      });
    } catch (error) {
      console.error('Verify error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

module.exports = authController;
