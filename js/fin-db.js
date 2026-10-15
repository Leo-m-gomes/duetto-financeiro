/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO fin-db.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade EXCLUSIVA: interação com Firestore.
 *   Nenhuma feature deve chamar fbDb.collection diretamente.
 *   Tudo passa por FS.* para centralizar auditoria, log e validação.
 *
 * DEPENDÊNCIAS:
 *   firebase-config.js: fbDb
 *   fin-state.js:       STATE, fmt, today, DEFAULT_TABELAS, SEED_*
 *   fin-cache.js:       CACHE
 *   app.js:             APP.renderPage, APP.renderContas (refs runtime)
 *
 * IMPORTAÇÃO NO HTML:
 *   Carregar APÓS fin-cache.js, ANTES de app.js.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

const FS = {

  async _log(evento, contaId, contaNome, detalhes, extras){
    try{
      await fbDb.collection('logs').add({
        evento,
        contaId:   contaId  || null,
        conta:     contaNome|| '—',
        usuario:   STATE.usuario,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        detalhes:  detalhes || '',
        ...extras,
      });
    }catch(e){ console.warn('Log error:', e); }
  },

  // ── CONTAS ──
  async addConta(data){
    const ref = await fbDb.collection('contas').add({...data, createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    await this._log('cadastro', ref.id, data.conta,
      `Cadastrado por ${STATE.usuario}`,
      {valor:data.vPagar, resp:data.resp, parcela:data.parcela||'1 de 1'}
    );
    return ref.id;
  },

  async updateConta(id, data){
    const antes = await fbDb.collection('contas').doc(id).get().catch(()=>null);
    await fbDb.collection('contas').doc(id).update({...data, updatedAt:firebase.firestore.FieldValue.serverTimestamp()});

    const CAMPOS = {conta:'Descrição',resp:'Responsável',formaId:'Forma',catId:'Categoria',data:'Data',vPagar:'Valor',parcela:'Parcela',nota:'Nota',dataCompra:'Data da compra'};
    let alteracoes = [];
    if(antes && antes.exists){
      const ant = antes.data();
      Object.keys(CAMPOS).forEach(campo=>{
        const de   = String(ant[campo]||'');
        const para = String(data[campo]!==undefined ? data[campo] : (ant[campo]||''));
        if(data[campo]!==undefined && de!==para){
          const label = CAMPOS[campo];
          const deLabel   = campo==='formaId'  ? CACHE.resolveForma(de)
                          : campo==='catId'     ? CACHE.resolveCat(de)
                          : campo==='vPagar'    ? fmt(parseFloat(de)||0)
                          : de;
          const paraLabel = campo==='formaId'  ? CACHE.resolveForma(para)
                          : campo==='catId'     ? CACHE.resolveCat(para)
                          : campo==='vPagar'    ? fmt(parseFloat(para)||0)
                          : para;
          alteracoes.push(`${label}: "${deLabel}" → "${paraLabel}"`);
        }
      });
    }
    const nome = data.conta || (antes?.exists ? antes.data().conta : '—');
    const detalhes = alteracoes.length ? alteracoes.join(' | ') : 'Atualização sem alterações detectadas';
    await this._log('edicao', id, nome, detalhes, {valor:data.vPagar, alteracoes});
  },

  async deleteConta(id, motivo){
    const contaRef = fbDb.collection('contas').doc(id);
    const dados = await fbDb.runTransaction(async tx => {
      const snap = await tx.get(contaRef);
      if(!snap.exists) return null;
      const d = snap.data();
      const lixRef = fbDb.collection('lixeira').doc();
      tx.set(lixRef, {
        ...d,
        origemId:      id,
        origemColecao: 'contas',
        excluidoPor:   STATE.usuario,
        excluidoEm:    new Date().toISOString(),
        motivo:        motivo||'exclusão manual',
        excluidoAt:    firebase.firestore.FieldValue.serverTimestamp(),
      });
      tx.delete(contaRef);
      return d;
    });
    if(!dados) return;
    await this._log('exclusao', id, dados.conta,
      `Excluído por ${STATE.usuario}${motivo?' — '+motivo:''}`,
      {valor:dados.vPagar, resp:dados.resp, parcela:dados.parcela}
    );
  },

  async pagarConta(id, quem, valorPago){
    const snap = await fbDb.collection('contas').doc(id).get().catch(()=>null);
    const nome  = snap?.exists ? snap.data().conta : '—';
    const parc  = snap?.exists ? snap.data().parcela : '';
    // Blindagem: conta compartilhada com pagamento parcial não pode ser
    // quitada por sobrescrita — a parte faltante deve ir por pagarContaIndividual.
    if(snap?.exists){
      const d = snap.data();
      if(d.resp==='Leo & Pri' && d.pagamentos && (!!d.pagamentos.Leo !== !!d.pagamentos.Pri)){
        throw new Error('Conta compartilhada com pagamento parcial — registre a parte faltante pelo pagamento individual');
      }
    }
    await fbDb.collection('contas').doc(id).update({
      vPago:  valorPago,
      paidBy: quem,
      paidAt: today(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await this._log('pagamento', id, nome,
      `Pagamento de ${fmt(valorPago)} registrado por ${quem}${parc?' ('+parc+')':''}`,
      {valor:valorPago, resp:quem}
    );
  },

  async pagarContaIndividual(id, resp, quem, valorPago){
    const contaRef = fbDb.collection('contas').doc(id);
    const result = await fbDb.runTransaction(async tx => {
      const snap = await tx.get(contaRef);
      if(!snap.exists) return null;
      const d = snap.data();
      if(d.pagamentos?.[resp]) return {erro:`${resp} já registrou pagamento nesta conta`};
      const pgNovo = {valor:valorPago, paidBy:quem, paidAt:today()};
      const pagamentos = {...(d.pagamentos||{}), [resp]:pgNovo};
      const vPagoTotal = Object.values(pagamentos).reduce((s,p)=>s+(p.valor||0),0);
      tx.update(contaRef, {
        [`pagamentos.${resp}`]: pgNovo,
        vPago: vPagoTotal,
        paidBy: quem,
        paidAt: today(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return {nome:d.conta, parcela:d.parcela, quitada:Object.keys(pagamentos).length>=2};
    });
    if(!result) return;
    if(result.erro) throw new Error(result.erro);
    const evento = result.quitada ? 'pagamento_complementar' : 'pagamento_individual';
    const status = result.quitada ? 'conta integralmente quitada' : 'pagamento parcial';
    await this._log(evento, id, result.nome,
      `Pagamento de ${fmt(valorPago)} (${resp}) por ${quem}${result.parcela?' ('+result.parcela+')':''} — ${status}`,
      {valor:valorPago, resp, tipoPagamento:result.quitada?'complementar':'individual'}
    );
  },

  async desfazerPagamentoIndividual(id, resp){
    const contaRef = fbDb.collection('contas').doc(id);
    const result = await fbDb.runTransaction(async tx => {
      const snap = await tx.get(contaRef);
      if(!snap.exists) return null;
      const d = snap.data();
      if(!d.pagamentos?.[resp]) return null;
      const valor = d.pagamentos[resp].valor;
      const restantes = {...d.pagamentos};
      delete restantes[resp];
      const vPagoTotal = Object.values(restantes).reduce((s,p)=>s+(p.valor||0),0);
      const updates = {
        [`pagamentos.${resp}`]: firebase.firestore.FieldValue.delete(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if(vPagoTotal > 0){
        const outroResp = Object.keys(restantes)[0];
        updates.vPago = vPagoTotal;
        updates.paidBy = restantes[outroResp].paidBy;
        updates.paidAt = restantes[outroResp].paidAt;
      } else {
        updates.vPago = null;
        updates.paidBy = firebase.firestore.FieldValue.delete();
        updates.paidAt = firebase.firestore.FieldValue.delete();
      }
      tx.update(contaRef, updates);
      return {nome:d.conta, valor};
    });
    if(!result) return;
    await this._log('desfazer_pagamento_individual', id, result.nome,
      `Pagamento de ${resp} (${fmt(result.valor)}) desfeito por ${STATE.usuario}`,
      {valor:result.valor, resp}
    );
  },

  // Desfaz só o pagamento: vPagar (valor original) NÃO é tocado. Antes ele era
  // sobrescrito pelo valor pago, corrompendo o original quando havia juros/desconto.
  async desfazerPagamento(id){
    const snap = await fbDb.collection('contas').doc(id).get().catch(()=>null);
    const d    = snap?.exists ? snap.data() : {};
    const nome = d.conta || '—';
    await fbDb.collection('contas').doc(id).update({
      vPago:  null,
      paidBy: firebase.firestore.FieldValue.delete(),
      paidAt: firebase.firestore.FieldValue.delete(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await this._log('desfazer_pagamento', id, nome,
      `Pagamento de ${fmt(d.vPago||0)} desfeito por ${STATE.usuario} — valor a pagar mantido: ${fmt(d.vPagar||0)}`,
      {valor:d.vPago||0}
    );
  },

  // ── SALÁRIOS ──
  async saveSalario(id,data){ await fbDb.collection('salarios').doc(id).set(data,{merge:true}); },
  async deleteSalario(id){ await fbDb.collection('salarios').doc(id).delete(); },

  // ── OUTRAS RECEITAS ──
  async addOutra(data){ await fbDb.collection('outras_receitas').add({...data,createdAt:firebase.firestore.FieldValue.serverTimestamp()}); },
  async updateOutra(id,data){ await fbDb.collection('outras_receitas').doc(id).update(data); },
  async deleteOutra(id){ await fbDb.collection('outras_receitas').doc(id).delete(); },
  /**
   * Grava o `ano` de receitas cadastradas antes do controle por ano. Só acrescenta o campo:
   * valores, descrição e responsável não são tocados.
   * @param {{id:string, ano:number}[]} pares
   */
  async definirAnoOutras(pares){
    for(let i=0;i<pares.length;i+=400){
      const batch = fbDb.batch();
      pares.slice(i,i+400).forEach(({id,ano})=>batch.update(fbDb.collection('outras_receitas').doc(id),{ano}));
      await batch.commit();
    }
  },

  // ── CATEGORIAS ──
  async addCat(nome){ const ref=await fbDb.collection('categorias').add({nome}); return ref.id; },
  async updateCat(id,nome){ await fbDb.collection('categorias').doc(id).update({nome}); },
  async deleteCat(id){ await fbDb.collection('categorias').doc(id).delete(); },

  // ── FORMAS ──
  async addForma(nome){ const ref=await fbDb.collection('formas').add({nome}); return ref.id; },
  async updateForma(id,nome){ await fbDb.collection('formas').doc(id).update({nome}); },
  async deleteForma(id){ await fbDb.collection('formas').doc(id).delete(); },

  // ── TABELAS ──
  async saveTabelas(data){ await fbDb.collection('config').doc('tabelas').set(data); },

  // ── EAC: GRUPOS DE CATEGORIAS, LINHAS DE BASE E EXCLUSÕES ──
  // Toda escrita da tela EAC passa por aqui e registra em eac_log. Falha no log não bloqueia.
  async _logEac(evento, detalhes, extras){
    try{
      await fbDb.collection('eac_log').add({
        evento, usuario:STATE.usuario, detalhes:detalhes||'',
        timestamp:firebase.firestore.FieldValue.serverTimestamp(), ...extras,
      });
    }catch(e){ console.warn('Log EAC error:', e); }
  },

  /**
   * EAC: toda alteração (linha de base, classificação de excluídas, grupos) é do administrador.
   * Trava do lado do cliente; a regra do Firestore deve repetir a restrição (README, seção 15).
   */
  _exigirAdminEac(){
    const ok = (typeof SEC!=='undefined' && SEC.isAdmin && SEC.isAdmin()) || STATE.usuario==='Leo';
    if(!ok) throw new Error('Somente o administrador pode alterar a EAC');
  },

  /** Grava em lotes de 400 operações (limite do Firestore: 500 por lote). */
  async _emLotes(ops){
    for(let i=0;i<ops.length;i+=400){
      const batch = fbDb.batch();
      ops.slice(i,i+400).forEach(fn=>fn(batch));
      await batch.commit();
    }
  },

  async addGrupo(nome, ordem, cor){
    this._exigirAdminEac();
    const ref = await fbDb.collection('categoria_grupos').add({
      nome, ordem, cor, createdBy:STATE.usuario, createdAt:firebase.firestore.FieldValue.serverTimestamp(),
    });
    await this._logEac('grupo_criado', `Grupo "${nome}" criado`, {grupoId:ref.id});
    return ref.id;
  },

  async renomearGrupo(id, nomeAntes, nome){
    this._exigirAdminEac();
    await fbDb.collection('categoria_grupos').doc(id).update({
      nome, updatedBy:STATE.usuario, updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
    });
    await this._logEac('grupo_renomeado', `"${nomeAntes}" → "${nome}"`, {grupoId:id});
  },

  /** Regrava a ordem (0..n-1) na sequência recebida de IDs. */
  async ordenarGrupos(ids){
    this._exigirAdminEac();
    await this._emLotes(ids.map((id,i)=>b=>b.update(fbDb.collection('categoria_grupos').doc(id),{ordem:i})));
    await this._logEac('grupo_ordem', 'Ordem dos grupos alterada', {ordem:ids});
  },

  /** Exclui o grupo e devolve as categorias dele para "Sem grupo" (valores não mudam). */
  async excluirGrupo(id, nome, catIds){
    this._exigirAdminEac();
    const del = firebase.firestore.FieldValue.delete();
    await this._emLotes([
      b=>b.delete(fbDb.collection('categoria_grupos').doc(id)),
      ...catIds.map(c=>b=>b.update(fbDb.collection('categorias').doc(c),{grupoId:del})),
    ]);
    await this._logEac('grupo_excluido', `Grupo "${nome}" excluído; ${catIds.length} categoria(s) em "Sem grupo"`, {grupoId:id});
  },

  /** Move categorias para um grupo (grupoId null = "Sem grupo"). */
  async moverCategorias(catIds, grupoId, destino){
    this._exigirAdminEac();
    const val = grupoId || firebase.firestore.FieldValue.delete();
    await this._emLotes(catIds.map(c=>b=>b.update(fbDb.collection('categorias').doc(c),{grupoId:val})));
    const nomes = catIds.map(c=>CACHE.getCatNome(c)).join(', ');
    await this._logEac('categoria_movida', `${nomes} → ${destino}`, {grupoId:grupoId||null, catIds});
  },

  /** Cria vários grupos de uma vez com as categorias de cada um (sugestão inicial). */
  async criarGruposIniciais(lista){
    this._exigirAdminEac();
    const ops = [];
    lista.forEach(g=>{
      const ref = fbDb.collection('categoria_grupos').doc();
      ops.push(b=>b.set(ref,{nome:g.nome, ordem:g.ordem, cor:g.cor, createdBy:STATE.usuario, createdAt:firebase.firestore.FieldValue.serverTimestamp()}));
      g.catIds.forEach(c=>ops.push(b=>b.update(fbDb.collection('categorias').doc(c),{grupoId:ref.id})));
    });
    await this._emLotes(ops);
    await this._logEac('grupo_criado', `Sugestão inicial aplicada: ${lista.length} grupos`, {});
  },

  /**
   * Salva uma revisão de linha de base. O ID fixo "<ano>-r<rev>" e a transação impedem duas
   * revisões com o mesmo número. As contas da foto vão para eac_lb_itens em lotes de 400.
   * Revisões são imutáveis: não existe método para editar ou apagar.
   * @param {Object} cab   cabeçalho (ano, rev, escopo, catIds, justificativa, totalCent, porCat...)
   * @param {Array}  itens [{id, conta, catId, resp, mes, vCent}]
   */
  async salvarLB(cab, itens){
    this._exigirAdminEac();
    const id  = `${cab.ano}-r${cab.rev}`;
    const ref = fbDb.collection('eac_lb').doc(id);
    const lotes = [];
    for(let i=0;i<itens.length;i+=400) lotes.push(itens.slice(i,i+400));
    if(lotes.length > 450) throw new Error('Linha de base grande demais para uma gravação');
    await fbDb.runTransaction(async tx=>{
      const snap = await tx.get(ref);
      if(snap.exists) throw new Error(`A Rev ${cab.rev} de ${cab.ano} acabou de ser salva. Feche o modal e abra de novo.`);
      tx.set(ref, {...cab, lotes:lotes.length, criadaEm:firebase.firestore.FieldValue.serverTimestamp()});
      lotes.forEach((l,n)=>tx.set(fbDb.collection('eac_lb_itens').doc(`${id}-${n}`), {lbId:id, ano:cab.ano, rev:cab.rev, lote:n, itens:l}));
    });
    const escopo = cab.escopo==='geral' ? 'geral' : `${cab.catIds.length} categoria(s)`;
    await this._logEac('lb_salva', `Rev ${cab.rev} de ${cab.ano} (${escopo})${cab.justificativa?': '+cab.justificativa:''}`,
      {ano:cab.ano, rev:cab.rev, lbId:id, totalCent:cab.totalCent});
    return id;
  },

  /** Lixeira de contas (para mostrar quem excluiu e quando na EAC). */
  async lerLixeira(){
    const snap = await fbDb.collection('lixeira').get();
    return snap.docs.map(d=>({_lid:d.id, ...d.data()}));
  },

  /** Contas que formaram uma linha de base (lidas sob demanda; a LB não muda depois de salva). */
  async lerItensLB(lbId){
    const snap = await fbDb.collection('eac_lb_itens').where('lbId','==',lbId).get();
    return snap.docs.map(d=>d.data()).sort((a,b)=>a.lote-b.lote).flatMap(d=>d.itens||[]);
  },

  /**
   * Classifica contas excluídas: 'cancelada' (economia) ou 'indevida' (cadastro errado, sai do
   * Planejado). Fica em eac_exclusoes (ID = ID da conta), separado da lixeira.
   * @param {Array} regs [{contaId, ano, conta, catId, resp, vCent}]
   */
  async classificarExclusoes(regs, classificacao){
    this._exigirAdminEac();
    if(!regs.length) return;
    await this._emLotes(regs.map(r=>b=>b.set(fbDb.collection('eac_exclusoes').doc(r.contaId),{
      ...r, classificacao, definidoPor:STATE.usuario, definidoEmIso:new Date().toISOString(),
      definidoEm:firebase.firestore.FieldValue.serverTimestamp(),
    })));
    await this._logEac('exclusao_classificada', `${regs.map(r=>r.conta).join(', ')} → ${classificacao}`,
      {contaIds:regs.map(r=>r.contaId), classificacao});
  },
};


// ── LISTENERS TEMPO REAL ──
const listeners = [];

function setupListeners(){
  // Guard: só re-renderiza se o app já mostrou a tela principal
  // E a view ativa (page-{STATE.page}) existe no DOM.
  const _canReRender = () => {
    if(!CACHE._ready.has('_appShown')) return false;
    return !!document.getElementById('page-' + STATE.page);
  };

  listeners.push(
    fbDb.collection('contas').onSnapshot(snap=>{
      CACHE.contas=snap.docs.map(d=>({id:d.id,...d.data()}));
      CACHE.markReady('contas');
      if(_canReRender()) APP.renderPage(STATE.page);
    }),
    fbDb.collection('salarios').onSnapshot(snap=>{
      CACHE.salarios=snap.docs.map(d=>({id:d.id,...d.data()}));
      CACHE.markReady('salarios');
      if(_canReRender()) APP.renderPage(STATE.page);
    }),
    fbDb.collection('outras_receitas').onSnapshot(snap=>{
      CACHE.outras=snap.docs.map(d=>({id:d.id,...d.data()}));
      CACHE.markReady('outras');
      if(_canReRender()) APP.renderPage(STATE.page);
    }),
    fbDb.collection('categorias').onSnapshot(snap=>{
      CACHE.cats=snap.docs.map(d=>({id:d.id,...d.data()}));
      CACHE.markReady('cats');
      if(_canReRender()){
        if(STATE.page==='contas') APP.renderContas();
        APP.eacAoMudarDados?.();   // grupo da categoria mudou: tabela EAC e modal de grupos
        const ov=document.getElementById('ovGerenciar');
        if(ov&&ov.classList.contains('open')&&STATE.gerenciarTipo==='cat') APP.renderGerenciarLista();
      }
    }),
    fbDb.collection('formas').onSnapshot(snap=>{
      CACHE.formas=snap.docs.map(d=>({id:d.id,...d.data()}));
      CACHE.markReady('formas');
      const ov=document.getElementById('ovGerenciar');
      if(ov&&ov.classList.contains('open')&&STATE.gerenciarTipo==='forma') APP.renderGerenciarLista();
    }),
    fbDb.collection('config').doc('tabelas').onSnapshot(snap=>{
      CACHE.tabelas=snap.exists?snap.data():DEFAULT_TABELAS;
    }),
    // EAC: coleções pequenas, fora do markReady (o app abre sem esperar por elas).
    // Erro (ex.: regra do Firestore ainda sem a coleção) só avisa no console.
    ...[['categoria_grupos','grupos'],['eac_lb','lbs'],['eac_exclusoes','eacExcl']].map(([col,chave])=>
      fbDb.collection(col).onSnapshot(snap=>{
        CACHE[chave]=snap.docs.map(d=>({id:d.id,...d.data()}));
        if(_canReRender()) APP.eacAoMudarDados?.();
      }, err=>console.warn(`[EAC] ${col}:`, err.message))
    )
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
