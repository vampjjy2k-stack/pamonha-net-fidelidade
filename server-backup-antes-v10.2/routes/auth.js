// routes/auth.js
// Rotas públicas de autenticação: cadastro, login (telefone OU e-mail), recuperação de senha,
// "quem sou eu", atualização de perfil e exclusão de conta.

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutos

// Aceita telefones BR com ou sem formatação: (21) 91234-5678, 21912345678, etc.
// Exige DDD (2 dígitos) + 8 ou 9 dígitos do número.
function isValidBrazilianPhone(phone) {
  const digitsOnly = phone.replace(/\D/g, '');
  return /^[1-9]{2}9?[0-9]{8}$/.test(digitsOnly);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    email: user.email || null,
    role: user.role,
    stamps: user.stamps,
    completedCards: user.completedCards || 0,
    lastStampAt: user.lastStampAt,
    createdAt: user.createdAt,
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { fullName, phone, email, password } = req.body;

    if (!fullName || !phone || !email || !password) {
      return res.status(400).json({ error: 'Preencha nome, telefone, e-mail e senha.' });
    }
    if (fullName.trim().length < 3) {
      return res.status(400).json({ error: 'Informe seu nome completo.' });
    }
    if (!isValidBrazilianPhone(phone)) {
      return res.status(400).json({ error: 'Informe um telefone válido com DDD, ex: (21) 91234-5678.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
    }

    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = email.trim().toLowerCase();

    const existingPhone = await User.findOne({ phone: normalizedPhone });
    if (existingPhone) {
      return res.status(409).json({ error: 'Este telefone já está cadastrado. Faça login.' });
    }
    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado. Faça login.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      fullName: fullName.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      password: passwordHash,
      role: 'client',
    });

    const token = signToken(user);
    res.status(201).json({ token, user: toPublicUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Telefone ou e-mail já cadastrado. Faça login.' });
    }
    console.error('Erro no cadastro:', err);
    res.status(500).json({ error: 'Não foi possível concluir o cadastro. Tente novamente.' });
  }
});

// POST /api/auth/login { identifier, password } — identifier pode ser telefone ou e-mail
router.post('/login', async (req, res) => {
  try {
    const { identifier, phone, password } = req.body;
    // Aceita tanto "identifier" (novo) quanto "phone" (compatibilidade com versões antigas do app).
    const rawIdentifier = (identifier || phone || '').trim();
    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: 'Informe telefone ou e-mail, e senha.' });
    }

    const looksLikeEmail = rawIdentifier.includes('@');
    const user = looksLikeEmail
      ? await User.findOne({ email: rawIdentifier.toLowerCase() })
      : await User.findOne({ phone: normalizePhone(rawIdentifier) });

    if (!user) {
      return res.status(401).json({ error: 'Conta não encontrada com esses dados.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Senha incorreta.' });
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

// PUT /api/auth/profile — Atualização de dados do cliente (nome, telefone, e-mail, senha)
router.put('/profile', auth, async (req, res) => {
  try {
    const { fullName, phone, email, password } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (fullName) {
      if (fullName.trim().length < 3) {
        return res.status(400).json({ error: 'Nome precisa ter pelo menos 3 caracteres.' });
      }
      user.fullName = fullName.trim();
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

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'E-mail inválido.' });
      }
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({ error: 'E-mail já cadastrado por outro usuário.' });
      }
      user.email = normalizedEmail;
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
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Telefone ou e-mail já cadastrado por outro usuário.' });
    }
    console.error('Erro ao atualizar perfil:', err);
    res.status(500).json({ error: 'Não foi possível atualizar o perfil.' });
  }
});

// DELETE /api/auth/account { password } — exclusão definitiva da conta e de todos os dados
// associados. A dupla confirmação ("digite EXCLUIR" etc.) acontece no app; aqui exigimos a
// senha atual como segunda barreira do lado do servidor.
router.delete('/account', auth, async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (!password) {
      return res.status(400).json({ error: 'Confirme sua senha para excluir a conta.' });
    }
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

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
    console.error('Erro ao excluir conta:', err);
    res.status(500).json({ error: 'Não foi possível excluir a conta. Tente novamente.' });
  }
});

// POST /api/auth/forgot-password { identifier } — sempre responde com sucesso genérico,
// para não revelar se um e-mail/telefone existe ou não na base (proteção contra enumeração).
router.post('/forgot-password', async (req, res) => {
  const genericResponse = {
    message: 'Se encontrarmos uma conta com esses dados, enviaremos um e-mail com as instruções.',
  };
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: 'Informe seu telefone ou e-mail.' });

    const looksLikeEmail = identifier.includes('@');
    const user = looksLikeEmail
      ? await User.findOne({ email: identifier.trim().toLowerCase() })
      : await User.findOne({ phone: normalizePhone(identifier) });

    // Sem conta encontrada, ou conta sem e-mail cadastrado: mesma resposta genérica, sem enviar nada.
    if (!user || !user.email) {
      return res.json(genericResponse);
    }

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

// POST /api/auth/reset-password { token, password }
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Link inválido. Peça uma nova redefinição.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Este link expirou ou já foi usado. Peça uma nova redefinição.' });
    }

    user.password = await bcrypt.hash(password, SALT_ROUNDS);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
  } catch (err) {
    console.error('Erro ao redefinir senha:', err);
    res.status(500).json({ error: 'Não foi possível redefinir a senha. Tente novamente.' });
  }
});

module.exports = router;
