const express = require('express');
const User = require('../models/User');
const StampHistory = require('../models/StampHistory');
const Notification = require('../models/Notification');
const NotificationRead = require('../models/NotificationRead');
const Feedback = require('../models/Feedback');
const Produto = require('../models/Produto');
const Local = require('../models/Local');
const Venda = require('../models/Venda');
const Premio = require('../models/Premio');
const Raspadinha = require('../models/Raspadinha');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const { verifyQrToken } = require('./qr');
const { sendPushToUser } = require('../utils/webPush');
const liveEvents = require('../utils/events');
const { matchLocal } = require('../utils/geo');

const router = express.Router();
router.use(auth, adminOnly);

function escapeRegex(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ============================================================================
// RASPADINHAS
// ============================================================================
router.get('/raspadinhas', async (req, res) => {
  try {
    const { status = 'all', limit = 100 } = req.query;
    const query = {};
    if (status !== 'all') query.status = status;
    const list = await Raspadinha.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 100, 500))
      .populate('userId', 'fullName phone')
      .populate('usedBy', 'fullName');
    res.json({ raspadinhas: list });
  } catch (err) { res.status(500).json({ error: 'Não foi possível carregar as raspadinhas.' }); }
});

router.get('/raspadinhas/stats', async (req, res) => {
  try {
    const [ativas, usadas, total] = await Promise.all([
      Raspadinha.countDocuments({ status: 'active' }),
      Raspadinha.countDocuments({ status: 'used' }),
      Raspadinha.countDocuments(),
    ]);
    const media = await Raspadinha.aggregate([
      { $match: { status: 'used' } },
      { $group: { _id: null, avg: { $avg: '$discountPercent' } } },
    ]);
    res.json({ ativas, usadas, total, descontoMedio: media[0] ? Math.round(media[0].avg * 10) / 10 : 0 });
  } catch (err) { res.status(500).json({ error: 'Não foi possível carregar as estatísticas.' }); }
});

router.post('/raspadinhas/resgatar', async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Digite o código.' });
    const rasp = await Raspadinha.findOne({ code }).populate('userId', 'fullName phone');
    if (!rasp) return res.status(404).json({ error: 'Código não encontrado.' });
    if (rasp.status === 'used') return res.status(400).json({ error: 'Este código já foi usado.' });
    if (rasp.status !== 'active') return res.status(400).json({ error: 'Este código não está mais válido.' });

    rasp.status = 'used';
    rasp.usedAt = new Date();
    rasp.usedBy = req.user.id;
    await rasp.save();

    await Notification.deleteMany({ raspadinhaId: rasp._id });
    if (rasp.userId) liveEvents.sendToUser(rasp.userId._id, 'notification', { id: rasp._id, removed: true });

    res.json({ raspadinha: rasp });
  } catch (err) { res.status(500).json({ error: 'Não foi possível resgatar o prêmio.' }); }
});

// v10.4.8: cancelar raspadinha com validação dupla
// Body: { code }  — o admin precisa digitar o CÓDIGO exato da raspadinha para cancelar.
router.post('/raspadinhas/:id/cancelar', async (req, res) => {
  try {
    const confirmCode = String(req.body.code || '').trim().toUpperCase();
    const rasp = await Raspadinha.findById(req.params.id);
    if (!rasp) return res.status(404).json({ error: 'Raspadinha não encontrada.' });
    if (rasp.status !== 'active') return res.status(400).json({ error: 'Só é possível cancelar raspadinhas ativas.' });
    if (confirmCode !== rasp.code) {
      return res.status(400).json({ error: 'O código digitado não confere. Digite exatamente o código da raspadinha.' });
    }

    rasp.status = 'cancelled';
    await rasp.save();

    await Notification.deleteMany({ raspadinhaId: rasp._id });
    if (rasp.userId) liveEvents.sendToUser(rasp.userId, 'notification', { id: rasp._id, removed: true });

    res.json({ raspadinha: rasp });
  } catch (err) { res.status(500).json({ error: 'Não foi possível cancelar.' }); }
});

