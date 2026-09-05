/* ==========================================================================
   ADMIN-DASHBOARD.JS
   Lógica do painel administrativo: lista e detalhe de clientes, selos
   manuais, leitura de QR Code, exclusão de histórico e gestão de mensagens.
   Depende de js/qr-scanner.js (carregado antes deste arquivo no admin.html).
   ========================================================================== */

(function () {
  'use strict';

  var API_BASE_URL = window.location.origin + '/api';
  var TOKEN_KEY = 'pamonhaNetToken';
  var STAMP_GOAL = 10;

  var toastTimer = null;
  var searchTimer = null;
  var clientAutocompleteTimer = null;

  var currentClientId = null;
  var currentClientStamps = 0;

  /* ---------------------------------------------------------------- */
  /* Sessão / requisições                                              */
  /* ---------------------------------------------------------------- */

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      /* armazenamento indisponível — segue o fluxo normalmente */
    }
  }

  function apiFetch(path, options) {
    options = options || {};
    var token = getToken();
    var headers = Object.assign(
      { 'Content-Type': 'application/json' },
      token ? { Authorization: 'Bearer ' + token } : {},
      options.headers || {}
    );

    return fetch(API_BASE_URL + path, Object.assign({}, options, { headers: headers }))
      .catch(function () {
        throw new Error('NETWORK');
      })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (res.status === 401 || res.status === 403) throw new Error('AUTH');
            if (!res.ok) throw new Error(data.message || 'ERRO');
            return data;
          });
      });
  }

  /* ---------------------------------------------------------------- */
  /* Utilidades de interface                                           */
  /* ---------------------------------------------------------------- */

  function showToast(message, type) {
    var el = document.getElementById('toast');
    el.textContent = message;
    el.className = type === 'error' ? 'toast toast--error' : 'toast';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.hidden = true;
    }, 3200);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function showAuthBanner() {
    document.getElementById('authBanner').hidden = false;
    document.getElementById('adminContent').hidden = true;
  }

  /* ---------------------------------------------------------------- */
  /* Abas (Clientes / Mensagens)                                       */
  /* ---------------------------------------------------------------- */

  function initTabs() {
    var tabs = document.querySelectorAll('.tab-item');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function (e) {
        var target = e.currentTarget.getAttribute('data-target');
        var views = document.querySelectorAll('.view');
        for (var v = 0; v < views.length; v++) {
          views[v].hidden = views[v].getAttribute('data-view') !== target;
        }
        var allTabs = document.querySelectorAll('.tab-item');
        for (var t = 0; t < allTabs.length; t++) {
          allTabs[t].classList.toggle('is-active', allTabs[t] === e.currentTarget);
        }
        if (target === 'mensagens') loadMessages();
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Lista de clientes                                                  */
  /* ---------------------------------------------------------------- */

  function loadClients(search) {
    var list = document.getElementById('clientList');
    list.innerHTML = '<li class="empty-state">Carregando clientes...</li>';

    var query = search ? '?search=' + encodeURIComponent(search) : '';

    apiFetch('/admin/clients' + query)
      .then(function (data) {
        var clients = data.clients || [];
        if (!clients.length) {
          list.innerHTML = '<li class="empty-state">Nenhum cliente encontrado.</li>';
          return;
        }
        list.innerHTML = '';
        clients.forEach(function (c) {
          var pct = Math.max(0, Math.min(100, Math.round(((c.stamps || 0) / STAMP_GOAL) * 100)));
          var li = document.createElement('li');
          li.className = 'client-row';
          li.tabIndex = 0;
          li.innerHTML =
            '<div class="client-row-info"><strong>' +
            escapeHtml(c.name) +
            '</strong><span>' +
            escapeHtml(c.phone || '') +
            '</span></div>' +
            '<div class="client-row-progress"><div class="mini-bar"><span style="width:' +
            pct +
            '%"></span></div><small>' +
            (c.stamps || 0) +
            '/' +
            STAMP_GOAL +
            '</small></div>';
          var id = c._id || c.id;
          li.addEventListener('click', function () {
            openClientDetail(id);
          });
          li.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openClientDetail(id);
            }
          });
          list.appendChild(li);
        });
      })
      .catch(function (err) {
        if (err.message === 'AUTH') {
          showAuthBanner();
          return;
        }
        list.innerHTML = '<li class="empty-state">Não foi possível carregar os clientes agora.</li>';
      });
  }

  /* ---------------------------------------------------------------- */
  /* Detalhe do cliente                                                 */
  /* ---------------------------------------------------------------- */

  function openClientDetail(id) {
    currentClientId = id;
    var drawer = document.getElementById('clientDrawer');
    var body = document.getElementById('clientDetailBody');
    drawer.hidden = false;
    body.setAttribute('aria-busy', 'true');

    apiFetch('/admin/clients/' + id)
      .then(function (data) {
        renderClientDetail(data);
      })
      .catch(function (err) {
        if (err.message === 'AUTH') {
          drawer.hidden = true;
          showAuthBanner();
          return;
        }
        showToast('Não foi possível carregar os dados do cliente.', 'error');
        drawer.hidden = true;
      })
      .finally(function () {
        body.removeAttribute('aria-busy');
      });
  }

  function renderClientDetail(c) {
    currentClientStamps = c.stamps || 0;
    document.getElementById('clientDetailName').textContent = c.name || '—';
    document.getElementById('clientDetailPhone').textContent = c.phone || '';
    document.getElementById('clientDetailStamps').textContent = currentClientStamps + ' / ' + STAMP_GOAL;
    document.getElementById('redeemBtn').hidden = currentClientStamps < STAMP_GOAL;

    var history = c.history || [];
    var histList = document.getElementById('clientHistoryList');
    histList.innerHTML = history.length
      ? history
          .slice(0, 8)
          .map(function (h) {
            return (
              '<li class="history-item"><span>' +
              escapeHtml(h.description || 'Selo') +
              '</span><time>' +
              formatDate(h.date) +
              '</time></li>'
            );
          })
          .join('')
      : '<li class="empty-state">Sem histórico registrado.</li>';
  }

  function closeClientDetail() {
    document.getElementById('clientDrawer').hidden = true;
    currentClientId = null;
  }

  function changeStamp(delta) {
    if (!currentClientId) return;
    if (delta < 0 && currentClientStamps <= 0) {
      showToast('Este cliente já está com 0 selos.', 'error');
      return;
    }

    apiFetch('/admin/clients/' + currentClientId + '/stamps', {
      method: 'POST',
      body: JSON.stringify({ action: delta > 0 ? 'add' : 'remove' })
    })
      .then(function (data) {
        renderClientDetail(data);
        loadClients(currentSearchValue());
        showToast(delta > 0 ? 'Selo adicionado!' : 'Selo removido.');
      })
      .catch(function (err) {
        if (err.message === 'AUTH') {
          showAuthBanner();
          return;
        }
        showToast('Não foi possível atualizar os selos agora.', 'error');
      });
  }

  function redeemPrize() {
    if (!currentClientId) return;
    var id = currentClientId;

    apiFetch('/admin/clients/' + id + '/redeem', { method: 'POST' })
      .then(function () {
        showToast('Prêmio resgatado com sucesso! 🌽');
        openClientDetail(id);
        loadClients(currentSearchValue());
      })
      .catch(function (err) {
        if (err.message === 'AUTH') {
          showAuthBanner();
          return;
        }
        showToast('Não foi possível confirmar o resgate agora.', 'error');
      });
  }

  function currentSearchValue() {
    var input = document.getElementById('searchInput');
    return input ? input.value.trim() : '';
  }

  /* ---------------------------------------------------------------- */
  /* Modal de confirmação genérico (ações destrutivas)                  */
  /* ---------------------------------------------------------------- */

  function confirmAction(opts) {
    var modal = document.getElementById('confirmModal');
    var confirmBtn = document.getElementById('confirmActionBtn');

    document.getElementById('confirmTitle').textContent = opts.title;
    document.getElementById('confirmMessage').textContent = opts.message;
    confirmBtn.textContent = opts.confirmLabel;
    modal.hidden = false;

    function handleConfirm() {
      confirmBtn.disabled = true;
      Promise.resolve(opts.onConfirm()).finally(function () {
        confirmBtn.disabled = false;
        modal.hidden = true;
      });
    }

    confirmBtn.addEventListener('click', handleConfirm, { once: true });
  }

  function askResetCard() {
    if (!currentClientId) return;
    var id = currentClientId;
    confirmAction({
      title: 'Zerar cartão?',
      message: 'O contador de selos deste cliente volta para 0. Essa ação não pode ser desfeita.',
      confirmLabel: 'Zerar cartão',
      onConfirm: function () {
        return apiFetch('/admin/clients/' + id + '/reset', { method: 'POST' })
          .then(function () {
            showToast('Cartão zerado.');
            openClientDetail(id);
            loadClients(currentSearchValue());
          })
          .catch(function (err) {
            if (err.message === 'AUTH') {
              showAuthBanner();
              return;
            }
            showToast('Não foi possível zerar o cartão agora.', 'error');
          });
      }
    });
  }

  function askDeleteHistory() {
    if (!currentClientId) return;
    var id = currentClientId;
    confirmAction({
      title: 'Apagar histórico?',
      message:
        'Isso vai apagar todo o histórico de compras e selos deste cliente. Essa ação não pode ser desfeita.',
      confirmLabel: 'Apagar histórico',
      onConfirm: function () {
        return apiFetch('/admin/clients/' + id + '/history', { method: 'DELETE' })
          .then(function () {
            showToast('Histórico apagado.');
            openClientDetail(id);
          })
          .catch(function (err) {
            if (err.message === 'AUTH') {
              showAuthBanner();
              return;
            }
            showToast('Não foi possível apagar o histórico agora.', 'error');
          });
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Leitura de QR Code                                                 */
  /* ---------------------------------------------------------------- */

  function openScanner() {
    document.getElementById('scannerModal').hidden = false;
    document.getElementById('scannerStatus').textContent = 'Aponte a câmera para o QR Code do cliente.';

    window.PamonhaScanner.start(
      'qr-reader',
      function onDecoded(decodedText) {
        window.PamonhaScanner.stop().then(function () {
          document.getElementById('scannerModal').hidden = true;
          apiFetch('/admin/scan-qr', { method: 'POST', body: JSON.stringify({ token: decodedText }) })
            .then(function (data) {
              showToast('Selo adicionado para ' + (data.name || 'o cliente') + '!');
              loadClients(currentSearchValue());
            })
            .catch(function (err) {
              if (err.message === 'AUTH') {
                showAuthBanner();
                return;
              }
              showToast('QR Code inválido ou expirado.', 'error');
            });
        });
      },
      function onStatus(message) {
        document.getElementById('scannerStatus').textContent = message;
      }
    );
  }

  function closeScanner() {
    window.PamonhaScanner.stop();
    document.getElementById('scannerModal').hidden = true;
  }

  /* ---------------------------------------------------------------- */
  /* Mensagens                                                          */
  /* ---------------------------------------------------------------- */

  function loadMessages() {
    var list = document.getElementById('messageList');
    list.innerHTML = '<li class="empty-state">Carregando mensagens...</li>';

    apiFetch('/admin/messages')
      .then(function (data) {
        var messages = data.messages || [];
        if (!messages.length) {
          list.innerHTML = '<li class="empty-state">Nenhuma mensagem enviada ainda.</li>';
          return;
        }
        list.innerHTML = '';
        messages.forEach(function (m) {
          var li = document.createElement('li');
          li.className = 'message-row';
          var scopeLabel = m.scope === 'global' ? 'Todos' : escapeHtml(m.clientName || 'Cliente');
          li.innerHTML =
            '<div class="message-row-body"><span class="message-scope-tag">' +
            scopeLabel +
            '</span><strong>' +
            escapeHtml(m.title) +
            '</strong><p>' +
            escapeHtml(m.body) +
            '</p></div>' +
            '<button class="icon-btn icon-btn--danger" aria-label="Apagar mensagem" type="button">🗑</button>';
          var id = m._id || m.id;
          var title = m.title;
          li.querySelector('button').addEventListener('click', function () {
            askDeleteMessage(id, title);
          });
          list.appendChild(li);
        });
      })
      .catch(function (err) {
        if (err.message === 'AUTH') {
          showAuthBanner();
          return;
        }
        list.innerHTML = '<li class="empty-state">Não foi possível carregar as mensagens agora.</li>';
      });
  }

  function askDeleteMessage(id, title) {
    confirmAction({
      title: 'Apagar mensagem?',
      message: '"' + title + '" será removida para quem a recebe. Essa ação não pode ser desfeita.',
      confirmLabel: 'Apagar mensagem',
      onConfirm: function () {
        return apiFetch('/admin/messages/' + id, { method: 'DELETE' })
          .then(function () {
            showToast('Mensagem apagada.');
            loadMessages();
          })
          .catch(function (err) {
            if (err.message === 'AUTH') {
              showAuthBanner();
              return;
            }
            showToast('Não foi possível apagar a mensagem agora.', 'error');
          });
      }
    });
  }

  function openNewMessageModal() {
    var form = document.getElementById('messageForm');
    form.reset();
    document.getElementById('messageTargetClient').hidden = true;
    document.getElementById('messageClientResults').innerHTML = '';
    document.getElementById('messageClientId').value = '';
    document.getElementById('messageModal').hidden = false;
  }

  function submitMessage(e) {
    e.preventDefault();
    var form = e.target;
    var scopeInput = form.querySelector('input[name="scope"]:checked');
    var scope = scopeInput ? scopeInput.value : 'global';

    var payload = {
      title: form.elements.title.value.trim(),
      body: form.elements.body.value.trim(),
      scope: scope
    };

    if (scope === 'individual') {
      var clientId = document.getElementById('messageClientId').value;
      if (!clientId) {
        showToast('Selecione um cliente para a mensagem individual.', 'error');
        return;
      }
      payload.clientId = clientId;
    }

    var btn = form.querySelector('button[type="submit"]');
    var originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    apiFetch('/admin/messages', { method: 'POST', body: JSON.stringify(payload) })
      .then(function () {
        document.getElementById('messageModal').hidden = true;
        showToast('Mensagem enviada!');
        loadMessages();
      })
      .catch(function (err) {
        if (err.message === 'AUTH') {
          showAuthBanner();
          return;
        }
        showToast('Não foi possível enviar a mensagem agora.', 'error');
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = originalLabel;
      });
  }

  function initClientAutocomplete() {
    var input = document.getElementById('messageClientSearch');
    var list = document.getElementById('messageClientResults');
    var hiddenId = document.getElementById('messageClientId');

    input.addEventListener('input', function () {
      hiddenId.value = '';
      clearTimeout(clientAutocompleteTimer);
      var value = input.value.trim();
      if (!value) {
        list.innerHTML = '';
        list.hidden = true;
        return;
      }
      clientAutocompleteTimer = setTimeout(function () {
        apiFetch('/admin/clients?search=' + encodeURIComponent(value))
          .then(function (data) {
            var clients = (data.clients || []).slice(0, 6);
            if (!clients.length) {
              list.hidden = true;
              return;
            }
            list.innerHTML = clients
              .map(function (c) {
                var id = c._id || c.id;
                return (
                  '<li data-id="' +
                  id +
                  '" data-name="' +
                  escapeHtml(c.name) +
                  '">' +
                  escapeHtml(c.name) +
                  ' — ' +
                  escapeHtml(c.phone || '') +
                  '</li>'
                );
              })
              .join('');
            list.hidden = false;
          })
          .catch(function () {
            list.hidden = true;
          });
      }, 300);
    });

    list.addEventListener('click', function (e) {
      var li = e.target.closest('li');
      if (!li) return;
      hiddenId.value = li.getAttribute('data-id');
      input.value = li.getAttribute('data-name');
      list.hidden = true;
    });
  }

  /* ---------------------------------------------------------------- */
  /* Inicialização                                                      */
  /* ---------------------------------------------------------------- */

  document.addEventListener('DOMContentLoaded', function () {
    initTabs();
    loadClients();
    initClientAutocomplete();

    document.getElementById('searchInput').addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      var value = e.target.value.trim();
      searchTimer = setTimeout(function () {
        loadClients(value);
      }, 350);
    });

    document.getElementById('closeDrawerBtn').addEventListener('click', closeClientDetail);
    document.getElementById('addStampBtn').addEventListener('click', function () {
      changeStamp(1);
    });
    document.getElementById('removeStampBtn').addEventListener('click', function () {
      changeStamp(-1);
    });
    document.getElementById('redeemBtn').addEventListener('click', redeemPrize);
    document.getElementById('resetCardBtn').addEventListener('click', askResetCard);
    document.getElementById('deleteHistoryBtn').addEventListener('click', askDeleteHistory);

    document.getElementById('scanQrBtn').addEventListener('click', openScanner);
    document.getElementById('closeScannerBtn').addEventListener('click', closeScanner);

    document.getElementById('newMessageBtn').addEventListener('click', openNewMessageModal);
    document.getElementById('closeMessageModalBtn').addEventListener('click', function () {
      document.getElementById('messageModal').hidden = true;
    });
    document.getElementById('messageForm').addEventListener('submit', submitMessage);

    var scopeRadios = document.querySelectorAll('input[name="scope"]');
    for (var i = 0; i < scopeRadios.length; i++) {
      scopeRadios[i].addEventListener('change', function (e) {
        document.getElementById('messageTargetClient').hidden = e.target.value !== 'individual';
      });
    }

    document.getElementById('confirmCancelBtn').addEventListener('click', function () {
      document.getElementById('confirmModal').hidden = true;
    });

    document.getElementById('logoutBtn').addEventListener('click', function () {
      clearToken();
      window.location.href = 'index.html';
    });
  });
})();
