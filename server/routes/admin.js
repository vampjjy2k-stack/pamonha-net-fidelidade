// routes/admin.js
// Rotas administrativas. Todas protegidas por auth + adminOnly (dupla verificação).
// Escopo: gestão de clientes, scan QR, notificações, feedbacks e exclusão de históricos.

const express = require('express');
const User = require('../models/User');
const StampHistory = require('../models/StampHistory');
const Notification = require('../models/Notification');
const NotificationRead = require('../models/NotificationRead');
const Feedback = require('../models/Feedback');
const Produto = require('../models/Produto');
const Local = require('../models/Local');
const Venda = require('../models/Venda');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const { verifyQrToken } = require('./qr');
const { sendPushToUser } = require('../utils/webPush');
const liveEvents = require('../utils/events');
const { matchLocal } = require('../utils/geo');

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

// ============================================================================
// PRODUTOS — catálogo usado no hub de vendas (aberto ao escanear o QR do cliente)
// ============================================================================

// GET /api/admin/produtos?includeInactive=1
router.get('/produtos', async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const query = includeInactive ? {} : { active: true };
    const produtos = await Produto.find(query).sort({ name: 1 });
    res.json({ produtos });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível carregar os produtos.' });
  }
});

// POST /api/admin/produtos { name, price, imageUrl? }
router.post('/produtos', async (req, res) => {
  try {
    const { name, price, costPrice, imageUrl } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'O nome do produto é obrigatório.' });
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: 'Informe um preço válido.' });
    }
    const numericCost = costPrice !== undefined ? Number(costPrice) : 0;
    if (!Number.isFinite(numericCost) || numericCost < 0) {
      return res.status(400).json({ error: 'Informe um custo de produção válido.' });
    }
    const produto = await Produto.create({
      name: String(name).trim(),
      price: numericPrice,
      costPrice: numericCost,
      imageUrl: imageUrl || null,
      createdBy: req.user.id,
    });
    res.status(201).json({ produto });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível cadastrar o produto.' });
  }
});

// PUT /api/admin/produtos/:id { name?, price?, costPrice?, imageUrl?, active? }
router.put('/produtos/:id', async (req, res) => {
  try {
    const produto = await Produto.findById(req.params.id);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });

    const { name, price, costPrice, imageUrl, active } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'O nome do produto é obrigatório.' });
      produto.name = String(name).trim();
    }
    if (price !== undefined) {
      const numericPrice = Number(price);
      if (!Number.isFinite(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ error: 'Informe um preço válido.' });
      }
      produto.price = numericPrice;
    }
    if (costPrice !== undefined) {
      const numericCost = Number(costPrice);
      if (!Number.isFinite(numericCost) || numericCost < 0) {
        return res.status(400).json({ error: 'Informe um custo de produção válido.' });
      }
      produto.costPrice = numericCost;
    }
    if (imageUrl !== undefined) produto.imageUrl = imageUrl;
    if (active !== undefined) produto.active = Boolean(active);

    await produto.save();
    res.json({ produto });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível atualizar o produto.' });
  }
});

// DELETE /api/admin/produtos/:id
router.delete('/produtos/:id', async (req, res) => {
  try {
    const produto = await Produto.findByIdAndDelete(req.params.id);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });
    res.json({ message: 'Produto removido com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível remover o produto.' });
  }
});

// ============================================================================
// LOCAIS — feiras/pontos cadastrados pelo admin, usados para casar o GPS da venda
// ============================================================================

// GET /api/admin/locais?includeInactive=1
router.get('/locais', async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const query = includeInactive ? {} : { active: true };
    const locais = await Local.find(query).sort({ name: 1 });
    res.json({ locais });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível carregar os locais.' });
  }
});

// POST /api/admin/locais { name, lat, lng, radiusMeters? }
router.post('/locais', async (req, res) => {
  try {
    const { name, lat, lng, radiusMeters } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'O nome do local é obrigatório.' });
    const numericLat = Number(lat);
    const numericLng = Number(lng);
    if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng)) {
      return res.status(400).json({ error: 'Coordenadas inválidas para este local.' });
    }
    const local = await Local.create({
      name: String(name).trim(),
      lat: numericLat,
      lng: numericLng,
      radiusMeters: radiusMeters !== undefined ? Number(radiusMeters) : undefined,
      createdBy: req.user.id,
    });
    res.status(201).json({ local });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível cadastrar o local.' });
  }
});

