/* ==========================================================================
   MODELS/FEEDBACK.JS
   Avaliação enviada pelo cliente: nota para atendimento, nota para
   produtos, e um comentário livre opcional.
   ========================================================================== */

const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    serviceRating: { type: Number, required: true, min: 1, max: 5 },
    productRating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Feedback', feedbackSchema);
