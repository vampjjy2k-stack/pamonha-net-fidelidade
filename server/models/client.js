// routes/client.js
// Rotas do cliente logado. Todas protegidas pelo middleware "auth".
const express = require('express');
const User = require('../models/User');
const Redemption = require('../models/Redemption');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const { generateQrToken, generateQrImage, QR_TOKEN_TTL_SECONDS } = require('./qr');

const router = express.Router();

router.use(auth);

// GET /api/client/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const history = await Redemption.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10);

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
    const history = await Redemption.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ history });
  } catch (err) {
    console.error('Erro ao carregar histórico:', err);
    res.status(500).json({ error: 'Não foi possível carregar o histórico.' });
  }
});

// GET /api/client/notifications — mensagens para "todos" + mensagens específicas para este cliente,
// excluindo promoções já expiradas (campo expiresAt).
router.get('/notifications', async (req, res) => {
  try {
    const agora = new Date();
    const notifications = await Notification.find({
      $and: [
        { $or: [{ audience: 'all' }, { audience: 'single', targetUserId: req.user.id }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: agora } }] },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ notifications });
  } catch (err) {
    console.error('Erro ao carregar notificações:', err);
    res.status(500).json({ error: 'Não foi possível carregar as notificações.' });
  }
});

module.exports = router;
