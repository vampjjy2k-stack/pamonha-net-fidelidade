// models/Reservation.js
// Reserva de produto feita pelo cliente no app, para retirada no balcão.
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
    productName: {
      // guardado também "achatado" para não depender de populate em toda listagem
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
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
  { timestamps: true }
);

reservationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Reservation', reservationSchema);
