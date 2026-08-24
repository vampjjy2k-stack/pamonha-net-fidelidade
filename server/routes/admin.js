// routes/admin.js
// Rotas administrativas. Todas protegidas por auth + adminOnly (dupla verificação).
const express = require('express');
const User = require('../models/User');
const Redemption = require('../models/Redemption');
const StampHistory = require('../models/Stamp');
const SurveyResponse = require('../models/SurveyResponse');
const Reservation = require('../models/Reservation');
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
        .select('fullName phone stamps createdAt segment totalSpent lastVisitAt')
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
    console.error('Erro ao listar clientes:', err);
    res.status(500).json({ error: 'Não foi possível carregar a lista de clientes.' });
  }
});

// GET /api/admin/clients/:id — perfil completo + métricas
router.get('/clients/:id', async (req, res) => {
  try {
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const [history, stampHistory, surveyResponses, reservations] = await Promise.all([
      Redemption.find({ userId: client._id, deletedAt: { $exists: false } }).sort({ createdAt: -1 }),
      StampHistory.find({ userId: client._id, deletedAt: { $exists: false } }).sort({ createdAt: -1 }).limit(50),
      SurveyResponse.find({ userId: client._id }).sort({ createdAt: -1 }).limit(10),
      Reservation.find({ userId: client._id })
        .populate('productId', 'name priceCents')
        .sort({ createdAt: -1 })
        .limit(10),
    ]);

    // Preferências de produto derivadas do histórico de resgates
    const productCounts = {};
    history.forEach((h) => {
      productCounts[h.product] = (productCounts[h.product] || 0) + 1;
    });
    const preferences = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([product, count]) => ({ product, count }));

    // Frequência: visitas nos últimos 30 dias (baseado em stampHistory)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const visitsLast30Days = stampHistory.filter(
      (s) => s.action === 'add' && s.source !== 'history-delete' && s.createdAt >= thirtyDaysAgo
    ).length;

    res.json({
      client,
      history,
      stampHistory,
      surveyResponses,
      reservations,
      preferences,
      visitsLast30Days,
    });
  } catch (err) {
    console.error('Erro ao buscar cliente:', err);
    res.status(500).json({ error: 'Não foi possível carregar o cliente.' });
  }
});

// PATCH /api/admin/clients/:id — editar nome/telefone
router.patch('/clients/:id', async (req, res) => {
  try {
    const { fullName, phone } = req.body;
    const updates = {};
    if (fullName !== undefined) {
      const nome = String(fullName).trim();
      if (nome.length < 3) return res.status(400).json({ error: 'O nome precisa ter pelo menos 3 caracteres.' });
      updates.fullName = nome;
    }
    if (phone !== undefined) {
      const telefone = String(phone).replace(/\D/g, '');
      if (telefone.length < 10 || telefone.length > 11) return res.status(400).json({ error: 'Telefone inválido.' });
      updates.phone = telefone;
    }

    const client = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'client' },
      updates,
      { new: true }
    );
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    res.json({ client });
  } catch (err) {
    console.error('Erro ao editar cliente:', err);
    res.status(500).json({ error: 'Não foi possível atualizar o cliente.' });
  }
});

// DELETE /api/admin/clients/:id/historico — soft delete de Redemptions + StampHistory
router.delete('/clients/:id/historico', async (req, res) => {
  try {
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    // Soft delete: marcar deletedAt nos documentos
    const now = new Date();
    await Redemption.updateMany(
      { userId: client._id, deletedAt: { $exists: false } },
      { $set: { deletedAt: now, deletedBy: req.user.id } }
    );
    await StampHistory.updateMany(
      { userId: client._id, deletedAt: { $exists: false } },
      { $set: { deletedAt: now, deletedBy: req.user.id } }
    );

    // Log de auditoria (usando a própria coleção stampHistory como log)
    await StampHistory.create({
      userId: client._id,
      action: 'add',
      adminId: req.user.id,
      source: 'history-delete',
      note: `Histórico apagado por admin em ${now.toISOString()}`,
    });

    res.json({ message: 'Histórico apagado com sucesso.' });
  } catch (err) {
    console.error('Erro ao apagar histórico:', err);
    res.status(500).json({ error: 'Não foi possível apagar o histórico.' });
  }
});

