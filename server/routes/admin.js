// routes/admin.js
// Rotas administrativas. Todas protegidas por auth + adminOnly (dupla verificação).
// Escopo: gestão de clientes, scan QR, notificações, feedbacks e exclusão de históricos.

const express = require('express');
const User = require('../models/User');
const StampHistory = require('../models/StampHistory');
const Notification = require('../models/Notification');
const Feedback = require('../models/Feedback');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const { verifyQrToken } = require('./qr');

const router = express.Router();
router.use(auth, adminOnly);

// GET /api/admin/clients?search=&sort=name|stamps&page=1&limit=20
router.get('/clients', async (req, res) => {
  try {
    const { search = '', sort = 'name', page = 1, limit = 20 } = req.query;

    const query = { role: 'client' };
    if (search.trim()) {
      const digitsOnly = search.replace(/\D/g, '');
      query.$or = [{ fullName: { $regex: search.trim(), $options: 'i' } }];
      if (digitsOnly) {
        query.$or.push({ phone: { $regex: digitsOnly } });
      }
    }

    const sortMap = {
      name: { fullName: 1 },
      stamps: { stamps: -1 },
    };
    const sortOption = sortMap[sort] || sortMap.name;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const [clients, total] = await Promise.all([
      User.find(query)
        .select('fullName phone stamps createdAt')
        .sort(sortOption)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      User.countDocuments(query),
    ]);

    res.json({
      clients,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível carregar a lista de clientes.' });
  }
});

// GET /api/admin/clients/:id
router.get('/clients/:id', async (req, res) => {
  try {
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    const history = await StampHistory.find({ userId: client._id }).sort({ createdAt: -1 });
    res.json({ client, history });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível carregar o cliente.' });
  }
});

// POST /api/admin/clients/:id/stamps { action: "add" | "remove" }
router.post('/clients/:id/stamps', async (req, res) => {
  try {
    const { action } = req.body;
    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({ error: 'Ação inválida. Use "add" ou "remove".' });
    }

    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    if (action === 'add') {
      if (client.stamps >= 10) {
        return res.status(400).json({ error: 'O cartão deste cliente já está completo (10/10).' });
      }
      client.stamps += 1;
    } else {
      if (client.stamps <= 0) {
        return res.status(400).json({ error: 'Este cliente não possui carimbos para remover.' });
      }
      client.stamps -= 1;
    }

    await client.save();
    await StampHistory.create({
      userId: client._id,
      action,
      adminId: req.user.id,
      source: 'manual',
    });

    res.json({ client });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível atualizar o carimbo.' });
  }
});

// POST /api/admin/clients/:id/reset
router.post('/clients/:id/reset', async (req, res) => {
  try {
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    client.stamps = 0;
    await client.save();
    await StampHistory.create({
      userId: client._id,
      action: 'remove',
      adminId: req.user.id,
      source: 'redeem-reset',
    });

    res.json({ client });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível resetar o cartão.' });
  }
});

// DELETE /api/admin/clients/:id/history — Exclui histórico de selos do cliente
router.delete('/clients/:id/history', async (req, res) => {
  try {
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    await StampHistory.deleteMany({ userId: client._id });
    res.json({ message: 'Histórico de carimbos apagado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao apagar histórico de carimbos.' });
  }
});

// POST /api/admin/scan-qr { qrToken }
router.post('/scan-qr', async (req, res) => {
  try {
    const { qrToken } = req.body;
    if (!qrToken) return res.status(400).json({ error: 'Nenhum QR Code informado.' });

    let userId;
    try {
      userId = verifyQrToken(qrToken);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const client = await User.findOne({ _id: userId, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente do QR Code não foi encontrado.' });
    if (client.stamps >= 10) {
      return res.status(400).json({ error: `O cartão de ${client.fullName} já está completo (10/10).` });
    }

    client.stamps += 1;
    await client.save();
    await StampHistory.create({
      userId: client._id,
      action: 'add',
      adminId: req.user.id,
      source: 'qr-scan',
    });

    res.json({
      message: `Carimbo adicionado para ${client.fullName}!`,
      client,
    });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível processar o QR Code.' });
  }
});

// NOTIFICATIONS ADMIN
// POST /api/admin/notifications
router.post('/notifications', async (req, res) => {
  try {
    const { title, message, userId } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Título e mensagem são obrigatórios.' });
    const notif = await Notification.create({
      title: title.trim(),
      message: message.trim(),
      userId: userId || null,
      broadcast: !userId,
    });
    res.status(201).json({ notification: notif });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar notificação.' });
  }
});

// GET /api/admin/notifications
router.get('/notifications', async (req, res) => {
  try {
    const list = await Notification.find().sort({ createdAt: -1 }).populate('userId', 'fullName phone');
    res.json({ notifications: list });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar notificações.' });
  }
});

// DELETE /api/admin/notifications/:id
router.delete('/notifications/:id', async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: 'Notificação removida.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover notificação.' });
  }
});

// DELETE /api/admin/notifications — limpa notificações em massa
router.delete('/notifications', async (req, res) => {
  try {
    const { scope } = req.query; // 'all', 'broadcast', 'individual'
    const filter = {};
    if (scope === 'broadcast') filter.broadcast = true;
    if (scope === 'individual') filter.broadcast = false;
    await Notification.deleteMany(filter);
    res.json({ message: 'Notificações removidas com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao limpar notificações.' });
  }
});

// FEEDBACK ADMIN
// GET /api/admin/feedbacks
router.get('/feedbacks', async (req, res) => {
  try {
    const list = await Feedback.find().sort({ createdAt: -1 }).populate('userId', 'fullName phone');
    res.json({ feedbacks: list });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar avaliações.' });
  }
});

// DELETE /api/admin/feedbacks/:id
router.delete('/feedbacks/:id', async (req, res) => {
  try {
    await Feedback.findByIdAndDelete(req.params.id);
    res.json({ message: 'Avaliação removida.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover avaliação.' });
  }
});

module.exports = router;
