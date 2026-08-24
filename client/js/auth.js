// js/auth.js
// Lógica da página index.html: cadastro, login e alternância "Sou Cliente" / "Sou Admin".

document.addEventListener('DOMContentLoaded', () => {
  // Se já estiver logado, manda direto para a área correta.
  if (Sessao.logado()) {
    const usuario = Sessao.usuario();
    window.location.href = usuario?.role === 'admin' ? 'admin.html' : 'cliente.html';
    return;
  }

  configurarAlternanciaPerfil();
  configurarAlternanciaLoginCadastro();
  configurarMascarasTelefone();
  configurarFormularioCadastro();
  configurarFormularioLogin();
});

// Alterna entre o painel "Sou Cliente" e "Sou Admin" (ambos usam o mesmo endpoint de login,
// a diferença é só visual: contexto e redirecionamento pós-login).
function configurarAlternanciaPerfil() {
  const botoes = document.querySelectorAll('.auth-toggle button');
  const painelCliente = document.getElementById('painel-cliente');
  const painelAdmin = document.getElementById('painel-admin');

  botoes.forEach((botao) => {
    botao.addEventListener('click', () => {
      botoes.forEach((b) => b.classList.remove('active'));
      botao.classList.add('active');
      const perfil = botao.dataset.perfil;
      painelCliente.classList.toggle('active', perfil === 'cliente');
      painelAdmin.classList.toggle('active', perfil === 'admin');
    });
  });
}

// Dentro do painel "cliente", alterna entre a aba de login e a de cadastro.
function configurarAlternanciaLoginCadastro() {
  document.querySelectorAll('[data-mostrar-form]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const alvo = link.dataset.mostrarForm; // "login" ou "cadastro"
      document.getElementById('form-login').classList.toggle('active', alvo === 'login');
      document.getElementById('form-cadastro').classList.toggle('active', alvo === 'cadastro');
    });
  });
}

function configurarMascarasTelefone() {
  document.querySelectorAll('input[data-mascara="telefone"]').forEach(aplicarMascaraTelefone);
}

function marcarCampoInvalido(input, mensagem) {
  const campo = input.closest('.campo');
  campo.classList.add('invalido');
  const erro = campo.querySelector('.erro-campo');
  if (erro) erro.textContent = mensagem;
}

function limparValidacao(form) {
  form.querySelectorAll('.campo.invalido').forEach((c) => c.classList.remove('invalido'));
}

function configurarFormularioCadastro() {
  const form = document.getElementById('form-cadastro');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparValidacao(form);

    const fullName = form.querySelector('#cadastro-nome').value.trim();
    const phone = form.querySelector('#cadastro-telefone').value.trim();
    const password = form.querySelector('#cadastro-senha').value;
    const botao = form.querySelector('button[type="submit"]');

    if (fullName.length < 3) {
      marcarCampoInvalido(form.querySelector('#cadastro-nome'), 'Informe seu nome completo.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      marcarCampoInvalido(form.querySelector('#cadastro-telefone'), 'Telefone incompleto.');
      return;
    }
    if (password.length < 6) {
      marcarCampoInvalido(form.querySelector('#cadastro-senha'), 'A senha precisa ter 6+ caracteres.');
      return;
    }

    setBotaoCarregando(botao, true);
    try {
      const data = await api('/auth/register', { method: 'POST', body: { fullName, phone, password } });
      Sessao.salvar(data.token, data.user);
      mostrarToast(`Bem-vindo(a), ${data.user.fullName.split(' ')[0]}! 🌽`);
      setTimeout(() => (window.location.href = 'cliente.html'), 600);
    } catch (err) {
      mostrarToast(err.message, 'erro');
    } finally {
      setBotaoCarregando(botao, false);
    }
  });
}

function configurarFormularioLogin() {
  const forms = document.querySelectorAll('form[data-form="login"]');
  forms.forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      limparValidacao(form);

      const phone = form.querySelector('input[type="tel"]').value.trim();
      const password = form.querySelector('input[type="password"]').value;
      const botao = form.querySelector('button[type="submit"]');
      const perfilEsperado = form.dataset.perfil; // "cliente" ou "admin"

      if (!phone || !password) {
        mostrarToast('Preencha telefone e senha.', 'erro');
        return;
      }

      setBotaoCarregando(botao, true);
      try {
        const data = await api('/auth/login', { method: 'POST', body: { phone, password } });

        if (perfilEsperado === 'admin' && data.user.role !== 'admin') {
          mostrarToast('Este acesso é exclusivo para administradores.', 'erro');
          return;
        }

        Sessao.salvar(data.token, data.user);
        mostrarToast(`Olá, ${data.user.fullName.split(' ')[0]}! 🌽`);
        setTimeout(() => {
          window.location.href = data.user.role === 'admin' ? 'admin.html' : 'cliente.html';
        }, 500);
      } catch (err) {
        mostrarToast(err.message, 'erro');
      } finally {
        setBotaoCarregando(botao, false);
      }
    });
  });
}
