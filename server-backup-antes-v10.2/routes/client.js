
// routes/client.js — v10
// Escopo: cartão fidelidade, QR Code, notificações, feedback, histórico e pontos fixos.

const express = require('express');
const User = require('../models/User');
const StampHistory = require('../models/StampHistory');
const Notification = require('../models/Notification');
const NotificationRead = require('../models/NotificationRead');
const Feedback = require('../models/Feedback');
const PushSubscription = require('../models/PushSubscription');
const Local = require('../models/Local');   // NOVO na v10
const auth = require('../middleware/auth');
const { generateQrToken, generateQrImage, QR_TOKEN_TTL_SECONDS } = require('./qr');

const router = express.Router();
router.use(auth);

// GET /api/client/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const history = await StampHistory.find({ userId: user._id, action: 'add' })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      fullName: user.fullName,
      phone: user.phone,
      email: user.email || null,
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
router.post('/generate-qr', async (req, res) => {
  try {
    const token = generateQrToken(req.user.id);
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

// GET /api/client/leaderboard
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

// GET /api/client/notifications
router.get('/notifications', async (req, res) => {
  try {
    const list = await Notification.find({
      $or: [{ userId: req.user.id }, { broadcast: true }],
    }).sort({ createdAt: -1 }).limit(50);

    const reads = await NotificationRead.find({
      userId: req.user.id,
      notificationId: { $in: list.map((n) => n._id) },
    }).select('notificationId');
    const readSet = new Set(reads.map((r) => String(r.notificationId)));

    const unseen = list.filter((n) => !readSet.has(String(n._id)));
    if (unseen.length) {
      await NotificationRead.insertMany(
        unseen.map((n) => ({ notificationId: n._id, userId: req.user.id })),
        { ordered: false }
      ).catch(() => {});
    }

    const notifications = list.map((n) => ({
      ...n.toObject(),
      read: readSet.has(String(n._id)),
    }));

    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar notificações.' });
  }
});

// GET /api/client/notifications/unread-count
router.get('/notifications/unread-count', async (req, res) => {
  try {
    const list = await Notification.find({
      $or: [{ userId: req.user.id }, { broadcast: true }],
    }).select('_id');
    const reads = await NotificationRead.find({
      userId: req.user.id,
      notificationId: { $in: list.map((n) => n._id) },
    }).select('notificationId');
    const readIds = new Set(reads.map((r) => String(r.notificationId)));
    const count = list.filter((n) => !readIds.has(String(n._id))).length;
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao contar notificações.' });
  }
});

// POST /api/client/feedback
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

// POST /api/client/push-subscribe
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

// DELETE /api/client/push-subscribe
router.delete('/push-subscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) await PushSubscription.deleteOne({ endpoint, userId: req.user.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desativar notificações.' });
  }
});

// NOVO na v10: pontos fixos visíveis ao cliente.
router.get('/locais', async (req, res) => {
  try {
    const locais = await Local.find({ active: true })
      .select('name lat lng radiusMeters')
      .sort({ name: 1 })
      .lean();
    const withUrl = locais.map((l) => ({
      ...l,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`,
    }));
    res.json({ locais: withUrl });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível carregar os locais.' });
  }
});

module.exports = router;
