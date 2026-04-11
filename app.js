// ============================================================
// DUETTO FINANCEIRO — Firebase Integration
// ============================================================

// ── CONFIGURAÇÃO FIREBASE ──
const FB_CONFIG = {
  apiKey:            "AIzaSyAq74uNulXvgJBF1R2j-obAS9mFIR-42IM",
  authDomain:        "duetto-financeiro.firebaseapp.com",
  projectId:         "duetto-financeiro",
  storageBucket:     "duetto-financeiro.firebasestorage.app",
  messagingSenderId: "891169172213",
  appId:             "1:891169172213:web:69a746240d17a6bb2673bc"
};

const ALLOWED_EMAILS = ['leonardo.phn7@gmail.com', 'pri.alverim@gmail.com'];

firebase.initializeApp(FB_CONFIG);
const fbAuth = firebase.auth();
const fbDb   = firebase.firestore();

// ── HELPERS ──
const MESES   = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_F = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const COLORS  = ['#006437','#00a85a','#d97706','#dc2626','#2563eb','#7c3aed','#0891b2','#ea580c','#65a30d','#64748b'];
const fmt     = v => v==null||isNaN(v)?'—':'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtN    = v => v==null||isNaN(v)?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtDate = s => { if(!s)return'—'; const d=new Date(s+'T12:00'); return d.toLocaleDateString('pt-BR'); };
const today   = () => new Date().toISOString().split('T')[0];
const isOverdue = c => !!(c.data < today() && !(c.vPago > 0));
// Valor efetivo: se foi pago, o valor real pago é o que vale (pode ter multa ou desconto)
const vEfetivo  = c => c.vPago > 0 ? c.vPago : c.vPagar;

// ── CACHE LOCAL (espelho do Firestore para acesso síncrono) ──
const CACHE = {
  contas:   [],
  salarios: [],
  outras:   [],
  cats:     [],
  formas:   [],
  tabelas:  null,
  _ready:   new Set(),
  markReady(key){ this._ready.add(key); if(this._ready.size>=5) APP.onCacheReady(); },
  resolveCat(val){  if(!val)return'—'; const c=this.cats.find(x=>x.id===val||x.nome===val); return c?c.nome:val; },
  resolveForma(val){ if(!val)return'—'; const f=this.formas.find(x=>x.id===val||x.nome===val); return f?f.nome:val; },
  getCatNome(id){ const c=this.cats.find(x=>x.id===id); return c?c.nome:(id||'—'); },
  getFormaNome(id){ const f=this.formas.find(x=>x.id===id); return f?f.nome:(id||'—'); },
  getAllCats(){ return [...this.cats].sort((a,b)=>a.nome.localeCompare(b.nome,'pt')); },
  getAllFormas(){ return [...this.formas].sort((a,b)=>a.nome.localeCompare(b.nome,'pt')); },
  getByMes(mes){ return this.contas.filter(c=>new Date(c.data+'T12:00').getMonth()===mes); },
  getByAnoMes(ano,mes){
    return this.contas.filter(c=>{
      const d=new Date(c.data+'T12:00');
      if(ano!=='todos'&&d.getFullYear()!==parseInt(ano))return false;
      if(mes!=='todos'&&d.getMonth()!==parseInt(mes))return false;
      return true;
    });
  },
  getOverdue(){ return this.contas.filter(isOverdue); },
  getByGrupo(grupo){ return this.contas.filter(c=>c.grupo===grupo).sort((a,b)=>a.data.localeCompare(b.data)); },
  getContasFiltradas(mes, resp){
    const all = mes===null ? [...this.contas] : this.getByMes(mes);
    if(!resp) return all.map(c=>({...c}));
    if(resp === 'Leo & Pri') return all.filter(c=>c.resp==='Leo & Pri').map(c=>({...c}));
    // Leo ou Pri: inclui compartilhadas com valor ÷2
    return all.filter(c=>c.resp===resp||c.resp==='Leo & Pri').map(c=>{
      if(c.resp==='Leo & Pri'){
        const ef=vEfetivo(c);
        return{...c,vPagar:ef/2,vPago:c.vPago>0?c.vPago/2:null,_split:true};
      }
      return{...c};
    });
  },
  getTotalByMes(){
    const t=Array(12).fill(0);
    this.contas.forEach(c=>{ const m=new Date(c.data+'T12:00').getMonth(); if(m>=0&&m<12)t[m]+=c.vPagar; });
    return t;
  },
  getSalarioMes(sal,mes){
    const v=sal.historico.filter(h=>h.mesInicio<=mes).sort((a,b)=>b.mesInicio-a.mesInicio);
    return v[0]||sal.historico[0];
  },
  getReceitas(){
    return Array.from({length:12},(_,m)=>{
      let t=0;
      this.salarios.forEach(s=>{ const h=this.getSalarioMes(s,m); t+=h?h.liquido:0; });
      this.outras.forEach(r=>t+=r.valores[m]||0);
      return t;
    });
  },
  calcINSS(sal){
    if(!this.tabelas)return 0;
    let r=0;
    for(const f of this.tabelas.inss){ if(sal<=f.de)break; r+=(Math.min(sal,f.ate)-f.de)*f.al; }
    return Math.min(parseFloat(r.toFixed(2)),this.tabelas.tetoINSS||908.86);
  },
  calcIR(sal,inss,deps){
    if(!this.tabelas)return 0;
    const base=sal-inss-(deps*(this.tabelas.dedDep||189.59));
    if(base<=0)return 0;
    for(const f of [...this.tabelas.ir].reverse()){
      if(base>f.de)return parseFloat(Math.max(0,base*f.al-f.ded).toFixed(2));
    }
    return 0;
  }
};

// ── DEFAULTS ──
const DEFAULT_TABELAS = {
  ir:[{de:0,ate:2259.20,al:0,ded:0},{de:2259.21,ate:2826.65,al:.075,ded:169.44},{de:2826.66,ate:3751.06,al:.15,ded:381.44},{de:3751.07,ate:4664.68,al:.225,ded:662.77},{de:4664.69,ate:null,al:.275,ded:896.00}],
  inss:[{de:0,ate:1518,al:.075,ded:0},{de:1518.01,ate:2793.88,al:.09,ded:22.77},{de:2793.89,ate:4190.83,al:.12,ded:106.59},{de:4190.84,ate:8157.41,al:.14,ded:190.40}],
  dedDep:189.59,tetoINSS:908.86,vigencia:'2024/2025'
};
const SEED_CATS = ['Alimentação','Aposta','Barbearia','Calçado','Carro','Casa','Combustível','Contrato','Cursos','Custo com trabalho','Empréstimo','Escola','Estudos','Faculdade','Farmácia','Games','Igreja','Internet','Lanche','Negociação','Outros','Pet','Pós-Graduação','Presente','Restaurante','Roupa','Salão','Saúde','Streamer','Telefone'];
const SEED_FORMAS = ['Automático','Boleto','Cartão Banescard Chica','Cartão flash','Cartão iFood','Cartão Itaú black','Cartão Itaú signature','Cartão Nubank','Débito','Dinheiro','PIX','Transferência'];

// ── ESTADO ──
const STATE = {
  page:'dashboard', pg:1, pgSz:20,
  dashResp:'', editContaId:null, editSalPessoa:null,
  charts:{}, recEditando:false, parcGrupo:null, gerenciarTipo:'cat',
  usuario:'', filtroAno:String(new Date().getFullYear()), filtroMes:String(new Date().getMonth()),
};

