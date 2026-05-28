"use strict";

Object.assign(APP, {
  // ============================================================
  // RECEITAS (Redesign v2 — layout tabular padrão Contas)
  // ============================================================

  renderReceitas(){
    const search = (document.getElementById('searchReceitas')?.value||'').toLowerCase();
    const mesVal = document.getElementById('filtroMesReceitas')?.value||'todos';
    const resp   = document.getElementById('filtroRespReceitas')?.value||'';
    const tipo   = document.getElementById('filtroTipoReceitas')?.value||'';
    const mesFiltro = mesVal==='todos' ? null : parseInt(mesVal);

    // ── Build unified data ──
    let data = [];

    // Salários: 1 linha por pessoa por mês
    if(tipo!=='outra'){
      const meses = mesFiltro!==null ? [mesFiltro] : Array.from({length:12},(_,i)=>i);
      for(const s of CACHE.salarios){
        if(resp && s.pessoa!==resp) continue;
        for(const m of meses){
          const h = CACHE.getSalarioMes(s,m);
          if(!h||!h.liquido) continue;
          data.push({
            tipo:'salario', desc:'Salário — '+s.nome, resp:s.pessoa||'',
            mes:m, valor:h.liquido, updatedBy:'', readOnly:true, id:'sal_'+s.id+'_'+m
          });
        }
      }
    }

    // Outras Receitas: 1 linha por receita por mês com valor > 0
    if(tipo!=='salario'){
      const meses = mesFiltro!==null ? [mesFiltro] : Array.from({length:12},(_,i)=>i);
      for(const r of CACHE.outras){
        if(resp && r.resp && r.resp!==resp) continue;
        for(const m of meses){
          if(!r.valores[m]) continue;
          data.push({
            tipo:'outra', desc:r.desc, resp:r.resp||'',
            mes:m, valor:r.valores[m], updatedBy:r.updatedBy||'',
            readOnly:false, id:r.id
          });
        }
      }
    }

    // Busca textual
    if(search){
      data = data.filter(d =>
        d.desc.toLowerCase().includes(search) ||
        d.resp.toLowerCase().includes(search) ||
        MESES[d.mes].toLowerCase().includes(search)
      );
    }

    // ── Totalizadores ──
    const totalSal = data.filter(d=>d.tipo==='salario').reduce((s,d)=>s+d.valor,0);
    const totalOut = data.filter(d=>d.tipo==='outra').reduce((s,d)=>s+d.valor,0);
    document.getElementById('totalReceitas').textContent = fmt(totalSal+totalOut);
    document.getElementById('totalSalarios').textContent = fmt(totalSal);
    document.getElementById('totalOutras').textContent   = fmt(totalOut);
    document.getElementById('receitasInfo').textContent = data.length+' receita'+(data.length!==1?'s':'')+' encontrada'+(data.length!==1?'s':'');

    // ── Ordenação ──
    data = this._aplicarSort(data,'sortReceitas');

    // ── Paginação ──
    const totalPg = Math.max(1,Math.ceil(data.length/STATE.pgSz));
    if(STATE.pgReceitas>totalPg) STATE.pgReceitas=1;
    const start = (STATE.pgReceitas-1)*STATE.pgSz;
    const paged = data.slice(start,start+STATE.pgSz);

    // ── Render linhas ──
    document.getElementById('tbodyReceitas').innerHTML = paged.map(r=>{
      const tipoBadge = r.tipo==='salario'
        ? '<span class="badge bg-cat">Salário</span>'
        : '<span class="badge" style="background:var(--blue-lt);color:var(--blue)">Outra</span>';
      const respChip = r.resp
        ? '<span class="badge bg-cat">'+r.resp+'</span>'
        : '<span style="font-size:10.5px;color:var(--t4)">Ambos</span>';
      const auditChip = r.updatedBy ? '<span class="audit-chip">'+r.updatedBy+'</span>' : '';
      const acoes = r.readOnly
        ? '<span style="font-size:10px;color:var(--t4)">auto</span>'
        : '<button class="action-btn edit" title="Editar" onclick="APP.openReceita(\''+r.id+'\')">✏</button>'+
          '<button class="action-btn del" title="Excluir" onclick="APP.deleteOutra(\''+r.id+'\')">✕</button>';

      return '<tr class="mob-card">'+
        '<td data-label="Tipo">'+tipoBadge+'</td>'+
        '<td data-label="Descrição" style="font-weight:600;color:var(--t1)">'+r.desc+'</td>'+
        '<td data-label="Responsável">'+respChip+'</td>'+
        '<td data-label="Mês">'+MESES[r.mes]+'</td>'+
        '<td data-label="Valor" class="money pos" style="text-align:right">'+fmt(r.valor)+'</td>'+
        '<td data-label="Por">'+auditChip+'</td>'+
        '<td data-label="Ações" style="white-space:nowrap">'+acoes+'</td></tr>';
    }).join('')||'<tr><td colspan="7" style="padding:0;border:none"><div class="empty-state"><div class="empty-icon">💰</div><div class="empty-title">Nenhuma receita encontrada</div><div class="empty-sub">Tente ajustar os filtros ou adicione uma nova receita.</div></div></td></tr>';

    // ── Paginação controles ──
    const pgEl=document.getElementById('pgReceitas'); pgEl.innerHTML='';
    if(totalPg>1){
      const self=this;
      const mk=(l,p,a)=>{const b=document.createElement('button');b.className='pg-btn'+(a?' active':'');b.textContent=l;b.onclick=()=>{STATE.pgReceitas=p;self.renderReceitas();};pgEl.appendChild(b);};
      if(STATE.pgReceitas>1) mk('←',STATE.pgReceitas-1);
      for(let p=Math.max(1,STATE.pgReceitas-2);p<=Math.min(totalPg,STATE.pgReceitas+2);p++) mk(p,p,p===STATE.pgReceitas);
      if(STATE.pgReceitas<totalPg) mk('→',STATE.pgReceitas+1);
      const info=document.createElement('span');info.style.cssText='font-size:11px;color:var(--t4);margin-left:8px';
      info.textContent=(start+1)+'–'+Math.min(start+STATE.pgSz,data.length)+' de '+data.length;pgEl.appendChild(info);
    }

    // ── Gráfico ──
    this.renderRecChart(resp);
  },

  // ── CHART (preservado do original) ──
  renderRecChart(filtroResp=''){
    const sals=CACHE.salarios.filter(s=>!filtroResp||s.pessoa===filtroResp);
    const outras=CACHE.outras.filter(r=>!filtroResp||!r.resp||r.resp===filtroResp);
    const salVals=Array.from({length:12},(_,m)=>{let t=0;sals.forEach(s=>{const h=CACHE.getSalarioMes(s,m);t+=h?h.liquido:0;});return t;});
    const outVals=Array.from({length:12},(_,m)=>outras.reduce((s,r)=>s+(r.valores[m]||0),0));
    const dark = document.documentElement.classList.contains('dark');

    const salColor    = dark ? 'rgba(0,100,55,.75)'    : 'rgba(0,100,55,.82)';
    const salBorder   = dark ? '#32d74b'                : '#006437';
    const outColor    = dark ? 'rgba(52,211,153,.55)'  : 'rgba(52,211,153,.80)';
    const outBorder   = dark ? '#34d399'                : '#059669';
    const tickColor   = dark ? 'rgba(235,235,245,.45)' : '#9ca3af';
    const gridColor   = dark ? 'rgba(255,255,255,.05)' : '#e8edf2';
    const legendColor = dark ? 'rgba(235,235,245,.85)' : '#374151';
    const tooltipBg   = dark ? 'rgba(28,28,30,.97)'    : 'rgba(15,31,20,.95)';

    const totVals = salVals.map((v,i)=>v+(outVals[i]||0));

    this.mkChart('canvasReceitas',{
      type:'bar',
      data:{
        labels: MESES,
        datasets:[
          {
            label: 'Salários',
            data: salVals,
            backgroundColor: salColor,
            borderColor: salBorder,
            borderWidth: 1.5,
            borderRadius: { topLeft:4, topRight:4 },
            borderSkipped: false,
            barPercentage: 0.62,
            categoryPercentage: 0.75,
            stack: 'receitas',
          },
          {
            label: 'Outras Receitas',
            data: outVals,
            backgroundColor: outColor,
            borderColor: outBorder,
            borderWidth: 1.5,
            borderRadius: { topLeft:4, topRight:4 },
            borderSkipped: false,
            barPercentage: 0.62,
            categoryPercentage: 0.75,
            stack: 'receitas',
          }
        ]
      },
      options:{
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration:800, easing:'easeInOutCubic' },
        plugins:{
          legend:{
            position: 'top',
            align: 'end',
            labels:{
              color: legendColor,
              font:{ size:11, family:'DM Sans, system-ui, sans-serif', weight:'500' },
              boxWidth: 10,
              boxHeight: 10,
              borderRadius: 3,
              useBorderRadius: true,
              usePointStyle: false,
              padding: 16,
            }
          },
          tooltip:{
            backgroundColor: tooltipBg,
            titleColor: '#fff',
            bodyColor: 'rgba(255,255,255,.75)',
            padding: { top:10, bottom:10, left:14, right:14 },
            cornerRadius: 10,
            boxPadding: 5,
            callbacks:{
              title: ctx => MESES_F[ctx[0].dataIndex] || '',
              label: ctx => {
                const pct = totVals[ctx.dataIndex] > 0
                  ? ((ctx.raw / totVals[ctx.dataIndex]) * 100).toFixed(1)
                  : '0.0';
                return `  ${ctx.dataset.label}: ${fmt(ctx.raw)} (${pct}%)`;
              },
              afterBody: ctx => {
                const i = ctx[0].dataIndex;
                return [`  Total: ${fmt(totVals[i])}`];
              },
              afterBodyColor: () => 'rgba(255,255,255,.5)',
            }
          }
        },
        scales:{
          x:{
            stacked: true,
            grid: { display:false },
            ticks:{
              color: tickColor,
              font:{ size:10, family:'DM Sans, system-ui, sans-serif' }
            }
          },
          y:{
            stacked: true,
            min: 0,
            grid:{
              color: gridColor,
              drawBorder: false,
              lineWidth: 1,
            },
            ticks:{
              color: tickColor,
              font:{ size:10, family:'DM Sans, system-ui, sans-serif' },
              callback: v => `R$${(v/1000).toFixed(0)}k`,
              maxTicksLimit: 6,
            }
          }
        }
      }
    });
  },

  // ── RECEITA MODAL (com suporte a edição) ──
  openReceita(id){
    STATE.editReceitaId=id||null;
    ['rDesc','rValor'].forEach(fid=>{const e=document.getElementById(fid);if(e)e.value='';});
    const rResp=document.getElementById('rResp');if(rResp)rResp.value='';
    const rMesIni=document.getElementById('rMesIni');if(rMesIni)rMesIni.value='-1';
    const rMesFim=document.getElementById('rMesFim');if(rMesFim)rMesFim.value='-1';

    if(id){
      const r=CACHE.outras.find(x=>x.id===id);
      if(r){
        document.getElementById('rDesc').value=r.desc;
        if(rResp)rResp.value=r.resp||'';
        let ini=-1,fim=-1;
        for(let m=0;m<12;m++){if(r.valores[m]){if(ini===-1)ini=m;fim=m;}}
        if(rMesIni)rMesIni.value=ini;
        if(rMesFim)rMesFim.value=fim;
        if(ini!==-1){const rv=document.getElementById('rValor');if(rv)setMoneyValue(rv,r.valores[ini]);}
      }
    }

    const titleEl=document.querySelector('#ovReceita .modal-header h2');
    if(titleEl) titleEl.textContent=id?'Editar Receita':'Nova Receita';
    const btnSave=document.getElementById('btnSalvarReceita');
    if(btnSave) btnSave.textContent=id?'Salvar':'Criar';

    this.rAtualizarPeriodoInfo();
    document.getElementById('ovReceita').classList.add('open');
    bindAllMoneyInputs(document.getElementById('ovReceita'));
    setTimeout(()=>document.getElementById('rDesc').focus(),100);
  },

  rAtualizarPeriodoInfo(){
    const ini=parseInt(document.getElementById('rMesIni')?.value??'-1');
    const fim=parseInt(document.getElementById('rMesFim')?.value??'-1');
    const el=document.getElementById('rPeriodoInfo');if(!el)return;
    if(ini===-1)el.textContent='O valor será aplicado em todos os meses (Jan–Dez).';
    else if(fim===-1||fim===ini)el.textContent='O valor será aplicado somente em '+MESES_F[ini]+'.';
    else if(fim<ini)el.textContent='⚠️ Mês final deve ser igual ou posterior ao inicial.';
    else el.textContent='O valor será aplicado de '+MESES_F[ini]+' a '+MESES_F[fim]+' ('+(fim-ini+1)+' meses).';
  },

  async saveReceita(){
    const desc=document.getElementById('rDesc').value.trim();
    const resp=document.getElementById('rResp').value;
    const val=parseMoney(document.getElementById('rValor').value);
    const ini=parseInt(document.getElementById('rMesIni')?.value??'-1');
    const fim=parseInt(document.getElementById('rMesFim')?.value??'-1');
    if(!desc)return this.toast('Informe a descrição','error');
    if(ini!==-1&&fim!==-1&&fim<ini)return this.toast('Mês final deve ser igual ou posterior ao inicial','error');
    const valores=Array(12).fill(0);
    if(ini===-1){valores.fill(val);}
    else{const mesF=(fim===-1||fim<ini)?ini:fim;for(let m=ini;m<=mesF;m++)valores[m]=val;}

    if(STATE.editReceitaId){
      await FS.updateOutra(STATE.editReceitaId,{desc,resp,valores,updatedBy:STATE.usuario,updatedAt:today()});
      this.toast('Receita atualizada ✅','success');
      STATE.editReceitaId=null;
    }else{
      await FS.addOutra({desc,resp,valores,createdBy:STATE.usuario,createdAt:today()});
      this.toast('"'+desc+'" criada ✅','success');
    }
    APP.closeModal('ovReceita');
  },

  async deleteOutra(id){
    if(!confirm('Excluir esta receita?'))return;
    await FS.deleteOutra(id);this.toast('Receita excluída','success');
  },

});
