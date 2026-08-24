// routes/admin-notifications.js
// Envio e histórico de notificações. Protegido por auth + adminOnly.
const express = require('express');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');

const router = express.Router();
router.use(auth, adminOnly);

// POST /api/admin/notifications — envia notificação
router.post('/', async (req, res) => {
  try {
    const { message, imageUrl, audience, targetUserId } = req.body;
    if (!message || !audience) {
      return res.status(400).json({ error: 'Mensagem e público são obrigatórios.' });
    }
    if (audience === 'single' && !targetUserId) {
      return res.status(400).json({ error: 'Informe o ID do cliente para notificação individual.' });
    }

    const notification = await Notification.create({
      message: message.trim(),
      imageUrl: imageUrl || '',
      audience,
      targetUserId: audience === 'single' ? targetUserId : null,
      sentBy: req.user.id,
      sentAt: new Date(),
      deliveredCount: audience === 'all' ? 0 : 1,
    });

    res.status(201).json({ notification });
  } catch (err) {
    console.error('Erro ao enviar notificação:', err);
    res.status(500).json({ error: 'Não foi possível enviar a notificação.' });
  }
});

// GET /api/admin/notifications — histórico de envios
router.get('/', async (req, res) => {
  try {
    const notifications = await Notification.find()
      .populate('targetUserId', 'fullName phone')
      .populate('sentBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ notifications });
  } catch (err) {
    console.error('Erro ao listar notificações:', err);
    res.status(500).json({ error: 'Não foi possível carregar o histórico.' });
  }
});

module.exports = router;
