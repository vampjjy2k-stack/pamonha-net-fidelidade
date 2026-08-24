// routes/admin-products.js
// CRUD de produtos no catálogo. Protegido por auth + adminOnly.
const express = require('express');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');

const router = express.Router();
router.use(auth, adminOnly);

// GET /api/admin/products — lista todos os produtos
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json({ products });
  } catch (err) {
    console.error('Erro ao listar produtos:', err);
    res.status(500).json({ error: 'Não foi possível carregar os produtos.' });
  }
});

// POST /api/admin/products — cria novo produto
router.post('/', async (req, res) => {
  try {
    const { name, priceCents, imageUrl, inStock, category } = req.body;
    if (!name || priceCents === undefined) {
      return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
    }
    const numericPrice = Number(priceCents);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: 'Preço inválido.' });
    }
    const product = await Product.create({
      name: name.trim(),
      priceCents: Math.round(numericPrice),
      imageUrl: imageUrl || '',
      inStock: inStock !== undefined ? Boolean(inStock) : true,
      category: category || '',
    });
    res.status(201).json({ product });
  } catch (err) {
    console.error('Erro ao criar produto:', err);
    res.status(500).json({ error: 'Não foi possível criar o produto.' });
  }
});

// PATCH /api/admin/products/:id — atualiza produto
router.patch('/:id', async (req, res) => {
  try {
    const updates = {};
    const allowed = ['name', 'priceCents', 'imageUrl', 'inStock', 'category'];
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) {
        if (key === 'priceCents') {
          const value = Number(req.body[key]);
          if (!Number.isFinite(value) || value < 0) throw new Error('Preço inválido.');
          updates[key] = Math.round(value);
        }
        else if (key === 'inStock') updates[key] = Boolean(req.body[key]);
        else updates[key] = req.body[key].trim ? req.body[key].trim() : req.body[key];
      }
    });

    const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }
    res.json({ product });
  } catch (err) {
    console.error('Erro ao atualizar produto:', err);
    res.status(500).json({ error: 'Não foi possível atualizar o produto.' });
  }
});

// DELETE /api/admin/products/:id — remove produto
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }
    res.json({ message: 'Produto removido com sucesso.' });
  } catch (err) {
    console.error('Erro ao remover produto:', err);
    res.status(500).json({ error: 'Não foi possível remover o produto.' });
  }
});

module.exports = router;
