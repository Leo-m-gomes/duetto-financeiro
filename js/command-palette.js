/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO command-palette.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade: busca rápida e ações do topbar (Ctrl K / ⌘K / "/").
 *
 *   • Contas: busca em TODO o histórico, com a mesma regra de texto do
 *     Relatório (APP._textoBuscaConta: descrição, nota, responsável,
 *     categoria, forma, parcela, autores, data e valores; sem acento e sem
 *     diferença de maiúsculas; vários termos combinados com E).
 *     Ordem: em aberto antes de pagas; depois descrição que começa com o
 *     termo > contém o termo > outros campos; depois atrasadas antes de
 *     pendentes; depois vencimento mais próximo de hoje.
 *     Enter abre a conta; Shift+Enter abre o pagamento.
 *   • Outras receitas: Enter abre a edição.
 *   • Ações rápidas e navegação entre telas (telas de admin só para o admin).
 *
 * SOMENTE LEITURA: este módulo não grava nada. Toda ação delega para APP.*,
 * que já aplica validações, permissões e logs.
 *
 * DEPENDÊNCIAS (carregar por último):
 *   fin-state.js: STATE, fmt, fmtDate, today, isQuitada, isOverdue, vPendente, vEfetivo
 *   fin-cache.js: CACHE · router.js: ROUTER · security.js: SEC
 *   app.js e módulos APP (contas, receitas, salarios, recorrentes,
 *   relatorios [_textoBuscaConta, _normBusca, _escHtml], ui-period, ui-toast)
 *
 * EXPORTS GLOBAIS: window.CMD { open, close, toggle }
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

