// js/admin-dashboard.js
let adminAtual = null;
let paginaAtual = 1;
let ordenacaoAtual = 'name';
let termoBusca = '';
let clienteSelecionadoId = null;
let timeoutBusca = null;
let abaAtual = 'clientes';

document.addEventListener('DOMContentLoaded', async () => {
  adminAtual = exigirLogin('admin');
  if (!adminAtual) return;

  configurarLogout('#btn-logout');
  configurarAbas();
  await carregarResumo();
  await carregarClientes();

  document.getElementById('busca-input').addEventListener('input', (e) => {
    termoBusca = e.target.value;
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(() => { paginaAtual = 1; carregarClientes(); }, 350);
  });
  document.getElementById('busca-ordenar').addEventListener('change', (e) => {
    ordenacaoAtual = e.target.value;
    paginaAtual = 1;
    carregarClientes();
  });
  document.getElementById('btn-pagina-anterior').addEventListener('click', () => mudarPagina(-1));
  document.getElementById('btn-pagina-proxima').addEventListener('click', () => mudarPagina(1));
  document.getElementById('btn-fechar-modal-cliente').addEventListener('click', fecharModalCliente);
  document.getElementById('btn-resetar-cartao').addEventListener('click', resetarCartao);
  document.getElementById('btn-editar-perfil').addEventListener('click', abrirModalEditarPerfil);
  document.getElementById('btn-apagar-historico').addEventListener('click', apagarHistorico);
  document.getElementById('btn-fechar-modal-editar').addEventListener('click', () => {
    document.getElementById('modal-editar-perfil').classList.remove('aberto');
  });
  document.getElementById('btn-salvar-perfil').addEventListener('click', salvarPerfil);

  document.querySelectorAll('#premio-admin-opcoes button').forEach((btn) => {
    btn.addEventListener('click', () => confirmarResgate(btn.dataset.produto, btn));
  });

  document.getElementById('btn-novo-produto').addEventListener('click', () => abrirModalProduto());
  document.getElementById('btn-fechar-modal-produto').addEventListener('click', () => {
    document.getElementById('modal-produto').classList.remove('aberto');
  });
  document.getElementById('btn-salvar-produto').addEventListener('click', salvarProduto);

  document.getElementById('filtro-reserva-status').addEventListener('change', carregarReservas);

  document.getElementById('notif-audience').addEventListener('change', (e) => {
    document.getElementById('campo-target-user').classList.toggle('hidden', e.target.value !== 'single');
  });
  document.getElementById('btn-enviar-notif').addEventListener('click', enviarNotificacao);

  setInterval(verificarReservasPendentes, 20000);
  verificarReservasPendentes();
});

