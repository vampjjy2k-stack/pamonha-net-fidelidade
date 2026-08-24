// routes/qr.js
// Módulo auxiliar de QR Code, usado pelas rotas de cliente (gerar) e admin (escanear).
// Não é montado como um router próprio: suas funções são importadas por client.js e admin.js.
//
// O QR Code NUNCA contém só o userId "cru" — isso permitiria que qualquer pessoa forjasse
// um QR de outro cliente. Em vez disso, geramos um token JWT de curtíssima duração (5 minutos)
// e com um propósito específico ("qr-stamp"), assinado com o mesmo JWT_SECRET do sistema.
// O backend valida a assinatura, o propósito e a validade antes de liberar o carimbo.

const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');

const QR_TOKEN_TTL_SECONDS = 5 * 60; // 5 minutos

/**
 * Gera um token de QR Code único e temporário para um usuário.
 * @param {string} userId
 * @returns {string} token JWT assinado
 */
function generateQrToken(userId) {
  return jwt.sign(
    { sub: userId, purpose: 'qr-stamp' },
    process.env.JWT_SECRET,
    { expiresIn: QR_TOKEN_TTL_SECONDS }
  );
}

/**
 * Valida o conteúdo lido de um QR Code e retorna o userId correspondente.
 * Lança um erro descritivo se o token for inválido, expirado ou de outro propósito.
 * @param {string} rawToken
 * @returns {string} userId
 */
function verifyQrToken(rawToken) {
  let payload;
  try {
    payload = jwt.verify(rawToken, process.env.JWT_SECRET);
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

/**
 * Gera a imagem do QR Code em base64 (data URL) a partir de um token.
 * @param {string} token
 * @returns {Promise<string>} data URL "data:image/png;base64,..."
 */
async function generateQrImage(token) {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: {
      dark: '#2E7D32', // verde folha
      light: '#FFF8E1', // creme
    },
  });
}

module.exports = {
  QR_TOKEN_TTL_SECONDS,
  generateQrToken,
  verifyQrToken,
  generateQrImage,
};
