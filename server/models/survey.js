// routes/survey.js
// Pesquisa de satisfação de 3 perguntas fixas (estrelas 1-5).
const express = require('express');
const SurveyResponse = require('../models/SurveyResponse');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');

const router = express.Router();

// GET /api/client/survey/questions — perguntas fixas (não vêm do banco, são parte do produto)
router.get('/client/survey/questions', auth, (req, res) => {
  res.json({
    questions: [
      { key: 'experience', text: 'Como foi sua experiência geral?' },
      { key: 'service', text: 'O que achou do atendimento?' },
      { key: 'recommend', text: 'Recomendaria a um amigo?' },
    ],
  });
});

// POST /api/client/survey  { experience, service, recommend, triggeredBy? }
router.post('/client/survey', auth, async (req, res) => {
  try {
    const { experience, service, recommend, triggeredBy = 'manual' } = req.body;
    const notas = [experience, service, recommend];
    if (notas.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) {
      return res.status(400).json({ error: 'Cada resposta deve ser uma nota de 1 a 5 estrelas.' });
    }

    const resposta = await SurveyResponse.create({
      userId: req.user.id,
      experience,
      service,
      recommend,
      triggeredBy,
    });

    res.status(201).json({ response: resposta });
  } catch (err) {
    console.error('Erro ao registrar pesquisa:', err);
    res.status(500).json({ error: 'Não foi possível registrar sua resposta.' });
  }
});

// GET /api/admin/surveys — respostas recentes + médias
router.get('/admin/surveys', auth, adminOnly, async (req, res) => {
  try {
    const [respostas, mediasAgg] = await Promise.all([
      SurveyResponse.find().sort({ createdAt: -1 }).limit(30).populate('userId', 'fullName'),
      SurveyResponse.aggregate([
        {
          $group: {
            _id: null,
            mediaExperiencia: { $avg: '$experience' },
            mediaAtendimento: { $avg: '$service' },
            mediaRecomendacao: { $avg: '$recommend' },
            total: { $sum: 1 },
          },
        },
      ]),
    ]);

    res.json({
      responses: respostas,
      averages: mediasAgg[0] || { mediaExperiencia: 0, mediaAtendimento: 0, mediaRecomendacao: 0, total: 0 },
    });
  } catch (err) {
    console.error('Erro ao carregar pesquisas:', err);
    res.status(500).json({ error: 'Não foi possível carregar as respostas.' });
  }
});

module.exports = router;
