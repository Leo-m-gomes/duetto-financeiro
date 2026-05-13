/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO router.js (Fase 1.4-D-3b)
 * ═══════════════════════════════════════════════════════════════════════════
 * FIX: Após innerHTML, ativa .active no .page e aguarda 1 frame antes
 * de chamar APP.renderPage. Elimina race condition de telas brancas.
 *
 * EXPORTS: window.ROUTER
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

  const MODALS_FILE = 'views/modals.html';
  const MODALS_CONTAINER_ID = 'appModals';
  const CONTAINER_ID = 'appMain';
  const viewCache = new Map();
  let currentPage = null;
  const inFlight = new Map();
  let modalsLoaded = false;
  let modalsInFlight = null;

  async function fetchView(page) {
    if (!ROUTES[page]) throw new Error('Rota desconhecida: "' + page + '"');
    if (viewCache.has(page)) return viewCache.get(page);
    if (inFlight.has(page)) return inFlight.get(page);
    const promise = fetch(ROUTES[page].file, { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(html => { viewCache.set(page, html); inFlight.delete(page); return html; })
      .catch(err => { inFlight.delete(page); throw err; });
    inFlight.set(page, promise);
    return promise;
  }

  function updateChrome(page) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    const t = document.getElementById('pageTitle');
    if (t && ROUTES[page]) t.textContent = ROUTES[page].title;
  }

  function renderError(page, err) {
    const c = document.getElementById(CONTAINER_ID);
    if (!c) return;
    c.innerHTML =
      '<div class="page active"><div class="page-inner" style="padding:40px 24px">' +
      '<div style="max-width:520px;margin:40px auto;text-align:center">' +
      '<div style="font-family:var(--font-d);font-size:22px;font-weight:700;color:var(--red);margin-bottom:8px">Erro ao carregar</div>' +
      '<p style="font-size:13px;color:var(--t3);margin-bottom:18px">' +
      'Página <strong>' + page + '</strong> não carregou.' +
      (err ? '<br><span style="font-size:11px;color:var(--t4)">' + err.message + '</span>' : '') +
      '</p><button class="btn btn-secondary" onclick="ROUTER.navigate(\'' + page + '\')">Tentar novamente</button>' +
      '</div></div></div>';
  }

  async function navigate(page) {
    if (!ROUTES[page]) { console.warn('[ROUTER] Rota desconhecida:', page); return; }
    if (ROUTES[page].adminOnly) {
      const ok = (typeof SEC !== 'undefined' && SEC.isAdmin && SEC.isAdmin())
        || (typeof STATE !== 'undefined' && STATE && STATE.usuario === 'Leo');
      if (!ok) {
        if (typeof APP !== 'undefined' && APP.toast) APP.toast('Acesso restrito', 'error');
        return;
      }
    }
    const container = document.getElementById(CONTAINER_ID);
    if (!container) { console.error('[ROUTER] #' + CONTAINER_ID + ' ausente'); return; }

    try {
      const html = await fetchView(page);

      // 1. Injetar HTML
      container.innerHTML = html;
      currentPage = page;

      // 2. Ativar .active no .page (GARANTE visibilidade CSS ANTES de render)
      //    Sem isso, .page{display:none} esconde tudo e render acha null.
      const pageEl = document.getElementById('page-' + page);
      if (pageEl) pageEl.classList.add('active');

      // 3. Chrome da sidebar + título
      updateChrome(page);

      // 4. STATE.page
      try { if (typeof STATE !== 'undefined' && STATE) STATE.page = page; } catch(e){}

      // 5. Evento custom
      document.dispatchEvent(new CustomEvent('duetto:view-loaded', { detail: { page, container } }));

      // 6. Aguardar 1 frame para o browser processar o DOM novo
      await new Promise(resolve => requestAnimationFrame(resolve));

      // 7. Popular dados via APP.renderPage
      if (typeof APP !== 'undefined' && typeof APP.renderPage === 'function') {
        try { APP.renderPage(page); }
        catch(err) { console.error('[ROUTER] renderPage(' + page + ') falhou:', err); }
      }
    } catch (err) {
      console.error('[ROUTER] Falha:', err);
      renderError(page, err);
    }
  }

  async function refreshView() {
    if (!currentPage) return;
    viewCache.delete(currentPage);
    await navigate(currentPage);
  }

  function clearCache() { viewCache.clear(); modalsLoaded = false; modalsInFlight = null; }

  async function injectModals() {
    if (modalsLoaded) return;
    if (modalsInFlight) return modalsInFlight;
    modalsInFlight = (async () => {
      const c = document.getElementById(MODALS_CONTAINER_ID);
      if (!c) throw new Error('Container #' + MODALS_CONTAINER_ID + ' ausente no shell.');
      const r = await fetch(MODALS_FILE, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ao carregar ' + MODALS_FILE);
      c.innerHTML = await r.text();
      modalsLoaded = true;
      document.dispatchEvent(new CustomEvent('duetto:modals-loaded', { detail: { container: c } }));
    })().finally(() => { modalsInFlight = null; });
    return modalsInFlight;
  }

  function getCurrentPage() { return currentPage; }
  return { navigate, refreshView, clearCache, injectModals, getCurrentPage };
})();
window.ROUTER = ROUTER;
