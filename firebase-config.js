/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO firebase-config.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade exclusiva: inicializar o Firebase e expor os handles
 * `fbAuth` e `fbDb` para os demais módulos.
 *
 * NÃO contém lógica de autenticação (ver security.js).
 * NÃO contém regras de escrita ou validação (ver validacoes.js).
 * NÃO contém operações CRUD de domínio (ver financeiro.js).
 *
 * IMPORTAÇÃO NO HTML
 * ─────────────────────────────────────────────────────────────────────────────
 * Este arquivo deve ser carregado APÓS as bibliotecas firebase-app-compat.js,
 * firebase-auth-compat.js e firebase-firestore-compat.js, e ANTES de qualquer
 * outro módulo que use `fbAuth` ou `fbDb`.
 *
 * EXPORTS GLOBAIS (escopo window por design)
 * ─────────────────────────────────────────────────────────────────────────────
 * window.fbAuth : firebase.auth.Auth
 * window.fbDb   : firebase.firestore.Firestore
 *
 * Por que escopo global em vez de ES Modules?
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. As libs firebase 9.x compat-mode são UMD, não ES modules.
 * 2. O HTML legado tem 1.112 linhas com `onclick="APP.X()"` que dependem de
 *    objetos globais. Forçar ES modules quebraria todos esses handlers.
 * 3. Migrar para módulos é decisão futura. Por ora, isolar arquivos é o
 *    suficiente para reduzir o débito técnico do monólito.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

/**
 * Configuração do projeto Firebase.
 *
 * Mantida em const local em vez de window porque é dado sensível-ish e
 * não precisa ser acessado por outros módulos. As chaves Firebase são
 * naturalmente públicas (vão para o cliente), mas concentrar a config
 * em um único ponto facilita auditoria.
 */
const FB_CONFIG = {
  apiKey:            "AIzaSyAq74uNulXvgJBF1R2j-obAS9mFIR-42IM",
  authDomain:        "duetto-financeiro.firebaseapp.com",
  projectId:         "duetto-financeiro",
  storageBucket:     "duetto-financeiro.firebasestorage.app",
  messagingSenderId: "891169172213",
  appId:             "1:891169172213:web:69a746240d17a6bb2673bc"
};

/**
 * Inicialização defensiva: se outro arquivo já tiver chamado
 * firebase.initializeApp (improvável, mas possível durante a refatoração),
 * evitamos o erro "Firebase: Firebase App named '[DEFAULT]' already exists".
 */
if (!firebase.apps.length) {
  firebase.initializeApp(FB_CONFIG);
}

/**
 * Handles globais para os módulos consumirem.
 * O módulo `security.js` usa `fbAuth` para login/logout e onAuthStateChanged.
 * O módulo `financeiro.js` usa `fbDb` para todas as operações Firestore.
 */
window.fbAuth = firebase.auth();
window.fbDb   = firebase.firestore();