// ============================================================
// AUTH
// ============================================================
const AUTH = {
  signInGoogle(){
    const btn = document.getElementById('btnGoogle');
    btn.disabled = true;
    btn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid #ccc;border-top-color:#006437;border-radius:50%;animation:spin .7s linear infinite"></span> Entrando...';
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    fbAuth.signInWithPopup(provider)
      .then(()=>{ /* onAuthStateChanged cuida do resto */ })
      .catch(err=>{
        btn.disabled = false;
        btn.innerHTML = iconGoogle + ' Entrar com Google';
        // Popup fechado pelo usuário — não mostrar erro
        if(['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(err.code)) return;
        // Fallback para redirect em browsers que bloqueiam popup
        if(err.code === 'auth/popup-blocked'){
          fbAuth.signInWithRedirect(provider);
          return;
        }
        alert('Erro ao entrar: ' + err.message);
      });
  },
  signOut(){
    if(!confirm('Sair do Duetto Financeiro?')) return;
    fbAuth.signOut();
  }
};

const iconGoogle = '<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

// Captura resultado de redirect caso tenha sido usado como fallback
fbAuth.getRedirectResult().catch(()=>{});

// ============================================================
// FIRESTORE OPERATIONS
// ============================================================
const FS = {
  // ── CONTAS ──
  async addConta(data){ const ref=await fbDb.collection('contas').add({...data,createdAt:firebase.firestore.FieldValue.serverTimestamp()}); return ref.id; },
  async updateConta(id,data){ await fbDb.collection('contas').doc(id).update({...data,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); },
  async deleteConta(id){ await fbDb.collection('contas').doc(id).delete(); },
  async pagarConta(id, quem, valorPago){
    await fbDb.collection('contas').doc(id).update({
      vPago:  valorPago,
      vPagar: valorPago, // valor pago vira o valor definitivo — cálculos ficam consistentes
      paidBy: quem,
      paidAt: today(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  // ── SALÁRIOS ──
  async saveSalario(id,data){ await fbDb.collection('salarios').doc(id).set(data,{merge:true}); },
  async deleteSalario(id){ await fbDb.collection('salarios').doc(id).delete(); },

  // ── OUTRAS RECEITAS ──
  async addOutra(data){ await fbDb.collection('outras_receitas').add({...data,createdAt:firebase.firestore.FieldValue.serverTimestamp()}); },
  async updateOutra(id,data){ await fbDb.collection('outras_receitas').doc(id).update(data); },
  async deleteOutra(id){ await fbDb.collection('outras_receitas').doc(id).delete(); },

  // ── CATEGORIAS ──
  async addCat(nome){ const ref=await fbDb.collection('categorias').add({nome}); return ref.id; },
  async updateCat(id,nome){ await fbDb.collection('categorias').doc(id).update({nome}); },
  async deleteCat(id){ await fbDb.collection('categorias').doc(id).delete(); },

  // ── FORMAS ──
  async addForma(nome){ const ref=await fbDb.collection('formas').add({nome}); return ref.id; },
  async updateForma(id,nome){ await fbDb.collection('formas').doc(id).update({nome}); },
  async deleteForma(id){ await fbDb.collection('formas').doc(id).delete(); },

  // ── TABELAS ──
  async saveTabelas(data){ await fbDb.collection('config').doc('tabelas').set(data); }
};

// ── LISTENERS TEMPO REAL ──
const listeners = [];
function setupListeners(){
  listeners.push(
    fbDb.collection('contas').onSnapshot(snap=>{
      CACHE.contas=snap.docs.map(d=>({id:d.id,...d.data()}));
      CACHE.markReady('contas');
      if(CACHE._ready.has('_appShown')) APP.renderPage(STATE.page);
    }),
    fbDb.collection('salarios').onSnapshot(snap=>{
      CACHE.salarios=snap.docs.map(d=>({id:d.id,...d.data()}));
      CACHE.markReady('salarios');
      if(CACHE._ready.has('_appShown')) APP.renderPage(STATE.page);
    }),
    fbDb.collection('outras_receitas').onSnapshot(snap=>{
      CACHE.outras=snap.docs.map(d=>({id:d.id,...d.data()}));
      CACHE.markReady('outras');
      if(CACHE._ready.has('_appShown')) APP.renderPage(STATE.page);
    }),
    fbDb.collection('categorias').onSnapshot(snap=>{
      CACHE.cats=snap.docs.map(d=>({id:d.id,...d.data()}));
      CACHE.markReady('cats');
      if(CACHE._ready.has('_appShown')){
        if(STATE.page==='contas') APP.renderContas();
        // Atualiza lista do modal se estiver aberto em categorias
        const ov=document.getElementById('ovGerenciar');
        if(ov&&ov.classList.contains('open')&&STATE.gerenciarTipo==='cat') APP.renderGerenciarLista();
      }
    }),
    fbDb.collection('formas').onSnapshot(snap=>{
      CACHE.formas=snap.docs.map(d=>({id:d.id,...d.data()}));
      CACHE.markReady('formas');
      // Atualiza lista do modal se estiver aberto em formas
      const ov=document.getElementById('ovGerenciar');
      if(ov&&ov.classList.contains('open')&&STATE.gerenciarTipo==='forma') APP.renderGerenciarLista();
    }),
    fbDb.collection('config').doc('tabelas').onSnapshot(snap=>{
      CACHE.tabelas=snap.exists?snap.data():DEFAULT_TABELAS;
    })
  );
}

// ── SEED INICIAL (banco vazio) ──
async function seedIfEmpty(){
  const [cats,formas] = await Promise.all([
    fbDb.collection('categorias').limit(1).get(),
    fbDb.collection('formas').limit(1).get()
  ]);
  const batch = fbDb.batch();
  if(cats.empty){
    SEED_CATS.forEach(nome=>batch.set(fbDb.collection('categorias').doc(),{nome}));
  }
  if(formas.empty){
    SEED_FORMAS.forEach(nome=>batch.set(fbDb.collection('formas').doc(),{nome}));
  }
  const tabSnap = await fbDb.collection('config').doc('tabelas').get();
  if(!tabSnap.exists){
    batch.set(fbDb.collection('config').doc('tabelas'),DEFAULT_TABELAS);
  }
  await batch.commit();
}

// ============================================================
// AUTH STATE OBSERVER
// ============================================================
fbAuth.onAuthStateChanged(async user => {
  if(!user){
    show('screenLogin');
    document.getElementById('loadingMsg').textContent='Conectando...';
    return;
  }
  if(!ALLOWED_EMAILS.includes(user.email)){
    document.getElementById('deniedEmail').textContent=user.email;
    show('screenDenied');
    return;
  }
  // Autorizado
  STATE.usuario = user.email === 'leonardo.phn7@gmail.com' ? 'Leo' : 'Pri';
  document.getElementById('loadingMsg').textContent='Carregando dados...';
  show('screenLoading');
  await seedIfEmpty();
  setupListeners();
});

function show(screenId){
  ['screenLoading','screenLogin','screenDenied','screenApp'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display=(id===screenId?'flex':'none');
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
    this.boot();
  },

  boot(){
    this.nav(); this.topBtns(); this.modals(); this.selects(); this.filtros();
    this.restoreSidebarState();
    const chip=document.getElementById('sbUserChip');
    if(chip) chip.textContent='👤 '+STATE.usuario;
    this.renderPage('dashboard');
  },

  // ── SIDEBAR ──
  toggleSidebar(){
    const sb=document.getElementById('sidebar');
    const icon=document.getElementById('sbCollapseIcon');
    const collapsed=sb.classList.toggle('collapsed');
    localStorage.setItem('dt_sb_collapsed',collapsed?'1':'0');
    icon.innerHTML=collapsed
      ?'<polyline points="9 18 15 12 9 6"/>'
      :'<polyline points="15 18 9 12 15 6"/>';
  },
  restoreSidebarState(){
    if(localStorage.getItem('dt_sb_collapsed')==='1'){
      const sb=document.getElementById('sidebar');
      const icon=document.getElementById('sbCollapseIcon');
      sb.classList.add('collapsed');
      if(icon)icon.innerHTML='<polyline points="9 18 15 12 9 6"/>';
    }
  },

  // ── NAV ──
  nav(){
    document.querySelectorAll('.nav-item').forEach(el=>{
      el.addEventListener('click',e=>{
        e.preventDefault();
        document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
        el.classList.add('active');
        document.getElementById('pageTitle').textContent=(el.querySelector('span')||el).textContent.trim();
        ['btnAtualizarTabelas','btnNovoSalario','btnNovaReceita','btnCSVContas'].forEach(id=>document.getElementById(id).style.display='none');
        if(el.dataset.page==='salario'){document.getElementById('btnNovoSalario').style.display='flex';document.getElementById('btnAtualizarTabelas').style.display='flex';}
        if(el.dataset.page==='receitas')document.getElementById('btnNovaReceita').style.display='flex';
        if(el.dataset.page==='contas')document.getElementById('btnCSVContas').style.display='flex';
        document.getElementById('sidebar').classList.remove('open');
        this.renderPage(el.dataset.page);
      });
    });
    document.getElementById('menuToggle').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));
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
    document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.close).classList.remove('open')));
    document.querySelectorAll('.modal-overlay').forEach(ov=>ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('open');}));
    document.getElementById('btnLimparConta').addEventListener('click',()=>this.clearConta());
    document.getElementById('btnSalvarConta').addEventListener('click',()=>this.saveConta());
    document.getElementById('fVP').addEventListener('input',()=>this.calcTotal());
    document.getElementById('fQP').addEventListener('input',()=>this.calcTotal());
    document.getElementById('btnSalvarSal').addEventListener('click',()=>this.saveSalario());
    ['sSal','sBon','sDeps'].forEach(id=>document.getElementById(id).addEventListener('input',()=>this.calcSalario()));
    document.getElementById('btnSalvarReceita').addEventListener('click',()=>this.saveReceita());
    document.getElementById('btnBuscarOnline').addEventListener('click',()=>this.buscarTabelasOnline());
    document.getElementById('btnEditarManual').addEventListener('click',()=>{ document.getElementById('tabelasEditor').style.display='block'; document.getElementById('btnSalvarTabelas').style.display='flex'; });
    document.getElementById('btnSalvarTabelas').addEventListener('click',()=>this.salvarTabelas());
    const ms=document.getElementById('sMesInicio');
    MESES_F.forEach((m,i)=>ms.appendChild(new Option(m,i)));
    ms.value=new Date().getMonth();
  },

  selects(){
    const anoAtual = new Date().getFullYear();
    const mkAno = (id) => {
      const s=document.getElementById(id); if(!s)return;
      s.appendChild(new Option('Todos os anos','todos'));
      for(let a=2019;a<=2035;a++) s.appendChild(new Option(a,a));
      s.value = String(anoAtual);
    };

    // Filtros cat/forma
    CACHE.getAllCats().forEach(c=>{ ['filtroCatContas','relCat'].forEach(id=>{ const s=document.getElementById(id); if(s)s.appendChild(new Option(c.nome,c.nome)); }); });
    CACHE.getAllFormas().forEach(f=>{ const s=document.getElementById('relForma'); if(s)s.appendChild(new Option(f.nome,f.id)); });

    // Ano + Mês Dashboard
    mkAno('filtroAnoDash');
    const mDash=document.getElementById('filtroMesDash');
    mDash.appendChild(new Option('Todos os meses','todos'));
    MESES_F.forEach((m,i)=>mDash.appendChild(new Option(m,i)));
    mDash.value=String(new Date().getMonth());

    // Ano + Mês Contas
    mkAno('filtroAnoContas');
    const mContas=document.getElementById('filtroMesContas');
    mContas.appendChild(new Option('Todos os meses','todos'));
    MESES_F.forEach((m,i)=>mContas.appendChild(new Option(m,i)));
    mContas.value=String(new Date().getMonth());

    // Ano + Mês Relatório
    mkAno('relAno');
    const rMes=document.getElementById('relMes');
    rMes.appendChild(new Option('Todos os meses','todos'));
    MESES_F.forEach((m,i)=>rMes.appendChild(new Option(m,i)));
    rMes.value=String(new Date().getMonth());
  },

  filtros(){
    ['filtroAnoDash','filtroMesDash'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.addEventListener('change',()=>this.renderDashboard());
    });
    ['searchContas','filtroAnoContas','filtroMesContas','filtroRespContas','filtroCatContas','filtroStatus'].forEach(id=>{
      const el=document.getElementById(id);
      if(el)el.addEventListener('input',()=>{STATE.pg=1;this.renderContas();});
    });
    ['relAno','relMes','relCat','relForma','relResp'].forEach(id=>{
      const el=document.getElementById(id);
      if(el)el.addEventListener('change',()=>this.renderRelatorio());
    });
    document.getElementById('btnCSV').addEventListener('click',()=>this.exportCSV());
  },

  renderPage(p){
    STATE.page=p;
    document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
    const el=document.getElementById(`page-${p}`);
    if(el)el.classList.add('active');
    ({
      dashboard: ()=>this.renderDashboard(),
      contas:    ()=>this.renderContas(),
      receitas:  ()=>this.renderReceitas(),
      salario:   ()=>this.renderSalario(),
      relatorio: ()=>this.renderRelatorio(),
      upload:    ()=>this.upRenderHistorico(),
    })[p]?.();
  },

  mkChart(id,cfg){
    if(STATE.charts[id]){STATE.charts[id].destroy();delete STATE.charts[id];}
    const c=document.getElementById(id);if(!c)return;
    STATE.charts[id]=new Chart(c,cfg);return STATE.charts[id];
  },

  setRespDash(r){
    STATE.dashResp=r;
    document.querySelectorAll('#rc-todos,#rc-leo,#rc-pri').forEach(b=>{b.classList.remove('active');});
    const ids={'':'rc-todos','Leo':'rc-leo','Pri':'rc-pri'};
    document.getElementById(ids[r])?.classList.add('active');
    this.renderDashboard();
  },

  filtrarAtrasadas(){
    document.getElementById('filtroStatus').value='atrasado';
    document.getElementById('filtroMesContas').value='todos';
    document.getElementById('filtroAnoContas').value='todos';
    this.goPage('contas');STATE.pg=1;this.renderContas();
  },

  // ============================================================
  // DASHBOARD
  // ============================================================
  renderDashboard(){
    const anoVal = document.getElementById('filtroAnoDash').value;
    const mesVal = document.getElementById('filtroMesDash').value;
    const todosMeses = mesVal==='todos';
    const todosAnos  = anoVal==='todos';
    const mes  = todosMeses ? null : parseInt(mesVal);
    const ano  = todosAnos  ? null : parseInt(anoVal);
    const resp = STATE.dashResp;

    // Filtrar contas por ano e mês
    const filtrarContas = (all) => {
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
      {label:'Receita',val:fmt(recMes),sub:periodoLabel+(resp?` — ${resp}`:''),icon:'📈',c:'var(--palm)'},
      {label:'Total Despesas',val:fmt(totP),sub:`${contas.length} contas`,icon:'📋',c:'var(--blue)'},
      {label:'Pendente',val:fmt(totPend),sub:`${pendList.length} contas`,icon:'⏳',c:'var(--red)'},
      {label:'Saldo',val:fmt(saldo),sub:saldo>=0?'✅ Positivo':'⚠️ Atenção',icon:saldo>=0?'💰':'📉',c:saldo>=0?'var(--palm)':'var(--red)'}
    ];
    document.getElementById('kpiGrid').innerHTML=kpis.map(k=>`<div class="kpi-card" style="--kc:${k.c}"><div class="kpi-label">${k.label}</div><div class="kpi-value" style="color:${k.c}">${k.val}</div><div class="kpi-sub">${k.sub}</div><div class="kpi-icon">${k.icon}</div></div>`).join('');

    document.getElementById('pendentesCount').textContent=pendList.length;
    document.getElementById('tbodyPendentes').innerHTML=pendList.slice(0,8).map(c=>{
      const atr=isOverdue(c);const catNome=CACHE.resolveCat(c.catId||c.cat);
      return`<tr><td><strong>${c.conta}</strong>${c._split?'<span class="badge" style="background:var(--yellow-lt);color:var(--yellow);margin-left:5px;font-size:9px">÷2</span>':''}</td><td>${c.resp}</td><td>${catNome}</td><td style="${atr?'color:var(--orange);font-weight:600':''}">${fmtDate(c.data)}</td><td class="neg">${fmt(c.vPagar)}</td><td><span class="badge ${atr?'bg-atr':'bg-pend'}">${atr?'● Atrasado':'● Pendente'}</span></td></tr>`;
    }).join('')||'<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--t4)">Nenhuma pendência 🎉</td></tr>';

    this.chartCategoria(mes,resp);this.chartFluxo();
  },

  chartCategoria(mes,resp){
    let contas;
    if(mes===null){
      if(!resp) contas=[...CACHE.contas];
      else if(resp==='Leo & Pri') contas=CACHE.contas.filter(c=>c.resp==='Leo & Pri').map(c=>({...c}));
      else contas=CACHE.contas.filter(c=>c.resp===resp||c.resp==='Leo & Pri').map(c=>c.resp==='Leo & Pri'?{...c,vPagar:vEfetivo(c)/2}:{...c});
    } else {
      contas=CACHE.getContasFiltradas(mes,resp);
    }
    const map={};contas.forEach(c=>{const n=CACHE.resolveCat(c.catId||c.cat);map[n]=(map[n]||0)+vEfetivo(c);});
    const sorted=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,9);
    this.mkChart('canvasCategoria',{type:'doughnut',data:{labels:sorted.map(([k])=>k),datasets:[{data:sorted.map(([,v])=>v),backgroundColor:COLORS,borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#374151',font:{size:10},boxWidth:10,padding:8}},tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${fmt(ctx.raw)}`}}}}});
  },

  chartFluxo(){
    const resp=STATE.dashResp;
    const desp=CACHE.getTotalByMes();
    const despFilt=Array.from({length:12},(_,m)=>CACHE.getContasFiltradas(m,resp).reduce((s,c)=>s+c.vPagar,0));
    const rec=Array.from({length:12},(_,m)=>{
      let t=0;
      CACHE.salarios.forEach(s=>{if(!resp||s.pessoa===resp){const h=CACHE.getSalarioMes(s,m);t+=h?h.liquido:0;}});
      CACHE.outras.forEach(r=>{const v=r.valores[m]||0;if(!resp)t+=v;else if(r.resp===resp)t+=v;else if(!r.resp||r.resp==='Ambos')t+=v/2;});
      return t;
    });
    this.mkChart('canvasFluxo',{type:'bar',data:{labels:MESES,datasets:[{label:'Receita',data:rec,backgroundColor:'rgba(0,100,55,.15)',borderColor:'#006437',borderWidth:2,borderRadius:4},{label:'Despesas',data:resp?despFilt:desp,backgroundColor:'rgba(220,38,38,.12)',borderColor:'#dc2626',borderWidth:2,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#374151',font:{size:10}}},tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.raw)}`}}},scales:{x:{ticks:{color:'#9ca3af',font:{size:10}},grid:{color:'rgba(0,0,0,.04)'}},y:{ticks:{color:'#9ca3af',font:{size:10},callback:v=>`R$${(v/1000).toFixed(0)}k`},grid:{color:'rgba(0,0,0,.04)'}}}}});
  },

  // ============================================================
  // CONTAS
  // ============================================================
  renderContas(){
    const search=document.getElementById('searchContas').value.toLowerCase();
    const ano=document.getElementById('filtroAnoContas').value;
    const mes=document.getElementById('filtroMesContas').value;
    const resp=document.getElementById('filtroRespContas').value;
    const cat=document.getElementById('filtroCatContas').value;
    const status=document.getElementById('filtroStatus').value;

    let data = CACHE.getByAnoMes(ano,mes);
    if(search) data = data.filter(c=>c.conta.toLowerCase().includes(search));
    if(resp)   data = data.filter(c=>c.resp===resp);
    if(cat)data=data.filter(c=>CACHE.resolveCat(c.catId||c.cat)===cat);
    if(status==='pago')    data=data.filter(c=>c.vPago>0);
    else if(status==='pendente') data=data.filter(c=>!(c.vPago>0)); // inclui atrasadas
    else if(status==='atrasado') data=data.filter(isOverdue);

    document.getElementById('totalGeral').textContent    = fmt(data.reduce((s,c)=>s+vEfetivo(c),0));
    document.getElementById('totalPago').textContent     = fmt(data.reduce((s,c)=>s+(c.vPago||0),0));
    document.getElementById('totalPendente').textContent = fmt(data.reduce((s,c)=>s+(c.vPago>0?0:vEfetivo(c)),0));

    const atrasadas=CACHE.getOverdue();
    const alertEl=document.getElementById('overdueAlert');
    if(atrasadas.length>0){alertEl.style.display='block';alertEl.innerHTML=`⚠️ <strong>${atrasadas.length} conta${atrasadas.length>1?'s':''} em atraso</strong> — Clique para filtrar`;}
    else alertEl.style.display='none';

    document.getElementById('contasInfo').textContent=`${data.length} conta${data.length!==1?'s':''} encontrada${data.length!==1?'s':''}`;

    const totalPg=Math.max(1,Math.ceil(data.length/STATE.pgSz));
    if(STATE.pg>totalPg)STATE.pg=1;
    const start=(STATE.pg-1)*STATE.pgSz;
    const paged=data.slice(start,start+STATE.pgSz);

    document.getElementById('tbodyContas').innerHTML=paged.map((c,i)=>{
      const pago=c.vPago>0; const atr=isOverdue(c); const ef=vEfetivo(c); const pend=pago?0:ef;
      const catNome=CACHE.resolveCat(c.catId||c.cat);const formaNome=CACHE.resolveForma(c.formaId||c.forma);
      const auditBy=c.updatedBy||c.createdBy||'';
      const hasGrupo=c.grupo&&CACHE.getByGrupo(c.grupo).length>1;
      return`<tr style="${atr?'background:rgba(234,88,12,.04)':''}">
        <td style="color:var(--t4);font-size:10.5px">${start+i+1}</td>
        <td style="max-width:180px"><div style="font-weight:600;color:var(--t1);line-height:1.3;white-space:normal">${c.conta}</div>${c.nota?`<div style="font-size:10px;color:var(--t4);margin-top:1px">${c.nota}</div>`:''}</td>
        <td>${c.resp}</td><td style="font-size:11px;color:var(--t3)">${formaNome}</td>
        <td><span class="badge bg-cat">${catNome}</span></td>
        <td class="neg">${fmt(ef)}</td>
        <td class="${pago?'pos':'dim'}">${pago?fmt(c.vPago):'—'}</td>
        <td class="${pend>0?(atr?'atr':'neg'):'dim'}">${pend>0?fmt(pend):'—'}</td>
        <td style="${atr?'color:var(--orange);font-weight:600':''}">${fmtDate(c.data)}</td>
        <td style="font-size:10.5px;color:var(--t4)">${c.parcela||'—'}</td>
        <td>${auditBy?`<span class="audit-chip">${auditBy}</span>`:''}</td>
        <td style="white-space:nowrap">
          <button class="action-btn edit" title="Editar" onclick="APP.openConta('${c.id}')">✏</button>
          ${!pago?`<button class="action-btn pay" title="Pagar" onclick="APP.marcarPago('${c.id}')">✓</button>`:''}
          ${hasGrupo?`<button class="action-btn parcs" title="Parcelamento" onclick="APP.openParcelas('${c.grupo}')">≡</button>`:''}
          <button class="action-btn del" title="Excluir" onclick="APP.deleteConta('${c.id}')">✕</button>
        </td></tr>`;
    }).join('')||'<tr><td colspan="12" style="text-align:center;padding:28px;color:var(--t4)">Nenhum resultado encontrado</td></tr>';

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
    const id    = document.getElementById('pgContaId').value;
    const valor = parseFloat(document.getElementById('pgValorPago').value);
    if(!valor||valor<=0) return this.toast('Informe um valor válido','error');
    await FS.pagarConta(id, STATE.usuario, valor);
    document.getElementById('ovPagamento').classList.remove('open');
    this.toast(`Pagamento de ${fmt(valor)} registrado por ${STATE.usuario} ✅`,'success');
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
    document.getElementById('tbodyParcelas').innerHTML=parcs.map(c=>{
      const pago=c.vPago>=c.vPagar;const atr=isOverdue(c);
      return`<tr style="${atr?'background:rgba(234,88,12,.04)':''}">
        <td><input type="text" value="${c.parcela||''}" id="parc_parc_${c.id}" style="width:80px"></td>
        <td><input type="text" value="${c.conta}" id="parc_desc_${c.id}"></td>
        <td><input type="date" value="${c.data}" id="parc_data_${c.id}"></td>
        <td><input type="number" value="${c.vPagar}" id="parc_val_${c.id}" step="0.01" style="width:90px"></td>
        <td>${pago?'<span class="badge bg-pago">Pago</span>':atr?'<span class="badge bg-atr">Atrasado</span>':'<span class="badge bg-pend">Pendente</span>'}</td>
        <td>${c.paidBy||c.updatedBy||c.createdBy||'—'}</td>
        <td>${!pago?`<button class="btn btn-sm" style="background:var(--green-lt);color:var(--green);border:1px solid #bbf7d0" onclick="APP.parcsPayOne('${c.id}')">✓ Pagar</button>`:''}
          <button class="btn btn-sm btn-danger" onclick="APP.parcsDeleteOne('${c.id}')">✕</button></td>
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
    document.getElementById('ovParcelas').classList.remove('open');
  },
  async parcsPayEarly(){
    const parcs=CACHE.getByGrupo(STATE.parcGrupo).filter(c=>!(c.vPago>0));
    if(!parcs.length){this.toast('Nenhuma pendente','info');return;}
    const val=prompt(`Valor do pagamento antecipado (${parcs.length} parcelas):`);if(!val)return;
    const nota=prompt('Observação:')||'Pagamento antecipado';
    await Promise.all(parcs.map(c=>FS.pagarConta(c.id,STATE.usuario,parseFloat(val)/parcs.length)));
    this.toast('Pagamento antecipado registrado','success');
    document.getElementById('ovParcelas').classList.remove('open');
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
    document.getElementById('ovParcelas').classList.remove('open');
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
      const data=document.getElementById(`parc_data_${c.id}`)?.value;
      const val=document.getElementById(`parc_val_${c.id}`)?.value;
      const parc=document.getElementById(`parc_parc_${c.id}`)?.value;
      return FS.updateConta(c.id,{conta:desc||c.conta,data:data||c.data,vPagar:parseFloat(val)||c.vPagar,parcela:parc||c.parcela,updatedBy:STATE.usuario});
    }));
    this.toast('Alterações salvas','success');
    document.getElementById('ovParcelas').classList.remove('open');
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
    this.mkChart('canvasReceitas',{type:'bar',data:{labels:MESES,datasets:[{label:'Salários',data:salVals,backgroundColor:'rgba(0,100,55,.25)',borderColor:'#006437',borderWidth:2,borderRadius:4,stack:'a'},{label:'Outras',data:outVals,backgroundColor:'rgba(0,168,90,.2)',borderColor:'#00a85a',borderWidth:2,borderRadius:4,stack:'a'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#374151',font:{size:10}}},tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.raw)}`}}},scales:{x:{ticks:{color:'#9ca3af',font:{size:10}},grid:{color:'rgba(0,0,0,.04)'},stacked:true},y:{stacked:true,ticks:{color:'#9ca3af',font:{size:10},callback:v=>`R$${(v/1000).toFixed(0)}k`},grid:{color:'rgba(0,0,0,.04)'}}}}});
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
    document.getElementById('ovSalario').classList.remove('open');
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
      document.getElementById('ovTabelas').classList.remove('open');
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
    const todosMeses = mesVal==='todos';
    const todosAnos  = anoVal==='todos';

    let data = CACHE.contas;
    if(!todosAnos)  data = data.filter(c=>new Date(c.data+'T12:00').getFullYear()===parseInt(anoVal));
    if(!todosMeses) data = data.filter(c=>new Date(c.data+'T12:00').getMonth()===parseInt(mesVal));
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

    document.getElementById('tbodyRel').innerHTML=data.map((c,i)=>{
      const ef=vEfetivo(c); const pend=c.vPago>0?0:ef; const atr=isOverdue(c);
      const catNome=CACHE.resolveCat(c.catId||c.cat); const formaNome=CACHE.resolveForma(c.formaId||c.forma);
      const splitBadge=c._split?'<span class="badge" style="background:var(--yellow-lt);color:var(--yellow);font-size:9px;margin-left:4px">÷2</span>':'';
      return`<tr>
        <td style="color:var(--t4)">${i+1}</td>
        <td style="max-width:140px;white-space:normal">${c.conta}${splitBadge}</td>
        <td>${c.resp}</td>
        <td style="font-size:11px;color:var(--t3)">${formaNome}</td>
        <td>${catNome}</td>
        <td class="neg">${fmt(ef)}</td>
        <td class="${c.vPago>0?'pos':'dim'}">${c.vPago>0?fmt(c.vPago):'—'}</td>
        <td class="${pend>0?(atr?'atr':'neg'):'dim'}">${pend>0?fmt(pend):'—'}</td>
        <td style="${atr?'color:var(--orange);font-weight:600':''}">${fmtDate(c.data)}</td>
        <td style="font-size:10.5px;color:var(--t4)">${c.parcela||'—'}</td>
        <td>${c.updatedBy||c.createdBy?`<span class="audit-chip">${c.updatedBy||c.createdBy}</span>`:''}</td>
        <td style="font-size:10.5px;color:var(--t4);max-width:100px;white-space:normal">${c.nota||'—'}</td>
      </tr>`;
    }).join('')||'<tr><td colspan="12" style="text-align:center;padding:28px;color:var(--t4)">Nenhum dado para este filtro</td></tr>';
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
        this.populateContaSelects(c.catId||c.cat,c.formaId||c.forma);this.calcTotal();
      }
    }
    document.getElementById('ovConta').classList.add('open');
    setTimeout(()=>document.getElementById('fDesc').focus(),100);
  },

  clearConta(){ ['fDesc','fNota','fResp','fForma','fCat','fData','fVP','fParc'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';}); document.getElementById('fQP').value=1;document.getElementById('fVT').value=''; },
  calcTotal(){ const v=parseFloat(document.getElementById('fVP').value)||0;const q=parseInt(document.getElementById('fQP').value)||1;document.getElementById('fVT').value=(v*q).toFixed(2); },

  async saveConta(){
    const catId=document.getElementById('fCat').value;const formaId=document.getElementById('fForma').value;
    const c={conta:document.getElementById('fDesc').value.trim(),nota:document.getElementById('fNota').value.trim(),resp:document.getElementById('fResp').value,formaId,catId,data:document.getElementById('fData').value,vPagar:parseFloat(document.getElementById('fVP').value)||0,vPago:null,parcela:document.getElementById('fParc').value.trim(),createdBy:STATE.usuario};
    if(!c.conta)return this.toast('Descrição é obrigatória','error');
    if(!c.resp)return this.toast('Selecione o responsável','error');
    if(!catId)return this.toast('Selecione a categoria','error');
    if(!formaId)return this.toast('Selecione a forma de pagamento','error');
    if(!c.data)return this.toast('Informe a data','error');
    if(!c.vPagar)return this.toast('Informe o valor','error');

    if(STATE.editContaId){
      await FS.updateConta(STATE.editContaId,{...c,updatedBy:STATE.usuario});
      this.toast('Conta atualizada ✅','success');
    } else {
      const qt=parseInt(document.getElementById('fQP').value)||1;
      const grupo=`grp-${Date.now()}`;
      if(qt>1){
        const base=new Date(c.data+'T12:00');
        const proms=[];
        for(let i=0;i<qt;i++){const d=new Date(base);d.setMonth(d.getMonth()+i);proms.push(FS.addConta({...c,data:d.toISOString().split('T')[0],parcela:`${i+1} de ${qt}`,grupo}));}
        await Promise.all(proms);
      } else {
        if(!c.parcela)c.parcela='1 de 1';
        await FS.addConta({...c,grupo});
      }
      this.toast('Conta cadastrada ✅','success');
    }
    document.getElementById('ovConta').classList.remove('open');STATE.editContaId=null;
  },

  // ── RECEITA MODAL ──
  openReceita(){ ['rDesc','rResp','rValor'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});document.getElementById('ovReceita').classList.add('open');setTimeout(()=>document.getElementById('rDesc').focus(),100); },
  async saveReceita(){
    const desc=document.getElementById('rDesc').value.trim();const resp=document.getElementById('rResp').value;const val=parseFloat(document.getElementById('rValor').value)||0;
    if(!desc)return this.toast('Informe a descrição','error');
    await FS.addOutra({desc,resp,valores:Array(12).fill(val),createdBy:STATE.usuario,createdAt:today()});
    document.getElementById('ovReceita').classList.remove('open');this.toast(`"${desc}" criada ✅`,'success');
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
  },

  // ── TOAST ──
  toast(msg,type='success'){
    const t=document.getElementById('toast');t.textContent=msg;t.className=`toast show ${type}`;
    clearTimeout(this._tt);this._tt=setTimeout(()=>t.classList.remove('show'),3500);
  }
};

// ============================================================
// UPLOAD CARDS MODULE
// ============================================================
Object.assign(APP, {

  // ── Estado do módulo ──
  _upGrupos:    [],
  _upPlanId:    '',
  _upPlanNome:  '',
  _upVerTodas:  false,

  // ── UUID simples ──
  _upUid(){ return 'imp-'+Date.now()+'-'+Math.random().toString(36).slice(2,8); },

  // ── Abrir modais de upload ──
  openUpModal(id){
    document.getElementById(id).classList.add('open');
    if(id==='ovCartoes') this.upRenderCartoes();
    if(id==='ovModelo')  this.upInitModelo();
  },

  // ── DRAG & DROP ──
  upDragOver(e){ e.preventDefault(); document.getElementById('upZone').classList.add('drag'); },
  upDragLeave(){  document.getElementById('upZone').classList.remove('drag'); },
  upDrop(e){ e.preventDefault(); this.upDragLeave(); const f=e.dataTransfer.files[0]; if(f) this.upHandleFile(f); },

  // ── CARTÕES (Firestore coleção 'cartoes') ──
  async upSalvarCartao(){
    const eid  = document.getElementById('cEId').value;
    const nome = document.getElementById('cNome').value.trim();
    const band = document.getElementById('cBand').value;
    if(!nome) return this.toast('Informe o nome do cartão','error');

    if(eid){
      await fbDb.collection('cartoes').doc(eid).update({nome, bandeira:band, updatedBy:STATE.usuario});
      this.upCancelarEditCartao();
      this.toast('Cartão atualizado ✅','success');
    } else {
      const snap = await fbDb.collection('cartoes').where('nome','==',nome).get();
      if(!snap.empty) return this.toast('Cartão já cadastrado','error');
      await fbDb.collection('cartoes').add({nome, bandeira:band, createdBy:STATE.usuario, createdAt:new Date().toISOString()});
      document.getElementById('cNome').value='';
      document.getElementById('cBand').value='';
      this.toast(`"${nome}" cadastrado ✅`,'success');
    }
    this.upRenderCartoes();
  },

  async upRenderCartoes(){
    const snap = await fbDb.collection('cartoes').orderBy('nome').get();
    const el   = document.getElementById('upListaCartoes');
    if(!el) return;
    if(snap.empty){ el.innerHTML='<p style="color:var(--t4);font-size:12.5px;padding:6px 0">Nenhum cartão cadastrado.</p>'; return; }
    el.innerHTML = snap.docs.map(d=>{
      const c=d.data();
      return `<div class="up-citem">
        <div><div class="cn">${c.nome}</div><div class="cs">${c.bandeira||'Sem bandeira'}</div></div>
        <div style="display:flex;gap:5px">
          <button class="action-btn edit" onclick="APP.upEditarCartao('${d.id}','${c.nome.replace(/'/g,"\\'")}','${c.bandeira||''}')">✏</button>
          <button class="action-btn del" onclick="APP.upExcluirCartao('${d.id}','${c.nome.replace(/'/g,"\\'")}')">✕</button>
        </div></div>`;
    }).join('');
  },

  upEditarCartao(id,nome,band){
    document.getElementById('cEId').value  = id;
    document.getElementById('cNome').value = nome;
    document.getElementById('cBand').value = band;
    document.getElementById('bSalvCartao').textContent='💾 Salvar alteração';
    document.getElementById('bCancCartao').style.display='inline-flex';
    document.getElementById('cNome').focus();
  },

  upCancelarEditCartao(){
    document.getElementById('cEId').value='';
    document.getElementById('cNome').value='';
    document.getElementById('cBand').value='';
    document.getElementById('bSalvCartao').textContent='+ Adicionar Cartão';
    document.getElementById('bCancCartao').style.display='none';
  },

  async upExcluirCartao(id,nome){
    if(!confirm(`Excluir cartão "${nome}"?`)) return;
    await fbDb.collection('cartoes').doc(id).delete();
    this.upRenderCartoes();
    this.toast('Cartão excluído','success');
  },

  // ── MODAL MODELO ──
  async upInitModelo(){
    const ano = new Date().getFullYear();
    const aS  = document.getElementById('mAno');
    aS.innerHTML='<option value="">Selecione o ano...</option>';
    for(let a=ano-1;a<=ano+2;a++) aS.appendChild(new Option(a,a));
    aS.value = ano;
    document.getElementById('mMes').value='';

    const cS   = document.getElementById('mCartao');
    cS.innerHTML='<option value="">Selecione o cartão...</option>';
    const snap = await fbDb.collection('cartoes').orderBy('nome').get();
    snap.docs.forEach(d=>{
      const c=d.data();
      cS.appendChild(new Option(`${c.nome}${c.bandeira?' ('+c.bandeira+')':''}`, c.nome));
    });
    this.upAtualizarNome();
  },

  upAtualizarNome(){
    const cart = document.getElementById('mCartao').value;
    const ano  = document.getElementById('mAno').value;
    const mes  = document.getElementById('mMes').value;
    const el   = document.getElementById('upNomePreview');
    if(!cart||!ano||!mes){ el.textContent='— preencha todos os campos —'; return; }
    el.textContent = `${ano}.${mes}_${cart.replace(/\s+/g,'_')}.xlsx`;
  },

  _upGetNome(){
    const cart=document.getElementById('mCartao').value;
    const ano =document.getElementById('mAno').value;
    const mes =document.getElementById('mMes').value;
    if(!cart||!ano||!mes) return null;
    return `${ano}.${mes}_${cart.replace(/\s+/g,'_')}`;
  },

  // ── GERAR MODELO EXCEL ──
  upBaixarModelo(){
    if(typeof XLSX==='undefined') return this.toast('Biblioteca Excel não carregada. Tente recarregar a página.','error');
    const nome = this._upGetNome();
    if(!nome) return this.toast('Preencha todos os campos','error');

    const cats  = CACHE.getAllCats().map(c=>c.nome);
    const formas= CACHE.getAllFormas().map(f=>f.nome);

    const wb  = XLSX.utils.book_new();
    const cab = ['Status','Descrição','Responsável','Forma de Pagamento','Categoria','Data Vencimento','Valor Parcela','Total Parcelas','Parcela Atual','Nota'];
    const ex  = [
      ['Nova','Exemplo: Mensalidade Academia','Leo','PIX','Saúde','10/07/2026',150,1,1,''],
      ['Nova','Exemplo: Parcela Carro','Leo & Pri','Automático','Carro','15/07/2026',850,48,12,'Da 12ª à 48ª parcela'],
      ['Existente','Conta já cadastrada','Leo','PIX','Casa','04/07/2026',350,12,7,'Será ignorada'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([cab,...ex]);
    ws['!cols']=[{wch:12},{wch:34},{wch:14},{wch:24},{wch:20},{wch:16},{wch:14},{wch:14},{wch:14},{wch:30}];
    ws['!dataValidation']=[
      {sqref:'A2:A5000',type:'list',formula1:'"Nova,Existente"',showErrorMessage:true,errorTitle:'Inválido',error:'Use: Nova ou Existente'},
      {sqref:'C2:C5000',type:'list',formula1:'"Leo,Pri,Leo & Pri"'},
      {sqref:'D2:D5000',type:'list',formula1:`"${formas.join(',')}"`},
      {sqref:'E2:E5000',type:'list',formula1:`"${cats.join(',')}"`},
    ];
    XLSX.utils.book_append_sheet(wb,ws,'Importação');

    const wsRef=XLSX.utils.aoa_to_sheet([['REFERÊNCIA — NÃO EDITAR'],[''],
      ['RESPONSÁVEL','CATEGORIAS','FORMAS DE PAGAMENTO'],
      ...Array.from({length:Math.max(3,cats.length,formas.length)},(_,i)=>[['Leo','Pri','Leo & Pri'][i]||'',cats[i]||'',formas[i]||''])]);
    wsRef['!cols']=[{wch:18},{wch:28},{wch:28}];
    XLSX.utils.book_append_sheet(wb,wsRef,'Referência');

    // Aba oculta com ID exclusivo
    const pid=this._upUid();
    const wsMeta=XLSX.utils.aoa_to_sheet([['planilha_id',pid],['nome',nome],['gerado_em',new Date().toISOString()],['versao','1.0'],['sistema','Duetto Financeiro']]);
    XLSX.utils.book_append_sheet(wb,wsMeta,'_meta');
    wb.Workbook=wb.Workbook||{};wb.Workbook.Sheets=wb.Workbook.Sheets||[];
    const mi=wb.SheetNames.indexOf('_meta');
    while(wb.Workbook.Sheets.length<=mi) wb.Workbook.Sheets.push({});
    wb.Workbook.Sheets[mi].Hidden=1;

    XLSX.writeFile(wb,nome+'.xlsx');
    document.getElementById('ovModelo').classList.remove('open');
    this.toast(`"${nome}.xlsx" gerada ✅`,'success');
  },

  // ── HANDLE UPLOAD ──
  upHandleFile(file){
    if(!file) return;
    if(!file.name.match(/\.(xlsx|xls)$/i)) return this.toast('Use apenas .xlsx gerado pelo sistema','error');
    if(typeof XLSX==='undefined') return this.toast('Biblioteca Excel não carregada','error');
    this._upOcultarAlertas();
    const r=new FileReader();
    r.onload=e=>this._upProcessar(e.target.result,file.name);
    r.readAsArrayBuffer(file);
  },

  async _upProcessar(buf,fileName){
    const wb=XLSX.read(buf,{type:'array',cellDates:true});

    // 1. Verificar ID na aba oculta
    let pid='',pnome='';
    if(wb.SheetNames.includes('_meta')){
      XLSX.utils.sheet_to_json(wb.Sheets['_meta'],{header:1}).forEach(r=>{
        if(r[0]==='planilha_id') pid=String(r[1]||'');
        if(r[0]==='nome')        pnome=String(r[1]||'');
      });
    }
    if(!pid) return this._upShowAlert('upAlertErr','❌ Planilha inválida — não foi gerada pelo sistema Duetto. Use o botão "Baixar Modelo".');

    // 2. Verificar duplicata no Firestore
    const snap=await fbDb.collection('importacoes').where('planilhaId','==',pid).get();
    if(!snap.empty){
      const reg=snap.docs[0].data();
      return this._upShowAlert('upAlertErr',
        `❌ Bloqueado: esta planilha já foi importada em ${reg.data||'data desconhecida'}.<br><strong>ID:</strong> <span style="font-family:monospace">${pid}</span><br><strong>Nome:</strong> ${pnome}<br>O bloqueio é pelo ID exclusivo — renomear o arquivo não contorna a validação.`);
    }

    this._upPlanId   = pid;
    this._upPlanNome = pnome;
    document.getElementById('upFileName').textContent   = fileName;
    document.getElementById('upFileId').textContent     = 'ID: '+pid;
    document.getElementById('upFileInfo').style.display = 'block';

    // 3. Ler aba de importação
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    if(rows.length<2) return this._upShowAlert('upAlertErr','Planilha vazia ou sem dados.');

    // 4. Mapear colunas pelo cabeçalho
    const hdr=rows[0].map(h=>String(h).trim().toLowerCase());
    const col=n=>hdr.findIndex(h=>h.includes(n));
    const iSt=col('status'),iDe=col('descri'),iRe=col('respons'),iFor=col('forma'),
          iCat=col('categ'),iDt=col('data'),iVl=col('valor'),iTP=col('total'),
          iPA=hdr.findIndex(h=>h.includes('parcela')&&h.includes('atual')),
          iNo=col('nota');

    // 5. Verificar colunas obrigatórias
    const faltando=[];
    if(iSt===-1) faltando.push('Status');
    if(iDe===-1) faltando.push('Descrição');
    if(iRe===-1) faltando.push('Responsável');
    if(iFor===-1) faltando.push('Forma de Pagamento');
    if(iCat===-1) faltando.push('Categoria');
    if(iDt===-1) faltando.push('Data Vencimento');
    if(iVl===-1) faltando.push('Valor Parcela');
    if(faltando.length) return this._upShowAlert('upAlertErr',
      `❌ Colunas obrigatórias não encontradas: <strong>${faltando.join(', ')}</strong>.<br>Verifique se está usando a planilha modelo correta e se o cabeçalho não foi alterado.`);

    const cats  = CACHE.getAllCats().map(c=>c.nome);
    const formas= CACHE.getAllFormas().map(f=>f.nome);
    const resps = ['Leo','Pri','Leo & Pri'];
    const anoAtual = new Date().getFullYear();

    const novas=[],ign=[],errosLeitura=[];

    rows.slice(1).forEach((row,idx)=>{
      const lin=idx+2;
      const st=String(row[iSt]||'').trim();
      if(!st) return; // linha vazia
      if(st.toLowerCase()==='existente'){ ign.push(lin); return; }
      if(st.toLowerCase()!=='nova'){ errosLeitura.push(`Linha ${lin}: Status "${st}" inválido — use Nova ou Existente`); return; }

      // Converter data
      let data='';
      const rd=row[iDt];
      if(rd instanceof Date){
        data=rd.toISOString().split('T')[0];
      } else if(typeof rd==='string'){
        const s=rd.trim();
        if(s.includes('/')){
          const pts=s.split('/');
          if(pts.length===3){ const[d,m,a]=pts; data=`${a.padStart(4,'20')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
        } else if(s.includes('-') && s.length>=8){
          data=s; // já no formato ISO
        }
      } else if(typeof rd==='number' && rd>0){
        try{ const p=XLSX.SSF.parse_date_code(rd); data=`${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`; }catch(e){}
      }

      // Converter valor
      const rawVal=String(row[iVl]||'').replace(/[R$\s]/g,'').replace(',','.');
      const vPagar=parseFloat(rawVal)||0;

      // Converter parcelas (rejeitar letras)
      const rawTP=String(row[iTP>=0?iTP:col('total')]||'').trim();
      const rawPA=String(row[iPA>=0?iPA:col('parc')]||'').trim();
      const totParc = /^\d+$/.test(rawTP) ? parseInt(rawTP) : NaN;
      const parcAtual= /^\d+$/.test(rawPA) ? parseInt(rawPA) : NaN;

      novas.push({
        conta:String(row[iDe]||'').trim(),
        resp:String(row[iRe]||'').trim(),
        forma:String(row[iFor]||'').trim(),
        cat:String(row[iCat]||'').trim(),
        data,vPagar,
        totParc: isNaN(totParc) ? 0 : totParc,
        parcAtual: isNaN(parcAtual) ? 0 : parcAtual,
        rawTP,rawPA,
        nota:String(row[iNo]||'').trim(),
        linha:lin,
      });
    });

    document.getElementById('upFileDetail').textContent=
      `${rows.length-1} linhas · ${novas.length} novas · ${ign.length} ignoradas`;

    if(errosLeitura.length) return this._upShowAlert('upAlertErr',
      `Erros de leitura:<br>${errosLeitura.map(e=>`• ${e}`).join('<br>')}`);

    // 6. VALIDAÇÃO DE INTEGRIDADE — completa
    const ev=[];
    novas.forEach(c=>{
      // Descrição
      if(!c.conta) ev.push(`Linha ${c.linha}: Descrição vazia`);
      // Responsável
      if(!resps.includes(c.resp)) ev.push(`Linha ${c.linha}: Responsável "<strong>${c.resp||'vazio'}</strong>" inválido — use Leo, Pri ou Leo & Pri`);
      // Forma
      if(!formas.includes(c.forma)) ev.push(`Linha ${c.linha}: Forma de Pagamento "<strong>${c.forma||'vazio'}</strong>" não existe no sistema`);
      // Categoria
      if(!cats.includes(c.cat)) ev.push(`Linha ${c.linha}: Categoria "<strong>${c.cat||'vazio'}</strong>" não existe no sistema`);
      // Data ausente
      if(!c.data) ev.push(`Linha ${c.linha}: Data ausente ou em formato inválido — use dd/mm/aaaa`);
      // Data fora do range razoável
      if(c.data){
        const ano=parseInt(c.data.slice(0,4));
        if(isNaN(ano)||ano<2019||ano>2035) ev.push(`Linha ${c.linha}: Data "${c.data}" fora do intervalo permitido (2019–2035)`);
        // Dia/mês inválido
        const d=new Date(c.data+'T12:00');
        if(isNaN(d.getTime())) ev.push(`Linha ${c.linha}: Data inválida`);
      }
      // Valor
      if(!c.vPagar||c.vPagar<=0){
        const dica=String(c.rawVal||'');
        ev.push(`Linha ${c.linha}: Valor inválido${dica?` ("${dica}")` :''} — use número no formato 1500.00 ou 1500,00`);
      }
      // Total Parcelas — letras no lugar de número
      if(isNaN(c.totParc)||c.totParc<=0){
        ev.push(`Linha ${c.linha}: Total de Parcelas "<strong>${c.rawTP||'vazio'}</strong>" inválido — deve ser um número inteiro`);
      }
      // Parcela Atual — letras no lugar de número
      if(isNaN(c.parcAtual)||c.parcAtual<=0){
        ev.push(`Linha ${c.linha}: Parcela Atual "<strong>${c.rawPA||'vazio'}</strong>" inválido — deve ser um número inteiro`);
      }
      // Parcela Atual > Total
      if(!isNaN(c.totParc)&&!isNaN(c.parcAtual)&&c.parcAtual>c.totParc){
        ev.push(`Linha ${c.linha}: Parcela Atual (${c.parcAtual}) é maior que Total de Parcelas (${c.totParc}) — impossível`);
      }
    });

    document.getElementById('upSecaoPreview').style.display='block';

    if(ev.length){
      this._upShowAlert('upAlertVal',
        `🚫 <strong>${ev.length} problema(s) encontrado(s) — cadastro bloqueado:</strong><br><br>`+
        ev.map(e=>`• ${e}`).join('<br>')+
        `<br><br><strong>Corrija a planilha e faça o upload novamente.</strong>`);
      document.getElementById('upBtnConfirmar').disabled=true;
      this._upGrupos=[];
      this._upRenderStats(0,novas.length,ign.length,0);
      this._upRenderPreview([]);
      return;
    }

    // 7. Expandir parcelamentos
    const grupos=[];
    novas.forEach(c=>{
      const gid=`grp-${Date.now()}-${Math.random().toString(36).slice(2,5)}`;
      const rest=c.totParc-c.parcAtual+1;
      const db=new Date(c.data+'T12:00');
      const parcs=[];
      if(c.totParc<=1){
        parcs.push({...c,parcela:'1 de 1',dataF:c.data,gid});
      } else {
        for(let i=0;i<rest;i++){
          const d=new Date(db);d.setMonth(d.getMonth()+i);
          parcs.push({...c,parcela:`${c.parcAtual+i} de ${c.totParc}`,dataF:d.toISOString().split('T')[0],gid});
        }
      }
      grupos.push({base:c,parcs,gid});
    });

    this._upGrupos=grupos;
    const td=grupos.reduce((s,g)=>s+g.parcs.length,0);
    document.getElementById('upBtnConfirmar').disabled=false;
    document.getElementById('upAlertVal').style.display='none';
    this._upRenderStats(td,novas.length,ign.length,td-novas.length);
    this._upRenderPreview(grupos);
    this._upShowAlert('upAlertAv',
      `✅ Validação concluída — <strong>${novas.length} conta(s)</strong> prontas, gerando <strong>${td} documento(s)</strong> no banco.`);
  },

  // ── PREVIEW ──
  _upRenderStats(td,ct,ig,ex){
    document.getElementById('upStats').innerHTML=[
      {l:'Docs a criar',v:td,c:'var(--palm)'},{l:'Contas únicas',v:ct,c:'var(--blue)'},
      {l:'Ignoradas',v:ig,c:'var(--t4)'},{l:'Parcelas extras',v:ex,c:'var(--orange)'}
    ].map(s=>`<div class="up-stat"><label>${s.l}</label><div class="sv" style="color:${s.c}">${s.v}</div></div>`).join('');
    document.getElementById('upResumoLinha').textContent=ct+' conta(s) para cadastrar';
  },

  _upRenderPreview(grupos){
    const esc=s=>String(s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    const cats=CACHE.getAllCats().map(c=>c.nome);
    const formas=CACHE.getAllFormas().map(f=>f.nome);
    const resps=['Leo','Pri','Leo & Pri'];
    document.getElementById('upTbodyPreview').innerHTML=!grupos.length
      ?'<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--t4)">Nenhuma conta para exibir</td></tr>'
      :grupos.map((g,i)=>{const c=g.base;const tp=g.parcs.length>1;
        return`<tr>
          <td style="color:var(--t4);font-size:11px">${i+1}</td>
          <td><input type="text" value="${esc(c.conta)}" oninput="APP._upUpdCampo(${i},'conta',this.value)" style="min-width:140px"></td>
          <td><select onchange="APP._upUpdCampo(${i},'resp',this.value)">${resps.map(r=>`<option ${r===c.resp?'selected':''}>${r}</option>`).join('')}</select></td>
          <td><select onchange="APP._upUpdCampo(${i},'forma',this.value)" style="min-width:120px">${formas.map(f=>`<option ${f===c.forma?'selected':''}>${f}</option>`).join('')}</select></td>
          <td><select onchange="APP._upUpdCampo(${i},'cat',this.value)" style="min-width:110px">${cats.map(x=>`<option ${x===c.cat?'selected':''}>${x}</option>`).join('')}</select></td>
          <td><input type="date" value="${g.parcs[0]?.dataF||c.data}" readonly style="min-width:110px;color:var(--t3)" title="Data da 1ª parcela — gerado automaticamente"></td>
          <td><input type="number" value="${c.vPagar}" step="0.01" oninput="APP._upUpdValor(${i},this.value)" style="width:88px"></td>
          <td style="text-align:center">${tp
            ?`<span class="badge bg-cat" style="cursor:pointer" onclick="APP._upVerParcelas(${i})" title="Ver todas as parcelas">${g.parcs.length} × 🔍</span>`
            :`<span class="audit-chip">1 de 1</span>`}</td>
          <td><input type="text" value="${esc(c.nota)}" oninput="APP._upUpdCampo(${i},'nota',this.value)" style="min-width:90px"></td>
          <td><button class="action-btn del" onclick="APP._upDelGrupo(${i})">✕</button></td>
        </tr>`;
      }).join('');
  },

  _upUpdCampo(i,k,v){ this._upGrupos[i].base[k]=v; this._upGrupos[i].parcs.forEach(p=>p[k]=v); },
  _upUpdValor(i,v){ const n=parseFloat(v)||0; this._upGrupos[i].base.vPagar=n; this._upGrupos[i].parcs.forEach(p=>p.vPagar=n); },
  _upDelGrupo(i){ this._upGrupos.splice(i,1); const td=this._upGrupos.reduce((s,g)=>s+g.parcs.length,0); this._upRenderStats(td,this._upGrupos.length,0,td-this._upGrupos.length); this._upRenderPreview(this._upGrupos); },

  _upVerParcelas(i){
    const g=this._upGrupos[i];
    document.getElementById('upTitParcelas').textContent=`Parcelas — ${g.base.conta}`;
    document.getElementById('upTbodyParcelas').innerHTML=g.parcs.map((p,j)=>
      `<tr><td style="color:var(--t4)">${j+1}</td><td><span class="badge bg-cat">${p.parcela}</span></td><td>${p.dataF}</td><td class="neg">${fmt(p.vPagar)}</td></tr>`
    ).join('');
    document.getElementById('ovParcelasUp').classList.add('open');
  },

  // ── CONFIRMAR CADASTRO ──
  async upConfirmar(){
    const grupos=this._upGrupos;
    if(!grupos.length) return this.toast('Nenhuma conta para cadastrar','error');
    const btn=document.getElementById('upBtnConfirmar');
    btn.disabled=true; btn.textContent='⏳ Cadastrando...';

    try{
      const td=grupos.reduce((s,g)=>s+g.parcs.length,0);
      // writeBatch — máx 500 por lote, divide automaticamente se necessário
      const todas=grupos.flatMap(g=>g.parcs);
      const LOTE=400;
      for(let i=0;i<todas.length;i+=LOTE){
        const batch=fbDb.batch();
        todas.slice(i,i+LOTE).forEach(p=>{
          const ref=fbDb.collection('contas').doc();
          batch.set(ref,{
            conta:p.conta, resp:p.resp,
            catId: CACHE.getAllCats().find(c=>c.nome===p.cat)?.id||p.cat,
            formaId: CACHE.getAllFormas().find(f=>f.nome===p.forma)?.id||p.forma,
            data:p.dataF, vPagar:p.vPagar, vPago:null,
            parcela:p.parcela, grupo:p.gid, nota:p.nota||'',
            createdBy:STATE.usuario,
            createdAt:firebase.firestore.FieldValue.serverTimestamp(),
            origem:'importacao', planilhaId:this._upPlanId,
          });
        });
        await batch.commit();
      }

      // Registrar importação
      await fbDb.collection('importacoes').add({
        planilhaId: this._upPlanId,
        nome:       this._upPlanNome,
        qtdContas:  grupos.length,
        qtdDocs:    td,
        importadoPor: STATE.usuario,
        data:   new Date().toLocaleDateString('pt-BR'),
        hora:   new Date().toLocaleTimeString('pt-BR'),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      this._upGrupos=[]; this._upPlanId=''; this._upPlanNome='';
      document.getElementById('upSecaoPreview').style.display='none';
      document.getElementById('upFileInfo').style.display='none';
      document.getElementById('upFileInput').value='';
      this._upOcultarAlertas();
      this.upRenderHistorico();
      this._upShowAlert('upAlertOk',`✅ <strong>${grupos.length} conta(s)</strong> cadastradas, gerando <strong>${td} documento(s)</strong> no banco!`);
      this.toast(`${td} documentos cadastrados ✅`,'success');
    } catch(err){
      this.toast('Erro ao cadastrar: '+err.message,'error');
    }

    btn.textContent='✅ Confirmar Cadastro em Massa';
    btn.disabled=false;
  },

  upCancelar(){
    this._upGrupos=[]; this._upPlanId='';
    document.getElementById('upSecaoPreview').style.display='none';
    document.getElementById('upFileInfo').style.display='none';
    document.getElementById('upFileInput').value='';
    this._upOcultarAlertas();
    this.toast('Operação cancelada','info');
  },

  // ── HISTÓRICO ──
  async upRenderHistorico(){
    const snap=await fbDb.collection('importacoes').orderBy('createdAt','desc').get();
    const all=snap.docs.map(d=>({id:d.id,...d.data()}));
    const exibir=this._upVerTodas?all:all.slice(0,3);
    const el=document.getElementById('upHistorico');
    if(!el) return;
    if(!all.length){ el.innerHTML='<p style="color:var(--t4);font-size:12.5px">Nenhuma importação registrada.</p>'; return; }
    el.innerHTML=exibir.map(i=>`
      <div class="up-imp">
        <div class="in">📄 ${i.nome||'Sem nome'}.xlsx</div>
        <div class="im">${i.data||''} às ${i.hora||''} · por ${i.importadoPor||'—'} · ${i.qtdDocs} docs</div>
        <span class="up-idchip">${i.planilhaId}</span>
        <span class="badge bg-pago" style="margin-left:6px">${i.qtdContas} contas</span>
      </div>`).join('');
    if(all.length>3&&!this._upVerTodas)
      el.innerHTML+=`<p style="font-size:12px;color:var(--t4);margin-top:6px">${all.length-3} registro(s) mais antigos ocultos.</p>`;
  },

  upToggleHist(){ this._upVerTodas=!this._upVerTodas; this.upRenderHistorico(); },

  // ── HELPERS ──
  _upShowAlert(id,msg){ const el=document.getElementById(id); if(!el)return; el.innerHTML=msg; el.style.display='block'; },
  _upOcultarAlertas(){ ['upAlertErr','upAlertOk','upAlertAv','upAlertVal'].forEach(id=>{ const el=document.getElementById(id); if(el)el.style.display='none'; }); },
});
