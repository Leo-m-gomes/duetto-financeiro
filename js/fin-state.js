/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO fin-state.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade: constantes globais, helpers de formatação, estado da
 * aplicação e valores default. PRIMEIRO módulo a carregar após firebase-config.
 *
 * EXPORTS GLOBAIS (escopo léxico, com aliases window.*):
 *   MESES, MESES_F, COLORS, fmt, fmtN, fmtDate, today, isOverdue, vEfetivo,
 *   getChartColors, getChartDefaults, DEFAULT_TABELAS, SEED_CATS, SEED_FORMAS,
 *   STATE
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

// ── CONSTANTES ──
const MESES   = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_F = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const COLORS  = ['#006437','#00a85a','#d97706','#dc2626','#2563eb','#7c3aed','#0891b2','#ea580c','#65a30d','#64748b'];

// ── CHART.JS DUAL-THEME (M03) ──
function getChartColors() {
  const dark = document.documentElement.classList.contains('dark');
  return dark
    ? ['#32d74b','#0a84ff','#ff9f0a','#ff453a','#bf5af2','#64d2ff','#ffd60a','#30d158','#5e5ce6','#ac8c00']
    : ['#006437','#2563eb','#d97706','#dc2626','#7c3aed','#0891b2','#ea580c','#65a30d','#4f46e5','#64748b'];
}

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
const fmt     = v => { if(v==null||isNaN(v)) return '—'; const cfg = typeof MONEY_CFG!=='undefined'?MONEY_CFG:{simbolo:'R$',locale:'pt-BR'}; return cfg.simbolo+' '+Number(v).toLocaleString(cfg.locale,{minimumFractionDigits:2,maximumFractionDigits:2}); };
const fmtN    = v => { if(v==null||isNaN(v)) return '—'; const loc = typeof MONEY_CFG!=='undefined'?MONEY_CFG.locale:'pt-BR'; return Number(v).toLocaleString(loc,{minimumFractionDigits:2,maximumFractionDigits:2}); };
const fmtDate = s => { if(!s)return'—'; const d=new Date(s+'T12:00'); return d.toLocaleDateString('pt-BR'); };
const today   = () => new Date().toISOString().split('T')[0];
const isOverdue = c => !!(c.data < today() && !(c.vPago > 0));
const vEfetivo  = c => c.vPago > 0 ? c.vPago : c.vPagar;

// ── DEFAULTS E SEEDS ──
const DEFAULT_TABELAS = {
  ir:[{de:0,ate:2259.20,al:0,ded:0},{de:2259.21,ate:2826.65,al:.075,ded:169.44},{de:2826.66,ate:3751.06,al:.15,ded:381.44},{de:3751.07,ate:4664.68,al:.225,ded:662.77},{de:4664.69,ate:null,al:.275,ded:896.00}],
  inss:[{de:0,ate:1518,al:.075,ded:0},{de:1518.01,ate:2793.88,al:.09,ded:22.77},{de:2793.89,ate:4190.83,al:.12,ded:106.59},{de:4190.84,ate:8157.41,al:.14,ded:190.40}],
  dedDep:189.59,tetoINSS:908.86,vigencia:'2024/2025'
};
const SEED_CATS = ['Alimentação','Aposta','Barbearia','Calçado','Carro','Casa','Combustível','Contrato','Cursos','Custo com trabalho','Empréstimo','Escola','Estudos','Faculdade','Farmácia','Games','Igreja','Internet','Lanche','Negociação','Outros','Pet','Pós-Graduação','Presente','Restaurante','Roupa','Salão','Saúde','Streamer','Telefone'];
const SEED_FORMAS = ['Automático','Boleto','Cartão Banescard Chica','Cartão flash','Cartão iFood','Cartão Itaú black','Cartão Itaú signature','Cartão Nubank','Débito','Dinheiro','PIX','Transferência'];

// ── ESTADO GLOBAL ──
const STATE = {
  page:'dashboard', pg:1, pgSz:20,
  dashResp:'', editContaId:null, editSalPessoa:null,
  charts:{}, recEditando:false, parcGrupo:null, gerenciarTipo:'cat',
  periodo:null, periodoDash:null, periodoContas:null, periodoTela:null,
  usuario:'', filtroAno:String(new Date().getFullYear()), filtroMes:String(new Date().getMonth()),
  sortContas:{col:null, dir:1},
  sortRel:   {col:null, dir:1},
  darkMode:  localStorage.getItem('dt_dark')==='1',
  hideValues: false,
};

// ── ALIASES TEMPORÁRIOS (compatibilidade com onclick no HTML) ──
window.fmt      = fmt;
window.fmtN     = fmtN;
window.fmtDate  = fmtDate;
window.today    = today;
window.isOverdue = isOverdue;
window.vEfetivo = vEfetivo;
