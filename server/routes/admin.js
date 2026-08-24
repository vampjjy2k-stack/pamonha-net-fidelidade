// routes/admin.js
// Rotas administrativas de clientes e carimbos. Todas protegidas por auth + adminOnly.
const express = require('express');
const User = require('../models/User');
const Redemption = require('../models/Redemption');
const StampHistory = require('../models/Stamp');
const Reservation = require('../models/Reservation');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const { verifyQrToken } = require('./qr');
const { calcularSegmento } = require('../utils/segmentation');
const { recalcularTodosOsSegmentos } = require('../jobs/recalcularSegmentos');

const router = express.Router();

router.use(auth, adminOnly);

const SELOS = {
  premium: 'Cliente Premium',
  regular: 'Cliente Regular',
  churn_risk: 'Risco de Churn',
  novo: 'Cliente Novo',
};

// GET /api/admin/stats — indicadores para a Visão Geral
router.get('/stats', async (req, res) => {
  try {
    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);

    const [activeClients, stampsToday, pendingReservations, closeToReward, recentActivityRaw] = await Promise.all([
      User.countDocuments({ role: 'client' }),
      StampHistory.countDocuments({ action: 'add', createdAt: { $gte: inicioDoDia } }),
      Reservation.countDocuments({ status: 'pending' }),
      User.countDocuments({ role: 'client', stamps: { $gte: 8 } }),
      StampHistory.find().sort({ createdAt: -1 }).limit(6).populate('userId', 'fullName'),
    ]);

    const recentActivity = recentActivityRaw.map((s) => ({
      clientName: s.userId?.fullName || 'Cliente removido',
      action: s.action,
      source: s.source,
      product: s.product,
      createdAt: s.createdAt,
    }));

    res.json({ activeClients, stampsToday, pendingReservations, closeToReward, recentActivity });
  } catch (err) {
    console.error('Erro ao carregar estatísticas:', err);
    res.status(500).json({ error: 'Não foi possível carregar as estatísticas.' });
  }
});

