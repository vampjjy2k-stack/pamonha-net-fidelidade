// js/client-dashboard.js
// Lógica da página cliente.html: cartão, QR Code, resgate, reservas, pesquisa.

let usuarioAtual = null;
let estadoAtual = { stamps: 0, history: [] };
let cronometroQr = null;

const FRASES_MOTIVACIONAIS = [
  'Vamos começar sua coleção de carimbos! 🌽',
  'Boa! Cada pamonha te deixa mais perto do prêmio.',
  'Você está indo bem, continue colecionando!',
  'Metade do caminho andado! 🎉',
  'Já passou da metade, siga em frente!',
  'Quase lá! Poucos carimbos para o prêmio.',
  'Faltam só alguns carimbos, não desanime!',
  'Está pertinho! Mais um pouco...',
  'Só mais um carimbo para o prêmio grátis!',
  'Cartão completo! Escolha seu prêmio 🎁',
];

document.addEventListener('DOMContentLoaded', async () => {
  usuarioAtual = exigirLogin('client');
  if (!usuarioAtual) return;

  configurarLogout('#btn-logout');
  document.getElementById('saudacao-nome').textContent = usuarioAtual.fullName.split(' ')[0];

  await carregarDashboard();
  await carregarProdutosReserva();
  await carregarMinhasReservas();
  await carregarPesquisa();

  document.getElementById('btn-gerar-qr').addEventListener('click', gerarQrCode);
  document.getElementById('btn-fechar-qr').addEventListener('click', fecharModalQr);
  document.getElementById('btn-compartilhar-whatsapp').addEventListener('click', compartilharWhatsapp);
  document.getElementById('btn-enviar-pesquisa').addEventListener('click', enviarPesquisa);

  document.querySelectorAll('.premio-opcoes button').forEach((btn) => {
    btn.addEventListener('click', () => resgatarPremio(btn.dataset.produto, btn));
  });
});

async function carregarDashboard() {
  const painel = document.getElementById('conteudo-cartao');
  painel.classList.add('skeleton');
  try {
    const data = await api('/client/dashboard');
    estadoAtual = data;
    renderizarCartao(data.stamps);
    renderizarHistorico(data.history);
  } catch (err) {
    mostrarToast(err.message, 'erro');
  } finally {
    painel.classList.remove('skeleton');
  }
}

function renderizarCartao(stamps) {
  const grade = document.getElementById('grade-carimbos');
  const cartao = document.getElementById('cartao-fidelidade');
  const contador = document.getElementById('cartao-contador-valor');
  const frase = document.getElementById('cartao-frase');
  const barra = document.getElementById('barra-progresso-fill');
  const banner = document.getElementById('premio-banner');

  grade.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot-carimbo' + (i <= stamps ? ' preenchido' : '');
    slot.setAttribute('aria-label', i <= stamps ? `Carimbo ${i} preenchido` : `Carimbo ${i} vazio`);
    slot.textContent = i <= stamps ? '🌽' : '';
    grade.appendChild(slot);
  }

  contador.textContent = stamps;
  barra.style.width = `${(stamps / 10) * 100}%`;
  frase.textContent = FRASES_MOTIVACIONAIS[Math.min(stamps, FRASES_MOTIVACIONAIS.length - 1)];

  const completo = stamps >= 10;
  cartao.classList.toggle('completo', completo);
  banner.classList.toggle('visivel', completo);
  document.getElementById('btn-gerar-qr').classList.toggle('hidden', completo);

  if (completo && !cartao.dataset.confeteExibido) {
    dispararConfete();
    cartao.dataset.confeteExibido = '1';
  }
  if (!completo) {
    delete cartao.dataset.confeteExibido;
  }
}

function renderizarHistorico(history) {
  const lista = document.getElementById('lista-historico');
  lista.innerHTML = '';

  if (!history || history.length === 0) {
    lista.innerHTML = '<p class="historico-vazio">Você ainda não resgatou nenhum prêmio. Complete seu cartão para ganhar! 🌽</p>';
    return;
  }

  history.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'historico-item';
    const data = new Date(item.redeemedAt || item.createdAt).toLocaleDateString('pt-BR');
    div.innerHTML = `<span class="produto">${escaparHtml(item.product)}</span><span class="data">${data}</span>`;
    lista.appendChild(div);
  });
}

