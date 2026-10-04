// models/Notification.js
// v10.4: adicionado "type" (para marcar notificações de raspadinha) e "code".

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    read: { type: Boolean, default: false },
    broadcast: { type: Boolean, default: false },
    // v10.4
    type: { type: String, enum: ['normal', 'raspadinha'], default: 'normal' },
    raspadinhaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Raspadinha', default: null },
    code: { type: String, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ broadcast: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
