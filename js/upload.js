"use strict";

// ============================================================
// UPLOAD CARDS MODULE
// ============================================================

/** Largura em que o painel de edição vira folha inferior (mesmo valor de css/upload.css). */
const UP_CELULAR='(max-width:900px)';

/** Ícones de traço (24x24, stroke=currentColor) da pré-visualização. */
const UP_IC=(()=>{
  const sv=d=>`<svg class="upr-ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  return {
    alerta:  sv('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
    check:   sv('<polyline points="20 6 9 17 4 12"/>'),
    lixo:    sv('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>'),
    cartao:  sv('<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>'),
    carteira:sv('<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>'),
    arquivo: sv('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>'),
    x:       sv('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    esq:     sv('<path d="m15 18-6-6 6-6"/>'),
    dir:     sv('<path d="m9 18 6-6-6-6"/>'),
    cadeado: sv('<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    camadas: sv('<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>'),
    editar:  sv('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>'),
  };
})();
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
    anosJanela().forEach(a=>aS.appendChild(new Option(a,a)));
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
        if(!anoValido(ano)) ev.push(`Linha ${c.linha}: Data "${c.data}" com ano inválido (use 4 dígitos)`);
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
      this._upGrupos=[];
      this._upResetVista();
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
    document.getElementById('upAlertVal').style.display='none';
    // Abre direto a primeira pendência (no celular não: a folha cobriria a lista)
    this._upResetVista();
    if(!this._upCelular()) this._upSel=grupos.findIndex(g=>this._upPendente(g));
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

  // ══════════════════════════════════════════════════════════════════════
  // PRÉ-VISUALIZAÇÃO: lista de leitura + painel de edição (css/upload.css)
  // ──────────────────────────────────────────────────────────────────────
  // • Lista: uma conta por linha, em dois níveis (descrição e valor; forma,
  //   categoria, vencimento e nota). Agrupada por situação, categoria ou
  //   responsável. Filtros: abas (Todas, Revisar, Leo, Pri, Ambos) e busca.
  // • Painel: edita a linha selecionada (_upSel = índice em _upGrupos).
  //   No celular (UP_CELULAR) vira folha inferior.
  // • Duplicata pendente = tem achados e o usuário ainda não marcou "Não é
  //   duplicata" para ESSE conjunto de achados (assinatura em g.dupOk).
  //   Mudou o achado (edição de descrição, valor, forma...), volta a pendente.
  // • Somas em centavos inteiros (centavos(), fin-state.js); vPagar segue
  //   em reais no modelo, como no restante do sistema.
  // ══════════════════════════════════════════════════════════════════════

  _upSel:     -1,
  _upFiltro:  'todas',
  _upBusca:   '',
  _upAgrup:   'situacao',
  _upIgn:     0,
  _upTimer:   null,
  _upSalvando:false,

  _upEsc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  },
  _upCelular(){ return typeof matchMedia==='function' && matchMedia(UP_CELULAR).matches; },

  /** Volta filtros, busca, agrupamento e seleção ao padrão (novo arquivo, cancelar, concluir). */
  _upResetVista(){
    this._upSel=-1; this._upFiltro='todas'; this._upBusca=''; this._upAgrup='situacao';
    const b=document.getElementById('upBusca');   if(b) b.value='';
    const a=document.getElementById('upAgrupar'); if(a) a.value='situacao';
  },

  // ── Duplicatas: pendência e confirmação do usuário ──
  _upDupSig(g){ return (g.dup||[]).map(a=>`${a.conta.id||''}|${a.parcela}|${a.motivo}`).join(';'); },
  _upPendente(g){ return !!(g.dup&&g.dup.length) && g.dupOk!==this._upDupSig(g); },
  _upConferida(g){ return !!(g.dup&&g.dup.length) && g.dupOk===this._upDupSig(g); },

  // ── Formatação ──
  _upValorHtml(v){
    const s=fmt(v), sim=typeof MONEY_CFG!=='undefined'?MONEY_CFG.simbolo:'R$';
    return s.startsWith(sim) ? `<small>${this._upEsc(sim)}</small>${s.slice(sim.length).trim()}` : s;
  },
  _upTotais(lista){
    return lista.reduce((t,g)=>{
      const v=centavos(g.base.vPagar);
      t.linhas+=v; t.docs+=v*g.parcs.length; t.n+=g.parcs.length;
      return t;
    },{linhas:0, docs:0, n:0});
  },
  /** Cor da categoria = cor do grupo EAC dela (js/eac.js); sem grupo, neutra. */
  _upCorCat(nome){
    const c=CACHE.cats.find(x=>x.nome===nome);
    const g=c&&c.grupoId ? (CACHE.grupos||[]).find(x=>x.id===c.grupoId) : null;
    return g&&typeof EAC_CORES!=='undefined'&&EAC_CORES.includes(g.cor) ? `var(--${g.cor})` : 'var(--upr-neutro)';
  },
  _upAvatar(resp){
    if(resp==='Leo'||resp==='Pri')
      return `<span class="who-av who-${resp.toLowerCase()} upr-av" data-avatar="${resp}" aria-hidden="true">${resp[0]}</span>`;
    return `<span class="who-duo upr-av" aria-hidden="true"><i class="who-leo" data-avatar="Leo">L</i><i class="who-pri" data-avatar="Pri">P</i></span>`;
  },
  _upIcForma(forma){ return /cart[aã]o|cr[eé]dito/i.test(forma||'') ? UP_IC.cartao : UP_IC.carteira; },

  // ── Cabeçalho ──
  _upRenderStats(td,ct,ig,ex){
    this._upIgn=ig;
    const el=document.getElementById('upStats');
    if(el) el.innerHTML=[[ct,'contas únicas'],[td,'documentos'],[ex,'parcelas extras'],[ig,'ignoradas']]
      .map(([v,l])=>`<span${v?'':' class="zero"'}><b>${v}</b>${l}</span>`).join('');
    const arq=document.getElementById('upResumoArquivo');
    const nome=document.getElementById('upFileName')?.textContent||'';
    if(arq){ arq.hidden=!nome; arq.innerHTML=nome?`${UP_IC.arquivo}<span>${this._upEsc(nome)}</span>`:''; }
  },

  /** Ponto de entrada: redesenha abas, lista, painel e barra. */
  _upRenderPreview(grupos){
    if(grupos!==this._upGrupos) this._upGrupos=grupos;
    if(this._upSel>=this._upGrupos.length) this._upSel=-1;
    this._upRenderAbas();
    this._upRenderLista();
    this._upRenderPainel();
    this._upRenderBarra();
  },

  // ── Filtros ──
  upFiltrar(f){ this._upFiltro=f; this._upRenderAbas(); this._upRenderLista(); },
  upBuscar(q){ this._upBusca=q||''; this._upRenderLista(); },
  upAgrupar(m){ this._upAgrup=m; this._upRenderLista(); },

  _upRenderAbas(){
    const el=document.getElementById('upAbas'); if(!el) return;
    const G=this._upGrupos, n=r=>G.filter(g=>g.base.resp===r).length;
    const pend=G.filter(g=>this._upPendente(g)).length;
    el.innerHTML=[['todas','Todas',G.length],['revisar','Revisar',pend],['Leo','Leo',n('Leo')],['Pri','Pri',n('Pri')],['Leo & Pri','Ambos',n('Leo & Pri')]]
      .map(([id,rot,q])=>`<button type="button" class="upr-aba${id==='revisar'&&q?' warn':''}" aria-pressed="${this._upFiltro===id}" onclick="APP.upFiltrar('${this._upEsc(id)}')">${id==='revisar'?UP_IC.alerta:''}${rot}<b>${q}</b></button>`).join('');
  },

  _upVisiveis(){
    const q=DUP._norm(this._upBusca), f=this._upFiltro;
    return this._upGrupos.map((g,i)=>({g,i})).filter(({g})=>{
      const c=g.base;
      if(f==='revisar'&&!this._upPendente(g)) return false;
      if((f==='Leo'||f==='Pri'||f==='Leo & Pri')&&c.resp!==f) return false;
      return !q || DUP._norm(`${c.conta} ${c.nota} ${c.cat} ${c.forma}`).includes(q);
    });
  },

  _upSecoes(itens){
    if(this._upAgrup==='situacao'){
      const pend=itens.filter(x=>this._upPendente(x.g));
      const ok=itens.filter(x=>!this._upPendente(x.g));
      return [
        {tit:'Requer revisão', itens:pend, warn:true},
        {tit:'Prontas para cadastrar', itens:ok, ok:true},
      ].filter(s=>s.itens.length);
    }
    const porCat=this._upAgrup==='cat';
    const chave=x=>porCat ? (x.g.base.cat||'Sem categoria') : (x.g.base.resp||'Sem responsável');
    const ordemResp=['Leo','Pri','Leo & Pri'];
    const mapa=new Map();
    itens.forEach(x=>{ const k=chave(x); if(!mapa.has(k)) mapa.set(k,[]); mapa.get(k).push(x); });
    return [...mapa.entries()]
      .sort(([a],[b])=>porCat ? a.localeCompare(b,'pt') : ordemResp.indexOf(a)-ordemResp.indexOf(b))
      .map(([k,its])=>({tit:k==='Leo & Pri'?'Leo & Pri (ambos)':k, itens:its, cor:porCat?this._upCorCat(k):null}));
  },

  /** Índices na ordem em que aparecem na tela (navegação ↑ ↓, Anterior/Próxima). */
  _upOrdem(){ return this._upSecoes(this._upVisiveis()).flatMap(s=>s.itens.map(x=>x.i)); },

  // ── Lista ──
  _upRenderLista(){
    const el=document.getElementById('upLista'); if(!el) return;
    const G=this._upGrupos;
    if(!G.length){ el.innerHTML='<p class="upr-vazio">Nenhuma conta para exibir.</p>'; return; }
    const secoes=this._upSecoes(this._upVisiveis());
    if(!secoes.length){
      el.innerHTML=`<p class="upr-vazio">${this._upFiltro==='revisar'&&!this._upBusca?'Nenhuma linha aguardando revisão.':'Nenhuma conta neste filtro.'}</p>`;
      return;
    }
    const esc=v=>this._upEsc(v);
    el.innerHTML=secoes.map(s=>{
      const t=this._upTotais(s.itens.map(x=>x.g));
      const ic=s.warn?UP_IC.alerta:s.ok?UP_IC.check:s.cor?`<i class="upr-dot" style="--c:${s.cor}"></i>`:'';
      const dir=s.warn?'Decida antes de confirmar':`Subtotal <b>${fmt(t.linhas/100)}</b>`;
      return `<div class="upr-grupo${s.warn?' warn':''}${s.ok?' ok':''}">${ic}<span>${esc(s.tit)} · ${s.itens.length}</span><span class="upr-grupo-dir">${dir}</span></div>`
        + s.itens.map(x=>this._upLinhaHtml(x)).join('');
    }).join('');
    if(typeof this.aplicarAvatares==='function') this.aplicarAvatares();
  },

  _upLinhaHtml({g,i}){
    const esc=v=>this._upEsc(v), c=g.base, p0=g.parcs[0]||{};
    const pend=this._upPendente(g), conf=this._upConferida(g), sel=i===this._upSel;
    const tp=g.parcs.length>1;
    const sub=tp ? `<span class="info">parcela ${esc(p0.parcela)} · gera ${g.parcs.length}</span>`
               : c.totParc>1 ? `parcela ${esc(p0.parcela)}` : 'à vista';
    const selo=pend ? `<span class="upr-selo warn">${DUP.nivel(g.dup)==='provavel'?'Provável':'Possível'} duplicata</span>`
              : conf ? '<span class="upr-selo">Conferida</span>' : '';
    const meta=[
      `<span class="upr-m">${this._upIcForma(c.forma)}${esc(c.forma)}</span>`,
      `<span class="upr-chip" style="--c:${this._upCorCat(c.cat)}"><i></i>${esc(c.cat)}</span>`,
      `<span class="upr-m">${tp?'1ª em':'Vence'} ${fmtDate(p0.dataF||c.data)}</span>`,
      c.nota ? `<span class="upr-nota">${esc(c.nota)}</span>` : '',
    ].filter(Boolean).join('<i class="upr-sep" aria-hidden="true"></i>');
    return `<div class="upr-row${sel?' sel':''}${pend?' pend':''}" data-i="${i}">
      <button type="button" class="upr-row-btn" aria-pressed="${sel}" onclick="APP.upSelecionar(${i})">
        <span class="upr-n">${i+1}</span>
        ${this._upAvatar(c.resp)}
        <span class="upr-txt">
          <span class="upr-l1"><span class="upr-desc">${esc(c.conta)||'<em>Sem descrição</em>'}</span>${selo}</span>
          <span class="upr-l2">${meta}</span>
        </span>
        <span class="upr-val"><span class="v">${this._upValorHtml(c.vPagar)}</span><span class="p">${sub}</span></span>
      </button>
      <button type="button" class="upr-del" title="Excluir linha" aria-label="Excluir linha ${i+1}: ${esc(c.conta)}" onclick="APP._upDelGrupo(${i})">${UP_IC.lixo}</button>
    </div>`;
  },

  _upMarcarSelecao(){
    document.querySelectorAll('#upLista .upr-row').forEach(r=>{
      const s=Number(r.dataset.i)===this._upSel;
      r.classList.toggle('sel',s);
      r.querySelector('.upr-row-btn')?.setAttribute('aria-pressed',String(s));
    });
  },

  /** Seleciona a linha i e abre o painel. foco: 'lista' mantém o foco na linha; 'painel' leva ao painel. */
  upSelecionar(i, foco){
    if(!this._upGrupos[i]) return;
    this._upSel=i;
    this._upMarcarSelecao();
    this._upRenderPainel();
    const row=document.querySelector(`#upLista .upr-row[data-i="${i}"]`);
    if(foco==='lista') row?.querySelector('.upr-row-btn')?.focus({preventScroll:true});
    row?.scrollIntoView({block:'nearest'});
    if(this._upCelular()&&foco!=='lista') document.getElementById('upPainelFechar')?.focus({preventScroll:true});
  },

  upNavegar(d, foco){
    const ordem=this._upOrdem(); if(!ordem.length) return;
    const k=ordem.indexOf(this._upSel);
    const nk=k<0 ? (d>0?0:ordem.length-1) : Math.min(ordem.length-1, Math.max(0, k+d));
    this.upSelecionar(ordem[nk], foco);
  },

  upProximaPendente(){
    const ordem=this._upGrupos.map((g,i)=>i).filter(i=>this._upPendente(this._upGrupos[i]));
    if(!ordem.length) return;
    const prox=ordem.find(i=>i>this._upSel);
    this.upSelecionar(prox!=null?prox:ordem[0]);
  },

  upFecharPainel(){
    const ant=this._upSel;
    this._upSel=-1;
    this._upMarcarSelecao();
    this._upRenderPainel();
    document.querySelector(`#upLista .upr-row[data-i="${ant}"] .upr-row-btn`)?.focus({preventScroll:true});
  },

  _upTeclaLista(e){
    if(!e.target.classList?.contains('upr-row-btn')) return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();
      const i=Number(e.target.closest('.upr-row').dataset.i);
      if(i!==this._upSel) this._upSel=i;
      this.upNavegar(e.key==='ArrowDown'?1:-1,'lista');
    }
  },
  _upTeclaPainel(e){
    if(e.key==='Escape'&&this._upSel>=0){ e.preventDefault(); this.upFecharPainel(); }
  },

  // ── Painel ──
  _upRenderPainel(){
    const el=document.getElementById('upPainel'), lay=document.getElementById('upLayout');
    if(!el) return;
    const G=this._upGrupos, g=G[this._upSel];
    lay?.classList.toggle('sem-linhas', !G.length);
    lay?.classList.toggle('com-sel', !!g);
    if(!g){ el.innerHTML=G.length?this._upPainelVazioHtml():''; return; }

    const esc=v=>this._upEsc(v), c=g.base, i=this._upSel;
    const ordem=this._upOrdem(), k=ordem.indexOf(i);
    const tp=g.parcs.length>1;
    const formas=CACHE.getAllFormas().map(f=>f.nome), cats=CACHE.getAllCats().map(x=>x.nome);
    // Valor fora da lista (planilha antiga) continua visível e selecionado
    const opts=(lista,atual)=>(lista.includes(atual)||!atual?lista:[atual,...lista])
      .map(v=>`<option${v===atual?' selected':''}>${esc(v)}</option>`).join('');
    const resp=[['Leo','Leo'],['Pri','Pri'],['Leo & Pri','Ambos']].map(([v,rot])=>
      `<label class="resp-op"><input type="radio" name="upEdResp" value="${esc(v)}"${c.resp===v?' checked':''} onchange="APP._upEd('resp',this.value)">${this._upAvatar(v).replace(' upr-av','')}<span>${rot}</span></label>`).join('');
    const ultima=g.parcs[g.parcs.length-1]||{};

    el.innerHTML=`
      <div class="upr-p-head">
        <div class="upr-p-tit">
          <span class="k">Conta ${i+1} de ${G.length}${c.linha?` · linha ${c.linha} da planilha`:''}</span>
          <strong id="upPainelTit">${esc(c.conta)||'Sem descrição'}</strong>
        </div>
        <button type="button" class="upr-p-x" id="upPainelFechar" aria-label="Fechar painel" title="Fechar (Esc)" onclick="APP.upFecharPainel()">${UP_IC.x}</button>
      </div>
      <div class="upr-p-body">
        <div id="upPainelDup">${this._upDupHtml(g,i)}</div>
        <div class="fg">
          <label for="upEdConta">Descrição</label>
          <input type="text" id="upEdConta" value="${esc(c.conta)}" autocomplete="off" oninput="APP._upEd('conta',this.value)">
        </div>
        <div class="fg">
          <span class="fg-tit" id="upEdRespTit">Responsável</span>
          <div class="resp-seg" role="radiogroup" aria-labelledby="upEdRespTit">${resp}</div>
        </div>
        <div class="fg-pair">
          <div class="fg"><label for="upEdForma">Forma de pagamento</label><select id="upEdForma" onchange="APP._upEd('forma',this.value)">${opts(formas,c.forma)}</select></div>
          <div class="fg"><label for="upEdCat">Categoria</label><select id="upEdCat" onchange="APP._upEd('cat',this.value)">${opts(cats,c.cat)}</select></div>
        </div>
        <div class="fg-pair">
          <div class="fg">
            <label for="upEdData">${tp?'1º vencimento':'Vencimento'}</label>
            <input type="text" id="upEdData" value="${fmtDate(g.parcs[0]?.dataF||c.data)}" readonly aria-describedby="upEdDataDica">
            <small class="upr-dica" id="upEdDataDica">${UP_IC.cadeado}Vem da planilha</small>
          </div>
          <div class="fg">
            <label for="upEdValor">${tp?'Valor da parcela':'Valor'} (${esc(typeof MONEY_CFG!=='undefined'?MONEY_CFG.simbolo:'R$')})</label>
            <input type="text" id="upEdValor" class="money-input upr-money" inputmode="numeric" value="${maskMoney(floatToCentsStr(c.vPagar))}" oninput="APP._upEd('vPagar',this.value)">
          </div>
        </div>
        ${tp?`<div class="upr-parcs">
          ${UP_IC.camadas}
          <span>Gera <b>${g.parcs.length} documentos</b>: parcela ${esc(g.parcs[0].parcela)} até ${esc(ultima.parcela)} (${fmtDate(ultima.dataF)})</span>
          <button type="button" class="btn btn-ghost btn-sm" onclick="APP._upVerParcelas(${i})">Ver parcelas</button>
        </div>`:''}
        <div class="fg">
          <label for="upEdNota">Nota <span class="opc">(opcional)</span></label>
          <input type="text" id="upEdNota" value="${esc(c.nota)}" placeholder="Ex.: presente de aniversário" autocomplete="off" oninput="APP._upEd('nota',this.value)">
        </div>
      </div>
      <div class="upr-p-foot">
        <button type="button" class="btn btn-ghost btn-sm" onclick="APP.upNavegar(-1)"${k<=0?' disabled':''}>${UP_IC.esq}Anterior</button>
        <span class="upr-p-kbd"><kbd>↑</kbd><kbd>↓</kbd> na lista</span>
        <button type="button" class="btn btn-primary btn-sm" onclick="APP.upNavegar(1)"${k<0||k>=ordem.length-1?' disabled':''}>Próxima${UP_IC.dir}</button>
      </div>`;
    bindAllMoneyInputs(el);
    if(typeof this.aplicarAvatares==='function') this.aplicarAvatares();
  },

  _upPainelVazioHtml(){
    const pend=this._upGrupos.filter(g=>this._upPendente(g)).length;
    return `<div class="upr-p-vazio">
      ${UP_IC.editar}
      <strong>Selecione uma conta para editar</strong>
      <p>Clique em uma linha da lista. Com o foco na lista, use <kbd>↑</kbd> <kbd>↓</kbd> para percorrer.</p>
      ${pend?`<button type="button" class="btn btn-sm upr-btn-warn" onclick="APP.upProximaPendente()">${UP_IC.alerta}Revisar ${pend} pendência${pend>1?'s':''}</button>`:''}
    </div>`;
  },

  /** Bloco da duplicata no painel: motivo, comparação lado a lado e decisão. */
  _upDupHtml(g,i){
    if(!g.dup||!g.dup.length) return '';
    const esc=v=>this._upEsc(v);
    if(this._upConferida(g)) return `<div class="upr-conf">${UP_IC.check}<span>Marcada como <b>não duplicata</b>.</span><button type="button" class="upr-link" onclick="APP.upDesfazerConferida(${i})">Desfazer</button></div>`;
    const a=g.dup[0], ex=a.conta, p=g.parcs.find(x=>x.parcela===a.parcela)||g.parcs[0];
    const daPlanilha=ex._linha!=null;
    const lin=(rot,v1,v2,dif)=>`<tr><th scope="row">${rot}</th><td${dif?' class="dif"':''}>${v1}</td><td${dif?' class="dif"':''}>${v2}</td></tr>`;
    const compra=p.dataCompra||ex.dataCompra;
    const motivo=a.motivo.charAt(0).toUpperCase()+a.motivo.slice(1);
    const nivel=DUP.nivel(g.dup);
    return `<div class="upr-alerta ${nivel}">
      <div class="upr-alerta-h">${UP_IC.alerta}${nivel==='provavel'?'Provável duplicata':'Possível duplicata'}</div>
      <p class="upr-alerta-d">${esc(motivo)}.${g.dup.length>1?` Há mais ${g.dup.length-1} ocorrência${g.dup.length>2?'s':''} parecida${g.dup.length>2?'s':''}.`:''}</p>
      <table class="upr-cmp">
        <thead><tr><td></td><th scope="col">Esta linha</th><th scope="col">${daPlanilha?`Linha ${esc(ex._linha)} da planilha`:'Já no banco'}</th></tr></thead>
        <tbody>
          ${lin('Vencimento',fmtDate(p.dataF),fmtDate(ex.data),p.dataF!==ex.data)}
          ${compra?lin('Compra',p.dataCompra?fmtDate(p.dataCompra):'—',ex.dataCompra?fmtDate(ex.dataCompra):'—',(p.dataCompra||'')!==(ex.dataCompra||'')):''}
          ${lin('Valor',fmt(p.vPagar),fmt(ex.vPagar),centavos(p.vPagar)!==centavos(ex.vPagar))}
          ${lin('Parcela',esc(p.parcela||'1 de 1'),esc(ex.parcela||'1 de 1'),DUP._parcela(p.parcela)!==DUP._parcela(ex.parcela))}
        </tbody>
      </table>
      <div class="upr-alerta-acts">
        <button type="button" class="btn btn-sm upr-btn-del" onclick="APP._upDelGrupo(${i})">${UP_IC.lixo}Excluir linha</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="APP.upNaoDuplicata(${i})">Não é duplicata</button>
      </div>
    </div>`;
  },

  upNaoDuplicata(i){
    const g=this._upGrupos[i]; if(!g) return;
    g.dupOk=this._upDupSig(g);
    const restam=this._upGrupos.some(x=>this._upPendente(x));
    this._upRenderAbas(); this._upRenderLista(); this._upRenderBarra();
    if(restam) this.upProximaPendente(); else this._upRenderPainel();
    this.toast(restam?'Marcada como conferida. Próxima pendência aberta.':'Marcada como conferida','success');
  },
  upDesfazerConferida(i){
    const g=this._upGrupos[i]; if(!g) return;
    g.dupOk=null;
    this._upRenderPreview(this._upGrupos);
  },

  // ── Edição pelo painel ──
  // Texto: atualiza o modelo na hora e redesenha a lista com atraso (o foco
  // fica no painel, que não é redesenhado). Selects e responsável: imediato.
  _upEd(k,v){
    const g=this._upGrupos[this._upSel]; if(!g) return;
    if(k==='vPagar') v=parseMoney(v);
    g.base[k]=v; g.parcs.forEach(p=>p[k]=v);
    if(k==='conta'){ const t=document.getElementById('upPainelTit'); if(t) t.textContent=v||'Sem descrição'; }
    clearTimeout(this._upTimer);
    this._upTimer=setTimeout(()=>this._upAposEdicao(), k==='resp'||k==='forma'||k==='cat'?0:250);
  },
  _upAposEdicao(){
    this._upDetectarDuplicatas();
    this._upRenderAbas(); this._upRenderLista(); this._upRenderBarra();
    const box=document.getElementById('upPainelDup'), g=this._upGrupos[this._upSel];
    if(box&&g) box.innerHTML=this._upDupHtml(g,this._upSel);
  },

  _upDelGrupo(i){
    if(!this._upGrupos[i]) return;
    this._upGrupos.splice(i,1);
    if(this._upSel===i) this._upSel=this._upGrupos[i]?i:i-1;
    else if(this._upSel>i) this._upSel--;
    if(!this._upGrupos.length) this._upSel=-1;
    this._upDetectarDuplicatas();
    const td=this._upGrupos.reduce((s,g)=>s+g.parcs.length,0);
    this._upRenderStats(td,this._upGrupos.length,this._upIgn,td-this._upGrupos.length);
    this._upRenderPreview(this._upGrupos);
  },

  // ── Barra fixa ──
  _upRenderBarra(){
    const G=this._upGrupos, t=this._upTotais(G);
    const pend=G.filter(g=>this._upPendente(g)).length;
    const tot=document.getElementById('upTotal');
    if(tot) tot.innerHTML=this._upValorHtml(t.linhas/100);
    const info=document.getElementById('upBarraInfo');
    if(info) info.innerHTML=`<b>${G.length}</b> conta${G.length===1?'':'s'} · <b>${t.n}</b> documento${t.n===1?'':'s'}`
      + (t.docs!==t.linhas?`<span class="upr-barra-fut"> · <b>${fmt(t.docs/100)}</b> com parcelas futuras</span>`:'');
    const pe=document.getElementById('upBarraPend');
    if(pe){ pe.hidden=!pend; pe.innerHTML=`${UP_IC.alerta}${pend} linha${pend>1?'s':''} aguardando revisão`; }
    const btn=document.getElementById('upBtnConfirmar');
    if(btn){
      btn.disabled=this._upSalvando||!G.length;
      btn.innerHTML=this._upSalvando?'Cadastrando…':`${UP_IC.check}Confirmar cadastro${t.n?`<span class="upr-btn-n"> · ${t.n} doc${t.n>1?'s':''}</span>`:''}`;
    }
  },

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
    if(this._upSalvando) return;
    // Reavalia (descrição/valor podem ter sido editados) e comunica só as
    // pendentes: as marcadas "Não é duplicata" no painel já foram decididas.
    this._upDetectarDuplicatas();
    const comDup=grupos.filter(g=>this._upPendente(g));
    if(comDup.length){
      const ok=await DUP.confirmar({
        titulo:`${comDup.length} linha(s) da planilha parecem já cadastradas`,
        itens:comDup.map(g=>({candidato:this._upCandidato(g.parcs[0]), achados:g.dup})),
        btnSim:'Não são duplicatas, cadastrar todas',
      });
      if(!ok){
        this._upFiltro='revisar';
        this._upRenderPreview(grupos);
        this.upProximaPendente();
        return this.toast('Revise as linhas marcadas (excluir ou "Não é duplicata") e confirme novamente','info');
      }
    }
    this._upSalvando=true;
    this._upRenderBarra();

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
      this._upResetVista();
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

    this._upSalvando=false;
    this._upRenderBarra();
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
    this._upResetVista();
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
