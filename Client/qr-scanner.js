/* ==========================================================================
   QR-SCANNER.JS
   Wrapper simples em torno da biblioteca html5-qrcode (carregada via CDN
   no admin.html). Isola os detalhes da biblioteca para o admin-dashboard.js
   só precisar chamar start()/stop().
   ========================================================================== */

window.PamonhaScanner = (function () {
  'use strict';

  let scannerInstance = null;
  let isRunning = false;

  /**
   * Inicia a leitura da câmera.
   * @param {string} elementId - id do elemento onde o preview da câmera entra
   * @param {(decodedText: string) => void} onSuccess - chamado quando um QR é lido
   * @param {(message: string) => void} onStatus - chamado para status/erros legíveis
   */
  function start(elementId, onSuccess, onStatus) {
    if (typeof Html5Qrcode === 'undefined') {
      onStatus && onStatus('Não foi possível carregar o leitor de QR Code. Verifique sua conexão com a internet.');
      return;
    }

    if (isRunning) return;

    scannerInstance = new Html5Qrcode(elementId);

    scannerInstance
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        function handleDecoded(decodedText) {
          onSuccess && onSuccess(decodedText);
        },
        function handleFrameError() {
          // Nenhum QR Code encontrado neste frame — ignorar silenciosamente.
        }
      )
      .then(function () {
        isRunning = true;
      })
      .catch(function () {
        onStatus && onStatus('Não foi possível acessar a câmera. Verifique se a permissão foi concedida.');
      });
  }

  /**
   * Encerra a leitura da câmera e libera o recurso.
   * @returns {Promise<void>}
   */
  function stop() {
    if (!scannerInstance || !isRunning) {
      return Promise.resolve();
    }
    return scannerInstance
      .stop()
      .then(function () {
        isRunning = false;
        return scannerInstance.clear();
      })
      .catch(function () {
        isRunning = false;
      })
      .finally(function () {
        scannerInstance = null;
      });
  }

  return { start: start, stop: stop };
})();