// GET /api/admin/clients?search=&sort=name|stamps&page=1&limit=20
router.get('/clients', async (req, res) => {
  try {
    const { search = '', sort = 'name', page = 1, limit = 20 } = req.query;

    const query = { role: 'client' };
    if (search.trim()) {
      const digitsOnly = search.replace(/\D/g, '');
      query.$or = [{ fullName: { $regex: search.trim(), $options: 'i' } }];
      if (digitsOnly) query.$or.push({ phone: { $regex: digitsOnly } });
    }

    const sortMap = { name: { fullName: 1 }, stamps: { stamps: -1 } };
    const sortOption = sortMap[sort] || sortMap.name;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const [clients, total] = await Promise.all([
      User.find(query)
        .select('fullName phone stamps createdAt segment totalSpentCents lastVisitAt')
        .sort(sortOption)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      User.countDocuments(query),
    ]);

    res.json({
      clients: clients.map((c) => ({ ...c.toObject(), segmentLabel: SELOS[c.segment] || SELOS.novo })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error('Erro ao listar clientes:', err);
    res.status(500).json({ error: 'Não foi possível carregar a lista de clientes.' });
  }
});

// GET /api/admin/clients/:id — perfil completo com métricas de CRM calculadas de verdade
router.get('/clients/:id', async (req, res) => {
  try {
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const [history, preferenciasAgg, { segment, score, stats }] = await Promise.all([
      Redemption.find({ userId: client._id }).sort({ createdAt: -1 }),
      StampHistory.aggregate([
        { $match: { userId: client._id, action: 'add', product: { $ne: null } } },
        { $group: { _id: '$product', total: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 3 },
      ]),
      calcularSegmento(client._id, client.lastVisitAt, client.totalSpentCents),
    ]);

    res.json({
      client: {
        ...client.toObject(),
        segmentLabel: SELOS[segment] || SELOS.novo,
        segment,
        segmentScore: score,
      },
      metrics: {
        totalSpentCents: client.totalSpentCents,
        lastVisitAt: client.lastVisitAt,
        visitFrequencyPerWeek: stats.visitas30d ? Number((stats.visitas30d / 4.3).toFixed(1)) : 0,
        daysSinceLastVisit: stats.diasSemVisita,
        topProducts: preferenciasAgg.map((p) => ({ product: p._id, count: p.total })),
      },
      history,
    });
  } catch (err) {
    console.error('Erro ao buscar cliente:', err);
    res.status(500).json({ error: 'Não foi possível carregar o cliente.' });
  }
});

// PATCH /api/admin/clients/:id — editar perfil (nome/telefone)
router.patch('/clients/:id', async (req, res) => {
  try {
    const { fullName, phone } = req.body;
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    if (fullName && fullName.trim().length >= 3) client.fullName = fullName.trim();
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 10) client.phone = digits;
    }
    await client.save();
    res.json({ client });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Já existe um cliente com esse telefone.' });
    console.error('Erro ao editar cliente:', err);
    res.status(500).json({ error: 'Não foi possível editar o cliente.' });
  }
});

// DELETE /api/admin/clients/:id/historico — apaga resgates e histórico de carimbos.
// Os carimbos ATUAIS do cartão (User.stamps) não são afetados — só o histórico.
router.delete('/clients/:id/historico', async (req, res) => {
  try {
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    await Promise.all([
      Redemption.deleteMany({ userId: client._id }),
      StampHistory.deleteMany({ userId: client._id }),
    ]);
    client.totalSpentCents = 0;
    client.lastVisitAt = null;
    client.segment = 'novo';
    await client.save();

    res.json({ message: `Histórico de ${client.fullName} excluído.` });
  } catch (err) {
    console.error('Erro ao excluir histórico:', err);
    res.status(500).json({ error: 'Não foi possível excluir o histórico.' });
  }
});

// POST /api/admin/clients/:id/stamps  { action, product?, amountCents? }
router.post('/clients/:id/stamps', async (req, res) => {
  try {
    const { action, product = null, amountCents = 0 } = req.body;
    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({ error: 'Ação inválida. Use "add" ou "remove".' });
    }

    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    if (action === 'add') {
      if (client.stamps >= 10) return res.status(400).json({ error: 'O cartão já está completo (10/10).' });
      client.stamps += 1;
      client.lastVisitAt = new Date();
      if (amountCents > 0) client.totalSpentCents += Number(amountCents);
    } else {
      if (client.stamps <= 0) return res.status(400).json({ error: 'Este cliente não possui carimbos para remover.' });
      client.stamps -= 1;
    }

    await client.save();
    await StampHistory.create({
      userId: client._id,
      action,
      adminId: req.user.id,
      source: 'manual',
      product: action === 'add' ? product : null,
      amountCents: action === 'add' ? amountCents : 0,
    });

    res.json({ client });
  } catch (err) {
    console.error('Erro ao atualizar carimbo:', err);
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
    await StampHistory.create({ userId: client._id, action: 'remove', adminId: req.user.id, source: 'redeem-reset' });

    res.json({ client });
  } catch (err) {
    console.error('Erro ao resetar cartão:', err);
    res.status(500).json({ error: 'Não foi possível resetar o cartão.' });
  }
});

// POST /api/admin/clients/:id/redeem  { product }
const VALID_PRODUCTS = ['Pamonha Doce', 'Pamonha Salgada', 'Pamonha Recheada', 'Curau'];

router.post('/clients/:id/redeem', async (req, res) => {
  try {
    const { product } = req.body;
    if (!VALID_PRODUCTS.includes(product)) return res.status(400).json({ error: 'Produto inválido.' });

    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    if (client.stamps < 10) return res.status(400).json({ error: 'Este cliente ainda não completou os 10 carimbos.' });

    const redemption = await Redemption.create({ userId: client._id, product, status: 'confirmed' });

    client.stamps = 0;
    await client.save();
    await StampHistory.create({ userId: client._id, action: 'remove', adminId: req.user.id, source: 'redeem-reset' });

    res.json({ redemption, client });
  } catch (err) {
    console.error('Erro ao confirmar resgate:', err);
    res.status(500).json({ error: 'Não foi possível confirmar o resgate.' });
  }
});

// POST /api/admin/scan-qr  { qrToken }
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
    if (client.stamps >= 10) return res.status(400).json({ error: `O cartão de ${client.fullName} já está completo (10/10).` });

    client.stamps += 1;
    client.lastVisitAt = new Date();
    await client.save();
    await StampHistory.create({ userId: client._id, action: 'add', adminId: req.user.id, source: 'qr-scan' });

    res.json({ message: `Carimbo adicionado para ${client.fullName}!`, client });
  } catch (err) {
    console.error('Erro ao escanear QR Code:', err);
    res.status(500).json({ error: 'Não foi possível processar o QR Code.' });
  }
});

// POST /api/admin/recalcular-segmentos — gatilho manual do job diário (útil para ver o efeito na hora)
router.post('/recalcular-segmentos', async (req, res) => {
  try {
    const resultado = await recalcularTodosOsSegmentos();
    res.json(resultado);
  } catch (err) {
    console.error('Erro ao recalcular segmentos:', err);
    res.status(500).json({ error: 'Não foi possível recalcular os segmentos.' });
  }
});

module.exports = router;
