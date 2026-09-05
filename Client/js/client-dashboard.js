// js/client-dashboard.js
// Lógica da página cliente.html: cartão de carimbos, QR Code, notificações,
// reservas de produto e pesquisa de satisfação.

let usuarioAtual = null;
let estadoAtual = { stamps: 0, history: [] };
let cronometroQr = null;

const FRASES_MOTIVACIONAIS = [
  'Vamos começar sua coleção de carimbos!',
  'Boa! Cada pamonha te deixa mais perto do prêmio.',
  'Você está indo bem, continue colecionando.',
  'Metade do caminho andado!',
  'Já passou da metade, siga em frente.',
  'Quase lá! Poucos carimbos para o prêmio.',
  'Faltam só alguns carimbos, não desanime.',
  'Está pertinho! Mais um pouco...',
  'Só mais um carimbo para o prêmio grátis!',
  'Cartão completo! Escolha seu prêmio.',
];

document.addEventListener('DOMContentLoaded', async () => {
  usuarioAtual = exigirLogin('client');
  if (!usuarioAtual) return;

  configurarLogout('#btn-logout');
  document.getElementById('saudacao-nome').textContent = usuarioAtual.fullName.split(' ')[0];

  configurarAbasCliente();

  await carregarDashboard();

  document.getElementById('btn-gerar-qr').addEventListener('click', gerarQrCode);
  document.getElementById('btn-fechar-qr').addEventListener('click', fecharModalQr);
  document.getElementById('btn-compartilhar-whatsapp').addEventListener('click', compartilharWhatsapp);
  document.querySelectorAll('.premio-opcoes button').forEach((btn) => {
    btn.addEventListener('click', () => resgatarPremio(btn.dataset.produto, btn));
  });

  await carregarNotificacoes();
  await carregarProdutosParaReserva();
  await carregarMinhasReservas();
  configurarPesquisa();
});

/* ---------- Abas ---------- */
function configurarAbasCliente(){
  document.querySelectorAll('.cliente-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cliente-tab-btn').forEach((b) => b.classList.remove('ativo'));
      btn.classList.add('ativo');
      const tab = btn.dataset.clienteTab;
      document.querySelectorAll('.cliente-painel').forEach((p) => p.classList.remove('ativo'));
      document.getElementById('painel-' + tab).classList.add('ativo');
    });
  });
}

/* ---------- Cartão / dashboard ---------- */
async function carregarDashboard(){
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

function renderizarCartao(stamps){
  const grade = document.getElementById('grade-carimbos');
  const cartao = document.getElementById('cartao-fidelidade');
  const contador = document.getElementById('cartao-contador-valor');
  const frase = document.getElementById('cartao-frase');
  const barra = document.getElementById('barra-progresso-fill');
  const banner = document.getElementById('premio-banner');
  const ponto = document.getElementById('barra-progresso-ponto');
  const barraWrap = document.getElementById('barra-progresso-wrap');

  const stampsNormalizados = Math.max(0, Math.min(10, Number(stamps) || 0));
  grade.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const preenchido = i <= stampsNormalizados;
    const slot = document.createElement('div');
    slot.className = 'slot-carimbo' + (preenchido ? ' preenchido' : '');
    slot.setAttribute('role', 'listitem');
    slot.setAttribute('aria-label', preenchido ? `Carimbo ${i} preenchido` : `Carimbo ${i} vazio`);
    slot.textContent = preenchido ? '🌽' : '';
    grade.appendChild(slot);
  }

  const porcentagem = (stampsNormalizados / 10) * 100;
  contador.textContent = stampsNormalizados;
  barra.style.width = `${porcentagem}%`;
  if (ponto) { ponto.style.left = `${porcentagem}%`; ponto.textContent = stampsNormalizados > 0 ? stampsNormalizados : ''; }
  if (barraWrap) barraWrap.setAttribute('aria-valuenow', stampsNormalizados);
  frase.textContent = FRASES_MOTIVACIONAIS[Math.min(stampsNormalizados, FRASES_MOTIVACIONAIS.length - 1)];

  const completo = stampsNormalizados >= 10;
  cartao.classList.toggle('completo', completo);
  banner.classList.toggle('visivel', completo);
  document.getElementById('btn-gerar-qr').classList.toggle('hidden', completo);

  if (completo && !cartao.dataset.confeteExibido) {
    dispararConfete();
    cartao.dataset.confeteExibido = '1';
  }
  if (!completo) delete cartao.dataset.confeteExibido;
}

