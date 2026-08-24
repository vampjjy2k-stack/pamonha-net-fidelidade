// js/admin-dashboard.js
// Controlador da página admin.html — Visão Geral, CRM, Produtos, Notificações,
// Pesquisa de satisfação e Reservas. Tudo aqui chama a API real (nada de mock).

let adminAtual = null;
let paginaAtual = 1;
let ordenacaoAtual = 'name';
let termoBusca = '';
let clienteSelecionadoId = null;
let timeoutBusca = null;
let segmentoNotifAtivo = 'all';
let clienteAlvoNotificacao = null;

function centavosParaReais(cents){
  return 'R$ ' + (Number(cents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function reaisParaCentavos(texto){
  if (!texto) return 0;
  const limpo = texto.replace(/\./g,'').replace(',','.').replace(/[^\d.]/g,'');
  const valor = parseFloat(limpo);
  return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
}

document.addEventListener('DOMContentLoaded', async () => {
  adminAtual = exigirLogin('admin');
  if (!adminAtual) return;

  document.getElementById('avatar-admin').textContent = (adminAtual.fullName || 'AD').split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();
  configurarLogout('#btn-logout');
  configurarNavegacaoAbas();

  await carregarVisaoGeral();

  // --- CRM ---
  await carregarClientes();
  document.getElementById('busca-input').addEventListener('input', (e) => {
    termoBusca = e.target.value;
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(() => { paginaAtual = 1; carregarClientes(); }, 350);
  });
  document.getElementById('busca-ordenar').addEventListener('change', (e) => {
    ordenacaoAtual = e.target.value; paginaAtual = 1; carregarClientes();
  });
  document.getElementById('btn-pagina-anterior').addEventListener('click', () => mudarPagina(-1));
  document.getElementById('btn-pagina-proxima').addEventListener('click', () => mudarPagina(1));
  document.getElementById('btn-fechar-modal-cliente').addEventListener('click', fecharModalCliente);
  document.getElementById('btn-resetar-cartao').addEventListener('click', resetarCartao);
  document.getElementById('btn-excluir-historico').addEventListener('click', () => document.getElementById('modal-excluir').classList.add('aberto'));
  document.getElementById('btn-cancelar-excluir').addEventListener('click', () => document.getElementById('modal-excluir').classList.remove('aberto'));
  document.getElementById('btn-confirmar-excluir').addEventListener('click', confirmarExclusaoHistorico);
  document.getElementById('btn-editar-cliente').addEventListener('click', abrirModalEdicao);
  document.getElementById('btn-fechar-editar-cliente').addEventListener('click', () => document.getElementById('modal-editar-cliente').classList.remove('aberto'));
  document.getElementById('btn-salvar-edicao').addEventListener('click', salvarEdicaoCliente);
  document.querySelectorAll('#premio-admin-opcoes button').forEach((btn) => {
    btn.addEventListener('click', () => confirmarResgate(btn.dataset.produto, btn));
  });

  // --- Produtos ---
  await carregarProdutos();
  document.getElementById('btn-novo-produto').addEventListener('click', criarProdutoRapido);

  // --- Notificações ---
  configurarNotificacoes();
  await carregarHistoricoNotificacoes();

  // --- Pesquisa ---
  await carregarPesquisas();

  // --- Reservas ---
  await carregarReservas();

  // --- Sino ---
  document.getElementById('btn-sino').addEventListener('click', () => ativarAba('reservas'));
});

/* ---------- Navegação por abas ---------- */
const TITULOS = { 'visao-geral':'Visão Geral', 'crm':'Clientes', 'produtos':'Catálogo de Produtos', 'notificacoes':'Notificações', 'pesquisa':'Pesquisa de Satisfação', 'reservas':'Reservas de Produto' };

function configurarNavegacaoAbas(){
  document.querySelectorAll('.admin-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => ativarAba(btn.dataset.tab));
  });
}
function ativarAba(tab){
  document.querySelectorAll('.admin-nav-item').forEach((b) => b.classList.toggle('ativo', b.dataset.tab === tab));
  document.querySelectorAll('.admin-tab').forEach((s) => s.classList.remove('ativa'));
  document.getElementById('tab-' + tab).classList.add('ativa');
  document.getElementById('topo-titulo').textContent = TITULOS[tab];
}

function mostrarToastAdmin(msg, tipo){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visivel');
  clearTimeout(window.__toastTimeout);
  window.__toastTimeout = setTimeout(() => el.classList.remove('visivel'), 3000);
}

/* =========================================================================
   VISÃO GERAL
   ========================================================================= */
async function carregarVisaoGeral(){
  try {
    const data = await api('/admin/stats');
    document.getElementById('kpi-clientes').textContent = data.activeClients;
    document.getElementById('kpi-carimbos-hoje').textContent = data.stampsToday;
    document.getElementById('kpi-reservas-pendentes').textContent = data.pendingReservations;
    document.getElementById('kpi-perto-premio').textContent = data.closeToReward;

    const badge = document.getElementById('badge-reservas');
    if (data.pendingReservations > 0) {
      badge.textContent = data.pendingReservations;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    const alerta = document.getElementById('alerta-reservas-pendentes');
    if (alerta) {
      if (data.pendingReservations > 0) {
        alerta.textContent = `🔔 ${data.pendingReservations} reserva(s) pendente(s) aguardando retirada.`;
        alerta.classList.remove('hidden');
      } else {
        alerta.classList.add('hidden');
      }
    }

    const lista = document.getElementById('lista-atividade-recente');
    lista.innerHTML = '';
    if (!data.recentActivity.length) {
      lista.innerHTML = '<div class="estado-vazio"><span class="emoji">🌽</span><p>Nenhuma atividade ainda.</p></div>';
    } else {
      data.recentActivity.forEach((item) => {
        const texto = item.action === 'add'
          ? `<strong>${escaparHtml(item.clientName)}</strong> ganhou um carimbo${item.product ? ' (' + escaparHtml(item.product) + ')' : ''}`
          : `<strong>${escaparHtml(item.clientName)}</strong> teve um carimbo removido`;
        const div = document.createElement('div');
        div.className = 'atividade-item';
        div.innerHTML = `<span class="ponto"></span><div><p>${texto}</p><span class="quando">${formatarQuando(item.createdAt)}</span></div>`;
        lista.appendChild(div);
      });
    }
  } catch (err) {
    mostrarToastAdmin(err.message, 'erro');
  }
}

function formatarQuando(iso){
  const data = new Date(iso);
  const diffMs = Date.now() - data.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return data.toLocaleDateString('pt-BR');
}

/* =========================================================================
   CRM
   ========================================================================= */
async function carregarClientes(){
  const lista = document.getElementById('lista-clientes');
  lista.innerHTML = '<div class="skeleton" style="height:52px;margin-bottom:8px;"></div>'.repeat(4);
  try {
    const params = new URLSearchParams({ search: termoBusca, sort: ordenacaoAtual, page: paginaAtual, limit: 10 });
    const data = await api(`/admin/clients?${params.toString()}`);
    renderizarListaClientes(data.clients);
    renderizarPaginacao(data.pagination);
  } catch (err) {
    lista.innerHTML = '';
    mostrarToastAdmin(err.message, 'erro');
  }
}

const SELO_CLASSE = { premium:'-premium', regular:'-regular', churn_risk:'-churn', novo:'-novo' };

function renderizarListaClientes(clientes){
  const lista = document.getElementById('lista-clientes');
  lista.innerHTML = '';
  if (!clientes || clientes.length === 0) {
    lista.innerHTML = '<div class="estado-vazio"><span class="emoji">🔍</span><p>Nenhum cliente encontrado.</p></div>';
    return;
  }
  clientes.forEach((cliente) => {
    const linha = document.createElement('button');
    linha.type = 'button';
    linha.className = 'cliente-linha';
    linha.innerHTML = `
      <div class="cliente-info">
        <h4>${escaparHtml(cliente.fullName)}</h4>
        <span>${formatarTelefoneExibicao(cliente.phone)}</span>
      </div>
      <div class="cliente-linha-direita">
        <span class="selo ${SELO_CLASSE[cliente.segment] || '-novo'}">${escaparHtml(cliente.segmentLabel)}</span>
        <span class="cliente-carimbos">${cliente.stamps}/10</span>
      </div>
    `;
    linha.addEventListener('click', () => abrirModalCliente(cliente._id));
    lista.appendChild(linha);
  });
}

function renderizarPaginacao(pag){
  document.getElementById('paginacao-info').textContent = `Página ${pag.page} de ${pag.totalPages}`;
  document.getElementById('btn-pagina-anterior').disabled = pag.page <= 1;
  document.getElementById('btn-pagina-proxima').disabled = pag.page >= pag.totalPages;
}
function mudarPagina(delta){ paginaAtual += delta; carregarClientes(); }

function formatarTelefoneExibicao(digitos){
  if (!digitos) return '';
  if (digitos.length === 11) return `(${digitos.slice(0,2)}) ${digitos.slice(2,7)}-${digitos.slice(7)}`;
  if (digitos.length === 10) return `(${digitos.slice(0,2)}) ${digitos.slice(2,6)}-${digitos.slice(6)}`;
  return digitos;
}

async function abrirModalCliente(clienteId){
  clienteSelecionadoId = clienteId;
  const modal = document.getElementById('modal-cliente');
  modal.classList.add('aberto');
  document.getElementById('grade-carimbos-admin').innerHTML = '<div class="skeleton" style="height:160px;"></div>';
  try {
    const data = await api(`/admin/clients/${clienteId}`);
    preencherModalCliente(data.client, data.metrics);
  } catch (err) {
    mostrarToastAdmin(err.message, 'erro');
    fecharModalCliente();
  }
}
function fecharModalCliente(){
  document.getElementById('modal-cliente').classList.remove('aberto');
  clienteSelecionadoId = null;
}

function preencherModalCliente(cliente, metrics){
  document.getElementById('modal-cliente-avatar').textContent = cliente.fullName.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();
  document.getElementById('modal-cliente-nome').textContent = cliente.fullName;
  document.getElementById('modal-cliente-telefone').textContent = formatarTelefoneExibicao(cliente.phone) + ' · #' + cliente._id.slice(-4);
  document.getElementById('modal-cliente-cadastro').textContent = 'Cliente desde ' + new Date(cliente.createdAt).toLocaleDateString('pt-BR');

  const selo = document.getElementById('modal-cliente-selo');
  selo.textContent = cliente.segmentLabel;
  selo.className = 'selo ' + (SELO_CLASSE[cliente.segment] || '-novo');

  document.getElementById('metrica-total-gasto').textContent = centavosParaReais(metrics.totalSpentCents);
  document.getElementById('metrica-carimbos').textContent = `${cliente.stamps}/10`;
  document.getElementById('metrica-frequencia').textContent = metrics.visitFrequencyPerWeek ? metrics.visitFrequencyPerWeek + '/sem' : '—';

  const tagsEl = document.getElementById('metrica-preferencias');
  tagsEl.innerHTML = '';
  if (metrics.topProducts && metrics.topProducts.length) {
    metrics.topProducts.forEach((p) => {
      const span = document.createElement('span');
      span.className = 'tag-pref';
      span.textContent = p.product;
      tagsEl.appendChild(span);
    });
  } else {
    tagsEl.innerHTML = '<span class="tag-pref">Sem dados ainda</span>';
  }

  renderizarGradeAdmin(cliente.stamps);
  document.getElementById('premio-admin-secao').classList.toggle('hidden', cliente.stamps < 10);
}

function renderizarGradeAdmin(stamps){
  const grade = document.getElementById('grade-carimbos-admin');
  grade.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot-carimbo' + (i <= stamps ? ' preenchido' : '');
    slot.textContent = i <= stamps ? '🌽' : '';
    slot.setAttribute('role', 'button');
    slot.setAttribute('tabindex', '0');
    slot.setAttribute('aria-label', i <= stamps ? `Remover carimbo ${i}` : `Adicionar carimbo ${i}`);
    const acionar = () => alternarCarimbo(i <= stamps ? 'remove' : 'add');
    slot.addEventListener('click', acionar);
    slot.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); acionar(); } });
    grade.appendChild(slot);
  }
}