// POST /api/admin/clients/:id/stamps  { action: "add" | "remove", position }
router.post('/clients/:id/stamps', async (req, res) => {
  try {
    const { action } = req.body;
    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({ error: 'Ação inválida. Use "add" ou "remove".' });
    }

    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    if (action === 'add') {
      if (client.stamps >= 10) {
        return res.status(400).json({ error: 'O cartão deste cliente já está completo (10/10).' });
      }
      client.stamps += 1;
      // Atualiza métricas de CRM
      client.lastVisitAt = new Date();
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
    console.error('Erro ao atualizar carimbo:', err);
    res.status(500).json({ error: 'Não foi possível atualizar o carimbo.' });
  }
});

// POST /api/admin/clients/:id/reset
router.post('/clients/:id/reset', async (req, res) => {
  try {
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

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
    console.error('Erro ao resetar cartão:', err);
    res.status(500).json({ error: 'Não foi possível resetar o cartão.' });
  }
});

// POST /api/admin/clients/:id/redeem  { product }
const VALID_PRODUCTS = ['Pamonha Doce', 'Pamonha Salgada', 'Pamonha Recheada', 'Curau'];

router.post('/clients/:id/redeem', async (req, res) => {
  try {
    const { product } = req.body;
    if (!VALID_PRODUCTS.includes(product)) {
      return res.status(400).json({ error: 'Produto inválido.' });
    }

    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    if (client.stamps < 10) {
      return res.status(400).json({ error: 'Este cliente ainda não completou os 10 carimbos.' });
    }

    const redemption = await Redemption.create({
      userId: client._id,
      product,
      status: 'confirmed',
    });

    client.stamps = 0;
    client.lastVisitAt = new Date();
    await client.save();
    await StampHistory.create({
      userId: client._id,
      action: 'remove',
      adminId: req.user.id,
      source: 'redeem-reset',
    });

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
    if (!qrToken) {
      return res.status(400).json({ error: 'Nenhum QR Code informado.' });
    }

    let userId;
    try {
      userId = verifyQrToken(qrToken);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const client = await User.findOne({ _id: userId, role: 'client' });
    if (!client) {
      return res.status(404).json({ error: 'Cliente do QR Code não foi encontrado.' });
    }
    if (client.stamps >= 10) {
      return res.status(400).json({ error: `O cartão de ${client.fullName} já está completo (10/10).` });
    }

    client.stamps += 1;
    client.lastVisitAt = new Date();
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
    console.error('Erro ao escanear QR Code:', err);
    res.status(500).json({ error: 'Não foi possível processar o QR Code.' });
  }
});

// GET /api/admin/surveys — respostas recentes + médias
router.get('/surveys', async (req, res) => {
  try {
    const responses = await SurveyResponse.find()
      .populate('userId', 'fullName phone')
      .sort({ createdAt: -1 })
      .limit(50);

    const stats = await SurveyResponse.aggregate([
      {
        $group: {
          _id: null,
          avgExperience: { $avg: '$answers.experience' },
          avgService: { $avg: '$answers.service' },
          avgRecommend: { $avg: '$answers.recommend' },
          total: { $sum: 1 },
        },
      },
    ]);

    res.json({
      responses,
      averages: stats[0] || { avgExperience: 0, avgService: 0, avgRecommend: 0, total: 0 },
    });
  } catch (err) {
    console.error('Erro ao buscar pesquisas:', err);
    res.status(500).json({ error: 'Não foi possível carregar as pesquisas.' });
  }
});

module.exports = router;
