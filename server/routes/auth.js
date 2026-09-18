// routes/auth.js
// Rotas públicas de autenticação: cadastro, login, "quem sou eu" e atualização de perfil.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function toPublicUser(user) {
  return {
    id: user._id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email || '',
    role: user.role,
    stamps: user.stamps,
    completedCards: user.completedCards || 0,
    lastStampAt: user.lastStampAt || null,
    createdAt: user.createdAt,
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body;

    if (!fullName || !email || !phone || !password) {
      return res.status(400).json({ error: 'Preencha nome, e-mail, telefone e senha.' });
    }
    if (fullName.trim().length < 3) {
      return res.status(400).json({ error: 'Informe seu nome completo.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    if (!isValidBrazilianPhone(phone)) {
      return res.status(400).json({ error: 'Informe um telefone válido com DDD, ex: (21) 91234-5678.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
    }

    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await User.findOne({ $or: [{ phone: normalizedPhone }, { email: normalizedEmail }] });
    if (existing) {
      return res.status(409).json({ error: existing.email === normalizedEmail ? 'Este e-mail já está cadastrado.' : 'Este telefone já está cadastrado. Faça login.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
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
    const { identifier, phone, email, password } = req.body;
    const loginValue = (identifier || email || phone || '').trim();
    if (!loginValue || !password) {
      return res.status(400).json({ error: 'Informe e-mail ou telefone e sua senha.' });
    }

    const isEmail = loginValue.includes('@');
    const query = isEmail ? { email: loginValue.toLowerCase() } : { phone: normalizePhone(loginValue) };
    const user = await User.findOne(query);
    if (!user) {
      return res.status(401).json({ error: 'E-mail/telefone ou senha incorretos.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'E-mail/telefone ou senha incorretos.' });
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

// PUT /api/auth/profile — Atualização de dados do cliente (nome, telefone, senha)
router.put('/profile', auth, async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (fullName) {
      if (fullName.trim().length < 3) {
        return res.status(400).json({ error: 'Nome precisa ter pelo menos 3 caracteres.' });
      }
      user.fullName = fullName.trim();
    }

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return res.status(400).json({ error: 'E-mail inválido.' });
      const existingEmail = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
      if (existingEmail) return res.status(409).json({ error: 'E-mail já cadastrado por outro usuário.' });
      user.email = normalizedEmail;
    }

    if (phone) {
      const normalizedPhone = normalizePhone(phone);
      if (!isValidBrazilianPhone(phone)) {
        return res.status(400).json({ error: 'Telefone inválido.' });
      }
      const existing = await User.findOne({ phone: normalizedPhone, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({ error: 'Telefone já cadastrado por outro usuário.' });
      }
      user.phone = normalizedPhone;
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Senha precisa ter pelo menos 6 caracteres.' });
      }
      user.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    await user.save();
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error('Erro ao atualizar perfil:', err);
    res.status(500).json({ error: 'Não foi possível atualizar o perfil.' });
  }
});


// POST /api/auth/forgot-password — cria um token de recuperação.
// O envio por e-mail é deixado para o provedor de e-mail configurado no ambiente.
router.post('/forgot-password', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const generic = { message: 'Se este e-mail estiver cadastrado, você receberá instruções para recuperar a conta.' };
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.json(generic);
  const user = await User.findOne({ email }).select('+resetTokenHash +resetTokenExpiresAt');
  if (!user) return res.json(generic);
  const rawToken = crypto.randomBytes(32).toString('hex');
  user.resetTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  user.resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await user.save();
  // Em produção, conectar este token a um provedor de e-mail (SMTP/Resend).
  console.info(`Token de recuperação criado para ${email}. Configure o provedor de e-mail para enviá-lo.`);
  if (process.env.NODE_ENV !== 'production') console.info(`RESET_TOKEN=${rawToken}`);
  res.json(generic);
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 6) return res.status(400).json({ error: 'Token e senha válida são obrigatórios.' });
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({ resetTokenHash: hash, resetTokenExpiresAt: { $gt: new Date() } }).select('+resetTokenHash +resetTokenExpiresAt');
  if (!user) return res.status(400).json({ error: 'Link de recuperação inválido ou expirado.' });
  user.password = await bcrypt.hash(password, SALT_ROUNDS);
  user.resetTokenHash = null;
  user.resetTokenExpiresAt = null;
  await user.save();
  res.json({ message: 'Senha alterada. Você já pode entrar.' });
});

// DELETE /api/auth/account — confirmação dupla no cliente e senha no servidor.
router.delete('/account', auth, async (req, res) => {
  const { confirmation, password } = req.body;
  if (confirmation !== 'EXCLUIR MINHA CONTA' || !password) return res.status(400).json({ error: 'Digite a confirmação e sua senha.' });
  const user = await User.findById(req.user.id);
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Senha incorreta.' });
  await User.deleteOne({ _id: user._id });
  res.json({ message: 'Conta excluída.' });
});

module.exports = router;
