// routes/admin.js
// Rotas administrativas. Todas protegidas por auth + adminOnly (dupla verificação).
const express = require('express');
const User = require('../models/User');
const Redemption = require('../models/Redemption');
const StampHistory = require('../models/Stamp');
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
    console.error('Erro ao listar clientes:', err);
    res.status(500).json({ error: 'Não foi possível carregar a lista de clientes.' });
  }
});

// GET /api/admin/clients/:id
router.get('/clients/:id', async (req, res) => {
  try {
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    const history = await Redemption.find({ userId: client._id }).sort({ createdAt: -1 });
    res.json({ client, history });
  } catch (err) {
    console.error('Erro ao buscar cliente:', err);
    res.status(500).json({ error: 'Não foi possível carregar o cliente.' });
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
// Lê o conteúdo de um QR Code gerado pelo cliente e adiciona 1 carimbo automaticamente.
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

module.exports = router;
