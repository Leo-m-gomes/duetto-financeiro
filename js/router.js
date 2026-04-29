/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO router.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade: gerenciar a navegação entre views HTML, carregando
 * fragmentos via fetch sob demanda. Substituição progressiva do sistema
 * legado onde TODAS as páginas viviam embutidas no index.html.
 *
 * O QUE ESTE MÓDULO FAZ
 * ─────────────────────────────────────────────────────────────────────────────
 *  • Mantém um cache em memória das views já carregadas (evita re-fetch)
 *  • Injeta o HTML da view no container #appMain
 *  • Atualiza o estado visual da sidebar (item ativo)
 *  • Atualiza o título da topbar
 *  • Dispara um evento custom `duetto:view-loaded` para que módulos de
 *    domínio reapliquem listeners e renderizem dados
 *  • Trata erros de fetch com mensagem amigável e mantém última view ativa
 *
 * O QUE ESTE MÓDULO NÃO FAZ
 * ─────────────────────────────────────────────────────────────────────────────
 *  • Não renderiza dados nas views (responsabilidade de financeiro.js)
 *  • Não trata permissões de admin (responsabilidade de security.js)
 *  • Não cuida de modais (modais ficam no shell, não em views)
 *
 * COMPATIBILIDADE COM APP LEGADO
 * ─────────────────────────────────────────────────────────────────────────────
 * Durante a transição, ROUTER.navigate(p) chama APP.renderPage(p) APÓS
 * carregar a view, mantendo intacto todo o pipeline de render existente.
 * Assim o app legado funciona sem precisar conhecer o router.
 *
 * IMPORTAÇÃO NO HTML
 * ─────────────────────────────────────────────────────────────────────────────
 * Carregar APÓS firebase-config.js, ui-utils.js e security.js, ANTES de
 * financeiro.js e app.js.
 *
 * EXPORTS GLOBAIS
 * ─────────────────────────────────────────────────────────────────────────────
 *   window.ROUTER : objeto com API pública do roteador
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