async function alternarCarimbo(action){
  if (!clienteSelecionadoId) return;
  const body = { action };
  if (action === 'add') {
    const produto = document.getElementById('stamp-produto').value;
    const valor = document.getElementById('stamp-valor').value;
    if (produto) body.product = produto;
    if (valor) body.amountCents = reaisParaCentavos(valor);
  }
  try {
    const data = await api(`/admin/clients/${clienteSelecionadoId}/stamps`, { method: 'POST', body });
    renderizarGradeAdmin(data.client.stamps);
    document.getElementById('premio-admin-secao').classList.toggle('hidden', data.client.stamps < 10);
    document.getElementById('stamp-valor').value = '';
    document.getElementById('stamp-produto').value = '';
    carregarClientes();
    carregarVisaoGeral();
  } catch (err) {
    mostrarToastAdmin(err.message, 'erro');
  }
}

async function resetarCartao(){
  if (!clienteSelecionadoId) return;
  if (!window.confirm('Zerar o cartão deste cliente?')) return;
  try {
    const data = await api(`/admin/clients/${clienteSelecionadoId}/reset`, { method: 'POST' });
    renderizarGradeAdmin(data.client.stamps);
    document.getElementById('premio-admin-secao').classList.add('hidden');
    mostrarToastAdmin('Cartão resetado.');
    carregarClientes();
  } catch (err) {
    mostrarToastAdmin(err.message, 'erro');
  }
}

