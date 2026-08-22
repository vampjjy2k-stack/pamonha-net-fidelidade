// models/Stamp.js
// Representa o histórico de carimbos (adições/remoções), para auditoria de quem
// alterou o cartão de cada cliente e quando. Coleção no MongoDB: "stampHistory".
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
    // Quem realizou a ação: o ID de um admin, ou null quando foi automático via QR code.
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Guardamos também a origem, útil para diferenciar carimbo manual x escaneado por QR.
    source: {
      type: String,
      enum: ['manual', 'qr-scan', 'redeem-reset'],
      default: 'manual',
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    collection: 'stampHistory',
  }
);

stampHistorySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('StampHistory', stampHistorySchema);
