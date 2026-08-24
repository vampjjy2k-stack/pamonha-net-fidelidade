// routes/admin-reservations.js
// Gerenciamento de reservas pelo admin. Protegido por auth + adminOnly.
const express = require('express');
const Reservation = require('../models/Reservation');
const User = require('../models/User');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');

const router = express.Router();
router.use(auth, adminOnly);

// GET /api/admin/reservations — lista com filtro por status
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status && ['pending', 'picked_up', 'cancelled'].includes(status)) {
      query.status = status;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const [reservations, total] = await Promise.all([
      Reservation.find(query)
        .populate('userId', 'fullName phone')
        .populate('productId', 'name priceCents')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      Reservation.countDocuments(query),
    ]);

    res.json({
      reservations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error('Erro ao listar reservas:', err);
    res.status(500).json({ error: 'Não foi possível carregar as reservas.' });
  }
});

// GET /api/admin/reservations/count-pending — contagem rápida para o badge
router.get('/count-pending', async (req, res) => {
  try {
    const count = await Reservation.countDocuments({ status: 'pending' });
    res.json({ count });
  } catch (err) {
    console.error('Erro ao contar reservas pendentes:', err);
    res.status(500).json({ error: 'Não foi possível contar as reservas.' });
  }
});

// PATCH /api/admin/reservations/:id — atualiza status e/ou pagamento
router.patch('/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.status && ['pending', 'picked_up', 'cancelled'].includes(req.body.status)) {
      updates.status = req.body.status;
    }
    if (req.body.paymentMethod && ['cash', 'pix', 'card', 'undefined'].includes(req.body.paymentMethod)) {
      updates.paymentMethod = req.body.paymentMethod;
    }

    const reservation = await Reservation.findById(req.params.id).populate('productId', 'name priceCents');
    if (!reservation) {
      return res.status(404).json({ error: 'Reserva não encontrada.' });
    }

    const oldStatus = reservation.status;
    if (updates.status) {
      if (oldStatus === 'picked_up' && updates.status !== 'picked_up') {
        return res.status(400).json({ error: 'Uma reserva já retirada não pode voltar para outro status.' });
      }
      if (oldStatus === 'cancelled' && updates.status !== 'cancelled') {
        return res.status(400).json({ error: 'Uma reserva cancelada não pode ser reaberta.' });
      }
      reservation.status = updates.status;
    }
    if (updates.paymentMethod) reservation.paymentMethod = updates.paymentMethod;

    await reservation.save();

    // Conta a compra no CRM apenas na transição para "picked_up".
    if (oldStatus !== 'picked_up' && reservation.status === 'picked_up') {
      const user = await User.findById(reservation.userId);
      if (user && reservation.productId) {
        user.totalSpent = (user.totalSpent || 0) + (reservation.productId.priceCents || 0) * reservation.quantity;
        user.lastVisitAt = new Date();
        await user.save();
      }
    }

    const populated = await Reservation.findById(reservation._id)
      .populate('userId', 'fullName phone')
      .populate('productId', 'name priceCents');
    res.json({ reservation: populated });
  } catch (err) {
    console.error('Erro ao atualizar reserva:', err);
    res.status(500).json({ error: 'Não foi possível atualizar a reserva.' });
  }
});

module.exports = router;
