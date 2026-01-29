const Tournament = require('../models/Tournament');

const tournamentController = {
  async getAll(req, res) {
    try {
      const tournaments = await Tournament.findAll();
      res.json(tournaments);
    } catch (error) {
      console.error('Get tournaments error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getActive(req, res) {
    try {
      const tournaments = await Tournament.findActive();
      res.json(tournaments);
    } catch (error) {
      console.error('Get active tournaments error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getById(req, res) {
    try {
      const tournament = await Tournament.findById(req.params.id);
      if (!tournament) {
        return res.status(404).json({ error: 'Tournoi non trouvé' });
      }
      res.json(tournament);
    } catch (error) {
      console.error('Get tournament error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getMatches(req, res) {
    try {
      const matches = await Tournament.getMatches(req.params.id);
      res.json(matches);
    } catch (error) {
      console.error('Get tournament matches error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async create(req, res) {
    try {
      const { name, description, start_date, end_date, logo_url, is_active } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Le nom est requis' });
      }
      const tournament = await Tournament.create({ name, description, start_date, end_date, logo_url, is_active });
      res.status(201).json(tournament);
    } catch (error) {
      console.error('Create tournament error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async update(req, res) {
    try {
      const { name, description, start_date, end_date, logo_url, is_active } = req.body;
      const tournament = await Tournament.update(req.params.id, { name, description, start_date, end_date, logo_url, is_active });
      if (!tournament) {
        return res.status(404).json({ error: 'Tournoi non trouvé' });
      }
      res.json(tournament);
    } catch (error) {
      console.error('Update tournament error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async delete(req, res) {
    try {
      await Tournament.delete(req.params.id);
      res.json({ message: 'Tournoi supprimé' });
    } catch (error) {
      console.error('Delete tournament error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

module.exports = tournamentController;