function configurarAbas() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      abaAtual = tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${tab}`).classList.add('active');

      if (tab === 'produtos') carregarProdutos();
      if (tab === 'reservas') carregarReservas();
      if (tab === 'notificacoes') carregarNotificacoes();
      if (tab === 'pesquisas') carregarPesquisas();
    });
  });
}

async function carregarResumo() {
  try {
    const data = await api('/admin/clients?limit=100&sort=stamps');
    const total = data.pagination.total;
    const pertoDoPremio = data.clients.filter((c) => c.stamps >= 8).length;
    const premium = data.clients.filter((c) => c.segment === 'premium').length;

    document.querySelector('#card-total-clientes .valor').textContent = total;
    document.querySelector('#card-perto-premio .valor').textContent = pertoDoPremio;
    document.querySelector('#card-premium .valor').textContent = premium;
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function carregarClientes() {
  const lista = document.getElementById('lista-clientes');
  lista.innerHTML = '<div class="skeleton" style="height:56px;margin-bottom:8px;"></div>'.repeat(4);

  try {
    const params = new URLSearchParams({
      search: termoBusca, sort: ordenacaoAtual, page: paginaAtual, limit: 10,
    });
    const data = await api(`/admin/clients?${params.toString()}`);
    renderizarListaClientes(data.clients);
    renderizarPaginacao(data.pagination);
  } catch (err) {
    lista.innerHTML = '';
    mostrarToast(err.message, 'erro');
  }
}

function renderizarListaClientes(clientes) {
  const lista = document.getElementById('lista-clientes');
  lista.innerHTML = '';

  if (!clientes || clientes.length === 0) {
    lista.innerHTML = `<div class="estado-vazio"><span class="emoji">🔍</span><p>Nenhum cliente encontrado.</p></div>`;
    return;
  }

  clientes.forEach((cliente) => {
    const segmentoEmoji = { premium: '👑', regular: '👤', churn_risk: '⚠️' }[cliente.segment] || '👤';
    const linha = document.createElement('button');
    linha.type = 'button';
    linha.className = 'cliente-linha' + (cliente.stamps >= 8 ? ' destaque' : '');
    linha.innerHTML = `
      <div class="cliente-info">
        <h4>${escaparHtml(cliente.fullName)} ${segmentoEmoji}</h4>
        <span>${formatarTelefoneExibicao(cliente.phone)}</span>
      </div>
      <div class="cliente-carimbos${cliente.stamps >= 8 ? ' perto' : ''}">${cliente.stamps}/10 🌽</div>
    `;
    linha.addEventListener('click', () => abrirModalCliente(cliente._id));
    lista.appendChild(linha);
  });
}

function renderizarPaginacao(pag) {
  document.getElementById('paginacao-info').textContent = `Página ${pag.page} de ${pag.totalPages}`;
  document.getElementById('btn-pagina-anterior').disabled = pag.page <= 1;
  document.getElementById('btn-pagina-proxima').disabled = pag.page >= pag.totalPages;
}

function mudarPagina(delta) { paginaAtual += delta; carregarClientes(); }

function formatarTelefoneExibicao(digitos) {
  if (digitos.length === 11) return `(${digitos.slice(0,2)}) ${digitos.slice(2,7)}-${digitos.slice(7)}`;
  if (digitos.length === 10) return `(${digitos.slice(0,2)}) ${digitos.slice(2,6)}-${digitos.slice(6)}`;
  return digitos;
}

async function abrirModalCliente(clienteId) {
  clienteSelecionadoId = clienteId;
  document.getElementById('modal-cliente').classList.add('aberto');
  document.getElementById('grade-carimbos-admin').innerHTML = '<div class="skeleton" style="height:180px;"></div>';

  try {
    const data = await api(`/admin/clients/${clienteId}`);
    preencherModalCliente(data);
  } catch (err) {
    mostrarToast(err.message, 'erro');
    fecharModalCliente();
  }
}

function fecharModalCliente() {
  document.getElementById('modal-cliente').classList.remove('aberto');
  clienteSelecionadoId = null;
}

function preencherModalCliente(data) {
  const cliente = data.client;
  document.getElementById('modal-cliente-nome').textContent = cliente.fullName;
  document.getElementById('modal-cliente-telefone').textContent = formatarTelefoneExibicao(cliente.phone);

  const segmentoLabel = {
    premium: '👑 Cliente VIP', regular: '👤 Cliente Regular', churn_risk: '⚠️ Risco de Churn',
  }[cliente.segment] || '👤 Cliente Regular';

  document.getElementById('modal-cliente-segmento').textContent = segmentoLabel;
  document.getElementById('modal-cliente-cadastro').textContent =
    'Cliente desde ' + new Date(cliente.createdAt).toLocaleDateString('pt-BR');

  const metricas = document.getElementById('cliente-metricas');
  const ultimaVisita = cliente.lastVisitAt ? new Date(cliente.lastVisitAt).toLocaleDateString('pt-BR') : 'Nunca';
  metricas.innerHTML = `
    <div class="metrica"><strong>${data.visitsLast30Days || 0}</strong><span>visitas (30d)</span></div>
    <div class="metrica"><strong>R$ ${((cliente.totalSpent || 0) / 100).toFixed(2)}</strong><span>gasto total</span></div>
    <div class="metrica"><strong>${ultimaVisita}</strong><span>última visita</span></div>
    <div class="metrica"><strong>${data.preferences?.[0]?.product || '—'}</strong><span>preferido</span></div>
  `;

  renderizarGradeAdmin(cliente.stamps);
  document.getElementById('premio-admin-secao').classList.toggle('hidden', cliente.stamps < 10);
}

function renderizarGradeAdmin(stamps) {
  const grade = document.getElementById('grade-carimbos-admin');
  grade.innerHTML = '';
  grade.dataset.stamps = stamps;

  for (let i = 1; i <= 10; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot-carimbo' + (i <= stamps ? ' preenchido' : '');
    slot.textContent = i <= stamps ? '🌽' : '';
    slot.setAttribute('role', 'button');
    slot.setAttribute('tabindex', '0');
    slot.setAttribute('aria-label', i <= stamps ? `Remover carimbo ${i}` : `Adicionar carimbo ${i}`);
    const acionar = () => alternarCarimbo(i <= stamps ? 'remove' : 'add', i);
    slot.addEventListener('click', acionar);
    slot.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); acionar(); } });
    grade.appendChild(slot);
  }
}

async function alternarCarimbo(action, position) {
  if (!clienteSelecionadoId) return;
  try {
    const data = await api(`/admin/clients/${clienteSelecionadoId}/stamps`, { method: 'POST', body: { action, position } });
    renderizarGradeAdmin(data.client.stamps);
    document.getElementById('premio-admin-secao').classList.toggle('hidden', data.client.stamps < 10);
    carregarClientes();
    carregarResumo();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function resetarCartao() {
  if (!clienteSelecionadoId) return;
  const confirmado = window.confirm('Tem certeza que deseja zerar o cartão deste cliente? Essa ação não pode ser desfeita.');
  if (!confirmado) return;

  const botao = document.getElementById('btn-resetar-cartao');
  setBotaoCarregando(botao, true);
  try {
    const data = await api(`/admin/clients/${clienteSelecionadoId}/reset`, { method: 'POST' });
    renderizarGradeAdmin(data.client.stamps);
    document.getElementById('premio-admin-secao').classList.add('hidden');
    mostrarToast('Cartão resetado.');
    carregarClientes();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  } finally {
    setBotaoCarregando(botao, false);
  }
}

async function confirmarResgate(produto, botao) {
  if (!clienteSelecionadoId || !produto) return;
  setBotaoCarregando(botao, true);
  try {
    const data = await api(`/admin/clients/${clienteSelecionadoId}/redeem`, { method: 'POST', body: { product: produto } });
    mostrarToast(`Resgate de ${produto} confirmado! 🎉`);
    renderizarGradeAdmin(data.client.stamps);
    document.getElementById('premio-admin-secao').classList.add('hidden');
    carregarClientes();
    carregarResumo();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  } finally {
    setBotaoCarregando(botao, false);
  }
}

function abrirModalEditarPerfil() {
  const nome = document.getElementById('modal-cliente-nome').textContent;
  const telefone = document.getElementById('modal-cliente-telefone').textContent.replace(/\D/g, '');
  document.getElementById('editar-nome').value = nome;
  document.getElementById('editar-telefone').value = telefone;
  document.getElementById('modal-editar-perfil').classList.add('aberto');
}

async function salvarPerfil() {
  if (!clienteSelecionadoId) return;
  const nome = document.getElementById('editar-nome').value.trim();
  const telefone = document.getElementById('editar-telefone').value.replace(/\D/g, '');
  try {
    await api(`/admin/clients/${clienteSelecionadoId}`, { method: 'PATCH', body: { fullName: nome, phone: telefone } });
    mostrarToast('Perfil atualizado!');
    document.getElementById('modal-editar-perfil').classList.remove('aberto');
    carregarClientes();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function apagarHistorico() {
  if (!clienteSelecionadoId) return;
  const confirmado = window.confirm('ATENÇÃO: Isso apagará TODO o histórico de resgates e carimbos deste cliente. Os carimbos atuais NÃO serão afetados. Continuar?');
  if (!confirmado) return;
  try {
    await api(`/admin/clients/${clienteSelecionadoId}/historico`, { method: 'DELETE' });
    mostrarToast('Histórico apagado.');
    fecharModalCliente();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function carregarProdutos() {
  const lista = document.getElementById('lista-produtos');
  lista.innerHTML = '<div class="skeleton" style="height:80px;margin-bottom:8px;"></div>'.repeat(3);
  try {
    const data = await api('/admin/products');
    renderizarProdutos(data.products);
  } catch (err) {
    lista.innerHTML = '';
    mostrarToast(err.message, 'erro');
  }
}

function renderizarProdutos(produtos) {
  const lista = document.getElementById('lista-produtos');
  lista.innerHTML = '';
  if (!produtos || produtos.length === 0) {
    lista.innerHTML = '<div class="estado-vazio"><span class="emoji">📦</span><p>Nenhum produto cadastrado.</p></div>';
    return;
  }
  produtos.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'produto-card';
    card.innerHTML = `
      <img src="${escaparHtml(p.imageUrl || 'assets/logo-pamonha-net.png')}" alt="" width="60" height="60" style="border-radius:10px;object-fit:cover;" />
      <div class="produto-info">
        <h4>${escaparHtml(p.name)} ${p.inStock ? '' : '<span style="color:var(--vermelho-erro);font-size:.75rem;">(Esgotado)</span>'}</h4>
        <span>R$ ${(p.priceCents / 100).toFixed(2)}</span>
      </div>
      <div class="produto-acoes">
        <button class="btn btn-ghost btn-sm" onclick="editarProduto('${p._id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="removerProduto('${p._id}')">Remover</button>
      </div>
    `;
    lista.appendChild(card);
  });
}

function abrirModalProduto(produto = null) {
  document.getElementById('modal-produto-titulo').textContent = produto ? 'Editar Produto' : 'Novo Produto';
  document.getElementById('produto-id').value = produto ? produto._id : '';
  document.getElementById('produto-nome').value = produto ? produto.name : '';
  document.getElementById('produto-preco').value = produto ? produto.priceCents : '';
  document.getElementById('produto-imagem').value = produto ? produto.imageUrl || '' : '';
  document.getElementById('produto-categoria').value = produto ? produto.category || '' : '';
  document.getElementById('produto-estoque').checked = produto ? produto.inStock : true;
  document.getElementById('modal-produto').classList.add('aberto');
}

async function salvarProduto() {
  const id = document.getElementById('produto-id').value;
  const body = {
    name: document.getElementById('produto-nome').value.trim(),
    priceCents: Number(document.getElementById('produto-preco').value),
    imageUrl: document.getElementById('produto-imagem').value.trim(),
    category: document.getElementById('produto-categoria').value.trim(),
    inStock: document.getElementById('produto-estoque').checked,
  };
  try {
    if (id) {
      await api(`/admin/products/${id}`, { method: 'PATCH', body });
      mostrarToast('Produto atualizado!');
    } else {
      await api('/admin/products', { method: 'POST', body });
      mostrarToast('Produto criado!');
    }
    document.getElementById('modal-produto').classList.remove('aberto');
    carregarProdutos();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function editarProduto(id) {
  try {
    const data = await api('/admin/products');
    const produto = data.products.find((p) => p._id === id);
    if (produto) abrirModalProduto(produto);
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function removerProduto(id) {
  if (!window.confirm('Remover este produto?')) return;
  try {
    await api(`/admin/products/${id}`, { method: 'DELETE' });
    mostrarToast('Produto removido.');
    carregarProdutos();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function carregarReservas() {
  const lista = document.getElementById('lista-reservas');
  lista.innerHTML = '<div class="skeleton" style="height:70px;margin-bottom:8px;"></div>'.repeat(3);
  const status = document.getElementById('filtro-reserva-status').value;
  try {
    const url = status ? `/admin/reservations?status=${status}` : '/admin/reservations';
    const data = await api(url);
    renderizarReservas(data.reservations);
  } catch (err) {
    lista.innerHTML = '';
    mostrarToast(err.message, 'erro');
  }
}

function renderizarReservas(reservas) {
  const lista = document.getElementById('lista-reservas');
  lista.innerHTML = '';
  if (!reservas || reservas.length === 0) {
    lista.innerHTML = '<div class="estado-vazio"><span class="emoji">📋</span><p>Nenhuma reserva.</p></div>';
    return;
  }
  reservas.forEach((r) => {
    const statusLabel = { pending: '⏳ Pendente', picked_up: '✅ Retirada', cancelled: '❌ Cancelada' }[r.status];
    const card = document.createElement('div');
    card.className = 'reserva-card';
    card.innerHTML = `
      <div class="reserva-info">
        <h4>${escaparHtml(r.userId?.fullName || 'Cliente')} — ${escaparHtml(r.productId?.name || 'Produto')}</h4>
        <span>Qtd: ${r.quantity} | ${statusLabel}</span>
        <span style="font-size:.75rem;color:var(--marrom-terra-claro);">${new Date(r.createdAt).toLocaleString('pt-BR')}</span>
      </div>
      <div class="reserva-acoes">
        ${r.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="atualizarReserva('${r._id}', 'picked_up')">Confirmar</button>` : ''}
        ${r.status === 'pending' ? `<button class="btn btn-danger btn-sm" onclick="atualizarReserva('${r._id}', 'cancelled')">Cancelar</button>` : ''}
      </div>
    `;
    lista.appendChild(card);
  });
}