// PUT /api/admin/locais/:id { name?, lat?, lng?, radiusMeters?, active? }
router.put('/locais/:id', async (req, res) => {
  try {
    const local = await Local.findById(req.params.id);
    if (!local) return res.status(404).json({ error: 'Local não encontrado.' });

    const { name, lat, lng, radiusMeters, active } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'O nome do local é obrigatório.' });
      local.name = String(name).trim();
    }
    if (lat !== undefined) local.lat = Number(lat);
    if (lng !== undefined) local.lng = Number(lng);
    if (radiusMeters !== undefined) local.radiusMeters = Number(radiusMeters);
    if (active !== undefined) local.active = Boolean(active);

    await local.save();
    res.json({ local });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível atualizar o local.' });
  }
});

// DELETE /api/admin/locais/:id
// Não apaga o histórico de vendas já associado a este local — as vendas antigas mantêm
// o nome salvo em "localName" (snapshot), então os gráficos passados continuam corretos.
router.delete('/locais/:id', async (req, res) => {
  try {
    const local = await Local.findByIdAndDelete(req.params.id);
    if (!local) return res.status(404).json({ error: 'Local não encontrado.' });
    res.json({ message: 'Local removido com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível remover o local.' });
  }
});

// ============================================================================
// VENDAS — o "hub de vendas", aberto depois do /scan-qr. Registra a venda,
// dá 1 selo por unidade de produto, e casa o GPS com um Local cadastrado.
// ============================================================================

