/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO fin-cache.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade: espelho local do Firestore para acesso síncrono.
 * Populado pelos listeners em fin-db.js. Consultado por TODAS as features.
 *
 * CONTRATO DE COBERTURA DAS CONTAS (README 3.5)
 *   As contas podem estar só em parte na memória (modo 'on': janela do ano e do usuário).
 *   Toda leitura de contas declara o que precisa (intervalo de vencimento e responsáveis,
 *   atrasadas, parcelamento, pendentes ou todas). Se a memória não cobre o pedido:
 *     • 'on'     → pede a carga (FS.garantirCobertura) e lança DadosIncompletos; a tela
 *                  mostra "Carregando…" e é redesenhada quando os dados chegam;
 *     • 'sombra' → só registra a falta (diagnóstico) e devolve a base completa;
 *     • 'off'    → a memória tem tudo, nunca falta.
 *   Nenhum cálculo roda sobre dado parcial: no pior caso, um caminho esquecido carrega mais.
 *   CACHE._contas é privado: só este módulo e fin-db.js o tocam (teste em tests/).
 *
 * DEPENDÊNCIAS:
 *   fin-state.js: isOverdue, vEfetivo, DEFAULT_TABELAS, respsDaVisao, RESPS, contaEmAberto,
 *                 aprovacaoPendente, diaSeguinte, today
 *   fin-db.js:    FS.garantirCobertura (referenciado em runtime, só no modo 'on')
 *   app.js:       APP.onCacheReady (referenciado em runtime via markReady)
 *
 * IMPORTAÇÃO NO HTML:
 *   Carregar APÓS fin-state.js, ANTES de fin-db.js e router.js.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

/**
 * Pedido de contas que ainda não estão na memória (modo 'on'). Quem calculava para: o app
 * mostra "Carregando…" e redesenha a tela quando a carga pedida em `falta` termina.
 */
class DadosIncompletos extends Error {
  constructor(origem, falta){
    super(`Contas ainda não carregadas: ${origem}`);
    this.name  = 'DadosIncompletos';
    this.falta = falta;
  }
}

/**
 * Modo da carga das contas e registro das faltas (pedidos fora da cobertura). Lido pela aba
 * "Dados" de Configurações: em 'sombra', mostra o que o modo 'on' carregaria sob demanda.
 */
const COBERTURA = {
  modo: 'off',
  faltas: new Map(),   // origem → {origem, vezes, falta, ultima}
  diag: null,          // último diagnóstico (fin-db.js, modo sombra)

  registrar(origem, falta){
    const f = this.faltas.get(origem) || {origem, vezes:0, falta};
    f.vezes++; f.ultima = new Date();
    this.faltas.set(origem, f);
  },

  /**
   * Diagnóstico com a base completa na memória: o que o modo 'on' leria ao abrir e o que
   * ele deixaria de ver. Critério para ligar o 'on' (README 3.5): as quatro listas vazias.
   * @param {Object[]} contas todas as contas
   * @param {{ini:string, fim:string, usuario:string, admin:boolean}} cfg janela e usuário
   */
  diagnostico(contas, {ini, fim, usuario, admin}){
    const base = respsDaVisao(usuario);
    const r = {total:contas.length, base:0, abertas:0, pendentes:0, unicas:0, porResp:{},
      emAbertoDivergente:[], abertasPerdidas:[], dataInvalida:[], respInvalido:[]};
    const ids = new Set();
    contas.forEach(c => {
      const resp = c.resp || '(vazio)';
      r.porResp[resp] = (r.porResp[resp] || 0) + 1;
      const dataOk = typeof c.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.data);
      if(!dataOk) r.dataInvalida.push(c.id);
      if(!RESPS.includes(c.resp)) r.respInvalido.push(c.id);
      const aberta = contaEmAberto(c);
      if(c.emAberto !== aberta) r.emAbertoDivergente.push(c.id);
      if(dataOk && c.data < ini && aberta && c.emAberto !== true) r.abertasPerdidas.push(c.id);
      if(dataOk && c.data >= ini && c.data <= fim && base.includes(c.resp)){ r.base++; ids.add(c.id); }
      if(dataOk && c.data < ini && c.emAberto === true){ r.abertas++; ids.add(c.id); }
      if(admin && aprovacaoPendente(c)){ r.pendentes++; ids.add(c.id); }
    });
    r.unicas = ids.size;
    return r;
  },
};