async function atualizarReserva(id, status) {
  try {
    await api(`/admin/reservations/${id}`, { method: 'PATCH', body: { status } });
    mostrarToast(`Reserva ${status === 'picked_up' ? 'confirmada' : 'cancelada'}!`);
    carregarReservas();
    verificarReservasPendentes();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function verificarReservasPendentes() {
  try {
    const data = await api('/admin/reservations/count-pending');
    const count = data.count;
    const badge = document.getElementById('badge-reservas');
    const badgeTab = document.getElementById('badge-reservas-tab');
    badge.textContent = count;
    badgeTab.textContent = count;
    badge.classList.toggle('hidden', count === 0);
    badgeTab.classList.toggle('hidden', count === 0);
  } catch (err) {}
}

async function carregarNotificacoes() {
  const lista = document.getElementById('lista-notificacoes');
  try {
    const data = await api('/admin/notifications');
    lista.innerHTML = '';
    if (!data.notifications || data.notifications.length === 0) {
      lista.innerHTML = '<div class="estado-vazio"><span class="emoji">📭</span><p>Nenhuma notificação enviada.</p></div>';
      return;
    }
    data.notifications.forEach((n) => {
      const card = document.createElement('div');
      card.className = 'notif-card';
      card.innerHTML = `
        <p><strong>${escaparHtml(n.message)}</strong></p>
        <span style="font-size:.75rem;color:var(--marrom-terra-claro);">
          ${n.audience === 'all' ? 'Todos' : 'Individual'} — ${new Date(n.sentAt).toLocaleString('pt-BR')}
        </span>
      `;
      lista.appendChild(card);
    });
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function enviarNotificacao() {
  const mensagem = document.getElementById('notif-mensagem').value.trim();
  const imagem = document.getElementById('notif-imagem').value.trim();
  const audience = document.getElementById('notif-audience').value;
  const targetUserId = document.getElementById('notif-target-user').value.trim();

  if (!mensagem) { mostrarToast('Digite uma mensagem.', 'aviso'); return; }

  const btn = document.getElementById('btn-enviar-notif');
  setBotaoCarregando(btn, true);
  try {
    await api('/admin/notifications', {
      method: 'POST',
      body: { message: mensagem, imageUrl: imagem, audience, targetUserId: audience === 'single' ? targetUserId : null },
    });
    mostrarToast('Notificação enviada!');
    document.getElementById('notif-mensagem').value = '';
    document.getElementById('notif-imagem').value = '';
    carregarNotificacoes();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  } finally {
    setBotaoCarregando(btn, false);
  }
}

async function carregarPesquisas() {
  try {
    const data = await api('/admin/surveys');
    const avg = data.averages || {};
    document.getElementById('pesq-media-exp').textContent = (avg.avgExperience || 0).toFixed(1);
    document.getElementById('pesq-media-serv').textContent = (avg.avgService || 0).toFixed(1);
    document.getElementById('pesq-media-rec').textContent = (avg.avgRecommend || 0).toFixed(1);

    const lista = document.getElementById('lista-pesquisas');
    lista.innerHTML = '';
    if (!data.responses || data.responses.length === 0) {
      lista.innerHTML = '<div class="estado-vazio"><span class="emoji">📊</span><p>Nenhuma resposta ainda.</p></div>';
      return;
    }
    data.responses.forEach((r) => {
      const card = document.createElement('div');
      card.className = 'pesq-card';
      card.innerHTML = `
        <div class="pesq-notas">
          <span>⭐ ${r.answers.experience}</span>
          <span>🤝 ${r.answers.service}</span>
          <span>❤️ ${r.answers.recommend}</span>
        </div>
        <span style="font-size:.75rem;color:var(--marrom-terra-claro);">
          ${r.userId?.fullName || 'Anônimo'} — ${new Date(r.createdAt).toLocaleString('pt-BR')}
        </span>
      `;
      lista.appendChild(card);
    });
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

window.recarregarClientesAdmin = () => {
  carregarClientes();
  carregarResumo();
};
