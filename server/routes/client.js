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
      completedCards: user.completedCards || 0,
      lastStampAt: user.lastStampAt,
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
    // O QR Code visual carrega um LINK completo (não só o token cru), para que QUALQUER câmera —
    // a nativa do Android, a do iPhone, a do WhatsApp — consiga ler e abrir direto, sem precisar
    // do scanner dentro do app. Ao abrir, a própria página processa o carimbo automaticamente.
    const baseUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
    const scanUrl = `${baseUrl}/?scan=${token}`;
    const qrImageBase64 = await generateQrImage(scanUrl);

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

// GET /api/client/leaderboard — ranking de clientes por cartões completados.
// Regra de exibição de nome: mostra só o primeiro nome quando ele é único entre os exibidos;
// se dois ou mais clientes dividem o mesmo primeiro nome, todos eles passam a mostrar nome + sobrenome.
router.get('/leaderboard', async (req, res) => {
  try {
    const clients = await User.find({ role: 'client', completedCards: { $gt: 0 } })
      .select('fullName completedCards')
      .sort({ completedCards: -1, fullName: 1 })
      .limit(50);

    const firstNameCounts = {};
    clients.forEach((c) => {
      const first = c.fullName.trim().split(/\s+/)[0];
      firstNameCounts[first] = (firstNameCounts[first] || 0) + 1;
    });

    const leaderboard = clients.map((c, index) => {
      const first = c.fullName.trim().split(/\s+/)[0];
      const displayName = firstNameCounts[first] > 1 ? c.fullName.trim() : first;
      return {
        position: index + 1,
        displayName,
        completedCards: c.completedCards,
        isSelf: String(c._id) === req.user.id,
      };
    });

    res.json({ leaderboard });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível carregar o ranking.' });
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
