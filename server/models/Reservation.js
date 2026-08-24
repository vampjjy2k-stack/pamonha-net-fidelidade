// models/Reservation.js
// Reservas de produtos feitas pelos clientes.
const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    status: {
      type: String,
      enum: ['pending', 'picked_up', 'cancelled'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'pix', 'card', 'undefined'],
      default: 'undefined',
    },
  },
  {
    timestamps: true,
  }
);

reservationSchema.index({ userId: 1, createdAt: -1 });
reservationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Reservation', reservationSchema);
