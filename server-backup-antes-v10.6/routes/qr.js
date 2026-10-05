
// routes/qr.js
// Módulo auxiliar de QR Code. Gera o token (cliente) e valida (admin).
// v10: verifyQrToken aceita URL completa (?scan=TOKEN) além do token cru,
// porque o QR agora é lido pela câmera NATIVA do celular, que abre a URL inteira.

const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');

const QR_TOKEN_TTL_SECONDS = 5 * 60; // 5 minutos

function generateQrToken(userId) {
  return jwt.sign(
    { sub: userId, purpose: 'qr-stamp' },
    process.env.JWT_SECRET,
    { expiresIn: QR_TOKEN_TTL_SECONDS }
  );
}

/**
 * Extrai o token de QR de uma string. Aceita:
 *  - token JWT cru (ex: "eyJhbGciOi...")
 *  - URL completa (ex: "https://site.com/?scan=eyJhbGciOi...")   ← câmera nativa
 *  - string com query string solta (ex: "?scan=eyJhbGciOi...")
 */
function extractToken(raw) {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  // Formato 1: já é token cru (começa com "ey")
  if (/^ey[A-Za-z0-9_-]+\./.test(trimmed)) return trimmed;
  // Formato 2: URL completa ou query solta
  const match = trimmed.match(/[?&]scan=([^&\s]+)/);
  if (match) {
    try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
  }
  // Formato 3: tenta new URL
  try {
    const url = new URL(trimmed);
    const t = url.searchParams.get('scan');
    if (t) return t;
  } catch (_) { /* não era URL */ }
  return trimmed;
}

function verifyQrToken(rawToken) {
  const token = extractToken(rawToken);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      const expiredError = new Error('Este QR Code expirou. Peça para o cliente gerar um novo.');
      expiredError.code = 'QR_EXPIRED';
      throw expiredError;
    }
    const invalidError = new Error('QR Code inválido.');
    invalidError.code = 'QR_INVALID';
    throw invalidError;
  }
  if (payload.purpose !== 'qr-stamp') {
    const wrongPurposeError = new Error('QR Code inválido para esta operação.');
    wrongPurposeError.code = 'QR_INVALID';
    throw wrongPurposeError;
  }
  return payload.sub;
}

async function generateQrImage(token) {
  const darkColor = process.env.QR_COLOR_DARK || '#5D4037';
  const lightColor = process.env.QR_COLOR_LIGHT || '#FFFDE7';
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: { dark: darkColor, light: lightColor },
  });
}

module.exports = {
  QR_TOKEN_TTL_SECONDS,
  generateQrToken,
  verifyQrToken,
  extractToken,
  generateQrImage,
};
