// models/Feedback.js
// Avaliações enviadas pelos clientes: 3 notas rápidas (experiência, sabor, atendimento) + comentário livre.

const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // "Como foi sua experiência na Pamonha Net?"
    experienceRating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    // "O que você achou do sabor da Pamonha Net?"
    tasteRating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    // "Como foi o atendimento?"
    serviceRating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    // Média das 3 notas, calculada automaticamente — facilita ordenar/exibir no painel.
    average: {
      type: Number,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

feedbackSchema.pre('validate', function calcAverage(next) {
  if (this.experienceRating && this.tasteRating && this.serviceRating) {
    const avg = (this.experienceRating + this.tasteRating + this.serviceRating) / 3;
    this.average = Math.round(avg * 10) / 10;
  }
  next();
});

feedbackSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
