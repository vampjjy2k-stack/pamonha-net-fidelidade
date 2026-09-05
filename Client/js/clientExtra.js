/* ==========================================================================
   ROUTES/CLIENT-EXTRA.JS
   Rotas novas do cliente, além das que já existem em routes/client.js:
     PUT  /api/client/profile        — atualiza nome e e-mail
     POST /api/client/feedback       — envia avaliação (atendimento/produtos)
     GET  /api/client/notifications  — lista avisos globais + individuais

   Este arquivo é montado em server.js com o MESMO prefixo "/api/client"
   que o routes/client.js já existente — veja as instruções de integração
   enviadas junto com este código.
   ========================================================================== */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Feedback = require('../models/Feedback');
const Message = require('../models/Message');

// Extrai o id do usuário logado de forma tolerante ao formato exato
// que o middleware/auth.js grava em req.user (id, _id ou req.userId).
function getUserId(req) {
  return (req.user && (req.user.id || req.user._id)) || req.userId;
}

// ---------------------------------------------------------------------
// PUT /api/client/profile — atualiza nome e e-mail do cliente logado
// ---------------------------------------------------------------------
router.put('/profile', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim();

    if (!name) {
      return res.status(400).json({ message: 'Informe seu nome.' });
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { name, email },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    res.json({ name: updated.name, email: updated.email, phone: updated.phone });
  } catch (err) {
    res.status(500).json({ message: 'Não foi possível salvar seus dados agora.' });
  }
});

// ---------------------------------------------------------------------
// POST /api/client/feedback — envia avaliação de atendimento e produtos
// ---------------------------------------------------------------------
router.post('/feedback', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const serviceRating = Number(req.body.serviceRating);
    const productRating = Number(req.body.productRating);
    const comment = (req.body.comment || '').trim();

    const isValidRating = (n) => Number.isInteger(n) && n >= 1 && n <= 5;

    if (!isValidRating(serviceRating) || !isValidRating(productRating)) {
      return res.status(400).json({ message: 'Dê uma nota de 1 a 5 para atendimento e produtos.' });
    }

    await Feedback.create({ client: userId, serviceRating, productRating, comment });

    res.status(201).json({ message: 'Avaliação enviada com sucesso.' });
  } catch (err) {
    res.status(500).json({ message: 'Não foi possível enviar sua avaliação agora.' });
  }
});

// ---------------------------------------------------------------------
// GET /api/client/notifications — avisos globais + individuais do cliente
// (ao consultar, marca as mensagens novas como lidas para a próxima vez)
// ---------------------------------------------------------------------
router.get('/notifications', auth, async (req, res) => {
  try {
    const userId = getUserId(req);

    const messages = await Message.find({
      $or: [{ scope: 'global' }, { scope: 'individual', client: userId }]
    })
      .sort({ createdAt: -1 })
      .lean();

    const wasRead = (m) => (m.readBy || []).some((id) => String(id) === String(userId));

    const notifications = messages.map((m) => ({
      _id: m._id,
      title: m.title,
      body: m.body,
      createdAt: m.createdAt,
      read: wasRead(m)
    }));

    const unreadIds = messages.filter((m) => !wasRead(m)).map((m) => m._id);
    if (unreadIds.length) {
      await Message.updateMany({ _id: { $in: unreadIds } }, { $addToSet: { readBy: userId } });
    }

    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ message: 'Não foi possível carregar os avisos agora.' });
  }
});

module.exports = router;