const CMD = (() => {
  const MAX_CONTAS   = 7;
  const MAX_RECEITAS = 3;

  let ov = null, input = null, list = null;
  let aberto = false, itens = [], sel = 0, indice = null, focoAnterior = null;

  // ── ÍCONES (mesmo traço dos ícones do app) ──
  const ICON = {
    busca:   '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    conta:   '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    receita: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    mais:    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    repetir: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
    baixar:  '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    pessoas: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
    alerta:  '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    lua:     '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
    olho:    '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    dash:    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    notas:   '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>',
    rel:     '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    upload:  '<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>',
    config:  '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>',
  };
  const svg  = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  const esc  = v => APP._escHtml(v);
  const norm = v => APP._normBusca(v);
  const termosDe = q => norm(q).split(/\s+/).filter(Boolean);
  const casa = (texto, termos) => { const t = norm(texto); return termos.every(x => t.includes(x)); };

  const isAdmin = () => (typeof SEC !== 'undefined' && SEC.isAdmin && SEC.isAdmin()) || STATE.usuario === 'Leo';

  // Mesmos títulos do ROUTER
  const TELAS = [
    {page:'dashboard', titulo:'Dashboard',     ic:'dash'},
    {page:'contas',    titulo:'Contas',        ic:'conta'},
    {page:'receitas',  titulo:'Receitas',      ic:'receita'},
    {page:'relatorio', titulo:'Relatório',     ic:'rel'},
    {page:'notas',     titulo:'Notas e Ações', ic:'notas'},
    {page:'upload',    titulo:'Upload Cards',  ic:'upload', admin:true},
    {page:'config',    titulo:'Configurações', ic:'config', admin:true},
  ];

  function acoes(){
    return [
      {titulo:'Nova conta', sub:'Despesa à vista ou parcelada', ic:'mais', run:()=>APP.openConta()},
      {titulo:'Nova receita', sub:'Outra receita mensal: aluguel, freelance, reembolso', ic:'mais', run:()=>APP.openReceita()},
      {titulo:'Ver contas em atraso', sub:'Abre Contas com todas as atrasadas, de qualquer mês', ic:'alerta', run:()=>APP.filtrarAtrasadas()},
      {titulo:'Gerar contas recorrentes', sub:'Copia as recorrentes de um ano para outro', ic:'repetir', run:()=>APP.openRecorrentes()},
      {titulo:'Gerenciar salários', sub:'Bruto, INSS, IR e líquido por pessoa', ic:'pessoas', run:()=>APP.openSalariosModal()},
      // exportCSVContas lê os filtros da tela de Contas: só existe lá
      STATE.page === 'contas' && {titulo:'Exportar contas em CSV', sub:'Ano e mês filtrados nesta tela', ic:'baixar', run:()=>APP.exportCSVContas()},
      {titulo:STATE.darkMode ? 'Usar modo claro' : 'Usar modo escuro', ic:'lua', run:()=>APP.toggleDark()},
      {titulo:STATE.hideValues ? 'Mostrar valores' : 'Ocultar valores', sub:'Modo privacidade', ic:'olho', run:()=>APP.togglePrivacy()},
    ].filter(Boolean);
  }

  /**
   * Abre Contas com filtros prontos: todo o histórico, status e busca opcionais.
   * Espera a view carregar antes de preencher os campos (eles vivem na view).
   */
  async function irParaContas({status = '', busca = ''} = {}){
    if(STATE.page !== 'contas'){
      if(!window.ROUTER) return;
      await ROUTER.navigate('contas');
    }
    const set = (id, v) => { const el = document.getElementById(id); if(el) el.value = v; };
    set('searchContas', busca);
    set('filtroAnoContas', 'todos');
    set('filtroMesContas', 'todos');
    set('filtroStatus', status);
    STATE.periodoContas = null;
    APP._atualizarPeriodoBadge('contas', null);
    STATE.pg = 1;
    APP.renderContas();
  }

  // ── ÍNDICE (montado a cada abertura: reflete o CACHE do momento) ──
  function montarIndice(){
    const hoje = new Date(today() + 'T12:00').getTime();
    return CACHE.contas.map(c => {
      const t = new Date(c.data + 'T12:00').getTime();
      return {
        c,
        txt:   APP._textoBuscaConta(c),
        desc:  norm(c.conta),
        paga:  isQuitada(c) ? 1 : 0,
        atr:   !isQuitada(c) && isOverdue(c) ? 0 : 1,
        dist:  Number.isFinite(t) ? Math.abs(t - hoje) : Number.MAX_SAFE_INTEGER,
      };
    });
  }

  function buscarContas(q){
    const termos = termosDe(q);
    if(!termos.length) return [];
    const frase = termos.join(' ');
    return indice
      .filter(x => termos.every(t => x.txt.includes(t)))
      .map(x => ({...x, rel: x.desc.startsWith(frase) ? 0 : (x.desc.includes(frase) ? 1 : 2)}))
      .sort((a, b) => a.paga - b.paga || a.rel - b.rel || a.atr - b.atr || a.dist - b.dist);
  }

  function buscarReceitas(q){
    const termos = termosDe(q);
    if(!termos.length) return [];
    return CACHE.outras.filter(r => casa(`${r.desc} ${r.resp || 'Ambos'}`, termos)).slice(0, MAX_RECEITAS);
  }

  // ── ITENS ──
  function linha({ic, titulo, sub = '', meta = ''}){
    return `<span class="cmdk-ic">${svg(ic)}</span>`
      + `<span class="cmdk-main"><span class="cmdk-title">${titulo}</span>${sub ? `<span class="cmdk-sub">${sub}</span>` : ''}</span>`
      + (meta ? `<span class="cmdk-meta">${meta}</span>` : '');
  }

  function itemConta(c){
    const quitada = isQuitada(c);
    const atr     = !quitada && isOverdue(c);
    const tag = quitada ? '<span class="cmdk-tag pago">paga</span>'
              : atr     ? '<span class="cmdk-tag atr">em atraso</span>'
              :           '<span class="cmdk-tag pend">pendente</span>';
    // Pendente mostra o que falta pagar; paga mostra o valor pago
    const valor = quitada ? vEfetivo(c) : vPendente(c);
    const sub = [
      c.resp,
      CACHE.resolveCat(c.catId || c.cat),
      'vence ' + fmtDate(c.data),
      c.parcela && c.parcela !== '1 de 1' ? c.parcela : '',
    ].filter(Boolean).map(esc).join(' · ');
    const pagar = quitada ? '' : '<button type="button" class="cmdk-pay" data-pay tabindex="-1">Pagar</button>';
    return {
      html: linha({ic:'conta', titulo:esc(c.conta), sub, meta:`${tag}<span class="money">${fmt(valor)}</span>${pagar}`}),
      run:  () => APP.openConta(c.id),
      pay:  quitada ? null : () => APP.marcarPago(c.id),
    };
  }

  function itemReceita(r){
    const meses = (r.valores || []).map((v, i) => v ? i : -1).filter(i => i >= 0);
    const quando = meses.length === 12 ? 'todos os meses' : `${meses.length} ${meses.length === 1 ? 'mês' : 'meses'}`;
    const valor = meses.length ? r.valores[meses[0]] : 0;
    return {
      html: linha({ic:'receita', titulo:esc(r.desc), sub:esc(`${r.resp || 'Ambos'} · ${quando}`), meta:`<span class="money">${fmt(valor)}</span>`}),
      run:  () => APP.openReceita(r.id),
    };
  }

  const itemAcao = a => ({html: linha({ic:a.ic, titulo:esc(a.titulo), sub:esc(a.sub || '')}), run:a.run});
  const itemTela = t => ({
    html: linha({ic:t.ic, titulo:esc(t.titulo), sub: STATE.page === t.page ? 'Tela atual' : ''}),
    run:  () => APP.goPage(t.page),
  });

  // ── RENDER ──
  function render(){
    const q = input.value.trim();
    const termos = termosDe(q);
    const grupos = [];

    if(termos.length){
      const contas = buscarContas(q);
      if(contas.length){
        const mostradas = contas.slice(0, MAX_CONTAS).map(x => itemConta(x.c));
        mostradas.push({
          html: linha({ic:'busca', titulo:`Ver ${contas.length > MAX_CONTAS ? `os ${contas.length} resultados` : 'resultados'} em Contas`, sub:esc(`Busca “${q}” em todo o histórico`)}),
          run:  () => irParaContas({busca:q}),
        });
        grupos.push({nome:'Contas', itens:mostradas});
      }
      const receitas = buscarReceitas(q);
      if(receitas.length) grupos.push({nome:'Outras receitas', itens:receitas.map(itemReceita)});
    }

    const filtra = (titulo, sub) => !termos.length || casa(`${titulo} ${sub || ''}`, termos);
    const listaAcoes = acoes().filter(a => filtra(a.titulo, a.sub));
    if(listaAcoes.length) grupos.push({nome:'Ações rápidas', itens:listaAcoes.map(itemAcao)});

    const telas = TELAS
      .filter(t => !t.admin || isAdmin())
      .filter(t => termos.length ? filtra(t.titulo) : t.page !== STATE.page);
    if(telas.length) grupos.push({nome:'Ir para', itens:telas.map(itemTela)});

    itens = [];
    let html = '';
    grupos.forEach((g, gi) => {
      html += `<div role="group" aria-labelledby="cmdk-g-${gi}"><div class="cmdk-group" id="cmdk-g-${gi}">${esc(g.nome)}</div>`;
      g.itens.forEach(it => {
        const i = itens.push(it) - 1;
        html += `<div class="cmdk-item" role="option" id="cmdk-opt-${i}" data-i="${i}" aria-selected="false">${it.html}</div>`;
      });
      html += '</div>';
    });
    list.innerHTML = html || `<div class="cmdk-empty">Nada encontrado para “${esc(q)}”.</div>`;
    selecionar(Math.min(sel, Math.max(itens.length - 1, 0)));
  }

  function selecionar(i, rolar = true){
    const n = itens.length;
    if(!n){ sel = 0; input.removeAttribute('aria-activedescendant'); return; }
    sel = ((i % n) + n) % n;
    list.querySelectorAll('.cmdk-item').forEach(el => el.setAttribute('aria-selected', String(Number(el.dataset.i) === sel)));
    input.setAttribute('aria-activedescendant', 'cmdk-opt-' + sel);
    const atual = document.getElementById('cmdk-opt-' + sel);
    if(rolar && atual) atual.scrollIntoView({block:'nearest'});
  }

  function executar(i, pagar){
    const it = itens[i];
    if(!it) return;
    const fn = pagar && it.pay ? it.pay : it.run;
    close(false);   // a ação abre um modal ou troca de tela: o foco vai para lá
    const falhou = err => {
      console.error('[CMD] ação falhou:', err);
      if(APP.toast) APP.toast('Não foi possível concluir a ação', 'error');
    };
    try {
      const r = fn();
      if(r && typeof r.catch === 'function') r.catch(falhou);
    } catch(err){ falhou(err); }
  }

  function onKey(e){
    if(e.key === 'ArrowDown')      { e.preventDefault(); selecionar(sel + 1); }
    else if(e.key === 'ArrowUp')   { e.preventDefault(); selecionar(sel - 1); }
    else if(e.key === 'Tab')       { e.preventDefault(); selecionar(sel + (e.shiftKey ? -1 : 1)); }
    else if(e.key === 'Enter')     { e.preventDefault(); executar(sel, e.shiftKey); }
    else if(e.key === 'Escape')    { e.preventDefault(); e.stopPropagation(); close(); }
  }

  // ── MONTAGEM (sob demanda, uma vez) ──
  function montar(){
    if(ov) return;
    ov = document.createElement('div');
    ov.className = 'cmdk-overlay';
    ov.hidden = true;
    ov.innerHTML = `
      <div class="cmdk" role="dialog" aria-modal="true" aria-label="Busca rápida">
        <div class="cmdk-head">
          ${svg('busca')}
          <input class="cmdk-input" id="cmdkInput" type="search" role="combobox" aria-expanded="true"
                 aria-controls="cmdkList" aria-autocomplete="list" autocomplete="off" spellcheck="false"
                 enterkeyhint="go" placeholder="Buscar conta, receita ou ação…">
          <kbd>Esc</kbd>
        </div>
        <div class="cmdk-list" id="cmdkList" role="listbox" aria-label="Resultados"></div>
        <div class="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>Shift</kbd>+<kbd>Enter</kbd> pagar conta</span>
          <span><kbd>Esc</kbd> fechar</span>
        </div>
      </div>`;
    document.body.appendChild(ov);
    input = ov.querySelector('.cmdk-input');
    list  = ov.querySelector('.cmdk-list');

    ov.addEventListener('mousedown', e => { if(e.target === ov) close(); });
    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', onKey);
    list.addEventListener('mousemove', e => {
      const el = e.target.closest('.cmdk-item');
      if(el && Number(el.dataset.i) !== sel) selecionar(Number(el.dataset.i), false);
    });
    // mousedown evita que o input perca o foco antes do clique
    list.addEventListener('mousedown', e => e.preventDefault());
    list.addEventListener('click', e => {
      const el = e.target.closest('.cmdk-item');
      if(el) executar(Number(el.dataset.i), !!e.target.closest('[data-pay]'));
    });
  }

  /** Só abre com o app visível, já inicializado e sem modal aberto. */
  function podeAbrir(){
    const app = document.getElementById('screenApp');
    if(!app || app.style.display === 'none') return false;
    if(typeof APP === 'undefined' || !APP._ready) return false;
    if(document.querySelector('.modal-overlay.open, .nt-modal-overlay.open, .nt-submodal-overlay.open')) return false;
    return true;
  }

  function open(){
    if(aberto || !podeAbrir()) return;
    montar();
    focoAnterior = document.activeElement;
    indice = montarIndice();
    input.value = '';
    sel = 0;
    render();
    ov.hidden = false;
    aberto = true;
    document.getElementById('btnBusca')?.setAttribute('aria-expanded', 'true');
    input.focus();
  }

  function close(devolverFoco = true){
    if(!aberto) return;
    ov.hidden = true;
    aberto = false;
    indice = null;
    itens = [];
    document.getElementById('btnBusca')?.setAttribute('aria-expanded', 'false');
    if(devolverFoco && focoAnterior && typeof focoAnterior.focus === 'function') focoAnterior.focus();
    focoAnterior = null;
  }

  const toggle = () => (aberto ? close() : open());

  // ── ATALHOS GLOBAIS ──
  const digitando = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  document.addEventListener('keydown', e => {
    const k = (e.key || '').toLowerCase();
    if((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k === 'k'){
      if(!aberto && !podeAbrir()) return;   // fora do app (login) ou com modal aberto: não captura
      e.preventDefault();
      toggle();
      return;
    }
    if(k === '/' && !aberto && !e.ctrlKey && !e.metaKey && !e.altKey && !digitando(e.target) && podeAbrir()){
      e.preventDefault();
      open();
    }
  });

  // Rótulo do atalho conforme o sistema
  const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  const kbd = document.getElementById('cmdKbd');
  if(kbd) kbd.textContent = mac ? '⌘K' : 'Ctrl K';
  const btn = document.getElementById('btnBusca');
  if(btn){
    btn.title = `Buscar e ações rápidas (${mac ? '⌘K' : 'Ctrl K'})`;
    btn.setAttribute('aria-expanded', 'false');
  }

  return { open, close, toggle };
})();

window.CMD = CMD;
