// models/Notification.js
// Notificações compostas pelo admin e enviadas para todos os clientes ou para um específico.
// Suporta um prazo de validade opcional, para promoções do tipo "relâmpago"/"happy hour".
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: [true, 'A mensagem é obrigatória.'],
      trim: true,
    },
    imageUrl: {
      type: String,
      default: '',
    },
    audience: {
      type: String,
      enum: ['all', 'single'],
      required: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Se definido, a notificação some da lista do cliente após esse horário
    // (usado para promoções por tempo limitado).
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

notificationSchema.index({ audience: 1, targetUserId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
