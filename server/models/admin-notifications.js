// routes/admin-notifications.js
// Composição e envio de notificações (para todos os clientes ou um específico).
const express = require('express');
const Notification = require('../models/Notification');
const User = require('../models/User');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');

const router = express.Router();
router.use(auth, adminOnly);

// GET /api/admin/notifications — histórico de envios
router.get('/', async (req, res) => {
  try {
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('targetUserId', 'fullName');
    res.json({ notifications });
  } catch (err) {
    console.error('Erro ao listar notificações:', err);
    res.status(500).json({ error: 'Não foi possível carregar o histórico de notificações.' });
  }
});

// POST /api/admin/notifications  { message, imageUrl?, audience, targetUserId?, expiresInHours? }
router.post('/', async (req, res) => {
  try {
    const { message, imageUrl = '', audience, targetUserId = null, expiresInHours = null } = req.body;

    if (!message || !message.trim()) return res.status(400).json({ error: 'Escreva uma mensagem.' });
    if (!['all', 'single'].includes(audience)) return res.status(400).json({ error: 'Segmento de envio inválido.' });

    let resolvedTargetId = null;
    if (audience === 'single') {
      if (!targetUserId) return res.status(400).json({ error: 'Selecione um cliente específico.' });
      const cliente = await User.findOne({ _id: targetUserId, role: 'client' });
      if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
      resolvedTargetId = cliente._id;
    }

    const expiresAt = expiresInHours ? new Date(Date.now() + Number(expiresInHours) * 3600 * 1000) : null;

    const notification = await Notification.create({
      message: message.trim(),
      imageUrl,
      audience,
      targetUserId: resolvedTargetId,
      sentBy: req.user.id,
      expiresAt,
    });

    const deliveredCount =
      audience === 'all' ? await User.countDocuments({ role: 'client' }) : 1;

    res.status(201).json({ notification, deliveredCount });
  } catch (err) {
    console.error('Erro ao enviar notificação:', err);
    res.status(500).json({ error: 'Não foi possível enviar a notificação.' });
  }
});

module.exports = router;