// v10.5.1: excluir raspadinha do banco (apenas canceladas, usadas ou órfãs).
// Confirmação dupla: o admin precisa digitar o CÓDIGO exato da raspadinha.
router.delete('/raspadinhas/:id', async (req, res) => {
  try {
    const confirmCode = String(req.body.code || '').trim().toUpperCase();
    const rasp = await Raspadinha.findById(req.params.id);
    if (!rasp) return res.status(404).json({ error: 'Raspadinha não encontrada.' });

    if (rasp.status === 'active') {
      return res.status(400).json({
        error: 'Esta raspadinha ainda está ativa. Cancele primeiro (ou resgate no balcão) e depois exclua.',
      });
    }

    if (confirmCode !== rasp.code) {
      return res.status(400).json({ error: 'O código digitado não confere. Digite exatamente o código da raspadinha.' });
    }

    await Notification.deleteMany({ raspadinhaId: rasp._id });
    await rasp.deleteOne();
    res.json({ ok: true, message: 'Raspadinha excluída do histórico.' });
  } catch (err) {
    console.error('Erro ao excluir raspadinha:', err);
    res.status(500).json({ error: 'Não foi possível excluir.' });
  }
});
// ============================================================================
// GEOCODE
// ============================================================================
router.get('/geocode', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.status(400).json({ error: 'Digite pelo menos 3 letras para buscar.' });
    if (typeof fetch !== 'function') return res.status(500).json({ error: 'Servidor Node desatualizado.' });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      // Limita ao Brasil. Inclui "structured" para pegar bairro/cidade separados.
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&accept-language=pt-BR&countrycodes=br&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'PamonhaNetFidelidade/1.0 (cartao fidelidade; contato via site)' } });
      if (!r.ok) return res.status(502).json({ error: 'Serviço de endereços indisponível.' });
      const json = await r.json();
      const resultados = (json || []).map((it) => {
        const a = it.address || {};
        const linha1 = it.name || a.road || a.pedestrian || '';
        const linha2 = a.suburb || a.neighbourhood || a.city_district || a.town || a.village || a.city || '';
        const linha3 = a.state || '';
        const partes = [linha1, linha2, linha3].filter(Boolean);
        return {
          displayName: it.display_name,
          shortLabel: partes.join(', ') || it.display_name.split(',')[0],
          lat: Number(it.lat),
          lng: Number(it.lon),
          type: it.type || '',
          category: it.category || '',
        };
      });
      res.json({ resultados });
    } finally { clearTimeout(timer); }
  } catch (err) { console.error('[geocode]', err); res.status(500).json({ error: 'Não foi possível buscar o endereço.' }); }
});

// ============================================================================
// CLIENTES (igual v10.1)
// ============================================================================
router.get('/clients', async (req, res) => {
  try {
    const { search = '', sort = 'name', page = 1, limit = 20 } = req.query;
    const query = { role: 'client' };
    if (search.trim()) {
      const digitsOnly = search.replace(/\D/g, '');
      const safeSearch = escapeRegex(search.trim());
      query.$or = [{ fullName: { $regex: safeSearch, $options: 'i' } }];
      if (digitsOnly) query.$or.push({ phone: { $regex: escapeRegex(digitsOnly) } });
    }
    const sortMap = { name: { fullName: 1 }, stamps: { stamps: -1 } };
    const sortOption = sortMap[sort] || sortMap.name;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const [clientsRaw, total] = await Promise.all([
      User.find(query).select('fullName phone email stamps completedCards lastStampAt createdAt').sort(sortOption).skip((pageNum - 1) * limitNum).limit(limitNum),
      User.countDocuments(query),
    ]);
    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
    const clients = clientsRaw.map((c) => {
      const referenceDate = c.lastStampAt || c.createdAt;
      const weeksInactive = referenceDate ? Math.floor((Date.now() - new Date(referenceDate).getTime()) / MS_PER_WEEK) : null;
      return { ...c.toObject(), weeksInactive, isInactive: weeksInactive !== null && weeksInactive >= 2 };
    });
    res.json({ clients, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) || 1 } });
  } catch (err) { res.status(500).json({ error: 'Não foi possível carregar a lista de clientes.' }); }
});

router.get('/clients/:id', async (req, res) => {
  try {
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    const history = await StampHistory.find({ userId: client._id }).sort({ createdAt: -1 });
    res.json({ client, history });
  } catch (err) { res.status(500).json({ error: 'Não foi possível carregar o cliente.' }); }
});

