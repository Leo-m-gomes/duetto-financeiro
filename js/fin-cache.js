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
  // EAC (não bloqueiam o boot: chegam depois e redesenham a tela EAC)
  grupos:   [],   // categoria_grupos: {id, nome, ordem, cor}
  lbs:      [],   // eac_lb: cabeçalhos das linhas de base (os itens ficam em eac_lb_itens, lidos sob demanda)
  eacExcl:  [],   // eac_exclusoes: classificação das contas da LB que foram excluídas
  // Fotos de perfil (avatares/{Leo|Pri}); sem documento vale a foto padrão de img/ (js/avatares.js)
  avatares: {},   // {Leo:{foto, atualizadoPor, atualizadoEmIso}, Pri:{...}}
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
  getByMes(mes, ano){ return this.contas.filter(c=>{ const d=new Date(c.data+'T12:00'); if(ano!=null && d.getFullYear()!==ano) return false; return d.getMonth()===mes; }); },
  getByAnoMes(ano,mes){
    return this.contas.filter(c=>{
      const d=new Date(c.data+'T12:00');
      if(ano!=='todos'&&d.getFullYear()!==parseInt(ano))return false;
      if(mes!=='todos'&&d.getMonth()!==parseInt(mes))return false;
      return true;
    });
  },
  getOverdue(){ return this.contas.filter(isOverdue); },
  /**
   * Contas vencidas e não quitadas com vencimento ANTES do mês de referência.
   * Fonte única da regra "atrasadas de meses anteriores" (Dashboard, Contas, Relatório).
   * @param {number} ano  ano de referência
   * @param {number} mes  mês de referência, 0-11
   */
  getOverdueAntesDe(ano, mes){
    const inicio = `${ano}-${String(mes+1).padStart(2,'0')}-01`;
    return this.contas.filter(c => isOverdue(c) && c.data < inicio);
  },
  getByGrupo(grupo){ return this.contas.filter(c=>c.grupo===grupo).sort((a,b)=>a.data.localeCompare(b.data)); },
  getContasFiltradas(mes, resp, ano){
    const all = mes===null ? [...this.contas] : this.getByMes(mes, ano);
    if(!resp) return all.map(c=>({...c}));
    return filtrarPorResp(all, resp);
  },
  getTotalByMes(ano){
    const t=Array(12).fill(0);
    this.contas.forEach(c=>{ const d=new Date(c.data+'T12:00'); if(ano!=null && d.getFullYear()!==ano) return; const m=d.getMonth(); if(m>=0&&m<12)t[m]+=c.vPagar; });
    return t;
  },

  // ── SALÁRIOS E RECEITAS ──
  // Regra: OUTRAS RECEITAS pertencem a um ano (campo `ano`). SALÁRIO vale para todos os
  // anos: vigora a entrada mais recente do histórico com início ≤ (ano, mês).

  /** Ano inteiro de um texto 'YYYY-...' ou de um Timestamp do Firestore; null se não houver. */
  _anoDe(v){
    if(!v) return null;
    if(typeof v.toDate === 'function') return v.toDate().getFullYear();
    const y = parseInt(String(v).slice(0,4), 10);
    return y > 1900 ? y : null;
  },

  /**
   * Ano de uma "outra receita". Receitas novas gravam `ano`. As cadastradas antes do
   * controle por ano (sem o campo) usam o ano da última alteração (updatedAt), senão o do
   * cadastro (createdAt), senão o ano atual, até o ano ser confirmado em Receitas.
   * Nada é gravado aqui: a inferência é estável porque esses campos não mudam sozinhos.
   */
  anoReceita(r){
    if(Number.isInteger(r.ano)) return r.ano;
    return this._anoDe(r.updatedAt) || this._anoDe(r.createdAt) || new Date().getFullYear();
  },
  /** Outras receitas ainda sem `ano` gravado (cadastradas antes do controle por ano). */
  receitasSemAno(){ return this.outras.filter(r=>!Number.isInteger(r.ano)); },

  /**
   * Anos com movimento: anos de vencimento das contas e anos das outras receitas.
   * Usado quando a tela pede "Todos os anos": o salário vale para qualquer ano, então a
   * soma precisa de um conjunto finito de anos.
   */
  anosComDados(){
    const anos = new Set();
    this.contas.forEach(c=>{ const y=this._anoDe(c.data); if(y) anos.add(y); });
    this.outras.forEach(r=>anos.add(this.anoReceita(r)));
    return [...anos].sort((a,b)=>a-b);
  },

  /**
   * Ano de início de uma entrada do histórico de salário. Entradas antigas (sem
   * `anoInicio`) usam o ano em que foram salvas (updatedAt), senão o ano atual.
   */
  anoInicioSalario(h){
    if(Number.isInteger(h.anoInicio)) return h.anoInicio;
    return this._anoDe(h.updatedAt) || new Date().getFullYear();
  },
  _chaveSalario(h){ return this.anoInicioSalario(h)*12 + (h.mesInicio||0); },
  /** Histórico de salário em ordem cronológica de início (mais antigo primeiro). */
  historicoSalario(sal){
    return [...(sal.historico||[])].sort((a,b)=>this._chaveSalario(a)-this._chaveSalario(b));
  },
  /**
   * Entrada do salário vigente em (ano, mês 0-11): a mais recente com início ≤ (ano, mês).
   * Antes da primeira entrada, repete a primeira (o salário vale para todos os anos);
   * depois da última, repete a última (o valor atual segue nos anos seguintes).
   */
  getSalarioMes(sal, ano, mes){
    const hist = this.historicoSalario(sal);
    if(!hist.length) return null;
    const alvo = ano*12 + mes;
    let vigente = null;
    for(const h of hist){ if(this._chaveSalario(h) <= alvo) vigente = h; else break; }
    return vigente || hist[0];
  },
  /** Salário vigente hoje (cartões, edição e cálculo detalhado). */
  getSalarioVigente(sal){
    const d = new Date();
    return this.getSalarioMes(sal, d.getFullYear(), d.getMonth());
  },

  /**
   * Receita líquida de um mês para o filtro de responsável: salários vigentes da pessoa
   * + outras receitas DO ANO pela fatiaReceita ("Ambos" ÷2). Fonte única de Dashboard e
   * Receitas.
   * @param {number} ano  ano (ex.: 2026)
   * @param {number} m    mês, 0-11
   * @param {string} resp 'Leo', 'Pri', 'Leo & Pri' ou '' (todos)
   */
  getReceitaMes(ano, m, resp){
    let t = 0;
    this.salarios.forEach(s=>{
      if(resp && s.pessoa!==resp) return;
      const h=this.getSalarioMes(s, ano, m); t+=h?h.liquido:0;
    });
    this.outras.forEach(r=>{
      if(this.anoReceita(r)!==ano) return;
      t += ((r.valores||[])[m]||0) * fatiaReceita(r, resp);
    });
    return t;
  },

  // ── CÁLCULOS TRIBUTÁRIOS ──
  calcINSS(sal){
    if(!this.tabelas)return 0;
    let r=0;
    for(const f of this.tabelas.inss){ if(sal<f.de)break; r+=(Math.min(sal,f.ate)-f.de)*f.al; }
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