async function confirmarResgate(produto, botao){
  if (!clienteSelecionadoId || !produto) return;
  setBotaoCarregando(botao, true);
  try {
    const data = await api(`/admin/clients/${clienteSelecionadoId}/redeem`, { method: 'POST', body: { product: produto } });
    mostrarToastAdmin(`Resgate de ${produto} confirmado.`);
    renderizarGradeAdmin(data.client.stamps);
    document.getElementById('premio-admin-secao').classList.add('hidden');
    carregarClientes();
    carregarVisaoGeral();
  } catch (err) {
    mostrarToastAdmin(err.message, 'erro');
  } finally {
    setBotaoCarregando(botao, false);
  }
}

async function confirmarExclusaoHistorico(){
  if (!clienteSelecionadoId) return;
  try {
    const data = await api(`/admin/clients/${clienteSelecionadoId}/historico`, { method: 'DELETE' });
    document.getElementById('modal-excluir').classList.remove('aberto');
    mostrarToastAdmin(data.message);
    abrirModalCliente(clienteSelecionadoId);
  } catch (err) {
    mostrarToastAdmin(err.message, 'erro');
  }
}

function abrirModalEdicao(){
  if (!clienteSelecionadoId) return;
  document.getElementById('editar-nome').value = document.getElementById('modal-cliente-nome').textContent;
  document.getElementById('editar-telefone').value = document.getElementById('modal-cliente-telefone').textContent.split(' ·')[0];
  document.getElementById('modal-editar-cliente').classList.add('aberto');
}
async function salvarEdicaoCliente(){
  if (!clienteSelecionadoId) return;
  const fullName = document.getElementById('editar-nome').value.trim();
  const phone = document.getElementById('editar-telefone').value.trim();
  try {
    await api(`/admin/clients/${clienteSelecionadoId}`, { method: 'PATCH', body: { fullName, phone } });
    document.getElementById('modal-editar-cliente').classList.remove('aberto');
    mostrarToastAdmin('Perfil atualizado.');
    abrirModalCliente(clienteSelecionadoId);
    carregarClientes();
  } catch (err) {
    mostrarToastAdmin(err.message, 'erro');
  }
}

