// middleware/auth.js
// Verifica se a requisição tem um token JWT válido no header Authorization.
// Se válido, anexa os dados do usuário em req.user e deixa a requisição seguir.
const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // payload: { id, role, iat, exp }
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

module.exports = auth;