router.post('/clients/:id/stamps', async (req, res) => {
  try {
    const { action } = req.body;
    if (!['add', 'remove'].includes(action)) return res.status(400).json({ error: 'Ação inválida.' });
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    if (action === 'add') {
      if (client.stamps >= 10) return res.status(400).json({ error: 'Cartão já completo.' });
      client.stamps += 1;
      client.lastStampAt = new Date();
      await client.save();
      await StampHistory.create({ userId: client._id, action: 'add', adminId: req.user.id, source: 'manual' });
    } else {
      if (client.stamps <= 0) return res.status(400).json({ error: 'Sem carimbos para remover.' });
      client.stamps -= 1;
      await client.save();
      const lastAdd = await StampHistory.findOne({ userId: client._id, action: 'add' }).sort({ createdAt: -1 });
      if (lastAdd) await StampHistory.deleteOne({ _id: lastAdd._id });
    }
    res.json({ client });
    liveEvents.sendToUser(client._id, 'stamps-update', { stamps: client.stamps, completedCards: client.completedCards || 0 });
  } catch (err) { res.status(500).json({ error: 'Não foi possível atualizar o carimbo.' }); }
});

router.post('/clients/:id/stamps/set', async (req, res) => {
  try {
    const target = Number(req.body.target);
    if (!Number.isInteger(target) || target < 0 || target > 10) return res.status(400).json({ error: 'Valor inválido.' });
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    const delta = target - client.stamps;
    if (delta > 0) {
      const now = Date.now();
      const entries = Array.from({ length: delta }, (_, i) => ({ userId: client._id, action: 'add', adminId: req.user.id, source: 'manual', createdAt: new Date(now + i) }));
      await StampHistory.insertMany(entries);
      client.lastStampAt = new Date();
    } else if (delta < 0) {
      const toRemove = await StampHistory.find({ userId: client._id, action: 'add' }).sort({ createdAt: -1 }).limit(-delta);
      await StampHistory.deleteMany({ _id: { $in: toRemove.map((d) => d._id) } });
    }
    client.stamps = target;
    await client.save();
    res.json({ client });
    liveEvents.sendToUser(client._id, 'stamps-update', { stamps: client.stamps, completedCards: client.completedCards || 0 });
  } catch (err) { res.status(500).json({ error: 'Não foi possível atualizar o cartão.' }); }
});

router.post('/clients/:id/reset', async (req, res) => {
  try {
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    if (client.stamps >= 10) client.completedCards = (client.completedCards || 0) + 1;
    client.stamps = 0;
    await client.save();
    await StampHistory.deleteMany({ userId: client._id });
    res.json({ client });
    liveEvents.sendToUser(client._id, 'stamps-update', { stamps: client.stamps, completedCards: client.completedCards || 0 });
  } catch (err) { res.status(500).json({ error: 'Não foi possível resetar o cartão.' }); }
});

