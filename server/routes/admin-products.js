// routes/admin-products.js
// Gestão do catálogo de produtos (preço e estoque).
const express = require('express');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');

const router = express.Router();
router.use(auth, adminOnly);

// GET /api/admin/products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: 1 });
    res.json({ products });
  } catch (err) {
    console.error('Erro ao listar produtos:', err);
    res.status(500).json({ error: 'Não foi possível carregar o catálogo.' });
  }
});

// POST /api/admin/products
router.post('/', async (req, res) => {
  try {
    const { name, priceCents, imageUrl = '', inStock = true, category = '' } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome do produto.' });
    if (priceCents === undefined || priceCents < 0) return res.status(400).json({ error: 'Informe um preço válido.' });

    const product = await Product.create({ name: name.trim(), priceCents, imageUrl, inStock, category });
    res.status(201).json({ product });
  } catch (err) {
    console.error('Erro ao criar produto:', err);
    res.status(500).json({ error: 'Não foi possível criar o produto.' });
  }
});

// PATCH /api/admin/products/:id  { name?, priceCents?, imageUrl?, inStock?, category? }
router.patch('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });

    const { name, priceCents, imageUrl, inStock, category } = req.body;
    if (name !== undefined) product.name = name.trim();
    if (priceCents !== undefined) product.priceCents = priceCents;
    if (imageUrl !== undefined) product.imageUrl = imageUrl;
    if (inStock !== undefined) product.inStock = inStock;
    if (category !== undefined) product.category = category;

    await product.save();
    res.json({ product });
  } catch (err) {
    console.error('Erro ao atualizar produto:', err);
    res.status(500).json({ error: 'Não foi possível atualizar o produto.' });
  }
});

// DELETE /api/admin/products/:id
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
    res.json({ message: 'Produto removido.' });
  } catch (err) {
    console.error('Erro ao remover produto:', err);
    res.status(500).json({ error: 'Não foi possível remover o produto.' });
  }
});

module.exports = router;
