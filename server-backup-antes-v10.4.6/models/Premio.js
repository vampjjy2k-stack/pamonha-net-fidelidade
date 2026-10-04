// models/Premio.js
// Prêmios cadastrados pelo admin. Aparecem para o cliente como referência.
// O resgate é manual (conversado no balcão) — o app só mostra a lista.

const mongoose = require('mongoose');

const premioSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'O nome do prêmio é obrigatório.'],
      trim: true,
      minlength: [2, 'O nome precisa ter pelo menos 2 caracteres.'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    // Quantos selos o cliente precisa ter para resgatar (padrão: cartão completo = 10).
    stampsRequired: {
      type: Number,
      default: 10,
      min: 1,
      max: 100,
    },
    imageUrl: {
      type: String,
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
    // Ordem de exibição (menor primeiro). Empate → ordem alfabética.
    order: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

premioSchema.index({ active: 1, order: 1, name: 1 });

module.exports = mongoose.model('Premio', premioSchema);
