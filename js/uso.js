/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO uso.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Mede o uso do Firestore feito por ESTE app (leituras, gravações e exclusões), para a aba
 * "Uso" de Configurações (js/uso-tela.js, README 13.5).
 *
 * COMO MEDE: instrumenta os protótipos do SDK compat (get e onSnapshot de consultas e
 * documentos, set/update/delete/add, lotes e transações). Toda chamada do app entra na conta
 * sem mexer nos módulos. A contagem segue a regra de cobrança do Firestore:
 *   • get de consulta: 1 leitura por documento (mínimo 1, também sem resultado);
 *   • get de documento: 1 leitura;
 *   • listener: carga inicial = 1 por documento (mínimo 1); depois, 1 por documento novo ou
 *     alterado; resposta só do cache local não conta;
 *   • set/update/add: 1 gravação; delete: 1 exclusão; lotes e transações contam cada operação
 *     (só as confirmadas pelo servidor).
 * É uma estimativa: leituras do Console, de outros apps e de listeners que o servidor cobra de
 * novo após mais de 30 min sem conexão ficam de fora. O número oficial está no Console.
 *
 * GRAVAÇÃO: soma do dia em uso_diario/{dia} com FieldValue.increment: 1 gravação a cada
 * 5 min com uso pendente, ao esconder a aba e ao sair. O dia é o da cota do Firebase (vira à
 * meia-noite do horário do Pacífico). A gravação do uso também entra na conta.
 * Contagem nunca quebra a operação do app: cada passo fica em try/catch.
 *
 * EXPORTS: window.USO, window.USO_COTA
 * IMPORTAÇÃO: logo após firebase-config.js, antes de qualquer leitura do Firestore.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

// Cota grátis do Firestore (plano Spark): por dia de cota; armazenamento total em bytes
const USO_COTA = Object.freeze({ leituras: 50000, gravacoes: 20000, exclusoes: 20000, bytes: 1024 ** 3 });

