"use strict";

Object.assign(APP, {

  // Calcula dados do Pareto a partir de um array de contas
  _calcPareto(contas){
    const map = {};
    contas.forEach(c=>{
      const n = CACHE.resolveCat(c.catId||c.cat)||'Outros';
      map[n] = (map[n]||0) + vEfetivo(c);
    });
    const sorted = Object.entries(map).sort((a,b)=>b[1]-a[1]);
    const total  = sorted.reduce((s,[,v])=>s+v,0);
    let acum = 0;
    return sorted.map(([cat,val])=>{
      acum += val;
      return {cat, val, pct:total>0?(val/total*100):0, acum:total>0?(acum/total*100):0};
    });
  },

  renderPareto(canvasId, tableId, contas){
    if(!contas||!contas.length){
      const el=document.getElementById(tableId);
      if(el)el.innerHTML='<p style="padding:20px;color:var(--t4);font-size:12px">Sem dados para o período.</p>';
      return;
    }
    const dados = this._calcPareto(contas);
    if(!dados.length) return;

    // ── Tabela lateral ──
    const tableEl = document.getElementById(tableId);
    if(tableEl){
      const is80 = dados.findIndex(d=>d.acum>=80);
      tableEl.innerHTML=`
        <table>
          <thead><tr><th>Categoria</th><th style="text-align:right">Valor (R$)</th><th style="text-align:right">% Acum.</th></tr></thead>
          <tbody>
            ${dados.map((d,i)=>`
              <tr class="${i===is80?'pareto-80':''}">
                <td>${d.cat}</td>
                <td class="pareto-val">${fmt(d.val)}</td>
                <td class="pareto-pct">${d.acum.toFixed(1)}%</td>
              </tr>`).join('')}
            <tr>
              <td>TOTAL</td>
              <td class="pareto-val">${fmt(dados.reduce((s,d)=>s+d.val,0))}</td>
              <td class="pareto-pct">100%</td>
            </tr>
          </tbody>
        </table>`;
    }

    // ── Gráfico combinado: barra + linha ──
    const labels = dados.map(d=>d.cat);
    const valores = dados.map(d=>d.val);
    const acums   = dados.map(d=>d.acum);
    const total   = dados.reduce((s,d)=>s+d.val,0);

    // Ponto onde acumulado passa de 80%
    const idx80 = dados.findIndex(d=>d.acum>=80);

    // M03: cores Pareto adaptadas ao tema (claro/escuro)
    const dark = document.documentElement.classList.contains('dark');
    const paretoStrong   = dark ? 'rgba(50,215,75,0.65)'  : 'rgba(0,100,55,0.70)';
    const paretoLight    = dark ? 'rgba(50,215,75,0.18)'  : 'rgba(0,100,55,0.20)';
    const paretoBorder   = dark ? '#32d74b'                : '#006437';
    const paretoBorderLt = dark ? '#5fdf75'                : '#00a85a';
    // Cores das barras: destaque nas que compõem os 80%
    const barColors = dados.map((_,i)=>
      i<=idx80 ? paretoStrong : paretoLight
    );
    const barBorders = dados.map((_,i)=>
      i<=idx80 ? paretoBorder : paretoBorderLt
    );

    this.mkChart(canvasId,{
      type:'bar',
      data:{
        labels,
        datasets:[
          {
            type:'bar',
            label:'Valor (R$)',
            data:valores,
            backgroundColor:barColors,
            borderColor:barBorders,
            borderWidth:2,
            borderRadius:{topLeft:5,topRight:5},
            borderSkipped:false,
            yAxisID:'y',
            order:2,
          },
          {
            type:'line',
            label:'% Acumulado',
            data:acums,
            borderColor:'#1d4ed8',
            backgroundColor:'rgba(29,78,216,.08)',
            borderWidth:2.5,
            pointBackgroundColor:acums.map(a=>a>=80&&a-dados[acums.indexOf(a)-1]?.acum>=0&&acums.indexOf(a)===idx80?'#ffffff':'#1d4ed8'),
            pointBorderColor:acums.map((_,i)=>i===idx80?'#1d4ed8':'#1d4ed8'),
            pointRadius:acums.map((_,i)=>i===idx80?7:3),
            pointBorderWidth:acums.map((_,i)=>i===idx80?2.5:1.5),
            fill:true,
            tension:.35,
            yAxisID:'y2',
            order:1,
          }
        ]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{
            labels:{color:getChartDefaults().color,font:{size:11},usePointStyle:true,pointStyle:'circle',padding:14}
          },
          tooltip:{
            backgroundColor:getChartDefaults().tooltipBg,
            padding:10,cornerRadius:8,
            callbacks:{
              title:ctx=>ctx[0].label,
              label:ctx=>{
                if(ctx.dataset.type==='bar'||ctx.dataset.label==='Valor (R$)'){
                  const pct = total>0?(ctx.raw/total*100).toFixed(1):0;
                  return ` Valor: ${fmt(ctx.raw)} (${pct}%)`;
                }
                return ` Acumulado: ${ctx.raw.toFixed(1)}%`;
              }
            }
          },
          // Linha de 80% como anotação visual via afterDraw
          annotation:{},
        },
        scales:{
          x:{
            ticks:{color:'#9ca3af',font:{size:9},maxRotation:35},
            grid:{display:false},
          },
          y:{
            position:'left',
            ticks:{color:'#9ca3af',font:{size:10},callback:v=>`R$${(v/1000).toFixed(0)}k`},
            grid:{color:'rgba(0,0,0,.04)',drawBorder:false},
          },
          y2:{
            position:'right',
            min:0,max:100,
            ticks:{color:'#1d4ed8',font:{size:10},callback:v=>`${v}%`},
            grid:{display:false},
          }
        }
      }
    });
  },

  toggleParetoRel(){
    const chk  = document.getElementById('chkParetoRel');
    const wrap = document.getElementById('paretoRelWrap');
    if(wrap) wrap.style.display = chk?.checked ? 'block' : 'none';
  },
});