const CACHE = {
  _contas:  [],   // privado: use as consultas abaixo (contrato de cobertura)
  // O que está na memória: completa = coleção inteira; faixas = [{ini, fim, resps:Set}] de
  // vencimento; abertasAntes = todas as contas em aberto com vencimento antes desta data;
  // pendentes = todas as pendentes de aprovação; grupos = parcelamentos lidos inteiros.
  cob: {completa:true, faixas:[], abertasAntes:null, pendentes:false, grupos:new Set()},
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

  // ── COBERTURA DAS CONTAS (README 3.5) ──
  /** Zera a cobertura: true = coleção inteira na memória (modo 'off'). */
  resetCobertura(completa){
    this.cob = {completa:!!completa, faixas:[], abertasAntes:null, pendentes:false, grupos:new Set()};
  },

  /** Registra o que passou a estar na memória (fin-db.js quando a carga chega; sombra: simulado). */
  marcarCoberto(falta){
    if(!falta) return;
    if(falta.tudo) this.cob.completa = true;
    if(falta.ini && falta.fim) this.cob.faixas.push({ini:falta.ini, fim:falta.fim, resps:new Set(falta.resps || RESPS)});
    if(falta.abertasAntes) this.cob.abertasAntes = falta.abertasAntes;
    if(falta.pendentes) this.cob.pendentes = true;
    if(falta.grupo) this.cob.grupos.add(falta.grupo);
  },

  /**
   * O vencimento [ini, fim] está na memória para cada responsável? Faixas contíguas se somam
   * (2026 inteiro + 2027 inteiro cobrem dez/2026 a jan/2027).
   */
  cobre(ini, fim, resps){
    if(this.cob.completa) return true;
    return resps.every(r => {
      const fx = this.cob.faixas.filter(f => f.resps.has(r)).map(f => [f.ini, f.fim])
        .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
      let ate = null;   // coberto de ini até `ate`
      for(const [a, b] of fx){
        if(b < ini) continue;
        if(ate === null){ if(a > ini) return false; ate = b; }
        else { if(a > diaSeguinte(ate)) break; if(b > ate) ate = b; }
        if(ate >= fim) return true;
      }
      return ate !== null && ate >= fim;
    });
  },

  /**
   * Pedido fora da cobertura. 'sombra': registra e simula a carga (a base completa já está na
   * memória). 'on': pede a carga e interrompe o cálculo com DadosIncompletos.
   */
  _faltou(origem, falta){
    COBERTURA.registrar(origem, falta);
    if(COBERTURA.modo === 'sombra'){ this.marcarCoberto(falta); return; }
    if(COBERTURA.modo !== 'on') return;
    if(typeof FS !== 'undefined' && FS.garantirCobertura){
      FS.garantirCobertura(falta).catch(e => console.error('[Contas] carga sob demanda:', e));
    }
    throw new DadosIncompletos(origem, falta);
  },

  // ── CONSULTAS DE CONTAS ──
  /** Conta pelo ID, sem contrato: conta mostrada na tela está sempre na memória. null se não estiver. */
  contaPorId(id){ return this._contas.find(c => c.id === id) || null; },

  /** Contas na memória, sem contrato. Só para exibição que não soma nem decide (busca rápida, contagem). */
  contasCarregadas(){ return this._contas; },

  /**
   * Contas com vencimento em [ini, fim] (YYYY-MM-DD) da visão `resp` do filtro global
   * ('' = Todos; 'Leo' = Leo e compartilhadas; 'Leo & Pri' = compartilhadas).
   */
  contasEntre(ini, fim, resp = ''){
    const resps = respsDaVisao(resp);
    if(!this.cobre(ini, fim, resps)) this._faltou(`contas de ${ini} a ${fim} (${resp || 'Todos'})`, {ini, fim, resps});
    return this._contas.filter(c => typeof c.data === 'string' && c.data >= ini && c.data <= fim
      && (!resp || resps.includes(c.resp)));
  },

  /** Contas de um ano (null = todos os anos) da visão `resp`. */
  contasDoAno(ano, resp = ''){
    return ano == null ? this.contasTodas(resp) : this.contasEntre(`${ano}-01-01`, `${ano}-12-31`, resp);
  },

  /** Todas as contas, de todos os anos, da visão `resp`: exige a coleção inteira na memória. */
  contasTodas(resp = ''){
    if(!this.cob.completa) this._faltou(`todas as contas (${resp || 'Todos'})`, {tudo:true});
    if(!resp) return this._contas.slice();   // cópia: a tela pode acrescentar itens à lista
    const resps = respsDaVisao(resp);
    return this._contas.filter(c => resps.includes(c.resp));
  },

  /** Acesso legado (sem intervalo): o mesmo que contasTodas(''). Prefira as consultas com intervalo. */
  get contas(){ return this.contasTodas(''); },

  getByMes(mes, ano){ return (ano != null ? this.contasDoAno(ano) : this.contasTodas()).filter(c=>new Date(c.data+'T12:00').getMonth()===mes); },
  getByAnoMes(ano, mes, resp = ''){
    const base = ano === 'todos' ? this.contasTodas(resp) : this.contasDoAno(parseInt(ano), resp);
    return mes === 'todos' ? base : base.filter(c=>new Date(c.data+'T12:00').getMonth()===parseInt(mes));
  },

  /**
   * Atrasadas (vencidas e não quitadas) de qualquer ano, da visão `resp`. Cobertas pelas contas
   * em aberto de antes da janela (todas as pessoas) mais a janela até hoje.
   */
  getOverdue(resp = ''){
    const resps = respsDaVisao(resp), ini = this.cob.abertasAntes, hoje = today();
    const ok = this.cob.completa || (!!ini && this.cobre(ini, hoje, resps));
    if(!ok) this._faltou(`atrasadas (${resp || 'Todos'})`, ini ? {ini, fim:hoje, resps} : {tudo:true});
    return this._contas.filter(c => isOverdue(c) && (!resp || resps.includes(c.resp)));
  },
  /**
   * Contas vencidas e não quitadas com vencimento ANTES do mês de referência.
   * Fonte única da regra "atrasadas de meses anteriores" (Dashboard, Contas, Relatório).
   * @param {number} ano  ano de referência
   * @param {number} mes  mês de referência, 0-11
   * @param {string} resp visão do filtro global ('' = Todos)
   */
  getOverdueAntesDe(ano, mes, resp = ''){
    const inicio = `${ano}-${String(mes+1).padStart(2,'0')}-01`;
    return this.getOverdue(resp).filter(c => c.data < inicio);
  },

  /** Parcelas de um parcelamento, inteiro (todas as pessoas e anos): fin-db lê o grupo sob demanda. */
  getByGrupo(grupo){
    if(!this.cob.completa && !this.cob.grupos.has(grupo)) this._faltou(`parcelamento ${grupo}`, {grupo});
    return this._contas.filter(c=>c.grupo===grupo).sort((a,b)=>a.data.localeCompare(b.data));
  },
  /** Parcelas do grupo já na memória, sem contrato: só para decidir se a lista mostra o botão ≡. */
  grupoCarregado(grupo){ return this._contas.filter(c=>c.grupo===grupo); },

  /** Contas pendentes de aprovação (todas as pessoas e anos): base do sino do admin. */
  pendentesAprovacao(){
    if(!this.cob.completa && !this.cob.pendentes) this._faltou('pendentes de aprovação', {pendentes:true});
    return this._contas.filter(aprovacaoPendente);
  },

  getContasFiltradas(mes, resp, ano){
    const all = mes===null ? [...this.contasTodas()] : this.getByMes(mes, ano);
    if(!resp) return all.map(c=>({...c}));
    return filtrarPorResp(all, resp);
  },
  getTotalByMes(ano){
    const t=Array(12).fill(0);
    this.contasDoAno(ano).forEach(c=>{ const d=new Date(c.data+'T12:00'); const m=d.getMonth(); if(m>=0&&m<12)t[m]+=c.vPagar; });
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
    this.contasTodas().forEach(c=>{ const y=this._anoDe(c.data); if(y) anos.add(y); });
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

window.DadosIncompletos = DadosIncompletos;
