const User = require('../models/User');
const { generateToken } = require('../middleware/auth');

const AuthController = {
  // Register new user
  async register(req, res) {
    try {
      const { name, phone, password, predicted_winner_id } = req.body;

      // Validation
      if (!name || !phone || !password) {
        return res.status(400).json({ error: 'Nom, téléphone et mot de passe requis' });
      }

      // Check if phone already exists
      const existingUser = await User.findByPhone(phone);
      if (existingUser) {
        return res.status(400).json({ error: 'Ce numéro de téléphone est déjà utilisé' });
      }

      // Create user
      const user = await User.create({ name, phone, password, predicted_winner_id });

      // Generate token
      const token = generateToken(user);

      res.status(201).json({
        message: 'Inscription réussie',
        token,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          predicted_winner_id: user.predicted_winner_id,
          total_points: user.total_points,
          is_admin: user.is_admin
        }
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Erreur lors de l\'inscription' });
    }
  },

  // Login user
  async login(req, res) {
    try {
      const { phone, password } = req.body;

      // Validation
      if (!phone || !password) {
        return res.status(400).json({ error: 'Téléphone et mot de passe requis' });
      }

      // Find user
      const user = await User.findByPhone(phone);
      if (!user) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
      }

      // Verify password
      const validPassword = await User.verifyPassword(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
      }

      // Generate token
      const token = generateToken(user);

      res.json({
        message: 'Connexion réussie',
        token,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          total_points: user.total_points,
          correct_predictions: user.correct_predictions,
          is_admin: user.is_admin
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Erreur lors de la connexion' });
    }
  },

  // Get current user profile
  async getProfile(req, res) {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      res.json({
        id: user.id,
        name: user.name,
        phone: user.phone,
        predicted_winner: user.predicted_winner,
        predicted_winner_id: user.predicted_winner_id,
        total_points: user.total_points,
        correct_predictions: user.correct_predictions,
        is_admin: user.is_admin,
        created_at: user.created_at
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération du profil' });
    }
  },

  // Verify token
  async verifyToken(req, res) {
    try {
      const user = await User.findById(req.user.id);
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
          total_points: user.total_points
        }
      });
    } catch (error) {
      res.status(401).json({ valid: false });
    }
  }
};

module.exports = AuthController;
