"use strict";

Object.assign(APP, {
  // ============================================================
  // RECEITAS (Redesign v2 — layout tabular padrão Contas)
  // ============================================================

  /** Anos do filtro da tela Receitas: o ano escolhido ou, em "Todos os anos", os anos com movimento. */
  _anosReceitas(){
    const v = document.getElementById('filtroAnoReceitas')?.value || String(new Date().getFullYear());
    return v==='todos' ? CACHE.anosComDados() : [parseInt(v)];
  },

  renderReceitas(){
    const search = (document.getElementById('searchReceitas')?.value||'').toLowerCase();
    const mesVal = document.getElementById('filtroMesReceitas')?.value||'todos';
    const resp   = STATE.resp;   // filtro global do topbar
    const tipo   = document.getElementById('filtroTipoReceitas')?.value||'';
    const mesFiltro = mesVal==='todos' ? null : parseInt(mesVal);
    // Período (botão 📅) tem prioridade sobre Ano/Mês, como em Contas e Dashboard
    const p      = STATE.periodoReceitas;
    const anos   = p ? [p.ano] : this._anosReceitas();
    const variosAnos = anos.length > 1;
    const meses  = p
      ? Array.from({length:p.mesFim-p.mesIni+1},(_,i)=>p.mesIni+i)
      : mesFiltro!==null ? [mesFiltro] : Array.from({length:12},(_,i)=>i);
    this._atualizarPeriodoBadge('receitas', p);   // view recarregada ao voltar para a tela

    // ── Build unified data ── (ordem = ano*12+mês, para ordenar por período entre anos)
    let data = [];

    // Salários: 1 linha por pessoa por mês de cada ano (salário vale para todos os anos)
    if(tipo!=='outra'){
      for(const s of CACHE.salarios){
        if(resp && s.pessoa!==resp) continue;
        for(const a of anos){
          for(const m of meses){
            const h = CACHE.getSalarioMes(s, a, m);
            if(!h||!h.liquido) continue;
            data.push({
              tipo:'salario', desc:'Salário — '+s.nome, resp:s.pessoa||'',
              ano:a, mes:m, ordem:a*12+m, valor:h.liquido, updatedBy:'', readOnly:true, id:'sal_'+s.id+'_'+a+'_'+m
            });
          }
        }
      }
    }

    // Outras Receitas: só as do(s) ano(s) filtrado(s); 1 linha por mês com valor > 0
    if(tipo!=='salario'){
      for(const r of CACHE.outras){
        const a = CACHE.anoReceita(r);
        if(!anos.includes(a)) continue;
        // Mesma regra do Dashboard: receita "Ambos" vale metade para Leo e metade para Pri
        const fatia = fatiaReceita(r, resp);
        if(!fatia) continue;
        for(const m of meses){
          const v = (r.valores||[])[m];
          if(!v) continue;
          data.push({
            tipo:'outra', desc:r.desc, resp:r.resp||'',
            ano:a, mes:m, ordem:a*12+m, valor:v*fatia, _split:fatia<1, updatedBy:r.updatedBy||'',
            readOnly:false, id:r.id, semAno:!Number.isInteger(r.ano)
          });
        }
      }
    }

    // Busca textual (inclui mês e ano)
    if(search){
      data = data.filter(d =>
        d.desc.toLowerCase().includes(search) ||
        d.resp.toLowerCase().includes(search) ||
        MESES[d.mes].toLowerCase().includes(search) ||
        String(d.ano).includes(search)
      );
    }

    this._avisoReceitasSemAno();

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
      const respChip = (r.resp
        ? '<span class="badge bg-cat">'+r.resp+'</span>'
        : '<span style="font-size:10.5px;color:var(--t4)">Ambos</span>')
        + (r._split ? '<span class="badge" style="background:var(--yellow-lt);color:var(--yellow);margin-left:5px;font-size:9px">÷2</span>' : '');
      const auditChip = r.updatedBy ? '<span class="audit-chip">'+r.updatedBy+'</span>' : '';
      const acoes = r.readOnly
        ? '<span style="font-size:10px;color:var(--t4)">auto</span>'
        : '<button class="action-btn edit" title="Editar" onclick="APP.openReceita(\''+r.id+'\')">✏</button>'+
          '<button class="action-btn del" title="Excluir" onclick="APP.deleteOutra(\''+r.id+'\')">✕</button>';

      return '<tr class="mob-card">'+
        '<td data-label="Tipo">'+tipoBadge+'</td>'+
        '<td data-label="Descrição" style="font-weight:600;color:var(--t1)">'+r.desc+'</td>'+
        '<td data-label="Responsável">'+respChip+'</td>'+
        '<td data-label="Mês">'+MESES[r.mes]+(variosAnos?' '+r.ano:'')+(r.semAno?' <span class="badge" style="background:var(--yellow-lt);color:var(--yellow);font-size:9px" title="Cadastrada antes do controle por ano: ano ainda não confirmado">ano?</span>':'')+'</td>'+
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
    this.renderRecChart(resp, anos);
    this.atualizarContextoTopbar();   // selo de período no topbar
  },

  // ── CHART (preservado do original) ──
  /**
   * Resumo anual empilhado (salários + outras receitas) dos anos filtrados.
   * Com vários anos ("Todos os anos"), cada mês soma o mesmo mês de todos eles.
   */
  renderRecChart(filtroResp='', anos=[new Date().getFullYear()]){
    const sals=CACHE.salarios.filter(s=>!filtroResp||s.pessoa===filtroResp);
    const salVals=Array.from({length:12},(_,m)=>{let t=0;anos.forEach(a=>sals.forEach(s=>{const h=CACHE.getSalarioMes(s,a,m);t+=h?h.liquido:0;}));return t;});
    const outVals=Array.from({length:12},(_,m)=>CACHE.outras.reduce((s,r)=>anos.includes(CACHE.anoReceita(r))?s+((r.valores||[])[m]||0)*fatiaReceita(r,filtroResp):s,0));
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
  // Outras receitas são por ano: o ano é obrigatório e os 12 valores mensais valem só nele.
  openReceita(id){
    STATE.editReceitaId=id||null;
    STATE.recOriginal=null;
    ['rDesc','rValor'].forEach(fid=>{const e=document.getElementById(fid);if(e)e.value='';});
    const rResp=document.getElementById('rResp');if(rResp)rResp.value='';
    const rMesIni=document.getElementById('rMesIni');if(rMesIni)rMesIni.value='-1';
    const rMesFim=document.getElementById('rMesFim');if(rMesFim)rMesFim.value='-1';
    const rAno=document.getElementById('rAno');
    if(rAno){
      if(!rAno.options.length) for(let a=2019;a<=2035;a++) rAno.appendChild(new Option(a,a));
      // Nova receita: ano do período ativo ou o filtrado na tela Receitas (ou o atual)
      const filtro=STATE.periodoReceitas ? String(STATE.periodoReceitas.ano) : document.getElementById('filtroAnoReceitas')?.value;
      rAno.value=String(/^\d{4}$/.test(filtro||'') ? filtro : new Date().getFullYear());
    }

    if(id){
      const r=CACHE.outras.find(x=>x.id===id);
      if(r){
        const valores=(r.valores||[]).slice(0,12);
        document.getElementById('rDesc').value=r.desc;
        if(rResp)rResp.value=r.resp||'';
        if(rAno)rAno.value=String(CACHE.anoReceita(r));
        let ini=-1,fim=-1;
        for(let m=0;m<12;m++){if(valores[m]){if(ini===-1)ini=m;fim=m;}}
        if(rMesIni)rMesIni.value=ini;
        if(rMesFim)rMesFim.value=fim;
        const val = ini!==-1 ? valores[ini] : 0;
        if(ini!==-1){const rv=document.getElementById('rValor');if(rv)setMoneyValue(rv,val);}
        // Guarda os valores originais: se o usuário não mexer em valor nem meses (ex.: só
        // troca o ano ou a descrição), os valores de cada mês são mantidos como estão.
        const naFaixa = ini===-1 ? [] : valores.slice(ini, fim+1);
        STATE.recOriginal = {
          valores, ini, fim, valCent:centavos(val),
          variado: naFaixa.some(v=>centavos(v)!==centavos(val)),
        };
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
    const ano=document.getElementById('rAno')?.value||'';
    const de=ano?' de '+ano:'';
    const el=document.getElementById('rPeriodoInfo');if(!el)return;
    let txt;
    if(ini===-1)txt='O valor será aplicado em todos os meses (Jan a Dez'+de+').';
    else if(fim===-1||fim===ini)txt='O valor será aplicado somente em '+MESES_F[ini]+de+'.';
    else if(fim<ini)txt='⚠️ Mês final deve ser igual ou posterior ao inicial.';
    else txt='O valor será aplicado de '+MESES_F[ini]+' a '+MESES_F[fim]+de+' ('+(fim-ini+1)+' meses).';
    if(STATE.recOriginal?.variado) txt+=' Esta receita tem valores diferentes por mês: eles são mantidos se você não alterar o valor nem os meses.';
    el.textContent=txt;
  },

  async saveReceita(){
    const desc=document.getElementById('rDesc').value.trim();
    const resp=document.getElementById('rResp').value;
    const val=parseMoney(document.getElementById('rValor').value);
    const ini=parseInt(document.getElementById('rMesIni')?.value??'-1');
    const fim=parseInt(document.getElementById('rMesFim')?.value??'-1');
    const ano=parseInt(document.getElementById('rAno')?.value);
    if(!desc)return this.toast('Informe a descrição','error');
    if(!ano||ano<2019||ano>2035)return this.toast('Informe o ano da receita (2019 a 2035)','error');
    if(ini!==-1&&fim!==-1&&fim<ini)return this.toast('Mês final deve ser igual ou posterior ao inicial','error');

    // Edição sem mudar valor nem meses: mantém os valores originais de cada mês
    const orig=STATE.editReceitaId?STATE.recOriginal:null;
    const intacto=orig && orig.ini===ini && orig.fim===fim && orig.valCent===centavos(val);
    let valores;
    if(intacto){
      valores=orig.valores.slice();
      while(valores.length<12) valores.push(0);
    } else {
      if(orig?.variado && !confirm('Esta receita tem valores diferentes por mês. Ao salvar com o novo valor ou período, todos os meses do período ficarão com o mesmo valor. Continuar?')) return;
      valores=Array(12).fill(0);
      if(ini===-1){valores.fill(val);}
      else{const mesF=(fim===-1||fim<ini)?ini:fim;for(let m=ini;m<=mesF;m++)valores[m]=val;}
    }

    if(STATE.editReceitaId){
      await FS.updateOutra(STATE.editReceitaId,{desc,resp,ano,valores,updatedBy:STATE.usuario,updatedAt:today()});
      this.toast('Receita atualizada ✅','success');
      STATE.editReceitaId=null;
    }else{
      await FS.addOutra({desc,resp,ano,valores,createdBy:STATE.usuario,createdAt:today()});
      this.toast('"'+desc+'" criada para '+ano+' ✅','success');
    }
    STATE.recOriginal=null;
    APP.closeModal('ovReceita');
  },

  // ── RECEITAS ANTERIORES AO CONTROLE POR ANO ──
  // Receitas sem `ano` continuam valendo (no ano inferido por CACHE.anoReceita) até o usuário
  // confirmar. A confirmação só acrescenta o campo `ano`: nenhum valor é alterado.
  _avisoReceitasSemAno(){
    const el=document.getElementById('recSemAnoAviso');
    if(!el) return;
    const n=CACHE.receitasSemAno().length;
    el.style.display = n ? 'block' : 'none';
    if(n) el.innerHTML=`⚠️ <strong>${n} receita${n>1?'s':''} cadastrada${n>1?'s':''} antes do controle por ano.</strong> Até você confirmar, o sistema usa o ano da última alteração. Clique para revisar e gravar o ano.`;
  },

  abrirAnosReceitas(){
    const lista=CACHE.receitasSemAno().sort((a,b)=>String(a.desc).localeCompare(String(b.desc),'pt'));
    const tbody=document.getElementById('recAnosBody');
    if(!tbody) return;
    if(!lista.length){ this.toast('Todas as receitas já têm ano','info'); return; }
    const anos=Array.from({length:17},(_,i)=>2019+i);
    tbody.innerHTML=lista.map(r=>{
      const valores=r.valores||[];
      const meses=valores.map((v,i)=>v?MESES[i]:null).filter(Boolean);
      const total=valores.reduce((s,v)=>s+centavos(v),0)/100;
      const anoSug=CACHE.anoReceita(r);
      return `<tr>
        <td style="font-weight:600;white-space:normal">${this._escHtml(r.desc)}</td>
        <td>${this._escHtml(r.resp||'Ambos')}</td>
        <td style="font-size:11px;color:var(--t3);white-space:normal">${meses.length===12?'Jan a Dez':meses.join(', ')||'—'}</td>
        <td class="money" style="text-align:right">${fmt(total)}</td>
        <td><select class="filter-select rec-ano-sel" data-id="${r.id}" style="min-width:90px">${anos.map(a=>`<option value="${a}"${a===anoSug?' selected':''}>${a}</option>`).join('')}</select></td>
      </tr>`;
    }).join('');
    document.getElementById('ovRecAnos').classList.add('open');
  },

  async salvarAnosReceitas(){
    const pares=[...document.querySelectorAll('#recAnosBody .rec-ano-sel')].map(s=>({id:s.dataset.id, ano:parseInt(s.value)}));
    if(!pares.length) return APP.closeModal('ovRecAnos');
    if(pares.some(p=>!p.ano||p.ano<2019||p.ano>2035)) return this.toast('Ano inválido','error');
    const btn=document.getElementById('btnSalvarRecAnos');
    if(btn) btn.disabled=true;
    try{
      await FS.definirAnoOutras(pares);
      APP.closeModal('ovRecAnos');
      this.toast(`Ano gravado em ${pares.length} receita${pares.length>1?'s':''} ✅`,'success');
    }catch(e){
      this.toast('Erro ao gravar: '+(e.message||e),'error');
    }finally{
      if(btn) btn.disabled=false;
    }
  },

  async deleteOutra(id){
    if(!confirm('Excluir esta receita?'))return;
    await FS.deleteOutra(id);this.toast('Receita excluída','success');
  },

});