/* =========================================================================
   PRODUTOS
   ========================================================================= */
async function carregarProdutos(){
  const grid = document.getElementById('produtos-grid');
  grid.innerHTML = '<div class="skeleton" style="height:200px;"></div>'.repeat(4);
  try {
    const data = await api('/admin/products');
    grid.innerHTML = '';
    data.products.forEach((p) => grid.appendChild(criarCardProduto(p)));
  } catch (err) {
    grid.innerHTML = '';
    mostrarToastAdmin(err.message, 'erro');
  }
}

function criarCardProduto(p){
  const card = document.createElement('div');
  card.className = 'produto-card';
  const precoReais = (p.priceCents / 100).toFixed(2).replace('.', ',');
  card.innerHTML = `
    <div class="produto-imagem">${p.imageUrl ? `<img src="${p.imageUrl}" alt="${escaparHtml(p.name)}" />` : '🌽'}</div>
    <input class="produto-nome-input" type="text" value="${escaparHtml(p.name)}" aria-label="Nome do produto" />
    <div class="produto-linha">
      <div class="preco-input-wrap"><span>R$</span><input type="text" value="${precoReais}" inputmode="decimal" aria-label="Preço" /></div>
    </div>
    <div class="produto-status-linha">
      <span class="rotulo-estoque">${p.inStock ? 'Em estoque' : 'Fora de estoque'}</span>
      <label class="toggle"><input type="checkbox" ${p.inStock ? 'checked' : ''} /><span class="trilho"></span><span class="bolinha"></span></label>
    </div>
  `;
  const nomeInput = card.querySelector('.produto-nome-input');
  const precoInput = card.querySelector('.preco-input-wrap input');
  const toggle = card.querySelector('.toggle input');
  const rotulo = card.querySelector('.rotulo-estoque');

  nomeInput.addEventListener('change', () => atualizarProduto(p._id, { name: nomeInput.value.trim() }, 'Nome atualizado.'));
  precoInput.addEventListener('change', () => atualizarProduto(p._id, { priceCents: reaisParaCentavos(precoInput.value) }, 'Preço atualizado.'));
  toggle.addEventListener('change', () => {
    rotulo.textContent = toggle.checked ? 'Em estoque' : 'Fora de estoque';
    atualizarProduto(p._id, { inStock: toggle.checked }, null);
  });

  return card;
}

