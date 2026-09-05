/* ==========================================================================
   MODELS/MESSAGE.JS
   Mensagens/avisos enviados pelo admin — globais (para todos os clientes)
   ou individuais (para um cliente específico).
   ========================================================================== */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    body: { type: String, required: true, trim: true, maxlength: 400 },

    // 'global' = todos os clientes veem. 'individual' = só o cliente em "client".
    scope: { type: String, enum: ['global', 'individual'], required: true },

    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // clientes que já visualizaram esta mensagem (controla o badge de "não lida")
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // qual admin enviou (auditoria)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);
