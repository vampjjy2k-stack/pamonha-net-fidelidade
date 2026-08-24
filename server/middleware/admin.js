// middleware/admin.js
// Deve ser usado SEMPRE depois do middleware "auth" nas rotas.
// Garante que apenas usuários com role "admin" acessem as rotas administrativas.
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  next();
}

module.exports = adminOnly;
