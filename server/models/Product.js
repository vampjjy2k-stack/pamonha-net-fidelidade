// models/Product.js
// Catálogo de produtos vendidos pela Pamonha Net (para o painel de gestão do admin).
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'O nome do produto é obrigatório.'],
      trim: true,
    },
    priceCents: {
      type: Number,
      required: [true, 'O preço é obrigatório.'],
      min: 0,
    },
    imageUrl: {
      type: String,
      default: '',
    },
    inStock: {
      type: Boolean,
      default: true,
    },
    category: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
