/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO fin-state.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade: constantes globais, helpers de formatação, estado da
 * aplicação e valores default. PRIMEIRO módulo a carregar após firebase-config.
 *
 * EXPORTS GLOBAIS (escopo léxico, com aliases window.*):
 *   MESES, MESES_F, COLORS, fmt, fmtN, fmtDate, today, isOverdue, vEfetivo, vPendente,
 *   centavos, fatiaReceita, filtrarPorResp, getChartDefaults, DEFAULT_TABELAS, SEED_CATS,
 *   SEED_FORMAS, STATE, FEATURES, anoValido, anosJanela, preencherAnos, PARCELAS_MAX,
 *   PARCELAS_ALERTA, lerParcela, planoParcelas, dataPagamentoPadrao
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

// ── CONSTANTES ──
const MESES   = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_F = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const COLORS  = ['#006437','#00a85a','#d97706','#dc2626','#2563eb','#7c3aed','#0891b2','#ea580c','#65a30d','#64748b'];

// ── RECURSOS DESLIGÁVEIS ──
// recorrentes: "Conta recorrente" no cadastro e "Gerar recorrentes" (js/recorrentes.js).
// DESLIGADO por decisão do usuário: sai das telas, mas o código e o campo `recorrente`
// das contas ficam intactos. Para religar, troque para true (README, seção 8.7).
const FEATURES = Object.freeze({ recorrentes: false });
// Marcação estática com data-feature="recorrentes" fica oculta (CSS) enquanto a classe não existir
document.documentElement.classList.toggle('ft-recorrentes', FEATURES.recorrentes);

// ── ANOS ──
// Sem limite de anos: cadastro, importação, período e receitas aceitam qualquer ano de 4 dígitos
// (formato YYYY-MM-DD das datas). Os seletores de ano mostram uma janela móvel de 9 anos: os 4
// anteriores, o vigente no meio e os 4 seguintes. "Todos os anos" ('todos') não usa a janela:
// cobre todos os dados gravados, de qualquer ano.
const ANOS_JANELA = 4;
const anoValido = a => Number.isInteger(a) && a >= 1000 && a <= 9999;
// anosJanela() → [2022 … 2030] em 2026. Anos extras válidos (ex.: o da receita em edição) entram em ordem.
const anosJanela = (...extras) => {
  const atual = new Date().getFullYear();
  const anos = new Set(Array.from({length: 2*ANOS_JANELA + 1}, (_, i) => atual - ANOS_JANELA + i));
  extras.map(Number).filter(anoValido).forEach(a => anos.add(a));
  return [...anos].sort((a, b) => a - b);
};
// Preenche um <select> de ano com a janela ("Todos os anos" no topo se todos=true) e seleciona
// `valor`, que entra na lista mesmo fora da janela.
const preencherAnos = (sel, {todos = false, valor = new Date().getFullYear()} = {}) => {
  if(!sel) return sel;
  sel.innerHTML = (todos ? '<option value="todos">Todos os anos</option>' : '')
    + anosJanela(valor).map(a => `<option value="${a}">${a}</option>`).join('');
  sel.value = String(valor);
  return sel;
};

// ── PARCELAMENTO ──
const PARCELAS_MAX    = 360;  // limite do cadastro manual
const PARCELAS_ALERTA = 12;   // acima disso, o cadastro pede confirmação antes de gravar

// ── CHART.JS DUAL-THEME (M03) ──
// A paleta categórica fica em css/theme.css (--cat-1..6, --cat-rest); ver APP.chartCategoria.
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
// Data local YYYY-MM-DD. toISOString() usa UTC: no Brasil (UTC-3), após as 21h
// devolveria o dia seguinte e marcaria como atrasadas as contas que vencem hoje.
const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today   = () => isoLocal(new Date());
/**
 * Soma n meses a uma data ISO preservando o dia, limitado ao último dia do mês.
 * Evita o overflow de Date#setMonth (31/01 + 1 mês virava 03/03, pulando fevereiro).
 * @param {string} iso YYYY-MM-DD
 * @param {number} n meses a somar
 * @returns {string} YYYY-MM-DD
 */
const addMeses = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const alvo   = new Date(y, m - 1 + n, 1, 12);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimo));
  return isoLocal(alvo);
};
/**
 * Conta "Leo & Pri" (não dividida ÷2) com pagamento individual de ao menos
 * uma das partes. Nesse caso vPago guarda só a soma parcial, então vPago>0
 * NÃO significa quitada.
 */
const temPgIndividual = c => c.resp === 'Leo & Pri' && !c._split && !!(c.pagamentos?.Leo || c.pagamentos?.Pri);

/**
 * Fonte única da regra "conta quitada":
 *   • compartilhada com pagamento individual: só quando Leo E Pri pagaram;
 *   • demais casos (inclui a metade ÷2 de um responsável): vPago > 0.
 */
const isQuitada = c => temPgIndividual(c) ? (!!c.pagamentos.Leo && !!c.pagamentos.Pri) : c.vPago > 0;

// Atrasada = vencida e não quitada. Compartilhada com só uma parte paga continua atrasada.
const isOverdue = c => !!(c.data < today() && !isQuitada(c));
// Valor que a conta pesa nas despesas. Compartilhada com só uma parte paga: vPago guarda
// apenas a parcial, então vale o valor cheio (vPagar) até as duas partes pagarem.
const vEfetivo  = c => (c.vPago > 0 && !(temPgIndividual(c) && !isQuitada(c))) ? c.vPago : c.vPagar;
const vPendente = c => {
  if(isQuitada(c)) return 0;
  if(temPgIndividual(c)){
    const parcial = (c.pagamentos.Leo?.valor||0) + (c.pagamentos.Pri?.valor||0);
    return Math.max(0, (c.vPagar||0) - parcial);
  }
  return c.vPagar||0;
};
/**
 * Fração de uma "outra receita" que pertence ao filtro de responsável.
 * Mesma regra das contas compartilhadas (÷2): receita "Ambos" (resp vazio) vale metade
 * para Leo e metade para Pri, então Leo + Pri soma exatamente o total da casa.
 * @param {Object} r    receita (CACHE.outras)
 * @param {string} resp 'Leo', 'Pri', 'Leo & Pri' ou '' (todos)
 * @returns {number} 1, 0.5 ou 0
 */
