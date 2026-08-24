// js/app.js
// Utilitários compartilhados por todas as páginas: chamadas à API, toasts,
// máscara de telefone, controle de loading nos botões e helpers de sessão.

// Como o Express serve o frontend estático, a API vive na mesma origem.
// Isso funciona tanto local (http://localhost:5000) quanto em produção,
// desde que o frontend seja servido pelo próprio backend (ver README).
const API_BASE_URL = window.location.origin + '/api';

const Sessao = {
  TOKEN_KEY: 'pamonhaNet_token',
  USER_KEY: 'pamonhaNet_user',

  salvar(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },
  token() {
    return localStorage.getItem(this.TOKEN_KEY);
  },
  usuario() {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  limpar() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },
  logado() {
    return Boolean(this.token());
  },
};

/**
 * Wrapper de fetch com JSON, autenticação automática e tratamento de erro padronizado.
 * @param {string} path - caminho relativo, ex: "/auth/login"
 * @param {object} options - { method, body }
 */
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = Sessao.token();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (networkErr) {
    throw new Error('Não foi possível conectar ao servidor. Verifique sua internet.');
  }

  let data = {};
  try {
    data = await response.json();
  } catch (_) {
    // resposta sem corpo JSON (ex: 204)
  }

  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      Sessao.limpar();
    }
    throw new Error(data.error || 'Algo deu errado. Tente novamente.');
  }

  return data;
}

/* ---------- Toasts ---------- */
function mostrarToast(mensagem, tipo = 'sucesso') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${tipo === 'sucesso' ? '' : tipo}`.trim();
  const icone = tipo === 'erro' ? '⚠️' : tipo === 'aviso' ? '🔔' : '🌽';
  toast.innerHTML = `<span aria-hidden="true">${icone}</span><span>${escaparHtml(mensagem)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('saindo');
    setTimeout(() => toast.remove(), 220);
  }, 3800);
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

/* ---------- Estado de loading em botões ---------- */
function setBotaoCarregando(botao, carregando) {
  if (!botao) return;
  botao.classList.toggle('loading', carregando);
  botao.disabled = carregando;
}

/* ---------- Máscara de telefone BR: (21) 91234-5678 ---------- */
function aplicarMascaraTelefone(input) {
  input.addEventListener('input', () => {
    let digitos = input.value.replace(/\D/g, '').slice(0, 11);
    if (digitos.length > 6) {
      digitos = digitos.replace(/^(\d{2})(\d{4,5})(\d{0,4}).*/, '($1) $2-$3');
    } else if (digitos.length > 2) {
      digitos = digitos.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
    } else if (digitos.length > 0) {
      digitos = digitos.replace(/^(\d{0,2})/, '($1');
    }
    input.value = digitos;
  });
}

/* ---------- Botão de logout (usado nas páginas internas) ---------- */
function configurarLogout(seletor) {
  const botao = document.querySelector(seletor);
  if (!botao) return;
  botao.addEventListener('click', () => {
    Sessao.limpar();
    window.location.href = 'index.html';
  });
}

/* ---------- Proteção de rota ---------- */
function exigirLogin(roleEsperada) {
  if (!Sessao.logado()) {
    window.location.href = 'index.html';
    return null;
  }
  const usuario = Sessao.usuario();
  if (roleEsperada && usuario?.role !== roleEsperada) {
    window.location.href = 'index.html';
    return null;
  }
  return usuario;
}
