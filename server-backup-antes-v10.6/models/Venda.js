
// models/Venda.js — v10
// Mudança v10: clientId agora é opcional, para permitir "venda avulsa" (sem cartão fidelidade).

const mongoose = require('mongoose');

const vendaItemSchema = new mongoose.Schema(
  {
    produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Produto', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, required: true, min: 0, default: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const vendaSchema = new mongoose.Schema(
  {
    // v10: opcional. null = venda avulsa (sem cartão, só gráficos).
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: {
      type: [vendaItemSchema],
      required: true,
      validate: [(arr) => arr.length > 0, 'A venda precisa ter pelo menos 1 item.'],
    },
    totalValue: { type: Number, required: true, min: 0 },
    totalCost: { type: Number, default: 0, min: 0 },
    stampsGiven: { type: Number, required: true, min: 0 },
    gps: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    localId: { type: mongoose.Schema.Types.ObjectId, ref: 'Local', default: null },
    localName: { type: String, default: null },
    completedCardOnThisSale: { type: Boolean, default: false },
  },
  { timestamps: true }
);

vendaSchema.index({ localId: 1, createdAt: -1 });
vendaSchema.index({ clientId: 1, createdAt: -1 });

module.exports = mongoose.model('Venda', vendaSchema);
