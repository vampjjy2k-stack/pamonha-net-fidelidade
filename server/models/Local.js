// models/Local.js
// Locais/feiras cadastrados pelo admin (ex: "Feira da Figueira", "Ponto fixo - Xerém").
// Usado para simplificar o GPS bruto de uma venda em um nome de lugar reconhecível,
// e para agrupar os gráficos de cartões fechados e faturamento por local.

const mongoose = require('mongoose');

const localSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'O nome do local é obrigatório.'],
      trim: true,
      minlength: [2, 'O nome precisa ter pelo menos 2 caracteres.'],
    },
    // Coordenadas de referência do local (centro do raio de detecção).
    lat: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    lng: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    // Raio, em metros, dentro do qual uma venda é considerada "neste local".
    radiusMeters: {
      type: Number,
      default: 150,
      min: 10,
      max: 5000,
    },
    active: {
      type: Boolean,
      default: true,
    },
    // Quem cadastrou (admin), para auditoria.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

localSchema.index({ active: 1, name: 1 });

module.exports = mongoose.model('Local', localSchema);
