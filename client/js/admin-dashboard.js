// js/admin-dashboard.js
// Lógica da página admin.html: cards-resumo, lista/busca/ordenação de clientes,
// modal de edição de carimbos, confirmação de resgate e reset de cartão.

let adminAtual = null;
let paginaAtual = 1;
let ordenacaoAtual = 'name';
let termoBusca = '';
let clienteSelecionadoId = null;
let timeoutBusca = null;

document.addEventListener('DOMContentLoaded', async () => {
  adminAtual = exigirLogin('admin');
  if (!adminAtual) return;

  configurarLogout('#btn-logout');
  await carregarResumo();
  await carregarClientes();

  document.getElementById('busca-input').addEventListener('input', (e) => {
    termoBusca = e.target.value;
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(() => {
      paginaAtual = 1;
      carregarClientes();
    }, 350);
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

  document.querySelectorAll('#premio-admin-opcoes button').forEach((btn) => {
    btn.addEventListener('click', () => confirmarResgate(btn.dataset.produto, btn));
  });
});

/* ---------- Resumo (cards) ---------- */
async function carregarResumo() {
  try {
    // Busca até 100 clientes para calcular os indicadores do topo de forma simples,
    // sem precisar de um endpoint agregador dedicado.
    const data = await api('/admin/clients?limit=100&sort=stamps');
    const total = data.pagination.total;
    const pertoDoPremio = data.clients.filter((c) => c.stamps >= 8).length;

    document.querySelector('#card-total-clientes .valor').textContent = total;
    document.querySelector('#card-perto-premio .valor').textContent = pertoDoPremio;

    // "Resgates do mês" é calculado a partir do histórico de cada cliente perto/no limite
    // não está disponível em lote aqui, então mostramos o indicador com base no que a API
    // de listagem já nos deu; para um número exato, ver a aba de histórico de cada cliente.
    document.querySelector('#card-resgates-mes .valor').textContent = '—';
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

/* ---------- Lista de clientes ---------- */
async function carregarClientes() {
  const lista = document.getElementById('lista-clientes');
  lista.innerHTML = '<div class="skeleton" style="height:56px;margin-bottom:8px;"></div>'.repeat(4);

  try {
    const params = new URLSearchParams({
      search: termoBusca,
      sort: ordenacaoAtual,
      page: paginaAtual,
      limit: 10,
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
    lista.innerHTML = `
      <div class="estado-vazio">
        <span class="emoji">🔍</span>
        <p>Nenhum cliente encontrado.</p>
      </div>`;
    return;
  }

  clientes.forEach((cliente) => {
    const linha = document.createElement('button');
    linha.type = 'button';
    linha.className = 'cliente-linha' + (cliente.stamps >= 8 ? ' destaque' : '');
    linha.innerHTML = `
      <div class="cliente-info">
        <h4>${escaparHtml(cliente.fullName)}</h4>
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

function mudarPagina(delta) {
  paginaAtual += delta;
  carregarClientes();
}

function formatarTelefoneExibicao(digitos) {
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return digitos;
}

/* ---------- Modal do cliente ---------- */
async function abrirModalCliente(clienteId) {
  clienteSelecionadoId = clienteId;
  const modal = document.getElementById('modal-cliente');
  modal.classList.add('aberto');
  document.getElementById('grade-carimbos-admin').innerHTML = '<div class="skeleton" style="height:180px;"></div>';

  try {
    const data = await api(`/admin/clients/${clienteId}`);
    preencherModalCliente(data.client);
  } catch (err) {
    mostrarToast(err.message, 'erro');
    fecharModalCliente();
  }
}

function fecharModalCliente() {
  document.getElementById('modal-cliente').classList.remove('aberto');
  clienteSelecionadoId = null;
}

function preencherModalCliente(cliente) {
  document.getElementById('modal-cliente-nome').textContent = cliente.fullName;
  document.getElementById('modal-cliente-telefone').textContent = formatarTelefoneExibicao(cliente.phone);
  document.getElementById('modal-cliente-cadastro').textContent =
    'Cliente desde ' + new Date(cliente.createdAt).toLocaleDateString('pt-BR');

  renderizarGradeAdmin(cliente.stamps);

  const premioSecao = document.getElementById('premio-admin-secao');
  premioSecao.classList.toggle('hidden', cliente.stamps < 10);
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
    slot.setAttribute(
      'aria-label',
      i <= stamps ? `Remover carimbo ${i}` : `Adicionar carimbo ${i}`
    );
    const acionar = () => alternarCarimbo(i <= stamps ? 'remove' : 'add', i);
    slot.addEventListener('click', acionar);
    slot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        acionar();
      }
    });
    grade.appendChild(slot);
  }
}

async function alternarCarimbo(action, position) {
  if (!clienteSelecionadoId) return;
  try {
    const data = await api(`/admin/clients/${clienteSelecionadoId}/stamps`, {
      method: 'POST',
      body: { action, position },
    });
    renderizarGradeAdmin(data.client.stamps);
    document.getElementById('premio-admin-secao').classList.toggle('hidden', data.client.stamps < 10);
    atualizarLinhaNaLista(clienteSelecionadoId, data.client.stamps);
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

function atualizarLinhaNaLista(clienteId, stamps) {
  // Atualização otimista simples: recarrega a lista para refletir o novo total de carimbos.
  carregarClientes();
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
    const data = await api(`/admin/clients/${clienteSelecionadoId}/redeem`, {
      method: 'POST',
      body: { product: produto },
    });
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

// Exposto para o qr-scanner.js atualizar a lista após um escaneamento bem-sucedido.
window.recarregarClientesAdmin = () => {
  carregarClientes();
  carregarResumo();
};
