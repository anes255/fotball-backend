const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authController = {
  async register(req, res) {
    try {
      const { name, phone, password, predicted_winner_id } = req.body;
      
      if (!name || !phone || !password) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Mot de passe: 6 caractères minimum' });
      }

      const existingUser = await User.findByPhone(phone);
      if (existingUser) {
        return res.status(400).json({ error: 'Ce numéro est déjà utilisé' });
      }

      const user = await User.create({ name, phone, password, predicted_winner_id });
      const token = jwt.sign({ id: user.id, is_admin: user.is_admin }, process.env.JWT_SECRET, { expiresIn: '30d' });

      res.status(201).json({ user, token });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async login(req, res) {
    try {
      const { phone, password } = req.body;

      if (!phone || !password) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
      }

      const user = await User.findByPhone(phone);
      if (!user) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
      }

      const validPassword = await User.verifyPassword(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
      }

      const token = jwt.sign({ id: user.id, is_admin: user.is_admin }, process.env.JWT_SECRET, { expiresIn: '30d' });

      res.json({
        user: { id: user.id, name: user.name, phone: user.phone, is_admin: user.is_admin, total_points: user.total_points },
        token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async verify(req, res) {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }
      res.json({ user });
    } catch (error) {
      console.error('Verify error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getProfile(req, res) {
    try {
      const user = await User.getProfile(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }
      res.json(user);
    } catch (error) {
      console.error('Profile error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

module.exports = authController;
