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

  /**
   * Coleções incluídas no backup. Para incluir uma coleção nova no sistema,
   * basta acrescentá-la aqui (JSON) e, se quiser aba própria, em backupExcel.
   */
  _BK_COLECOES: [
    'contas','salarios','outras_receitas','categorias','formas','cartoes','importacoes',
    'config',                         // tabelas IR/INSS, usuários e demais configurações
    'notes','notes_trash',            // Notas e lixeira de Notas
    'lixeira',                        // lixeira de Contas
    'logs','notes_log','activity_log','logs_acesso',  // históricos de auditoria
    'categoria_grupos','eac_lb','eac_lb_itens','eac_exclusoes','eac_log',  // EAC
    'avatares',                       // fotos de perfil (só no JSON: o Excel não tem aba para elas)
    'uso_diario',                     // medição de uso do Firebase (só no JSON)
  ],

  /**
   * Converte valores do Firestore em JSON puro e reversível:
   * Timestamp → {__tipo:'timestamp', iso, seconds, nanoseconds}. Recursivo.
   */
  _bkSerializar(v){
    if(v==null || typeof v!=='object') return v;
    if(typeof v.toDate==='function' && 'seconds' in v){
      return {__tipo:'timestamp', iso:v.toDate().toISOString(), seconds:v.seconds, nanoseconds:v.nanoseconds};
    }
    if(Array.isArray(v)) return v.map(x=>this._bkSerializar(x));
    const o={}; Object.keys(v).forEach(k=>{ o[k]=this._bkSerializar(v[k]); }); return o;
  },

  async _coletarDados(){
    this.toast('Coletando dados do banco...','info');
    // allSettled: uma coleção sem permissão/indisponível não derruba o backup
    // inteiro; a falha fica registrada em meta.falhas e é avisada ao usuário.
    const nomes = this._BK_COLECOES;
    const res = await Promise.allSettled(nomes.map(n=>fbDb.collection(n).get()));
    const dados = {}, contagem = {}, falhas = {};
    res.forEach((r,i)=>{
      const nome = nomes[i];
      if(r.status==='fulfilled'){
        dados[nome] = r.value.docs.map(d=>({_id:d.id, ...this._bkSerializar(d.data())}));
        contagem[nome] = dados[nome].length;
      } else {
        dados[nome] = [];
        falhas[nome] = r.reason?.message || String(r.reason);
      }
    });
    if(Object.keys(falhas).length){
      this.toast(`Backup parcial: falha ao ler ${Object.keys(falhas).join(', ')}`,'error');
    }
    return {
      meta:{
        geradoEm:    new Date().toISOString(),
        geradoPor:   STATE.usuario,
        versao:      2,
        sistema:     'Duetto Financeiro',
        colecoes:    nomes,
        contagem,
        falhas,
        totalContas: contagem.contas||0,
      },
      ...dados,
    };
  },

  _nomeArquivo(ext){
    const d=new Date();
    const dt=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return `Duetto_Backup_${dt}.${ext}`;
  },

  /** Célula Excel: objetos viram JSON, timestamps viram ISO; respeita limite de 32.767 caracteres. */
  _bkCelula(v){
    if(v==null) return '';
    if(typeof v==='object') v = v.__tipo==='timestamp' ? v.iso : JSON.stringify(v);
    if(typeof v==='string' && v.length>32000) v = v.slice(0,32000)+'… [truncado; ver JSON]';
    return v;
  },

  /** Aba com colunas = união das chaves dos documentos (para coleções de estrutura variável). */
  _bkAbaGenerica(wb,nomeAba,docs){
    const cols=[]; docs.forEach(d=>Object.keys(d).forEach(k=>{ if(!cols.includes(k)) cols.push(k); }));
    if(!cols.length) cols.push('(vazio)');
    const ws=XLSX.utils.aoa_to_sheet([cols,...docs.map(d=>cols.map(k=>this._bkCelula(d[k])))]);
    ws['!cols']=cols.map(k=>({wch:k==='_id'?24:18}));
    XLSX.utils.book_append_sheet(wb,ws,nomeAba.slice(0,31));
  },

  _registrarLog(tipo,arquivo,dados){
    const d=new Date();
    const total=Object.values(dados.meta?.contagem||{}).reduce((s,v)=>s+v,0);
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
    if(btn){ btn.disabled=true; btn.textContent='⏳ Exportando...'; }
    try{
      const dados = await this._coletarDados();
      const json  = JSON.stringify(dados, null, 2);
      const blob  = new Blob([json],{type:'application/json'});
      const nome  = this._nomeArquivo('json');
      const a=document.createElement('a');
      const url=URL.createObjectURL(blob);
      a.href=url; a.download=nome; a.click();
      URL.revokeObjectURL(url);
      this._registrarLog('json',nome,dados);
      this.toast(`Backup JSON exportado: ${nome} ✅`,'success');
    }catch(e){
      this.toast('Erro ao exportar: '+e.message,'error');
    }
    if(btn){ btn.disabled=false; btn.textContent='Exportar JSON'; }
  },

  async backupExcel(){
    if(typeof XLSX==='undefined') return this.toast('Biblioteca Excel não carregada','error');
    const btn=document.getElementById('btnBackupExcel');
    if(btn){ btn.disabled=true; btn.textContent='⏳ Exportando...'; }
    try{
      const dados = await this._coletarDados();
      const wb    = XLSX.utils.book_new();

      const addAba=(nomeAba,cab,linhas,larg)=>{
        const ws=XLSX.utils.aoa_to_sheet([cab,...linhas.map(r=>r.map(v=>this._bkCelula(v)))]);
        ws['!cols']=(larg||cab.map(()=>18)).map(w=>({wch:w}));
        XLSX.utils.book_append_sheet(wb,ws,nomeAba.slice(0,31));
      };
      const cat=id=>CACHE.resolveCat(id), forma=id=>CACHE.resolveForma(id);

      // Contas (com nomes resolvidos além dos IDs)
      addAba('Contas',
        ['ID','Descrição','Responsável','Categoria','Categoria ID','Forma','Forma ID','Vencimento','Data Compra','A Pagar','Pago','Pgto Leo','Pgto Pri','Div. Leo %','Div. Pri %','Parcela','Grupo','Recorrente','Nota','Criado por','Atualizado por','Pago por','Data Pgto','Origem','Aprovação'],
        dados.contas.map(c=>[c._id,c.conta,c.resp,cat(c.catId||c.cat),c.catId||c.cat||'',forma(c.formaId||c.forma),c.formaId||c.forma||'',c.data,c.dataCompra||'',c.vPagar,c.vPago??'',c.pagamentos?.Leo?.valor??'',c.pagamentos?.Pri?.valor??'',c.resp==='Leo & Pri'?divisaoDe(c).Leo/100:'',c.resp==='Leo & Pri'?divisaoDe(c).Pri/100:'',c.parcela||'',c.grupo||'',c.recorrente?'Sim':'',c.nota||'',c.createdBy||'',c.updatedBy||'',c.paidBy||'',c.paidAt||'',c.origem||'',
          c.aprovacao?(c.aprovacao.status==='pendente'?`Pendente (${c.aprovacao.por})`:`Aprovada por ${c.aprovacao.aprovadaPor||''}`):'']),
        [24,36,12,18,22,20,22,12,12,12,12,10,10,10,10,10,26,10,30,12,12,12,12,12,18]);

      // Salários: uma linha por período do histórico. Ano de início: gravado ou, em entradas
      // antigas, o inferido pelo sistema (CACHE.anoInicioSalario)
      addAba('Salários',
        ['ID','Nome','Pessoa','A partir de (mês)','A partir de (ano)','Dependentes','Salário Bruto','Bonificação','INSS','IR','Líquido','Atualizado por','Atualizado em'],
        dados.salarios.flatMap(s=>(s.historico&&s.historico.length?s.historico:[{}]).map(h=>
          [s._id,s.nome,s.pessoa,h.mesInicio!=null?MESES_F[h.mesInicio]:'',h.mesInicio!=null?CACHE.anoInicioSalario(h):'',h.deps??'',h.salario??'',h.bonificacao??'',h.inss??'',h.ir??'',h.liquido??'',h.updatedBy||'',h.updatedAt||''])),
        [24,24,10,16,14,12,14,12,12,12,14,14,14]);

      // Outras receitas são por ano. "Ano confirmado = Não" marca receitas antigas cujo ano
      // ainda é inferido (CACHE.anoReceita)
      const anoOutra = id => { const r=CACHE.outras.find(x=>x.id===id); return r?CACHE.anoReceita(r):''; };
      addAba('Outras Receitas',
        ['ID','Descrição','Responsável','Ano','Ano confirmado',...MESES],
        dados.outras_receitas.map(r=>[r._id,r.desc,r.resp,Number.isInteger(r.ano)?r.ano:anoOutra(r._id),Number.isInteger(r.ano)?'Sim':'Não',...(r.valores||Array(12).fill(0))]),
        [24,32,12,8,14,...Array(12).fill(10)]);

      const grupos=dados.categoria_grupos||[];
      addAba('Categorias',['ID','Nome','Grupo (EAC)'],dados.categorias.map(c=>[c._id,c.nome,grupos.find(g=>g._id===c.grupoId)?.nome||'']),[24,28,24]);
      addAba('Formas de Pagamento',['ID','Nome'],dados.formas.map(f=>[f._id,f.nome]),[24,28]);
      addAba('Cartões',['ID','Nome','Bandeira','Criado por'],dados.cartoes.map(c=>[c._id,c.nome,c.bandeira||'',c.createdBy||'']),[24,28,16,14]);

      // Tabelas IR/INSS
      const tab=dados.config.find(d=>d._id==='tabelas')||{};
      addAba('Tabelas IR-INSS',
        ['Tabela','De','Até','Alíquota','Dedução'],
        [...(tab.ir||[]).map(f=>['IR',f.de,f.ate??'acima',f.al,f.ded]),
         ...(tab.inss||[]).map(f=>['INSS',f.de,f.ate??'acima',f.al,f.ded??'']),
         ['Dedução por dependente',tab.dedDep??'','','',''],['Teto INSS',tab.tetoINSS??'','','',''],['Vigência',tab.vigencia??'','','','']],
        [22,12,12,10,12]);

      // Notas: uma linha por nota + aba de itens
      addAba('Notas',
        ['ID','Título','Tipo','Status','Prazo','Responsável','Autor','Descrição','Qtd Itens','Criada em','Atualizada em'],
        dados.notes.map(n=>[n._id,n.titulo,n.tipo,n.status,n.prazo||'',n.responsavel||'',n.autor||'',n.descricao||'',(n.itens||[]).length,n.criadaEm||'',n.atualizadaEm||'']),
        [24,32,10,12,12,12,10,40,10,22,22]);
      this._bkAbaGenerica(wb,'Notas - Itens',dados.notes.flatMap(n=>(n.itens||[]).map((it,i)=>({notaId:n._id, notaTitulo:n.titulo, itemOrdem:i+1, ...(typeof it==='object'?it:{texto:it})}))));

      // Lixeiras, importações, configurações e históricos (estrutura variável)
      this._bkAbaGenerica(wb,'Lixeira Contas',dados.lixeira);
      this._bkAbaGenerica(wb,'Lixeira Notas',dados.notes_trash);
      this._bkAbaGenerica(wb,'Importações',dados.importacoes);
      this._bkAbaGenerica(wb,'Config',dados.config);
      this._bkAbaGenerica(wb,'Histórico Contas',dados.logs);
      this._bkAbaGenerica(wb,'Histórico Notas',dados.notes_log);
      this._bkAbaGenerica(wb,'Histórico Atividades',dados.activity_log);
      this._bkAbaGenerica(wb,'Acessos',dados.logs_acesso);

      // EAC: grupos, linhas de base (cabeçalho e contas da foto), exclusões classificadas e log
      this._bkAbaGenerica(wb,'EAC Grupos',grupos);
      this._bkAbaGenerica(wb,'EAC Linhas de base',dados.eac_lb||[]);
      this._bkAbaGenerica(wb,'EAC Itens LB',(dados.eac_lb_itens||[]).flatMap(d=>(d.itens||[]).map(i=>({lbId:d.lbId,...i}))));
      this._bkAbaGenerica(wb,'EAC Exclusões',dados.eac_exclusoes||[]);
      this._bkAbaGenerica(wb,'EAC Histórico',dados.eac_log||[]);

      // Meta
      addAba('Meta',['Campo','Valor'],[
        ['Gerado em',dados.meta.geradoEm],['Gerado por',dados.meta.geradoPor],['Versão do backup',dados.meta.versao],['Sistema',dados.meta.sistema],
        ...Object.entries(dados.meta.contagem).map(([k,v])=>[`Registros: ${k}`,v]),
        ...Object.entries(dados.meta.falhas).map(([k,v])=>[`FALHA: ${k}`,v]),
      ],[28,40]);

      const nome=this._nomeArquivo('xlsx');
      XLSX.writeFile(wb,nome);
      this._registrarLog('excel',nome,dados);
      this.toast(`Backup Excel exportado: ${nome} ✅`,'success');
    }catch(e){
      this.toast('Erro ao exportar: '+e.message,'error');
    }
    if(btn){ btn.disabled=false; btn.textContent='Exportar Excel'; }
  },

  async backupAmbos(){
    await this.backupJSON();
    await this.backupExcel();
  },
});
