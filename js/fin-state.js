/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO fin-state.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade: constantes globais, helpers de formatação, estado da
 * aplicação e valores default. Este arquivo é o PRIMEIRO a carregar (após
 * firebase-config.js e security.js) e TODOS os outros módulos dependem dele.
 *
 * CONTÉM:
 *   Constantes: MESES, MESES_F, COLORS
 *   Helpers:    fmt, fmtN, fmtDate, today, isOverdue, vEfetivo,
 *               getChartColors, getChartDefaults
 *   Defaults:   DEFAULT_TABELAS, SEED_CATS, SEED_FORMAS
 *   Estado:     STATE (mutável, central, compartilhado por todos os módulos)
 *
 * IMPORTAÇÃO NO HTML:
 *   Carregar APÓS firebase-config.js e security.js, ANTES de fin-cache.js.
 *
 * EXPORTS GLOBAIS:
 *   Todos os símbolos acima ficam no escopo léxico global (const/function).
 *   Aliases em window.* mantidos para compatibilidade com onclick no HTML.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

// ── CONSTANTES DE CALENDÁRIO E CORES ──
const MESES   = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_F = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const COLORS  = ['#006437','#00a85a','#d97706','#dc2626','#2563eb','#7c3aed','#0891b2','#ea580c','#65a30d','#64748b'];

// ══════════════════════════════════════════════════════════════
// HELPERS DUAL-THEME PARA CHART.JS (M03)
// Adaptam paleta e defaults conforme o modo claro/escuro ativo.
// Chamados dinamicamente em cada render, garantindo re-render
// correto após APP.toggleDark (que invoca renderPage).
// ══════════════════════════════════════════════════════════════

/**
 * Retorna a paleta de cores adequada ao tema vigente.
 * Tema claro: paleta verde Palmeiras + apoios sóbrios.
 * Tema escuro: paleta Apple-style com saturação ajustada para contraste.
 * @returns {string[]} Array de 10 cores hexadecimais.
 */
function getChartColors() {
  const dark = document.documentElement.classList.contains('dark');
  return dark
    ? [
        '#32d74b', // verde Apple, cor primaria
        '#0a84ff', // azul Apple
        '#ff9f0a', // laranja Apple
        '#ff453a', // vermelho Apple
        '#bf5af2', // roxo Apple
        '#64d2ff', // ciano Apple
        '#ffd60a', // amarelo Apple
        '#30d158', // verde menta
        '#5e5ce6', // indigo Apple
        '#ac8c00', // dourado dessaturado
      ]
    : [
        '#006437', // verde Palmeiras, cor primaria
        '#2563eb', // azul institucional
        '#d97706', // laranja
        '#dc2626', // vermelho
        '#7c3aed', // roxo
        '#0891b2', // ciano
        '#ea580c', // laranja escuro
        '#65a30d', // lima
        '#4f46e5', // indigo
        '#64748b', // slate, neutro
      ];
}

/**
 * Retorna defaults de texto, borda e grid para Chart.js conforme o tema.
 * Centraliza a logica de cor que antes estava duplicada em cada grafico.
 * @returns {{color:string, borderColor:string, gridColor:string, tooltipBg:string}}
 */
function getChartDefaults() {
  const dark = document.documentElement.classList.contains('dark');
  return {
    color:       dark ? 'rgba(235,235,245,0.85)' : '#374151',
    borderColor: dark ? 'rgba(58,58,60,1)'        : '#e8edf2',
    gridColor:   dark ? 'rgba(255,255,255,0.05)'  : 'rgba(0,0,0,0.04)',
    tooltipBg:   dark ? 'rgba(28,28,30,0.97)'     : 'rgba(15,31,20,0.92)',
  };
}

// ── FORMATAÇÃO ──
const fmt     = v => v==null||isNaN(v)?'—':'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtN    = v => v==null||isNaN(v)?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtDate = s => { if(!s)return'—'; const d=new Date(s+'T12:00'); return d.toLocaleDateString('pt-BR'); };
const today   = () => new Date().toISOString().split('T')[0];
const isOverdue = c => !!(c.data < today() && !(c.vPago > 0));
// Valor efetivo: se foi pago, o valor real pago é o que vale (pode ter multa ou desconto)
const vEfetivo  = c => c.vPago > 0 ? c.vPago : c.vPagar;

// ── DEFAULTS E SEEDS ──
const DEFAULT_TABELAS = {
  ir:[{de:0,ate:2259.20,al:0,ded:0},{de:2259.21,ate:2826.65,al:.075,ded:169.44},{de:2826.66,ate:3751.06,al:.15,ded:381.44},{de:3751.07,ate:4664.68,al:.225,ded:662.77},{de:4664.69,ate:null,al:.275,ded:896.00}],
  inss:[{de:0,ate:1518,al:.075,ded:0},{de:1518.01,ate:2793.88,al:.09,ded:22.77},{de:2793.89,ate:4190.83,al:.12,ded:106.59},{de:4190.84,ate:8157.41,al:.14,ded:190.40}],
  dedDep:189.59,tetoINSS:908.86,vigencia:'2024/2025'
};
const SEED_CATS = ['Alimentação','Aposta','Barbearia','Calçado','Carro','Casa','Combustível','Contrato','Cursos','Custo com trabalho','Empréstimo','Escola','Estudos','Faculdade','Farmácia','Games','Igreja','Internet','Lanche','Negociação','Outros','Pet','Pós-Graduação','Presente','Restaurante','Roupa','Salão','Saúde','Streamer','Telefone'];
const SEED_FORMAS = ['Automático','Boleto','Cartão Banescard Chica','Cartão flash','Cartão iFood','Cartão Itaú black','Cartão Itaú signature','Cartão Nubank','Débito','Dinheiro','PIX','Transferência'];

// ── ESTADO GLOBAL (mutável, compartilhado por todos os módulos) ──
const STATE = {
  page:'dashboard', pg:1, pgSz:20,
  dashResp:'', editContaId:null, editSalPessoa:null,
  charts:{}, recEditando:false, parcGrupo:null, gerenciarTipo:'cat',
  periodo:null, periodoDash:null, periodoContas:null, periodoTela:null,
  usuario:'', filtroAno:String(new Date().getFullYear()), filtroMes:String(new Date().getMonth()),
  sortContas:{col:null, dir:1},   // col=nome da coluna, dir=1 asc / -1 desc
  sortRel:   {col:null, dir:1},
  darkMode:  localStorage.getItem('dt_dark')==='1',
  // R14: Modo Privacidade. Por design NÃO persiste em localStorage.
  // Sempre inicia desativado para que valores não fiquem ocultos sem o usuário saber.
  hideValues: false,
};

// ── ALIASES TEMPORÁRIOS (compatibilidade com onclick no HTML) ──
// Serão removidos quando o HTML migrar de onclick para addEventListener.
window.fmt      = fmt;
window.fmtN     = fmtN;
window.fmtDate  = fmtDate;
window.today    = today;
window.isOverdue = isOverdue;
window.vEfetivo = vEfetivo;
