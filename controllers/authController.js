const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const authController = {
  async register(req, res) {
    try {
      const { name, phone, password, predicted_winner_id } = req.body;

      if (!name || !phone || !password) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
      }

      // Validate Algerian phone number
      const cleanPhone = phone.replace(/[\s-]/g, '');
      if (!/^(05|06|07)[0-9]{8}$/.test(cleanPhone)) {
        return res.status(400).json({ error: 'Numéro de téléphone algérien invalide' });
      }

      const existingUser = await User.findByPhone(cleanPhone);
      if (existingUser) {
        return res.status(400).json({ error: 'Ce numéro est déjà utilisé' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await User.create({
        name,
        phone: cleanPhone,
        password: hashedPassword,
        predicted_winner_id: predicted_winner_id || null
      });

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

      res.status(201).json({
        token,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          is_admin: user.is_admin,
          total_points: user.total_points,
          predicted_winner_id: user.predicted_winner_id
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
      const user = await User.findByPhone(cleanPhone);
      
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
          is_admin: user.is_admin,
          total_points: user.total_points,
          correct_predictions: user.correct_predictions,
          total_predictions: user.total_predictions,
          predicted_winner_id: user.predicted_winner_id,
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
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      res.json({
        id: user.id,
        name: user.name,
        phone: user.phone,
        is_admin: user.is_admin,
        total_points: user.total_points,
        correct_predictions: user.correct_predictions,
        total_predictions: user.total_predictions,
        predicted_winner_id: user.predicted_winner_id,
        created_at: user.created_at
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async updateProfile(req, res) {
    try {
      const { predicted_winner_id, name } = req.body;
      const userId = req.userId;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      const updatedUser = await User.updateProfile(userId, {
        predicted_winner_id: predicted_winner_id !== undefined ? predicted_winner_id : user.predicted_winner_id,
        name: name || user.name
      });

      res.json({
        id: updatedUser.id,
        name: updatedUser.name,
        phone: updatedUser.phone,
        is_admin: updatedUser.is_admin,
        total_points: updatedUser.total_points,
        correct_predictions: updatedUser.correct_predictions,
        total_predictions: updatedUser.total_predictions,
        predicted_winner_id: updatedUser.predicted_winner_id,
        created_at: updatedUser.created_at
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async verify(req, res) {
    try {
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      res.json({
        valid: true,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          is_admin: user.is_admin,
          total_points: user.total_points,
          predicted_winner_id: user.predicted_winner_id
        }
      });
    } catch (error) {
      console.error('Verify error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

module.exports = authController;