async function atualizarProduto(id, body, msgSucesso){
  try {
    await api(`/admin/products/${id}`, { method: 'PATCH', body });
    if (msgSucesso) mostrarToastAdmin(msgSucesso);
  } catch (err) {
    mostrarToastAdmin(err.message, 'erro');
  }
}

async function criarProdutoRapido(){
  try {
    const data = await api('/admin/products', { method: 'POST', body: { name: 'Novo produto', priceCents: 0, inStock: true } });
    document.getElementById('produtos-grid').appendChild(criarCardProduto(data.product));
    mostrarToastAdmin('Produto criado — edite o nome e o preço.');
  } catch (err) {
    mostrarToastAdmin(err.message, 'erro');
  }
}

/* =========================================================================
   NOTIFICAÇÕES
   ========================================================================= */
function configurarNotificacoes(){
  const textarea = document.getElementById('notif-mensagem');
  const preview = document.getElementById('notif-preview-texto');
  textarea.addEventListener('input', () => preview.textContent = textarea.value || 'Sua mensagem aparece aqui...');

  document.querySelectorAll('.segmento-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.segmento-btn').forEach((b) => b.classList.remove('ativo'));
      btn.classList.add('ativo');
      segmentoNotifAtivo = btn.dataset.segmento;
      const buscaCliente = document.getElementById('notif-busca-cliente');
      buscaCliente.style.display = segmentoNotifAtivo === 'single' ? 'block' : 'none';
      if (segmentoNotifAtivo === 'all') {
        clienteAlvoNotificacao = null;
        document.getElementById('notif-cliente-selecionado-texto').classList.add('hidden');
      }
    });
  });

  let buscaTimeout;
  document.getElementById('notif-busca-cliente').addEventListener('input', (e) => {
    clearTimeout(buscaTimeout);
    const termo = e.target.value;
    buscaTimeout = setTimeout(() => buscarClientesParaNotificacao(termo), 300);
  });

  document.getElementById('btn-enviar-notificacao').addEventListener('click', enviarNotificacao);
}

