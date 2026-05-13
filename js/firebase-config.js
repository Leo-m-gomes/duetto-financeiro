/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO firebase-config.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade exclusiva: inicializar o Firebase e expor os handles
 * `fbAuth` e `fbDb` para os demais módulos.
 *
 * NÃO contém lógica de autenticação (ver security.js).
 * NÃO contém regras de escrita ou validação (ver validacoes.js).
 * NÃO contém operações CRUD de domínio (ver fin-db.js).
 *
 * EXPORTS GLOBAIS (escopo window por design):
 *   window.fbAuth : firebase.auth.Auth
 *   window.fbDb   : firebase.firestore.Firestore
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

const FB_CONFIG = {
  apiKey:            "AIzaSyAq74uNulXvgJBF1R2j-obAS9mFIR-42IM",
  authDomain:        "duetto-financeiro.firebaseapp.com",
  projectId:         "duetto-financeiro",
  storageBucket:     "duetto-financeiro.firebasestorage.app",
  messagingSenderId: "891169172213",
  appId:             "1:891169172213:web:69a746240d17a6bb2673bc"
};

if (!firebase.apps.length) {
  firebase.initializeApp(FB_CONFIG);
}

window.fbAuth = firebase.auth();
window.fbDb   = firebase.firestore();
