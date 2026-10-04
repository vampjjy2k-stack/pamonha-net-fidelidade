// routes/auth.js — v10.4
// Novidade: no /register, o usuário nasce com "raspadinhaDisponivel: true".
// toPublicUser agora devolve esse campo pro frontend.

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const StampHistory = require('../models/StampHistory');
const Feedback = require('../models/Feedback');
const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const auth = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../utils/email');

const router = express.Router();

const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas tentativas de login. Aguarde 15 minutos e tente de novo.' } });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitos cadastros deste aparelho. Tente novamente mais tarde.' } });
const forgotLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 3, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitos pedidos de redefinição. Aguarde uma hora e tente de novo.' } });

function isValidBrazilianPhone(phone) {
  const digitsOnly = phone.replace(/\D/g, '');
  return /^[1-9]{2}9?[0-9]{8}$/.test(digitsOnly);
}
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function normalizePhone(phone) { return phone.replace(/\D/g, ''); }

function signToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function toPublicUser(user) {
  return {
    id: user._id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email || null,
    role: user.role,
    stamps: user.stamps,
    completedCards: user.completedCards || 0,
    lastStampAt: user.lastStampAt,
    createdAt: user.createdAt,
    raspadinhaDisponivel: user.raspadinhaDisponivel === true,
  };
}

router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { fullName, phone, email, password } = req.body;
    if (!fullName || !phone || !email || !password) return res.status(400).json({ error: 'Preencha nome, telefone, e-mail e senha.' });
    if (fullName.trim().length < 3) return res.status(400).json({ error: 'Informe seu nome completo.' });
    if (!isValidBrazilianPhone(phone)) return res.status(400).json({ error: 'Informe um telefone válido com DDD, ex: (21) 91234-5678.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
    if (password.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });

    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = email.trim().toLowerCase();

    const existingPhone = await User.findOne({ phone: normalizedPhone });
    if (existingPhone) return res.status(409).json({ error: 'Este telefone já está cadastrado. Faça login.' });
    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) return res.status(409).json({ error: 'Este e-mail já está cadastrado. Faça login.' });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      fullName: fullName.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      password: passwordHash,
      role: 'client',
      raspadinhaDisponivel: true, // v10.4: toda conta nova ganha raspadinha
    });

    const token = signToken(user);
    res.status(201).json({ token, user: toPublicUser(user) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Telefone ou e-mail já cadastrado. Faça login.' });
    console.error('Erro no cadastro:', err);
    res.status(500).json({ error: 'Não foi possível concluir o cadastro. Tente novamente.' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { identifier, phone, password } = req.body;
    const rawIdentifier = (identifier || phone || '').trim();
    if (!rawIdentifier || !password) return res.status(400).json({ error: 'Informe telefone ou e-mail, e senha.' });

    const looksLikeEmail = rawIdentifier.includes('@');
    const user = looksLikeEmail
      ? await User.findOne({ email: rawIdentifier.toLowerCase() })
      : await User.findOne({ phone: normalizePhone(rawIdentifier) });

    if (!user) return res.status(401).json({ error: 'Conta não encontrada com esses dados.' });

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) return res.status(401).json({ error: 'Senha incorreta.' });

    const token = signToken(user);
    res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Não foi possível fazer login. Tente novamente.' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível carregar os dados do usuário.' });
  }
});

router.put('/profile', auth, async (req, res) => {
  try {
    const { fullName, phone, email, password } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (fullName) {
      if (fullName.trim().length < 3) return res.status(400).json({ error: 'Nome precisa ter pelo menos 3 caracteres.' });
      user.fullName = fullName.trim();
    }
    if (phone) {
      const normalizedPhone = normalizePhone(phone);
      if (!isValidBrazilianPhone(phone)) return res.status(400).json({ error: 'Telefone inválido.' });
      const existing = await User.findOne({ phone: normalizedPhone, _id: { $ne: user._id } });
      if (existing) return res.status(409).json({ error: 'Telefone já cadastrado por outro usuário.' });
      user.phone = normalizedPhone;
    }
    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!isValidEmail(email)) return res.status(400).json({ error: 'E-mail inválido.' });
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
      if (existing) return res.status(409).json({ error: 'E-mail já cadastrado por outro usuário.' });
      user.email = normalizedEmail;
    }
    if (password) {
      if (password.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `Senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
      user.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    await user.save();
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Telefone ou e-mail já cadastrado por outro usuário.' });
    res.status(500).json({ error: 'Não foi possível atualizar o perfil.' });
  }
});

router.delete('/account', auth, async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (!password) return res.status(400).json({ error: 'Confirme sua senha para excluir a conta.' });
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) return res.status(401).json({ error: 'Senha incorreta.' });

    const userId = user._id;
    await Promise.all([
      StampHistory.deleteMany({ userId }),
      Feedback.deleteMany({ userId }),
      Notification.deleteMany({ userId }),
      PushSubscription.deleteMany({ userId }),
      User.deleteOne({ _id: userId }),
    ]);

    res.json({ message: 'Conta excluída com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível excluir a conta. Tente novamente.' });
  }
});

router.post('/forgot-password', forgotLimiter, async (req, res) => {
  const genericResponse = { message: 'Se encontrarmos uma conta com esses dados, enviaremos um e-mail com as instruções.' };
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: 'Informe seu telefone ou e-mail.' });

    const looksLikeEmail = identifier.includes('@');
    const user = looksLikeEmail
      ? await User.findOne({ email: identifier.trim().toLowerCase() })
      : await User.findOne({ phone: normalizePhone(identifier) });

    if (!user || !user.email) return res.json(genericResponse);

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();

    const baseUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${baseUrl}/?reset=${rawToken}`;
    await sendPasswordResetEmail({ to: user.email, fullName: user.fullName, resetUrl });
    res.json(genericResponse);
  } catch (err) {
    console.error('Erro ao solicitar redefinição de senha:', err);
    res.json(genericResponse);
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Link inválido. Peça uma nova redefinição.' });
    if (password.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({ resetPasswordTokenHash: tokenHash, resetPasswordExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ error: 'Este link expirou ou já foi usado. Peça uma nova redefinição.' });

    user.password = await bcrypt.hash(password, SALT_ROUNDS);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível redefinir a senha. Tente novamente.' });
  }
});

module.exports = router;
