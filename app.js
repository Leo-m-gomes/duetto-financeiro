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
    this.restoreSidebarState();
    const chip=document.getElementById('sbUserChip');
    if(chip) chip.textContent='👤 '+STATE.usuario;
    if(STATE.usuario==='Leo'){
      const navCfg=document.getElementById('navConfig');
      if(navCfg) navCfg.style.display='flex';
      const navUp=document.getElementById('navUpload');
      if(navUp) navUp.style.display='flex';
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

  // ── SIDEBAR ──
  toggleSidebar(){
    const isMobile = window.innerWidth <= 768;
    if(isMobile){
      this.closeSidebarMobile();
      return;
    }
    const sb=document.getElementById('sidebar');
    const icon=document.getElementById('sbCollapseIcon');
    const collapsed=sb.classList.toggle('collapsed');
    localStorage.setItem('dt_sb_collapsed',collapsed?'1':'0');
    if(icon) icon.innerHTML=collapsed
      ?'<polyline points="9 18 15 12 9 6"/>'
      :'<polyline points="15 18 9 12 15 6"/>';
  },

  closeSidebarMobile(){
    const sb      = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sb.classList.remove('open');
    if(overlay) {
      overlay.classList.remove('visible');
      setTimeout(() => { overlay.style.display = 'none'; }, 300);
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

  restoreSidebarState(){
    const isMobile = window.innerWidth <= 768;
    const sb   = document.getElementById('sidebar');
    const icon = document.getElementById('sbCollapseIcon');
    if(isMobile){
      sb.classList.remove('collapsed');
      return;
    }
    if(localStorage.getItem('dt_sb_collapsed')==='1'){
      sb.classList.add('collapsed');
      if(icon) icon.innerHTML='<polyline points="9 18 15 12 9 6"/>';
    }
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
        document.getElementById('pageTitle').textContent=(el.querySelector('span')||el).textContent.trim();
        ['btnGerenciarSalarios','btnNovaReceita','btnCSVContas','btnGerarRec'].forEach(id=>{
          const btn = document.getElementById(id); if(btn) btn.style.display='none';
        });
        const btnNova = document.getElementById('btnNovaConta');
        if(btnNova) btnNova.style.display = ['contas'].includes(page) ? 'flex' : 'none';
        if(page==='contas'){ const b=document.getElementById('btnGerarRec'); if(b) b.style.display='flex'; }
        if(page==='receitas'){
          const b=document.getElementById('btnNovaReceita'); if(b) b.style.display='flex';
          const bg=document.getElementById('btnGerenciarSalarios'); if(bg) bg.style.display='flex';
        }
        if(page==='contas'){ const b=document.getElementById('btnCSVContas'); if(b) b.style.display='flex'; }
        const sb = document.getElementById('sidebar'); if(sb) sb.classList.remove('open');
        const ov = document.getElementById('sidebarOverlay');
        if(ov){ ov.classList.remove('visible'); setTimeout(()=>{ov.style.display='none';},300); }
        if(isShellMode){ ROUTER.navigate(page); } else { this.renderPage(page); }
      });
    });
    const menuToggle = document.getElementById('menuToggle');
    if(menuToggle) menuToggle.addEventListener('click',()=>{
      const sb=document.getElementById('sidebar'); const overlay=document.getElementById('sidebarOverlay');
      if(!sb) return;
      const isOpen=sb.classList.toggle('open');
      if(overlay){
        if(isOpen){ overlay.style.display='block'; requestAnimationFrame(()=>overlay.classList.add('visible')); }
        else { overlay.classList.remove('visible'); setTimeout(()=>{overlay.style.display='none';},300); }
      }
    });
  },

  goPage(p){ const el=document.querySelector(`.nav-item[data-page="${p}"]`); if(el) el.click(); },

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
    ['searchContas','filtroAnoContas','filtroMesContas','filtroRespContas','filtroCatContas','filtroFormaContas','filtroStatus','filtroRecorrente'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.oninput = ()=>{
        if(id==='filtroAnoContas'||id==='filtroMesContas'){ STATE.periodoContas=null; self._atualizarPeriodoBadge('contas',null); }
        STATE.pg=1; self.renderContas();
      };
    });
    ['searchReceitas','filtroMesReceitas','filtroRespReceitas','filtroTipoReceitas'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.oninput = ()=>{ STATE.pgReceitas=1; self.renderReceitas(); };
    });
    ['relAno','relMes'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.onchange = ()=>{ STATE.periodo=null; self._atualizarPeriodoBadge('relatorio',null); self.renderRelatorio(); };
    });
    ['relCat','relForma','relResp','relStatus'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.onchange = ()=> self.renderRelatorio();
    });
    const btnCSV = document.getElementById('btnCSV');
    if(btnCSV) btnCSV.onclick = ()=> self.exportCSV();
  },

  renderPage(p){
    if((p==='backup'||p==='config'||p==='upload') && STATE.usuario!=='Leo'){ this.toast('Acesso restrito','error'); return; }
    STATE.page=p;
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
  },

  _aplicarTemaResp(resp){
    const root = document.documentElement;
    root.classList.remove('theme-pri','theme-leo');
    if(resp==='Pri') root.classList.add('theme-pri');
    else if(resp==='Leo') root.classList.add('theme-leo');
  },

  setRespDash(r){
    STATE.dashResp=r;
    document.querySelectorAll('#rc-todos,#rc-leo,#rc-pri').forEach(b=>{b.classList.remove('active');});
    const ids={'':'rc-todos','Leo':'rc-leo','Pri':'rc-pri'};
    document.getElementById(ids[r])?.classList.add('active');
    this._aplicarTemaResp(r);
    this.renderDashboard();
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
