// routes/client.js
// Rotas do cliente logado. Todas protegidas pelo middleware "auth".
// Escopo enxuto: cartão fidelidade, QR Code, notificações, feedback e histórico.

const express = require('express');
const User = require('../models/User');
const StampHistory = require('../models/StampHistory');
const Notification = require('../models/Notification');
const Feedback = require('../models/Feedback');
const PushSubscription = require('../models/PushSubscription');
const auth = require('../middleware/auth');
const { generateQrToken, generateQrImage, QR_TOKEN_TTL_SECONDS } = require('./qr');

const router = express.Router();
router.use(auth);

// GET /api/client/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const history = await StampHistory.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20);

    res.json({
      fullName: user.fullName,
      phone: user.phone,
      stamps: user.stamps,
      history,
    });
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
    res.status(500).json({ error: 'Não foi possível carregar seus dados.' });
  }
});

// POST /api/client/generate-qr
// Gera um QR Code único, válido por 5 minutos, que o admin escaneia para adicionar 1 carimbo.
router.post('/generate-qr', async (req, res) => {
  try {
    const token = generateQrToken(req.user.id);
    const qrImageBase64 = await generateQrImage(token);

    res.json({
      qrToken: token,
      qrImage: qrImageBase64,
      expiresInSeconds: QR_TOKEN_TTL_SECONDS,
    });
  } catch (err) {
    console.error('Erro ao gerar QR Code:', err);
    res.status(500).json({ error: 'Não foi possível gerar o QR Code. Tente novamente.' });
  }
});

// GET /api/client/history
router.get('/history', async (req, res) => {
  try {
    const history = await StampHistory.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível carregar o histórico.' });
  }
});

// NOTIFICATIONS
// GET /api/client/notifications
router.get('/notifications', async (req, res) => {
  try {
    const list = await Notification.find({
      $or: [{ userId: req.user.id }, { broadcast: true }],
    }).sort({ createdAt: -1 });
    res.json({ notifications: list });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar notificações.' });
  }
});

// PUT /api/client/notifications/:id/read
router.put('/notifications/:id/read', async (req, res) => {
  try {
    const notif = await Notification.findById(req.params.id);
    if (!notif) return res.status(404).json({ error: 'Notificação não encontrada.' });
    if (!notif.broadcast && String(notif.userId) !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    notif.read = true;
    await notif.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao marcar notificação como lida.' });
  }
});

// FEEDBACK
// POST /api/client/feedback { experienceRating, tasteRating, serviceRating, comment }
router.post('/feedback', async (req, res) => {
  try {
    const { experienceRating, tasteRating, serviceRating, comment } = req.body;
    const notes = { experienceRating, tasteRating, serviceRating };
    for (const [key, val] of Object.entries(notes)) {
      if (!val || val < 1 || val > 5) {
        return res.status(400).json({ error: 'Responda as 3 perguntas com uma nota de 1 a 5.' });
      }
    }
    const fb = await Feedback.create({
      userId: req.user.id,
      experienceRating,
      tasteRating,
      serviceRating,
      comment: (comment || '').trim(),
    });
    res.status(201).json({ feedback: fb });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar avaliação.' });
  }
});

// PUSH NOTIFICATIONS (Web Push)
// POST /api/client/push-subscribe — registra este dispositivo para receber notificações reais
router.post('/push-subscribe', async (req, res) => {
  try {
    const { endpoint, keys, userAgent } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Inscrição de notificação inválida.' });
    }
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { userId: req.user.id, endpoint, keys, userAgent: (userAgent || '').slice(0, 300) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível ativar as notificações neste dispositivo.' });
  }
});

// DELETE /api/client/push-subscribe — desativa notificações neste dispositivo
router.delete('/push-subscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) await PushSubscription.deleteOne({ endpoint, userId: req.user.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desativar notificações.' });
  }
});

module.exports = router;
