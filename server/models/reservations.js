// routes/reservations.js
// Reservas de produto: o cliente reserva no app, retira e paga no balcão.
const express = require('express');
const Reservation = require('../models/Reservation');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');

const router = express.Router();

// GET /api/client/products — catálogo simplificado para o cliente escolher o que reservar
router.get('/client/products', auth, async (req, res) => {
  try {
    const products = await Product.find({ inStock: true }).select('name priceCents imageUrl').sort({ name: 1 });
    res.json({ products });
  } catch (err) {
    console.error('Erro ao listar produtos para o cliente:', err);
    res.status(500).json({ error: 'Não foi possível carregar os produtos.' });
  }
});


// POST /api/client/reservations  { productId, quantity? }
router.post('/client/reservations', auth, async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
    if (!product.inStock) return res.status(400).json({ error: 'Este produto está fora de estoque no momento.' });

    const reservation = await Reservation.create({
      userId: req.user.id,
      productId: product._id,
      productName: product.name,
      quantity: Math.max(1, Number(quantity)),
    });

    res.status(201).json({ reservation });
  } catch (err) {
    console.error('Erro ao criar reserva:', err);
    res.status(500).json({ error: 'Não foi possível criar a reserva.' });
  }
});

// GET /api/client/reservations — histórico do próprio cliente
router.get('/client/reservations', auth, async (req, res) => {
  try {
    const reservations = await Reservation.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ reservations });
  } catch (err) {
    console.error('Erro ao carregar reservas do cliente:', err);
    res.status(500).json({ error: 'Não foi possível carregar suas reservas.' });
  }
});

// GET /api/admin/reservations?status=pending
router.get('/admin/reservations', auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const reservations = await Reservation.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('userId', 'fullName phone');
    const pendingCount = await Reservation.countDocuments({ status: 'pending' });
    res.json({ reservations, pendingCount });
  } catch (err) {
    console.error('Erro ao listar reservas:', err);
    res.status(500).json({ error: 'Não foi possível carregar as reservas.' });
  }
});

// PATCH /api/admin/reservations/:id  { status?, paymentMethod? }
router.patch('/admin/reservations/:id', auth, adminOnly, async (req, res) => {
  try {
    const { status, paymentMethod } = req.body;
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada.' });

    if (status && ['pending', 'picked_up', 'cancelled'].includes(status)) reservation.status = status;
    if (paymentMethod && ['cash', 'pix', 'card', 'undefined'].includes(paymentMethod)) {
      reservation.paymentMethod = paymentMethod;
    }
    await reservation.save();

    res.json({ reservation });
  } catch (err) {
    console.error('Erro ao atualizar reserva:', err);
    res.status(500).json({ error: 'Não foi possível atualizar a reserva.' });
  }
});

module.exports = router;
