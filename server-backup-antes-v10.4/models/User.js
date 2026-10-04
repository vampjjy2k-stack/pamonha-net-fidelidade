// models/User.js
// Representa um usuário do sistema: "client" (cliente da pamonharia) ou "admin".

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'O nome completo é obrigatório.'],
      trim: true,
      minlength: [3, 'O nome precisa ter pelo menos 3 caracteres.'],
    },
    // Telefone continua sendo um identificador de login válido, no formato BR (só dígitos).
    phone: {
      type: String,
      required: [true, 'O telefone é obrigatório.'],
      unique: true,
      trim: true,
    },
    // E-mail: usado para login alternativo e para recuperação de senha.
    // "sparse" permite múltiplos documentos sem e-mail (contas antigas) sem violar o índice único.
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    // Nunca armazenamos a senha em texto puro — sempre o hash gerado pelo bcrypt.
    password: {
      type: String,
      required: [true, 'A senha é obrigatória.'],
    },
    role: {
      type: String,
      enum: ['client', 'admin'],
      default: 'client',
    },
    // Número de carimbos atuais no cartão fidelidade (0 a 10).
    stamps: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
    // Quantos cartões o cliente já completou e resgatou ao longo do tempo (ranking).
    completedCards: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Data do último carimbo recebido — usada para detectar clientes inativos.
    lastStampAt: {
      type: Date,
      default: null,
    },
    // Recuperação de senha por e-mail: hash do token (nunca o token em si) + expiração.
    resetPasswordTokenHash: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

module.exports = mongoose.model('User', userSchema);
