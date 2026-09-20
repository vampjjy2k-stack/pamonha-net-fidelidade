// routes/admin.js
// Rotas administrativas. Todas protegidas por auth + adminOnly (dupla verificação).
// Escopo: gestão de clientes, scan QR, notificações, feedbacks e exclusão de históricos.

const express = require('express');
const User = require('../models/User');
const StampHistory = require('../models/StampHistory');
const Notification = require('../models/Notification');
const NotificationRead = require('../models/NotificationRead');
const Feedback = require('../models/Feedback');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const { verifyQrToken } = require('./qr');
const { sendPushToUser } = require('../utils/webPush');
const liveEvents = require('../utils/events');

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

    const [clientsRaw, total] = await Promise.all([
      User.find(query)
        .select('fullName phone email stamps completedCards lastStampAt createdAt')
        .sort(sortOption)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      User.countDocuments(query),
    ]);

    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
    const clients = clientsRaw.map((c) => {
      const referenceDate = c.lastStampAt || c.createdAt;
      const weeksInactive = referenceDate
        ? Math.floor((Date.now() - new Date(referenceDate).getTime()) / MS_PER_WEEK)
        : null;
      return {
        ...c.toObject(),
        weeksInactive,
        isInactive: weeksInactive !== null && weeksInactive >= 2,
      };
    });

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
      client.lastStampAt = new Date();
      await client.save();
      await StampHistory.create({
        userId: client._id,
        action: 'add',
        adminId: req.user.id,
        source: 'manual',
      });
    } else {
      if (client.stamps <= 0) {
        return res.status(400).json({ error: 'Este cliente não possui carimbos para remover.' });
      }
      client.stamps -= 1;
      await client.save();
      // Correção de engano: em vez de registrar uma "remoção" (que apareceria pro cliente como um
      // aviso estranho), apagamos o carimbo mais recente do histórico. Fica como se nunca tivesse
      // acontecido — sem gerar susto ou notificação para o cliente.
      const lastAdd = await StampHistory.findOne({ userId: client._id, action: 'add' }).sort({ createdAt: -1 });
      if (lastAdd) await StampHistory.deleteOne({ _id: lastAdd._id });
    }

    res.json({ client });
    liveEvents.sendToUser(client._id, 'stamps-update', { stamps: client.stamps, completedCards: client.completedCards || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível atualizar o carimbo.' });
  }
});

// POST /api/admin/clients/:id/stamps/set { target } — o "hub" de carimbo: define o número final
// de selos de uma vez (0 a 10), em vez de precisar tocar +1/-1 várias vezes. Se o alvo for maior
// que o atual, registra os carimbos novos; se for menor, desfaz os mais recentes (mesma lógica
// silenciosa do endpoint acima — sem gerar aviso de "carimbo removido" pro cliente).
router.post('/clients/:id/stamps/set', async (req, res) => {
  try {
    const target = Number(req.body.target);
    if (!Number.isInteger(target) || target < 0 || target > 10) {
      return res.status(400).json({ error: 'Valor inválido. Escolha de 0 a 10 selos.' });
    }

    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const delta = target - client.stamps;
    if (delta > 0) {
      const now = Date.now();
      const entries = Array.from({ length: delta }, (_, i) => ({
        userId: client._id,
        action: 'add',
        adminId: req.user.id,
        source: 'manual',
        createdAt: new Date(now + i), // ms distintos, só para manter a ordem estável no histórico
      }));
      await StampHistory.insertMany(entries);
      client.lastStampAt = new Date();
    } else if (delta < 0) {
      const toRemove = await StampHistory.find({ userId: client._id, action: 'add' })
        .sort({ createdAt: -1 })
        .limit(-delta);
      await StampHistory.deleteMany({ _id: { $in: toRemove.map((d) => d._id) } });
    }

    client.stamps = target;
    await client.save();

    res.json({ client });
    liveEvents.sendToUser(client._id, 'stamps-update', { stamps: client.stamps, completedCards: client.completedCards || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível atualizar o cartão.' });
  }
});

// POST /api/admin/clients/:id/reset
router.post('/clients/:id/reset', async (req, res) => {
  try {
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // Reset a partir de um cartão completo conta como 1 cartão fechado no ranking.
    if (client.stamps >= 10) {
      client.completedCards = (client.completedCards || 0) + 1;
    }
    client.stamps = 0;
    await client.save();
    // O histórico recente é por ciclo: ao resetar, limpa tudo para o próximo cartão começar do zero.
    await StampHistory.deleteMany({ userId: client._id });

    res.json({ client });
    liveEvents.sendToUser(client._id, 'stamps-update', { stamps: client.stamps, completedCards: client.completedCards || 0 });
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

// POST /api/admin/scan-qr { qrToken } — resolve o QR Code do cliente (sem carimbar ainda).
// O carimbo em si acontece depois, quando o admin confirma no "hub" do cartão — assim dá pra
// carimbar várias compras de uma vez, em vez de precisar escanear de novo a cada carimbo.
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

    res.json({ message: `Cartão de ${client.fullName} encontrado.`, client });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível processar o QR Code.' });
  }
});

// NOTIFICATIONS ADMIN
// POST /api/admin/notifications { title, message, userId? }
// Salva o aviso no app (aba "Avisos") E dispara uma notificação push real para o celular do cliente,
// caso ele tenha ativado notificações no dispositivo.
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

    const pushResult = await sendPushToUser({
      userId: userId || null,
      title: title.trim(),
      body: message.trim(),
    });

    res.status(201).json({ notification: notif, push: pushResult });

    if (notif.broadcast) {
      liveEvents.broadcast('notification', { id: notif._id, title: notif.title });
    } else {
      liveEvents.sendToUser(notif.userId, 'notification', { id: notif._id, title: notif.title });
    }
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

// GET /api/admin/notifications/:id/views — quem já visualizou este aviso (sem precisar "marcar como lida")
router.get('/notifications/:id/views', async (req, res) => {
  try {
    const notif = await Notification.findById(req.params.id);
    if (!notif) return res.status(404).json({ error: 'Notificação não encontrada.' });

    const totalClients = notif.broadcast
      ? await User.countDocuments({ role: 'client' })
      : 1;

    const reads = await NotificationRead.find({ notificationId: notif._id })
      .populate('userId', 'fullName phone')
      .sort({ viewedAt: -1 });

    res.json({
      totalRecipients: totalClients,
      viewedCount: reads.length,
      viewers: reads.map((r) => ({ fullName: r.userId?.fullName, phone: r.userId?.phone, viewedAt: r.viewedAt })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível carregar as visualizações.' });
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

// POST /api/admin/leaderboard/reset — zera a contagem de cartões completados de todos os clientes
router.post('/leaderboard/reset', async (req, res) => {
  try {
    await User.updateMany({ role: 'client' }, { $set: { completedCards: 0 } });
    res.json({ message: 'Ranking reiniciado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível reiniciar o ranking.' });
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
