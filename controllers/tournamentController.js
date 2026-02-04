const Tournament = require('../models/Tournament');
const Match = require('../models/Match');

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
      if (!tournament) return res.status(404).json({ error: 'Tournoi non trouvé' });
      res.json(tournament);
    } catch (error) {
      console.error('Get tournament error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async getMatches(req, res) {
    try {
      const matches = await Match.findByTournament(req.params.id);
      res.json(matches);
    } catch (error) {
      console.error('Get tournament matches error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async create(req, res) {
    try {
      const tournament = await Tournament.create(req.body);
      res.status(201).json(tournament);
    } catch (error) {
      console.error('Create tournament error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async update(req, res) {
    try {
      const tournament = await Tournament.update(req.params.id, req.body);
      if (!tournament) return res.status(404).json({ error: 'Tournoi non trouvé' });
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
