// models/Venda.js
// Registro de uma venda feita no "hub de vendas", aberto ao escanear o QR do cliente.
// Cada venda gera: 1 selo por unidade de produto comprada, e um valor total usado
// depois no gráfico de faturamento por local. Guarda uma "foto" (snapshot) do nome/preço
// do produto no momento da venda, para o histórico não mudar se o produto for editado depois.

const mongoose = require('mongoose');

const vendaItemSchema = new mongoose.Schema(
  {
    produtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Produto',
      required: true,
    },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const vendaSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: {
      type: [vendaItemSchema],
      required: true,
      validate: [(arr) => arr.length > 0, 'A venda precisa ter pelo menos 1 item.'],
    },
    // Soma de price*quantity de todos os itens.
    totalValue: {
      type: Number,
      required: true,
      min: 0,
    },
    // Soma de quantity de todos os itens = quantos selos essa venda deu.
    stampsGiven: {
      type: Number,
      required: true,
      min: 0,
    },
    // GPS bruto capturado no momento da venda (celular do admin).
    gps: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    // Local casado (por raio automático, ou escolhido manualmente pelo admin quando
    // nenhum local cobria o ponto). Null = "local não identificado".
    localId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Local',
      default: null,
    },
    // Snapshot do nome do local no momento da venda (sobrevive se o local for renomeado/apagado depois).
    localName: {
      type: String,
      default: null,
    },
    // true quando esta venda foi a que levou o cliente de <10 para 10/10 selos —
    // usado para contar "cartões fechados por local" sem depender do momento (posterior)
    // em que o admin efetivamente reseta o cartão.
    completedCardOnThisSale: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

vendaSchema.index({ localId: 1, createdAt: -1 });
vendaSchema.index({ clientId: 1, createdAt: -1 });

module.exports = mongoose.model('Venda', vendaSchema);
