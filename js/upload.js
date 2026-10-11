"use strict";

// ============================================================
// UPLOAD CARDS MODULE
// ============================================================
Object.assign(APP, {

  // ── Estado do modulo ──
  _upGrupos:    [],
  _upPlanId:    '',
  _upPlanNome:  '',
  _upVerTodas:  false,

  // ── UUID simples ──
  _upUid(){ return 'imp-'+Date.now()+'-'+Math.random().toString(36).slice(2,8); },

  // ── Abrir modais de upload ──
  openUpModal(id){
    document.getElementById(id).classList.add('open');
    if(id==='ovCartoes') this.upRenderCartoes();
    if(id==='ovModelo')  this.upInitModelo();
  },

  // ── DRAG & DROP ──
  upDragOver(e){ e.preventDefault(); document.getElementById('upZone').classList.add('drag'); },
  upDragLeave(){  document.getElementById('upZone').classList.remove('drag'); },
  upDrop(e){ e.preventDefault(); this.upDragLeave(); const f=e.dataTransfer.files[0]; if(f) this.upHandleFile(f); },

  // ── CARTOES (Firestore colecao 'cartoes') ──
  async upSalvarCartao(){
    const eid  = document.getElementById('cEId').value;
    const nome = document.getElementById('cNome').value.trim();
    const band = document.getElementById('cBand').value;
    if(!nome) return this.toast('Informe o nome do cartão','error');

    if(eid){
      await fbDb.collection('cartoes').doc(eid).update({nome, bandeira:band, updatedBy:STATE.usuario});
      this.upCancelarEditCartao();
      this.toast('Cartão atualizado ✅','success');
    } else {
      const snap = await fbDb.collection('cartoes').where('nome','==',nome).get();
      if(!snap.empty) return this.toast('Cartão já cadastrado','error');
      await fbDb.collection('cartoes').add({nome, bandeira:band, createdBy:STATE.usuario, createdAt:new Date().toISOString()});
      document.getElementById('cNome').value='';
      document.getElementById('cBand').value='';
      this.toast(`"${nome}" cadastrado ✅`,'success');
    }
    this.upRenderCartoes();
  },

  async upRenderCartoes(){
    const snap = await fbDb.collection('cartoes').orderBy('nome').get();
    const el   = document.getElementById('upListaCartoes');
    if(!el) return;
    if(snap.empty){ el.innerHTML='<p style="color:var(--t4);font-size:12.5px;padding:6px 0">Nenhum cartão cadastrado.</p>'; return; }
    el.innerHTML = snap.docs.map(d=>{
      const c=d.data();
      return `<div class="up-citem">
        <div><div class="cn">${c.nome}</div><div class="cs">${c.bandeira||'Sem bandeira'}</div></div>
        <div style="display:flex;gap:5px">
          <button class="action-btn edit" onclick="APP.upEditarCartao('${d.id}','${c.nome.replace(/'/g,"\\'")}','${c.bandeira||''}')">✏</button>
          <button class="action-btn del" onclick="APP.upExcluirCartao('${d.id}','${c.nome.replace(/'/g,"\\'")}')">✕</button>
        </div></div>`;
    }).join('');
  },

  upEditarCartao(id,nome,band){
    document.getElementById('cEId').value  = id;
    document.getElementById('cNome').value = nome;
    document.getElementById('cBand').value = band;
    document.getElementById('bSalvCartao').textContent='💾 Salvar alteração';
    document.getElementById('bCancCartao').style.display='inline-flex';
    document.getElementById('cNome').focus();
  },

  upCancelarEditCartao(){
    document.getElementById('cEId').value='';
    document.getElementById('cNome').value='';
    document.getElementById('cBand').value='';
    document.getElementById('bSalvCartao').textContent='+ Adicionar Cartão';
    document.getElementById('bCancCartao').style.display='none';
  },

  async upExcluirCartao(id,nome){
    if(!confirm(`Excluir cartão "${nome}"?`)) return;
    await fbDb.collection('cartoes').doc(id).delete();
    this.upRenderCartoes();
    this.toast('Cartão excluído','success');
  },

  // ── MODAL MODELO ──
  async upInitModelo(){
    const ano = new Date().getFullYear();
    const aS  = document.getElementById('mAno');
    aS.innerHTML='<option value="">Selecione o ano...</option>';
    for(let a=ano-1;a<=ano+2;a++) aS.appendChild(new Option(a,a));
    aS.value = ano;
    document.getElementById('mMes').value='';

    const cS   = document.getElementById('mCartao');
    cS.innerHTML='<option value="">Selecione o cartão...</option>';
    const snap = await fbDb.collection('cartoes').orderBy('nome').get();
    snap.docs.forEach(d=>{
      const c=d.data();
      cS.appendChild(new Option(`${c.nome}${c.bandeira?' ('+c.bandeira+')':''}`, c.nome));
    });
    this.upAtualizarNome();
  },

  upAtualizarNome(){
    const cart = document.getElementById('mCartao').value;
    const ano  = document.getElementById('mAno').value;
    const mes  = document.getElementById('mMes').value;
    const el   = document.getElementById('upNomePreview');
    if(!cart||!ano||!mes){ el.textContent='— preencha todos os campos —'; return; }
    el.textContent = `${ano}.${mes}_${cart.replace(/\s+/g,'_')}.xlsx`;
  },

  _upGetNome(){
    const cart=document.getElementById('mCartao').value;
    const ano =document.getElementById('mAno').value;
    const mes =document.getElementById('mMes').value;
    if(!cart||!ano||!mes) return null;
    return `${ano}.${mes}_${cart.replace(/\s+/g,'_')}`;
  },

  // ── GERAR MODELO EXCEL ──
  upBaixarModelo(){
    if(typeof XLSX==='undefined') return this.toast('Biblioteca Excel não carregada. Tente recarregar a página.','error');
    const nome = this._upGetNome();
    if(!nome) return this.toast('Preencha todos os campos','error');

    const cats  = CACHE.getAllCats().map(c=>c.nome);
    const formas= CACHE.getAllFormas().map(f=>f.nome);

    const wb  = XLSX.utils.book_new();
    // "Data Compra" é opcional: dia da compra na fatura do cartão. Usada para
    // identificar lançamentos repetidos (mesma compra importada duas vezes).
    // Aba de importação vai SEM dados: só o cabeçalho (verde, com filtro e
    // primeira linha congelada; ver _upEstilizarModelo). Exemplos e
    // instruções ficam na aba "Referência".
    const cab = ['Status','Descrição','Responsável','Forma de Pagamento','Categoria','Data Vencimento','Data Compra','Valor Parcela','Total Parcelas','Parcela Atual','Nota'];
    const ws = XLSX.utils.aoa_to_sheet([cab]);
    ws['!autofilter']={ref:`A1:${XLSX.utils.encode_col(cab.length-1)}5000`};
    ws['!cols']=[{wch:12.8},{wch:34.8},{wch:14.8},{wch:24.8},{wch:20.8},{wch:16.8},{wch:14.8},{wch:14.8},{wch:14.8},{wch:14.8},{wch:30.8}];
    ws['!views']=[{state:'frozen',xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft'}];
    ws['!dataValidation']=[
      {sqref:'A2:A5000',type:'list',formula1:'"Nova,Existente"',showErrorMessage:true,errorTitle:'Inválido',error:'Use: Nova ou Existente'},
      {sqref:'C2:C5000',type:'list',formula1:'"Leo,Pri,Leo & Pri"'},
      {sqref:'D2:D5000',type:'list',formula1:`"${formas.join(',')}"`},
      {sqref:'E2:E5000',type:'list',formula1:`"${cats.join(',')}"`},
    ];
    XLSX.utils.book_append_sheet(wb,ws,'Importação');

    const wsRef=XLSX.utils.aoa_to_sheet([['REFERÊNCIA — NÃO EDITAR'],[''],
      ['COMO PREENCHER A ABA "Importação"'],
      ['• Status: "Nova" para cadastrar; "Existente" para ignorar a linha. Linhas com dados e Status vazio são recusadas.'],
      ['• Datas no formato dd/mm/aaaa. "Data Compra" é opcional (dia da compra na fatura) e ajuda a detectar lançamentos repetidos.'],
      ['• Valor Parcela: valor de UMA parcela. Total Parcelas e Parcela Atual: números inteiros (à vista = 1 e 1).'],
      ['• Exemplo cartão: Nova | Loja X | Leo | Cartão Nubank | Roupa | 10/07/2026 | 22/06/2026 | 120 | 3 | 1 | (nota)'],
      [''],
      ['RESPONSÁVEL','CATEGORIAS','FORMAS DE PAGAMENTO'],
      ...Array.from({length:Math.max(3,cats.length,formas.length)},(_,i)=>[['Leo','Pri','Leo & Pri'][i]||'',cats[i]||'',formas[i]||''])]);
    wsRef['!cols']=[{wch:18},{wch:28},{wch:28}];
    XLSX.utils.book_append_sheet(wb,wsRef,'Referência');

    const pid=this._upUid();
    const wsMeta=XLSX.utils.aoa_to_sheet([['planilha_id',pid],['nome',nome],['gerado_em',new Date().toISOString()],['versao','1.0'],['sistema','Duetto Financeiro']]);
    XLSX.utils.book_append_sheet(wb,wsMeta,'_meta');
    wb.Workbook=wb.Workbook||{};wb.Workbook.Sheets=wb.Workbook.Sheets||[];
    const mi=wb.SheetNames.indexOf('_meta');
    while(wb.Workbook.Sheets.length<=mi) wb.Workbook.Sheets.push({});
    wb.Workbook.Sheets[mi].Hidden=1;

    const arq = this._upEstilizarModelo(XLSX.write(wb,{bookType:'xlsx',type:'array'}), cab.length);
    const a=document.createElement('a'); const url=URL.createObjectURL(new Blob([arq],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    a.href=url; a.download=nome+'.xlsx'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    APP.closeModal('ovModelo');
    this.toast(`"${nome}.xlsx" gerada ✅`,'success');
  },

  /**
   * A SheetJS Community (0.18.5) não grava estilos nem painéis congelados
   * (ws['!views'] é ignorado). Pós-processa o .xlsx (um zip) via XLSX.CFB:
   *   • styles.xml : fonte branca negrito + preenchimento verde (#006437)
   *   • sheet1.xml : aplica o estilo na linha 1 e congela a primeira linha
   * Falha em qualquer etapa devolve o arquivo original (sem estilo), nunca quebra.
   * @param {ArrayBuffer|Uint8Array} buf  saída de XLSX.write(type:'array')
   * @param {number} nCols  colunas do cabeçalho
   * @returns {Uint8Array|ArrayBuffer}
   */
  _upEstilizarModelo(buf, nCols){
    try{
      const CFB=XLSX.CFB, dec=new TextDecoder(), enc=new TextEncoder();
      const zip=CFB.read(new Uint8Array(buf),{type:'array'});
      const ler=p=>{ const e=CFB.find(zip,p); if(!e) throw new Error('sem '+p); return {e, xml:dec.decode(e.content)}; };
      const st=ler('/xl/styles.xml'), sh=ler('/xl/worksheets/sheet1.xml');

      // Acrescenta um item numa coleção (<fonts count="n">…</fonts>) e devolve seu índice
      const add=(xml,tag,item)=>{
        const re=new RegExp(`<${tag} count="(\\d+)">([\\s\\S]*?)</${tag}>`);
        const m=xml.match(re); if(!m) throw new Error('sem '+tag);
        const n=parseInt(m[1]);
        return {xml:xml.replace(re,`<${tag} count="${n+1}">${m[2]}${item}</${tag}>`), idx:n};
      };
      let x=st.xml, r;
      r=add(x,'fonts','<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>'); x=r.xml; const fontId=r.idx;
      r=add(x,'fills','<fill><patternFill patternType="solid"><fgColor rgb="FF006437"/><bgColor indexed="64"/></patternFill></fill>'); x=r.xml; const fillId=r.idx;
      r=add(x,'cellXfs',`<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>`); x=r.xml; const xf=r.idx;

      let s=sh.xml;
      // Estilo nas células do cabeçalho (linha 1)
      s=s.replace(/<row r="1"([^>]*)>([\s\S]*?)<\/row>/, (m,attrs,cells)=>
        `<row r="1"${attrs} ht="22" customHeight="1">${cells.replace(/<c r="([A-Z]+1)"/g,`<c r="$1" s="${xf}"`)}</row>`);
      // Congela a primeira linha
      const pane='<sheetView tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>';
      if(!/<sheetView workbookViewId="0"\/>/.test(s)) throw new Error('sheetView inesperado');
      s=s.replace(/<sheetView workbookViewId="0"\/>/, pane);
      if(!s.includes(` s="${xf}"`)) throw new Error('cabeçalho não estilizado');

      st.e.content=enc.encode(x); st.e.size=st.e.content.length;
      sh.e.content=enc.encode(s); sh.e.size=sh.e.content.length;
      return CFB.write(zip,{type:'array',fileType:'zip'});
    }catch(e){
      console.warn('[upload] modelo sem estilo:',e.message);
      return buf;
    }
  },

  // ── HANDLE UPLOAD ──
  upHandleFile(file){
    if(!file) return;
    if(!file.name.match(/\.(xlsx|xls)$/i)) return this.toast('Use apenas .xlsx gerado pelo sistema','error');
    if(typeof XLSX==='undefined') return this.toast('Biblioteca Excel não carregada','error');
    this._upOcultarAlertas();
    const r=new FileReader();
    r.onload=e=>this._upProcessar(e.target.result,file.name);
    r.readAsArrayBuffer(file);
  },

  async _upProcessar(buf,fileName){
    const wb=XLSX.read(buf,{type:'array',cellDates:true});

    let pid='',pnome='';
    if(wb.SheetNames.includes('_meta')){
      XLSX.utils.sheet_to_json(wb.Sheets['_meta'],{header:1}).forEach(r=>{
        if(r[0]==='planilha_id') pid=String(r[1]||'');
        if(r[0]==='nome')        pnome=String(r[1]||'');
      });
    }
    if(!pid) return this._upShowAlert('upAlertErr','❌ Planilha inválida — não foi gerada pelo sistema Duetto. Use o botão "Baixar Modelo".');

    const snap=await fbDb.collection('importacoes').where('planilhaId','==',pid).get();
    if(!snap.empty){
      const reg=snap.docs[0].data();
      return this._upShowAlert('upAlertErr',
        `❌ Bloqueado: esta planilha já foi importada em ${reg.data||'data desconhecida'}.<br><strong>ID:</strong> <span style="font-family:monospace">${pid}</span><br><strong>Nome:</strong> ${pnome}<br>O bloqueio é pelo ID exclusivo — renomear o arquivo não contorna a validação.`);
    }

    this._upPlanId   = pid;
    this._upPlanNome = pnome;
    document.getElementById('upFileName').textContent   = fileName;
    document.getElementById('upFileId').textContent     = 'ID: '+pid;
    document.getElementById('upFileInfo').style.display = 'block';

    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    if(rows.length<2) return this._upShowAlert('upAlertErr','Planilha vazia ou sem dados.');

    const hdr=rows[0].map(h=>String(h).trim().toLowerCase());
    const col=n=>hdr.findIndex(h=>h.includes(n));
    const iSt=col('status'),iDe=col('descri'),iRe=col('respons'),iFor=col('forma'),
          iCat=col('categ'),iVl=col('valor'),iTP=col('total'),
          iDc=col('compra'),
          iDt=(i=>i>=0?i:hdr.findIndex(h=>h.includes('data')&&!h.includes('compra')))(col('venc')),
          iPA=hdr.findIndex(h=>h.includes('parcela')&&h.includes('atual')),
          iNo=col('nota');

    const faltando=[];
    if(iSt===-1) faltando.push('Status');
    if(iDe===-1) faltando.push('Descrição');
    if(iRe===-1) faltando.push('Responsável');
    if(iFor===-1) faltando.push('Forma de Pagamento');
    if(iCat===-1) faltando.push('Categoria');
    if(iDt===-1) faltando.push('Data Vencimento');
    if(iVl===-1) faltando.push('Valor Parcela');
    if(faltando.length) return this._upShowAlert('upAlertErr',
      `❌ Colunas obrigatórias não encontradas: <strong>${faltando.join(', ')}</strong>.<br>Verifique se está usando a planilha modelo correta e se o cabeçalho não foi alterado.`);

    const cats  = CACHE.getAllCats().map(c=>c.nome);
    const formas= CACHE.getAllFormas().map(f=>f.nome);
    const resps = ['Leo','Pri','Leo & Pri'];
    const anoAtual = new Date().getFullYear();

    const novas=[],ign=[],errosLeitura=[];

    rows.slice(1).forEach((row,idx)=>{
      const lin=idx+2;
      const st=String(row[iSt]||'').trim();
      if(!st){
        // Linha totalmente vazia: ignora. Com dados e sem Status: avisa
        // (antes era descartada em silêncio e a conta não era cadastrada).
        if(row.some(v=>String(v??'').trim())) errosLeitura.push(`Linha ${lin}: Status vazio; preencha "Nova" ou "Existente"`);
        return;
      }
      if(st.toLowerCase()==='existente'){ ign.push(lin); return; }
      if(st.toLowerCase()!=='nova'){ errosLeitura.push(`Linha ${lin}: Status "${st}" inválido — use Nova ou Existente`); return; }

      const data=this._upParseData(row[iDt]);
      const rawDc=iDc>=0?row[iDc]:'';
      const dataCompra=this._upParseData(rawDc);

      // parseMoney trata "1.500,00" (antes virava 1,5) e números puros
      const rawVal=String(row[iVl]??'').replace(/[R$\s]/g,'');
      const vPagar=typeof row[iVl]==='number'?row[iVl]:parseMoney(rawVal);

      const rawTP=String(row[iTP>=0?iTP:col('total')]||'').trim();
      const rawPA=String(row[iPA>=0?iPA:col('parc')]||'').trim();
      const totParc = /^\d+$/.test(rawTP) ? parseInt(rawTP) : NaN;
      const parcAtual= /^\d+$/.test(rawPA) ? parseInt(rawPA) : NaN;

      novas.push({
        conta:String(row[iDe]||'').trim(),
        resp:String(row[iRe]||'').trim(),
        forma:String(row[iFor]||'').trim(),
        cat:String(row[iCat]||'').trim(),
        data,vPagar,
        dataCompra:dataCompra||null, rawDc:String(rawDc||'').trim(),
        totParc: isNaN(totParc) ? 0 : totParc,
        parcAtual: isNaN(parcAtual) ? 0 : parcAtual,
        rawTP,rawPA,
        nota:String(row[iNo]||'').trim(),
        linha:lin,
      });
    });

    document.getElementById('upFileDetail').textContent=
      `${rows.length-1} linhas · ${novas.length} novas · ${ign.length} ignoradas`;

    if(errosLeitura.length) return this._upShowAlert('upAlertErr',
      `Erros de leitura:<br>${errosLeitura.map(e=>`• ${e}`).join('<br>')}`);

    const ev=[];
    novas.forEach(c=>{
      if(!c.conta) ev.push(`Linha ${c.linha}: Descrição vazia`);
      if(!resps.includes(c.resp)) ev.push(`Linha ${c.linha}: Responsável "<strong>${c.resp||'vazio'}</strong>" inválido — use Leo, Pri ou Leo & Pri`);
      if(!formas.includes(c.forma)) ev.push(`Linha ${c.linha}: Forma de Pagamento "<strong>${c.forma||'vazio'}</strong>" não existe no sistema`);
      if(!cats.includes(c.cat)) ev.push(`Linha ${c.linha}: Categoria "<strong>${c.cat||'vazio'}</strong>" não existe no sistema`);
      if(!c.data) ev.push(`Linha ${c.linha}: Data ausente ou em formato inválido — use dd/mm/aaaa`);
      if(c.data){
        const ano=parseInt(c.data.slice(0,4));
        if(isNaN(ano)||ano<2019||ano>2035) ev.push(`Linha ${c.linha}: Data "${c.data}" fora do intervalo permitido (2019–2035)`);
        const d=new Date(c.data+'T12:00');
        if(isNaN(d.getTime())) ev.push(`Linha ${c.linha}: Data inválida`);
      }
      if(c.rawDc&&!c.dataCompra) ev.push(`Linha ${c.linha}: Data Compra "${c.rawDc}" inválida; use dd/mm/aaaa ou deixe vazia`);
      if(c.dataCompra&&c.data&&c.dataCompra>c.data) ev.push(`Linha ${c.linha}: Data Compra posterior ao vencimento`);
      if(!c.vPagar||c.vPagar<=0){
        const dica=String(c.rawVal||'');
        ev.push(`Linha ${c.linha}: Valor inválido${dica?` ("${dica}")` :''} — use número no formato 1500.00 ou 1500,00`);
      }
      if(isNaN(c.totParc)||c.totParc<=0){
        ev.push(`Linha ${c.linha}: Total de Parcelas "<strong>${c.rawTP||'vazio'}</strong>" inválido — deve ser um número inteiro`);
      }
      if(isNaN(c.parcAtual)||c.parcAtual<=0){
        ev.push(`Linha ${c.linha}: Parcela Atual "<strong>${c.rawPA||'vazio'}</strong>" inválido — deve ser um número inteiro`);
      }
      if(!isNaN(c.totParc)&&!isNaN(c.parcAtual)&&c.parcAtual>c.totParc){
        ev.push(`Linha ${c.linha}: Parcela Atual (${c.parcAtual}) é maior que Total de Parcelas (${c.totParc}) — impossível`);
      }
    });

    document.getElementById('upSecaoPreview').style.display='block';

    if(ev.length){
      this._upShowAlert('upAlertVal',
        `🚫 <strong>${ev.length} problema(s) encontrado(s) — cadastro bloqueado:</strong><br><br>`+
        ev.map(e=>`• ${e}`).join('<br>')+
        `<br><br><strong>Corrija a planilha e faça o upload novamente.</strong>`);
      document.getElementById('upBtnConfirmar').disabled=true;
      this._upGrupos=[];
      this._upRenderStats(0,novas.length,ign.length,0);
      this._upRenderPreview([]);
      return;
    }

    const grupos=[];
    novas.forEach(c=>{
      const gid=`grp-${Date.now()}-${Math.random().toString(36).slice(2,5)}`;
      const rest=c.totParc-c.parcAtual+1;
      const parcs=[];
      if(c.totParc<=1){
        parcs.push({...c,parcela:'1 de 1',dataF:c.data,gid});
      } else {
        for(let i=0;i<rest;i++){
          parcs.push({...c,parcela:`${c.parcAtual+i} de ${c.totParc}`,dataF:addMeses(c.data,i),gid});
        }
      }
      grupos.push({base:c,parcs,gid});
    });

    this._upGrupos=grupos;
    this._upDetectarDuplicatas();
    const td=grupos.reduce((s,g)=>s+g.parcs.length,0);
    document.getElementById('upBtnConfirmar').disabled=false;
    document.getElementById('upAlertVal').style.display='none';
    this._upRenderStats(td,novas.length,ign.length,td-novas.length);
    this._upRenderPreview(grupos);
    this._upShowAlert('upAlertAv',
      `✅ Validação concluída — <strong>${novas.length} conta(s)</strong> prontas, gerando <strong>${td} documento(s)</strong> no banco.`);
  },

  // ── DUPLICATAS ──
  // Compara cada parcela a gerar com o banco e com as demais linhas do próprio
  // arquivo. Não bloqueia: marca a linha e o usuário decide (excluir ou manter).
  _upCandidato(p){
    return {conta:p.conta, resp:p.resp, forma:p.forma, data:p.dataF, dataCompra:p.dataCompra||null, vPagar:p.vPagar, parcela:p.parcela};
  },
  _upDetectarDuplicatas(){
    const grupos=this._upGrupos;
    grupos.forEach((g,gi)=>{
      const doArquivo=grupos.flatMap((o,oi)=>oi===gi?[]:o.parcs.map(p=>({...this._upCandidato(p), id:`arquivo-${o.base.linha}`, _linha:o.base.linha})));
      const achados=[];
      g.parcs.forEach(p=>{
        const cand=this._upCandidato(p);
        DUP.buscar(cand).forEach(a=>achados.push({...a, parcela:p.parcela}));
        DUP.buscar(cand,{base:doArquivo}).forEach(a=>achados.push({...a, parcela:p.parcela, motivo:`${a.motivo} (linha ${a.conta._linha} desta planilha)`}));
      });
      g.dup=achados;
    });
  },

  // ── PREVIEW ──
  _upRenderStats(td,ct,ig,ex){
    document.getElementById('upStats').innerHTML=[
      {l:'Docs a criar',v:td,c:'var(--palm)'},{l:'Contas únicas',v:ct,c:'var(--blue)'},
      {l:'Ignoradas',v:ig,c:'var(--t4)'},{l:'Parcelas extras',v:ex,c:'var(--orange)'}
    ].map(s=>`<div class="up-stat"><label>${s.l}</label><div class="sv" style="color:${s.c}">${s.v}</div></div>`).join('');
    document.getElementById('upResumoLinha').textContent=ct+' conta(s) para cadastrar';
  },

  _upRenderPreview(grupos){
    const esc=s=>String(s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    const cats=CACHE.getAllCats().map(c=>c.nome);
    const formas=CACHE.getAllFormas().map(f=>f.nome);
    const resps=['Leo','Pri','Leo & Pri'];
    document.getElementById('upTbodyPreview').innerHTML=!grupos.length
      ?'<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--t4)">Nenhuma conta para exibir</td></tr>'
      :grupos.map((g,i)=>{const c=g.base;const tp=g.parcs.length>1;
        return`<tr>
          <td style="color:var(--t4);font-size:11px">${i+1}</td>
          <td><input type="text" value="${esc(c.conta)}" oninput="APP._upUpdCampo(${i},'conta',this.value)" style="min-width:140px"></td>
          <td><select onchange="APP._upUpdCampo(${i},'resp',this.value)">${resps.map(r=>`<option ${r===c.resp?'selected':''}>${r}</option>`).join('')}</select></td>
          <td><select onchange="APP._upUpdCampo(${i},'forma',this.value)" style="min-width:120px">${formas.map(f=>`<option ${f===c.forma?'selected':''}>${f}</option>`).join('')}</select></td>
          <td><select onchange="APP._upUpdCampo(${i},'cat',this.value)" style="min-width:110px">${cats.map(x=>`<option ${x===c.cat?'selected':''}>${x}</option>`).join('')}</select></td>
          <td><input type="date" value="${g.parcs[0]?.dataF||c.data}" readonly style="min-width:110px;color:var(--t3)" title="Data da 1ª parcela — gerado automaticamente"></td>
          <td><input type="text" inputmode="numeric" class="money-input" value="${maskMoney(floatToCentsStr(c.vPagar))}" oninput="APP._upUpdValor(${i},this.value)" style="width:100px"></td>
          <td style="text-align:center">${tp
            ?`<span class="badge bg-cat" style="cursor:pointer" onclick="APP._upVerParcelas(${i})" title="Ver todas as parcelas">${g.parcs.length} × 🔍</span>`
            :`<span class="audit-chip">1 de 1</span>`}</td>
          <td><input type="text" value="${esc(c.nota)}" oninput="APP._upUpdCampo(${i},'nota',this.value)" style="min-width:90px"></td>
          <td>${g.dup&&g.dup.length?`<div class="up-dup ${DUP.nivel(g.dup)}" title="${esc(g.dup.map(a=>`${a.parcela}: ${a.motivo}; existente ${fmtDate(a.conta.data)} ${fmt(a.conta.vPagar)}`).join('\n'))}">${esc(DUP.resumo(g.dup))}</div>`:'<span style="color:var(--t4);font-size:11px">—</span>'}</td>
          <td><button class="action-btn del" onclick="APP._upDelGrupo(${i})">✕</button></td>
        </tr>`;
      }).join('');
    bindAllMoneyInputs(document.getElementById('upTbodyPreview'));
  },

  _upUpdCampo(i,k,v){ this._upGrupos[i].base[k]=v; this._upGrupos[i].parcs.forEach(p=>p[k]=v); if(['resp','forma'].includes(k)) this._upReavaliar(); },
  _upUpdValor(i,v){ const n=parseMoney(v); this._upGrupos[i].base.vPagar=n; this._upGrupos[i].parcs.forEach(p=>p.vPagar=n); },
  // Re-render só em selects (inputs de texto perderiam o foco a cada tecla)
  _upReavaliar(){ this._upDetectarDuplicatas(); this._upRenderPreview(this._upGrupos); },
  _upDelGrupo(i){ this._upGrupos.splice(i,1); this._upDetectarDuplicatas(); const td=this._upGrupos.reduce((s,g)=>s+g.parcs.length,0); this._upRenderStats(td,this._upGrupos.length,0,td-this._upGrupos.length); this._upRenderPreview(this._upGrupos); },

  _upVerParcelas(i){
    const g=this._upGrupos[i];
    document.getElementById('upTitParcelas').textContent=`Parcelas — ${g.base.conta}`;
    document.getElementById('upTbodyParcelas').innerHTML=g.parcs.map((p,j)=>
      `<tr><td style="color:var(--t4)">${j+1}</td><td><span class="badge bg-cat">${p.parcela}</span></td><td>${p.dataF}</td><td class="neg">${fmt(p.vPagar)}</td></tr>`
    ).join('');
    document.getElementById('ovParcelasUp').classList.add('open');
  },

  // ── CONFIRMAR CADASTRO ──
  async upConfirmar(){
    const grupos=this._upGrupos;
    if(!grupos.length) return this.toast('Nenhuma conta para cadastrar','error');
    // Reavalia (descrição/valor podem ter sido editados) e comunica
    this._upDetectarDuplicatas();
    const comDup=grupos.filter(g=>g.dup&&g.dup.length);
    if(comDup.length){
      const ok=await DUP.confirmar({
        titulo:`${comDup.length} linha(s) da planilha parecem já cadastradas`,
        itens:comDup.map(g=>({candidato:this._upCandidato(g.parcs[0]), achados:g.dup})),
        btnSim:'Não são duplicatas, cadastrar todas',
      });
      if(!ok){
        this._upRenderPreview(grupos);
        return this.toast('Remova as linhas repetidas (✕) e confirme novamente','info');
      }
    }
    const btn=document.getElementById('upBtnConfirmar');
    btn.disabled=true; btn.textContent='⏳ Cadastrando...';

    try{
      const td=grupos.reduce((s,g)=>s+g.parcs.length,0);
      const todas=grupos.flatMap(g=>g.parcs);
      const LOTE=400;
      for(let i=0;i<todas.length;i+=LOTE){
        const batch=fbDb.batch();
        todas.slice(i,i+LOTE).forEach(p=>{
          const ref=fbDb.collection('contas').doc();
          batch.set(ref,{
            conta:p.conta, resp:p.resp,
            catId: CACHE.getAllCats().find(c=>c.nome===p.cat)?.id||p.cat,
            formaId: CACHE.getAllFormas().find(f=>f.nome===p.forma)?.id||p.forma,
            data:p.dataF, vPagar:p.vPagar, vPago:null,
            parcela:p.parcela, grupo:p.gid, nota:p.nota||'', dataCompra:p.dataCompra||null,
            createdBy:STATE.usuario,
            createdAt:firebase.firestore.FieldValue.serverTimestamp(),
            origem:'importacao', planilhaId:this._upPlanId,
          });
        });
        await batch.commit();
      }

      await fbDb.collection('importacoes').add({
        planilhaId: this._upPlanId,
        nome:       this._upPlanNome,
        qtdContas:  grupos.length,
        qtdDocs:    td,
        importadoPor: STATE.usuario,
        data:   new Date().toLocaleDateString('pt-BR'),
        hora:   new Date().toLocaleTimeString('pt-BR'),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      this._upGrupos=[]; this._upPlanId=''; this._upPlanNome='';
      document.getElementById('upSecaoPreview').style.display='none';
      document.getElementById('upFileInfo').style.display='none';
      document.getElementById('upFileInput').value='';
      this._upOcultarAlertas();
      this.upRenderHistorico();
      this._upShowAlert('upAlertOk',`✅ <strong>${grupos.length} conta(s)</strong> cadastradas, gerando <strong>${td} documento(s)</strong> no banco!`);
      this.toast(`${td} documentos cadastrados ✅`,'success');
    } catch(err){
      this.toast('Erro ao cadastrar: '+err.message,'error');
    }

    btn.textContent='✅ Confirmar Cadastro em Massa';
    btn.disabled=false;
  },

  /** Converte célula de data (Date, texto dd/mm/aaaa, ISO ou serial Excel) em YYYY-MM-DD. */
  _upParseData(rd){
    let data='';
    if(rd instanceof Date){
      data=rd.toISOString().split('T')[0];
    } else if(typeof rd==='string'){
      const s=rd.trim();
      if(s.includes('/')){
        const pts=s.split('/');
        if(pts.length===3){ const[d,m,a]=pts; data=`${a.padStart(4,'20')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
      } else if(s.includes('-') && s.length>=8){
        data=s;
      }
    } else if(typeof rd==='number' && rd>0){
      try{ const p=XLSX.SSF.parse_date_code(rd); data=`${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`; }catch(e){}
    }
    if(data&&isNaN(new Date(data+'T12:00').getTime())) return '';
    return data;
  },

  upCancelar(){
    this._upGrupos=[]; this._upPlanId='';
    document.getElementById('upSecaoPreview').style.display='none';
    document.getElementById('upFileInfo').style.display='none';
    document.getElementById('upFileInput').value='';
    this._upOcultarAlertas();
    this.toast('Operação cancelada','info');
  },

  // ── HISTORICO ──
  async upRenderHistorico(){
    const snap=await fbDb.collection('importacoes').orderBy('createdAt','desc').get();
    const all=snap.docs.map(d=>({id:d.id,...d.data()}));
    const exibir=this._upVerTodas?all:all.slice(0,3);
    const el=document.getElementById('upHistorico');
    if(!el) return;
    if(!all.length){ el.innerHTML='<p style="color:var(--t4);font-size:12.5px">Nenhuma importação registrada.</p>'; return; }
    el.innerHTML=exibir.map(i=>`
      <div class="up-imp">
        <div class="in">📄 ${i.nome||'Sem nome'}.xlsx</div>
        <div class="im">${i.data||''} às ${i.hora||''} · por ${i.importadoPor||'—'} · ${i.qtdDocs} docs</div>
        <span class="up-idchip">${i.planilhaId}</span>
        <span class="badge bg-pago" style="margin-left:6px">${i.qtdContas} contas</span>
      </div>`).join('');
    if(all.length>3&&!this._upVerTodas)
      el.innerHTML+=`<p style="font-size:12px;color:var(--t4);margin-top:6px">${all.length-3} registro(s) mais antigos ocultos.</p>`;
  },

  upToggleHist(){ this._upVerTodas=!this._upVerTodas; this.upRenderHistorico(); },

  // ── HELPERS ──
  _upShowAlert(id,msg){ const el=document.getElementById(id); if(!el)return; el.innerHTML=msg; el.style.display='block'; },
  _upOcultarAlertas(){ ['upAlertErr','upAlertOk','upAlertAv','upAlertVal'].forEach(id=>{ const el=document.getElementById(id); if(el)el.style.display='none'; }); },
});
