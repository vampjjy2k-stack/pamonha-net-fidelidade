/* ==========================================================================
   ROUTES/ADMIN-EXTRA.JS
   Rotas novas do admin, além das que já existem em routes/admin.js:
     DELETE /api/admin/clients/:id/history  — apaga histórico de selos/resgates
     GET    /api/admin/messages             — lista mensagens enviadas
     POST   /api/admin/messages             — cria mensagem (global/individual)
     DELETE /api/admin/messages/:id         — apaga uma mensagem

   Este arquivo é montado em server.js com o MESMO prefixo "/api/admin"
   que o routes/admin.js já existente — veja as instruções de integração
   enviadas junto com este código.
   ========================================================================== */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const Stamp = require('../models/Stamp');
const Redemption = require('../models/Redemption');
const Message = require('../models/Message');
const User = require('../models/User');

function getUserId(req) {
  return (req.user && (req.user.id || req.user._id)) || req.userId;
}

// ---------------------------------------------------------------------
// DELETE /api/admin/clients/:id/history
// Apaga todo o histórico de selos (Stamp) e resgates (Redemption) de um
// cliente. O cartão do cliente (contagem atual de selos) não é alterado
// por aqui — para isso existe a rota de "zerar cartão" já existente.
// ---------------------------------------------------------------------
router.delete('/clients/:id/history', auth, adminOnly, async (req, res) => {
  try {
    const clientId = req.params.id;

    const client = await User.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: 'Cliente não encontrado.' });
    }

    await Promise.all([
      Stamp.deleteMany({ client: clientId }),
      Redemption.deleteMany({ client: clientId })
    ]);

    res.json({ message: 'Histórico apagado com sucesso.' });
  } catch (err) {
    res.status(500).json({ message: 'Não foi possível apagar o histórico agora.' });
  }
});

// ---------------------------------------------------------------------
// GET /api/admin/messages — lista todas as mensagens (globais e individuais)
// ---------------------------------------------------------------------
router.get('/messages', auth, adminOnly, async (req, res) => {
  try {
    const messages = await Message.find({})
      .sort({ createdAt: -1 })
      .populate('client', 'name')
      .lean();

    const result = messages.map((m) => ({
      _id: m._id,
      title: m.title,
      body: m.body,
      scope: m.scope,
      clientName: m.client ? m.client.name : null,
      createdAt: m.createdAt
    }));

    res.json({ messages: result });
  } catch (err) {
    res.status(500).json({ message: 'Não foi possível carregar as mensagens agora.' });
  }
});

// ---------------------------------------------------------------------
// POST /api/admin/messages — cria mensagem global ou para um cliente
// ---------------------------------------------------------------------
router.post('/messages', auth, adminOnly, async (req, res) => {
  try {
    const title = (req.body.title || '').trim();
    const body = (req.body.body || '').trim();
    const scope = req.body.scope === 'individual' ? 'individual' : 'global';
    const clientId = req.body.clientId;

    if (!title || !body) {
      return res.status(400).json({ message: 'Preencha o título e a mensagem.' });
    }
    if (scope === 'individual' && !clientId) {
      return res.status(400).json({ message: 'Selecione o cliente que vai receber a mensagem.' });
    }

    const created = await Message.create({
      title,
      body,
      scope,
      client: scope === 'individual' ? clientId : null,
      createdBy: getUserId(req)
    });

    res.status(201).json({ message: 'Mensagem enviada.', id: created._id });
  } catch (err) {
    res.status(500).json({ message: 'Não foi possível enviar a mensagem agora.' });
  }
});

// ---------------------------------------------------------------------
// DELETE /api/admin/messages/:id — apaga uma mensagem específica
// ---------------------------------------------------------------------
router.delete('/messages/:id', auth, adminOnly, async (req, res) => {
  try {
    const deleted = await Message.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Mensagem não encontrada.' });
    }
    res.json({ message: 'Mensagem apagada.' });
  } catch (err) {
    res.status(500).json({ message: 'Não foi possível apagar a mensagem agora.' });
  }
});

module.exports = router;
