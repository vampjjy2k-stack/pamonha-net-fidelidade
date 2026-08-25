// models/Redemption.js
// Representa o resgate de um prêmio (produto grátis) quando o cliente completa 10 carimbos.
const mongoose = require('mongoose');

const redemptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    product: {
      type: String,
      required: true,
      enum: ['Pamonha Doce', 'Pamonha Salgada', 'Pamonha Recheada', 'Curau'],
    },
    redeemedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

redemptionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Redemption', redemptionSchema);
