// middleware/admin.js
// Dupla verificação de acesso administrativo.
// Deve ser aplicado APÓS o middleware auth.js.
// Garante que req.user.role === 'admin'.

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Acesso restrito a administradores.' });
};

module.exports = adminOnly;
