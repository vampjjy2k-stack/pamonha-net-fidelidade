// models/Stamp.js
// Histórico de carimbos (adições/remoções) — coleção "stampHistory".
// Cada carimbo pode opcionalmente registrar QUAL produto e QUANTO foi gasto,
// o que alimenta as métricas reais de "produto preferido" e "total gasto" no CRM.
const mongoose = require('mongoose');

const stampHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      enum: ['add', 'remove'],
      required: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    source: {
      type: String,
      enum: ['manual', 'qr-scan', 'redeem-reset'],
      default: 'manual',
    },
    // Produto que gerou este carimbo (opcional — permite saber a preferência real do cliente).
    product: {
      type: String,
      enum: ['Pamonha Doce', 'Pamonha Salgada', 'Pamonha Recheada', 'Curau', null],
      default: null,
    },
    // Valor da compra que gerou este carimbo, em centavos (opcional).
    amountCents: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    collection: 'stampHistory',
  }
);

stampHistorySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('StampHistory', stampHistorySchema);