// POST /api/admin/vendas
// Body: { clientId, items: [{ produtoId, quantity }], lat?, lng?, localId? }
// - Se "localId" for enviado, usa esse local direto (caso do admin escolher manualmente
//   depois de um "local não identificado").
// - Senão, tenta casar por GPS (lat/lng) com o Local mais próximo dentro do raio.
// - Se não achar nenhum local nem receber localId, a venda é salva com localId null
//   e a resposta traz "needsLocation: true" + os locais mais próximos, para o front
//   perguntar ao admin se quer cadastrar um novo local ou escolher um existente.
router.post('/vendas', async (req, res) => {
  try {
    const { clientId, items, lat, lng, localId } = req.body;

    if (!clientId) return res.status(400).json({ error: 'Cliente não informado.' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos 1 produto.' });
    }

    const client = await User.findOne({ _id: clientId, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // Monta os itens com snapshot de nome/preço e valida quantidades.
    const produtoIds = items.map((i) => i.produtoId);
    const produtos = await Produto.find({ _id: { $in: produtoIds } });
    const produtoMap = new Map(produtos.map((p) => [String(p._id), p]));

    const vendaItems = [];
    let totalValue = 0;
    let totalCost = 0;
    let stampsGiven = 0;

    for (const item of items) {
      const produto = produtoMap.get(String(item.produtoId));
      const quantity = Number(item.quantity);
      if (!produto) return res.status(400).json({ error: 'Um dos produtos selecionados não foi encontrado.' });
      if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ error: `Quantidade inválida para "${produto.name}".` });
      }
      vendaItems.push({
        produtoId: produto._id,
        name: produto.name,
        price: produto.price,
        costPrice: produto.costPrice || 0,
        quantity,
      });
      totalValue += produto.price * quantity;
      totalCost += (produto.costPrice || 0) * quantity;
      stampsGiven += quantity;
    }

    // Resolve o local: escolha manual (localId) tem prioridade sobre o casamento automático por GPS.
    let resolvedLocal = null;
    let nearest = [];
    if (localId) {
      resolvedLocal = await Local.findById(localId);
    } else if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      const locaisAtivos = await Local.find({ active: true });
      const result = matchLocal(Number(lat), Number(lng), locaisAtivos);
      resolvedLocal = result.match;
      nearest = result.nearest.map((n) => ({
        localId: n.local._id,
        name: n.local.name,
        distanceMeters: n.distance,
      }));
    }

    // Aplica os selos ao cliente, respeitando o teto de 10 do cartão.
    const previousStamps = client.stamps;
    const stampsToApply = Math.min(stampsGiven, Math.max(0, 10 - client.stamps));
    if (stampsToApply > 0) {
      client.stamps += stampsToApply;
      client.lastStampAt = new Date();
      await client.save();
    }
    // Esta venda "fechou o cartão" se o cliente cruzou de <10 para exatamente 10 agora.
    const completedCardOnThisSale = previousStamps < 10 && client.stamps === 10;

    const venda = await Venda.create({
      clientId: client._id,
      adminId: req.user.id,
      items: vendaItems,
      totalValue,
      totalCost,
      stampsGiven,
      gps: {
        lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
        lng: Number.isFinite(Number(lng)) ? Number(lng) : null,
      },
      localId: resolvedLocal ? resolvedLocal._id : null,
      localName: resolvedLocal ? resolvedLocal.name : null,
      completedCardOnThisSale,
    });

    if (stampsToApply > 0) {
      const now = Date.now();
      const entries = Array.from({ length: stampsToApply }, (_, i) => ({
        userId: client._id,
        action: 'add',
        adminId: req.user.id,
        source: 'venda',
        vendaId: venda._id,
        createdAt: new Date(now + i),
      }));
      await StampHistory.insertMany(entries);
    }

    const overflow = stampsGiven - stampsToApply; // selos "perdidos" por já ter batido 10/10
    res.status(201).json({
      venda,
      client,
      overflowStamps: overflow,
      needsLocation: !resolvedLocal,
      nearestLocais: !resolvedLocal ? nearest : [],
    });

    liveEvents.sendToUser(client._id, 'stamps-update', { stamps: client.stamps, completedCards: client.completedCards || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível registrar a venda.' });
  }
});

// GET /api/admin/vendas?localId=&from=&to= — listagem simples para auditoria/depuração
router.get('/vendas', async (req, res) => {
  try {
    const { localId, from, to, limit = 50 } = req.query;
    const query = {};
    if (localId) query.localId = localId === 'null' ? null : localId;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    const vendas = await Venda.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .populate('clientId', 'fullName phone');
    res.json({ vendas });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível carregar as vendas.' });
  }
});

// PATCH /api/admin/vendas/:id/local { localId }
// Usado quando uma venda ficou como "local não identificado": o admin escolhe, depois,
// um dos locais cadastrados mais próximos para associar a venda a ele.
router.patch('/vendas/:id/local', async (req, res) => {
  try {
    const { localId } = req.body;
    if (!localId) return res.status(400).json({ error: 'Informe o local.' });
    const local = await Local.findById(localId);
    if (!local) return res.status(404).json({ error: 'Local não encontrado.' });

    const venda = await Venda.findById(req.params.id);
    if (!venda) return res.status(404).json({ error: 'Venda não encontrada.' });

    venda.localId = local._id;
    venda.localName = local.name;
    await venda.save();

    res.json({ venda });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível vincular o local a esta venda.' });
  }
});

// DELETE /api/admin/vendas/:id
// Apaga uma venda lançada por engano: reverte os selos que ela deu (sem deixar o cliente
// com saldo negativo) e remove o rastro dela no histórico de selos.
router.delete('/vendas/:id', async (req, res) => {
  try {
    const venda = await Venda.findById(req.params.id);
    if (!venda) return res.status(404).json({ error: 'Venda não encontrada.' });

    const client = await User.findById(venda.clientId);
    if (client) {
      client.stamps = Math.max(0, client.stamps - venda.stampsGiven);
      await client.save();
    }
    await StampHistory.deleteMany({ vendaId: venda._id });
    await venda.deleteOne();

    res.json({ message: 'Venda removida e selos revertidos.', client });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível remover a venda.' });
  }
});

// ============================================================================
// GRÁFICOS — dados agregados para o painel do admin
// ============================================================================

// GET /api/admin/graficos/satisfacao
// "Satisfeito" = média das 3 notas (experiência/sabor/atendimento) >= 4.
router.get('/graficos/satisfacao', async (req, res) => {
  try {
    const total = await Feedback.countDocuments();
    const satisfeitos = await Feedback.countDocuments({ average: { $gte: 4 } });
    const percentualSatisfeitos = total > 0 ? Math.round((satisfeitos / total) * 1000) / 10 : null;

    // Distribuição por nota média arredondada (1 a 5), útil pra gráfico de barras.
    const distribuicao = await Feedback.aggregate([
      { $group: { _id: { $round: ['$average', 0] }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      totalAvaliacoes: total,
      satisfeitos,
      percentualSatisfeitos,
      distribuicaoPorNota: distribuicao.map((d) => ({ nota: d._id, quantidade: d.count })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível calcular a satisfação dos clientes.' });
  }
});

// GET /api/admin/graficos/cartoes-por-local?from=&to=
// Conta, por local, quantas vendas foram a que completou o cartão do cliente (10º selo).
router.get('/graficos/cartoes-por-local', async (req, res) => {
  try {
    const { from, to, ano, mes } = req.query;
    const match = { completedCardOnThisSale: true };
    if (ano) {
      const year = Number(ano);
      const month = mes ? Number(mes) : null;
      if (Number.isInteger(year)) {
        const start = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
        const end = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);
        match.createdAt = { $gte: start, $lt: end };
      }
    } else if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) match.createdAt.$lte = new Date(to);
    }

    const resultado = await Venda.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ['$localName', 'Local não identificado'] },
          cartoesFechados: { $sum: 1 },
        },
      },
      { $sort: { cartoesFechados: -1 } },
    ]);

    res.json({ porLocal: resultado.map((r) => ({ local: r._id, cartoesFechados: r.cartoesFechados })) });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível calcular os cartões fechados por local.' });
  }
});