/* ---------- QR Code ---------- */
async function gerarQrCode() {
  const botao = document.getElementById('btn-gerar-qr');
  setBotaoCarregando(botao, true);
  try {
    const data = await api('/client/generate-qr', { method: 'POST' });
    document.getElementById('qr-imagem').src = data.qrImage;
    abrirModalQr();
    iniciarCronometroQr(data.expiresInSeconds);
  } catch (err) {
    mostrarToast(err.message, 'erro');
  } finally {
    setBotaoCarregando(botao, false);
  }
}

function abrirModalQr() {
  document.getElementById('modal-qr').classList.add('aberto');
}

function fecharModalQr() {
  document.getElementById('modal-qr').classList.remove('aberto');
  if (cronometroQr) clearInterval(cronometroQr);
}

function iniciarCronometroQr(segundosIniciais) {
  if (cronometroQr) clearInterval(cronometroQr);
  let restante = segundosIniciais;
  const label = document.getElementById('qr-timer-texto');

  const atualizar = () => {
    const min = Math.floor(restante / 60).toString().padStart(2, '0');
    const seg = (restante % 60).toString().padStart(2, '0');
    label.textContent = `${min}:${seg}`;
    label.classList.toggle('expirando', restante <= 30);
    if (restante <= 0) {
      clearInterval(cronometroQr);
      label.textContent = 'Expirado — gere um novo QR Code';
      carregarDashboard();
    }
    restante -= 1;
  };
  atualizar();
  cronometroQr = setInterval(atualizar, 1000);
}

/* ---------- Resgate de prêmio ---------- */
async function resgatarPremio(produto, botaoClicado) {
  if (!produto) return;
  const todosBotoes = document.querySelectorAll('.premio-opcoes button');
  todosBotoes.forEach((b) => (b.disabled = true));
  setBotaoCarregando(botaoClicado, true);

  try {
    mostrarToast(`Show! Mostre esta tela no balcão para retirar sua ${produto}. 🎁`);
  } finally {
    setBotaoCarregando(botaoClicado, false);
    todosBotoes.forEach((b) => (b.disabled = false));
  }
}

/* ---------- Compartilhar no WhatsApp ---------- */
function compartilharWhatsapp() {
  const stamps = estadoAtual.stamps || 0;
  const mensagem =
    stamps >= 10
      ? `🌽 Completei meu cartão fidelidade da Pamonha Net e ganhei uma pamonha grátis! Peça a sua também.`
      : `🌽 Já tenho ${stamps} de 10 carimbos no cartão fidelidade da Pamonha Net! Faltam só ${10 - stamps} para ganhar uma pamonha grátis.`;
  const url = `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
  window.open(url, '_blank', 'noopener');
}

/* ---------- Reservas ---------- */
async function carregarProdutosReserva() {
  const lista = document.getElementById('lista-produtos-reserva');
  try {
    const data = await api('/client/products');
    lista.innerHTML = '';
    const produtos = data.products?.filter((p) => p.inStock) || [];
    if (produtos.length === 0) {
      lista.innerHTML = '<p class="form-hint" style="text-align:center;">Nenhum produto disponível para reserva no momento.</p>';
      return;
    }
    produtos.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'produto-reserva-card';
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="${escaparHtml(p.imageUrl || 'assets/logo-pamonha-net.png')}" width="50" height="50" style="border-radius:8px;object-fit:cover;" />
          <div>
            <strong>${escaparHtml(p.name)}</strong>
            <div style="font-size:.85rem;">R$ ${(p.priceCents / 100).toFixed(2)}</div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="reservarProduto('${p._id}')">Reservar</button>
      `;
      lista.appendChild(card);
    });
  } catch (err) {
    lista.innerHTML = '<p class="form-hint" style="text-align:center;">Erro ao carregar produtos.</p>';
  }
}

