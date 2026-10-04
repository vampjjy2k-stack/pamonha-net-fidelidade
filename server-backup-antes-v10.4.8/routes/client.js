// routes/client.js — v10.4
// Novidades: POST /raspadinha/raspar (sorteio seguro no servidor),
// GET /raspadinha (consulta se tem alguma ativa).

const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const StampHistory = require('../models/StampHistory');
const Notification = require('../models/Notification');
const NotificationRead = require('../models/NotificationRead');
const Feedback = require('../models/Feedback');
const PushSubscription = require('../models/PushSubscription');
const Local = require('../models/Local');
const Premio = require('../models/Premio');
const Raspadinha = require('../models/Raspadinha');
const auth = require('../middleware/auth');
const { generateQrToken, generateQrImage, QR_TOKEN_TTL_SECONDS } = require('./qr');
const liveEvents = require('../utils/events');

const router = express.Router();
router.use(auth);

// ============================================================================
// RASPADINHA (v10.4)
// ============================================================================

// Tabela de prêmios com pesos. Total = 100 (60 + 30 + 10).
// O sorteio é feito no SERVIDOR, com crypto — o cliente NUNCA decide.
const PRIZE_TABLE = [
  { percent: 5, weight: 60 },
  { percent: 8, weight: 30 },
  { percent: 10, weight: 10 },
];

function sortearDesconto() {
  const total = PRIZE_TABLE.reduce((s, p) => s + p.weight, 0);
  const r = crypto.randomInt(1, total + 1); // 1..100
  let acc = 0;
  for (const p of PRIZE_TABLE) {
    acc += p.weight;
    if (r <= acc) return p.percent;
  }
  return PRIZE_TABLE[0].percent;
}

function gerarCodigoRaspadinha() {
  // Alfabeto sem caracteres confusos (0/O, 1/I/L).
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(0, alphabet.length)];
  return 'PAM-' + code;
}

// POST /api/client/raspadinha/raspar
// Só funciona uma vez por conta. O servidor decide o prêmio.
router.post('/raspadinha/raspar', async (req, res) => {
  try {
    // Reivindicação atômica: duas requisições simultâneas não podem gerar dois prêmios.
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, raspadinhaDisponivel: true },
      { $set: { raspadinhaDisponivel: false } },
      { new: true }
    );
    if (!user) {
      const exists = await User.exists({ _id: req.user.id });
      return res.status(exists ? 400 : 404).json({ error: exists ? 'Você já raspou sua raspadinha.' : 'Usuário não encontrado.' });
    }
    // Gera código único (tenta até 8 vezes, colisão é praticamente nula)
    let code = null;
    for (let i = 0; i < 8; i++) {
      const candidato = gerarCodigoRaspadinha();
      const existe = await Raspadinha.findOne({ code: candidato });
      if (!existe) { code = candidato; break; }
    }
    if (!code) return res.status(500).json({ error: 'Não foi possível gerar o código. Tente novamente.' });

    const discountPercent = sortearDesconto();

    const raspadinha = await Raspadinha.create({
      userId: user._id,
      code,
      discountPercent,
      status: 'active',
    });

    // Marca que o usuário já raspou
    user.raspadinhaDisponivel = false;
    await user.save();

    // Cria a notificação especial (não pode ser apagada pelo admin — só resgatada)
    await Notification.create({
      userId: user._id,
      title: `🎁 Você ganhou ${discountPercent}% de desconto!`,
      message: `Mostre o código abaixo no balcão da Pamonha Net na sua próxima compra.`,
      type: 'raspadinha',
      raspadinhaId: raspadinha._id,
      code: raspadinha.code,
      broadcast: false,
    });

    // Avisa o app do cliente em tempo real
    liveEvents.sendToUser(user._id, 'notification', { id: raspadinha._id, title: 'Novo prêmio' });

    res.json({ raspadinha });
  } catch (err) {
    console.error('Erro na raspadinha:', err);
    res.status(500).json({ error: 'Não foi possível gerar sua raspadinha. Tente de novo.' });
  }
});

// GET /api/client/raspadinha — consulta se o usuário tem raspadinha ativa
router.get('/raspadinha', async (req, res) => {
  try {
    const rasp = await Raspadinha.findOne({ userId: req.user.id, status: 'active' }).lean();
    res.json({ raspadinha: rasp });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível consultar a raspadinha.' });
  }
});

// ============================================================================
// DASHBOARD
// ============================================================================
router.get('/dashboard', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const history = await StampHistory.find({ userId: user._id, action: 'add' }).sort({ createdAt: -1 }).limit(10);
    res.json({
      fullName: user.fullName,
      phone: user.phone,
      email: user.email || null,
      stamps: user.stamps,
      completedCards: user.completedCards || 0,
      lastStampAt: user.lastStampAt,
      raspadinhaDisponivel: user.raspadinhaDisponivel === true,
      history,
    });
  } catch (err) { res.status(500).json({ error: 'Não foi possível carregar seus dados.' }); }
});

