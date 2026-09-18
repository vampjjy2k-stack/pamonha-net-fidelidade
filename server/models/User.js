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
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      unique: true,
      match: [/^\S+@\S+\.\S+$/, 'Informe um e-mail válido.'],
    },
    // Telefone é um identificador de login, no formato BR.
    phone: {
      type: String,
      required: [true, 'O telefone é obrigatório.'],
      unique: true,
      trim: true,
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
    completedCards: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastStampAt: {
      type: Date,
      default: null,
    },
    resetTokenHash: { type: String, default: null, select: false },
    resetTokenExpiresAt: { type: Date, default: null, select: false },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

module.exports = mongoose.model('User', userSchema);