async function reservarProduto(productId) {
  try {
    await api('/client/reservations', { method: 'POST', body: { productId, quantity: 1 } });
    mostrarToast('Reserva feita com sucesso! 🛒');
    carregarMinhasReservas();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function carregarMinhasReservas() {
  const lista = document.getElementById('lista-minhas-reservas');
  try {
    const data = await api('/client/reservations');
    lista.innerHTML = '';
    if (!data.reservations || data.reservations.length === 0) {
      lista.innerHTML = '<p class="form-hint" style="text-align:center;">Você ainda não tem reservas.</p>';
      return;
    }
    data.reservations.forEach((r) => {
      const statusLabel = { pending: '⏳ Pendente', picked_up: '✅ Retirada', cancelled: '❌ Cancelada' }[r.status];
      const div = document.createElement('div');
      div.className = 'reserva-cliente-item';
      div.innerHTML = `
        <span><strong>${escaparHtml(r.productId?.name || 'Produto')}</strong> — ${statusLabel}</span>
        <span style="font-size:.75rem;color:var(--marrom-terra-claro);">${new Date(r.createdAt).toLocaleDateString('pt-BR')}</span>
      `;
      lista.appendChild(div);
    });
  } catch (err) {
    lista.innerHTML = '<p class="form-hint" style="text-align:center;">Erro ao carregar reservas.</p>';
  }
}

/* ---------- Pesquisa ---------- */
async function carregarPesquisa() {
  const container = document.getElementById('pesquisa-perguntas');
  try {
    const data = await api('/client/survey/questions');
    container.innerHTML = '';
    data.questions.forEach((q) => {
      const div = document.createElement('div');
      div.className = 'pesquisa-pergunta';
      div.innerHTML = `
        <label>${escaparHtml(q.label)}</label>
        <div class="estrelas" data-pergunta="${q.id}">
          ${[1,2,3,4,5].map(n => `<button type="button" data-nota="${n}">⭐</button>`).join('')}
        </div>
      `;
      container.appendChild(div);
    });

    container.querySelectorAll('.estrelas button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const pergunta = e.target.closest('.estrelas').dataset.pergunta;
        const nota = Number(e.target.dataset.nota);
        const botoes = e.target.closest('.estrelas').querySelectorAll('button');
        botoes.forEach((b, i) => {
          b.style.opacity = i < nota ? '1' : '0.3';
        });
        e.target.closest('.estrelas').dataset.valor = nota;
      });
    });
  } catch (err) {
    container.innerHTML = '<p class="form-hint">Não foi possível carregar a pesquisa.</p>';
  }
}

async function enviarPesquisa() {
  const perguntas = document.querySelectorAll('.estrelas');
  const respostas = {};
  for (const p of perguntas) {
    const id = p.dataset.pergunta;
    const valor = p.dataset.valor;
    if (!valor) {
      mostrarToast('Responda todas as perguntas.', 'aviso');
      return;
    }
    respostas[id] = Number(valor);
  }

  const btn = document.getElementById('btn-enviar-pesquisa');
  setBotaoCarregando(btn, true);
  try {
    await api('/client/survey', {
      method: 'POST',
      body: {
        experience: respostas.experience,
        service: respostas.service,
        recommend: respostas.recommend,
      },
    });
    mostrarToast('Obrigado pela avaliação! 🌟');
    document.getElementById('pesquisa-container').innerHTML = '<p class="form-hint" style="text-align:center;">Você já avaliou. Muito obrigado! 🌽</p>';
  } catch (err) {
    mostrarToast(err.message, 'erro');
  } finally {
    setBotaoCarregando(btn, false);
  }
}

/* ---------- Confete ---------- */
function dispararConfete() {
  const canvas = document.getElementById('confete-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const cores = ['#F4C430', '#2E7D32', '#8B4513', '#FFD54A', '#FFF8E1'];
  const particulas = Array.from({ length: 130 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    tamanho: 5 + Math.random() * 6,
    velocidadeY: 2 + Math.random() * 3,
    velocidadeX: -1.5 + Math.random() * 3,
    rotacao: Math.random() * 360,
    velocidadeRotacao: -8 + Math.random() * 16,
    cor: cores[Math.floor(Math.random() * cores.length)],
  }));

  let quadros = 0;
  const maxQuadros = 220;

  function desenhar() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particulas.forEach((p) => {
      p.x += p.velocidadeX;
      p.y += p.velocidadeY;
      p.rotacao += p.velocidadeRotacao;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotacao * Math.PI) / 180);
      ctx.fillStyle = p.cor;
      ctx.fillRect(-p.tamanho / 2, -p.tamanho / 2, p.tamanho, p.tamanho * 0.6);
      ctx.restore();
    });
    quadros++;
    if (quadros < maxQuadros) {
      requestAnimationFrame(desenhar);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  const prefereReduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefereReduzido) {
    requestAnimationFrame(desenhar);
  }
}

window.addEventListener('resize', () => {
  const canvas = document.getElementById('confete-canvas');
  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
});