router.post('/generate-qr', async (req, res) => {
  try {
    const token = generateQrToken(req.user.id);
    const baseUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
    const scanUrl = `${baseUrl}/?scan=${token}`;
    const qrImageBase64 = await generateQrImage(scanUrl);
    res.json({ qrToken: token, qrImage: qrImageBase64, expiresInSeconds: QR_TOKEN_TTL_SECONDS });
  } catch (err) { res.status(500).json({ error: 'Não foi possível gerar o QR Code. Tente novamente.' }); }
});

router.get('/history', async (req, res) => {
  try { const history = await StampHistory.find({ userId: req.user.id }).sort({ createdAt: -1 }); res.json({ history }); }
  catch (err) { res.status(500).json({ error: 'Não foi possível carregar o histórico.' }); }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const clients = await User.find({ role: 'client', completedCards: { $gt: 0 } }).select('fullName completedCards').sort({ completedCards: -1, fullName: 1 }).limit(50);
    const firstNameCounts = {};
    clients.forEach((c) => { const first = c.fullName.trim().split(/\s+/)[0]; firstNameCounts[first] = (firstNameCounts[first] || 0) + 1; });
    const leaderboard = clients.map((c, index) => {
      const first = c.fullName.trim().split(/\s+/)[0];
      const displayName = firstNameCounts[first] > 1 ? c.fullName.trim() : first;
      return { position: index + 1, displayName, completedCards: c.completedCards, isSelf: String(c._id) === req.user.id };
    });
    res.json({ leaderboard });
  } catch (err) { res.status(500).json({ error: 'Não foi possível carregar o ranking.' }); }
});

router.get('/notifications', async (req, res) => {
  try {
    const list = await Notification.find({ $or: [{ userId: req.user.id }, { broadcast: true }] }).sort({ createdAt: -1 }).limit(50);
    const reads = await NotificationRead.find({ userId: req.user.id, notificationId: { $in: list.map((n) => n._id) } }).select('notificationId');
    const readSet = new Set(reads.map((r) => String(r.notificationId)));
    const unseen = list.filter((n) => !readSet.has(String(n._id)));
    if (unseen.length) await NotificationRead.insertMany(unseen.map((n) => ({ notificationId: n._id, userId: req.user.id })), { ordered: false }).catch(() => {});
    const notifications = list.map((n) => ({ ...n.toObject(), read: readSet.has(String(n._id)) }));
    res.json({ notifications });
  } catch (err) { res.status(500).json({ error: 'Erro ao carregar notificações.' }); }
});

router.get('/notifications/unread-count', async (req, res) => {
  try {
    const list = await Notification.find({ $or: [{ userId: req.user.id }, { broadcast: true }] }).select('_id');
    const reads = await NotificationRead.find({ userId: req.user.id, notificationId: { $in: list.map((n) => n._id) } }).select('notificationId');
    const readIds = new Set(reads.map((r) => String(r.notificationId)));
    const count = list.filter((n) => !readIds.has(String(n._id))).length;
    res.json({ count });
  } catch (err) { res.status(500).json({ error: 'Erro ao contar notificações.' }); }
});

router.post('/feedback', async (req, res) => {
  try {
    const { experienceRating, tasteRating, serviceRating, comment } = req.body;
    const notes = { experienceRating, tasteRating, serviceRating };
    for (const [key, val] of Object.entries(notes)) { if (!val || val < 1 || val > 5) return res.status(400).json({ error: 'Responda as 3 perguntas com uma nota de 1 a 5.' }); }
    const fb = await Feedback.create({ userId: req.user.id, experienceRating, tasteRating, serviceRating, comment: (comment || '').trim() });
    res.status(201).json({ feedback: fb });
  } catch (err) { res.status(500).json({ error: 'Erro ao enviar avaliação.' }); }
});

router.post('/push-subscribe', async (req, res) => {
  try {
    const { endpoint, keys, userAgent } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) return res.status(400).json({ error: 'Inscrição de notificação inválida.' });
    await PushSubscription.findOneAndUpdate({ endpoint }, { userId: req.user.id, endpoint, keys, userAgent: (userAgent || '').slice(0, 300) }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.status(201).json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Não foi possível ativar as notificações neste dispositivo.' }); }
});

router.delete('/push-subscribe', async (req, res) => {
  try { const { endpoint } = req.body; if (endpoint) await PushSubscription.deleteOne({ endpoint, userId: req.user.id }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: 'Erro ao desativar notificações.' }); }
});

router.get('/locais', async (req, res) => {
  try {
    const locais = await Local.find({ active: true }).select('name lat lng radiusMeters').sort({ name: 1 }).lean();
    const withUrl = locais.map((l) => ({ ...l, mapsUrl: `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}` }));
    res.json({ locais: withUrl });
  } catch (err) { res.status(500).json({ error: 'Não foi possível carregar os locais.' }); }
});

router.get('/premios', async (req, res) => {
  try {
    const premios = await Premio.find({ active: true }).sort({ order: 1, name: 1 }).select('name description stampsRequired imageUrl order').lean();
    res.json({ premios });
  } catch (err) { res.status(500).json({ error: 'Não foi possível carregar os prêmios.' }); }
});

module.exports = router;
