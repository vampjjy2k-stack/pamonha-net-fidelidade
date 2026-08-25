// models/User.js
// Representa um usuário do sistema: pode ser "client" (cliente da pamonharia) ou "admin".
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'O nome completo é obrigatório.'],
      trim: true,
      minlength: [3, 'O nome precisa ter pelo menos 3 caracteres.'],
    },
    phone: {
      type: String,
      required: [true, 'O telefone é obrigatório.'],
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'A senha é obrigatória.'],
    },
    role: {
      type: String,
      enum: ['client', 'admin'],
      default: 'client',
    },
    stamps: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
    // --- Campos de CRM (alimentados de verdade pelo histórico de carimbos) ---
    // Somado sempre que um carimbo é lançado com um valor de compra associado.
    totalSpentCents: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Atualizado a cada novo carimbo (manual ou via QR).
    lastVisitAt: {
      type: Date,
      default: null,
    },
    // Recalculado em lote (job diário) a partir de recência + frequência + valor gasto.
    segment: {
      type: String,
      enum: ['premium', 'regular', 'churn_risk', 'novo'],
      default: 'novo',
    },
    segmentUpdatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

module.exports = mongoose.model('User', userSchema);
