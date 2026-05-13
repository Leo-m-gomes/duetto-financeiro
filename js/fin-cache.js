/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO fin-cache.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade: espelho local do Firestore para acesso síncrono.
 * Populado pelos listeners em fin-db.js. Consultado por TODAS as features.
 *
 * DEPENDÊNCIAS:
 *   fin-state.js: isOverdue, vEfetivo, DEFAULT_TABELAS
 *   app.js:       APP.onCacheReady (referenciado em runtime via markReady)
 *
 * IMPORTAÇÃO NO HTML:
 *   Carregar APÓS fin-state.js, ANTES de fin-db.js e router.js.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

const CACHE = {
  contas:   [],
  salarios: [],
  outras:   [],
  cats:     [],
  formas:   [],
  tabelas:  null,
  _ready:   new Set(),

  markReady(key){
    this._ready.add(key);
    if(this._ready.size >= 5 && typeof APP !== 'undefined') APP.onCacheReady();
  },

  // ── RESOLUÇÃO DE NOMES ──
  resolveCat(val){  if(!val)return'—'; const c=this.cats.find(x=>x.id===val||x.nome===val); return c?c.nome:val; },
  resolveForma(val){ if(!val)return'—'; const f=this.formas.find(x=>x.id===val||x.nome===val); return f?f.nome:val; },
  getCatNome(id){ const c=this.cats.find(x=>x.id===id); return c?c.nome:(id||'—'); },
  getFormaNome(id){ const f=this.formas.find(x=>x.id===id); return f?f.nome:(id||'—'); },
  getAllCats(){ return [...this.cats].sort((a,b)=>a.nome.localeCompare(b.nome,'pt')); },
  getAllFormas(){ return [...this.formas].sort((a,b)=>a.nome.localeCompare(b.nome,'pt')); },

  // ── CONSULTAS DE CONTAS ──
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

  // ── SALÁRIOS E RECEITAS ──
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

  // ── CÁLCULOS TRIBUTÁRIOS ──
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
