const Team = require('../models/Team');

const teamController = {
  async getAll(req, res) {
    try {
      const teams = await Team.findAll();
      res.json(teams);
    } catch (error) {
      console.error('Get teams error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getById(req, res) {
    try {
      const team = await Team.findById(req.params.id);
      if (!team) {
        return res.status(404).json({ error: 'Équipe non trouvée' });
      }
      res.json(team);
    } catch (error) {
      console.error('Get team error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async create(req, res) {
    try {
      const { name, code, flag_url, group_name } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Le nom est requis' });
      }
      const team = await Team.create({ name, code, flag_url, group_name });
      res.status(201).json(team);
    } catch (error) {
      console.error('Create team error:', error);
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Cette équipe existe déjà' });
      }
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async update(req, res) {
    try {
      const { name, code, flag_url, group_name } = req.body;
      const team = await Team.update(req.params.id, { name, code, flag_url, group_name });
      if (!team) {
        return res.status(404).json({ error: 'Équipe non trouvée' });
      }
      res.json(team);
    } catch (error) {
      console.error('Update team error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async delete(req, res) {
    try {
      const isUsed = await Team.isUsedInMatches(req.params.id);
      if (isUsed) {
        return res.status(400).json({ error: 'Cette équipe est utilisée dans des matchs' });
      }
      await Team.delete(req.params.id);
      res.json({ message: 'Équipe supprimée' });
    } catch (error) {
      console.error('Delete team error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

module.exports = teamController;