const USO = (() => {
  const COLECAO  = 'uso_diario';
  const FLUSH_MS = 5 * 60 * 1000;
  const TIPOS    = Object.freeze({l: 'leituras', g: 'gravacoes', e: 'exclusoes'});
  const fmtDia   = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'});
  /** Dia de cota do Firebase (YYYY-MM-DD no horário do Pacífico). */
  const diaCota  = (d = new Date()) => fmtDia.format(d);

  const zerado = () => ({l: 0, g: 0, e: 0, carga: 0, col: {}});
  const sessao = {inicio: new Date(), ...zerado(), listeners: 0};   // desde que o app abriu
  let pend = zerado(), diaPend = diaCota();                           // ainda não gravado
  let ultimaGravacao = null, erro = '', desligado = false;
  const diasComSessao = new Set();                                    // aberturas já somadas
  const orig = {};

  function somar(alvo, tipo, col, n){
    alvo[tipo] += n;
    const c = alvo.col[col] || (alvo.col[col] = {l: 0, g: 0, e: 0});
    c[tipo] += n;
  }

  /** Conta n operações do tipo ('l', 'g' ou 'e') na coleção. Virou o dia de cota: grava antes. */
  function contar(tipo, col, n = 1){
    if(!n) return;
    try{
      if(diaCota() !== diaPend) gravar();
      somar(sessao, tipo, col || '?', n);
      somar(pend, tipo, col || '?', n);
    }catch(e){ /* medição nunca interrompe o app */ }
  }

  const colDoc = ref => { try{ return ref.parent.id; }catch(e){ return '?'; } };
  // Consulta (where/orderBy): o SDK compat não expõe o caminho; o interno é tentativa, com '?' de reserva
  const colConsulta = q => { try{ return q.id || q._delegate._query.path.lastSegment(); }catch(e){ return '?'; } };

  function embrulhar(proto, nome, fazer){
    const o = proto && proto[nome];
    if(typeof o !== 'function') return null;
    proto[nome] = fazer(o);
    return o;
  }

  /** onSnapshot com contagem por snapshot e controle de listeners ativos. */
  function embrulharListener(o, deDocumento){
    return function(...args){
      const self = this;
      let primeira = true;
      const conta = s => {
        try{
          if(!s || s.metadata.fromCache) return;
          let n, col;
          if(deDocumento){ n = 1; col = colDoc(self); }
          else if(primeira){ n = Math.max(1, s.size); col = s.docs[0]?.ref.parent.id || colConsulta(self); }
          else {
            const mud = s.docChanges().filter(c => c.type !== 'removed');
            n = mud.length; col = mud[0]?.doc.ref.parent.id || colConsulta(self);
          }
          if(primeira){ sessao.carga += n; pend.carga += n; }
          primeira = false;
          contar('l', col, n);
        }catch(e){}
      };
      const i = args.findIndex(a => typeof a === 'function' || (a && typeof a.next === 'function'));
      if(i >= 0){
        const a = args[i];
        args[i] = typeof a === 'function'
          ? function(s){ conta(s); return a.apply(this, arguments); }
          : {next: s => { conta(s); return a.next(s); }, error: a.error && (e => a.error(e)), complete: a.complete && (() => a.complete())};
      }
      const parar = o.apply(this, args);
      sessao.listeners++;
      let ativo = true;
      return function(){ if(ativo){ ativo = false; sessao.listeners--; } return parar.apply(this, arguments); };
    };
  }

  function instrumentar(){
    const F = typeof firebase !== 'undefined' && firebase.firestore;
    if(!F || !F.Query || !F.DocumentReference){ erro = 'SDK do Firestore sem os pontos de medição'; desligado = true; return; }

    embrulhar(F.Query.prototype, 'get', o => function(...a){
      return o.apply(this, a).then(s => {
        try{ if(!s.metadata.fromCache) contar('l', s.docs[0]?.ref.parent.id || colConsulta(this), Math.max(1, s.size)); }catch(e){}
        return s;
      });
    });
    embrulhar(F.DocumentReference.prototype, 'get', o => function(...a){
      return o.apply(this, a).then(s => {
        try{ if(!s.metadata.fromCache) contar('l', colDoc(this)); }catch(e){}
        return s;
      });
    });
    embrulhar(F.Query.prototype, 'onSnapshot', o => embrulharListener(o, false));
    embrulhar(F.DocumentReference.prototype, 'onSnapshot', o => embrulharListener(o, true));

    // Gravações diretas: contam quando o servidor confirma
    [['set', 'g'], ['update', 'g'], ['delete', 'e']].forEach(([nome, tipo]) => {
      orig[nome] = embrulhar(F.DocumentReference.prototype, nome, o => function(...a){
        return o.apply(this, a).then(r => { contar(tipo, colDoc(this)); return r; });
      });
      // Lote e transação: anotam a operação e contam no commit bem-sucedido
      [F.WriteBatch, F.Transaction].forEach(Cls => embrulhar(Cls && Cls.prototype, nome, o => function(ref, ...a){
        try{ (this.__uso || (this.__uso = [])).push([tipo, colDoc(ref)]); }catch(e){}
        return o.call(this, ref, ...a);
      }));
    });
    embrulhar(F.CollectionReference && F.CollectionReference.prototype, 'add', o => function(...a){
      return o.apply(this, a).then(r => { contar('g', this.id); return r; });
    });
    embrulhar(F.WriteBatch && F.WriteBatch.prototype, 'commit', o => function(...a){
      const ops = this.__uso || [];
      return o.apply(this, a).then(r => { ops.forEach(([t, c]) => contar(t, c)); return r; });
    });
    // Transação: leitura conta na hora (é cobrada mesmo se a tentativa repetir); gravações só
    // da tentativa que foi confirmada
    embrulhar(F.Transaction && F.Transaction.prototype, 'get', o => function(ref, ...a){
      return o.call(this, ref, ...a).then(s => { contar('l', colDoc(ref)); return s; });
    });
    embrulhar(F.Firestore && F.Firestore.prototype, 'runTransaction', o => function(fn, ...a){
      let ultima = null;
      return o.call(this, tx => { ultima = tx; tx.__uso = []; return fn(tx); }, ...a)
        .then(r => { (ultima?.__uso || []).forEach(([t, c]) => contar(t, c)); return r; });
    });
  }

  const usuario = () => (typeof STATE !== 'undefined' && STATE.usuario) || '';

  /**
   * Grava o uso pendente em uso_diario/{dia} (merge + increment). O pendente é separado antes
   * do await: o que for contado durante a gravação fica para a próxima. Falha de permissão
   * desliga a gravação nesta sessão (a contagem da sessão continua).
   */
  async function gravar(){
    const u = usuario();
    if(desligado || !orig.set || !u || typeof fbAuth === 'undefined' || !fbAuth.currentUser) return;
    const lote = pend, dia = diaPend;
    if(!lote.l && !lote.g && !lote.e) return;
    pend = zerado(); diaPend = diaCota();
    const inc = firebase.firestore.FieldValue.increment;
    const colecoes = {};
    Object.entries(lote.col).forEach(([c, v]) => {
      colecoes[c] = {};
      Object.keys(TIPOS).forEach(t => { if(v[t]) colecoes[c][t] = inc(v[t]); });
    });
    // A própria gravação do uso entra na conta (1 gravação)
    colecoes[COLECAO] = {...colecoes[COLECAO], g: inc((lote.col[COLECAO]?.g || 0) + 1)};
    const dados = {
      dia, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      leituras: {[u]: inc(lote.l)}, gravacoes: {[u]: inc(lote.g + 1)}, exclusoes: {[u]: inc(lote.e)},
      carga: {[u]: inc(lote.carga)}, colecoes,
    };
    // Abertura do app: 1 por dia de cota. Marcada antes do await: offline, a gravação fica na
    // fila do SDK e a próxima não soma a abertura de novo
    const novaSessao = !diasComSessao.has(dia);
    if(novaSessao){ dados.sessoes = {[u]: inc(1)}; diasComSessao.add(dia); }
    try{
      await orig.set.call(fbDb.collection(COLECAO).doc(dia), dados, {merge: true});
      somar(sessao, 'g', COLECAO, 1);
      ultimaGravacao = new Date(); erro = '';
    }catch(e){
      erro = e.message || String(e);
      if(novaSessao) diasComSessao.delete(dia);
      if(e.code === 'permission-denied') desligado = true;   // regra do Firestore sem uso_diario
      else devolver(lote);
    }
  }

  /** Falha que não é de permissão: o lote volta para o pendente e vai na próxima gravação. */
  function devolver(lote){
    Object.keys(TIPOS).forEach(t => { pend[t] += lote[t]; });
    pend.carga += lote.carga;
    Object.entries(lote.col).forEach(([c, v]) => {
      const alvo = pend.col[c] || (pend.col[c] = {l: 0, g: 0, e: 0});
      Object.keys(TIPOS).forEach(t => { alvo[t] += v[t]; });
    });
  }

  /**
   * Dias de uso_diario a partir de `desde` (ID 'YYYY-MM-DD'), em ordem crescente. Intervalo
   * crescente pelo ID: o Firestore não faz varredura decrescente por ID de documento.
   * Somente o admin lê; a leitura também é contada.
   */
  async function lerDias(desde){
    const snap = await fbDb.collection(COLECAO)
      .where(firebase.firestore.FieldPath.documentId(), '>=', desde).get();
    return snap.docs.map(d => ({id: d.id, ...d.data()}));
  }

  /** Retrato da sessão para a tela (cópia: a tela não altera o estado). */
  function retrato(){
    return {
      inicio: sessao.inicio, l: sessao.l, g: sessao.g, e: sessao.e, carga: sessao.carga,
      listeners: sessao.listeners, col: JSON.parse(JSON.stringify(sessao.col)),
      pend: {l: pend.l, g: pend.g, e: pend.e, carga: pend.carga}, ultimaGravacao, erro, desligado, dia: diaCota(),
    };
  }

  try{ instrumentar(); }catch(e){ erro = e.message; desligado = true; }
  setInterval(() => { gravar(); }, FLUSH_MS);
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') gravar(); });
  window.addEventListener('pagehide', () => { gravar(); });

  return {COLECAO, TIPOS, diaCota, gravar, lerDias, retrato};
})();

window.USO = USO;
window.USO_COTA = USO_COTA;
