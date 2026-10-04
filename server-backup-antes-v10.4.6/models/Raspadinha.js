// models/Raspadinha.js
// Prêmio de boas-vindas: uma por conta, gerado quando o cliente raspa.

const mongoose = require('mongoose');

const raspadinhaSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    discountPercent: { type: Number, required: true, min: 1, max: 100 },
    status: { type: String, enum: ['active', 'used', 'cancelled'], default: 'active', index: true },
    usedAt: { type: Date, default: null },
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

raspadinhaSchema.index({ status: 1, createdAt: -1 });
raspadinhaSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Raspadinha', raspadinhaSchema);
