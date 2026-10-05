// models/StampHistory.js
// Histórico de carimbos (adições/remoções), para auditoria de quem
// alterou o cartão de cada cliente e quando. Coleção: "stampHistory".

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
    // Origem: manual (admin), qr-scan (leitura de QR), venda (hub de vendas) ou redeem-reset (resgate/zeramento).
    source: {
      type: String,
      enum: ['manual', 'qr-scan', 'venda', 'redeem-reset'],
      default: 'manual',
    },
    // Referência opcional à venda que gerou este carimbo (quando source === 'venda').
    vendaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Venda',
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    collection: 'stampHistory',
  }
);

stampHistorySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('StampHistory', stampHistorySchema);
