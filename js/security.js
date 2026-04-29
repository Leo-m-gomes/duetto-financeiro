/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO security.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade: autenticação Google, sessão, controle de papéis.
 *
 * Contém:
 *   - Lista branca de e-mails autorizados (ALLOWED_EMAILS)
 *   - SVG do logo Google (uso interno apenas)
 *   - Objeto SEC com API pública de segurança
 *   - Listener onAuthStateChanged que dispara o boot do app
 *
 * Não contém:
 *   - Inicialização do Firebase (ver firebase-config.js)
 *   - Validação de regras de escrita (ver validacoes.js)
 *   - Lógica de domínio (ver financeiro.js)
 *
 * IMPORTAÇÃO NO HTML
 * ─────────────────────────────────────────────────────────────────────────────
 * Carregar APÓS firebase-config.js e ui-utils.js, ANTES de financeiro.js
 * e app.js.
 *
 * EXPORTS GLOBAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * window.SEC  : objeto principal com API de segurança
 * window.AUTH : alias temporário (ver "Compatibilidade Legada" abaixo)
 *
 * COMPATIBILIDADE LEGADA
 * ─────────────────────────────────────────────────────────────────────────────
 * O HTML legado tem onclick="AUTH.signOut()" e onclick="AUTH.signInGoogle()".
 * Renomear isso em 1.112 linhas de HTML hoje seria mais arriscado do que
 * manter um alias `window.AUTH = SEC` por uma versão. Marcado para remoção
 * na Fase 1.4.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

/* ═════════════════════════════════════════════════════════════════════════
   CONSTANTES PRIVADAS DO MÓDULO
   ═════════════════════════════════════════════════════════════════════════ */

/**
 * E-mails autorizados a usar o sistema.
 * Defesa em camadas: além disto, as Security Rules do Firestore validam
 * o request.auth.token.email server-side. Esta lista é UX (rejeita login
 * com mensagem amigável); a defesa de dados é server-side.
 */
const ALLOWED_EMAILS = [
  'leonardo.phn7@gmail.com',
  'pri.alverim@gmail.com'
];

/**
 * Mapeamento e-mail → nome interno (Leo / Pri).
 * Centralizar em const evita "ifs" espalhados pelo código.
 */
const EMAIL_TO_USUARIO = {
  'leonardo.phn7@gmail.com': 'Leo',
  'pri.alverim@gmail.com':   'Pri'
};

/**
 * Lista de admins. Apenas Leo pode acessar Configurações e Upload de Cards.
 * Em produção (post-Firestore para Notas), espelhar nas Security Rules.
 */
const ADMIN_USERS = ['Leo'];

/**
 * SVG do botão de login com Google. Uso interno apenas, injetado em
 * SEC.signInGoogle quando precisa restaurar o estado original do botão
 * em caso de erro.
 */
const ICON_GOOGLE = '<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';


/* ═════════════════════════════════════════════════════════════════════════
   API PÚBLICA: objeto SEC
   ═════════════════════════════════════════════════════════════════════════ */

/**
 * Único ponto de entrada para operações de segurança.
 * Toda checagem de papel deve usar SEC.isAdmin() / SEC.isFamilia(),
 * nunca comparar STATE.usuario === 'Leo' diretamente nos módulos de domínio.
 */
