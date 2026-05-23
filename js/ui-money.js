"use strict";

/* ══════════════════════════════════════════════════════════════════════
   DUETTO FINANCEIRO - Mascara Monetaria (cents-based + multi-moeda)
   ══════════════════════════════════════════════════════════════════════
   Modelo: usuario digita SOMENTE digitos. Cada keystroke o valor e
   re-lido como inteiro de centavos, reformatado com separadores da
   moeda ativa e devolvido ao input. Cursor sempre ao final.

   Digitar "1050"  → exibe "10,50"  (BRL)
   Digitar "1050"  → exibe "10.50"  (USD/EUR)
   Digitar "150000" → exibe "1.500,00" (BRL)

   Firestore grava float: parseMoney("1.500,00") → 1500
   Retrocompativel: parseMoney aceita qualquer formato.

   Moeda ativa: MONEY_CFG (lido de localStorage dt_prefs.moeda).
   Padrao: BRL.
   ══════════════════════════════════════════════════════════════════════ */

/* ── Configuracoes de moeda ── */
var MONEY_CURRENCIES = {
  BRL: { decimal: ',', milhar: '.', simbolo: 'R$', locale: 'pt-BR' },
  USD: { decimal: '.', milhar: ',', simbolo: 'US$', locale: 'en-US' },
  EUR: { decimal: ',', milhar: '.', simbolo: '€',  locale: 'de-DE' },
};

var MONEY_CFG = MONEY_CURRENCIES.BRL;

/**
 * Inicializa a moeda ativa a partir das preferencias salvas.
 * Chamada no boot (carregarPrefsInicio) e ao trocar moeda na config.
 */
function moneySetCurrency(code) {
  var c = MONEY_CURRENCIES[code];
  if (c) MONEY_CFG = c;
}

/* ── Inicializa a partir do localStorage ── */
(function _moneyInit() {
  try {
    var prefs = JSON.parse(localStorage.getItem('dt_prefs') || '{}');
    if (prefs.moeda && MONEY_CURRENCIES[prefs.moeda]) {
      MONEY_CFG = MONEY_CURRENCIES[prefs.moeda];
    }
  } catch (e) { /* ignora */ }
})();

/* ── Formatacao ── */

/**
 * Formata um float para exibicao na moeda ativa.
 * fmtMoney(1500) → "1.500,00" (BRL) ou "1,500.00" (USD)
 */
function fmtMoney(v) {
  if (v == null || isNaN(v)) return '';
  return Number(v).toLocaleString(MONEY_CFG.locale, {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

/**
 * Converte string formatada (qualquer moeda) de volta para float.
 * parseMoney("1.500,00") → 1500  (BRL)
 * parseMoney("1,500.00") → 1500  (USD)
 * parseMoney("1500")     → 1500  (numeros puros)
 * Retrocompativel: aceita ambos os formatos.
 */
function parseMoney(str) {
  if (str == null) return 0;
  var s = String(str).trim();
  if (!s) return 0;

  // Detecta formato pelo padrao: ultimo separador define o decimal
  var hasComma = s.indexOf(',') >= 0;
  var hasDot   = s.indexOf('.') >= 0;

  if (hasComma && hasDot) {
    // Ambos presentes: o ultimo e o decimal
    var lastComma = s.lastIndexOf(',');
    var lastDot   = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      // pt-BR: 1.500,00
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // en-US: 1,500.00
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    var lastComma = s.lastIndexOf(',');
    if (s.indexOf(',') !== lastComma) {
      // Multiplas virgulas: ultima e decimal, demais sao milhar
      s = s.substring(0, lastComma).replace(/,/g, '') + '.' + s.substring(lastComma + 1);
    } else {
      s = s.replace(',', '.');
    }
  }
  // So ponto ou nenhum: ja e formato numerico

  var f = parseFloat(s);
  return isNaN(f) ? 0 : f;
}

/* ── Mascara cents-based ── */

/**
 * Aplica mascara cents-based a um valor cru (somente digitos).
 * Retorna string formatada na moeda ativa.
 * maskMoney("1050") → "10,50" (BRL) ou "10.50" (USD)
 */
function maskMoney(raw) {
  if (raw == null) return '';
  var onlyDigits = String(raw).replace(/\D/g, '');
  if (!onlyDigits) return '';
  // Trava em 13 digitos = 99.999.999.999,99 (limite defensivo)
  var safe = onlyDigits.slice(0, 13);
  var cents = parseInt(safe, 10) || 0;
  return (cents / 100).toLocaleString(MONEY_CFG.locale, {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

/**
 * Aplica a mascara diretamente ao valor de um <input>.
 */
function applyMoneyMask(input) {
  if (!input) return;
  input.value = maskMoney(input.value);
}

/**
 * Converte float do Firestore para centavos (para popular input cents-based).
 * floatToCents(1500) → "150000" (digitos puros para a mask processar)
 * Usado ao abrir modais com valores existentes.
 */
function floatToCentsStr(v) {
  if (v == null || isNaN(v)) return '';
  return String(Math.round(Number(v) * 100));
}

/**
 * Popula um input money com um float do Firestore, ja formatado.
 * setMoneyValue(el, 1500) → el.value = "1.500,00"
 */
function setMoneyValue(el, v) {
  if (!el) return;
  if (v == null || isNaN(v) || Number(v) === 0) { el.value = ''; return; }
  el.value = maskMoney(floatToCentsStr(v));
}

/* ── Binding ── */

/**
 * Liga a mascara cents-based em um <input>.
 * Idempotente via data-money-bound.
 * Usa addEventListener para coexistir com oninput inline (ex: pgValorPago).
 */
function bindMoneyInput(el) {
  if (!el || el.dataset.moneyBound) return;
  el.dataset.moneyBound = '1';
  if (!el.getAttribute('inputmode')) el.setAttribute('inputmode', 'numeric');

  // Bloqueia caracteres nao-numericos
  el.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var allowed = ['Backspace','Delete','Tab','Escape','Enter',
                   'ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];
    if (allowed.indexOf(e.key) >= 0) return;
    if (!/^\d$/.test(e.key)) e.preventDefault();
  });

  // Reaplica mascara a cada keystroke; cursor ao final
  el.addEventListener('input', function () {
    applyMoneyMask(el);
    var len = el.value.length;
    try { el.setSelectionRange(len, len); } catch (_) {}
  });

  // Cola: passa pelo mesmo pipeline
  el.addEventListener('paste', function () {
    setTimeout(function () { applyMoneyMask(el); }, 0);
  });

  // Blur: garante formato final limpo
  el.addEventListener('blur', function () {
    var v = parseMoney(el.value);
    el.value = v > 0 ? fmtMoney(v) : '';
  });
}

/**
 * Liga mascara em todos os inputs .money-input dentro do scope.
 * Idempotente: cada input e marcado com data-money-bound apos binding.
 */
function bindAllMoneyInputs(scope) {
  (scope || document).querySelectorAll(
    'input.money-input:not([data-money-bound])'
  ).forEach(bindMoneyInput);
}