const ROUTER = (() => {

  /* ═════════════════════════════════════════════════════════════════════
     CONFIGURAÇÃO
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * Mapa de páginas conhecidas para o sistema. A chave é o slug usado em
   * navigate(p) e em data-page no HTML. Cada entrada define:
   *   - file: caminho da view (relativo ao index.html)
   *   - title: rótulo exibido na topbar quando esta página está ativa
   *   - adminOnly: se true, só admins (Leo) acessam
   *
   * Adicionar páginas novas (notas, etc.) aqui é a única alteração
   * estrutural necessária no router.
   */
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
   * Carregado uma única vez no boot via ROUTER.injectModals().
   * Centralizado em const para facilitar mudança futura (ex: separar
   * modais por domínio em arquivos diferentes).
   */
  const MODALS_FILE = 'views/_modals.html';

  /**
   * ID do container onde os modais são injetados. Definido no shell do
   * index.html como <div id="appModals"></div> próximo do toast.
   */
  const MODALS_CONTAINER_ID = 'appModals';

  /**
   * ID do container onde as views são injetadas. Definido no shell do
   * index.html. Centralizar em const evita string mágica espalhada.
   */
  const CONTAINER_ID = 'appMain';

  /* ═════════════════════════════════════════════════════════════════════
     ESTADO INTERNO (não exportado)
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * Cache de views já carregadas. Chave = slug da página, valor = HTML string.
   * O cache vive em memória durante toda a sessão. Como views são pequenas
   * e estáticas (sem dados), não há motivo para invalidar.
   */
  const viewCache = new Map();

  /**
   * Slug da view atualmente exibida. Usado para detecção de
   * "navegação para a mesma página" (que não força re-fetch).
   */
  let currentPage = null;

  /**
   * Promise da requisição em andamento, se houver. Evita iniciar duas
   * requisições simultâneas para a mesma view (caso o usuário clique
   * rapidamente em dois itens da sidebar).
   */
  const inFlight = new Map();

  /**
   * Indica se os modais globais já foram injetados na sessão atual.
   * injectModals() é idempotente: chamar duas vezes não duplica injeção.
   */
  let modalsLoaded = false;

  /**
   * Promise da injeção de modais em andamento. Permite que múltiplos
   * callers chamem injectModals() em paralelo recebendo a mesma Promise.
   */
  let modalsInFlight = null;

  /* ═════════════════════════════════════════════════════════════════════
     HELPERS PRIVADOS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * Busca o conteúdo de uma view, usando cache quando disponível.
   * Em caso de falha, lança erro para o caller decidir o que fazer.
   *
   * @param {string} page slug da página (chave de ROUTES)
   * @returns {Promise<string>} HTML da view
   * @throws {Error} se a view não existe ou o fetch falha
   */
  async function fetchView(page) {
    if (!ROUTES[page]) {
      throw new Error(`Rota desconhecida: "${page}"`);
    }
    if (viewCache.has(page)) {
      return viewCache.get(page);
    }
    if (inFlight.has(page)) {
      // Já há uma requisição para esta view; aguardamos a mesma.
      return inFlight.get(page);
    }
    const promise = fetch(ROUTES[page].file, { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ao carregar ${ROUTES[page].file}`);
        }
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

  /**
   * Atualiza a UI da sidebar e topbar ao mudar de página.
   *  - Marca o nav-item correspondente como .active
   *  - Atualiza o texto da topbar
   *  - Fecha a sidebar mobile (se aberta)
   *
   * @param {string} page
   */
  function updateChrome(page) {
    // Highlight do item da sidebar.
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    // Título da topbar.
    const titleEl = document.getElementById('pageTitle');
    if (titleEl && ROUTES[page]) {
      titleEl.textContent = ROUTES[page].title;
    }
    // Fecha sidebar mobile (se houver helper exposto pelo APP legado).
    if (typeof window.APP !== 'undefined' && typeof APP.closeSidebarMobile === 'function') {
      APP.closeSidebarMobile();
    }
  }

  /**
   * Exibe mensagem de erro discreta no container quando uma view falha.
   * Mantém a sidebar funcional, permitindo o usuário tentar outra página.
   *
   * @param {string} page slug que falhou
   * @param {Error} err  erro capturado
   */
  function renderError(page, err) {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;
    container.innerHTML = `
      <div class="page-inner" style="padding:40px 24px">
        <div style="max-width:520px;margin:40px auto;text-align:center">
          <div style="font-family:var(--font-d);font-size:22px;font-weight:700;color:var(--red);margin-bottom:8px">
            Erro ao carregar
          </div>
          <p style="font-size:13px;color:var(--t3);margin-bottom:18px;line-height:1.5">
            Não foi possível carregar a página <strong>${page}</strong>.<br>
            ${err && err.message ? '<span style="font-size:11.5px;color:var(--t4)">' + err.message + '</span>' : ''}
          </p>
          <button class="btn btn-secondary" onclick="ROUTER.navigate('${page}')">Tentar novamente</button>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     API PÚBLICA
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * Navega para a página indicada. Carrega a view (cache ou fetch),
   * injeta no container, atualiza UI e dispara o evento custom
   * `duetto:view-loaded` para que os módulos de domínio rendam dados.
   *
   * Compatibilidade legada: se window.APP.renderPage existe, é chamada
   * automaticamente APÓS a injeção do HTML, mantendo o pipeline atual
   * intacto durante a transição.
   *
   * @param {string} page slug (chave de ROUTES)
   * @returns {Promise<void>}
   */
  async function navigate(page) {
    if (!ROUTES[page]) {
      console.warn('[ROUTER] Página desconhecida:', page);
      return;
    }
    // Bloqueio de admin: se a rota exige admin e o usuário não é, mostra
    // toast (se UI utils disponível) e não navega.
    if (ROUTES[page].adminOnly) {
      const isAdmin = (typeof window.SEC !== 'undefined' && SEC.isAdmin && SEC.isAdmin())
        || (typeof window.STATE !== 'undefined' && window.STATE && STATE.usuario === 'Leo');
      if (!isAdmin) {
        if (typeof window.UI !== 'undefined' && UI.toast) UI.toast('Acesso restrito', 'error');
        else if (typeof window.APP !== 'undefined' && APP.toast) APP.toast('Acesso restrito', 'error');
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

      // Atualiza STATE.page para compatibilidade com o app legado, que
      // consulta STATE.page em diversos lugares (toggleFiltros, sortTable...).
      try {
        if (typeof STATE !== 'undefined' && STATE) STATE.page = page;
      } catch (e) { /* STATE pode não existir após Fase 1.4 */ }

      // Dispara evento para hooks de domínio (financeiro.js, etc.) que
      // precisem reaplicar listeners ou renderizar dados.
      document.dispatchEvent(new CustomEvent('duetto:view-loaded', {
        detail: { page, container }
      }));

      // Compatibilidade legada: chama o pipeline antigo APÓS a view estar
      // no DOM. Isso preserva todo o comportamento de filtros, gráficos e
      // tabelas existente em APP.renderDashboard, APP.renderContas, etc.
      if (typeof window.APP !== 'undefined' && typeof APP.renderPage === 'function') {
        APP.renderPage(page);
      }
    } catch (err) {
      console.error('[ROUTER] Falha ao carregar view:', err);
      renderError(page, err);
    }
  }

  /**
   * Recarrega a view atual. Útil após mudança de tema ou idioma global.
   * Não usa cache: força re-fetch.
   *
   * @returns {Promise<void>}
   */
  async function refreshView() {
    if (!currentPage) return;
    viewCache.delete(currentPage);
    await navigate(currentPage);
  }

  /**
   * Limpa o cache inteiro. Usado em logout para evitar vazamento de
   * conteúdo entre sessões (caso o sistema permita troca de usuário
   * sem reload, o que não acontece hoje, mas é boa prática).
   */
  function clearCache() {
    viewCache.clear();
    modalsLoaded = false;
    modalsInFlight = null;
  }

  /**
   * Injeta os 13 modais globais no container #appModals do shell.
   *
   * COMPORTAMENTO:
   *   • Idempotente: chamadas subsequentes não duplicam injeção
   *   • Concorrência segura: múltiplos chamadores recebem a mesma Promise
   *   • Em caso de falha de fetch, lança erro para o orquestrador decidir
   *     (sem fallback silencioso, pois sem modais o app não funciona)
   *
   * QUANDO CHAMAR:
   *   No boot do app, ANTES de APP.modals() (que adiciona listeners aos
   *   data-close dos modais). A ordem correta é:
   *     await ROUTER.injectModals()
   *     APP.modals()         // agora encontra os elementos no DOM
   *     APP.boot()           // resto do boot
   *
   * NA FASE 1.4-A: esta função existe mas NÃO é chamada por ninguém ainda
   * (o legado ainda tem os modais embutidos no index.html). Será religada
   * na Fase 1.4-B junto com a promoção do shell.
   *
   * @returns {Promise<void>}
   */
  async function injectModals() {
    // Idempotência: se já carregou, não refaz nada.
    if (modalsLoaded) return;

    // Concorrência: se já há injeção em andamento, aguarda a mesma.
    if (modalsInFlight) return modalsInFlight;

    modalsInFlight = (async () => {
      const container = document.getElementById(MODALS_CONTAINER_ID);
      if (!container) {
        throw new Error(
          `Container #${MODALS_CONTAINER_ID} não encontrado no DOM. ` +
          `Adicione <div id="${MODALS_CONTAINER_ID}"></div> ao shell antes ` +
          `do <div class="toast" id="toast">.`
        );
      }
      const response = await fetch(MODALS_FILE, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ao carregar ${MODALS_FILE}`);
      }
      const html = await response.text();
      container.innerHTML = html;
      modalsLoaded = true;
      // Notifica módulos que os modais estão prontos (caso queiram
      // adicionar listeners adicionais sem depender do APP.modals legado).
      document.dispatchEvent(new CustomEvent('duetto:modals-loaded', {
        detail: { container }
      }));
    })().finally(() => {
      modalsInFlight = null;
    });

    return modalsInFlight;
  }

  /**
   * Retorna o slug da página atual.
   * @returns {string|null}
   */
  function getCurrentPage() {
    return currentPage;
  }

  /* ═════════════════════════════════════════════════════════════════════
     INJEÇÃO DE FRAGMENTOS PRIVADOS (prefixo underscore)
     ═════════════════════════════════════════════════════════════════════
     Convenção: arquivos como views/_modals.html, views/_widgets.html etc.
     são fragmentos auxiliares carregados UMA VEZ no boot, fora do fluxo
     normal de rotas.

     Diferenças em relação a navigate():
       - Não atualizam currentPage nem chrome (sidebar, topbar)
       - Não disparam evento `duetto:view-loaded`
       - Vão para containers específicos, não para #appMain
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * Carrega views/_modals.html e injeta em #modalsContainer.
   * Idempotente: se os modais já foram injetados (verificado pela presença
   * de #ovConta no DOM), não faz nada.
   *
   * Por que existe: APP.modals() do app.js legado faz addEventListener em
   * elementos internos dos modais (btnSalvarConta, fVP, sSal, etc.) durante
   * o boot. Se os modais não estiverem no DOM nesse momento, todos esses
   * getElementById retornam null e o boot inteiro crasha.
   *
   * Esta função GARANTE que todos os 13 modais existam no DOM ANTES de
   * APP.boot() ser chamado. Deve ser awaitada na sequência de inicialização
   * do shell.
   *
   * IMPORTANTE: o fragmento é injetado em #modalsContainer (NÃO no shell
   * geral), para que fique fora de #screenApp (que tem display:none antes
   * do login). Modais devem ser raízes do <body> para overlay fullscreen
   * funcionar corretamente.
   *
   * @returns {Promise<void>}
   * @throws {Error} se o container não existe ou o fetch falha
   */
  async function injectModals() {
    // Idempotência: detecta se já há modais no DOM. Útil para hot-reload.
    if (document.getElementById('ovConta')) {
      console.info('[ROUTER] Modais já presentes no DOM, injeção pulada.');
      return;
    }

    const container = document.getElementById('modalsContainer');
    if (!container) {
      throw new Error('Container #modalsContainer não encontrado no shell. ' +
        'Adicione <div id="modalsContainer"></div> no body do index.html antes do </body>.');
    }

    try {
      const response = await fetch('views/_modals.html', { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ao carregar views/_modals.html`);
      }
      const html = await response.text();
      container.innerHTML = html;
      console.info('[ROUTER] Modais injetados com sucesso.');
    } catch (err) {
      console.error('[ROUTER] Falha ao injetar modais:', err);
      throw err;  // Repassa: o boot deve abortar se modais falham
    }
  }

  return {
    navigate,
    refreshView,
    clearCache,
    getCurrentPage,
    injectModals
  };
})();

window.ROUTER = ROUTER;
