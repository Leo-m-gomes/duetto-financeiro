/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO security.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade: autenticação Google, sessão, controle de papéis.
 *
 * EXPORTS GLOBAIS:
 *   window.SEC  : objeto principal com API de segurança
 *   window.AUTH : alias temporário (HTML legado usa onclick="AUTH.signOut()")
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

const ALLOWED_EMAILS = [
  'leonardo.phn7@gmail.com',
  'pri.alverim@gmail.com'
];

const EMAIL_TO_USUARIO = {
  'leonardo.phn7@gmail.com': 'Leo',
  'pri.alverim@gmail.com':   'Pri'
};

const ADMIN_USERS = ['Leo'];

const ICON_GOOGLE = '<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

const SEC = {

  signInGoogle() {
    const btn = document.getElementById('btnGoogle');
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid #ccc;border-top-color:#006437;border-radius:50%;animation:spin .7s linear infinite"></span> Entrando...';

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    fbAuth.signInWithPopup(provider)
      .then(() => {})
      .catch(err => {
        btn.disabled = false;
        btn.innerHTML = ICON_GOOGLE + ' Entrar com Google';
        if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(err.code)) return;
        if (err.code === 'auth/popup-blocked') {
          fbAuth.signInWithRedirect(provider);
          return;
        }
        alert('Erro ao entrar: ' + err.message);
        console.error('[SEC.signInGoogle]', err);
      });
  },

  signOut() {
    if (!confirm('Sair do Duetto Financeiro?')) return;
    fbAuth.signOut();
  },

  getUsuario() {
    const u = fbAuth.currentUser;
    if (!u || !u.email) return '';
    return EMAIL_TO_USUARIO[u.email] || '';
  },

  getEmail() {
    return (fbAuth.currentUser && fbAuth.currentUser.email) || '';
  },

  isAdmin() {
    return ADMIN_USERS.includes(this.getUsuario());
  },

  isFamilia() {
    const email = this.getEmail();
    return !!email && ALLOWED_EMAILS.includes(email);
  },

  isAllowed(email) {
    return !!email && ALLOWED_EMAILS.includes(email);
  }
};

window.SEC  = SEC;
window.AUTH = SEC;

fbAuth.onAuthStateChanged(async user => {
  if (!user) {
    if (typeof window.show === 'function') window.show('screenLogin');
    const msg = document.getElementById('loadingMsg');
    if (msg) msg.textContent = 'Conectando...';
    return;
  }

  if (!SEC.isAllowed(user.email)) {
    const denied = document.getElementById('deniedEmail');
    if (denied) denied.textContent = user.email;
    if (typeof window.show === 'function') window.show('screenDenied');
    return;
  }

  // ── Cenário 3: usuário autorizado ──
  // FIX (Fase 1.3): STATE é declarado com const em fin-state.js.
  // Variáveis const/let no top-level NÃO viram propriedades de window.
  // Usamos referência direta com try/catch para compatibilidade.
  const usuario = SEC.getUsuario();
  try {
    if (typeof STATE !== 'undefined' && STATE) {
      STATE.usuario = usuario;
    }
  } catch (e) {
    // STATE pode não existir se fin-state.js falhou ou foi removido.
  }
  if (window.FIN_STATE) {
    FIN_STATE.usuario = usuario;
  }
  document.dispatchEvent(new CustomEvent('duetto:auth-ready', {
    detail: { usuario, email: SEC.getEmail() }
  }));

  const msg = document.getElementById('loadingMsg');
  if (msg) msg.textContent = 'Carregando dados...';
  if (typeof window.show === 'function') window.show('screenLoading');

  if (typeof window.seedIfEmpty === 'function') {
    await window.seedIfEmpty();
  }
  if (typeof window.setupListeners === 'function') {
    window.setupListeners();
  }
});

fbAuth.getRedirectResult().catch(() => {});
