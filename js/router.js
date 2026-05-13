/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO router.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade: gerenciar a navegação entre views HTML, carregando
 * fragmentos via fetch sob demanda, e injetar modais globais no boot.
 *
 * EXPORTS GLOBAIS:
 *   window.ROUTER : { navigate, refreshView, clearCache, injectModals, getCurrentPage }
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

const ROUTER = (() => {

  const ROUTES = {
    dashboard: { file: 'views/dashboard.html', title: 'Dashboard',     adminOnly: false },
    contas:    { file: 'views/contas.html',    title: 'Contas',        adminOnly: false },
    receitas:  { file: 'views/receitas.html',  title: 'Receitas',      adminOnly: false },
    salario:   { file: 'views/salario.html',   title: 'Salários',      adminOnly: false },
    relatorio: { file: 'views/relatorio.html', title: 'Relatório',     adminOnly: false },
    upload:    { file: 'views/upload.html',    title: 'Upload Cards',  adminOnly: true  },
    backup:    { file: 'views/backup.html',    title: 'Backup',        adminOnly: true  },
    config:    { file: 'views/config.html',    title: 'Configurações', adminOnly: true  }
  };

  /**
   * Caminho do fragmento que contém todos os 13 modais globais.
   * Sem underscore: compatibilidade direta com GitHub Pages/Jekyll.
   */
  const MODALS_FILE = 'views/modals.html';

  /**
   * ID do container onde os modais são injetados.
   * Alinhado com o shell: <div id="appModals"></div>.
   */
  const MODALS_CONTAINER_ID = 'appModals';

  const CONTAINER_ID = 'appMain';

  const viewCache = new Map();
  let currentPage = null;
  const inFlight = new Map();
  let modalsLoaded = false;
  let modalsInFlight = null;

  // ── HELPERS PRIVADOS ──

  async function fetchView(page) {
    if (!ROUTES[page]) throw new Error('Rota desconhecida: "' + page + '"');
    if (viewCache.has(page)) return viewCache.get(page);
    if (inFlight.has(page)) return inFlight.get(page);

    const promise = fetch(ROUTES[page].file, { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error('HTTP ' + response.status + ' ao carregar ' + ROUTES[page].file);
        return response.text();
      })
      .then(html => {
        viewCache.set(page, html);
        inFlight.delete(page);
        return html;
      })
      .catch(err => {
        inFlight.delete(page);
        throw err;
      });
    inFlight.set(page, promise);
    return promise;
  }

  function updateChrome(page) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    const titleEl = document.getElementById('pageTitle');
    if (titleEl && ROUTES[page]) titleEl.textContent = ROUTES[page].title;
    if (typeof window.APP !== 'undefined' && typeof APP.closeSidebarMobile === 'function') {
      APP.closeSidebarMobile();
    }
  }

  function renderError(page, err) {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;
    container.innerHTML =
      '<div class="page-inner" style="padding:40px 24px">' +
        '<div style="max-width:520px;margin:40px auto;text-align:center">' +
          '<div style="font-family:var(--font-d);font-size:22px;font-weight:700;color:var(--red);margin-bottom:8px">Erro ao carregar</div>' +
          '<p style="font-size:13px;color:var(--t3);margin-bottom:18px;line-height:1.5">' +
            'Não foi possível carregar a página <strong>' + page + '</strong>.<br>' +
            (err && err.message ? '<span style="font-size:11.5px;color:var(--t4)">' + err.message + '</span>' : '') +
          '</p>' +
          '<button class="btn btn-secondary" onclick="ROUTER.navigate(\'' + page + '\')">Tentar novamente</button>' +
        '</div>' +
      '</div>';
  }

  // ── API PÚBLICA ──

  async function navigate(page) {
    if (!ROUTES[page]) {
      console.warn('[ROUTER] Página desconhecida:', page);
      return;
    }
    if (ROUTES[page].adminOnly) {
      const isAdmin = (typeof window.SEC !== 'undefined' && SEC.isAdmin && SEC.isAdmin())
        || (typeof window.STATE !== 'undefined' && window.STATE && STATE.usuario === 'Leo');
      if (!isAdmin) {
        if (typeof window.APP !== 'undefined' && APP.toast) APP.toast('Acesso restrito', 'error');
        return;
      }
    }

    const container = document.getElementById(CONTAINER_ID);
    if (!container) {
      console.error('[ROUTER] Container #' + CONTAINER_ID + ' não encontrado');
      return;
    }

    try {
      const html = await fetchView(page);
      container.innerHTML = html;
      currentPage = page;
      updateChrome(page);

      try {
        if (typeof STATE !== 'undefined' && STATE) STATE.page = page;
      } catch (e) {}

      document.dispatchEvent(new CustomEvent('duetto:view-loaded', {
        detail: { page, container }
      }));

      if (typeof window.APP !== 'undefined' && typeof APP.renderPage === 'function') {
        APP.renderPage(page);
      }
    } catch (err) {
      console.error('[ROUTER] Falha ao carregar view:', err);
      renderError(page, err);
    }
  }

  async function refreshView() {
    if (!currentPage) return;
    viewCache.delete(currentPage);
    await navigate(currentPage);
  }

  function clearCache() {
    viewCache.clear();
    modalsLoaded = false;
    modalsInFlight = null;
  }

  /**
   * Injeta os 13 modais globais no container #appModals do shell.
   * Idempotente, concorrência segura (Promise compartilhada).
   * Deve ser chamada no boot ANTES de APP.modals().
   */
  async function injectModals() {
    if (modalsLoaded) return;
    if (modalsInFlight) return modalsInFlight;

    modalsInFlight = (async () => {
      const container = document.getElementById(MODALS_CONTAINER_ID);
      if (!container) {
        throw new Error(
          'Container #' + MODALS_CONTAINER_ID + ' não encontrado no shell. ' +
          'Adicione <div id="' + MODALS_CONTAINER_ID + '"></div> ao shell antes do </body>.'
        );
      }
      const response = await fetch(MODALS_FILE, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ' ao carregar ' + MODALS_FILE);
      }
      const html = await response.text();
      container.innerHTML = html;
      modalsLoaded = true;
      document.dispatchEvent(new CustomEvent('duetto:modals-loaded', {
        detail: { container }
      }));
    })().finally(() => {
      modalsInFlight = null;
    });

    return modalsInFlight;
  }

  function getCurrentPage() {
    return currentPage;
  }

  return {
    navigate,
    refreshView,
    clearCache,
    injectModals,
    getCurrentPage
  };
})();

window.ROUTER = ROUTER;