router.delete('/clients/:id/history', async (req, res) => {
  try {
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    await StampHistory.deleteMany({ userId: client._id });
    res.json({ message: 'Histórico apagado.' });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

router.post('/scan-qr', async (req, res) => {
  try {
    const { qrToken } = req.body;
    if (!qrToken) return res.status(400).json({ error: 'Nenhum QR Code informado.' });
    let userId;
    try { userId = verifyQrToken(qrToken); } catch (err) { return res.status(400).json({ error: err.message }); }
    const client = await User.findOne({ _id: userId, role: 'client' });
    if (!client) return res.status(404).json({ error: 'Cliente do QR Code não encontrado.' });
    res.json({ message: `Cartão de ${client.fullName} encontrado.`, client });
  } catch (err) { res.status(500).json({ error: 'Erro no QR.' }); }
});

// ============================================================================
// NOTIFICAÇÕES
// ============================================================================
router.post('/notifications', async (req, res) => {
  try {
    const { title, message, userId } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Título e mensagem são obrigatórios.' });
    const notif = await Notification.create({ title: title.trim(), message: message.trim(), userId: userId || null, broadcast: !userId });
    const pushResult = await sendPushToUser({ userId: userId || null, title: title.trim(), body: message.trim() });
    res.status(201).json({ notification: notif, push: pushResult });
    if (notif.broadcast) liveEvents.broadcast('notification', { id: notif._id, title: notif.title });
    else liveEvents.sendToUser(notif.userId, 'notification', { id: notif._id, title: notif.title });
  } catch (err) { res.status(500).json({ error: 'Erro ao criar notificação.' }); }
});

router.get('/notifications', async (req, res) => {
  try { const list = await Notification.find().sort({ createdAt: -1 }).populate('userId', 'fullName phone'); res.json({ notifications: list }); }
  catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

router.get('/notifications/:id/views', async (req, res) => {
  try {
    const notif = await Notification.findById(req.params.id);
    if (!notif) return res.status(404).json({ error: 'Notificação não encontrada.' });
    const totalClients = notif.broadcast ? await User.countDocuments({ role: 'client' }) : 1;
    const reads = await NotificationRead.find({ notificationId: notif._id }).populate('userId', 'fullName phone').sort({ viewedAt: -1 });
    res.json({ totalRecipients: totalClients, viewedCount: reads.length, viewers: reads.map((r) => ({ fullName: r.userId?.fullName, phone: r.userId?.phone, viewedAt: r.viewedAt })) });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

router.delete('/notifications', async (req, res) => {
  try {
    const { scope } = req.query;
    const filter = { type: { $ne: 'raspadinha' } };
    if (scope === 'broadcast') filter.broadcast = true;
    if (scope === 'individual') filter.broadcast = false;
    await Notification.deleteMany(filter);
    res.json({ message: 'Notificações removidas.' });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

router.delete('/notifications/:id', async (req, res) => {
  try {
    const notif = await Notification.findById(req.params.id);
    if (!notif) return res.status(404).json({ error: 'Notificação não encontrada.' });
    if (notif.type === 'raspadinha') return res.status(403).json({ error: 'Notificações de raspadinha só somem quando o prêmio é resgatado ou cancelado.' });
    await Notification.deleteOne({ _id: req.params.id });
    res.json({ message: 'Notificação removida.' });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

router.post('/leaderboard/reset', async (req, res) => {
  try { await User.updateMany({ role: 'client' }, { $set: { completedCards: 0 } }); res.json({ message: 'Ranking reiniciado.' }); }
  catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

// FEEDBACK / PRODUTOS / PRÊMIOS / LOCAIS (iguais)
router.get('/feedbacks', async (req, res) => {
  try { const list = await Feedback.find().sort({ createdAt: -1 }).populate('userId', 'fullName phone'); res.json({ feedbacks: list }); }
  catch (err) { res.status(500).json({ error: 'Erro.' }); }
});
router.delete('/feedbacks/:id', async (req, res) => {
  try { await Feedback.findByIdAndDelete(req.params.id); res.json({ message: 'Avaliação removida.' }); }
  catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

router.get('/produtos', async (req, res) => {
  try { const { includeInactive } = req.query; const query = includeInactive ? {} : { active: true }; const produtos = await Produto.find(query).sort({ name: 1 }); res.json({ produtos }); }
  catch (err) { res.status(500).json({ error: 'Erro.' }); }
});
router.post('/produtos', async (req, res) => {
  try {
    const { name, price, costPrice, imageUrl } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome do produto é obrigatório.' });
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) return res.status(400).json({ error: 'Preço inválido.' });
    const numericCost = costPrice !== undefined ? Number(costPrice) : 0;
    if (!Number.isFinite(numericCost) || numericCost < 0) return res.status(400).json({ error: 'Custo inválido.' });
    const produto = await Produto.create({ name: String(name).trim(), price: numericPrice, costPrice: numericCost, imageUrl: imageUrl || null, createdBy: req.user.id });
    res.status(201).json({ produto });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});
router.put('/produtos/:id', async (req, res) => {
  try {
    const produto = await Produto.findById(req.params.id);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });
    const { name, price, costPrice, imageUrl, active } = req.body;
    if (name !== undefined) produto.name = String(name).trim();
    if (price !== undefined) produto.price = Number(price);
    if (costPrice !== undefined) produto.costPrice = Number(costPrice);
    if (imageUrl !== undefined) produto.imageUrl = imageUrl;
    if (active !== undefined) produto.active = Boolean(active);
    await produto.save();
    res.json({ produto });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});
router.delete('/produtos/:id', async (req, res) => {
  try { await Produto.findByIdAndDelete(req.params.id); res.json({ message: 'Removido.' }); }
  catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

router.get('/premios', async (req, res) => {
  try { const { includeInactive } = req.query; const query = includeInactive ? {} : { active: true }; const premios = await Premio.find(query).sort({ order: 1, name: 1 }); res.json({ premios }); }
  catch (err) { res.status(500).json({ error: 'Erro.' }); }
});
router.post('/premios', async (req, res) => {
  try {
    const { name, description, stampsRequired, imageUrl, order } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome obrigatório.' });
    const numStamps = stampsRequired !== undefined ? Number(stampsRequired) : 10;
    if (!Number.isInteger(numStamps) || numStamps < 1 || numStamps > 100) return res.status(400).json({ error: 'Selos entre 1 e 100.' });
    const premio = await Premio.create({ name: String(name).trim(), description: (description || '').trim().slice(0, 200), stampsRequired: numStamps, imageUrl: imageUrl || null, order: order !== undefined ? Number(order) : 0, createdBy: req.user.id });
    res.status(201).json({ premio });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});
router.put('/premios/:id', async (req, res) => {
  try {
    const premio = await Premio.findById(req.params.id);
    if (!premio) return res.status(404).json({ error: 'Prêmio não encontrado.' });
    const { name, description, stampsRequired, imageUrl, active, order } = req.body;
    if (name !== undefined) premio.name = String(name).trim();
    if (description !== undefined) premio.description = String(description).trim().slice(0, 200);
    if (stampsRequired !== undefined) premio.stampsRequired = Number(stampsRequired);
    if (imageUrl !== undefined) premio.imageUrl = imageUrl;
    if (active !== undefined) premio.active = Boolean(active);
    if (order !== undefined) premio.order = Number(order);
    await premio.save();
    res.json({ premio });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});
router.delete('/premios/:id', async (req, res) => {
  try { await Premio.findByIdAndDelete(req.params.id); res.json({ message: 'Removido.' }); }
  catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

router.get('/locais', async (req, res) => {
  try { const { includeInactive } = req.query; const query = includeInactive ? {} : { active: true }; const locais = await Local.find(query).sort({ name: 1 }); res.json({ locais }); }
  catch (err) { res.status(500).json({ error: 'Erro.' }); }
});
router.post('/locais', async (req, res) => {
  try {
    const { name, lat, lng, radiusMeters } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome obrigatório.' });
    const numericLat = Number(lat);
    const numericLng = Number(lng);
    if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng)) return res.status(400).json({ error: 'Coordenadas inválidas.' });
    const local = await Local.create({ name: String(name).trim(), lat: numericLat, lng: numericLng, radiusMeters: radiusMeters !== undefined ? Number(radiusMeters) : undefined, createdBy: req.user.id });
    res.status(201).json({ local });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});
router.put('/locais/:id', async (req, res) => {
  try {
    const local = await Local.findById(req.params.id);
    if (!local) return res.status(404).json({ error: 'Local não encontrado.' });
    const { name, lat, lng, radiusMeters, active } = req.body;
    if (name !== undefined) local.name = String(name).trim();
    if (lat !== undefined) local.lat = Number(lat);
    if (lng !== undefined) local.lng = Number(lng);
    if (radiusMeters !== undefined) local.radiusMeters = Number(radiusMeters);
    if (active !== undefined) local.active = Boolean(active);
    await local.save();
    res.json({ local });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});
router.delete('/locais/:id', async (req, res) => {
  try { await Local.findByIdAndDelete(req.params.id); res.json({ message: 'Removido.' }); }
  catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

// ============================================================================
// VENDAS — v10.4.8: venda avulsa NÃO exige local nem GPS.
// ============================================================================
router.post('/vendas', async (req, res) => {
  try {
    const { clientId, items, lat, lng, localId } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Selecione ao menos 1 produto.' });

    const isAvulsa = !clientId;
    let client = null;
    if (!isAvulsa) {
      client = await User.findOne({ _id: clientId, role: 'client' });
      if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const produtoIds = items.map((i) => i.produtoId);
    const produtos = await Produto.find({ _id: { $in: produtoIds } });
    const produtoMap = new Map(produtos.map((p) => [String(p._id), p]));
    const vendaItems = [];
    let totalValue = 0, totalCost = 0, stampsGiven = 0;
    for (const item of items) {
      const produto = produtoMap.get(String(item.produtoId));
      const quantity = Number(item.quantity);
      if (!produto) return res.status(400).json({ error: 'Produto não encontrado.' });
      if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: `Quantidade inválida.` });
      vendaItems.push({ produtoId: produto._id, name: produto.name, price: produto.price, costPrice: produto.costPrice || 0, quantity });
      totalValue += produto.price * quantity;
      totalCost += (produto.costPrice || 0) * quantity;
      stampsGiven += quantity;
    }

    // v10.4.8: venda avulsa pode não ter local nenhum — fica como "Não identificado".
    let resolvedLocal = null, nearest = [];
    if (localId) {
      resolvedLocal = await Local.findById(localId);
    } else if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      const locaisAtivos = await Local.find({ active: true });
      const result = matchLocal(Number(lat), Number(lng), locaisAtivos);
      resolvedLocal = result.match;
      nearest = result.nearest.map((n) => ({ localId: n.local._id, name: n.local.name, distanceMeters: n.distance }));
    }

    let stampsToApply = 0, previousStamps = 0, completedCardOnThisSale = false;
    if (client) {
      previousStamps = client.stamps;
      stampsToApply = Math.min(stampsGiven, Math.max(0, 10 - client.stamps));
      if (stampsToApply > 0) {
        client.stamps += stampsToApply;
        client.lastStampAt = new Date();
        await client.save();
      }
      completedCardOnThisSale = previousStamps < 10 && client.stamps === 10;
    }

    const venda = await Venda.create({
      clientId: client ? client._id : null,
      adminId: req.user.id,
      items: vendaItems,
      totalValue, totalCost,
      stampsGiven: client ? stampsGiven : 0,
      gps: {
        lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
        lng: Number.isFinite(Number(lng)) ? Number(lng) : null,
      },
      localId: resolvedLocal ? resolvedLocal._id : null,
      localName: resolvedLocal ? resolvedLocal.name : null,
      completedCardOnThisSale,
    });

    if (stampsToApply > 0 && client) {
      const now = Date.now();
      const entries = Array.from({ length: stampsToApply }, (_, i) => ({ userId: client._id, action: 'add', adminId: req.user.id, source: 'venda', vendaId: venda._id, createdAt: new Date(now + i) }));
      await StampHistory.insertMany(entries);
    }

    const overflow = client ? stampsGiven - stampsToApply : 0;
    res.status(201).json({
      venda,
      client: client || null,
      overflowStamps: overflow,
      needsLocation: false, // v10.4.8: não força mais
      nearestLocais: nearest,
    });
    if (client) liveEvents.sendToUser(client._id, 'stamps-update', { stamps: client.stamps, completedCards: client.completedCards || 0 });
  } catch (err) { console.error('Erro ao registrar venda:', err); res.status(500).json({ error: 'Não foi possível registrar a venda.' }); }
});

router.get('/vendas', async (req, res) => {
  try {
    const { localId, from, to, limit = 50 } = req.query;
    const query = {};
    if (localId) query.localId = localId === 'null' ? null : localId;
    if (from || to) { query.createdAt = {}; if (from) query.createdAt.$gte = new Date(from); if (to) query.createdAt.$lte = new Date(to); }
    const vendas = await Venda.find(query).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 50, 200)).populate('clientId', 'fullName phone');
    res.json({ vendas });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

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
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

router.delete('/vendas/:id', async (req, res) => {
  try {
    const venda = await Venda.findById(req.params.id);
    if (!venda) return res.status(404).json({ error: 'Venda não encontrada.' });
    if (venda.clientId) {
      const client = await User.findById(venda.clientId);
      if (client) { client.stamps = Math.max(0, client.stamps - venda.stampsGiven); await client.save(); }
    }
    await StampHistory.deleteMany({ vendaId: venda._id });
    await venda.deleteOne();
    res.json({ message: 'Venda removida.' });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

// GRÁFICOS
router.get('/graficos/satisfacao', async (req, res) => {
  try {
    const total = await Feedback.countDocuments();
    const satisfeitos = await Feedback.countDocuments({ average: { $gte: 4 } });
    const percentualSatisfeitos = total > 0 ? Math.round((satisfeitos / total) * 1000) / 10 : null;
    const distribuicao = await Feedback.aggregate([{ $group: { _id: { $round: ['$average', 0] }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
    res.json({ totalAvaliacoes: total, satisfeitos, percentualSatisfeitos, distribuicaoPorNota: distribuicao.map((d) => ({ nota: d._id, quantidade: d.count })) });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

router.get('/graficos/anos', async (req, res) => {
  try {
    const result = await Venda.aggregate([{ $group: { _id: { $year: '$createdAt' }, count: { $sum: 1 } } }, { $sort: { _id: -1 } }]);
    res.json({ anos: result.map((r) => r._id).filter(Boolean) });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

router.get('/graficos/faturamento', async (req, res) => {
  try {
    const ano = Number(req.query.ano);
    const mes = Number(req.query.mes) || null;
    if (!Number.isFinite(ano)) return res.status(400).json({ error: 'Ano inválido.' });
    let start, end;
    if (mes) { start = new Date(ano, mes - 1, 1); end = new Date(ano, mes, 1); }
    else { start = new Date(ano, 0, 1); end = new Date(ano + 1, 0, 1); }
    const vendas = await Venda.find({ createdAt: { $gte: start, $lt: end } }).lean();
    const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const N = mes ? 5 : 12;
    const posicoes = Array.from({ length: N }, (_, i) => ({ label: mes ? `Sem ${i + 1}` : MESES[i], bruto: 0, custo: 0, liquido: 0, vendas: 0, cartoesFechados: 0 }));
    for (const v of vendas) {
      const d = new Date(v.createdAt);
      let idx = mes ? Math.min(4, Math.floor((d.getDate() - 1) / 7)) : d.getMonth();
      posicoes[idx].bruto += v.totalValue;
      posicoes[idx].custo += v.totalCost || 0;
      posicoes[idx].vendas += 1;
      if (v.completedCardOnThisSale) posicoes[idx].cartoesFechados += 1;
    }
    for (const p of posicoes) { p.bruto = Math.round(p.bruto * 100) / 100; p.custo = Math.round(p.custo * 100) / 100; p.liquido = Math.round((p.bruto - p.custo) * 100) / 100; }
    const totais = posicoes.reduce((acc, p) => ({ bruto: acc.bruto + p.bruto, custo: acc.custo + p.custo, liquido: acc.liquido + p.liquido, vendas: acc.vendas + p.vendas, cartoesFechados: acc.cartoesFechados + p.cartoesFechados }), { bruto: 0, custo: 0, liquido: 0, vendas: 0, cartoesFechados: 0 });
    const comVenda = posicoes.filter((p) => p.vendas > 0).length;
    const media = comVenda > 0 ? Math.round((totais.bruto / comVenda) * 100) / 100 : 0;
    res.json({ ano, mes, posicoes, totais, medias: { porMes: mes ? 0 : media, porSemana: mes ? media : 0, media } });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

router.get('/graficos/cartoes-por-local', async (req, res) => {
  try {
    const { ano, mes } = req.query;
    const match = { completedCardOnThisSale: true };
    if (ano) {
      const y = Number(ano);
      if (mes) { const m = Number(mes); match.createdAt = { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) }; }
      else { match.createdAt = { $gte: new Date(y, 0, 1), $lt: new Date(y + 1, 0, 1) }; }
    }
    const resultado = await Venda.aggregate([{ $match: match }, { $group: { _id: { $ifNull: ['$localName', 'Local não identificado'] }, cartoesFechados: { $sum: 1 } } }, { $sort: { cartoesFechados: -1 } }]);
    res.json({ porLocal: resultado.map((r) => ({ local: r._id, cartoesFechados: r.cartoesFechados })) });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

router.get('/graficos/faturamento-por-local', async (req, res) => {
  try {
    const { ano, mes } = req.query;
    const match = {};
    if (ano) {
      const y = Number(ano);
      if (mes) { const m = Number(mes); match.createdAt = { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) }; }
      else { match.createdAt = { $gte: new Date(y, 0, 1), $lt: new Date(y + 1, 0, 1) }; }
    }
    const resultado = await Venda.aggregate([{ $match: match }, { $group: { _id: { $ifNull: ['$localName', 'Local não identificado'] }, bruto: { $sum: '$totalValue' }, custo: { $sum: '$totalCost' }, vendas: { $sum: 1 } } }, { $sort: { bruto: -1 } }]);
    const porLocal = resultado.map((r) => {
      const bruto = Math.round(r.bruto * 100) / 100;
      const custo = Math.round((r.custo || 0) * 100) / 100;
      return { local: r._id, faturamento: bruto, faturamentoBruto: bruto, custo, faturamentoLiquido: Math.round((bruto - custo) * 100) / 100, vendas: r.vendas };
    });
    const totais = porLocal.reduce((acc, r) => ({ bruto: acc.bruto + r.faturamentoBruto, custo: acc.custo + r.custo, liquido: acc.liquido + r.faturamentoLiquido, vendas: acc.vendas + r.vendas }), { bruto: 0, custo: 0, liquido: 0, vendas: 0 });
    res.json({ porLocal, totais: { faturamentoBruto: Math.round(totais.bruto * 100) / 100, custo: Math.round(totais.custo * 100) / 100, faturamentoLiquido: Math.round(totais.liquido * 100) / 100, vendas: totais.vendas } });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

// LIMPEZA
router.post('/limpeza', async (req, res) => {
  try {
    const { escopo, vendaIds, avaliacaoIds, ano, mes, confirmCode } = req.body;
    let removidos = 0;
    if (escopo === 'vendas') {
      if (!Array.isArray(vendaIds) || !vendaIds.length) return res.status(400).json({ error: 'Nenhuma venda selecionada.' });
      const vendas = await Venda.find({ _id: { $in: vendaIds } });
      for (const v of vendas) {
        if (v.clientId) { const c = await User.findById(v.clientId); if (c) { c.stamps = Math.max(0, c.stamps - v.stampsGiven); await c.save(); } }
        await StampHistory.deleteMany({ vendaId: v._id });
        await v.deleteOne();
        removidos++;
      }
    } else if (escopo === 'avaliacoes') {
      if (!Array.isArray(avaliacaoIds) || !avaliacaoIds.length) return res.status(400).json({ error: 'Nenhuma avaliação selecionada.' });
      const r = await Feedback.deleteMany({ _id: { $in: avaliacaoIds } });
      removidos = r.deletedCount || 0;
    } else if (escopo === 'periodo') {
      const y = Number(ano);
      if (!Number.isFinite(y)) return res.status(400).json({ error: 'Ano inválido.' });
      let start, end;
      if (mes) { const m = Number(mes); start = new Date(y, m - 1, 1); end = new Date(y, m, 1); } else { start = new Date(y, 0, 1); end = new Date(y + 1, 0, 1); }
      const vendas = await Venda.find({ createdAt: { $gte: start, $lt: end } });
      for (const v of vendas) { if (v.clientId) { const c = await User.findById(v.clientId); if (c) { c.stamps = Math.max(0, c.stamps - v.stampsGiven); await c.save(); } } }
      const rv = await Venda.deleteMany({ createdAt: { $gte: start, $lt: end } });
      const rf = await Feedback.deleteMany({ createdAt: { $gte: start, $lt: end } });
      removidos = (rv.deletedCount || 0) + (rf.deletedCount || 0);
    } else if (escopo === 'cartoes') {
      const r = await User.updateMany({ role: 'client' }, { $set: { completedCards: 0 } });
      removidos = r.modifiedCount || 0;
    } else if (escopo === 'tudo') {
      if (confirmCode !== 'APAGAR TUDO') return res.status(400).json({ error: 'Confirmação incorreta.' });
      const rv = await Venda.deleteMany({});
      const rf = await Feedback.deleteMany({});
      const rp = await Produto.deleteMany({});
      const rl = await Local.deleteMany({});
      await StampHistory.deleteMany({});
      await User.updateMany({ role: 'client' }, { $set: { completedCards: 0, stamps: 0 } });
      removidos = (rv.deletedCount || 0) + (rf.deletedCount || 0) + (rp.deletedCount || 0) + (rl.deletedCount || 0);
    } else return res.status(400).json({ error: 'Escopo inválido.' });
    res.json({ removidos });
  } catch (err) { res.status(500).json({ error: 'Erro.' }); }
});

// v10.5.2: diagnóstico de e-mail.
router.get('/email-status', async (req, res) => {
  const key = process.env.BREVO_API_KEY || '';
  res.json({ configurado: !!key, provedor: 'Brevo', from: process.env.EMAIL_FROM || 'pamonhanet@gmail.com', temChave: !!key });
});
router.post('/test-email', async (req, res) => {
  try {
    const destino = (req.body.to && String(req.body.to).trim()) || process.env.EMAIL_FROM;
    if (!destino) return res.status(400).json({ error: 'Informe o e-mail de destino.' });
    const { sendTestEmail } = require('../utils/email');
    const info = await sendTestEmail({ to: destino });
    res.json({ ok: true, to: destino, messageId: info.messageId || null });
  } catch (err) {
    console.error('Erro no teste de e-mail (Brevo):', err);
    let msg = err.message;
    if (/401|unauthorized|api-key/i.test(err.message)) msg = 'A API key do Brevo está inválida ou expirou.';
    else if (/sender|not allowed/i.test(err.message)) msg = 'O remetente não está verificado no Brevo.';
    res.status(500).json({ error: msg });
  }
});
module.exports = router
