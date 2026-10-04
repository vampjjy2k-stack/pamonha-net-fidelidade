// models/ParticipanteRaspadinha.js
// Registra quem já ganhou raspadinha, por hash de telefone e e-mail.
// Nunca é apagado — garante que apagar a conta não libere uma nova raspadinha.

const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    phoneHash: { type: String, required: true, unique: true, index: true },
    emailHash: { type: String, default: null, index: true },
    firstRaspadinhaAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ParticipanteRaspadinha', schema);
