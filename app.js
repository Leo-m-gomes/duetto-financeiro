// ============================================================
// DUETTO FINANCEIRO — Firebase Integration
// ============================================================
"use strict";
// Modo estrito ativado em v3.1+. Detecta erros silenciosos como variáveis
// não declaradas (foi assim que descobrimos o bug do "p" em renderRelatorio).
// Em caso de erro novo após este deploy, abrir DevTools (F12) > Console
// para ver a linha exata do problema.

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
  // M11: fade-out do loading apenas quando saindo do screenLoading para outra tela
  if (isLoadingActive && screenId !== 'screenLoading' && loadingEl) {
    loadingEl.classList.add('fade-out');
    setTimeout(() => {
      loadingEl.classList.remove('fade-out');
      screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === screenId ? 'flex' : 'none');
      });
    }, 400); // duração do fade definida no CSS (transition: opacity .4s)
    return;
  }
  // Comportamento padrão: troca instantânea
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
    }
    this.initTopbarScroll();
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
      // Mobile: usa open/close com overlay — nunca collapsed
      this.closeSidebarMobile();
      return;
    }
    // Desktop: comportamento de recolher/expandir original
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
    // M07-sidebar: remove .visible primeiro (fade-out), depois oculta
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
    // No mobile: garante que não há classe 'collapsed' que cria vão
    if(isMobile){
      sb.classList.remove('collapsed');
      return;
    }
    // Desktop: restaura estado salvo
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
        ['btnAtualizarTabelas','btnNovoSalario','btnNovaReceita','btnCSVContas','btnGerarRec'].forEach(id=>{
          const btn = document.getElementById(id); if(btn) btn.style.display='none';
        });
        const btnNova = document.getElementById('btnNovaConta');
        if(btnNova) btnNova.style.display = ['contas'].includes(page) ? 'flex' : 'none';
        if(page==='contas'){ const b=document.getElementById('btnGerarRec'); if(b) b.style.display='flex'; }
        if(page==='salario'){
          const b1=document.getElementById('btnNovoSalario'); if(b1) b1.style.display='flex';
          const b2=document.getElementById('btnAtualizarTabelas'); if(b2) b2.style.display='flex';
        }
        if(page==='receitas'){ const b=document.getElementById('btnNovaReceita'); if(b) b.style.display='flex'; }
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

  goPage(p){ document.querySelector(`.nav-item[data-page="${p}"]`).click(); },

  topBtns(){
    document.getElementById('btnNovaConta').addEventListener('click',()=>this.openConta());
    document.getElementById('btnNovoSalario').addEventListener('click',()=>this.openSalario());
    document.getElementById('btnNovaReceita').addEventListener('click',()=>this.openReceita());
    document.getElementById('btnAtualizarTabelas').addEventListener('click',()=>this.openTabelas());
    document.getElementById('btnCSVContas').addEventListener('click',()=>this.exportCSVContas());
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

    // Helper para popular select de ano (já existia, mantido).
    const mkAno = (id) => {
      const s=document.getElementById(id); if(!s)return;
      // Idempotência: se já populou, não duplica.
      if(s.options.length > 0) return;
      s.appendChild(new Option('Todos os anos','todos'));
      for(let a=2019;a<=2035;a++) s.appendChild(new Option(a,a));
      s.value = String(anoAtual);
    };

    // ── Helper NOVO: popular select de mês com tolerância a null ──
    // Uniformiza o padrão dos 3 selects de mês (Dash, Contas, Relatório).
    // Idempotente: re-execuções não duplicam opções (importante quando
    // selects() é chamado uma vez no boot e novamente após cada view load).
    const mkMes = (id) => {
      const s=document.getElementById(id); if(!s)return;
      if(s.options.length > 0) return;
      s.appendChild(new Option('Todos os meses','todos'));
      MESES_F.forEach((m,i) => s.appendChild(new Option(m,i)));
      s.value = String(mesAtual);
    };

    // Filtros cat/forma (já tinham guard, mantidos como estavam).
    CACHE.getAllCats().forEach(c=>{ ['filtroCatContas','relCat'].forEach(id=>{ const s=document.getElementById(id); if(s)s.appendChild(new Option(c.nome,c.nome)); }); });
    CACHE.getAllFormas().forEach(f=>{ ['filtroFormaContas','relForma'].forEach(id=>{ const s=document.getElementById(id); if(s)s.appendChild(new Option(f.nome,f.id)); }); });

    // ── Ano + Mês Dashboard ──
    mkAno('filtroAnoDash');
    mkMes('filtroMesDash');

    // ── Ano + Mês Contas ──
    mkAno('filtroAnoContas');
    mkMes('filtroMesContas');

    // ── Ano + Mês Relatório ──
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
    ['relAno','relMes'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.onchange = ()=>{ STATE.periodo=null; self._atualizarPeriodoBadge('relatorio',null); self.renderRelatorio(); };
    });
    ['relCat','relForma','relResp'].forEach(id=>{
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

    // Re-popular selects e re-instalar filtros APÓS a view estar no DOM.
    // Ambas são idempotentes: não duplicam opções nem handlers.
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
        salario:   ()=>this.renderSalario(),
        relatorio: ()=>this.renderRelatorio(),
        upload:    ()=>this.upRenderHistorico(),
        backup:    ()=>this.renderBackup(),
        config:    ()=>this.renderConfig(),
      })[p]?.();
    } catch(err) {
      console.error('[renderPage] Erro ao renderizar ' + p + ':', err);
    }
  },

  // ── Tema visual por responsável ──
  // Aplica/remove classe no <html> — apenas variáveis CSS, zero impacto em layout
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

  // ============================================================
  // DASHBOARD
  // ============================================================
  renderDashboard(){
    const anoVal = document.getElementById('filtroAnoDash')?.value || String(new Date().getFullYear());
    const mesVal = document.getElementById('filtroMesDash')?.value || String(new Date().getMonth());
    const p      = STATE.periodoDash;
    const todosMeses = mesVal==='todos';
    const todosAnos  = anoVal==='todos';
    const mes  = todosMeses ? null : parseInt(mesVal);
    const ano  = todosAnos  ? null : parseInt(anoVal);
    const resp = STATE.dashResp;

    // Filtrar contas — período tem prioridade sobre ano/mês
    const filtrarContas = (all) => {
      if(p) return all.filter(c=>{
        const d=new Date(c.data+'T12:00');
        return d.getFullYear()===p.ano && d.getMonth()>=p.mesIni && d.getMonth()<=p.mesFim;
      });
      let r = all;
      if(ano)  r = r.filter(c=>new Date(c.data+'T12:00').getFullYear()===ano);
      if(!todosMeses && mes!==null) r = r.filter(c=>new Date(c.data+'T12:00').getMonth()===mes);
      return r;
    };
    const baseContas = filtrarContas(CACHE.contas);
    let contas;
    if(!resp){
      contas = baseContas.map(c=>({...c}));
    } else if(resp === 'Leo & Pri'){
      contas = baseContas.filter(c=>c.resp==='Leo & Pri').map(c=>({...c}));
    } else {
      // Leo ou Pri: inclui compartilhadas com valor ÷2
      contas = baseContas.filter(c=>c.resp===resp||c.resp==='Leo & Pri').map(c=>
        c.resp==='Leo & Pri'
          ?{...c,vPagar:vEfetivo(c)/2,vPago:c.vPago>0?c.vPago/2:null,_split:true}
          :{...c});
    }

    // Receita: sempre ano completo por mês (o gráfico mostra o ano todo)
    let recMes=0;
    const mesesCalc = todosMeses ? Array.from({length:12},(_,i)=>i) : [mes];
    CACHE.salarios.forEach(s=>{
      mesesCalc.forEach(m=>{ const h=CACHE.getSalarioMes(s,m); const liq=h?h.liquido:0;
        if(!resp)recMes+=liq; else if(s.pessoa===resp)recMes+=liq;
      });
    });
    CACHE.outras.forEach(r=>{
      mesesCalc.forEach(m=>{ const v=r.valores[m]||0;
        if(!resp)recMes+=v; else if(r.resp===resp)recMes+=v; else if(!r.resp||r.resp==='Ambos')recMes+=v/2;
      });
    });

    const totP    = contas.reduce((s,c)=>s+vEfetivo(c),0);
    const totPend = contas.reduce((s,c)=>s+(c.vPago>0?0:vEfetivo(c)),0);
    const pendList= contas.filter(c=>!(c.vPago>0));
    const saldo   = recMes-totP;
    const anoLabel = todosAnos ? 'Todos os anos' : String(anoVal);
    const mesLabel = todosMeses ? 'Ano completo' : MESES_F[mes];
    const periodoLabel = `${anoLabel} · ${mesLabel}`;

    const atrasadas=CACHE.getOverdue();
    const banner=document.getElementById('dashInfoBanner');
    if(atrasadas.length>0){banner.style.display='flex';banner.innerHTML=`⚠️ <strong>${atrasadas.length} conta${atrasadas.length>1?'s':''} em atraso!</strong> Clique para ver → ${atrasadas.slice(0,2).map(c=>c.conta).join(', ')}${atrasadas.length>2?'...':''}`;}
    else banner.style.display='none';

    const kpis=[
      {label:'Receita',val:fmt(recMes),sub:periodoLabel+(resp?` — ${resp}`:''),icon:'📈',c:'var(--palm)',hero:false},
      {label:'Total Despesas',val:fmt(totP),sub:`${contas.length} contas`,icon:'📋',c:'var(--blue)',hero:false},
      {label:'Pendente',val:fmt(totPend),sub:`${pendList.length} contas`,icon:'⏳',c:'var(--red)',hero:false},
      {label:'Saldo',val:fmt(saldo),sub:saldo>=0?'✅ Positivo':'⚠️ Atenção',icon:saldo>=0?'💰':'📉',c:saldo>=0?'var(--palm)':'var(--red)',hero:true}
    ];
    document.getElementById('kpiGrid').innerHTML=kpis.map(k=>`<div class="kpi-card${k.hero?' kpi-hero':''}" style="--kc:${k.c}"><div class="kpi-label">${k.label}</div><div class="kpi-value" style="color:${k.c}">${k.val}</div><div class="kpi-sub">${k.sub}</div><div class="kpi-icon">${k.icon}</div></div>`).join('');

    // ── INSIGHTS automáticos ──
    this._renderInsights(mes, ano, totP, totPend, saldo, resp, baseContas);

    document.getElementById('pendentesCount').textContent=pendList.length;
    document.getElementById('tbodyPendentes').innerHTML=pendList.slice(0,8).map(c=>{
      const atr=isOverdue(c);const catNome=CACHE.resolveCat(c.catId||c.cat);
      return`<tr class="mob-card pend-mob-row">
        <td data-label="Descrição"><strong>${c.conta}</strong>${c._split?'<span class="badge" style="background:var(--yellow-lt);color:var(--yellow);margin-left:5px;font-size:9px">÷2</span>':''}</td>
        <td data-label="Responsável">${c.resp}</td>
        <td data-label="Categoria">${catNome}</td>
        <td data-label="Vencimento" style="${atr?'color:var(--orange);font-weight:600':''}">${fmtDate(c.data)}</td>
        <td data-label="Valor" class="neg">${fmt(c.vPagar)}</td>
        <td data-label="Status" class="pend-status-cell ${atr?'pend-atr':'pend-ok'}">
          <span class="badge ${atr?'bg-atr':'bg-pend'}">${atr?'● Atrasado':'● Pendente'}</span>
        </td>
      </tr>`;
    }).join('')||'<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--t4)">Nenhuma pendência 🎉</td></tr>';

    this.chartCategoria(mes,resp,baseContas);this.chartFluxo(baseContas,resp);
    this.renderPareto('canvasParetoDash','paretoTableDash',contas);
  },

  _renderInsights(mes, ano, totP, totPend, saldo, resp, baseContas){
    const el = document.getElementById('insightBar');
    if(!el) return;
    const chips = [];

    // 1. Comparar despesas com mês anterior (só se um mês específico estiver selecionado)
    if(mes !== null && ano !== null){
      const mesPrev = mes === 0 ? 11 : mes - 1;
      const anoPrev = mes === 0 ? ano - 1 : ano;
      const contasPrev = CACHE.contas.filter(c=>{
        const d = new Date(c.data+'T12:00');
        return d.getFullYear()===anoPrev && d.getMonth()===mesPrev && (!resp || c.resp===resp || c.resp==='Leo & Pri');
      });
      const totPrev = contasPrev.reduce((s,c)=>s+vEfetivo(c),0);
      if(totPrev > 0 && totP > 0){
        const diff = ((totP - totPrev) / totPrev) * 100;
        const abs  = Math.abs(diff).toFixed(1);
        const prevLabel = MESES_F[mesPrev];
        if(diff > 5)       chips.push({cls:'insight-up',  text:`📈 Despesas ${abs}% acima de ${prevLabel}`});
        else if(diff < -5) chips.push({cls:'insight-down', text:`📉 Despesas ${abs}% abaixo de ${prevLabel}`});
        else               chips.push({cls:'insight-neu',  text:`➡️ Despesas estáveis vs ${prevLabel} (${diff>0?'+':''}${abs}%)`});
      }
    }

    // 2. Categoria com maior gasto
    if(baseContas.length > 0){
      const map = {};
      baseContas.forEach(c=>{ const n=CACHE.resolveCat(c.catId||c.cat); map[n]=(map[n]||0)+vEfetivo(c); });
      const top = Object.entries(map).sort((a,b)=>b[1]-a[1])[0];
      if(top) chips.push({cls:'insight-neu', text:`🏷️ Maior categoria: ${top[0]} (${fmt(top[1])})`});
    }

    // 3. Saldo negativo — alerta
    if(saldo < 0) chips.push({cls:'insight-warn', text:`⚠️ Despesas superam a receita em ${fmt(Math.abs(saldo))}`});

    // 4. Contas próximas do vencimento (3 dias)
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const em3  = new Date(hoje); em3.setDate(hoje.getDate()+3);
    const proximas = CACHE.contas.filter(c=>{
      if(c.vPago > 0) return false;
      const d = new Date(c.data+'T12:00'); d.setHours(0,0,0,0);
      return d >= hoje && d <= em3;
    });
    if(proximas.length > 0) chips.push({cls:'insight-warn', text:`⏰ ${proximas.length} conta${proximas.length>1?'s':''} vencem nos próximos 3 dias`});

    // 5. Contas recorrentes sem preenchimento no mês atual
    if(mes !== null && ano !== null){
      const recorrentes = CACHE.contas.filter(c=>c.recorrente);
      const comMes = new Set(
        CACHE.contas.filter(c=>{ const d=new Date(c.data+'T12:00'); return d.getFullYear()===ano&&d.getMonth()===mes; }).map(c=>c.conta.toLowerCase())
      );
      const semMes = recorrentes.filter(c=>!comMes.has(c.conta.toLowerCase()));
      if(semMes.length > 0) chips.push({cls:'insight-warn', text:`🔁 ${semMes.length} conta${semMes.length>1?'s recorrentes':'recorrente'} sem registro neste mês`});
    }

    el.innerHTML = chips.length
      ? chips.map(c=>`<span class="insight-chip ${c.cls}">${c.text}</span>`).join('')
      : '';
  },

  chartCategoria(mes,resp,baseContas){
    const dark = document.documentElement.classList.contains('dark');
    const textColor  = dark ? 'rgba(235,235,245,.85)' : '#374151';
    const borderColor = dark ? '#2c2c2e' : '#fff';
    const base = baseContas || CACHE.contas;
    let contas;
    if(mes===null){
      if(!resp) contas=[...base];
      else if(resp==='Leo & Pri') contas=base.filter(c=>c.resp==='Leo & Pri').map(c=>({...c}));
      else contas=base.filter(c=>c.resp===resp||c.resp==='Leo & Pri').map(c=>c.resp==='Leo & Pri'?{...c,vPagar:vEfetivo(c)/2}:{...c});
    } else {
      const porMes=base.filter(c=>new Date(c.data+'T12:00').getMonth()===mes);
      if(!resp) contas=[...porMes];
      else if(resp==='Leo & Pri') contas=porMes.filter(c=>c.resp==='Leo & Pri').map(c=>({...c}));
      else contas=porMes.filter(c=>c.resp===resp||c.resp==='Leo & Pri').map(c=>c.resp==='Leo & Pri'?{...c,vPagar:vEfetivo(c)/2}:{...c});
    }
    const map={};contas.forEach(c=>{const n=CACHE.resolveCat(c.catId||c.cat);map[n]=(map[n]||0)+vEfetivo(c);});
    const sorted=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,9);
    const total = sorted.reduce((s,[,v])=>s+v,0);
    // M03: paleta adaptada ao tema (claro/escuro), garantindo contraste no dark
    const chartColors = getChartColors();
    this.mkChart('canvasCategoria',{
      type:'doughnut',
      data:{
        labels:sorted.map(([k])=>k),
        datasets:[{
          data:sorted.map(([,v])=>v),
          backgroundColor:chartColors,
          borderWidth:3,
          borderColor,
          hoverOffset:6,
        }]
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        cutout:'62%',
        plugins:{
          legend:{
            position:'right',
            labels:{color:textColor,font:{size:11},boxWidth:10,padding:10,
              generateLabels(chart){
                const ds=chart.data.datasets[0];
                return chart.data.labels.map((label,i)=>{
                  const val=ds.data[i];
                  const pct=total>0?((val/total)*100).toFixed(1):'0.0';
                  return{text:`${label} ${pct}%`,fillStyle:ds.backgroundColor[i],hidden:false,index:i};
                });
              }
            }
          },
          tooltip:{
            backgroundColor:'rgba(15,31,20,.92)',padding:10,cornerRadius:8,
            callbacks:{label:ctx=>{
              const pct=total>0?((ctx.raw/total)*100).toFixed(1):'0.0';
              return ` ${ctx.label}: ${fmt(ctx.raw)} (${pct}%)`;
            }}
          }
        }
      }
    });
  },

  chartFluxo(baseContas, resp){
    // O gráfico Receita×Despesa SEMPRE mostra os 12 meses do ano selecionado
    // Ignora filtro de mês específico — usa todos os dados do ano
    resp = (resp !== undefined) ? resp : STATE.dashResp;
    const anoVal = document.getElementById('filtroAnoDash')?.value || 'todos';
    const ano    = anoVal === 'todos' ? null : parseInt(anoVal);

    // Usa TODAS as contas do ano (não só o mês filtrado)
    const contasAno = ano
      ? CACHE.contas.filter(c => new Date(c.data+'T12:00').getFullYear() === ano)
      : CACHE.contas;

    // Agrupa por mês com filtro de responsável — usa vEfetivo
    const despFilt = Array.from({length:12},(_,m)=>{
      const porMes = contasAno.filter(c=>new Date(c.data+'T12:00').getMonth()===m);
      if(!resp) return porMes.reduce((s,c)=>s+vEfetivo(c),0);
      if(resp==='Leo & Pri') return porMes.filter(c=>c.resp==='Leo & Pri').reduce((s,c)=>s+vEfetivo(c),0);
      return porMes.filter(c=>c.resp===resp||c.resp==='Leo & Pri').reduce((s,c)=>{
        return s+(c.resp==='Leo & Pri'?vEfetivo(c)/2:vEfetivo(c));
      },0);
    });

    const rec=Array.from({length:12},(_,m)=>{
      let t=0;
      CACHE.salarios.forEach(s=>{if(!resp||s.pessoa===resp){const h=CACHE.getSalarioMes(s,m);t+=h?h.liquido:0;}});
      CACHE.outras.forEach(r=>{const v=r.valores[m]||0;if(!resp)t+=v;else if(r.resp===resp)t+=v;else if(!r.resp||r.resp==='Ambos')t+=v/2;});
      return t;
    });
    const mesAtual = new Date().getMonth();
    const anoAtualNum = new Date().getFullYear();
    const dark = document.documentElement.classList.contains('dark');
    const curMes = !ano || ano===anoAtualNum;
    // Cores adaptadas ao tema
    const recStrong  = dark ? 'rgba(50,215,75,.55)'  : 'rgba(0,100,55,.35)';
    const recLight   = dark ? 'rgba(50,215,75,.14)'  : 'rgba(0,100,55,.15)';
    const despStrong = dark ? 'rgba(255,69,58,.45)'  : 'rgba(220,38,38,.25)';
    const despLight  = dark ? 'rgba(255,69,58,.12)'  : 'rgba(220,38,38,.12)';
    const recBorder  = dark ? '#32d74b' : '#006437';
    const despBorder = dark ? '#ff453a' : '#dc2626';
    const tickColor  = dark ? 'rgba(235,235,245,.4)' : '#9ca3af';
    const gridColor  = dark ? 'rgba(255,255,255,.05)': 'rgba(0,0,0,.04)';
    const textColor  = dark ? 'rgba(235,235,245,.85)': '#374151';
    this.mkChart('canvasFluxo',{
      type:'bar',
      data:{
        labels:MESES,
        datasets:[
          {
            label:'Receita',
            data:rec,
            backgroundColor:rec.map((_,i)=>i===mesAtual&&curMes?recStrong:recLight),
            borderColor:recBorder,
            borderWidth:2,
            borderRadius:{topLeft:5,topRight:5},
            borderSkipped:false,
          },
          {
            label:'Despesas',
            data:despFilt,
            backgroundColor:despFilt.map((_,i)=>i===mesAtual&&curMes?despStrong:despLight),
            borderColor:despBorder,
            borderWidth:2,
            borderRadius:{topLeft:5,topRight:5},
            borderSkipped:false,
          }
        ]
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{
          legend:{labels:{color:textColor,font:{size:10},usePointStyle:true,pointStyle:'circle',padding:16}},
          tooltip:{
            backgroundColor:'rgba(15,31,20,.92)',
            padding:10,
            cornerRadius:8,
            callbacks:{
              title:ctx=>MESES_F[ctx[0].dataIndex]||'',
              label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.raw)}`
            }
          }
        },
        scales:{
          x:{ticks:{color:tickColor,font:{size:10}},grid:{display:false}},
          y:{ticks:{color:tickColor,font:{size:10},callback:v=>`R$${(v/1000).toFixed(0)}k`},grid:{color:gridColor,drawBorder:false}}
        }
      }
    });
  },

  // ============================================================
  // CONTAS
  // ============================================================
  renderContas(){
    const search=document.getElementById('searchContas').value.toLowerCase();
    const ano=document.getElementById('filtroAnoContas').value;
    const mes=document.getElementById('filtroMesContas').value;
    const resp=document.getElementById('filtroRespContas').value;
    this._aplicarTemaResp(resp);
    const cat=document.getElementById('filtroCatContas').value;
    const formaId=document.getElementById('filtroFormaContas')?.value||'';
    const status=document.getElementById('filtroStatus').value;
    const recFiltro=document.getElementById('filtroRecorrente')?.value||'';
    const p=STATE.periodoContas;

    let data = p
      ? CACHE.contas.filter(c=>{ const d=new Date(c.data+'T12:00'); return d.getFullYear()===p.ano&&d.getMonth()>=p.mesIni&&d.getMonth()<=p.mesFim; })
      : CACHE.getByAnoMes(ano,mes);

    if(search)  data = data.filter(c=>c.conta.toLowerCase().includes(search));
    if(resp)    data = data.filter(c=>c.resp===resp);
    if(cat)     data = data.filter(c=>CACHE.resolveCat(c.catId||c.cat)===cat);
    if(formaId) data = data.filter(c=>c.formaId===formaId||CACHE.resolveForma(c.formaId||c.forma)===CACHE.getFormaNome(formaId));
    if(recFiltro==='sim') data = data.filter(c=>c.recorrente);
    else if(recFiltro==='nao') data = data.filter(c=>!c.recorrente);
    if(status==='pago')          data=data.filter(c=>c.vPago>0);
    else if(status==='pendente') data=data.filter(c=>!(c.vPago>0));
    else if(status==='atrasado') data=data.filter(isOverdue);

    document.getElementById('totalGeral').textContent    = fmt(data.reduce((s,c)=>s+vEfetivo(c),0));
    document.getElementById('totalPago').textContent     = fmt(data.reduce((s,c)=>s+(c.vPago||0),0));
    document.getElementById('totalPendente').textContent = fmt(data.reduce((s,c)=>s+(c.vPago>0?0:vEfetivo(c)),0));

    const atrasadas=CACHE.getOverdue();
    const alertEl=document.getElementById('overdueAlert');
    if(atrasadas.length>0){alertEl.style.display='block';alertEl.innerHTML=`⚠️ <strong>${atrasadas.length} conta${atrasadas.length>1?'s':''} em atraso</strong> — Clique para filtrar`;}
    else alertEl.style.display='none';

    document.getElementById('contasInfo').textContent=`${data.length} conta${data.length!==1?'s':''} encontrada${data.length!==1?'s':''}`;

    // Ordenação
    data = this._aplicarSort(data,'sortContas');

    const totalPg=Math.max(1,Math.ceil(data.length/STATE.pgSz));
    if(STATE.pg>totalPg)STATE.pg=1;
    const start=(STATE.pg-1)*STATE.pgSz;
    const paged=data.slice(start,start+STATE.pgSz);

    document.getElementById('tbodyContas').innerHTML=paged.map((c,i)=>{
      const pago=c.vPago>0; const atr=isOverdue(c); const ef=vEfetivo(c); const pend=pago?0:ef;
      const catNome=CACHE.resolveCat(c.catId||c.cat);const formaNome=CACHE.resolveForma(c.formaId||c.forma);
      const auditBy=c.updatedBy||c.createdBy||'';
      const hasGrupo=c.grupo&&CACHE.getByGrupo(c.grupo).length>1;
      return`<tr class="mob-card" style="${atr?'background:rgba(234,88,12,.04)':''}">
        <td class="td-chk desk-only">${!pago?`<input type="checkbox" class="chk-conta" data-id="${c.id}" data-val="${ef}" onchange="APP.atualizarBarraPagamento()" style="accent-color:var(--palm);width:14px;height:14px;cursor:pointer">`:''}</td>
        <td data-label="#" style="color:var(--t4);font-size:10.5px">${start+i+1}</td>
        <td data-label="Descrição" style="max-width:180px"><div style="font-weight:600;color:var(--t1);line-height:1.3;white-space:normal">${c.conta}${c.recorrente?'<span class="badge-rec" style="margin-left:6px">🔁 REC</span>':''}</div>${c.nota?`<div style="font-size:10px;color:var(--t4);margin-top:1px">${c.nota}</div>`:''}</td>
        <td data-label="Responsável">${c.resp}</td>
        <td data-label="Forma" style="font-size:11px;color:var(--t3)">${formaNome}</td>
        <td data-label="Categoria"><span class="badge bg-cat">${catNome}</span></td>
        <td data-label="A Pagar" class="money neg">${fmt(ef)}</td>
        <td data-label="Pago" class="money ${pago?'pos':'dim'}">${pago?fmt(c.vPago):'—'}</td>
        <td data-label="Pendente" class="money ${pend>0?(atr?'atr':'neg'):'dim'}">${pend>0?fmt(pend):'—'}</td>
        <td data-label="Vencimento" style="${atr?'color:var(--orange);font-weight:600':''}">${fmtDate(c.data)}</td>
        <td data-label="Parcela" class="col-hide" style="font-size:10.5px;color:var(--t4)">${c.parcela||'—'}</td>
        <td data-label="Por" class="col-hide">${auditBy?`<span class="audit-chip">${auditBy}</span>`:''}</td>
        <td data-label="Ações" style="white-space:nowrap">
          <button class="action-btn edit" title="Editar" onclick="APP.openConta('${c.id}')">✏</button>
          ${!pago?`<button class="action-btn pay" title="Pagar" onclick="APP.marcarPago('${c.id}')">✓</button>`:''}
          ${pago?`<button class="action-btn" title="Desfazer" onclick="APP.desfazerPagamento('${c.id}')" style="background:var(--orange-lt);color:var(--orange);border:1px solid #fed7aa">↩</button>`:''}
          ${hasGrupo?`<button class="action-btn parcs" title="Parcelamento" onclick="APP.openParcelas('${c.grupo}')">≡</button>`:''}
          <button class="action-btn del" title="Excluir" onclick="APP.deleteConta('${c.id}')">✕</button>
        </td></tr>`;
    }).join('')||`<tr><td colspan="13" style="padding:0;border:none"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhuma conta encontrada</div><div class="empty-sub">Tente ajustar os filtros ou adicione uma nova conta.</div></div></td></tr>`;

    // Limpa seleção ao re-renderizar
    this.atualizarBarraPagamento();

    const pgEl=document.getElementById('pgContas');pgEl.innerHTML='';
    if(totalPg>1){
      const mk=(l,p,a=false)=>{const b=document.createElement('button');b.className='pg-btn'+(a?' active':'');b.textContent=l;b.onclick=()=>{STATE.pg=p;this.renderContas();};pgEl.appendChild(b);};
      if(STATE.pg>1)mk('←',STATE.pg-1);
      for(let p=Math.max(1,STATE.pg-2);p<=Math.min(totalPg,STATE.pg+2);p++)mk(p,p,p===STATE.pg);
      if(STATE.pg<totalPg)mk('→',STATE.pg+1);
      const info=document.createElement('span');info.style.cssText='font-size:11px;color:var(--t4);margin-left:8px';
      info.textContent=`${start+1}–${Math.min(start+STATE.pgSz,data.length)} de ${data.length}`;pgEl.appendChild(info);
    }
  },

  atualizarDiffPagamento(){
    const id   = document.getElementById('pgContaId').value;
    const c    = CACHE.contas.find(x=>x.id===id);
    const pago = parseFloat(document.getElementById('pgValorPago').value)||0;
    const prev = c ? c.vPagar : 0;
    const diff = pago - prev;
    const el   = document.getElementById('pgDiff');
    if(!pago || Math.abs(diff) < 0.01){ el.style.display='none'; return; }
    el.style.display='block';
    if(diff > 0){
      el.style.cssText='display:block;margin-top:5px;font-size:11.5px;padding:6px 10px;border-radius:6px;background:var(--orange-lt);color:var(--orange);border:1px solid #fed7aa';
      el.textContent=`⚠️ Acréscimo de ${fmt(diff)} em relação ao previsto`;
    } else {
      el.style.cssText='display:block;margin-top:5px;font-size:11.5px;padding:6px 10px;border-radius:6px;background:var(--green-lt);color:var(--green);border:1px solid #bbf7d0';
      el.textContent=`✅ Desconto de ${fmt(Math.abs(diff))} em relação ao previsto`;
    }
  },

  marcarPago(id){
    const c=CACHE.contas.find(x=>x.id===id); if(!c)return;
    document.getElementById('pgContaId').value          = id;
    document.getElementById('pgContaNome').textContent  = c.conta;
    document.getElementById('pgContaData').textContent  = fmtDate(c.data);
    document.getElementById('pgContaParc').textContent  = c.parcela||'';
    document.getElementById('pgValorPrevisto').textContent = fmt(c.vPagar);
    document.getElementById('pgValorPago').value        = c.vPagar.toFixed(2);
    document.getElementById('pgDiff').style.display     = 'none';
    document.getElementById('ovPagamento').classList.add('open');
    setTimeout(()=>{ const el=document.getElementById('pgValorPago'); el.focus(); el.select(); },150);
  },

  async confirmarPagamento(){
    const btn  = document.querySelector('#ovPagamento .btn-primary');
    if(btn) btn.classList.add('loading');
    try{
      const id    = document.getElementById('pgContaId').value;
      const valor = parseFloat(document.getElementById('pgValorPago').value);
      if(!valor||valor<=0){ this.toast('Informe um valor válido','error'); return; }
      await FS.pagarConta(id, STATE.usuario, valor);
      APP.closeModal('ovPagamento');
      this.toast(`Pagamento de ${fmt(valor)} registrado por ${STATE.usuario} ✅`,'success');
    }finally{
      if(btn) btn.classList.remove('loading');
    }
  },

  async deleteConta(id){
    const c=CACHE.contas.find(x=>x.id===id);
    if(!c||!confirm(`Excluir "${c.conta}"?`))return;
    await FS.deleteConta(id);this.toast('Conta excluída','success');
  },

  // ── PARCELAS ──
  openParcelas(grupo){
    STATE.parcGrupo=grupo;
    const parcs=CACHE.getByGrupo(grupo);if(!parcs.length)return;
    document.getElementById('titleParcelas').textContent=`Parcelamento: ${parcs[0].conta}`;
    const respOpts=['Leo','Pri','Leo & Pri'].map(r=>`<option value="${r}">${r}</option>`).join('');
    document.getElementById('tbodyParcelas').innerHTML=parcs.map(c=>{
      const pago=c.vPago>0;const atr=isOverdue(c);
      return`<tr style="${atr?'background:rgba(234,88,12,.04)':''}">
        <td><input type="text" value="${c.parcela||''}" id="parc_parc_${c.id}" style="width:80px"></td>
        <td><input type="text" value="${c.conta}" id="parc_desc_${c.id}"></td>
        <td><select id="parc_resp_${c.id}" style="min-width:90px">${['Leo','Pri','Leo & Pri'].map(r=>`<option value="${r}"${c.resp===r?' selected':''}>${r}</option>`).join('')}</select></td>
        <td><input type="date" value="${c.data}" id="parc_data_${c.id}"></td>
        <td><input type="number" value="${c.vPagar}" id="parc_val_${c.id}" step="0.01" style="width:90px"></td>
        <td>${pago?'<span class="badge bg-pago">Pago</span>':atr?'<span class="badge bg-atr">Atrasado</span>':'<span class="badge bg-pend">Pendente</span>'}</td>
        <td>${c.paidBy||c.updatedBy||c.createdBy||'—'}</td>
        <td><div style="display:flex;gap:6px;align-items:center;white-space:nowrap">${!pago?`<button class="btn btn-sm" style="background:var(--green-lt);color:var(--green);border:1px solid #bbf7d0;padding:5px 10px" onclick="APP.parcsPayOne('${c.id}')">✓ Pagar</button>`:''}<button class="btn btn-sm btn-danger" style="padding:5px 10px" onclick="APP.parcsDeleteOne('${c.id}')">✕</button></div></td>
      </tr>`;
    }).join('');
    document.getElementById('ovParcelas').classList.add('open');
  },

  async parcsPayAll(){
    const parcs=CACHE.getByGrupo(STATE.parcGrupo).filter(c=>!(c.vPago>0));
    if(!parcs.length){this.toast('Todas já estão pagas','info');return;}
    if(!confirm(`Marcar ${parcs.length} parcela(s) como pagas?`))return;
    await Promise.all(parcs.map(c=>FS.pagarConta(c.id,STATE.usuario,c.vPagar)));
    this.toast(`${parcs.length} parcela(s) pagas`,'success');
    APP.closeModal('ovParcelas');
  },
  async parcsPayEarly(){
    const parcs=CACHE.getByGrupo(STATE.parcGrupo).filter(c=>!(c.vPago>0));
    if(!parcs.length){this.toast('Nenhuma pendente','info');return;}
    const val=prompt(`Valor do pagamento antecipado (${parcs.length} parcelas):`);if(!val)return;
    const nota=prompt('Observação:')||'Pagamento antecipado';
    await Promise.all(parcs.map(c=>FS.pagarConta(c.id,STATE.usuario,parseFloat(val)/parcs.length)));
    this.toast('Pagamento antecipado registrado','success');
    APP.closeModal('ovParcelas');
  },
  async parcsPayOne(id){
    if(!confirm('Pagar esta parcela?'))return;
    const c=CACHE.contas.find(x=>x.id===id);
    await FS.pagarConta(id,STATE.usuario,c?c.vPagar:0);this.toast('Parcela paga','success');
    this.openParcelas(STATE.parcGrupo);
  },
  async parcsDeleteOne(id){
    if(!confirm('Excluir esta parcela?'))return;
    await FS.deleteConta(id);this.toast('Parcela excluída','success');
    this.openParcelas(STATE.parcGrupo);
  },
  async parcsDeleteAll(){
    const parcs=CACHE.getByGrupo(STATE.parcGrupo);
    if(!confirm(`Excluir TODAS as ${parcs.length} parcelas?\n\nEsta ação não pode ser desfeita.`))return;
    await Promise.all(parcs.map(c=>FS.deleteConta(c.id)));
    APP.closeModal('ovParcelas');
    this.toast('Parcelamento excluído','success');
  },
  parcsApplyDesc(){
    const parcs=CACHE.getByGrupo(STATE.parcGrupo);if(!parcs.length)return;
    const newDesc=document.getElementById(`parc_desc_${parcs[0].id}`)?.value;if(!newDesc)return;
    parcs.forEach(c=>{const el=document.getElementById(`parc_desc_${c.id}`);if(el)el.value=newDesc;});
    this.toast('Descrição aplicada — clique em Salvar','info');
  },
  async parcsSaveAll(){
    const parcs=CACHE.getByGrupo(STATE.parcGrupo);
    await Promise.all(parcs.map(c=>{
      const desc=document.getElementById(`parc_desc_${c.id}`)?.value;
      const resp=document.getElementById(`parc_resp_${c.id}`)?.value;
      const data=document.getElementById(`parc_data_${c.id}`)?.value;
      const val =document.getElementById(`parc_val_${c.id}`)?.value;
      const parc=document.getElementById(`parc_parc_${c.id}`)?.value;
      return FS.updateConta(c.id,{conta:desc||c.conta,resp:resp||c.resp,data:data||c.data,vPagar:parseFloat(val)||c.vPagar,parcela:parc||c.parcela,updatedBy:STATE.usuario});
    }));
    this.toast('Alterações salvas','success');
    APP.closeModal('ovParcelas');
  },

  // ============================================================
  // RECEITAS
  // ============================================================
  toggleEditReceitas(){
    STATE.recEditando=!STATE.recEditando;
    document.getElementById('recEditStatus').textContent=STATE.recEditando?'✏️ Modo edição':'Somente leitura';
    document.getElementById('btnToggleEditRec').textContent=STATE.recEditando?'🔒 Fechar edição':'✏️ Editar';
    this.renderRecOutras();
  },

  renderReceitas(){
    const filtroResp=document.getElementById('recFiltroResp')?.value||'';
    const filtroTipo=document.getElementById('recFiltroTipo')?.value||'';
    const secSal=document.getElementById('tblRecSalarios')?.closest('.rec-section');
    const secOut=document.getElementById('tblRecOutras')?.closest('.rec-section');
    const mostrarSal=filtroTipo!=='outras';const mostrarOut=filtroTipo!=='salarios';
    if(secSal)secSal.style.display=mostrarSal?'':'none';
    if(secOut)secOut.style.display=mostrarOut?'':'none';
    if(mostrarSal)this.renderRecSalarios(filtroResp);
    if(mostrarOut)this.renderRecOutras(filtroResp);
    this.renderRecChart(filtroResp);
  },

  renderRecSalarios(filtroResp=''){
    const sals=CACHE.salarios.filter(s=>!filtroResp||s.pessoa===filtroResp);
    const header=`<thead><tr><th>Pessoa</th><th>Fonte</th>${MESES.map(m=>`<th>${m}</th>`).join('')}<th>Total</th></tr></thead>`;
    const rows=sals.map(s=>{
      const vals=Array.from({length:12},(_,m)=>{const h=CACHE.getSalarioMes(s,m);return h?h.liquido:0;});
      const total=vals.reduce((a,b)=>a+b,0);const chip=s.pessoa?`<span class="badge bg-cat">${s.pessoa}</span>`:'';
      return`<tr><td>${chip}</td><td>${s.nome}</td>${vals.map(v=>`<td class="pos" style="text-align:right">${fmtN(v)}</td>`).join('')}<td class="pos" style="text-align:right;font-weight:700">${fmtN(total)}</td></tr>`;
    }).join('');
    const totals=Array.from({length:12},(_,m)=>{let t=0;sals.forEach(s=>{const h=CACHE.getSalarioMes(s,m);t+=h?h.liquido:0;});return t;});
    const tTotal=totals.reduce((a,b)=>a+b,0);
    document.getElementById('tblRecSalarios').innerHTML=header+`<tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total Salários</td>${totals.map(v=>`<td style="text-align:right">${fmtN(v)}</td>`).join('')}<td style="text-align:right">${fmtN(tTotal)}</td></tr></tfoot>`;
  },

  renderRecOutras(filtroResp=''){
    const todas=CACHE.outras;
    const outras=filtroResp?todas.filter(r=>!r.resp||r.resp===''||r.resp===filtroResp):todas;
    const edit=STATE.recEditando;
    const header=`<thead><tr><th>Responsável</th><th>Descrição</th>${MESES.map(m=>`<th>${m}</th>`).join('')}<th>Total</th><th></th></tr></thead>`;
    const rows=outras.map(r=>{
      const respChip=r.resp?`<span class="badge bg-cat">${r.resp}</span>`:`<span style="font-size:10.5px;color:var(--t4)">Ambos</span>`;
      const cells=r.valores.map((v,m)=>{
        if(edit)return`<td><input class="cell-input" type="number" step="0.01" min="0" id="rec_${r.id}_${m}" value="${v||''}" placeholder="0" oninput="APP.recalcRowTotal('${r.id}')" onchange="APP.saveOutraValor('${r.id}',${m},this.value)"></td>`;
        return`<td style="text-align:right;font-size:11.5px;color:var(--t2)">${v?fmtN(v):'—'}</td>`;
      }).join('');
      const total=r.valores.reduce((a,b)=>a+b,0);
      return`<tr><td>${edit?`<select onchange="APP.saveOutraResp('${r.id}',this.value)" style="padding:3px 6px;border:1px solid var(--border);border-radius:5px;font-size:11.5px"><option value="" ${!r.resp?'selected':''}>Ambos</option><option value="Leo" ${r.resp==='Leo'?'selected':''}>Leo</option><option value="Pri" ${r.resp==='Pri'?'selected':''}>Pri</option></select>`:respChip}</td><td><strong>${r.desc}</strong>${r.updatedBy?`<br><span class="audit-chip">${r.updatedBy}</span>`:''}</td>${cells}<td class="pos" style="text-align:right;font-weight:700" id="rec_total_${r.id}">${fmtN(total)}</td><td>${edit?`<button class="action-btn del" onclick="APP.deleteOutra('${r.id}')">✕</button>`:''}</td></tr>`;
    }).join('');
    const totals=Array.from({length:12},(_,m)=>outras.reduce((s,r)=>s+(r.valores[m]||0),0));
    const tTotal=totals.reduce((a,b)=>a+b,0);
    document.getElementById('tblRecOutras').innerHTML=header+`<tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total Outras Receitas</td>${totals.map(v=>`<td style="text-align:right">${fmtN(v)}</td>`).join('')}<td style="text-align:right">${fmtN(tTotal)}</td><td></td></tr></tfoot>`;
  },

  recalcRowTotal(id){
    const r=CACHE.outras.find(x=>x.id===id);if(!r)return;
    let total=0;for(let m=0;m<12;m++){const el=document.getElementById(`rec_${id}_${m}`);total+=parseFloat(el?.value||0)||0;}
    const totEl=document.getElementById(`rec_total_${id}`);if(totEl)totEl.textContent=fmtN(total);
  },

  async saveOutraValor(id,mes,val){
    const r=CACHE.outras.find(x=>x.id===id);if(!r)return;
    const valores=[...r.valores];valores[mes]=parseFloat(val)||0;
    await FS.updateOutra(id,{valores,updatedBy:STATE.usuario,updatedAt:today()});
  },

  async saveOutraResp(id,resp){
    await FS.updateOutra(id,{resp});
  },

  async deleteOutra(id){
    if(!confirm('Excluir esta receita?'))return;
    await FS.deleteOutra(id);this.toast('Receita excluída','success');
  },

  renderRecChart(filtroResp=''){
    const sals=CACHE.salarios.filter(s=>!filtroResp||s.pessoa===filtroResp);
    const outras=CACHE.outras.filter(r=>!filtroResp||!r.resp||r.resp===filtroResp);
    const salVals=Array.from({length:12},(_,m)=>{let t=0;sals.forEach(s=>{const h=CACHE.getSalarioMes(s,m);t+=h?h.liquido:0;});return t;});
    const outVals=Array.from({length:12},(_,m)=>outras.reduce((s,r)=>s+(r.valores[m]||0),0));
    const dark = document.documentElement.classList.contains('dark');

    // ── Paleta diferenciada: verde escuro (Salários) vs menta vibrante (Outras)
    const salColor    = dark ? 'rgba(0,100,55,.75)'    : 'rgba(0,100,55,.82)';
    const salBorder   = dark ? '#32d74b'                : '#006437';
    const outColor    = dark ? 'rgba(52,211,153,.55)'  : 'rgba(52,211,153,.80)';
    const outBorder   = dark ? '#34d399'                : '#059669';
    const tickColor   = dark ? 'rgba(235,235,245,.45)' : '#9ca3af';
    const gridColor   = dark ? 'rgba(255,255,255,.05)' : '#e8edf2';
    const legendColor = dark ? 'rgba(235,235,245,.85)' : '#374151';
    const tooltipBg   = dark ? 'rgba(28,28,30,.97)'    : 'rgba(15,31,20,.95)';

    // Total por mês para exibir no tooltip
    const totVals = salVals.map((v,i)=>v+(outVals[i]||0));

    this.mkChart('canvasReceitas',{
      type:'bar',
      data:{
        labels: MESES,
        datasets:[
          {
            label: 'Salários',
            data: salVals,
            backgroundColor: salColor,
            borderColor: salBorder,
            borderWidth: 1.5,
            borderRadius: { topLeft:4, topRight:4 },
            borderSkipped: false,
            barPercentage: 0.62,
            categoryPercentage: 0.75,
            stack: 'receitas',
          },
          {
            label: 'Outras Receitas',
            data: outVals,
            backgroundColor: outColor,
            borderColor: outBorder,
            borderWidth: 1.5,
            borderRadius: { topLeft:4, topRight:4 },
            borderSkipped: false,
            barPercentage: 0.62,
            categoryPercentage: 0.75,
            stack: 'receitas',
          }
        ]
      },
      options:{
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration:800, easing:'easeInOutCubic' },
        plugins:{
          legend:{
            position: 'top',
            align: 'end',
            labels:{
              color: legendColor,
              font:{ size:11, family:'DM Sans, system-ui, sans-serif', weight:'500' },
              boxWidth: 10,
              boxHeight: 10,
              borderRadius: 3,
              useBorderRadius: true,
              usePointStyle: false,
              padding: 16,
            }
          },
          tooltip:{
            backgroundColor: tooltipBg,
            titleColor: '#fff',
            bodyColor: 'rgba(255,255,255,.75)',
            padding: { top:10, bottom:10, left:14, right:14 },
            cornerRadius: 10,
            boxPadding: 5,
            callbacks:{
              title: ctx => MESES_F[ctx[0].dataIndex] || '',
              label: ctx => {
                const pct = totVals[ctx.dataIndex] > 0
                  ? ((ctx.raw / totVals[ctx.dataIndex]) * 100).toFixed(1)
                  : '0.0';
                return `  ${ctx.dataset.label}: ${fmt(ctx.raw)} (${pct}%)`;
              },
              afterBody: ctx => {
                const i = ctx[0].dataIndex;
                return [`  Total: ${fmt(totVals[i])}`];
              },
              afterBodyColor: () => 'rgba(255,255,255,.5)',
            }
          }
        },
        scales:{
          x:{
            stacked: true,
            grid: { display:false },
            ticks:{
              color: tickColor,
              font:{ size:10, family:'DM Sans, system-ui, sans-serif' }
            }
          },
          y:{
            stacked: true,
            min: 0,
            grid:{
              color: gridColor,
              drawBorder: false,
              lineWidth: 1,
            },
            ticks:{
              color: tickColor,
              font:{ size:10, family:'DM Sans, system-ui, sans-serif' },
              callback: v => `R$${(v/1000).toFixed(0)}k`,
              maxTicksLimit: 6,
            }
          }
        }
      }
    });
  },

  // ============================================================
  // SALÁRIO
  // ============================================================
  renderSalario(){
    document.getElementById('salCards').innerHTML=CACHE.salarios.map(s=>{
      const hist=[...s.historico].sort((a,b)=>b.mesInicio-a.mesInicio);const atual=hist[0];
      const histRows=hist.map(h=>`<div class="hist-item"><span class="mes">A partir de ${MESES_F[h.mesInicio]}</span><span>${fmt(h.salario)}</span><span class="pos" style="font-weight:600">${fmt(h.liquido)}</span><button class="action-btn del" onclick="APP.deleteSalHist('${s.id}',${h.mesInicio})" style="width:20px;height:20px;font-size:10px">✕</button></div>`).join('');
      return`<div class="sal-card"><div class="sal-card-head"><h4>👤 ${s.nome} ${s.pessoa?`<span style="font-size:11px;background:rgba(255,255,255,.25);padding:2px 8px;border-radius:99px;font-family:var(--font-b);font-weight:600">${s.pessoa}</span>`:''}</h4><div style="display:flex;gap:5px"><button class="action-btn edit" onclick="APP.openSalario('${s.id}')" style="background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.3);color:#fff">✏</button><button class="action-btn del" onclick="APP.deletePessoa('${s.id}')" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.7)">✕</button></div></div><div class="sal-card-body"><div class="sal-row"><span>Nº Dependentes</span><span>${atual.deps}</span></div><div class="sal-row"><span>Salário Bruto</span><span>${fmt(atual.salario)}</span></div>${atual.bonificacao?`<div class="sal-row"><span>Bonificação</span><span>${fmt(atual.bonificacao)}</span></div>`:''}<div class="sal-row ded"><span>(-) INSS</span><span>${fmt(atual.inss)}</span></div><div class="sal-row ded"><span>(-) IR</span><span>${fmt(atual.ir)}</span></div><div class="sal-row total"><span>Salário Líquido</span><span>${fmt(atual.liquido)}</span></div></div>${hist.length>0?`<div class="sal-hist"><div class="sal-hist-toggle" onclick="this.nextElementSibling.classList.toggle('open')">📅 Histórico (${hist.length}) ▾</div><div class="sal-hist-body">${histRows}</div></div>`:''}</div>`;
    }).join('')||'<div style="color:var(--t4);padding:20px">Nenhuma pessoa cadastrada. Clique em "Novo Salário" para começar.</div>';

    const tab=CACHE.tabelas||DEFAULT_TABELAS;
    document.getElementById('vigenciaIR').textContent=`Vigência: ${tab.vigencia||'—'}`;
    document.getElementById('vigenciaINSS').textContent=`Vigência: ${tab.vigencia||'—'}`;
    document.getElementById('tblIR').innerHTML=`<thead><tr><th>De</th><th>Até</th><th>Alíquota</th><th>Ded.</th></tr></thead><tbody>${tab.ir.map(r=>`<tr><td>${fmt(r.de)}</td><td>${r.ate?fmt(r.ate):'+'}</td><td>${(r.al*100).toFixed(1)}%</td><td>${fmt(r.ded)}</td></tr>`).join('')}<tr style="border-top:2px solid var(--palm-lt)"><td colspan="2" style="color:var(--t4)">Por Dependente</td><td colspan="2" style="color:var(--yellow);font-weight:600">${fmt(tab.dedDep)}</td></tr></tbody>`;
    document.getElementById('tblINSS').innerHTML=`<thead><tr><th>De</th><th>Até</th><th>Alíquota</th><th>Ded.</th></tr></thead><tbody>${tab.inss.map(r=>`<tr><td>${fmt(r.de)}</td><td>${fmt(r.ate)}</td><td>${(r.al*100).toFixed(1)}%</td><td>${fmt(r.ded)}</td></tr>`).join('')}<tr style="border-top:2px solid var(--palm-lt)"><td colspan="2" style="color:var(--t4)">Teto INSS</td><td colspan="2" style="color:var(--yellow);font-weight:600">${fmt(tab.tetoINSS)}</td></tr></tbody>`;
  },

  openSalario(pessoaId=null){
    STATE.editSalPessoa=pessoaId;
    document.getElementById('titleSal').textContent=pessoaId?'Atualizar Salário':'Novo Salário';
    ['sNome','sSal','sBon','sINSS','sIR','sLiq','sPessoa'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('sDeps').value=0;document.getElementById('sBon').value=0;
    document.getElementById('sMesInicio').value=new Date().getMonth();
    document.getElementById('sNome').disabled=false;
    if(pessoaId){
      const s=CACHE.salarios.find(x=>x.id===pessoaId);
      if(s){
        document.getElementById('sNome').value=s.nome;
        document.getElementById('sNome').disabled=true;
        if(document.getElementById('sPessoa'))document.getElementById('sPessoa').value=s.pessoa||'';
        const h=s.historico[s.historico.length-1];
        document.getElementById('sSal').value=h.salario;
        document.getElementById('sBon').value=h.bonificacao||0;
        document.getElementById('sDeps').value=h.deps||0;
        this.calcSalario();
      }
    }
    document.getElementById('ovSalario').classList.add('open');
    setTimeout(()=>document.getElementById('sSal').focus(),100);
  },

  calcSalario(){
    const sal=parseFloat(document.getElementById('sSal').value)||0;
    const bon=parseFloat(document.getElementById('sBon').value)||0;
    const dep=parseInt(document.getElementById('sDeps').value)||0;
    const total=sal+bon;const inss=CACHE.calcINSS(total);const ir=CACHE.calcIR(total,inss,dep);
    const liq=parseFloat((total-inss-ir).toFixed(2));
    document.getElementById('sINSS').value=inss.toFixed(2);
    document.getElementById('sIR').value=ir.toFixed(2);
    document.getElementById('sLiq').value=liq.toFixed(2);
  },

  async saveSalario(){
    const nome=document.getElementById('sNome').value.trim();
    const pessoa=document.getElementById('sPessoa')?.value||'';
    const sal=parseFloat(document.getElementById('sSal').value)||0;
    const bon=parseFloat(document.getElementById('sBon').value)||0;
    const deps=parseInt(document.getElementById('sDeps').value)||0;
    const mes=parseInt(document.getElementById('sMesInicio').value);
    if(!sal)return this.toast('Informe o salário','error');
    const inss=CACHE.calcINSS(sal+bon);const ir=CACHE.calcIR(sal+bon,inss,deps);
    const liq=parseFloat((sal+bon-inss-ir).toFixed(2));
    const histEntry={mesInicio:mes,deps,salario:sal,bonificacao:bon,inss,ir,liquido:liq,updatedBy:STATE.usuario,updatedAt:today()};

    if(STATE.editSalPessoa){
      const s=CACHE.salarios.find(x=>x.id===STATE.editSalPessoa);
      if(s){
        const hist=s.historico.filter(h=>h.mesInicio!==mes);hist.push(histEntry);hist.sort((a,b)=>a.mesInicio-b.mesInicio);
        await FS.saveSalario(STATE.editSalPessoa,{...s,historico:hist,pessoa:pessoa||s.pessoa});
        this.toast(`Salário atualizado a partir de ${MESES_F[mes]}`,'success');
      }
    } else {
      if(!nome)return this.toast('Nome é obrigatório','error');
      if(!pessoa)return this.toast('Selecione a pessoa','error');
      await fbDb.collection('salarios').add({nome,pessoa,historico:[histEntry],createdBy:STATE.usuario});
      this.toast(`${nome} cadastrado!`,'success');
    }
    APP.closeModal('ovSalario');
    document.getElementById('sNome').disabled=false;STATE.editSalPessoa=null;
  },

  async deleteSalHist(pessoaId,mes){
    const s=CACHE.salarios.find(x=>x.id===pessoaId);
    if(!s||s.historico.length<=1){this.toast('Mantenha ao menos um registro','error');return;}
    if(!confirm(`Remover salário de ${MESES_F[mes]}?`))return;
    const hist=s.historico.filter(h=>h.mesInicio!==mes);
    await FS.saveSalario(pessoaId,{...s,historico:hist});
    this.toast('Registro removido','success');
  },

  async deletePessoa(id){
    const s=CACHE.salarios.find(x=>x.id===id);
    if(!s||!confirm(`Excluir ${s.nome}?`))return;
    await FS.deleteSalario(id);this.toast('Excluído','success');
  },

  // ── TABELAS FISCAIS ──
  openTabelas(){
    const tab=CACHE.tabelas||DEFAULT_TABELAS;
    document.getElementById('tabelasEditor').style.display='none';
    document.getElementById('btnSalvarTabelas').style.display='none';
    document.getElementById('atualizarStatus').innerHTML='';
    document.getElementById('editorIR').value=JSON.stringify(tab.ir,null,2);
    document.getElementById('editorINSS').value=JSON.stringify(tab.inss,null,2);
    document.getElementById('edDedDep').value=tab.dedDep;
    document.getElementById('edTetoINSS').value=tab.tetoINSS;
    document.getElementById('vigencia').value=tab.vigencia||'';
    document.getElementById('ovTabelas').classList.add('open');
  },

  async buscarTabelasOnline(){
    const btn=document.getElementById('btnBuscarOnline');const status=document.getElementById('atualizarStatus');
    btn.innerHTML='⏳ Buscando...';btn.disabled=true;
    status.innerHTML='<div style="background:var(--blue-lt);border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;font-size:12.5px;color:#1d4ed8">🌐 Consultando Receita Federal...</div>';
    try{
      const resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1500,tools:[{type:'web_search_20250305',name:'web_search'}],messages:[{role:'user',content:'Busque as tabelas vigentes 2025/2026 do IRPF e INSS Brasil. Retorne SOMENTE JSON: {"ir":[{"de":0,"ate":2259.20,"al":0,"ded":0}],"inss":[{"de":0,"ate":1518,"al":0.075,"ded":0}],"dedDep":189.59,"tetoINSS":908.86,"vigencia":"2025","fonte":"URL"}'}]})});
      const data=await resp.json();const text=data.content.map(b=>b.text||'').join('');
      const match=text.replace(/```json?|```/g,'').trim().match(/\{[\s\S]*\}/);
      if(!match)throw new Error('JSON não encontrado');
      const parsed=JSON.parse(match[0]);
      document.getElementById('editorIR').value=JSON.stringify(parsed.ir,null,2);
      document.getElementById('editorINSS').value=JSON.stringify(parsed.inss,null,2);
      document.getElementById('edDedDep').value=parsed.dedDep||189.59;
      document.getElementById('edTetoINSS').value=parsed.tetoINSS||908.86;
      document.getElementById('vigencia').value=parsed.vigencia||'2025';
      status.innerHTML=`<div style="background:var(--green-lt);border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;font-size:12.5px;color:var(--green)">✅ Encontrado! Revise e clique em Salvar.</div>`;
      document.getElementById('tabelasEditor').style.display='block';document.getElementById('btnSalvarTabelas').style.display='flex';
    }catch(e){
      status.innerHTML='<div style="background:var(--red-lt);border:1px solid #fecaca;border-radius:8px;padding:10px 14px;font-size:12.5px;color:var(--red)">⚠️ Não foi possível buscar. Use "Editar manualmente".</div>';
      document.getElementById('tabelasEditor').style.display='block';document.getElementById('btnSalvarTabelas').style.display='flex';
    }
    btn.innerHTML='🌐 Buscar nos sites oficiais';btn.disabled=false;
  },

  async salvarTabelas(){
    try{
      const ir=JSON.parse(document.getElementById('editorIR').value);
      const inss=JSON.parse(document.getElementById('editorINSS').value);
      const dedDep=parseFloat(document.getElementById('edDedDep').value)||189.59;
      const tetoINSS=parseFloat(document.getElementById('edTetoINSS').value)||908.86;
      const vigencia=document.getElementById('vigencia').value;
      await FS.saveTabelas({ir,inss,dedDep,tetoINSS,vigencia});
      APP.closeModal('ovTabelas');
      this.toast('Tabelas fiscais atualizadas! ✅','success');
    }catch(e){this.toast('JSON inválido. Verifique o formato.','error');}
  },

  // ============================================================
  // RELATÓRIO
  // ============================================================
  renderRelatorio(){
    const anoVal  = document.getElementById('relAno').value;
    const mesVal  = document.getElementById('relMes').value;
    const cat     = document.getElementById('relCat').value;
    const formaId = document.getElementById('relForma')?.value||'';
    const resp    = document.getElementById('relResp').value;
    this._aplicarTemaResp(resp);
    const todosMeses = mesVal==='todos';
    const todosAnos  = anoVal==='todos';
    // BUGFIX: variável `p` (período do Relatório) era usada sem declaração,
    // causando ReferenceError que abortava toda a renderização (KPIs, tabela e Pareto vazios).
    // Padrão alinhado com renderDashboard (STATE.periodoDash) e renderContas (STATE.periodoContas).
    const p = STATE.periodo;

    let data = CACHE.contas;

    if(p){
      // Filtro por período: ano fixo + intervalo de meses
      data = data.filter(c=>{
        const d = new Date(c.data+'T12:00');
        return d.getFullYear()===p.ano && d.getMonth()>=p.mesIni && d.getMonth()<=p.mesFim;
      });
    } else {
      if(!todosAnos)  data = data.filter(c=>new Date(c.data+'T12:00').getFullYear()===parseInt(anoVal));
      if(!todosMeses) data = data.filter(c=>new Date(c.data+'T12:00').getMonth()===parseInt(mesVal));
    }
    if(cat)     data = data.filter(c=>CACHE.resolveCat(c.catId||c.cat)===cat);
    if(formaId) data = data.filter(c=>c.formaId===formaId||CACHE.resolveForma(c.formaId||c.forma)===CACHE.getFormaNome(formaId));
    // Filtro responsável: Leo ou Pri inclui "Leo & Pri" com valor ÷2; "Leo & Pri" mostra valor inteiro
    if(resp){
      if(resp === 'Leo & Pri'){
        data = data.filter(c => c.resp === 'Leo & Pri');
      } else {
        data = data
          .filter(c => c.resp === resp || c.resp === 'Leo & Pri')
          .map(c => {
            if(c.resp === 'Leo & Pri'){
              const ef = vEfetivo(c);
              return {...c, vPagar: ef/2, vPago: c.vPago>0 ? c.vPago/2 : null, _split: true};
            }
            return c;
          });
      }
    }

    const tP    = data.reduce((s,c)=>s+vEfetivo(c),0);
    const tPg   = data.reduce((s,c)=>s+(c.vPago||0),0);
    const tPend = data.reduce((s,c)=>s+(c.vPago>0?0:vEfetivo(c)),0);

    document.getElementById('relKpis').innerHTML=[
      {label:'Qtd. Contas',val:data.length,c:'var(--blue)'},
      {label:'Total a Pagar',val:fmt(tP),c:'var(--red)'},
      {label:'Total Pago',val:fmt(tPg),c:'var(--palm)'},
      {label:'Pendente',val:fmt(tPend),c:'var(--yellow)'},
    ].map(k=>`<div class="rel-kpi"><label>${k.label}</label><div class="val" style="color:${k.c}">${k.val}</div></div>`).join('');

    // Ordenação
    data = this._aplicarSort(data,'sortRel');

    document.getElementById('tbodyRel').innerHTML=data.map((c,i)=>{
      const ef=vEfetivo(c); const pend=c.vPago>0?0:ef; const atr=isOverdue(c);
      const catNome=CACHE.resolveCat(c.catId||c.cat); const formaNome=CACHE.resolveForma(c.formaId||c.forma);
      const splitBadge=c._split?'<span class="badge" style="background:var(--yellow-lt);color:var(--yellow);font-size:9px;margin-left:4px">÷2</span>':'';
      return`<tr class="mob-card">
        <td data-label="#" style="color:var(--t4)">${i+1}</td>
        <td data-label="Descrição" style="max-width:140px;white-space:normal">${c.conta}${splitBadge}</td>
        <td data-label="Resp.">${c.resp}</td>
        <td data-label="Forma" style="font-size:11px;color:var(--t3)">${formaNome}</td>
        <td data-label="Categoria">${catNome}</td>
        <td data-label="A Pagar" class="money neg">${fmt(ef)}</td>
        <td data-label="Pago" class="money ${c.vPago>0?'pos':'dim'}">${c.vPago>0?fmt(c.vPago):'—'}</td>
        <td data-label="Pendente" class="money ${pend>0?(atr?'atr':'neg'):'dim'}">${pend>0?fmt(pend):'—'}</td>
        <td data-label="Vencimento" style="${atr?'color:var(--orange);font-weight:600':''}">${fmtDate(c.data)}</td>
        <td data-label="Parcela" class="col-hide" style="font-size:10.5px;color:var(--t4)">${c.parcela||'—'}</td>
        <td data-label="Por" class="col-hide">${c.updatedBy||c.createdBy?`<span class="audit-chip">${c.updatedBy||c.createdBy}</span>`:''}</td>
        <td data-label="Nota" style="font-size:10.5px;color:var(--t4);max-width:100px;white-space:normal">${c.nota||'—'}</td>
      </tr>`;
    }).join('')||`<tr><td colspan="12" style="padding:0;border:none"><div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">Nenhum dado para este filtro</div><div class="empty-sub">Tente ajustar os filtros de período, categoria ou responsável.</div></div></td></tr>`;

    // Pareto do Relatório — respeita o toggle
    if(document.getElementById('chkParetoRel')?.checked !== false){
      this.renderPareto('canvasParetoRel','paretoTableRel', data);
    }
  },

  exportCSV(){
    const anoVal  = document.getElementById('relAno').value;
    const mesVal  = document.getElementById('relMes').value;
    const todosAnos  = anoVal==='todos';
    const todosMeses = mesVal==='todos';
    let data = CACHE.contas;
    if(!todosAnos)  data = data.filter(c=>new Date(c.data+'T12:00').getFullYear()===parseInt(anoVal));
    if(!todosMeses) data = data.filter(c=>new Date(c.data+'T12:00').getMonth()===parseInt(mesVal));
    const hdr=['#','Descrição','Responsável','Forma','Categoria','A Pagar','Pago','Pendente','Vencimento','Parcela','Por','Nota'];
    const rows=data.map((c,i)=>[i+1,`"${c.conta}"`,c.resp,CACHE.resolveForma(c.formaId||c.forma),CACHE.resolveCat(c.catId||c.cat),vEfetivo(c),(c.vPago||0),(c.vPago>0?0:vEfetivo(c)),c.data,(c.parcela||''),(c.updatedBy||c.createdBy||''),`"${c.nota||''}"`]);
    const csv=[hdr,...rows].map(r=>r.join(';')).join('\n');
    const label=todosMeses?(todosAnos?'completo':'ano_'+anoVal):MESES[parseInt(mesVal)]+'_'+anoVal;
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
    a.download=`duetto_${label}.csv`;a.click();
    this.toast('CSV exportado ⬇','success');
  },

  exportCSVContas(){
    const ano=document.getElementById('filtroAnoContas').value;
    const mes=document.getElementById('filtroMesContas').value;
    const data=CACHE.getByAnoMes(ano,mes);
    const hdr=['#','Descrição','Responsável','Forma','Categoria','A Pagar','Pago','Pendente','Vencimento','Parcela','Por','Nota'];
    const rows=data.map((c,i)=>[i+1,`"${c.conta}"`,c.resp,CACHE.resolveForma(c.formaId||c.forma),CACHE.resolveCat(c.catId||c.cat),c.vPagar,(c.vPago||0),(c.vPago>=c.vPagar?0:c.vPagar-(c.vPago||0)),c.data,(c.parcela||''),(c.updatedBy||c.createdBy||''),`"${c.nota||''}"`]);
    const csv=[hdr,...rows].map(r=>r.join(';')).join('\n');
    const label=mes==='todos'?(ano==='todos'?'todos':'ano_'+ano):`${MESES[parseInt(mes)]}_${ano}`;
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
    a.download=`duetto_contas_${label}.csv`;a.click();
    this.toast('CSV exportado ⬇','success');
  },

  // ── MODAL CONTA ──
  populateContaSelects(selectedCatId='',selectedFormaId=''){
    const fCat=document.getElementById('fCat');const fForma=document.getElementById('fForma');
    fCat.innerHTML='<option value="">Selecione...</option>';fForma.innerHTML='<option value="">Selecione...</option>';
    CACHE.getAllCats().forEach(c=>{const o=new Option(c.nome,c.id);if(c.id===selectedCatId||c.nome===selectedCatId)o.selected=true;fCat.appendChild(o);});
    CACHE.getAllFormas().forEach(f=>{const o=new Option(f.nome,f.id);if(f.id===selectedFormaId||f.nome===selectedFormaId)o.selected=true;fForma.appendChild(o);});
  },

  openConta(id=null){
    STATE.editContaId=id;
    document.getElementById('titleConta').textContent=id?'Editar Conta':'Nova Conta';
    this.clearConta();this.populateContaSelects();
    if(id){
      const c=CACHE.contas.find(x=>x.id===id);
      if(c){
        document.getElementById('fDesc').value=c.conta;document.getElementById('fNota').value=c.nota||'';
        document.getElementById('fResp').value=c.resp;document.getElementById('fData').value=c.data;
        document.getElementById('fVP').value=c.vPagar;document.getElementById('fParc').value=c.parcela||'';
        const fRec=document.getElementById('fRecorrente');if(fRec)fRec.checked=!!c.recorrente;
        this.populateContaSelects(c.catId||c.cat,c.formaId||c.forma);this.calcTotal();
      }
    }
    document.getElementById('ovConta').classList.add('open');
    setTimeout(()=>document.getElementById('fDesc').focus(),100);
  },

  clearConta(){
    ['fDesc','fNota','fResp','fForma','fCat','fData','fVP','fParc'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.getElementById('fQP').value=1;document.getElementById('fVT').value='';
    const fRec=document.getElementById('fRecorrente');if(fRec)fRec.checked=false;
  },
  calcTotal(){ const v=parseFloat(document.getElementById('fVP').value)||0;const q=parseInt(document.getElementById('fQP').value)||1;document.getElementById('fVT').value=(v*q).toFixed(2); },

  async saveConta(){
    const btn=document.getElementById('btnSalvarConta');
    if(btn) btn.classList.add('loading');
    try{
    const catId=document.getElementById('fCat').value;const formaId=document.getElementById('fForma').value;
    const recorrente=document.getElementById('fRecorrente')?.checked||false;
    const c={conta:document.getElementById('fDesc').value.trim(),nota:document.getElementById('fNota').value.trim(),resp:document.getElementById('fResp').value,formaId,catId,data:document.getElementById('fData').value,vPagar:parseFloat(document.getElementById('fVP').value)||0,vPago:null,parcela:document.getElementById('fParc').value.trim(),recorrente,createdBy:STATE.usuario};
    if(!c.conta){this.toast('Descrição é obrigatória','error');return;}
    if(!c.resp){this.toast('Selecione o responsável','error');return;}
    if(!catId){this.toast('Selecione a categoria','error');return;}
    if(!formaId){this.toast('Selecione a forma de pagamento','error');return;}
    if(!c.data){this.toast('Informe a data','error');return;}
    if(!c.vPagar){this.toast('Informe o valor','error');return;}

    if(STATE.editContaId){
      await FS.updateConta(STATE.editContaId,{...c,updatedBy:STATE.usuario});
      this.toast('Conta atualizada ✅','success');
    } else {
      const qt=parseInt(document.getElementById('fQP').value)||1;
      const grupo=`grp-${Date.now()}`;
      if(qt>1){
        const base=new Date(c.data+'T12:00');const proms=[];
        for(let i=0;i<qt;i++){const d=new Date(base);d.setMonth(d.getMonth()+i);proms.push(FS.addConta({...c,data:d.toISOString().split('T')[0],parcela:`${i+1} de ${qt}`,grupo}));}
        await Promise.all(proms);
      } else {
        if(!c.parcela)c.parcela='1 de 1';
        await FS.addConta({...c,grupo});
      }
      this.toast('Conta cadastrada ✅','success');
    }
    APP.closeModal('ovConta');STATE.editContaId=null;
    }finally{ if(btn) btn.classList.remove('loading'); }
  },

  // ── RECEITA MODAL ──
  openReceita(){
    ['rDesc','rValor'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    const rResp=document.getElementById('rResp');if(rResp)rResp.value='';
    const rMesIni=document.getElementById('rMesIni');if(rMesIni)rMesIni.value='-1';
    const rMesFim=document.getElementById('rMesFim');if(rMesFim)rMesFim.value='-1';
    this.rAtualizarPeriodoInfo();
    document.getElementById('ovReceita').classList.add('open');
    setTimeout(()=>document.getElementById('rDesc').focus(),100);
  },
  rAtualizarPeriodoInfo(){
    const ini=parseInt(document.getElementById('rMesIni')?.value??'-1');
    const fim=parseInt(document.getElementById('rMesFim')?.value??'-1');
    const el=document.getElementById('rPeriodoInfo');if(!el)return;
    const MN=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    if(ini===-1) el.textContent='O valor será aplicado em todos os meses (Jan–Dez).';
    else if(fim===-1||fim===ini) el.textContent=`O valor será aplicado somente em ${MN[ini]}.`;
    else if(fim<ini) el.textContent='⚠️ Mês final deve ser igual ou posterior ao inicial.';
    else el.textContent=`O valor será aplicado de ${MN[ini]} a ${MN[fim]} (${fim-ini+1} meses).`;
  },
  async saveReceita(){
    const desc=document.getElementById('rDesc').value.trim();
    const resp=document.getElementById('rResp').value;
    const val=parseFloat(document.getElementById('rValor').value)||0;
    const ini=parseInt(document.getElementById('rMesIni')?.value??'-1');
    const fim=parseInt(document.getElementById('rMesFim')?.value??'-1');
    if(!desc)return this.toast('Informe a descrição','error');
    if(ini!==-1&&fim!==-1&&fim<ini)return this.toast('Mês final deve ser igual ou posterior ao inicial','error');
    const valores=Array(12).fill(0);
    if(ini===-1){ valores.fill(val); }
    else{ const mesF=(fim===-1||fim<ini)?ini:fim; for(let m=ini;m<=mesF;m++)valores[m]=val; }
    await FS.addOutra({desc,resp,valores,createdBy:STATE.usuario,createdAt:today()});
    APP.closeModal('ovReceita');
    this.toast(`"${desc}" criada ✅`,'success');
  },

  // ── GERENCIAR CATS / FORMAS ──
  openGerenciar(tipo){
    STATE.gerenciarTipo=tipo;
    document.getElementById('titleGerenciar').textContent=tipo==='cat'?'Gerenciar Categorias':'Gerenciar Formas de Pagamento';
    document.getElementById('gNovoNome').value='';
    this.renderGerenciarLista();
    document.getElementById('ovGerenciar').classList.add('open');
    setTimeout(()=>document.getElementById('gNovoNome').focus(),100);
  },

  renderGerenciarLista(){
    const tipo=STATE.gerenciarTipo;
    const itens=tipo==='cat'?CACHE.getAllCats():CACHE.getAllFormas();
    document.getElementById('gerenciarLista').innerHTML=itens.length===0
      ?'<div style="padding:20px;text-align:center;color:var(--t4);font-size:13px">Nenhum item cadastrado</div>'
      :itens.map(item=>`<div id="gitem-${item.id}" style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border)"><span class="badge bg-cat" style="font-size:10px;flex-shrink:0">${tipo==='cat'?'CAT':'PGTO'}</span><span id="gnome-${item.id}" style="flex:1;font-size:13px;color:var(--t1)">${item.nome}</span><input id="gedit-${item.id}" type="text" value="${item.nome}" style="display:none;flex:1;padding:5px 9px;border:1px solid var(--palm);border-radius:5px;font-size:12.5px;outline:none;font-family:var(--font-b)" onkeydown="if(event.key==='Enter')APP.gerenciarSalvar('${item.id}');if(event.key==='Escape')APP.gerenciarCancelarEdit('${item.id}')"><div id="gbtn-view-${item.id}" style="display:flex;gap:5px"><button class="action-btn edit" onclick="APP.gerenciarEditar('${item.id}')">✏</button><button class="action-btn del" onclick="APP.gerenciarExcluir('${item.id}')">✕</button></div><div id="gbtn-edit-${item.id}" style="display:none;gap:5px"><button class="btn btn-primary btn-sm" onclick="APP.gerenciarSalvar('${item.id}')">✓ Salvar</button><button class="btn btn-ghost btn-sm" onclick="APP.gerenciarCancelarEdit('${item.id}')">Cancelar</button></div></div>`).join('');
  },

  async gerenciarAdicionar(){
    const nome=document.getElementById('gNovoNome').value.trim();if(!nome)return this.toast('Digite um nome','error');
    const tipo=STATE.gerenciarTipo;
    const itens=tipo==='cat'?CACHE.getAllCats():CACHE.getAllFormas();
    if(itens.some(x=>x.nome.toLowerCase()===nome.toLowerCase()))return this.toast('Nome já existe','error');
    tipo==='cat'?await FS.addCat(nome):await FS.addForma(nome);
    document.getElementById('gNovoNome').value='';
    this.toast(`"${nome}" adicionado ✅`,'success');
  },

  gerenciarEditar(id){
    document.getElementById(`gnome-${id}`).style.display='none';document.getElementById(`gbtn-view-${id}`).style.display='none';
    document.getElementById(`gedit-${id}`).style.display='block';document.getElementById(`gbtn-edit-${id}`).style.display='flex';
    document.getElementById(`gedit-${id}`).focus();document.getElementById(`gedit-${id}`).select();
  },

  gerenciarCancelarEdit(id){
    const tipo=STATE.gerenciarTipo;const item=(tipo==='cat'?CACHE.getAllCats():CACHE.getAllFormas()).find(x=>x.id===id);
    if(item)document.getElementById(`gedit-${id}`).value=item.nome;
    document.getElementById(`gnome-${id}`).style.display='';document.getElementById(`gbtn-view-${id}`).style.display='flex';
    document.getElementById(`gedit-${id}`).style.display='none';document.getElementById(`gbtn-edit-${id}`).style.display='none';
  },

  async gerenciarSalvar(id){
    const novoNome=document.getElementById(`gedit-${id}`)?.value.trim();if(!novoNome)return this.toast('Nome não pode ser vazio','error');
    const tipo=STATE.gerenciarTipo;
    tipo==='cat'?await FS.updateCat(id,novoNome):await FS.updateForma(id,novoNome);
    this.toast('Nome atualizado ✅','success');
  },

  async gerenciarExcluir(id){
    const tipo=STATE.gerenciarTipo;const item=(tipo==='cat'?CACHE.getAllCats():CACHE.getAllFormas()).find(x=>x.id===id);if(!item)return;
    const emUso=CACHE.contas.some(c=>tipo==='cat'?c.catId===id:c.formaId===id);
    if(emUso){this.toast(`❌ "${item.nome}" está em uso e não pode ser excluída.`,'error');return;}
    if(!confirm(`Excluir "${item.nome}"?`))return;
    tipo==='cat'?await FS.deleteCat(id):await FS.deleteForma(id);
    this.toast(`"${item.nome}" excluído`,'success');
  }
};

// ── Upload Cards: extraído para js/upload.js ──
// ── Backup Module: extraído para js/backup.js ──

