/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO fin-db.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade EXCLUSIVA: interação com Firestore.
 *   Nenhuma feature deve chamar fbDb.collection diretamente.
 *   Tudo passa por FS.* para centralizar auditoria, log e validação.
 *
 * CONTÉM:
 *   FS:              objeto com CRUD (addConta, updateConta, deleteConta,
 *                    pagarConta, desfazerPagamento, saveSalario, etc.)
 *   setupListeners:  instala listeners real-time do Firestore que populam
 *                    CACHE e disparam re-renders via APP.renderPage
 *   seedIfEmpty:     popula banco vazio com categorias/formas/tabelas default
 *
 * DEPENDÊNCIAS:
 *   firebase-config.js: fbDb (Firestore handle)
 *   fin-state.js:       STATE, fmt, today, DEFAULT_TABELAS, SEED_*
 *   fin-cache.js:       CACHE (populado pelos listeners aqui definidos)
 *   app.js:             APP.renderPage, APP.renderContas (refs runtime)
 *
 * IMPORTAÇÃO NO HTML:
 *   Carregar APÓS fin-cache.js, ANTES de app.js.
 *
 * FIX DE RACE CONDITION (Fase 1.4-D-3):
 *   Os listeners de real-time chamam APP.renderPage(STATE.page) quando
 *   dados mudam. Em modo shell, a view pode estar em trânsito (ROUTER
 *   fazendo fetch). Guard adicionado: só re-renderiza se o elemento
 *   #page-{STATE.page} existir no DOM. Isso previne renderPage tentando
 *   popular uma view que ainda não foi injetada.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

const FS = {

  // ── LOG INTERNO ── escreve evento imutável na coleção 'logs'
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
    }catch(e){ console.warn('Log error:', e); } // nunca bloqueia operação principal
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
    // Captura estado ANTES para montar diff
    const antes = await fbDb.collection('contas').doc(id).get().catch(()=>null);
    await fbDb.collection('contas').doc(id).update({...data, updatedAt:firebase.firestore.FieldValue.serverTimestamp()});

    // Monta descrição das alterações
    const CAMPOS = {conta:'Descrição',resp:'Responsável',formaId:'Forma',catId:'Categoria',data:'Data',vPagar:'Valor',parcela:'Parcela',nota:'Nota'};
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

  // Soft delete: move para 'lixeira' + registra no log
  async deleteConta(id, motivo){
    const snap = await fbDb.collection('contas').doc(id).get();
    if(!snap.exists) return;
    const dados = snap.data();
    await fbDb.collection('lixeira').add({
      ...dados,
      origemId:      id,
      origemColecao: 'contas',
      excluidoPor:   STATE.usuario,
      excluidoEm:    new Date().toISOString(),
      motivo:        motivo||'exclusão manual',
      excluidoAt:    firebase.firestore.FieldValue.serverTimestamp(),
    });
    await fbDb.collection('contas').doc(id).delete();
    await this._log('exclusao', id, dados.conta,
      `Excluído por ${STATE.usuario}${motivo?' — '+motivo:''}`,
      {valor:dados.vPagar, resp:dados.resp, parcela:dados.parcela}
    );
  },

  async pagarConta(id, quem, valorPago){
    const snap = await fbDb.collection('contas').doc(id).get().catch(()=>null);
    const nome  = snap?.exists ? snap.data().conta : '—';
    const parc  = snap?.exists ? snap.data().parcela : '';
    await fbDb.collection('contas').doc(id).update({
      vPago:  valorPago,
      vPagar: valorPago,
      paidBy: quem,
      paidAt: today(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await this._log('pagamento', id, nome,
      `Pagamento de ${fmt(valorPago)} registrado por ${quem}${parc?' ('+parc+')':''}`,
      {valor:valorPago, resp:quem}
    );
  },

  async desfazerPagamento(id, vPagarOriginal){
    const snap = await fbDb.collection('contas').doc(id).get().catch(()=>null);
    const nome = snap?.exists ? snap.data().conta : '—';
    await fbDb.collection('contas').doc(id).update({
      vPago:  null,
      vPagar: vPagarOriginal,
      paidBy: firebase.firestore.FieldValue.delete(),
      paidAt: firebase.firestore.FieldValue.delete(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await this._log('desfazer_pagamento', id, nome,
      `Pagamento desfeito por ${STATE.usuario} — valor restaurado: ${fmt(vPagarOriginal)}`,
      {valor:vPagarOriginal}
    );
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

/**
 * Instala listeners real-time do Firestore que mantêm CACHE sincronizado.
 * Chamado uma vez no onAuthStateChanged de security.js.
 *
 * FIX RACE CONDITION (Fase 1.4-D-3):
 * Cada listener, ao receber atualização após o boot, chama APP.renderPage
 * para refletir os novos dados na UI. Em modo shell, a view pode estar
 * em trânsito (ROUTER fazendo fetch). Guard `_canReRender()` verifica
 * se a view ativa existe no DOM antes de chamar renderPage.
 */
function setupListeners(){
  // Helper: só re-renderiza se o app já mostrou a tela principal
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
