const Team = require('../models/Team');

const TeamController = {
  // Get all teams
  async getAll(req, res) {
    try {
      const teams = await Team.findAll();
      res.json(teams);
    } catch (error) {
      console.error('Get teams error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des équipes' });
    }
  },

  // Get team by ID
  async getById(req, res) {
    try {
      const team = await Team.findById(req.params.id);
      if (!team) {
        return res.status(404).json({ error: 'Équipe non trouvée' });
      }
      res.json(team);
    } catch (error) {
      console.error('Get team error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération de l\'équipe' });
    }
  },

  // Create team (Admin)
  async create(req, res) {
    try {
      const { name, code, flag_url, group_name } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Le nom de l\'équipe est requis' });
      }

      // Check if team already exists
      const existingTeam = await Team.findByName(name);
      if (existingTeam) {
        return res.status(400).json({ error: 'Cette équipe existe déjà' });
      }

      const team = await Team.create({ name, code, flag_url, group_name });
      res.status(201).json(team);
    } catch (error) {
      console.error('Create team error:', error);
      res.status(500).json({ error: 'Erreur lors de la création de l\'équipe' });
    }
  },

  // Update team (Admin)
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
      res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'équipe' });
    }
  },

  // Delete team (Admin)
  async delete(req, res) {
    try {
      const team = await Team.delete(req.params.id);
      
      if (!team) {
        return res.status(404).json({ error: 'Équipe non trouvée' });
      }

      res.json({ message: 'Équipe supprimée avec succès' });
    } catch (error) {
      console.error('Delete team error:', error);
      res.status(400).json({ error: error.message || 'Erreur lors de la suppression' });
    }
  }
};

module.exports = TeamController;
