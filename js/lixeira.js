"use strict";

Object.assign(APP, {

  async lixeiraCarregar(){
    const tbody = document.getElementById('lixeiraBody');
    const stats  = document.getElementById('lixeiraStats');
    if(!tbody) return;
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--t4)">⏳ Carregando...</td></tr>';

    const snap = await fbDb.collection('lixeira').orderBy('excluidoAt','desc').get().catch(()=>null);

    if(!snap){
      tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--t4)">Erro ao carregar. Verifique os índices do Firestore.</td></tr>';
      return;
    }

    const itens = snap.docs.map(d=>({_lid:d.id,...d.data()}));

    // Stats
    if(stats){
      const total = itens.length;
      const totalVal = itens.reduce((s,i)=>s+(i.vPagar||0),0);
      stats.innerHTML=`
        <div class="up-stat"><label>Itens na lixeira</label><div class="sv" style="color:var(--red)">${total}</div></div>
        <div class="up-stat"><label>Valor total</label><div class="sv" style="color:var(--t3);font-size:13px">${fmt(totalVal)}</div></div>`;
    }

    if(!itens.length){
      tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--t4)">🎉 Lixeira vazia</td></tr>';
      return;
    }

    tbody.innerHTML = itens.map(item=>{
      const catNome = CACHE.resolveCat(item.catId||item.cat||'');
      const dataExcl = item.excluidoEm ? new Date(item.excluidoEm).toLocaleDateString('pt-BR') : '—';
      const horaExcl = item.excluidoEm ? new Date(item.excluidoEm).toLocaleTimeString('pt-BR') : '';
      return`<tr>
        <td style="max-width:200px">
          <div style="font-weight:600;color:var(--t1)">${item.conta||'—'}</div>
          ${item.nota?`<div style="font-size:10.5px;color:var(--t4)">${item.nota}</div>`:''}
          ${item.parcela?`<div style="font-size:10.5px;color:var(--t4)">${item.parcela}</div>`:''}
        </td>
        <td>${item.resp||'—'}</td>
        <td><span class="badge bg-cat">${catNome||'—'}</span></td>
        <td class="neg">${fmt(item.vPagar)}</td>
        <td><span class="audit-chip">${item.excluidoPor||'—'}</span></td>
        <td style="font-size:11px;color:var(--t4);white-space:nowrap">${dataExcl}<br>${horaExcl}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm" style="background:var(--green-lt);color:var(--green);border:1px solid #bbf7d0;margin-right:4px"
            onclick="APP.lixeiraRestaurar('${item._lid}')">↩ Restaurar</button>
          <button class="btn btn-sm btn-danger"
            onclick="APP.lixeiraExcluirPermanente('${item._lid}','${(item.conta||'').replace(/'/g,"\\'")}')">🗑 Excluir</button>
        </td>
      </tr>`;
    }).join('');
  },

  async lixeiraRestaurar(lixeiraId){
    if(!confirm('Restaurar este item para o banco principal?')) return;
    const snap = await fbDb.collection('lixeira').doc(lixeiraId).get();
    if(!snap.exists) return this.toast('Item não encontrado','error');

    const dados = snap.data();
    const {_lid, origemId, origemColecao, excluidoPor, excluidoEm, motivo, excluidoAt, ...dadosOriginais} = dados;

    const colecao = origemColecao || 'contas';
    if(origemId){
      await fbDb.collection(colecao).doc(origemId).set({
        ...dadosOriginais,
        restauradoPor: STATE.usuario,
        restauradoEm:  new Date().toISOString(),
        updatedAt:     firebase.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await fbDb.collection(colecao).add({
        ...dadosOriginais,
        restauradoPor: STATE.usuario,
        restauradoEm:  new Date().toISOString(),
        createdAt:     firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    await fbDb.collection('lixeira').doc(lixeiraId).delete();
    // Registra no log
    await FS._log('restauracao', origemId||null, dados.conta,
      `Restaurado da lixeira por ${STATE.usuario} (excluído originalmente por ${excluidoPor||'?'})`,
      {valor:dados.vPagar, resp:dados.resp}
    );
    this.toast(`"${dados.conta}" restaurado ✅`,'success');
    this.lixeiraCarregar();
  },

  async lixeiraExcluirPermanente(lixeiraId, nome){
    if(!confirm(`⚠️ ATENÇÃO: Excluir permanentemente "${nome}"?\n\nEsta ação é IRREVERSÍVEL. O item será apagado definitivamente do banco.`)) return;
    if(!confirm(`Confirmar exclusão permanente de "${nome}"?`)) return; // dupla confirmação
    await fbDb.collection('lixeira').doc(lixeiraId).delete();
    this.toast(`"${nome}" excluído permanentemente`,'success');
    this.lixeiraCarregar();
  },

  async lixeiraEsvaziar(){
    const snap = await fbDb.collection('lixeira').get();
    if(snap.empty){ this.toast('Lixeira já está vazia','info'); return; }
    if(!confirm(`⚠️ ATENÇÃO: Esvaziar a lixeira apagará PERMANENTEMENTE ${snap.size} item(ns).\n\nEsta ação é IRREVERSÍVEL.`)) return;
    if(!confirm('Confirmar esvaziamento total da lixeira?')) return; // dupla confirmação

    const batch = fbDb.batch();
    snap.docs.forEach(d=>batch.delete(d.ref));
    await batch.commit();
    this.toast(`${snap.size} item(ns) excluído(s) permanentemente`,'success');
    this.lixeiraCarregar();
  },
});