const fatiaReceita = (r, resp) => {
  if(!resp || r.resp === resp) return 1;
  const compartilhada = !r.resp || r.resp === 'Ambos';
  if(!compartilhada) return 0;
  return resp === 'Leo & Pri' ? 1 : 0.5;
};
// "5 de 12" ou "5/12" → {atual:5, total:12}; texto fora do padrão → null
const lerParcela = p => {
  const m = String(p||'').match(/(\d+)\s*(?:de|\/)\s*(\d+)/i);
  return m ? {atual:parseInt(m[1],10), total:parseInt(m[2],10)} : null;
};

// Parcelas a cadastrar: da atual até a última, mês a mês a partir do vencimento da parcela
// atual (mesma regra da importação). planoParcelas('2027-01-29',12,5) → 8 itens, "5 de 12" … "12 de 12"
const planoParcelas = (vencAtual, total, atual) =>
  Array.from({length: total - atual + 1}, (_, i) => ({data: addMeses(vencAtual, i), parcela: `${atual + i} de ${total}`}));

// Data do pagamento (paidAt) quando o campo fica em branco. Só existe padrão se o pagamento é
// informado no MESMO mês e ano do vencimento: vale o vencimento, ou hoje se o vencimento ainda
// não chegou (pagamento não tem data futura). Em outro mês ou ano → null: a data é obrigatória.
// dataPagamentoPadrao('2026-04-10','2026-04-20') → '2026-04-10' | ('2026-04-25','2026-04-20') → '2026-04-20'
// dataPagamentoPadrao('2026-03-10','2026-04-20') → null
const dataPagamentoPadrao = (venc, hoje = today()) =>
  venc && String(venc).slice(0,7) === hoje.slice(0,7) ? (venc <= hoje ? venc : hoje) : null;

// Valor em reais (float) → centavos inteiros. Some em centavos e divida por 100 só na exibição,
// para não acumular erro de ponto flutuante (0.1 + 0.2 !== 0.3).
const centavos = v => Math.round((Number(v)||0) * 100);

/**
 * DUP-004: helper centralizado para filtrar contas por responsável
 * com split ÷2 para despesas compartilhadas ("Leo & Pri").
 * @param {Array} data - array de contas
 * @param {string} resp - 'Leo', 'Pri', 'Leo & Pri' ou '' (todos)
 * @returns {Array} contas filtradas (com _split:true nas divididas)
 */
const filtrarPorResp = (data, resp) => {
  if(!resp) return data;
  if(resp === 'Leo & Pri') return data.filter(c => c.resp === 'Leo & Pri');
  return data
    .filter(c => c.resp === resp || c.resp === 'Leo & Pri')
    .map(c => {
      if(c.resp !== 'Leo & Pri') return c;
      const metade = (c.vPagar||0) / 2;
      const pgInd = c.pagamentos?.[resp];
      if(pgInd) return {...c, vPagar: metade, vPago: pgInd.valor, _split: true};
      const outra = resp === 'Leo' ? 'Pri' : 'Leo';
      const pgOutra = c.pagamentos?.[outra];
      if(pgOutra) return {...c, vPagar: metade, vPago: null, _split: true};
      return {...c, vPagar: metade, vPago: c.vPago > 0 ? c.vPago/2 : null, _split: true};
    });
};

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
  // Filtro global de responsável (topbar): '', 'Leo', 'Pri' ou 'Leo & Pri'. Vale para
  // Dashboard, Contas, Receitas, Relatório e logs da Config; não se aplica a Notas nem a modais.
  resp:'', editContaId:null, editSalPessoa:null,
  charts:{}, recEditando:false, parcGrupo:null, gerenciarTipo:'cat',
  periodo:null, periodoDash:null, periodoContas:null, periodoReceitas:null, periodoTela:null,
  usuario:'', filtroAno:String(new Date().getFullYear()), filtroMes:String(new Date().getMonth()),
  sortContas:  {col:'data', dir:1},
  sortReceitas:{col:null, dir:1},
  sortRel:     {col:null, dir:1},
  pgReceitas:1, editReceitaId:null,
  darkMode:  localStorage.getItem('dt_dark')==='1',
  hideValues: false,
};

// ── ALIASES TEMPORÁRIOS (compatibilidade com onclick no HTML) ──
window.fmt      = fmt;
window.fmtN     = fmtN;
window.fmtDate  = fmtDate;
window.today    = today;
window.isoLocal = isoLocal;
window.addMeses = addMeses;
window.isOverdue = isOverdue;
window.isQuitada = isQuitada;
window.vEfetivo  = vEfetivo;
window.vPendente = vPendente;
window.centavos  = centavos;
window.FEATURES  = FEATURES;
window.anoValido     = anoValido;
window.anosJanela    = anosJanela;
window.preencherAnos = preencherAnos;
window.lerParcela    = lerParcela;
window.planoParcelas = planoParcelas;
window.dataPagamentoPadrao = dataPagamentoPadrao;
window.fatiaReceita = fatiaReceita;
window.filtrarPorResp = filtrarPorResp;