// GET /api/admin/graficos/faturamento-por-local?period=day|month|year&date=YYYY-MM-DD
router.get('/graficos/faturamento-por-local', async (req, res) => {
  try {
    const { period = 'month', date, ano, mes } = req.query;
    const ref = date ? new Date(date) : new Date();

    let start;
    let end;
    if (ano) {
      const year = Number(ano);
      const month = mes ? Number(mes) : null;
      start = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
      end = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);
    } else if (period === 'day') {
      start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
      end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1);
    } else if (period === 'year') {
      start = new Date(ref.getFullYear(), 0, 1);
      end = new Date(ref.getFullYear() + 1, 0, 1);
    } else {
      start = new Date(ref.getFullYear(), ref.getMonth(), 1);
      end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
    }

    const resultado = await Venda.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: { $ifNull: ['$localName', 'Local não identificado'] },
          bruto: { $sum: '$totalValue' },
          custo: { $sum: '$totalCost' },
          vendas: { $sum: 1 },
        },
      },
      { $sort: { bruto: -1 } },
    ]);

    const porLocal = resultado.map((r) => {
      const bruto = Math.round(r.bruto * 100) / 100;
      const custo = Math.round((r.custo || 0) * 100) / 100;
      return {
        local: r._id,
        faturamento: bruto, // mantido por compatibilidade com quem já consome "faturamento" = bruto
        faturamentoBruto: bruto,
        custo,
        faturamentoLiquido: Math.round((bruto - custo) * 100) / 100,
        vendas: r.vendas,
      };
    });

    const totais = porLocal.reduce(
      (acc, r) => ({
        bruto: acc.bruto + r.faturamentoBruto,
        custo: acc.custo + r.custo,
        liquido: acc.liquido + r.faturamentoLiquido,
        vendas: acc.vendas + r.vendas,
      }),
      { bruto: 0, custo: 0, liquido: 0, vendas: 0 }
    );

    res.json({
      period,
      start,
      end,
      porLocal,
      totais: {
        faturamentoBruto: Math.round(totais.bruto * 100) / 100,
        custo: Math.round(totais.custo * 100) / 100,
        faturamentoLiquido: Math.round(totais.liquido * 100) / 100,
        vendas: totais.vendas,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível calcular o faturamento por local.' });
  }
});


