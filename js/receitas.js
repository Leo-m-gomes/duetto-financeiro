"use strict";

Object.assign(APP, {
  // ============================================================
  // RECEITAS
  // ============================================================
  toggleEditReceitas(){
    STATE.recEditando=!STATE.recEditando;
    document.getElementById('recEditStatus').textContent=STATE.recEditando?'✏️ Modo edição':'Somente leitura';
    document.getElementById('btnToggleEditRec').textContent=STATE.recEditando?'🔒 Fechar edição':'✏️ Editar';
    this.renderRecOutras();
  },

  renderReceitas(){
    const filtroResp=document.getElementById('recFiltroResp')?.value||'';
    const filtroTipo=document.getElementById('recFiltroTipo')?.value||'';
    const secSal=document.getElementById('tblRecSalarios')?.closest('.rec-section');
    const secOut=document.getElementById('tblRecOutras')?.closest('.rec-section');
    const mostrarSal=filtroTipo!=='outras';const mostrarOut=filtroTipo!=='salarios';
    if(secSal)secSal.style.display=mostrarSal?'':'none';
    if(secOut)secOut.style.display=mostrarOut?'':'none';
    if(mostrarSal)this.renderRecSalarios(filtroResp);
    if(mostrarOut)this.renderRecOutras(filtroResp);
    this.renderRecChart(filtroResp);
  },

  renderRecSalarios(filtroResp=''){
    const sals=CACHE.salarios.filter(s=>!filtroResp||s.pessoa===filtroResp);
    const header=`<thead><tr><th>Pessoa</th><th>Fonte</th>${MESES.map(m=>`<th>${m}</th>`).join('')}<th>Total</th></tr></thead>`;
    const rows=sals.map(s=>{
      const vals=Array.from({length:12},(_,m)=>{const h=CACHE.getSalarioMes(s,m);return h?h.liquido:0;});
      const total=vals.reduce((a,b)=>a+b,0);const chip=s.pessoa?`<span class="badge bg-cat">${s.pessoa}</span>`:'';
      return`<tr><td>${chip}</td><td>${s.nome}</td>${vals.map(v=>`<td class="pos" style="text-align:right">${fmtN(v)}</td>`).join('')}<td class="pos" style="text-align:right;font-weight:700">${fmtN(total)}</td></tr>`;
    }).join('');
    const totals=Array.from({length:12},(_,m)=>{let t=0;sals.forEach(s=>{const h=CACHE.getSalarioMes(s,m);t+=h?h.liquido:0;});return t;});
    const tTotal=totals.reduce((a,b)=>a+b,0);
    document.getElementById('tblRecSalarios').innerHTML=header+`<tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total Salários</td>${totals.map(v=>`<td style="text-align:right">${fmtN(v)}</td>`).join('')}<td style="text-align:right">${fmtN(tTotal)}</td></tr></tfoot>`;
  },

  renderRecOutras(filtroResp=''){
    const todas=CACHE.outras;
    const outras=filtroResp?todas.filter(r=>!r.resp||r.resp===''||r.resp===filtroResp):todas;
    const edit=STATE.recEditando;
    const header=`<thead><tr><th>Responsável</th><th>Descrição</th>${MESES.map(m=>`<th>${m}</th>`).join('')}<th>Total</th><th></th></tr></thead>`;
    const rows=outras.map(r=>{
      const respChip=r.resp?`<span class="badge bg-cat">${r.resp}</span>`:`<span style="font-size:10.5px;color:var(--t4)">Ambos</span>`;
      const cells=r.valores.map((v,m)=>{
        if(edit)return`<td><input class="cell-input money-input" type="text" inputmode="numeric" id="rec_${r.id}_${m}" value="${v?maskMoney(floatToCentsStr(v)):''}" placeholder="0" oninput="APP.recalcRowTotal('${r.id}')" onchange="APP.saveOutraValor('${r.id}',${m},this.value)"></td>`;
        return`<td style="text-align:right;font-size:11.5px;color:var(--t2)">${v?fmtN(v):'—'}</td>`;
      }).join('');
      const total=r.valores.reduce((a,b)=>a+b,0);
      return`<tr><td>${edit?`<select onchange="APP.saveOutraResp('${r.id}',this.value)" style="padding:3px 6px;border:1px solid var(--border);border-radius:5px;font-size:11.5px"><option value="" ${!r.resp?'selected':''}>Ambos</option><option value="Leo" ${r.resp==='Leo'?'selected':''}>Leo</option><option value="Pri" ${r.resp==='Pri'?'selected':''}>Pri</option></select>`:respChip}</td><td><strong>${r.desc}</strong>${r.updatedBy?`<br><span class="audit-chip">${r.updatedBy}</span>`:''}</td>${cells}<td class="pos" style="text-align:right;font-weight:700" id="rec_total_${r.id}">${fmtN(total)}</td><td>${edit?`<button class="action-btn del" onclick="APP.deleteOutra('${r.id}')">✕</button>`:''}</td></tr>`;
    }).join('');
    const totals=Array.from({length:12},(_,m)=>outras.reduce((s,r)=>s+(r.valores[m]||0),0));
    const tTotal=totals.reduce((a,b)=>a+b,0);
    document.getElementById('tblRecOutras').innerHTML=header+`<tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total Outras Receitas</td>${totals.map(v=>`<td style="text-align:right">${fmtN(v)}</td>`).join('')}<td style="text-align:right">${fmtN(tTotal)}</td><td></td></tr></tfoot>`;
    if(edit) bindAllMoneyInputs(document.getElementById('tblRecOutras'));
  },

  recalcRowTotal(id){
    const r=CACHE.outras.find(x=>x.id===id);if(!r)return;
    let total=0;for(let m=0;m<12;m++){const el=document.getElementById(`rec_${id}_${m}`);total+=parseMoney(el?.value);}
    const totEl=document.getElementById(`rec_total_${id}`);if(totEl)totEl.textContent=fmtN(total);
  },

  async saveOutraValor(id,mes,val){
    const r=CACHE.outras.find(x=>x.id===id);if(!r)return;
    const valores=[...r.valores];valores[mes]=parseMoney(val);
    await FS.updateOutra(id,{valores,updatedBy:STATE.usuario,updatedAt:today()});
  },

  async saveOutraResp(id,resp){
    await FS.updateOutra(id,{resp});
  },

  async deleteOutra(id){
    if(!confirm('Excluir esta receita?'))return;
    await FS.deleteOutra(id);this.toast('Receita excluída','success');
  },

  renderRecChart(filtroResp=''){
    const sals=CACHE.salarios.filter(s=>!filtroResp||s.pessoa===filtroResp);
    const outras=CACHE.outras.filter(r=>!filtroResp||!r.resp||r.resp===filtroResp);
    const salVals=Array.from({length:12},(_,m)=>{let t=0;sals.forEach(s=>{const h=CACHE.getSalarioMes(s,m);t+=h?h.liquido:0;});return t;});
    const outVals=Array.from({length:12},(_,m)=>outras.reduce((s,r)=>s+(r.valores[m]||0),0));
    const dark = document.documentElement.classList.contains('dark');

    // ── Paleta diferenciada: verde escuro (Salários) vs menta vibrante (Outras)
    const salColor    = dark ? 'rgba(0,100,55,.75)'    : 'rgba(0,100,55,.82)';
    const salBorder   = dark ? '#32d74b'                : '#006437';
    const outColor    = dark ? 'rgba(52,211,153,.55)'  : 'rgba(52,211,153,.80)';
    const outBorder   = dark ? '#34d399'                : '#059669';
    const tickColor   = dark ? 'rgba(235,235,245,.45)' : '#9ca3af';
    const gridColor   = dark ? 'rgba(255,255,255,.05)' : '#e8edf2';
    const legendColor = dark ? 'rgba(235,235,245,.85)' : '#374151';
    const tooltipBg   = dark ? 'rgba(28,28,30,.97)'    : 'rgba(15,31,20,.95)';

    // Total por mês para exibir no tooltip
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

  // ── RECEITA MODAL ──
  openReceita(){
    ['rDesc','rValor'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    const rResp=document.getElementById('rResp');if(rResp)rResp.value='';
    const rMesIni=document.getElementById('rMesIni');if(rMesIni)rMesIni.value='-1';
    const rMesFim=document.getElementById('rMesFim');if(rMesFim)rMesFim.value='-1';
    this.rAtualizarPeriodoInfo();
    document.getElementById('ovReceita').classList.add('open');
    bindAllMoneyInputs(document.getElementById('ovReceita'));
    setTimeout(()=>document.getElementById('rDesc').focus(),100);
  },
  rAtualizarPeriodoInfo(){
    const ini=parseInt(document.getElementById('rMesIni')?.value??'-1');
    const fim=parseInt(document.getElementById('rMesFim')?.value??'-1');
    const el=document.getElementById('rPeriodoInfo');if(!el)return;
    const MN=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    if(ini===-1) el.textContent='O valor será aplicado em todos os meses (Jan–Dez).';
    else if(fim===-1||fim===ini) el.textContent=`O valor será aplicado somente em ${MN[ini]}.`;
    else if(fim<ini) el.textContent='⚠️ Mês final deve ser igual ou posterior ao inicial.';
    else el.textContent=`O valor será aplicado de ${MN[ini]} a ${MN[fim]} (${fim-ini+1} meses).`;
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
    if(ini===-1){ valores.fill(val); }
    else{ const mesF=(fim===-1||fim<ini)?ini:fim; for(let m=ini;m<=mesF;m++)valores[m]=val; }
    await FS.addOutra({desc,resp,valores,createdBy:STATE.usuario,createdAt:today()});
    APP.closeModal('ovReceita');
    this.toast(`"${desc}" criada ✅`,'success');
  },

});

