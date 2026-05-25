"use strict";

Object.assign(APP, {

  async desfazerPagamento(id){
    const c = CACHE.contas.find(x=>x.id===id);
    if(!c) return;
    if(!confirm(`Desfazer pagamento de "${c.conta}"?\n\nA conta voltará ao status pendente.`)) return;
    const vOriginal = c.vPago || c.vPagar;
    await FS.desfazerPagamento(id, vOriginal);
    this.toast(`Pagamento desfeito: ${c.conta}`,'success');
  },

  // ── PDF DO RELATÓRIO ──
  exportPDF(){
    if(typeof window.jspdf === 'undefined' && typeof jspdf === 'undefined'){
      return this.toast('Biblioteca PDF não carregada. Aguarde e tente novamente.','error');
    }
    const { jsPDF } = window.jspdf || jspdf;
    const doc = new jsPDF({orientation:'landscape', unit:'mm', format:'a4'});

    // Coletar dados do filtro atual
    const anoVal  = document.getElementById('relAno').value;
    const mesVal  = document.getElementById('relMes').value;
    const cat     = document.getElementById('relCat').value;
    const formaId = document.getElementById('relForma')?.value||'';
    const resp    = document.getElementById('relResp').value;
    const p       = STATE.periodo;

    let data = CACHE.contas;
    if(p){
      data = data.filter(c=>{ const d=new Date(c.data+'T12:00'); return d.getFullYear()===p.ano&&d.getMonth()>=p.mesIni&&d.getMonth()<=p.mesFim; });
    } else {
      if(anoVal!=='todos') data = data.filter(c=>new Date(c.data+'T12:00').getFullYear()===parseInt(anoVal));
      if(mesVal!=='todos') data = data.filter(c=>new Date(c.data+'T12:00').getMonth()===parseInt(mesVal));
    }
    if(cat)     data = data.filter(c=>CACHE.resolveCat(c.catId||c.cat)===cat);
    if(formaId) data = data.filter(c=>c.formaId===formaId||CACHE.resolveForma(c.formaId||c.forma)===CACHE.getFormaNome(formaId));
    if(resp) data = filtrarPorResp(data, resp);
    data = this._aplicarSort(data,'sortRel');

    const tP    = data.reduce((s,c)=>s+vEfetivo(c),0);
    const tPg   = data.reduce((s,c)=>s+(c.vPago||0),0);
    const tPend = data.reduce((s,c)=>s+vPendente(c),0);

    // Período label
    let periodoLabel = '';
    if(p) periodoLabel = `${MESES_F[p.mesIni]} a ${MESES_F[p.mesFim]} de ${p.ano}`;
    else if(mesVal!=='todos') periodoLabel = `${MESES_F[parseInt(mesVal)]}/${anoVal==='todos'?'Todos':anoVal}`;
    else periodoLabel = anoVal==='todos'?'Todos os períodos':anoVal;
    if(resp) periodoLabel += ` · ${resp}`;
    if(cat)  periodoLabel += ` · ${cat}`;

    // ── CABEÇALHO ──
    doc.setFillColor(0, 100, 55);
    doc.rect(0, 0, 297, 22, 'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(16); doc.setFont('helvetica','bold');
    doc.text('Duetto Financeiro', 14, 10);
    doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text('Relatório de Despesas', 14, 16);
    doc.setFontSize(9);
    doc.text(`Período: ${periodoLabel}`, 150, 10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 150, 16);

    // ── KPI CARDS ──
    const kpis = [
      {label:'Qtd. Contas', val:String(data.length), cor:[37,99,235]},
      {label:'Total a Pagar', val:fmt(tP), cor:[220,38,38]},
      {label:'Total Pago', val:fmt(tPg), cor:[0,100,55]},
      {label:'Pendente', val:fmt(tPend), cor:[217,119,6]},
    ];
    const kW=60, kH=16, kY=26;
    kpis.forEach((k,i)=>{
      const x=14+i*(kW+4);
      doc.setFillColor(248,251,248);
      doc.setDrawColor(220,220,220);
      doc.roundedRect(x,kY,kW,kH,2,2,'FD');
      doc.setFontSize(7); doc.setTextColor(100,100,100); doc.setFont('helvetica','normal');
      doc.text(k.label, x+3, kY+5);
      doc.setFontSize(11); doc.setTextColor(...k.cor); doc.setFont('helvetica','bold');
      doc.text(k.val, x+3, kY+12);
    });

    // ── TABELA ──
    const rows = data.map((c,i)=>{
      const ef=vEfetivo(c);
      const pend=vPendente(c)>0?fmt(vPendente(c)):'—';
      const atr=isOverdue(c);
      return [
        i+1,
        (c.conta||'')+(c._split?' ÷2':''),
        c.resp,
        CACHE.resolveForma(c.formaId||c.forma),
        CACHE.resolveCat(c.catId||c.cat),
        fmt(ef),
        c.vPago>0?fmt(c.vPago):'—',
        pend,
        fmtDate(c.data),
        c.parcela||'—',
        c.paidBy||c.updatedBy||'—',
        c.nota||'—',
      ];
    });

    doc.autoTable({
      startY: kY+kH+4,
      head: [['#','Descrição','Resp.','Forma','Categoria','A Pagar','Pago','Pendente','Vencimento','Parcela','Por','Nota']],
      body: rows,
      styles:{ fontSize:7.5, cellPadding:2.5, font:'helvetica', textColor:[55,65,81] },
      headStyles:{ fillColor:[0,100,55], textColor:[255,255,255], fontStyle:'bold', fontSize:8 },
      alternateRowStyles:{ fillColor:[248,252,249] },
      columnStyles:{
        0:{cellWidth:8, halign:'center'},
        1:{cellWidth:48},
        2:{cellWidth:16},
        3:{cellWidth:22},
        4:{cellWidth:22},
        5:{cellWidth:20, halign:'right'},
        6:{cellWidth:20, halign:'right'},
        7:{cellWidth:20, halign:'right'},
        8:{cellWidth:20},
        9:{cellWidth:14},
        10:{cellWidth:12},
        11:{cellWidth:28},
      },
      didParseCell(hook){
        if(hook.row.index===rows.length-1 && hook.section==='body'){
          hook.cell.styles.fontStyle='bold';
        }
        if(hook.column.index===8 && hook.section==='body'){
          const c=data[hook.row.index];
          if(c&&isOverdue(c)) hook.cell.styles.textColor=[234,88,12];
        }
      },
      foot:[['','','','','Total',fmt(tP),fmt(tPg),fmt(tPend),'','','','']],
      footStyles:{ fillColor:[0,100,55], textColor:[255,255,255], fontStyle:'bold', fontSize:8 },
    });

    // ── RODAPÉ ──
    const pgs = doc.internal.getNumberOfPages();
    for(let i=1;i<=pgs;i++){
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(150,150,150); doc.setFont('helvetica','normal');
      doc.text(`Página ${i} de ${pgs} · Duetto Financeiro · Confidencial`, 14, doc.internal.pageSize.height-5);
    }

    const dt=new Date();
    const nome=`Duetto_Relatorio_${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}.pdf`;
    doc.save(nome);
    this.toast(`PDF gerado: ${nome} ✅`,'success');
  },

});