function renderizarHistorico(history){
  const lista = document.getElementById('lista-historico');
  lista.innerHTML = '';
  const contagem = document.getElementById('historico-contagem');
  if (contagem) { const total = history?.length || 0; contagem.textContent = total ? `${total} resgate${total > 1 ? 's' : ''}` : ''; }
  if (!history || history.length === 0) {
    lista.innerHTML = '<p class="historico-vazio">Você ainda não resgatou nenhum prêmio. Complete seu cartão para ganhar!</p>';
    return;
  }
  history.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'historico-item';
    div.style.animationDelay = `${index * 80}ms`;
    div.style.animation = 'surgir .4s ease backwards';
    const data = new Date(item.redeemedAt || item.createdAt).toLocaleDateString('pt-BR');
    div.innerHTML = `<span class="produto">${escaparHtml(item.product)}</span><span class="data">${data}</span>`;
    lista.appendChild(div);
  });
}

/* ---------- QR Code ---------- */
async function gerarQrCode(){
  const botao = document.getElementById('btn-gerar-qr');
  setBotaoCarregando(botao, true);
  try {
    const data = await api('/client/generate-qr', { method: 'POST' });
    document.getElementById('qr-imagem').src = data.qrImage;
    document.getElementById('modal-qr').classList.add('aberto');
    iniciarCronometroQr(data.expiresInSeconds);
  } catch (err) {
    mostrarToast(err.message, 'erro');
  } finally {
    setBotaoCarregando(botao, false);
  }
}
function fecharModalQr(){
  document.getElementById('modal-qr').classList.remove('aberto');
  if (cronometroQr) clearInterval(cronometroQr);
}
function iniciarCronometroQr(segundosIniciais){
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
async function resgatarPremio(produto, botaoClicado){
  if (!produto) return;
  const todosBotoes = document.querySelectorAll('.premio-opcoes button');
  todosBotoes.forEach((b) => (b.disabled = true));
  setBotaoCarregando(botaoClicado, true);
  try {
    mostrarToast(`Show! Mostre esta tela no balcão para retirar sua ${produto}.`);
  } finally {
    setBotaoCarregando(botaoClicado, false);
    todosBotoes.forEach((b) => (b.disabled = false));
  }
}

/* ---------- WhatsApp ---------- */
function compartilharWhatsapp(){
  const stamps = estadoAtual.stamps || 0;
  const mensagem = stamps >= 10
    ? `Completei meu cartão fidelidade da Pamonha Net e ganhei uma pamonha grátis! Peça a sua também.`
    : `Já tenho ${stamps} de 10 carimbos no cartão fidelidade da Pamonha Net! Faltam só ${10 - stamps} para ganhar uma pamonha grátis.`;
  window.open(`https://wa.me/?text=${encodeURIComponent(mensagem)}`, '_blank', 'noopener');
}

/* =========================================================================
   NOTIFICAÇÕES
   ========================================================================= */
async function carregarNotificacoes(){
  try {
    const data = await api('/client/notifications');
    const badge = document.getElementById('badge-notificacoes');
    if (data.notifications.length > 0) {
      badge.textContent = data.notifications.length;
      badge.classList.remove('hidden');
    }

    const lista = document.getElementById('lista-notificacoes');
    lista.innerHTML = '';
    if (!data.notifications.length) {
      lista.innerHTML = '<div class="estado-vazio"><span class="emoji">🔔</span><p>Nenhuma novidade por enquanto.</p></div>';
      return;
    }
    data.notifications.forEach((n) => {
      const div = document.createElement('div');
      div.className = 'notificacao-card' + (n.expiresAt ? ' -promo' : '');
      div.innerHTML = `
        ${n.imageUrl ? `<img src="${n.imageUrl}" alt="" />` : ''}
        <div class="texto">
          <p>${escaparHtml(n.message)}</p>
          <span class="quando">${new Date(n.createdAt).toLocaleDateString('pt-BR')}${n.expiresAt ? ' · promoção por tempo limitado' : ''}</span>
        </div>
      `;
      lista.appendChild(div);
    });
  } catch (err) {
    // silencioso — não travar a página do cliente por causa das notificações
  }
}

/* =========================================================================
   RESERVAS
   ========================================================================= */
async function carregarProdutosParaReserva(){
  const lista = document.getElementById('lista-produtos-reserva');
  try {
    const data = await api('/client/products');
    lista.innerHTML = '';
    if (!data.products.length) {
      lista.innerHTML = '<div class="estado-vazio"><span class="emoji">🌽</span><p>Nenhum produto disponível no momento.</p></div>';
      return;
    }
    data.products.forEach((p) => {
      const precoReais = (p.priceCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      const div = document.createElement('div');
      div.className = 'produto-reserva-card';
      div.innerHTML = `
        <div class="icone">🌽</div>
        <div class="info"><div class="nome">${escaparHtml(p.name)}</div><div class="preco">R$ ${precoReais}</div></div>
        <button type="button" class="btn btn-secondary btn-sm" data-id="${p._id}">Reservar</button>
      `;
      div.querySelector('button').addEventListener('click', (e) => reservarProduto(p._id, e.target));
      lista.appendChild(div);
    });
  } catch (err) {
    lista.innerHTML = '';
  }
}

async function reservarProduto(productId, botao){
  setBotaoCarregando(botao, true);
  try {
    await api('/client/reservations', { method: 'POST', body: { productId, quantity: 1 } });
    mostrarToast('Reserva feita! Retire e pague no balcão.');
    carregarMinhasReservas();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  } finally {
    setBotaoCarregando(botao, false);
  }
}

const STATUS_RESERVA_LABEL = { pending: 'Pendente retirada', picked_up: 'Retirado', cancelled: 'Cancelado' };

async function carregarMinhasReservas(){
  const lista = document.getElementById('lista-minhas-reservas');
  try {
    const data = await api('/client/reservations');
    lista.innerHTML = '';
    if (!data.reservations.length) {
      lista.innerHTML = '<p class="historico-vazio">Você ainda não fez nenhuma reserva.</p>';
      return;
    }
    data.reservations.forEach((r) => {
      const div = document.createElement('div');
      div.className = 'historico-item';
      div.innerHTML = `<span class="produto">${escaparHtml(r.productName)}</span><span class="data">${STATUS_RESERVA_LABEL[r.status]}</span>`;
      lista.appendChild(div);
    });
  } catch (err) {
    lista.innerHTML = '';
  }
}

/* =========================================================================
   PESQUISA DE SATISFAÇÃO
   ========================================================================= */
const respostasPesquisa = { experience: 0, service: 0, recommend: 0 };

function configurarPesquisa(){
  document.querySelectorAll('.estrelas').forEach((grupo) => {
    const pergunta = grupo.dataset.pergunta;
    const estrelas = grupo.querySelectorAll('.estrela');
    estrelas.forEach((estrela) => {
      estrela.addEventListener('click', () => {
        const valor = Number(estrela.dataset.valor);
        respostasPesquisa[pergunta] = valor;
        estrelas.forEach((e2) => e2.classList.toggle('preenchida', Number(e2.dataset.valor) <= valor));
      });
    });
  });

  document.getElementById('btn-enviar-pesquisa').addEventListener('click', enviarPesquisa);
}

async function enviarPesquisa(){
  const botao = document.getElementById('btn-enviar-pesquisa');
  const { experience, service, recommend } = respostasPesquisa;
  if (!experience || !service || !recommend) {
    mostrarToast('Responda as 3 perguntas antes de enviar.', 'erro');
    return;
  }
  setBotaoCarregando(botao, true);
  try {
    await api('/client/survey', { method: 'POST', body: { experience, service, recommend, triggeredBy: 'manual' } });
    mostrarToast('Obrigado pela resposta!');
  } catch (err) {
    mostrarToast(err.message, 'erro');
  } finally {
    setBotaoCarregando(botao, false);
  }
}

/* ---------- Confete ---------- */
function dispararConfete(){
  const canvas = document.getElementById('confete-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const cores = ['#F4C430', '#1B5E20', '#A6592E', '#FBF0D2'];
  const particulas = Array.from({ length: 110 }, () => ({
    x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height * 0.5,
    tamanho: 5 + Math.random() * 5, velocidadeY: 2 + Math.random() * 3, velocidadeX: -1.5 + Math.random() * 3,
    rotacao: Math.random() * 360, velocidadeRotacao: -8 + Math.random() * 16,
    cor: cores[Math.floor(Math.random() * cores.length)],
  }));

  let quadros = 0;
  const maxQuadros = 200;
  function desenhar(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particulas.forEach((p) => {
      p.x += p.velocidadeX; p.y += p.velocidadeY; p.rotacao += p.velocidadeRotacao;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rotacao * Math.PI) / 180);
      ctx.fillStyle = p.cor; ctx.fillRect(-p.tamanho / 2, -p.tamanho / 2, p.tamanho, p.tamanho * 0.6);
      ctx.restore();
    });
    quadros++;
    if (quadros < maxQuadros) requestAnimationFrame(desenhar);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(desenhar);
}

window.addEventListener('resize', () => {
  const canvas = document.getElementById('confete-canvas');
  if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
});
