// models/User.js
// v10.4: adicionado campo "raspadinhaDisponivel".
// Default é false — só contas criadas a partir de agora ganham a raspadinha.

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'O nome completo é obrigatório.'],
      trim: true,
      minlength: [3, 'O nome precisa ter pelo menos 3 caracteres.'],
    },
    phone: { type: String, required: [true, 'O telefone é obrigatório.'], unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    password: { type: String, required: [true, 'A senha é obrigatória.'] },
    role: { type: String, enum: ['client', 'admin'], default: 'client' },
    stamps: { type: Number, default: 0, min: 0, max: 10 },
    completedCards: { type: Number, default: 0, min: 0 },
    lastStampAt: { type: Date, default: null },
    // v10.4: true = ainda pode raspar; false = já raspou (ou não tem direito).
    raspadinhaDisponivel: { type: Boolean, default: false },
    resetPasswordTokenHash: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

module.exports = mongoose.model('User', userSchema);
