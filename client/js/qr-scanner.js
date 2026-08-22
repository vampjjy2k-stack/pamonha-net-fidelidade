// js/qr-scanner.js
// Leitura de QR Code no painel do admin: por texto colado ou pela câmera (html5-qrcode).

let instanciaCameraQr = null;
let cameraAtiva = false;

document.addEventListener('DOMContentLoaded', () => {
  const btnEnviarTexto = document.getElementById('btn-scan-texto');
  const btnCamera = document.getElementById('btn-alternar-camera');

  if (btnEnviarTexto) {
    btnEnviarTexto.addEventListener('click', async () => {
      const textarea = document.getElementById('scan-textarea');
      const conteudo = textarea.value.trim();
      if (!conteudo) {
        mostrarResultadoScan('Cole o conteúdo do QR Code antes de confirmar.', 'erro');
        return;
      }
      await processarQrToken(conteudo);
      textarea.value = '';
    });
  }

  if (btnCamera) {
    btnCamera.addEventListener('click', () => {
      if (cameraAtiva) {
        pararCamera();
      } else {
        iniciarCamera();
      }
    });
  }
});

async function processarQrToken(token) {
  mostrarResultadoScan('Verificando…', '');
  try {
    const data = await api('/admin/scan-qr', { method: 'POST', body: { qrToken: token } });
    mostrarResultadoScan(data.message, 'sucesso');
    mostrarToast(data.message);
    if (window.recarregarClientesAdmin) window.recarregarClientesAdmin();
  } catch (err) {
    mostrarResultadoScan(err.message, 'erro');
  }
}

function mostrarResultadoScan(texto, tipo) {
  const el = document.getElementById('scan-resultado');
  if (!el) return;
  el.textContent = texto;
  el.className = 'scan-resultado' + (tipo ? ' ' + tipo : '');
}

/* ---------- Câmera (biblioteca html5-qrcode, carregada via CDN no admin.html) ---------- */
function iniciarCamera() {
  if (typeof Html5Qrcode === 'undefined') {
    mostrarResultadoScan('Leitor de câmera indisponível. Verifique sua conexão com a internet.', 'erro');
    return;
  }

  const leitorDiv = document.getElementById('leitor-camera');
  leitorDiv.classList.remove('hidden');
  instanciaCameraQr = new Html5Qrcode('leitor-camera');

  instanciaCameraQr
    .start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (textoDecodificado) => {
        // Evita múltiplas leituras do mesmo frame em sequência.
        pararCamera();
        processarQrToken(textoDecodificado);
      },
      () => {
        // Erros de leitura de frame individual são normais e ignorados silenciosamente.
      }
    )
    .then(() => {
      cameraAtiva = true;
      document.getElementById('btn-alternar-camera').textContent = 'Parar câmera';
    })
    .catch(() => {
      mostrarResultadoScan('Não foi possível acessar a câmera. Verifique as permissões do navegador.', 'erro');
      leitorDiv.classList.add('hidden');
    });
}

function pararCamera() {
  if (instanciaCameraQr && cameraAtiva) {
    instanciaCameraQr
      .stop()
      .then(() => instanciaCameraQr.clear())
      .catch(() => {});
  }
  cameraAtiva = false;
  const botao = document.getElementById('btn-alternar-camera');
  if (botao) botao.textContent = 'Escanear com a câmera';
  const leitorDiv = document.getElementById('leitor-camera');
  if (leitorDiv) leitorDiv.classList.add('hidden');
}
