// models/Produto.js
// Catálogo de produtos vendidos (ex: "Pamonha doce", "Pamonha salgada", "Curau").
// Cadastrado pelo admin e usado no hub de vendas, aberto ao escanear o QR do cliente.

const mongoose = require('mongoose');

const produtoSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'O nome do produto é obrigatório.'],
      trim: true,
      minlength: [2, 'O nome precisa ter pelo menos 2 caracteres.'],
    },
    price: {
      type: Number,
      required: [true, 'O preço do produto é obrigatório.'],
      min: [0, 'O preço não pode ser negativo.'],
    },
    // Imagem em data URL (base64) — mesmo padrão simples usado no resto do projeto,
    // sem depender de armazenamento externo.
    imageUrl: {
      type: String,
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

produtoSchema.index({ active: 1, name: 1 });

module.exports = mongoose.model('Produto', produtoSchema);
