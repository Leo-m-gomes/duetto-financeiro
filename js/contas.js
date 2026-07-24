"use strict";

Object.assign(APP, {
  // ============================================================
  // CONTAS
  // ============================================================
  renderContas(){
    const search=document.getElementById('searchContas').value.toLowerCase();
    const ano=document.getElementById('filtroAnoContas').value;
    const mes=document.getElementById('filtroMesContas').value;
    const resp=document.getElementById('filtroRespContas').value;
    this._aplicarTemaResp(resp);
    const cat=document.getElementById('filtroCatContas').value;
    const formaId=document.getElementById('filtroFormaContas')?.value||'';
    const status=document.getElementById('filtroStatus').value;
    const recFiltro=document.getElementById('filtroRecorrente')?.value||'';
    const p=STATE.periodoContas;

    let data = p
      ? CACHE.contas.filter(c=>{ const d=new Date(c.data+'T12:00'); return d.getFullYear()===p.ano&&d.getMonth()>=p.mesIni&&d.getMonth()<=p.mesFim; })
      : CACHE.getByAnoMes(ano,mes);

    let mergeRef=null;
    if(p) mergeRef={y:p.ano,m:p.mesIni};
    else if(ano!=='todos'&&mes!=='todos') mergeRef={y:parseInt(ano),m:parseInt(mes)};
    if(mergeRef){
      const ids=new Set(data.map(c=>c.id));
      CACHE.getOverdue().forEach(c=>{
        if(ids.has(c.id))return;
        const d=new Date(c.data+'T12:00');
        if(d.getFullYear()<mergeRef.y||(d.getFullYear()===mergeRef.y&&d.getMonth()<mergeRef.m))data.push(c);
      });
    }

    if(search)  data = data.filter(c=>{
      const cat=CACHE.resolveCat(c.catId||c.cat)||'';
      const forma=CACHE.resolveForma(c.formaId||c.forma)||'';
      return [c.conta,c.nota,c.resp,cat,forma,c.parcela,c.data,c.updatedBy,c.createdBy,c.paidBy]
        .some(v=>v&&String(v).toLowerCase().includes(search));
    });
    if(resp)    data = filtrarPorResp(data, resp);
    if(cat)     data = data.filter(c=>CACHE.resolveCat(c.catId||c.cat)===cat);
    if(formaId) data = data.filter(c=>c.formaId===formaId||CACHE.resolveForma(c.formaId||c.forma)===CACHE.getFormaNome(formaId));
    if(recFiltro==='sim') data = data.filter(c=>c.recorrente);
    else if(recFiltro==='nao') data = data.filter(c=>!c.recorrente);
    const _quitada=c=>c._split?c.vPago>0:(c.resp==='Leo & Pri'&&c.pagamentos?(!!c.pagamentos.Leo&&!!c.pagamentos.Pri):c.vPago>0);
    if(status==='pago')          data=data.filter(c=>_quitada(c));
    else if(status==='pendente') data=data.filter(c=>!_quitada(c));
    else if(status==='atrasado') data=data.filter(c=>!_quitada(c)&&c.data<today());

    document.getElementById('totalGeral').textContent    = fmt(data.reduce((s,c)=>s+vEfetivo(c),0));
    document.getElementById('totalPago').textContent     = fmt(data.reduce((s,c)=>s+(c.vPago||0),0));
    document.getElementById('totalPendente').textContent = fmt(data.reduce((s,c)=>s+vPendente(c),0));

    const atrasadas=CACHE.getOverdue();
    const alertEl=document.getElementById('overdueAlert');
    if(atrasadas.length>0){alertEl.style.display='block';alertEl.innerHTML=`⚠️ <strong>${atrasadas.length} conta${atrasadas.length>1?'s':''} em atraso</strong> — Clique para filtrar`;}
    else alertEl.style.display='none';

    document.getElementById('contasInfo').textContent=`${data.length} conta${data.length!==1?'s':''} encontrada${data.length!==1?'s':''}`;

    // Ordenação
    data = this._aplicarSort(data,'sortContas');

    const totalPg=Math.max(1,Math.ceil(data.length/STATE.pgSz));
    if(STATE.pg>totalPg)STATE.pg=1;
    const start=(STATE.pg-1)*STATE.pgSz;
    const paged=data.slice(start,start+STATE.pgSz);

    document.getElementById('tbodyContas').innerHTML=paged.map((c,i)=>{
      const isShared=c.resp==='Leo & Pri';
      const fullyPaid=c._split?c.vPago>0:(isShared&&c.pagamentos?(!!c.pagamentos.Leo&&!!c.pagamentos.Pri):c.vPago>0);
      const hasPg=c.vPago>0;
      const atr=!fullyPaid&&(c._split?c.data<today():isOverdue(c)); const ef=vEfetivo(c); const pend=fullyPaid?0:vPendente(c);
      const catNome=CACHE.resolveCat(c.catId||c.cat);const formaNome=CACHE.resolveForma(c.formaId||c.forma);
      const auditBy=c.updatedBy||c.createdBy||'';
      const hasGrupo=c.grupo&&CACHE.getByGrupo(c.grupo).length>1;
      const splitBadge=c._split?'<span class="badge" style="background:var(--yellow-lt);color:var(--yellow);margin-left:5px;font-size:9px">÷2</span>':'';
      const pgBadge=isShared&&!c._split&&c.pagamentos&&(c.pagamentos.Leo||c.pagamentos.Pri)&&!fullyPaid
        ?`<div style="font-size:10px;margin-top:2px">${c.pagamentos.Leo?'<span style="color:var(--green)">Leo ✓</span>':'<span style="color:var(--orange)">Leo ⏳</span>'} · ${c.pagamentos.Pri?'<span style="color:var(--green)">Pri ✓</span>':'<span style="color:var(--orange)">Pri ⏳</span>'}</div>`:'';
      return`<tr class="mob-card" style="${atr?'background:rgba(234,88,12,.04)':''}">
        <td class="td-chk desk-only">${!fullyPaid?`<input type="checkbox" class="chk-conta" data-id="${c.id}" data-val="${pend}" onchange="APP.atualizarBarraPagamento()" style="accent-color:var(--palm);width:14px;height:14px;cursor:pointer">`:''}</td>
        <td data-label="#" style="color:var(--t4);font-size:10.5px">${start+i+1}</td>
        <td data-label="Descrição" style="max-width:180px"><div style="font-weight:600;color:var(--t1);line-height:1.3;white-space:normal">${c.conta}${splitBadge}${c.recorrente?'<span class="badge-rec" style="margin-left:6px">🔁 REC</span>':''}</div>${c.nota?`<div style="font-size:10px;color:var(--t4);margin-top:1px">${c.nota}</div>`:''}${pgBadge}</td>
        <td data-label="Responsável">${c.resp}</td>
        <td data-label="Forma" style="font-size:11px;color:var(--t3)">${formaNome}</td>
        <td data-label="Categoria"><span class="badge bg-cat">${catNome}</span></td>
        <td data-label="A Pagar" class="money neg">${fmt(ef)}</td>
        <td data-label="Pago" class="money ${fullyPaid?'pos':(hasPg?'':'dim')}">${hasPg?fmt(c.vPago):'—'}</td>
        <td data-label="Pendente" class="money ${pend>0?(atr?'atr':'neg'):'dim'}">${pend>0?fmt(pend):'—'}</td>
        <td data-label="Vencimento" style="${atr?'color:var(--orange);font-weight:600':''}">${fmtDate(c.data)}</td>
        <td data-label="Parcela" class="col-hide" style="font-size:10.5px;color:var(--t4)">${c.parcela||'—'}</td>
        <td data-label="Por" class="col-hide">${auditBy?`<span class="audit-chip">${auditBy}</span>`:''}</td>
        <td data-label="Ações" style="white-space:nowrap">
          <button class="action-btn edit" title="Editar" onclick="APP.openConta('${c.id}')">✏</button>
          ${!fullyPaid?`<button class="action-btn pay" title="Pagar" onclick="APP.marcarPago('${c.id}')">✓</button>`:''}
          ${hasPg?`<button class="action-btn" title="Desfazer" onclick="APP.desfazerPagamento('${c.id}')" style="background:var(--orange-lt);color:var(--orange);border:1px solid #fed7aa">↩</button>`:''}
          ${hasGrupo?`<button class="action-btn parcs" title="Parcelamento" onclick="APP.openParcelas('${c.grupo}')">≡</button>`:''}
          <button class="action-btn del" title="Excluir" onclick="APP.deleteConta('${c.id}')">✕</button>
        </td></tr>`;
    }).join('')||`<tr><td colspan="13" style="padding:0;border:none"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhuma conta encontrada</div><div class="empty-sub">Tente ajustar os filtros ou adicione uma nova conta.</div></div></td></tr>`;

    // Limpa seleção ao re-renderizar
    this.atualizarBarraPagamento();

    const pgEl=document.getElementById('pgContas');pgEl.innerHTML='';
    if(totalPg>1){
      const mk=(l,p,a=false)=>{const b=document.createElement('button');b.className='pg-btn'+(a?' active':'');b.textContent=l;b.onclick=()=>{STATE.pg=p;this.renderContas();};pgEl.appendChild(b);};
      if(STATE.pg>1)mk('←',STATE.pg-1);
      for(let p=Math.max(1,STATE.pg-2);p<=Math.min(totalPg,STATE.pg+2);p++)mk(p,p,p===STATE.pg);
      if(STATE.pg<totalPg)mk('→',STATE.pg+1);
      const info=document.createElement('span');info.style.cssText='font-size:11px;color:var(--t4);margin-left:8px';
      info.textContent=`${start+1}–${Math.min(start+STATE.pgSz,data.length)} de ${data.length}`;pgEl.appendChild(info);
    }
  },

  atualizarDiffPagamento(){
    const id   = document.getElementById('pgContaId').value;
    const c    = CACHE.contas.find(x=>x.id===id);
    const pago = parseMoney(document.getElementById('pgValorPago').value);
    const respSel = document.getElementById('pgRespSelecionado')?.value||'';
    const prev = c ? (c.resp==='Leo & Pri'&&respSel&&respSel!=='ambos' ? c.vPagar/2 : c.vPagar) : 0;
    const diff = pago - prev;
    const el   = document.getElementById('pgDiff');
    if(!pago || Math.abs(diff) < 0.01){ el.style.display='none'; return; }
    el.style.display='block';
    if(diff > 0){
      el.style.cssText='display:block;margin-top:5px;font-size:11.5px;padding:6px 10px;border-radius:6px;background:var(--orange-lt);color:var(--orange);border:1px solid #fed7aa';
      el.textContent=`⚠️ Acréscimo de ${fmt(diff)} em relação ao previsto`;
    } else {
      el.style.cssText='display:block;margin-top:5px;font-size:11.5px;padding:6px 10px;border-radius:6px;background:var(--green-lt);color:var(--green);border:1px solid #bbf7d0';
      el.textContent=`✅ Desconto de ${fmt(Math.abs(diff))} em relação ao previsto`;
    }
  },

  marcarPago(id){
    const c=CACHE.contas.find(x=>x.id===id); if(!c)return;
    const isShared=c.resp==='Leo & Pri';
    document.getElementById('pgContaId').value          = id;
    document.getElementById('pgContaNome').textContent  = c.conta;
    document.getElementById('pgContaData').textContent  = fmtDate(c.data);
    document.getElementById('pgContaParc').textContent  = c.parcela||'';
    document.getElementById('pgRespSelecionado').value  = '';
    document.getElementById('pgDiff').style.display     = 'none';

    const respGroup=document.getElementById('pgRespGroup');
    const jaPagouEl=document.getElementById('pgRespJaPagou');
    jaPagouEl.style.display='none';

    if(isShared){
      respGroup.style.display='block';
      document.querySelectorAll('.pg-resp-btn').forEach(b=>{
        b.classList.remove('btn-primary');b.classList.add('btn-secondary');
        b.disabled=false;
        b.textContent=b.dataset.resp==='ambos'?'Ambos de uma vez':b.dataset.resp;
      });
      const pgLeo=c.pagamentos?.Leo;
      const pgPri=c.pagamentos?.Pri;
      const infos=[];
      if(pgLeo){
        const btnLeo=document.querySelector('.pg-resp-btn[data-resp="Leo"]');
        btnLeo.disabled=true;btnLeo.textContent='Leo ✓';
        infos.push(`Leo já pagou ${fmt(pgLeo.valor)} em ${fmtDate(pgLeo.paidAt)}`);
      }
      if(pgPri){
        const btnPri=document.querySelector('.pg-resp-btn[data-resp="Pri"]');
        btnPri.disabled=true;btnPri.textContent='Pri ✓';
        infos.push(`Pri já pagou ${fmt(pgPri.valor)} em ${fmtDate(pgPri.paidAt)}`);
      }
      if(infos.length){jaPagouEl.style.display='block';jaPagouEl.textContent=infos.join(' · ');}
      const respDefault=!pgLeo?'Leo':(!pgPri?'Pri':'ambos');
      this.selecionarRespPagamento(respDefault);
    } else {
      respGroup.style.display='none';
      document.getElementById('pgValorPrevisto').textContent=fmt(c.vPagar);
      setMoneyValue(document.getElementById('pgValorPago'),c.vPagar);
    }

    document.getElementById('ovPagamento').classList.add('open');
    bindAllMoneyInputs(document.getElementById('ovPagamento'));
    setTimeout(()=>{ const el=document.getElementById('pgValorPago'); el.focus(); el.select(); },150);
  },

  selecionarRespPagamento(resp){
    document.getElementById('pgRespSelecionado').value=resp;
    document.querySelectorAll('.pg-resp-btn').forEach(b=>{
      if(b.disabled) return;
      if(b.dataset.resp===resp){b.classList.remove('btn-secondary');b.classList.add('btn-primary');}
      else{b.classList.remove('btn-primary');b.classList.add('btn-secondary');}
    });
    const id=document.getElementById('pgContaId').value;
    const c=CACHE.contas.find(x=>x.id===id);if(!c)return;
    const val=resp==='ambos'?c.vPagar:(c.vPagar/2);
    document.getElementById('pgValorPrevisto').textContent=fmt(val)+(resp!=='ambos'?' (metade)':'');
    setMoneyValue(document.getElementById('pgValorPago'),val);
    document.getElementById('pgDiff').style.display='none';
  },

  async confirmarPagamento(){
    const btn  = document.querySelector('#ovPagamento .modal-footer .btn-primary');
    if(btn) btn.classList.add('loading');
    try{
      const id    = document.getElementById('pgContaId').value;
      const valor = parseMoney(document.getElementById('pgValorPago').value);
      if(!valor||valor<=0){ this.toast('Informe um valor válido','error'); return; }
      const c=CACHE.contas.find(x=>x.id===id);
      const respSel=document.getElementById('pgRespSelecionado').value;
      if(c&&c.resp==='Leo & Pri'&&respSel&&respSel!=='ambos'){
        await FS.pagarContaIndividual(id, respSel, STATE.usuario, valor);
        APP.closeModal('ovPagamento');
        this.toast(`Pagamento de ${fmt(valor)} (${respSel}) registrado ✅`,'success');
      } else {
        await FS.pagarConta(id, STATE.usuario, valor);
        APP.closeModal('ovPagamento');
        this.toast(`Pagamento de ${fmt(valor)} registrado por ${STATE.usuario} ✅`,'success');
      }
    }catch(e){
      this.toast(e.message||'Erro ao registrar pagamento','error');
    }finally{
      if(btn) btn.classList.remove('loading');
    }
  },

  async deleteConta(id){
    const c=CACHE.contas.find(x=>x.id===id);
    if(!c||!confirm(`Excluir "${c.conta}"?`))return;
    await FS.deleteConta(id);this.toast('Conta excluída','success');
  },

  // Baixa integral segura: em conta "Leo & Pri" com uma parte já paga
  // individualmente, completa a parte faltante em vez de sobrescrever vPago.
  async _pagarContaAuto(id, valor){
    const c=CACHE.contas.find(x=>x.id===id);
    if(c&&c.resp==='Leo & Pri'&&c.pagamentos){
      const temLeo=!!c.pagamentos.Leo, temPri=!!c.pagamentos.Pri;
      if(temLeo!==temPri) return FS.pagarContaIndividual(id, temLeo?'Pri':'Leo', STATE.usuario, valor);
    }
    return FS.pagarConta(id, STATE.usuario, valor);
  },

  // ── PARCELAS ──
  openParcelas(grupo){
    STATE.parcGrupo=grupo;
    const parcs=CACHE.getByGrupo(grupo);if(!parcs.length)return;
    document.getElementById('titleParcelas').textContent=`Parcelamento: ${parcs[0].conta}`;
    const respOpts=['Leo','Pri','Leo & Pri'].map(r=>`<option value="${r}">${r}</option>`).join('');
    document.getElementById('tbodyParcelas').innerHTML=parcs.map(c=>{
      const pago=c.vPago>0;const atr=isOverdue(c);
      return`<tr style="${atr?'background:rgba(234,88,12,.04)':''}">
        <td><input type="text" value="${c.parcela||''}" id="parc_parc_${c.id}" style="width:80px"></td>
        <td><input type="text" value="${c.conta}" id="parc_desc_${c.id}"></td>
        <td><select id="parc_resp_${c.id}" style="min-width:90px">${['Leo','Pri','Leo & Pri'].map(r=>`<option value="${r}"${c.resp===r?' selected':''}>${r}</option>`).join('')}</select></td>
        <td><input type="date" value="${c.data}" id="parc_data_${c.id}"></td>
        <td><input type="text" inputmode="numeric" value="${maskMoney(floatToCentsStr(c.vPagar))}" id="parc_val_${c.id}" class="money-input" style="width:100px"></td>
        <td>${pago?'<span class="badge bg-pago">Pago</span>':atr?'<span class="badge bg-atr">Atrasado</span>':'<span class="badge bg-pend">Pendente</span>'}</td>
        <td>${c.paidBy||c.updatedBy||c.createdBy||'—'}</td>
        <td><div style="display:flex;gap:6px;align-items:center;white-space:nowrap">${!pago?`<button class="btn btn-sm" style="background:var(--green-lt);color:var(--green);border:1px solid #bbf7d0;padding:5px 10px" onclick="APP.parcsPayOne('${c.id}')">✓ Pagar</button>`:''}<button class="btn btn-sm btn-danger" style="padding:5px 10px" onclick="APP.parcsDeleteOne('${c.id}')">✕</button></div><input type="hidden" id="parc_formaId_${c.id}" value="${c.formaId||c.forma||''}"><input type="hidden" id="parc_catId_${c.id}" value="${c.catId||c.cat||''}"></td>
      </tr>`;
    }).join('');
    document.getElementById('ovParcelas').classList.add('open');
    bindAllMoneyInputs(document.getElementById('ovParcelas'));
  },

  async parcsPayAll(){
    const parcs=CACHE.getByGrupo(STATE.parcGrupo).filter(c=>!(c.vPago>0));
    if(!parcs.length){this.toast('Todas já estão pagas','info');return;}
    if(!confirm(`Marcar ${parcs.length} parcela(s) como pagas?`))return;
    await Promise.all(parcs.map(c=>this._pagarContaAuto(c.id,c.vPagar)));
    this.toast(`${parcs.length} parcela(s) pagas`,'success');
    APP.closeModal('ovParcelas');
  },
  async parcsPayEarly(){
    const parcs=CACHE.getByGrupo(STATE.parcGrupo).filter(c=>!(c.vPago>0));
    if(!parcs.length){this.toast('Nenhuma pendente','info');return;}
    const val=prompt(`Valor do pagamento antecipado (${parcs.length} parcelas):`);if(!val)return;
    const nota=prompt('Observação:')||'Pagamento antecipado';
    const total=parseMoney(val);const perParc=Math.round(total/parcs.length*100)/100;
    await Promise.all(parcs.map((c,i)=>{
      const v = i===parcs.length-1 ? Math.round((total-perParc*(parcs.length-1))*100)/100 : perParc;
      return this._pagarContaAuto(c.id,v);
    }));
    this.toast('Pagamento antecipado registrado','success');
    APP.closeModal('ovParcelas');
  },
  async parcsPayOne(id){
    if(!confirm('Pagar esta parcela?'))return;
    const c=CACHE.contas.find(x=>x.id===id);
    await this._pagarContaAuto(id,c?c.vPagar:0);this.toast('Parcela paga','success');
    this.openParcelas(STATE.parcGrupo);
  },
  async parcsDeleteOne(id){
    if(!confirm('Excluir esta parcela?'))return;
    await FS.deleteConta(id);this.toast('Parcela excluída','success');
    this.openParcelas(STATE.parcGrupo);
  },
  async parcsDeleteAll(){
    const parcs=CACHE.getByGrupo(STATE.parcGrupo);
    if(!confirm(`Excluir TODAS as ${parcs.length} parcelas?\n\nEsta ação não pode ser desfeita.`))return;
    await Promise.all(parcs.map(c=>FS.deleteConta(c.id)));
    APP.closeModal('ovParcelas');
    this.toast('Parcelamento excluído','success');
  },
  parcsApplyDesc(){
    const parcs=CACHE.getByGrupo(STATE.parcGrupo);if(!parcs.length)return;
    const newDesc=document.getElementById(`parc_desc_${parcs[0].id}`)?.value;if(!newDesc)return;
    parcs.forEach(c=>{const el=document.getElementById(`parc_desc_${c.id}`);if(el)el.value=newDesc;});
    this.toast('Descrição aplicada — clique em Salvar','info');
  },
  parcsOpenEditField(tipo){
    const modal=document.getElementById('ovParcsEditField');
    const sel=document.getElementById('selectParcsEdit');
    const isCat=tipo==='cat';
    modal.dataset.field=isCat?'catId':'formaId';
    document.getElementById('titleParcsEdit').textContent=isCat?'Alterar Categoria':'Alterar Forma de Pagamento';
    sel.innerHTML='<option value="">Selecione...</option>';
    (isCat?CACHE.getAllCats():CACHE.getAllFormas()).forEach(x=>{sel.appendChild(new Option(x.nome,x.id));});
    modal.classList.add('open');
  },
  parcsApplyField(){
    const modal=document.getElementById('ovParcsEditField');
    const field=modal.dataset.field;
    const val=document.getElementById('selectParcsEdit').value;
    if(!val){this.toast('Selecione uma opção','error');return;}
    const parcs=CACHE.getByGrupo(STATE.parcGrupo);
    parcs.forEach(c=>{const el=document.getElementById(`parc_${field}_${c.id}`);if(el)el.value=val;});
    const nome=field==='catId'?CACHE.getCatNome(val):CACHE.getFormaNome(val);
    modal.classList.remove('open');
    this.toast(`${field==='catId'?'Categoria':'Forma de pagamento'} alterada para "${nome}" em todas — clique em Salvar`,'success');
  },
  async parcsSaveAll(){
    const parcs=CACHE.getByGrupo(STATE.parcGrupo);
    await Promise.all(parcs.map(c=>{
      const desc=document.getElementById(`parc_desc_${c.id}`)?.value;
      const resp=document.getElementById(`parc_resp_${c.id}`)?.value;
      const data=document.getElementById(`parc_data_${c.id}`)?.value;
      const val =document.getElementById(`parc_val_${c.id}`)?.value;
      const parc=document.getElementById(`parc_parc_${c.id}`)?.value;
      const formaId=document.getElementById(`parc_formaId_${c.id}`)?.value||c.formaId||'';
      const catId=document.getElementById(`parc_catId_${c.id}`)?.value||c.catId||'';
      return FS.updateConta(c.id,{conta:desc||c.conta,resp:resp||c.resp,data:data||c.data,vPagar:parseMoney(val)||c.vPagar,parcela:parc||c.parcela,formaId,catId,updatedBy:STATE.usuario});
    }));
    this.toast('Alterações salvas','success');
    APP.closeModal('ovParcelas');
  },

  // ── MODAL CONTA ──
  populateContaSelects(selectedCatId='',selectedFormaId=''){
    const fCat=document.getElementById('fCat');const fForma=document.getElementById('fForma');
    fCat.innerHTML='<option value="">Selecione...</option>';fForma.innerHTML='<option value="">Selecione...</option>';
    CACHE.getAllCats().forEach(c=>{const o=new Option(c.nome,c.id);if(c.id===selectedCatId||c.nome===selectedCatId)o.selected=true;fCat.appendChild(o);});
    CACHE.getAllFormas().forEach(f=>{const o=new Option(f.nome,f.id);if(f.id===selectedFormaId||f.nome===selectedFormaId)o.selected=true;fForma.appendChild(o);});
  },

  openConta(id=null){
    STATE.editContaId=id;
    document.getElementById('titleConta').textContent=id?'Editar Conta':'Nova Conta';
    this.clearConta();this.populateContaSelects();
    if(id){
      const c=CACHE.contas.find(x=>x.id===id);
      if(c){
        document.getElementById('fDesc').value=c.conta;document.getElementById('fNota').value=c.nota||'';
        document.getElementById('fResp').value=c.resp;document.getElementById('fData').value=c.data;
        setMoneyValue(document.getElementById('fVP'),c.vPagar);document.getElementById('fParc').value=c.parcela||'';
        const fRec=document.getElementById('fRecorrente');if(fRec)fRec.checked=!!c.recorrente;
        this.populateContaSelects(c.catId||c.cat,c.formaId||c.forma);this.calcTotal();
      }
    }
    document.getElementById('ovConta').classList.add('open');
    bindAllMoneyInputs(document.getElementById('ovConta'));
    setTimeout(()=>document.getElementById('fDesc').focus(),100);
  },

  clearConta(){
    ['fDesc','fNota','fResp','fForma','fCat','fData','fVP','fParc'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.getElementById('fQP').value=1;document.getElementById('fVT').value='';
    const fRec=document.getElementById('fRecorrente');if(fRec)fRec.checked=false;
  },
  calcTotal(){ const v=parseMoney(document.getElementById('fVP').value);const q=parseInt(document.getElementById('fQP').value)||1;document.getElementById('fVT').value=v>0?fmtMoney(v*q):''; },

  async saveConta(){
    const btn=document.getElementById('btnSalvarConta');
    if(btn) btn.classList.add('loading');
    try{
    const catId=document.getElementById('fCat').value;const formaId=document.getElementById('fForma').value;
    const recorrente=document.getElementById('fRecorrente')?.checked||false;
    const c={conta:document.getElementById('fDesc').value.trim(),nota:document.getElementById('fNota').value.trim(),resp:document.getElementById('fResp').value,formaId,catId,data:document.getElementById('fData').value,vPagar:parseMoney(document.getElementById('fVP').value),parcela:document.getElementById('fParc').value.trim(),recorrente,createdBy:STATE.usuario};
    if(!c.conta){this.toast('Descrição é obrigatória','error');return;}
    if(!c.resp){this.toast('Selecione o responsável','error');return;}
    if(!catId){this.toast('Selecione a categoria','error');return;}
    if(!formaId){this.toast('Selecione a forma de pagamento','error');return;}
    if(!c.data){this.toast('Informe a data','error');return;}
    if(!c.vPagar){this.toast('Informe o valor','error');return;}

    if(STATE.editContaId){
      const {createdBy, ...editData} = c;
      await FS.updateConta(STATE.editContaId,{...editData,updatedBy:STATE.usuario});
      this.toast('Conta atualizada ✅','success');
    } else {
      const qt=parseInt(document.getElementById('fQP').value)||1;
      const grupo=`grp-${Date.now()}`;
      const novaConta = {...c, vPago:null};
      if(qt>1){
        const base=new Date(c.data+'T12:00');const proms=[];
        for(let i=0;i<qt;i++){const d=new Date(base);d.setMonth(d.getMonth()+i);proms.push(FS.addConta({...novaConta,data:d.toISOString().split('T')[0],parcela:`${i+1} de ${qt}`,grupo}));}
        await Promise.all(proms);
      } else {
        if(!novaConta.parcela)novaConta.parcela='1 de 1';
        await FS.addConta({...novaConta,grupo});
      }
      this.toast('Conta cadastrada ✅','success');
    }
    APP.closeModal('ovConta');STATE.editContaId=null;
    }finally{ if(btn) btn.classList.remove('loading'); }
  },

});

