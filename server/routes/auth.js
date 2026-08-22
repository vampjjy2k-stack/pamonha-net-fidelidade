// routes/auth.js
// Rotas públicas de autenticação: cadastro, login e "quem sou eu".
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 10;

// Aceita telefones BR com ou sem formatação: (21) 91234-5678, 21912345678, etc.
// Exige DDD (2 dígitos) + 8 ou 9 dígitos do número.
function isValidBrazilianPhone(phone) {
  const digitsOnly = phone.replace(/\D/g, '');
  return /^[1-9]{2}9?[0-9]{8}$/.test(digitsOnly);
}

function normalizePhone(phone) {
  return phone.replace(/\D/g, '');
}

function signToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

function toPublicUser(user) {
  return {
    id: user._id,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    stamps: user.stamps,
    createdAt: user.createdAt,
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { fullName, phone, password } = req.body;

    if (!fullName || !phone || !password) {
      return res.status(400).json({ error: 'Preencha nome, telefone e senha.' });
    }
    if (fullName.trim().length < 3) {
      return res.status(400).json({ error: 'Informe seu nome completo.' });
    }
    if (!isValidBrazilianPhone(phone)) {
      return res.status(400).json({ error: 'Informe um telefone válido com DDD, ex: (21) 91234-5678.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
    }

    const normalizedPhone = normalizePhone(phone);

    const existing = await User.findOne({ phone: normalizedPhone });
    if (existing) {
      return res.status(409).json({ error: 'Este telefone já está cadastrado. Faça login.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      fullName: fullName.trim(),
      phone: normalizedPhone,
      password: passwordHash,
      role: 'client',
    });

    const token = signToken(user);
    res.status(201).json({ token, user: toPublicUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Este telefone já está cadastrado. Faça login.' });
    }
    console.error('Erro no cadastro:', err);
    res.status(500).json({ error: 'Não foi possível concluir o cadastro. Tente novamente.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Informe telefone e senha.' });
    }

    const normalizedPhone = normalizePhone(phone);
    const user = await User.findOne({ phone: normalizedPhone });
    if (!user) {
      return res.status(401).json({ error: 'Telefone ou senha incorretos.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Telefone ou senha incorretos.' });
    }

    const token = signToken(user);
    res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Não foi possível fazer login. Tente novamente.' });
  }
});

// GET /api/auth/me — retorna os dados do usuário logado a partir do token
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    res.status(500).json({ error: 'Não foi possível carregar os dados do usuário.' });
  }
});

module.exports = router;
