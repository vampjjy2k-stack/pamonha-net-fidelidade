// routes/client-survey.js
// Pesquisa de satisfação para o cliente. Protegido por auth.
const express = require('express');
const SurveyResponse = require('../models/SurveyResponse');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// GET /api/client/survey/questions — retorna as 3 perguntas fixas
router.get('/questions', (req, res) => {
  res.json({
    questions: [
      { id: 'experience', label: 'Como foi sua experiência geral?', type: 'rating', max: 5 },
      { id: 'service', label: 'Como avalia o atendimento?', type: 'rating', max: 5 },
      { id: 'recommend', label: 'Quanto recomendaria a Pamonha Net?', type: 'rating', max: 5 },
    ],
  });
});

// POST /api/client/survey — envia resposta da pesquisa
router.post('/', async (req, res) => {
  try {
    const { experience, service, recommend, triggeredBy } = req.body;
    if (
      experience === undefined ||
      service === undefined ||
      recommend === undefined
    ) {
      return res.status(400).json({ error: 'Responda todas as 3 perguntas.' });
    }
    const answers = {
      experience: Number(experience),
      service: Number(service),
      recommend: Number(recommend),
    };
    for (const v of Object.values(answers)) {
      if (v < 1 || v > 5 || !Number.isInteger(v)) {
        return res.status(400).json({ error: 'As notas devem ser de 1 a 5.' });
      }
    }

    const response = await SurveyResponse.create({
      userId: req.user.id,
      triggeredBy: triggeredBy || 'manual',
      answers,
    });

    res.status(201).json({ response });
  } catch (err) {
    console.error('Erro ao salvar pesquisa:', err);
    res.status(500).json({ error: 'Não foi possível enviar a pesquisa.' });
  }
});

module.exports = router;
