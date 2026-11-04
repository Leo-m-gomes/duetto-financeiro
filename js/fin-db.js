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
 *   fin-cache.js:       CACHE, COBERTURA, DadosIncompletos (contrato de cobertura, README 3.5)
 *   security.js:        ehAdmin/ADMIN_USERS (EAC e pendentes só do admin)
 *   app.js:             APP.renderPage, APP.renderContas (refs runtime)
 *
 * IMPORTAÇÃO NO HTML:
 *   Carregar APÓS fin-cache.js, ANTES de app.js.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

// Permissões das contas (permConta em fin-state.js, README 5). As telas avisam antes;
// estas mensagens só aparecem se uma gravação escapar da tela (ex.: dado mudou nesse meio-tempo).
const MSG_CONTA_ADMIN = 'Somente o administrador pode alterar esta conta';
const MSG_CONTA_NOTA  = 'Nesta conta você pode alterar só a nota e registrar pagamento; o restante, somente o administrador';

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
  /**
   * Divisão (README 8.3): só conta "Leo & Pri" guarda `divisao`, sempre normalizada a partir
   * da parte do Leo (a da Pri é o resto). Faixa 1% a 99%; fora dela, erro.
   */
  _divisaoNormal(divisao){
    const leo = divisao ? divisao.Leo : DIV_PADRAO;
    if(!divValida(leo)) throw new Error('Divisão inválida: cada parte deve ficar entre 1% e 99%');
    return montarDivisao(leo);
  },

  /**
   * Cadastro. O autor (`createdBy`) é sempre quem está logado: é a base das permissões.
   * Não admin que põe o admin como responsável (inclusive compartilhada) deixa a conta
   * pendente de aprovação; o cadastro acontece normalmente.
   */
  async addConta(data){
    const doc = {...data, createdBy:STATE.usuario};
    if(doc.resp==='Leo & Pri') doc.divisao = this._divisaoNormal(doc.divisao);
    else delete doc.divisao;
    delete doc.aprovacao;
    const pendente = precisaAprovacao(doc.resp, STATE.usuario);
    if(pendente) doc.aprovacao = this._aprovacaoPendente('cadastro', '');
    doc.emAberto = contaEmAberto(doc);
    const ref = await fbDb.collection('contas').add({...doc, createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    await this._log('cadastro', ref.id, doc.conta,
      `Cadastrado por ${STATE.usuario}${doc.divisao?` · divisão ${fmtDivisao(doc)}`:''}${pendente?' · aguarda aprovação do administrador':''}`,
      {valor:doc.vPagar, resp:doc.resp, parcela:doc.parcela||'1 de 1'}
    );
    return ref.id;
  },

  /**
   * Campo derivado emAberto (README 6.1) para uma gravação: só entra quando muda, assim uma
   * edição que não mexe no pagamento não altera o campo (a regra do Firestore compara campos).
   * @param {Object} ant   conta como está no Firestore ({} no cadastro)
   * @param {Object} final conta como ficará depois da gravação
   * @returns {{emAberto?:boolean}}
   */
  _emAbertoUpd(ant, final){
    const v = contaEmAberto(final);
    return ant && ant.emAberto === v ? {} : {emAberto:v};
  },

  /** Marca de pendência de aprovação (campo `aprovacao` da conta, README 6.1). */
  _aprovacaoPendente(motivo, detalhes){
    return {status:'pendente', motivo, por:STATE.usuario, detalhes:detalhes||'',
      emIso:new Date().toISOString(), em:firebase.firestore.FieldValue.serverTimestamp()};
  },

  /**
   * Trava de permissão da edição (permConta). Acesso parcial só altera a nota.
   * @param {Object} d   conta como está no Firestore
   * @param {Object} upd campos enviados
   */
  _exigirPermConta(d, upd){
    const p = permConta(d, STATE.usuario);
    if(p.editar) return;
    if(p.nota && Object.keys(upd).every(k=>k==='nota'||k==='updatedBy')) return;
    throw new Error(p.nota ? MSG_CONTA_NOTA : MSG_CONTA_ADMIN);
  },

  /** Campos alterados ("Valor: "R$ 10,00" → "R$ 12,00""), para o log e a aprovação. */
  _alteracoesConta(ant, data){
    const CAMPOS = {conta:'Descrição',resp:'Responsável',formaId:'Forma',catId:'Categoria',data:'Data',vPagar:'Valor',parcela:'Parcela',nota:'Nota',dataCompra:'Data da compra'};
    const rotulo = (campo, v) => campo==='formaId' ? CACHE.resolveForma(v)
                               : campo==='catId'   ? CACHE.resolveCat(v)
                               : campo==='vPagar'  ? fmt(parseFloat(v)||0)
                               : v;
    const alteracoes = [];
    Object.keys(CAMPOS).forEach(campo=>{
      if(data[campo]===undefined) return;
      // ?? '': dataCompra null virava "null" e toda edição registrava uma alteração falsa
      const de = String(ant[campo]??''), para = String(data[campo]??'');
      if(de!==para) alteracoes.push(`${CAMPOS[campo]}: "${rotulo(campo,de)}" → "${rotulo(campo,para)}"`);
    });
    // Divisão: objeto, comparado pela parte do Leo ("50/50" → "60/40")
    const respFinal = data.resp!==undefined ? data.resp : ant.resp;
    if(respFinal==='Leo & Pri' && data.divisao!==undefined){
      const novo = {divisao:montarDivisao(data.divisao.Leo)};
      if(ant.resp!=='Leo & Pri') alteracoes.push(`Divisão: "—" → "${fmtDivisao(novo)}"`);
      else if(divLeo(ant)!==novo.divisao.Leo) alteracoes.push(`Divisão: "${fmtDivisao(ant)}" → "${fmtDivisao(novo)}"`);
    }
    return alteracoes;
  },

  /**
   * Edição de uma conta, em transação: as travas (permissão e divisão) leem o estado atual da
   * conta, então um pagamento registrado ao mesmo tempo pelo outro usuário não escapa da regra.
   * Divisão: compartilhada guarda `divisao` (a recebida, ou a atual); deixou de ser
   * compartilhada → o campo é apagado. Conta com pagamento não muda a divisão.
   * Autor (`createdBy`) não muda. Aprovação: edição de um não admin que altera algo numa conta
   * com o admin como responsável volta a ficar pendente; sem o admin, a pendência sai.
   */
  async updateConta(id, data){
    const ref = fbDb.collection('contas').doc(id);
    const {ant, alteracoes} = await fbDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if(!snap.exists) throw new Error('Conta não encontrada');
      const d = snap.data(), upd = {...data};
      delete upd.createdBy; delete upd.aprovacao;
      this._exigirPermConta(d, upd);
      const respFinal = upd.resp !== undefined ? upd.resp : d.resp;
      if(respFinal==='Leo & Pri'){
        if(upd.divisao!==undefined || d.resp!=='Leo & Pri'){
          upd.divisao = this._divisaoNormal(upd.divisao!==undefined ? upd.divisao : d.divisao);
          if(d.resp==='Leo & Pri' && temPagamento(d) && upd.divisao.Leo!==divLeo(d))
            throw new Error('Conta com pagamento: desfaça o pagamento para mudar a divisão');
        }
      } else {
        delete upd.divisao;
        if(d.divisao) upd.divisao = firebase.firestore.FieldValue.delete();
      }
      const alteracoes = this._alteracoesConta(d, data);
      if(!ehAdmin(STATE.usuario) && permConta(d, STATE.usuario).editar){
        if(precisaAprovacao(respFinal, STATE.usuario)){
          // Cadastro ainda não aprovado continua "cadastro": o admin revisa a conta como está
          const motivo = aprovacaoPendente(d) && d.aprovacao.motivo==='cadastro' ? 'cadastro' : 'edicao';
          if(alteracoes.length) upd.aprovacao = this._aprovacaoPendente(motivo, motivo==='edicao' ? alteracoes.join(' | ') : '');
        } else if(aprovacaoPendente(d)){
          upd.aprovacao = firebase.firestore.FieldValue.delete();
        }
      }
      // Responsável ou valor pago podem mudar a regra de quitação (compartilhada × individual)
      Object.assign(upd, this._emAbertoUpd(d, {...d, ...upd}));
      tx.update(ref, {...upd, updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      return {ant:d, alteracoes};
    });

    const nome = data.conta || ant?.conta || '—';
    const detalhes = alteracoes.length ? alteracoes.join(' | ') : 'Atualização sem alterações detectadas';
    await this._log('edicao', id, nome, detalhes, {valor:data.vPagar, alteracoes});
  },

  /**
   * Aprova contas pendentes (somente admin). Em transação: só aprova a conta que continua
   * pendente na mesma versão vista na tela (emIso). Se o outro usuário editou nesse meio-tempo,
   * ela fica de fora e volta para a lista. Lotes de 100 (100 leituras + 100 gravações).
   * @param {{id:string, emIso:string}[]} itens
   * @returns {Promise<{ok:number, mudaram:number}>}
   */
  async aprovarContas(itens){
    this._exigirAdmin('Somente o administrador aprova contas');
    const aprovadas = [];
    for(let i=0;i<itens.length;i+=100){
      const lote = itens.slice(i,i+100);
      const refs = lote.map(x=>fbDb.collection('contas').doc(x.id));
      const iso  = new Date().toISOString();
      aprovadas.push(...await fbDb.runTransaction(async tx => {
        const snaps = await Promise.all(refs.map(r=>tx.get(r)));
        const out = [];
        snaps.forEach((s,k)=>{
          const d = s.exists ? s.data() : null;
          if(!d || !aprovacaoPendente(d) || d.aprovacao.emIso!==lote[k].emIso) return;
          tx.update(refs[k], {
            'aprovacao.status':'aprovada', 'aprovacao.aprovadaPor':STATE.usuario, 'aprovacao.aprovadaEmIso':iso,
            'aprovacao.aprovadaEm':firebase.firestore.FieldValue.serverTimestamp(),
          });
          out.push({id:refs[k].id, conta:d.conta, resp:d.resp, vPagar:d.vPagar, parcela:d.parcela, por:d.aprovacao.por, motivo:d.aprovacao.motivo});
        });
        return out;
      }));
    }
    await Promise.all(aprovadas.map(a=>this._log('aprovacao', a.id, a.conta,
      `Aprovada por ${STATE.usuario} (${a.motivo==='edicao'?'edição':'cadastro'} de ${a.por})`,
      {valor:a.vPagar, resp:a.resp, parcela:a.parcela})));
    return {ok:aprovadas.length, mudaram:itens.length-aprovadas.length};
  },

  async deleteConta(id, motivo){
    const contaRef = fbDb.collection('contas').doc(id);
    const dados = await fbDb.runTransaction(async tx => {
      const snap = await tx.get(contaRef);
      if(!snap.exists) return null;
      const d = snap.data();
      if(!permConta(d, STATE.usuario).excluir) throw new Error(MSG_CONTA_ADMIN);
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

  // paidAt: data do pagamento (YYYY-MM-DD). O modal "Confirmar Pagamento" aplica a regra de
  // dataPagamentoPadrao; baixas automáticas (parcelas, massa) seguem com hoje.
  async pagarConta(id, quem, valorPago, paidAt = today()){
    const snap = await fbDb.collection('contas').doc(id).get().catch(()=>null);
    const nome  = snap?.exists ? snap.data().conta : '—';
    const parc  = snap?.exists ? snap.data().parcela : '';
    // Blindagem: conta compartilhada com pagamento parcial não pode ser
    // quitada por sobrescrita — a parte faltante deve ir por pagarContaIndividual.
    if(snap?.exists){
      const d = snap.data();
      if(!permConta(d, STATE.usuario).pagar) throw new Error(MSG_CONTA_ADMIN);
      if(d.resp==='Leo & Pri' && d.pagamentos && (!!d.pagamentos.Leo !== !!d.pagamentos.Pri)){
        throw new Error('Conta compartilhada com pagamento parcial — registre a parte faltante pelo pagamento individual');
      }
    }
    const d = snap?.exists ? snap.data() : null;
    await fbDb.collection('contas').doc(id).update({
      vPago:  valorPago,
      paidBy: quem,
      paidAt,
      ...this._emAbertoUpd(d, {...(d||{}), vPago:valorPago}),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await this._log('pagamento', id, nome,
      `Pagamento de ${fmt(valorPago)} em ${fmtDate(paidAt)} registrado por ${quem}${parc?' ('+parc+')':''}`,
      {valor:valorPago, resp:quem}
    );
  },

  async pagarContaIndividual(id, resp, quem, valorPago, paidAt = today()){
    const contaRef = fbDb.collection('contas').doc(id);
    const result = await fbDb.runTransaction(async tx => {
      const snap = await tx.get(contaRef);
      if(!snap.exists) return null;
      const d = snap.data();
      if(!permConta(d, STATE.usuario).pagar) return {erro:MSG_CONTA_ADMIN};
      if(d.pagamentos?.[resp]) return {erro:`${resp} já registrou pagamento nesta conta`};
      const pgNovo = {valor:valorPago, paidBy:quem, paidAt};
      const pagamentos = {...(d.pagamentos||{}), [resp]:pgNovo};
      const vPagoTotal = Object.values(pagamentos).reduce((s,p)=>s+(p.valor||0),0);
      tx.update(contaRef, {
        [`pagamentos.${resp}`]: pgNovo,
        vPago: vPagoTotal,
        paidBy: quem,
        paidAt,
        ...this._emAbertoUpd(d, {...d, pagamentos, vPago:vPagoTotal}),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return {nome:d.conta, parcela:d.parcela, quitada:Object.keys(pagamentos).length>=2, pct:divisaoDe(d)[resp]};
    });
    if(!result) return;
    if(result.erro) throw new Error(result.erro);
    const evento = result.quitada ? 'pagamento_complementar' : 'pagamento_individual';
    const status = result.quitada ? 'conta integralmente quitada' : 'pagamento parcial';
    await this._log(evento, id, result.nome,
      `Pagamento de ${fmt(valorPago)} (${resp}, parte de ${fmtPct(result.pct)}) em ${fmtDate(paidAt)} por ${quem}${result.parcela?' ('+result.parcela+')':''} — ${status}`,
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
      if(!podeDesfazerPg(d, resp, STATE.usuario)) return {erro:MSG_CONTA_ADMIN};
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
      Object.assign(updates, this._emAbertoUpd(d, {...d, pagamentos:restantes, vPago:vPagoTotal > 0 ? vPagoTotal : null}));
      tx.update(contaRef, updates);
      return {nome:d.conta, valor};
    });
    if(!result) return;
    if(result.erro) throw new Error(result.erro);
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
    if(snap?.exists && !podeDesfazerPg(d, '', STATE.usuario)) throw new Error(MSG_CONTA_ADMIN);
    await fbDb.collection('contas').doc(id).update({
      vPago:  null,
      paidBy: firebase.firestore.FieldValue.delete(),
      paidAt: firebase.firestore.FieldValue.delete(),
      ...this._emAbertoUpd(snap?.exists ? d : null, {...d, vPago:null}),
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
  _exigirAdminEac(){ this._exigirAdmin('Somente o administrador pode alterar a EAC'); },

  _exigirAdmin(msg){
    const ok = (typeof SEC!=='undefined' && SEC.isAdmin && SEC.isAdmin()) || STATE.usuario==='Leo';
    if(!ok) throw new Error(msg);
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
   * @param {Array}  itens [{id, conta, catId, resp, mes, vCent, div?}] (div: divisão da compartilhada)
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

  // ── FOTO DE PERFIL ──
  // Cada usuário altera só a própria foto (trava do cliente; a regra do Firestore repete, README seção 15).
  // A foto é um JPEG pequeno já recortado no navegador, gravado como data URL (sem Firebase Storage).
  _exigirDonoAvatar(usuario){
    if(!usuario || usuario!==STATE.usuario) throw new Error('Cada usuário altera apenas a própria foto');
  },

  async salvarAvatar(usuario, foto){
    this._exigirDonoAvatar(usuario);
    if(typeof foto!=='string' || !foto.startsWith('data:image/jpeg;base64,')) throw new Error('Foto inválida');
    if(foto.length > AVATAR_MAX_CHARS) throw new Error('Foto grande demais');
    await fbDb.collection('avatares').doc(usuario).set({
      foto, atualizadoPor:STATE.usuario, atualizadoEmIso:new Date().toISOString(),
      atualizadoEm:firebase.firestore.FieldValue.serverTimestamp(),
    });
  },

  /** Apaga a foto enviada: o usuário volta para a foto padrão de img/. */
  async removerAvatar(usuario){
    this._exigirDonoAvatar(usuario);
    await fbDb.collection('avatares').doc(usuario).delete();
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

// Guard: só re-renderiza se o app já mostrou a tela principal E a view ativa (page-{STATE.page})
// existe no DOM.
function _canReRender(){
  if(!CACHE._ready.has('_appShown')) return false;
  return !!document.getElementById('page-' + STATE.page);
}

// ══════════════════════════════════════════════════════════════════════════
// CONTAS: CARGA POR JANELA E SOB DEMANDA (README 3.5)
// ══════════════════════════════════════════════════════════════════════════
// Modo (config/sistema.janelaContas; override do aparelho em localStorage dt_janela; padrão
// FEATURES.janelaContas):
//   'off'    → um listener na coleção inteira (como antes);
//   'sombra' → coleção inteira + diagnóstico do que o 'on' deixaria de ver (sem economia);
//   'on'     → ao abrir, só: contas do usuário logado e compartilhadas que vencem na janela;
//              contas em aberto (emAberto) de antes da janela, de todos; pendentes de aprovação
//              (admin). O resto entra sob demanda, quando o contrato do CACHE pede.
// 'on' só vale com o campo emAberto preparado (config/sistema.emAbertoMigrado): sem ele, as
// atrasadas antigas sumiriam. Nesse caso o app fica em 'sombra' e a aba Dados avisa.
// Cada carga é um "segmento" (listener). A memória (CACHE._contas) é a união dos segmentos.
const CONTAS = {
  modo: 'off',
  ano: null, ini: null, fim: null,   // janela de abertura (vencimento), calculada no login
  seg: new Map(),                    // chave → {docs:Map, pronto, unsub, promessa}
  boot: new Set(),                   // segmentos que precisam chegar antes de abrir o app
  cfg: {},                           // config/sistema
  local: null,                       // override deste aparelho (dt_janela)
  aviso: '',
  _diagTimer: null,
};

function _contasRecompor(){
  const porId = new Map();
  CONTAS.seg.forEach(s => s.docs.forEach((d, id) => porId.set(id, d)));
  // Ordem pelo ID, a mesma da coleção inteira no Firestore: as telas que mostram "as primeiras"
  // (ex.: nomes no aviso de atraso) ficam iguais em qualquer modo
  CACHE._contas = [...porId.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Depois de qualquer carga: abre o app (na 1ª vez), redesenha a tela e o sino do admin. */
function _contasAposMudar(){
  if(CONTAS.boot.size) return;          // ainda abrindo
  CACHE.markReady('contas');
  if(CONTAS.modo === 'sombra') _contasAgendarDiagnostico();
  if(_canReRender()) APP.renderPage(STATE.page);
  APP.atualizarAprovacoes?.();          // sino do admin (contas para aprovar) em qualquer tela
  APP.janelaAtualizarPainel?.();        // aba Dados de Configurações, se aberta
}

/**
 * Liga um segmento (listener) de contas, uma vez por chave. Resolve quando a 1ª leitura chega.
 * Erro (índice composto ausente, permissão): volta para a coleção inteira, correto e sem economia.
 */
function _contasSegmento(chave, consulta, {aoPronto, boot = false} = {}){
  if(CONTAS.seg.has(chave)) return CONTAS.seg.get(chave).promessa;
  const s = {docs:new Map(), pronto:false, unsub:null};
  s.promessa = new Promise(res => { s.resolver = res; });
  CONTAS.seg.set(chave, s);
  if(boot) CONTAS.boot.add(chave);
  s.unsub = consulta.onSnapshot(snap => {
    if(CONTAS.seg.get(chave) !== s) return;   // segmento já desligado
    s.docs = new Map(snap.docs.map(d => [d.id, {id:d.id, ...d.data()}]));
    const primeira = !s.pronto;
    if(primeira){ s.pronto = true; aoPronto?.(); }
    _contasRecompor();
    if(primeira){ CONTAS.boot.delete(chave); s.resolver(); }
    _contasAposMudar();
  }, err => {
    console.error(`[Contas] segmento ${chave}:`, err);
    if(CONTAS.seg.get(chave) === s) CONTAS.seg.delete(chave);
    CONTAS.boot.delete(chave);
    if(chave === 'tudo'){
      APP.toast?.('Não foi possível ler as contas: ' + (err.message || err), 'error');
      s.resolver();
      return;
    }
    if(ehAdmin(STATE.usuario)) APP.toast?.('Consulta de contas recusada pelo Firestore (índice ou regra): carregando todas. Veja o console.', 'error');
    _contasLigarTudo(true).then(s.resolver);
  });
  listeners.push(() => s.unsub && s.unsub());
  return s.promessa;
}

/** Coleção inteira. No 'on', os demais segmentos ficam redundantes e são desligados. */
function _contasLigarTudo(boot = false){
  return _contasSegmento('tudo', fbDb.collection('contas'), {boot, aoPronto(){
    if(CONTAS.modo === 'sombra') return;   // sombra: a cobertura continua simulada
    CACHE.marcarCoberto({tudo:true});
    CONTAS.seg.forEach((s, k) => {
      if(k === 'tudo') return;
      s.unsub?.(); CONTAS.seg.delete(k); CONTAS.boot.delete(k); s.resolver?.();
    });
  }});
}

/** Abertura das contas conforme o modo. */
function _contasAbrir(){
  const u = STATE.usuario, admin = ehAdmin(u);
  const ano = new Date().getFullYear();
  CONTAS.ano = ano;
  CONTAS.ini = `${ano - JANELA_ANOS.antes}-01-01`;
  CONTAS.fim = `${ano + JANELA_ANOS.depois}-12-31`;
  COBERTURA.modo = CONTAS.modo;
  const base = respsDaVisao(u);

  if(CONTAS.modo === 'off'){
    CACHE.resetCobertura(true);
    _contasLigarTudo(true);
    return;
  }
  CACHE.resetCobertura(false);
  if(CONTAS.modo === 'sombra'){
    // Mesma cobertura de abertura do 'on', simulada sobre a coleção inteira
    CACHE.marcarCoberto({ini:CONTAS.ini, fim:CONTAS.fim, resps:base});
    CACHE.marcarCoberto({abertasAntes:CONTAS.ini});
    if(admin) CACHE.marcarCoberto({pendentes:true});
    _contasLigarTudo(true);
    return;
  }
  const col = fbDb.collection('contas');
  _contasSegmento('base', col.where('resp', 'in', base).where('data', '>=', CONTAS.ini).where('data', '<=', CONTAS.fim),
    {boot:true, aoPronto:()=>CACHE.marcarCoberto({ini:CONTAS.ini, fim:CONTAS.fim, resps:base})});
  _contasSegmento('abertas', col.where('emAberto', '==', true).where('data', '<', CONTAS.ini),
    {boot:true, aoPronto:()=>CACHE.marcarCoberto({abertasAntes:CONTAS.ini})});
  if(admin) _contasLigarPendentes(true);
}

function _contasLigarPendentes(boot = false){
  return _contasSegmento('pendentes', fbDb.collection('contas').where('aprovacao.status', '==', 'pendente'),
    {boot, aoPronto:()=>CACHE.marcarCoberto({pendentes:true})});
}

/** Lê config/sistema (1 leitura por abertura) e decide o modo. */
async function _contasLerModo(){
  let cfg = {};
  try{
    const s = await fbDb.collection('config').doc('sistema').get();
    if(s.exists) cfg = s.data() || {};
  }catch(e){ console.warn('[Contas] config/sistema:', e.message); }
  const valido = m => ['off', 'sombra', 'on'].includes(m);
  let local = null;
  try{ local = localStorage.getItem('dt_janela'); }catch(e){}
  CONTAS.cfg   = cfg;
  CONTAS.local = valido(local) ? local : null;
  let modo = CONTAS.local || (valido(cfg.janelaContas) ? cfg.janelaContas : FEATURES.janelaContas);
  CONTAS.aviso = '';
  if(modo === 'on' && cfg.emAbertoMigrado !== true){
    modo = 'sombra';
    CONTAS.aviso = 'O modo "on" foi pedido, mas o campo emAberto das contas ainda não foi preparado: o app ficou em "sombra". Use "Preparar contas" na aba Dados.';
  }
  CONTAS.modo = modo;
}

/** Diagnóstico do modo sombra (README 3.5), no máximo a cada 2 s. */
function _contasAgendarDiagnostico(){
  clearTimeout(CONTAS._diagTimer);
  CONTAS._diagTimer = setTimeout(() => {
    try{
      COBERTURA.diag = COBERTURA.diagnostico(CACHE._contas,
        {ini:CONTAS.ini, fim:CONTAS.fim, usuario:STATE.usuario, admin:ehAdmin(STATE.usuario)});
      COBERTURA.diag.em = new Date();
      APP.janelaAtualizarPainel?.();
    }catch(e){ console.warn('[Contas] diagnóstico:', e); }
  }, 2000);
}

/**
 * Virada do ano com o app aberto: a janela muda, então recarrega ao voltar para a aba (ou a
 * cada 30 min), desde que nenhum modal esteja aberto (não perde edição em andamento).
 */
function _contasVigiarAno(){
  const checar = () => {
    if(CONTAS.modo === 'off' || new Date().getFullYear() === CONTAS.ano) return;
    if(document.querySelector('.modal-overlay.open')) return;
    location.reload();
  };
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') checar(); });
  setInterval(checar, 30 * 60 * 1000);
}

Object.assign(FS, {
  /**
   * Carrega o que o contrato do CACHE pediu (README 3.5). Resolve quando está na memória.
   * Fora do modo 'on' não lê nada ('sombra' só simula; 'off' já tem tudo).
   * @param {{tudo?:true, grupo?:string, pendentes?:true, ini?:string, fim?:string, resps?:string[]}} falta
   */
  garantirCobertura(falta){
    if(!falta) return Promise.resolve();
    if(COBERTURA.modo !== 'on'){
      if(COBERTURA.modo === 'sombra') CACHE.marcarCoberto(falta);
      return Promise.resolve();
    }
    if(CACHE.cob.completa) return Promise.resolve();
    const col = fbDb.collection('contas');
    // Segmento já pronto e a cobertura não fechou: proteção contra laço, lê tudo
    const ligar = (chave, consulta, marca) => {
      const s = CONTAS.seg.get(chave);
      if(s?.pronto){ console.error('[Contas] cobertura não fechou com', chave); return _contasLigarTudo(); }
      return _contasSegmento(chave, consulta, {aoPronto:()=>CACHE.marcarCoberto(marca)});
    };
    if(falta.tudo) return _contasLigarTudo();
    if(falta.grupo) return ligar(`grupo:${falta.grupo}`, col.where('grupo', '==', falta.grupo), {grupo:falta.grupo});
    if(falta.pendentes) return _contasLigarPendentes();
    if(falta.ini && falta.fim){
      const resps = falta.resps || RESPS;
      const faltam = resps.filter(r => !CACHE.cobre(falta.ini, falta.fim, [r]));
      if(!faltam.length) return Promise.resolve();
      // Os três responsáveis: só o intervalo de datas (pega também responsável fora do padrão)
      const todos = RESPS.every(r => faltam.includes(r));
      let q = col.where('data', '>=', falta.ini).where('data', '<=', falta.fim);
      if(!todos) q = col.where('resp', 'in', faltam).where('data', '>=', falta.ini).where('data', '<=', falta.fim);
      return ligar(`faixa:${falta.ini}:${falta.fim}:${todos ? '*' : faltam.join('+')}`, q,
        {ini:falta.ini, fim:falta.fim, resps:todos ? RESPS : faltam});
    }
    return Promise.resolve();
  },

  /** Executa fn; se faltar conta na memória, espera a carga e tenta de novo (ações, não telas). */
  async comContas(fn){
    for(let i = 0; i < 6; i++){
      try { return fn(); }
      catch(e){
        if(!(e instanceof DadosIncompletos)) throw e;
        await this.garantirCobertura(e.falta);
      }
    }
    throw new Error('Não foi possível carregar as contas necessárias');
  },

  /** Intervalo de vencimento da visão `resp` na memória (ex.: antes da checagem de duplicatas). */
  garantirIntervalo(ini, fim, resp = ''){
    return this.comContas(() => CACHE.contasEntre(ini, fim, resp));
  },

  /** Parcelamento inteiro na memória (Gerenciar Parcelamento edita e exclui todas as parcelas). */
  garantirGrupo(grupo){
    return this.comContas(() => CACHE.getByGrupo(grupo));
  },

  /**
   * Categoria ou forma usada em alguma conta? Consulta no servidor (1 leitura): a memória pode
   * não ter as contas de outros anos ou da outra pessoa.
   * @param {'catId'|'formaId'} campo
   */
  async emUso(campo, id){
    if(CACHE.cob.completa) return CACHE._contas.some(c => c[campo] === id);
    const snap = await fbDb.collection('contas').where(campo, '==', id).limit(1).get();
    return !snap.empty;
  },

  /** Modo da janela e diagnóstico, para a aba Dados de Configurações. */
  janelaEstado(){
    return {modo:CONTAS.modo, local:CONTAS.local, cfg:{...CONTAS.cfg}, aviso:CONTAS.aviso,
      ini:CONTAS.ini, fim:CONTAS.fim, completa:CACHE.cob.completa, carregadas:CACHE._contas.length,
      segmentos:[...CONTAS.seg].map(([chave, s]) => ({chave, docs:s.docs.size, pronto:s.pronto})),
      faltas:[...COBERTURA.faltas.values()], diag:COBERTURA.diag};
  },

  /** Grava o modo de todos os aparelhos em config/sistema (vale na próxima abertura). Só o admin. */
  async salvarModoJanela(modo){
    this._exigirAdmin('Somente o administrador muda o modo de carga das contas');
    if(!['off', 'sombra', 'on'].includes(modo)) throw new Error('Modo inválido');
    if(modo === 'on' && CONTAS.cfg.emAbertoMigrado !== true) throw new Error('Prepare as contas (emAberto) antes de ligar o modo "on"');
    await fbDb.collection('config').doc('sistema').set({janelaContas:modo, janelaPor:STATE.usuario,
      janelaEm:firebase.firestore.FieldValue.serverTimestamp()}, {merge:true});
    CONTAS.cfg.janelaContas = modo;
  },

  /**
   * Preenche o campo emAberto de todas as contas (só onde falta ou diverge) e marca
   * config/sistema.emAbertoMigrado. Lê a coleção inteira uma vez no modo 'on'; nos outros modos
   * ela já está na memória. Pode rodar de novo a qualquer momento (corrige divergências).
   * @returns {Promise<number>} contas corrigidas (1 gravação cada)
   */
  async prepararEmAberto(){
    this._exigirAdmin('Somente o administrador prepara as contas');
    await this.garantirCobertura({tudo:true});
    const corrigir = CACHE._contas.filter(c => c.emAberto !== contaEmAberto(c));
    await this._emLotes(corrigir.map(c => b => b.update(fbDb.collection('contas').doc(c.id), {emAberto:contaEmAberto(c)})));
    await fbDb.collection('config').doc('sistema').set({emAbertoMigrado:true, emAbertoPor:STATE.usuario,
      emAbertoEm:firebase.firestore.FieldValue.serverTimestamp(), emAbertoCorrigidas:corrigir.length}, {merge:true});
    // Reflete na memória o que foi gravado: a aba Dados mostra quem, quando e quantas sem recarregar
    Object.assign(CONTAS.cfg, {emAbertoMigrado:true, emAbertoPor:STATE.usuario, emAbertoEm:new Date(), emAbertoCorrigidas:corrigir.length});
    return corrigir.length;
  },
});

async function setupListeners(){
  const admin = ehAdmin(STATE.usuario);

  listeners.push(
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
    // Fotos de perfil: fora do markReady. Sem permissão de leitura, ficam as fotos padrão de img/.
    fbDb.collection('avatares').onSnapshot(snap=>{
      CACHE.avatares = Object.fromEntries(snap.docs.map(d=>[d.id, d.data()]));
      if(typeof APP !== 'undefined') APP.aplicarAvatares?.();   // avatares.js também lê o CACHE ao carregar
    }, err=>console.warn('[Avatares] avatares:', err.message))
  );

  // EAC: só o administrador vê a tela (README 10.6), então só ele lê estas coleções.
  // Coleções pequenas, fora do markReady (o app abre sem esperar por elas).
  if(admin){
    listeners.push(...[['categoria_grupos','grupos'],['eac_lb','lbs'],['eac_exclusoes','eacExcl']].map(([col,chave])=>
      fbDb.collection(col).onSnapshot(snap=>{
        CACHE[chave]=snap.docs.map(d=>({id:d.id,...d.data()}));
        if(_canReRender()) APP.eacAoMudarDados?.();
      }, err=>console.warn(`[EAC] ${col}:`, err.message))
    ));
  }

  // Contas: o modo vem de config/sistema (README 3.5)
  await _contasLerModo();
  _contasAbrir();
  _contasVigiarAno();
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
