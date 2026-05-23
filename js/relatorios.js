"use strict";

Object.assign(APP, {
  // ============================================================
  // RELATÓRIO
  // ============================================================
  renderRelatorio(){
    const anoVal  = document.getElementById('relAno').value;
    const mesVal  = document.getElementById('relMes').value;
    const cat     = document.getElementById('relCat').value;
    const formaId = document.getElementById('relForma')?.value||'';
    const resp    = document.getElementById('relResp').value;
    this._aplicarTemaResp(resp);
    const todosMeses = mesVal==='todos';
    const todosAnos  = anoVal==='todos';
    // BUGFIX: variável `p` (período do Relatório) era usada sem declaração,
    // causando ReferenceError que abortava toda a renderização (KPIs, tabela e Pareto vazios).
    // Padrão alinhado com renderDashboard (STATE.periodoDash) e renderContas (STATE.periodoContas).
    const p = STATE.periodo;

    let data = CACHE.contas;

    if(p){
      // Filtro por período: ano fixo + intervalo de meses
      data = data.filter(c=>{
        const d = new Date(c.data+'T12:00');
        return d.getFullYear()===p.ano && d.getMonth()>=p.mesIni && d.getMonth()<=p.mesFim;
      });
    } else {
      if(!todosAnos)  data = data.filter(c=>new Date(c.data+'T12:00').getFullYear()===parseInt(anoVal));
      if(!todosMeses) data = data.filter(c=>new Date(c.data+'T12:00').getMonth()===parseInt(mesVal));
    }
    if(cat)     data = data.filter(c=>CACHE.resolveCat(c.catId||c.cat)===cat);
    if(formaId) data = data.filter(c=>c.formaId===formaId||CACHE.resolveForma(c.formaId||c.forma)===CACHE.getFormaNome(formaId));
    // Filtro responsável: Leo ou Pri inclui "Leo & Pri" com valor ÷2; "Leo & Pri" mostra valor inteiro
    if(resp){
      if(resp === 'Leo & Pri'){
        data = data.filter(c => c.resp === 'Leo & Pri');
      } else {
        data = data
          .filter(c => c.resp === resp || c.resp === 'Leo & Pri')
          .map(c => {
            if(c.resp === 'Leo & Pri'){
              const ef = vEfetivo(c);
              return {...c, vPagar: ef/2, vPago: c.vPago>0 ? c.vPago/2 : null, _split: true};
            }
            return c;
          });
      }
    }

    const tP    = data.reduce((s,c)=>s+vEfetivo(c),0);
    const tPg   = data.reduce((s,c)=>s+(c.vPago||0),0);
    const tPend = data.reduce((s,c)=>s+(c.vPago>0?0:vEfetivo(c)),0);

    document.getElementById('relKpis').innerHTML=[
      {label:'Qtd. Contas',val:data.length,c:'var(--blue)'},
      {label:'Total a Pagar',val:fmt(tP),c:'var(--red)'},
      {label:'Total Pago',val:fmt(tPg),c:'var(--palm)'},
      {label:'Pendente',val:fmt(tPend),c:'var(--yellow)'},
    ].map(k=>`<div class="rel-kpi"><label>${k.label}</label><div class="val" style="color:${k.c}">${k.val}</div></div>`).join('');

    // Ordenação
    data = this._aplicarSort(data,'sortRel');

    document.getElementById('tbodyRel').innerHTML=data.map((c,i)=>{
      const ef=vEfetivo(c); const pend=c.vPago>0?0:ef; const atr=isOverdue(c);
      const catNome=CACHE.resolveCat(c.catId||c.cat); const formaNome=CACHE.resolveForma(c.formaId||c.forma);
      const splitBadge=c._split?'<span class="badge" style="background:var(--yellow-lt);color:var(--yellow);font-size:9px;margin-left:4px">÷2</span>':'';
      return`<tr class="mob-card">
        <td data-label="#" style="color:var(--t4)">${i+1}</td>
        <td data-label="Descrição" style="max-width:140px;white-space:normal">${c.conta}${splitBadge}</td>
        <td data-label="Resp.">${c.resp}</td>
        <td data-label="Forma" style="font-size:11px;color:var(--t3)">${formaNome}</td>
        <td data-label="Categoria">${catNome}</td>
        <td data-label="A Pagar" class="money neg">${fmt(ef)}</td>
        <td data-label="Pago" class="money ${c.vPago>0?'pos':'dim'}">${c.vPago>0?fmt(c.vPago):'—'}</td>
        <td data-label="Pendente" class="money ${pend>0?(atr?'atr':'neg'):'dim'}">${pend>0?fmt(pend):'—'}</td>
        <td data-label="Vencimento" style="${atr?'color:var(--orange);font-weight:600':''}">${fmtDate(c.data)}</td>
        <td data-label="Parcela" class="col-hide" style="font-size:10.5px;color:var(--t4)">${c.parcela||'—'}</td>
        <td data-label="Por" class="col-hide">${c.updatedBy||c.createdBy?`<span class="audit-chip">${c.updatedBy||c.createdBy}</span>`:''}</td>
        <td data-label="Nota" style="font-size:10.5px;color:var(--t4);max-width:100px;white-space:normal">${c.nota||'—'}</td>
      </tr>`;
    }).join('')||`<tr><td colspan="12" style="padding:0;border:none"><div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">Nenhum dado para este filtro</div><div class="empty-sub">Tente ajustar os filtros de período, categoria ou responsável.</div></div></td></tr>`;

    // Pareto do Relatório — respeita o toggle
    if(document.getElementById('chkParetoRel')?.checked !== false){
      this.renderPareto('canvasParetoRel','paretoTableRel', data);
    }
  },

  exportCSV(){
    const anoVal  = document.getElementById('relAno').value;
    const mesVal  = document.getElementById('relMes').value;
    const todosAnos  = anoVal==='todos';
    const todosMeses = mesVal==='todos';
    let data = CACHE.contas;
    if(!todosAnos)  data = data.filter(c=>new Date(c.data+'T12:00').getFullYear()===parseInt(anoVal));
    if(!todosMeses) data = data.filter(c=>new Date(c.data+'T12:00').getMonth()===parseInt(mesVal));
    const hdr=['#','Descrição','Responsável','Forma','Categoria','A Pagar','Pago','Pendente','Vencimento','Parcela','Por','Nota'];
    const rows=data.map((c,i)=>[i+1,`"${c.conta}"`,c.resp,CACHE.resolveForma(c.formaId||c.forma),CACHE.resolveCat(c.catId||c.cat),vEfetivo(c),(c.vPago||0),(c.vPago>0?0:vEfetivo(c)),c.data,(c.parcela||''),(c.updatedBy||c.createdBy||''),`"${c.nota||''}"`]);
    const csv=[hdr,...rows].map(r=>r.join(';')).join('\n');
    const label=todosMeses?(todosAnos?'completo':'ano_'+anoVal):MESES[parseInt(mesVal)]+'_'+anoVal;
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
    a.download=`duetto_${label}.csv`;a.click();
    this.toast('CSV exportado ⬇','success');
  },

  exportCSVContas(){
    const ano=document.getElementById('filtroAnoContas').value;
    const mes=document.getElementById('filtroMesContas').value;
    const data=CACHE.getByAnoMes(ano,mes);
    const hdr=['#','Descrição','Responsável','Forma','Categoria','A Pagar','Pago','Pendente','Vencimento','Parcela','Por','Nota'];
    const rows=data.map((c,i)=>[i+1,`"${c.conta}"`,c.resp,CACHE.resolveForma(c.formaId||c.forma),CACHE.resolveCat(c.catId||c.cat),c.vPagar,(c.vPago||0),(c.vPago>=c.vPagar?0:c.vPagar-(c.vPago||0)),c.data,(c.parcela||''),(c.updatedBy||c.createdBy||''),`"${c.nota||''}"`]);
    const csv=[hdr,...rows].map(r=>r.join(';')).join('\n');
    const label=mes==='todos'?(ano==='todos'?'todos':'ano_'+ano):`${MESES[parseInt(mes)]}_${ano}`;
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
    a.download=`duetto_contas_${label}.csv`;a.click();
    this.toast('CSV exportado ⬇','success');
  },

});