// V8 — anos disponíveis para o relatório anual/mensal.
router.get('/graficos/anos', async (req, res) => {
  try {
    const rows = await Venda.aggregate([
      { $group: { _id: { $year: '$createdAt' } } },
      { $sort: { _id: -1 } },
    ]);
    res.json({ anos: rows.map((r) => r._id).filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível carregar os anos dos relatórios.' });
  }
});

// V8 — faturamento agrupado por mês ou por semana dentro de um mês.
router.get('/graficos/faturamento', async (req, res) => {
  try {
    const year = Number(req.query.ano);
    const month = req.query.mes ? Number(req.query.mes) : null;
    if (!Number.isInteger(year)) return res.status(400).json({ error: 'Ano inválido.' });
    const start = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
    const end = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);
    const vendas = await Venda.find({ createdAt: { $gte: start, $lt: end } }).lean();
    const buckets = [];
    if (month) {
      const days = new Date(year, month, 0).getDate();
      const count = Math.ceil(days / 7);
      for (let i = 0; i < count; i++) buckets.push({ label: `Semana ${i + 1}`, bruto: 0, custo: 0, liquido: 0, vendas: 0, cartoesFechados: 0 });
      vendas.forEach((v) => {
        const day = new Date(v.createdAt).getDate();
        const b = buckets[Math.min(count - 1, Math.floor((day - 1) / 7))];
        b.bruto += Number(v.totalValue || 0); b.custo += Number(v.totalCost || 0); b.vendas += 1;
        if (v.completedCardOnThisSale) b.cartoesFechados += 1;
      });
    } else {
      for (let i = 0; i < 12; i++) buckets.push({ label: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][i], bruto: 0, custo: 0, liquido: 0, vendas: 0, cartoesFechados: 0 });
      vendas.forEach((v) => {
        const b = buckets[new Date(v.createdAt).getMonth()];
        b.bruto += Number(v.totalValue || 0); b.custo += Number(v.totalCost || 0); b.vendas += 1;
        if (v.completedCardOnThisSale) b.cartoesFechados += 1;
      });
    }
    buckets.forEach((b) => { b.bruto = Math.round(b.bruto * 100) / 100; b.custo = Math.round(b.custo * 100) / 100; b.liquido = Math.round((b.bruto - b.custo) * 100) / 100; });
    const totals = buckets.reduce((a, b) => ({ bruto: a.bruto + b.bruto, custo: a.custo + b.custo, liquido: a.liquido + b.liquido, vendas: a.vendas + b.vendas, cartoesFechados: a.cartoesFechados + b.cartoesFechados }), { bruto: 0, custo: 0, liquido: 0, vendas: 0, cartoesFechados: 0 });
    const divisor = month ? Math.max(1, buckets.length) : 12;
    res.json({ ano: year, mes: month, posicoes: buckets, totais, medias: { media: totals.bruto / divisor, porMes: totals.bruto / 12, porSemana: totals.bruto / Math.max(1, buckets.length) } });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível calcular o faturamento.' });
  }
});

// V8 — limpeza administrativa, com confirmação feita pela interface.
router.post('/limpeza', async (req, res) => {
  try {
    const { escopo, vendaIds = [], avaliacaoIds = [], ano, mes, confirmCode } = req.body || {};
    let removidos = 0;
    const removeVendas = async (query) => {
      const vendas = await Venda.find(query).select('_id clientId stampsGiven');
      for (const venda of vendas) {
        const client = await User.findById(venda.clientId);
        if (client) { client.stamps = Math.max(0, client.stamps - Number(venda.stampsGiven || 0)); await client.save(); }
        await StampHistory.deleteMany({ vendaId: venda._id });
      }
      const result = await Venda.deleteMany(query);
      removidos += result.deletedCount || 0;
    };
    if (escopo === 'vendas') {
      if (!vendaIds.length) return res.status(400).json({ error: 'Nenhuma venda selecionada.' });
      await removeVendas({ _id: { $in: vendaIds } });
    } else if (escopo === 'avaliacoes') {
      const result = await Feedback.deleteMany({ _id: { $in: avaliacaoIds } }); removidos = result.deletedCount || 0;
    } else if (escopo === 'periodo') {
      const year = Number(ano); const month = mes ? Number(mes) : null;
      if (!Number.isInteger(year)) return res.status(400).json({ error: 'Período inválido.' });
      const start = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
      const end = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);
      await removeVendas({ createdAt: { $gte: start, $lt: end } });
      const result = await Feedback.deleteMany({ createdAt: { $gte: start, $lt: end } }); removidos += result.deletedCount || 0;
    } else if (escopo === 'cartoes') {
      await User.updateMany({ role: 'client' }, { $set: { completedCards: 0 } });
      res.json({ message: 'Contagem de cartões zerada.', removidos: 0 }); return;
    } else if (escopo === 'tudo') {
      if (confirmCode !== 'APAGAR TUDO') return res.status(400).json({ error: 'Confirmação inválida.' });
      await Venda.deleteMany({}); await Feedback.deleteMany({}); await Produto.deleteMany({}); await Local.deleteMany({}); await StampHistory.deleteMany({});
      await User.updateMany({ role: 'client' }, { $set: { stamps: 0, completedCards: 0 } });
      removidos = -1;
    } else return res.status(400).json({ error: 'Tipo de limpeza inválido.' });
    res.json({ message: 'Limpeza concluída.', removidos });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível limpar os dados.' });
  }
});

module.exports = router;
