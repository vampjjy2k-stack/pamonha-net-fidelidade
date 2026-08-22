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
    // Telefone é o identificador único de login (em vez de e-mail), no formato BR.
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
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

module.exports = mongoose.model('User', userSchema);
