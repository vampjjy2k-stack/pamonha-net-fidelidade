// routes/client-reservations.js
// Reservas feitas pelo cliente. Protegido por auth.
const express = require('express');
const Reservation = require('../models/Reservation');
const Product = require('../models/Product');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// POST /api/client/reservations — cliente faz uma reserva
router.post('/', async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId) {
      return res.status(400).json({ error: 'Informe o produto.' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }
    if (!product.inStock) {
      return res.status(400).json({ error: 'Produto fora de estoque.' });
    }

    const reservation = await Reservation.create({
      userId: req.user.id,
      productId,
      quantity: Math.max(1, Number(quantity) || 1),
      status: 'pending',
      paymentMethod: 'undefined',
    });

    const populated = await Reservation.findById(reservation._id)
      .populate('productId', 'name priceCents imageUrl');

    res.status(201).json({ reservation: populated });
  } catch (err) {
    console.error('Erro ao criar reserva:', err);
    res.status(500).json({ error: 'Não foi possível criar a reserva.' });
  }
});

// GET /api/client/reservations — lista minhas reservas
router.get('/', async (req, res) => {
  try {
    const reservations = await Reservation.find({ userId: req.user.id })
      .populate('productId', 'name priceCents imageUrl')
      .sort({ createdAt: -1 });
    res.json({ reservations });
  } catch (err) {
    console.error('Erro ao listar reservas do cliente:', err);
    res.status(500).json({ error: 'Não foi possível carregar suas reservas.' });
  }
});

module.exports = router;
