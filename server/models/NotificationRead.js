// models/NotificationRead.js
// Registro de "visualizações" por cliente. Antes, o campo `read` ficava direto na notificação,
// o que fazia um aviso geral (broadcast) virar "lido" para TODO MUNDO assim que uma pessoa via.
// Agora cada visualização é seu próprio registro, então cada cliente tem seu próprio status,
// e o admin consegue ver exatamente quem já viu cada aviso.

const mongoose = require('mongoose');

const notificationReadSchema = new mongoose.Schema(
  {
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

notificationReadSchema.index({ notificationId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('NotificationRead', notificationReadSchema);
