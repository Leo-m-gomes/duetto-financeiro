"use strict";

// ============================================================
// BACKUP MODULE
// ============================================================
Object.assign(APP, {

  _backupLog: [],

  renderBackup(){
    if(STATE.usuario!=='Leo') return;
    // Stats em tempo real do CACHE
    document.getElementById('bkContas').textContent   = CACHE.contas.length;
    document.getElementById('bkSalarios').textContent = CACHE.salarios.length;
    document.getElementById('bkCats').textContent     = CACHE.getAllCats().length;
    document.getElementById('bkImps').textContent     = '...';
    // Buscar contagem de importações no Firestore
    fbDb.collection('importacoes').get().then(s=>{
      const el=document.getElementById('bkImps');
      if(el) el.textContent=s.size;
    });
    this._renderBackupLog();
  },

  _renderBackupLog(){
    const el=document.getElementById('backupHistorico');
    if(!el) return;
    if(!this._backupLog.length){
      el.innerHTML='<span style="color:var(--t4)">Nenhum backup realizado nesta sessão.</span>';
      return;
    }
    el.innerHTML=this._backupLog.map(l=>`
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:18px">${l.tipo==='json'?'📄':'📊'}</span>
        <div>
          <div style="font-weight:600;font-size:12.5px;color:var(--t1)">${l.arquivo}</div>
          <div style="font-size:11px;color:var(--t4)">${l.data} às ${l.hora} · ${l.registros} registros</div>
        </div>
        <span class="badge bg-pago" style="margin-left:auto">✅ Baixado</span>
      </div>`).join('');
  },

  async _coletarDados(){
    this.toast('Coletando dados do banco...','info');
    // Buscar coleções diretamente do Firestore para garantir dados frescos
    const [contas,salarios,outras,cats,formas,cartoes,importacoes] = await Promise.all([
      fbDb.collection('contas').get(),
      fbDb.collection('salarios').get(),
      fbDb.collection('outras_receitas').get(),
      fbDb.collection('categorias').get(),
      fbDb.collection('formas').get(),
      fbDb.collection('cartoes').get(),
      fbDb.collection('importacoes').get(),
    ]);
    const doc2obj = snap => snap.docs.map(d=>({_id:d.id,...d.data()}));
    return {
      meta:{
        geradoEm:    new Date().toISOString(),
        geradoPor:   STATE.usuario,
        totalContas: contas.size,
        sistema:     'Duetto Financeiro v1.0',
      },
      contas:       doc2obj(contas),
      salarios:     doc2obj(salarios),
      outras_receitas: doc2obj(outras),
      categorias:   doc2obj(cats),
      formas:       doc2obj(formas),
      cartoes:      doc2obj(cartoes),
      importacoes:  doc2obj(importacoes),
    };
  },

  _nomeArquivo(ext){
    const d=new Date();
    const dt=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return `Duetto_Backup_${dt}.${ext}`;
  },

  _registrarLog(tipo,arquivo,dados){
    const d=new Date();
    const total=Object.values(dados).reduce((s,v)=>s+(Array.isArray(v)?v.length:0),0);
    this._backupLog.unshift({
      tipo,arquivo,
      data:d.toLocaleDateString('pt-BR'),
      hora:d.toLocaleTimeString('pt-BR'),
      registros:total,
    });
    this._renderBackupLog();
  },

  async backupJSON(){
    const btn=document.getElementById('btnBackupJSON');
    btn.disabled=true; btn.textContent='⏳ Exportando...';
    try{
      const dados = await this._coletarDados();
      const json  = JSON.stringify(dados, null, 2);
      const blob  = new Blob([json],{type:'application/json'});
      const nome  = this._nomeArquivo('json');
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=nome; a.click();
      this._registrarLog('json',nome,dados);
      this.toast(`Backup JSON exportado: ${nome} ✅`,'success');
    }catch(e){
      this.toast('Erro ao exportar: '+e.message,'error');
    }
    btn.disabled=false; btn.textContent='Exportar JSON';
  },

  async backupExcel(){
    if(typeof XLSX==='undefined') return this.toast('Biblioteca Excel não carregada','error');
    const btn=document.getElementById('btnBackupExcel');
    btn.disabled=true; btn.textContent='⏳ Exportando...';
    try{
      const dados = await this._coletarDados();
      const wb    = XLSX.utils.book_new();

      // Aba: Contas
      const hdContas=['ID','Descrição','Responsável','Categoria ID','Forma ID','Data','A Pagar','Pago','Parcela','Grupo','Nota','Criado por','Atualizado por','Pago por','Data Pgto'];
      const rwContas=dados.contas.map(c=>[c._id,c.conta,c.resp,c.catId||'',c.formaId||'',c.data,c.vPagar,c.vPago||'',c.parcela||'',c.grupo||'',c.nota||'',c.createdBy||'',c.updatedBy||'',c.paidBy||'',c.paidAt||'']);
      const wsContas=XLSX.utils.aoa_to_sheet([hdContas,...rwContas]);
      wsContas['!cols']=[{wch:24},{wch:36},{wch:12},{wch:20},{wch:20},{wch:12},{wch:12},{wch:12},{wch:14},{wch:28},{wch:28},{wch:12},{wch:12},{wch:12},{wch:12}];
      wsContas['!views']=[{state:'frozen',xSplit:0,ySplit:1,topLeftCell:'A2'}];
      XLSX.utils.book_append_sheet(wb,wsContas,'Contas');

      // Aba: Categorias
      const wsCats=XLSX.utils.aoa_to_sheet([['ID','Nome'],...dados.categorias.map(c=>[c._id,c.nome])]);
      wsCats['!cols']=[{wch:24},{wch:28}];
      XLSX.utils.book_append_sheet(wb,wsCats,'Categorias');

      // Aba: Formas
      const wsFormas=XLSX.utils.aoa_to_sheet([['ID','Nome'],...dados.formas.map(f=>[f._id,f.nome])]);
      wsFormas['!cols']=[{wch:24},{wch:28}];
      XLSX.utils.book_append_sheet(wb,wsFormas,'Formas de Pagamento');

      // Aba: Salários
      const hdSal=['ID','Nome','Pessoa'];
      const rwSal=dados.salarios.map(s=>[s._id,s.nome,s.pessoa]);
      const wsSal=XLSX.utils.aoa_to_sheet([hdSal,...rwSal]);
      wsSal['!cols']=[{wch:24},{wch:24},{wch:10}];
      XLSX.utils.book_append_sheet(wb,wsSal,'Salários');

      // Aba: Outras Receitas
      const hdOut=['ID','Descrição','Responsável','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      const rwOut=dados.outras_receitas.map(r=>[r._id,r.desc,r.resp,...(r.valores||Array(12).fill(0))]);
      const wsOut=XLSX.utils.aoa_to_sheet([hdOut,...rwOut]);
      wsOut['!cols']=[{wch:24},{wch:32},{wch:12},...Array(12).fill({wch:10})];
      XLSX.utils.book_append_sheet(wb,wsOut,'Outras Receitas');

      // Aba: Cartões
      const wsCrt=XLSX.utils.aoa_to_sheet([['ID','Nome','Bandeira','Criado por'],...dados.cartoes.map(c=>[c._id,c.nome,c.bandeira||'',c.createdBy||''])]);
      wsCrt['!cols']=[{wch:24},{wch:28},{wch:16},{wch:14}];
      XLSX.utils.book_append_sheet(wb,wsCrt,'Cartões');

      // Aba: Histórico Importações
      const hdImp=['ID','Nome Planilha','Planilha ID','Qtd Contas','Qtd Docs','Importado por','Data','Hora'];
      const rwImp=dados.importacoes.map(i=>[i._id,i.nome||'',i.planilhaId||'',i.qtdContas||0,i.qtdDocs||0,i.importadoPor||'',i.data||'',i.hora||'']);
      const wsImp=XLSX.utils.aoa_to_sheet([hdImp,...rwImp]);
      wsImp['!cols']=[{wch:24},{wch:32},{wch:32},{wch:12},{wch:12},{wch:14},{wch:14},{wch:12}];
      XLSX.utils.book_append_sheet(wb,wsImp,'Importações');

      // Aba: Meta
      const wsMeta=XLSX.utils.aoa_to_sheet([
        ['Campo','Valor'],
        ['Gerado em',dados.meta.geradoEm],
        ['Gerado por',dados.meta.geradoPor],
        ['Total de contas',dados.meta.totalContas],
        ['Sistema',dados.meta.sistema],
      ]);
      wsMeta['!cols']=[{wch:18},{wch:40}];
      XLSX.utils.book_append_sheet(wb,wsMeta,'Meta');

      const nome=this._nomeArquivo('xlsx');
      XLSX.writeFile(wb,nome);
      this._registrarLog('excel',nome,dados);
      this.toast(`Backup Excel exportado: ${nome} ✅`,'success');
    }catch(e){
      this.toast('Erro ao exportar: '+e.message,'error');
    }
    btn.disabled=false; btn.textContent='Exportar Excel';
  },

  async backupAmbos(){
    await this.backupJSON();
    await this.backupExcel();
  },
});