async function buscarClientesParaNotificacao(termo){
  const resultados = document.getElementById('notif-cliente-resultados');
  if (!termo.trim()) { resultados.style.display = 'none'; resultados.innerHTML = ''; return; }
  try {
    const data = await api(`/admin/clients?search=${encodeURIComponent(termo)}&limit=5`);
    resultados.innerHTML = '';
    if (!data.clients.length) {
      resultados.innerHTML = '<div style="padding:8px 10px; font-size:.82rem; color:var(--ink-fraco);">Nenhum cliente encontrado.</div>';
    } else {
      data.clients.forEach((c) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.style.cssText = 'display:block; width:100%; text-align:left; padding:8px 10px; border:none; background:var(--branco); border-bottom:1px solid var(--linha); font-size:.84rem;';
        item.textContent = `${c.fullName} — ${formatarTelefoneExibicao(c.phone)}`;
        item.addEventListener('click', () => {
          clienteAlvoNotificacao = c._id;
          document.getElementById('notif-busca-cliente').value = c.fullName;
          const txt = document.getElementById('notif-cliente-selecionado-texto');
          txt.textContent = `Selecionado: ${c.fullName}`;
          txt.classList.remove('hidden');
          resultados.style.display = 'none';
        });
        resultados.appendChild(item);
      });
    }
    resultados.style.display = 'block';
  } catch (err) {
    mostrarToastAdmin(err.message, 'erro');
  }
}

async function enviarNotificacao(){
  const btn = document.getElementById('btn-enviar-notificacao');
  const message = document.getElementById('notif-mensagem').value.trim();
  const imageUrl = document.getElementById('notif-imagem-url').value.trim();
  const expiresInHours = document.getElementById('notif-validade').value || null;

  if (!message) { mostrarToastAdmin('Escreva uma mensagem antes de enviar.', 'erro'); return; }
  if (segmentoNotifAtivo === 'single' && !clienteAlvoNotificacao) {
    mostrarToastAdmin('Selecione um cliente específico na busca.', 'erro'); return;
  }

  setBotaoCarregando(btn, true);
  try {
    const data = await api('/admin/notifications', {
      method: 'POST',
      body: { message, imageUrl, audience: segmentoNotifAtivo, targetUserId: clienteAlvoNotificacao, expiresInHours },
    });
    mostrarToastAdmin(`Notificação enviada — ${data.deliveredCount} cliente(s) alcançado(s).`);
    document.getElementById('notif-mensagem').value = '';
    document.getElementById('notif-preview-texto').textContent = 'Sua mensagem aparece aqui...';
    carregarHistoricoNotificacoes();
  } catch (err) {
    mostrarToastAdmin(err.message, 'erro');
  } finally {
    setBotaoCarregando(btn, false);
  }
}

async function carregarHistoricoNotificacoes(){
  const lista = document.getElementById('lista-notificacoes-enviadas');
  try {
    const data = await api('/admin/notifications');
    lista.innerHTML = '';
    if (!data.notifications.length) {
      lista.innerHTML = '<p class="form-hint" style="margin:0;">Nenhuma notificação enviada ainda.</p>';
      return;
    }
    data.notifications.forEach((n) => {
      const div = document.createElement('div');
      div.className = 'notif-historico-item';
      const alvo = n.audience === 'all' ? 'Todos' : (n.targetUserId?.fullName || 'Cliente removido');
      div.innerHTML = `<span>${escaparHtml(n.message.slice(0, 46))}${n.message.length > 46 ? '…' : ''}</span><span class="mono" style="color:var(--ink-fraco); flex-shrink:0;">${alvo}</span>`;
      lista.appendChild(div);
    });
  } catch (err) {
    lista.innerHTML = '';
  }
}

/* =========================================================================
   PESQUISA DE SATISFAÇÃO
   ========================================================================= */
