// ============================================================
// DUETTO FINANCEIRO — Firebase Integration
// ============================================================
"use strict";

// ── CORE: fin-state.js, fin-cache.js, fin-db.js ──
// Helpers, constantes, STATE, CACHE, FS, setupListeners e seedIfEmpty
// foram extraídos para módulos carregados ANTES deste arquivo.

/**
 * Alterna a visibilidade entre as telas principais.
 * M11: quando a transição é screenLoading -> screenApp, aplica fade-out
 *      suave no loading antes de remover do layout, evitando "salto" visual.
 */
function show(screenId){
  const screens = ['screenLoading','screenLogin','screenDenied','screenApp'];
  const loadingEl = document.getElementById('screenLoading');
  const isLoadingActive = loadingEl && loadingEl.style.display !== 'none' && loadingEl.style.display !== '';
  if (isLoadingActive && screenId !== 'screenLoading' && loadingEl) {
    loadingEl.classList.add('fade-out');
    setTimeout(() => {
      loadingEl.classList.remove('fade-out');
      screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === screenId ? 'flex' : 'none');
      });
    }, 400);
    return;
  }
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = (id === screenId ? 'flex' : 'none');
  });
}

// ============================================================
// APP — inicializa após cache pronto
// ============================================================
const APP = {
  _ready: false,

  onCacheReady(){
    if(this._ready)return;
    this._ready=true;
    CACHE._ready.add('_appShown');
    show('screenApp');
    this.boot().catch(err => {
      console.error('[APP.boot] Falha no boot:', err);
      if(this.toast) this.toast('Erro ao iniciar: ' + err.message, 'error');
    });
  },

  async boot(){
    const isShellMode = !!document.getElementById('appMain');
    if(isShellMode && window.ROUTER && typeof ROUTER.injectModals === 'function'){
      await ROUTER.injectModals();
    }
    this.nav(); this.topBtns(); this.modals(); this.selects(); this.filtros();
    localStorage.removeItem('dt_sb_collapsed');   // legado: o trilho tem largura fixa
    // Avatar do usuário logado no trilho (inicial + cor de identidade via data-user)
    const chip=document.getElementById('sbUserChip');
    if(chip){
      chip.textContent=(STATE.usuario||'?').charAt(0).toUpperCase();
      chip.dataset.user=STATE.usuario;
      chip.title=STATE.usuario;
      chip.setAttribute('aria-label','Conectado como '+STATE.usuario);
    }
    if(STATE.usuario==='Leo'){
      const navCfg=document.getElementById('navConfig');
      if(navCfg) navCfg.style.display='flex';
      const navUp=document.getElementById('navUpload');
      if(navUp) navUp.style.display='flex';
      const divAdmin=document.getElementById('railDivAdmin');
      if(divAdmin) divAdmin.style.display='block';
      // Espelha visibilidade nos itens da bottom nav mobile
      const navCfgMob=document.getElementById('navConfigMob');
      if(navCfgMob) navCfgMob.style.display='flex';
      const navUpMob=document.getElementById('navUploadMob');
      if(navUpMob) navUpMob.style.display='flex';
    }
    this.initTopbarScroll();
    this.initMobileNavScroll();
    if(isShellMode && window.ROUTER){
      await ROUTER.navigate('dashboard');
    } else {
      this.renderPage('dashboard');
    }
  },

  toggleFiltros(){
    const fg=document.getElementById('filterGroupContas');
    const icon=document.getElementById('iconFiltros');
    if(!fg) return;
    const open=fg.classList.toggle('mob-filters-open');
    if(icon) icon.innerHTML=open
      ?'<polyline points="18 15 12 9 6 15"/>'
      :'<polyline points="6 9 12 15 18 9"/>';
  },

  toggleFiltrosReceitas(){
    const fg=document.getElementById('filterGroupReceitas');
    const icon=document.getElementById('iconFiltrosReceitas');
    if(!fg) return;
    const open=fg.classList.toggle('mob-filters-open');
    if(icon) icon.innerHTML=open
      ?'<polyline points="18 15 12 9 6 15"/>'
      :'<polyline points="6 9 12 15 18 9"/>';
  },

  toggleDashFiltros(){
    const body=document.getElementById('dashFiltersBody');
    const icon=document.getElementById('iconDashFiltros');
    if(!body) return;
    const open=body.classList.toggle('dash-filters-open');
    if(icon) icon.innerHTML=open
      ?'<polyline points="18 15 12 9 6 15"/>'
      :'<polyline points="6 9 12 15 18 9"/>';
  },

  toggleRelFiltros(){
    const body=document.getElementById('relFiltersBody');
    const icon=document.getElementById('iconRelFiltros');
    if(!body) return;
    const open=body.classList.toggle('rel-filters-open');
    if(icon) icon.innerHTML=open
      ?'<polyline points="18 15 12 9 6 15"/>'
      :'<polyline points="6 9 12 15 18 9"/>';
  },

  // ── NAV ──
  nav(){
    const isShellMode = !!document.getElementById('appMain') && !!window.ROUTER;
    document.querySelectorAll('.nav-item').forEach(el=>{
      el.addEventListener('click',e=>{
        e.preventDefault();
        const page = el.dataset.page;
        document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
        el.classList.add('active');
        // data-title: título completo (o rótulo do trilho é curto, ex.: "Config")
        document.getElementById('pageTitle').textContent=el.dataset.title||(el.querySelector('span')||el).textContent.trim();
        this.updateTopbarBtns(page);
        if(isShellMode){ ROUTER.navigate(page); } else { this.renderPage(page); }
      });
    });
  },

  goPage(p){ const el=document.querySelector(`.nav-item[data-page="${p}"]`); if(el) el.click(); },

  // Visibilidade dos botões contextuais da topbar por página.
  // Centralizado para rodar tanto no clique da nav quanto no renderPage
  // (load inicial e re-render), evitando botão na tela errada.
  updateTopbarBtns(page){
    ['btnNovaConta','btnGerenciarSalarios','btnNovaReceita','btnCSVContas','btnGerarRec'].forEach(id=>{
      const btn=document.getElementById(id); if(btn) btn.style.display='none';
    });
    const show=id=>{ const b=document.getElementById(id); if(b) b.style.display='flex'; };
    if(page==='contas'){ show('btnNovaConta'); show('btnGerarRec'); show('btnCSVContas'); }
    if(page==='receitas'){ show('btnNovaReceita'); show('btnGerenciarSalarios'); }

    // Filtro global de responsável: desativado nas telas que não o usam (Notas, Upload, Backup)
    const usaResp = ['dashboard','contas','receitas','relatorio','config'].includes(page);
    const grupo = document.getElementById('respGlobal');
    const sel   = document.getElementById('respGlobalSelect');
    const dica  = usaResp ? 'Filtrar por responsável' : 'O filtro de responsável não se aplica a esta tela';
    if(grupo){
      grupo.setAttribute('aria-disabled', String(!usaResp));
      grupo.title = dica;
      grupo.querySelectorAll('button').forEach(b=>{ b.disabled = !usaResp; });
    }
    if(sel){ sel.disabled = !usaResp; sel.title = dica; }
  },

  /**
   * Período exibido na tela atual, mostrado ao lado do título no topbar.
   * Lê os filtros da própria tela (cada tela tem o seu); período personalizado
   * tem prioridade sobre ano/mês. Receitas não têm ano (valores mensais valem
   * para qualquer ano). Telas sem período escondem o selo.
   * Chamado por renderPage e no fim de cada render com filtro de período.
   */
  atualizarContextoTopbar(){
    const el = document.getElementById('topbarPeriodo');
    if(!el) return;
    const val = id => document.getElementById(id)?.value;
    const rotulo = (p, ano, mes) => {
      if(p) return p.mesIni===p.mesFim
        ? `${MESES[p.mesIni]} ${p.ano}`
        : `${MESES[p.mesIni]} → ${MESES[p.mesFim]} ${p.ano}`;
      if(ano==null || mes==null) return '';
      const todosA = ano==='todos', todosM = mes==='todos';
      if(todosA && todosM) return 'Todo o histórico';
      if(todosA) return `${MESES[+mes]} · todos os anos`;
      if(todosM) return `${ano} inteiro`;
      return `${MESES[+mes]} ${ano}`;
    };
    let txt = '';
    switch(STATE.page){
      case 'dashboard': txt = rotulo(STATE.periodoDash, val('filtroAnoDash'), val('filtroMesDash')); break;
      case 'contas':    txt = rotulo(STATE.periodoContas, val('filtroAnoContas'), val('filtroMesContas')); break;
      case 'relatorio': txt = rotulo(STATE.periodo, val('relAno'), val('relMes')); break;
      case 'receitas': {
        const m = val('filtroMesReceitas');
        txt = m==null ? '' : (m==='todos' ? 'Jan → Dez' : MESES_F[+m]);
        break;
      }
    }
    el.textContent = txt;
    el.hidden = !txt;
  },

  topBtns(){
    const safeBind = (id, handler) => { const el=document.getElementById(id); if(el) el.addEventListener('click', handler); };
    safeBind('btnNovaConta',()=>this.openConta());
    safeBind('btnNovaReceita',()=>this.openReceita());
    safeBind('btnGerenciarSalarios',()=>this.openSalariosModal());
    safeBind('btnCSVContas',()=>this.exportCSVContas());
  },

  modals(){
    const safeBind = (id, event, handler) => {
      const el = document.getElementById(id);
      if(el) el.addEventListener(event, handler);
    };
    document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>APP.closeModal(b.dataset.close)));
    document.querySelectorAll('.modal-overlay').forEach(ov=>ov.addEventListener('click',e=>{if(e.target===ov)APP.closeModal(ov.id);}));
    safeBind('btnLimparConta', 'click', ()=>this.clearConta());
    safeBind('btnSalvarConta', 'click', ()=>this.saveConta());
    safeBind('fVP',            'input', ()=>this.calcTotal());
    safeBind('fQP',            'input', ()=>this.calcTotal());
    safeBind('btnSalvarSal',   'click', ()=>this.saveSalario());
    ['sSal','sBon','sDeps'].forEach(id => safeBind(id, 'input', ()=>this.calcSalario()));
    safeBind('btnSalvarReceita', 'click', ()=>this.saveReceita());
    safeBind('btnBuscarOnline',  'click', ()=>this.buscarTabelasOnline());
    safeBind('btnEditarManual',  'click', ()=>{
      const ed = document.getElementById('tabelasEditor');
      const bs = document.getElementById('btnSalvarTabelas');
      if(ed) ed.style.display='block';
      if(bs) bs.style.display='flex';
    });
    safeBind('btnSalvarTabelas', 'click', ()=>this.salvarTabelas());
    const ms = document.getElementById('sMesInicio');
    if(ms){
      if(ms.options.length === 0){ MESES_F.forEach((m,i) => ms.appendChild(new Option(m,i))); }
      ms.value = new Date().getMonth();
    }
  },

  selects(){
    const anoAtual = new Date().getFullYear();
    const mesAtual = new Date().getMonth();

    const mkAno = (id) => {
      const s=document.getElementById(id); if(!s)return;
      if(s.options.length > 0) return;
      s.appendChild(new Option('Todos os anos','todos'));
      for(let a=2019;a<=2035;a++) s.appendChild(new Option(a,a));
      s.value = String(anoAtual);
    };

    const mkMes = (id) => {
      const s=document.getElementById(id); if(!s)return;
      if(s.options.length > 0) return;
      s.appendChild(new Option('Todos os meses','todos'));
      MESES_F.forEach((m,i) => s.appendChild(new Option(m,i)));
      s.value = String(mesAtual);
    };

    const mkCatForma = (ids, items, valFn, labelFn) => {
      ids.forEach(id => {
        const s = document.getElementById(id); if(!s) return;
        if(s.options.length > 1) return;
        items.forEach(item => s.appendChild(new Option(labelFn(item), valFn(item))));
      });
    };
    mkCatForma(['filtroCatContas','relCat'], CACHE.getAllCats(), c=>c.nome, c=>c.nome);
    mkCatForma(['filtroFormaContas','relForma'], CACHE.getAllFormas(), f=>f.id, f=>f.nome);

    mkAno('filtroAnoDash');
    mkMes('filtroMesDash');
    mkAno('filtroAnoContas');
    mkMes('filtroMesContas');
    mkMes('filtroMesReceitas');
    mkAno('relAno');
    mkMes('relMes');
  },

  filtros(){
    const self = this;
    ['filtroAnoDash','filtroMesDash'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.onchange = ()=>{ STATE.periodoDash=null; self._atualizarPeriodoBadge('dashboard',null); self.renderDashboard(); };
    });
    ['searchContas','filtroAnoContas','filtroMesContas','filtroCatContas','filtroFormaContas','filtroStatus','filtroRecorrente'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.oninput = ()=>{
        if(id==='filtroAnoContas'||id==='filtroMesContas'){ STATE.periodoContas=null; self._atualizarPeriodoBadge('contas',null); }
        self._ordenarContasPorVencimento();
        STATE.pg=1; self.renderContas();
      };
    });
    ['searchReceitas','filtroMesReceitas','filtroTipoReceitas'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.oninput = ()=>{ STATE.pgReceitas=1; self.renderReceitas(); };
    });
    ['relAno','relMes'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.onchange = ()=>{ STATE.periodo=null; self._atualizarPeriodoBadge('relatorio',null); self.renderRelatorio(); };
    });
    ['relCat','relForma','relStatus'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.onchange = ()=> self.renderRelatorio();
    });
    // Busca do relatório: debounce para não re-renderizar tabela + Pareto a cada tecla
    const relBusca = document.getElementById('relBusca');
    if(relBusca){
      relBusca.oninput = ()=>{
        clearTimeout(self._relBuscaTimer);
        self._relBuscaTimer = setTimeout(()=> self.renderRelatorio(), 200);
      };
      relBusca.onkeydown = e=>{ if(e.key==='Escape' && relBusca.value){ relBusca.value=''; self.renderRelatorio(); } };
    }
    const relBuscaLimpar = document.getElementById('relBuscaLimpar');
    if(relBuscaLimpar) relBuscaLimpar.onclick = ()=>{
      if(relBusca){ relBusca.value=''; relBusca.focus(); }
      clearTimeout(self._relBuscaTimer);
      self.renderRelatorio();
    };
    const btnCSV = document.getElementById('btnCSV');
    if(btnCSV) btnCSV.onclick = ()=> self.exportCSV();
  },

  renderPage(p){
    if((p==='backup'||p==='config'||p==='upload') && STATE.usuario!=='Leo'){ this.toast('Acesso restrito','error'); return; }
    STATE.page=p;
    this.updateTopbarBtns(p);
    document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
    const el=document.getElementById(`page-${p}`);
    if(el)el.classList.add('active');

    if(typeof this.selects === 'function') this.selects();
    if(typeof this.filtros === 'function') this.filtros();

    try {
      ({
        dashboard: ()=>this.renderDashboard(),
        contas:    ()=>{
          const fs = document.getElementById('filtroStatus');
          if(fs && fs.value === '') fs.value = 'pendente';
          this._ordenarContasPorVencimento();
          this.renderContas();
        },
        receitas:  ()=>this.renderReceitas(),
        relatorio: ()=>this.renderRelatorio(),
        upload:    ()=>this.upRenderHistorico(),
        backup:    ()=>this.renderBackup(),
        config:    ()=>this.renderConfig(),
      })[p]?.();
    } catch(err) {
      console.error('[renderPage] Erro ao renderizar ' + p + ':', err);
    }
    this.atualizarContextoTopbar();
  },

  _aplicarTemaResp(resp){
    const root = document.documentElement;
    root.classList.remove('theme-pri','theme-leo');
    if(resp==='Pri') root.classList.add('theme-pri');
    else if(resp==='Leo') root.classList.add('theme-leo');
  },

  /**
   * Filtro global de responsável (topbar). Atualiza o estado, os controles e o tema,
   * e redesenha a tela atual se ela usar o filtro. Modais não são afetados.
   * @param {string} r '', 'Leo', 'Pri' ou 'Leo & Pri'
   */
  setResp(r){
    STATE.resp = r || '';
    this._sincronizarRespGlobal();
    this._aplicarTemaResp(STATE.resp);
    const rerender = {
      dashboard: ()=>this.renderDashboard(),
      contas:    ()=>{ STATE.pg=1; this.renderContas(); this.atualizarBarraPagamento?.(); },
      receitas:  ()=>{ STATE.pgReceitas=1; this.renderReceitas(); },
      relatorio: ()=>this.renderRelatorio(),
      config:    ()=>{
        // Logs só recarregam se a aba estiver visível (cada carga lê o Firestore)
        if(document.getElementById('cfgLogBody')?.offsetParent) this.cfgCarregarLog();
        if(document.getElementById('cfgLogAcessoBody')?.offsetParent) this.cfgCarregarLogAcesso();
      },
    }[STATE.page];
    if(rerender){
      try { rerender(); } catch(err){ console.error('[setResp] Erro ao redesenhar '+STATE.page+':', err); }
    }
  },

  // Reflete STATE.resp nos avatares e no select do topbar
  _sincronizarRespGlobal(){
    document.querySelectorAll('#respGlobal [data-resp]').forEach(b=>{
      const on = b.dataset.resp === STATE.resp;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const sel = document.getElementById('respGlobalSelect');
    if(sel) sel.value = STATE.resp;
  },

  filtrarAtrasadas(){
    const fs = document.getElementById('filtroStatus');
    const fm = document.getElementById('filtroMesContas');
    const fa = document.getElementById('filtroAnoContas');
    if(fs) fs.value='atrasado';
    if(fm) fm.value='todos';
    if(fa) fa.value='todos';
    this.goPage('contas');STATE.pg=1;this.renderContas();
  },

};

// ── Módulos Lote 2 extraídos para /js: dashboard, contas, receitas, salarios, relatorios, gerenciar ──
// ── Módulos Lote 1 (UI): ui-toast, ui-modals, ui-tables, ui-charts, ui-period ──
// ── Módulos Lote 3 (Features): upload, backup, configuracoes, lixeira, recorrentes, pagamento-massa, pareto, acoes-extra ──