const SEC = {

  /**
   * Inicia o fluxo de login Google via popup.
   * Fallback automático para redirect quando o navegador bloqueia popups
   * (comum em iOS Safari e em janelas privadas).
   *
   * O resultado do login é tratado pelo listener onAuthStateChanged abaixo,
   * que decide entre liberar o app, mostrar tela "negado" ou voltar à tela
   * de login.
   */
  signInGoogle() {
    const btn = document.getElementById('btnGoogle');
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid #ccc;border-top-color:#006437;border-radius:50%;animation:spin .7s linear infinite"></span> Entrando...';

    const provider = new firebase.auth.GoogleAuthProvider();
    // prompt:'select_account' força a tela de seleção mesmo se já houver
    // sessão Google ativa, evitando login automático em conta indesejada.
    provider.setCustomParameters({ prompt: 'select_account' });

    fbAuth.signInWithPopup(provider)
      .then(() => { /* onAuthStateChanged cuida do resto */ })
      .catch(err => {
        // Restaura o botão para que o usuário possa tentar novamente.
        btn.disabled = false;
        btn.innerHTML = ICON_GOOGLE + ' Entrar com Google';

        // Popup fechado intencionalmente pelo usuário, não é erro real.
        if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(err.code)) return;

        // Popup bloqueado pelo navegador: usa redirect como fallback.
        if (err.code === 'auth/popup-blocked') {
          fbAuth.signInWithRedirect(provider);
          return;
        }

        // Erro inesperado: alert simples (raro, log no console para debug).
        alert('Erro ao entrar: ' + err.message);
        console.error('[SEC.signInGoogle]', err);
      });
  },

  /**
   * Encerra a sessão. Pede confirmação para evitar logout acidental.
   * onAuthStateChanged detecta e volta para a tela de login.
   */
  signOut() {
    if (!confirm('Sair do Duetto Financeiro?')) return;
    fbAuth.signOut();
  },

  /**
   * Retorna o nome interno do usuário corrente ('Leo' | 'Pri' | '').
   * Antes da autenticação completar, retorna ''.
   *
   * @returns {string}
   */
  getUsuario() {
    const u = fbAuth.currentUser;
    if (!u || !u.email) return '';
    return EMAIL_TO_USUARIO[u.email] || '';
  },

  /**
   * Retorna o e-mail Google do usuário corrente, ou '' se não autenticado.
   * Útil para logs e auditoria.
   *
   * @returns {string}
   */
  getEmail() {
    return (fbAuth.currentUser && fbAuth.currentUser.email) || '';
  },

  /**
   * Indica se o usuário corrente é admin (Leo).
   * Use para esconder/mostrar UI de Configurações e Upload de Cards.
   *
   * REPLICAR esta regra nas Security Rules do Firestore quando
   * houver coleções restritas a admin.
   *
   * @returns {boolean}
   */
  isAdmin() {
    return ADMIN_USERS.includes(this.getUsuario());
  },

  /**
   * Indica se o usuário corrente faz parte da família autorizada.
   * Equivale a "está logado e o e-mail está na lista branca".
   *
   * @returns {boolean}
   */
  isFamilia() {
    const email = this.getEmail();
    return !!email && ALLOWED_EMAILS.includes(email);
  },

  /**
   * Verifica se um e-mail específico está autorizado.
   * Usado pelo onAuthStateChanged ANTES de promover o usuário ao app.
   *
   * @param {string} email
   * @returns {boolean}
   */
  isAllowed(email) {
    return !!email && ALLOWED_EMAILS.includes(email);
  }
};

/* ═════════════════════════════════════════════════════════════════════════
   ALIAS DE COMPATIBILIDADE
   Marcado para remoção na Fase 1.4 após varredura no HTML.
   ═════════════════════════════════════════════════════════════════════════ */
window.SEC  = SEC;
window.AUTH = SEC;  // alias legado: HTML usa onclick="AUTH.signOut()"


/* ═════════════════════════════════════════════════════════════════════════
   AUTH STATE OBSERVER, gateway entre login e app
   ═════════════════════════════════════════════════════════════════════════
   Este listener é o ÚNICO lugar do sistema que altera o estado de tela
   após autenticação. Decide entre 3 cenários:
     1. Sem usuário      → tela de login
     2. E-mail não autorizado → tela "negado"
     3. E-mail autorizado     → seed se necessário, depois listeners do app
   ═════════════════════════════════════════════════════════════════════════ */

fbAuth.onAuthStateChanged(async user => {
  // ── Cenário 1: nenhum usuário autenticado ──
  if (!user) {
    if (typeof window.show === 'function') window.show('screenLogin');
    const msg = document.getElementById('loadingMsg');
    if (msg) msg.textContent = 'Conectando...';
    return;
  }

  // ── Cenário 2: usuário autenticado mas fora da lista branca ──
  if (!SEC.isAllowed(user.email)) {
    const denied = document.getElementById('deniedEmail');
    if (denied) denied.textContent = user.email;
    if (typeof window.show === 'function') window.show('screenDenied');
    return;
  }

  // ── Cenário 3: usuário autorizado ──
  // O nome interno (Leo/Pri) é gravado em FIN_STATE.usuario pelo módulo
  // financeiro.js, que ouvirá um evento custom dispatched aqui (alternativa
  // futura mais limpa). Por compatibilidade, mantemos a gravação direta:
  if (window.FIN_STATE) {
    FIN_STATE.usuario = SEC.getUsuario();
  } else if (window.STATE) {
    // Compatibilidade durante a transição: STATE ainda é o objeto antigo.
    STATE.usuario = SEC.getUsuario();
  }

  const msg = document.getElementById('loadingMsg');
  if (msg) msg.textContent = 'Carregando dados...';
  if (typeof window.show === 'function') window.show('screenLoading');

  // Seed e setup ficam em outros módulos. Aqui apenas disparamos.
  if (typeof window.seedIfEmpty === 'function') {
    await window.seedIfEmpty();
  }
  if (typeof window.setupListeners === 'function') {
    window.setupListeners();
  }
});

/**
 * Captura resultado de redirect caso tenha sido usado como fallback
 * para popup bloqueado. O `.catch(()=>{})` é intencional: não há ação
 * de erro útil aqui, o onAuthStateChanged já trata sucesso e falha.
 */
fbAuth.getRedirectResult().catch(() => {});