async function carregarPesquisas(){
  try {
    const data = await api('/admin/surveys');
    document.getElementById('media-experiencia').textContent = data.averages.mediaExperiencia ? data.averages.mediaExperiencia.toFixed(1) : '—';
    document.getElementById('media-atendimento').textContent = data.averages.mediaAtendimento ? data.averages.mediaAtendimento.toFixed(1) : '—';
    document.getElementById('media-recomendacao').textContent = data.averages.mediaRecomendacao ? data.averages.mediaRecomendacao.toFixed(1) : '—';

    const lista = document.getElementById('lista-respostas-pesquisa');
    lista.innerHTML = '';
    if (!data.responses.length) {
      lista.innerHTML = '<div class="estado-vazio"><span class="emoji">⭐</span><p>Nenhuma resposta ainda.</p></div>';
      return;
    }
    data.responses.forEach((r) => {
      const div = document.createElement('div');
      div.className = 'atividade-item';
      const nome = r.userId?.fullName || 'Cliente removido';
      div.innerHTML = `<span class="ponto" style="background:${r.experience <= 2 ? 'var(--vermelho)' : 'var(--verde-700)'};"></span><div><p><strong>${escaparHtml(nome)}</strong> — ${r.experience}★ / ${r.service}★ / ${r.recommend}★</p><span class="quando">${formatarQuando(r.createdAt)}</span></div>`;
      lista.appendChild(div);
    });
  } catch (err) {
    mostrarToastAdmin(err.message, 'erro');
  }
}

/* =========================================================================
   RESERVAS
   ========================================================================= */
const SELO_RESERVA = { pending:['-pendente','Pendente retirada'], picked_up:['-retirado','Retirado'], cancelled:['-cancelado','Cancelado'] };
const PAGAMENTO_LABEL = { cash:'Dinheiro', pix:'Pix', card:'Cartão', undefined:'—' };

async function carregarReservas(){
  const corpo = document.getElementById('tabela-reservas-corpo');
  try {
    const data = await api('/admin/reservations');
    corpo.innerHTML = '';
    if (!data.reservations.length) {
      corpo.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--ink-fraco); padding:24px;">Nenhuma reserva ainda.</td></tr>';
      return;
    }
    data.reservations.forEach((r) => {
      const [classe, rotulo] = SELO_RESERVA[r.status];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escaparHtml(r.userId?.fullName || 'Cliente removido')}</td>
        <td>${escaparHtml(r.productName)}${r.quantity > 1 ? ' (' + r.quantity + 'x)' : ''}</td>
        <td class="mono">${new Date(r.createdAt).toLocaleDateString('pt-BR')}</td>
        <td>
          <select class="status-select" data-id="${r._id}" data-campo="status">
            <option value="pending" ${r.status==='pending'?'selected':''}>Pendente retirada</option>
            <option value="picked_up" ${r.status==='picked_up'?'selected':''}>Retirado</option>
            <option value="cancelled" ${r.status==='cancelled'?'selected':''}>Cancelado</option>
          </select>
        </td>
        <td>
          <select class="pagamento-select" data-id="${r._id}" data-campo="paymentMethod">
            <option value="undefined" ${r.paymentMethod==='undefined'?'selected':''}>—</option>
            <option value="cash" ${r.paymentMethod==='cash'?'selected':''}>Dinheiro</option>
            <option value="pix" ${r.paymentMethod==='pix'?'selected':''}>Pix</option>
            <option value="card" ${r.paymentMethod==='card'?'selected':''}>Cartão</option>
          </select>
        </td>
      `;
      corpo.appendChild(tr);
    });

    corpo.querySelectorAll('select').forEach((select) => {
      select.addEventListener('change', () => atualizarReserva(select.dataset.id, select.dataset.campo, select.value));
    });
  } catch (err) {
    mostrarToastAdmin(err.message, 'erro');
  }
}

async function atualizarReserva(id, campo, valor){
  try {
    await api(`/admin/reservations/${id}`, { method: 'PATCH', body: { [campo]: valor } });
    mostrarToastAdmin('Reserva atualizada.');
    carregarVisaoGeral();
  } catch (err) {
    mostrarToastAdmin(err.message, 'erro');
  }
}

// Exposto para o qr-scanner.js atualizar tudo após um escaneamento bem-sucedido.
window.recarregarClientesAdmin = () => {
  carregarClientes();
  carregarVisaoGeral();
};
