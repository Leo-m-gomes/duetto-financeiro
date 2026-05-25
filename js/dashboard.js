"use strict";

Object.assign(APP, {
  // ============================================================
  // DASHBOARD
  // ============================================================
  renderDashboard(){
    const anoVal = document.getElementById('filtroAnoDash')?.value || String(new Date().getFullYear());
    const mesVal = document.getElementById('filtroMesDash')?.value || String(new Date().getMonth());
    const p      = STATE.periodoDash;
    const todosMeses = mesVal==='todos';
    const todosAnos  = anoVal==='todos';
    const mes  = todosMeses ? null : parseInt(mesVal);
    const ano  = todosAnos  ? null : parseInt(anoVal);
    const resp = STATE.dashResp;

    // Filtrar contas — período tem prioridade sobre ano/mês
    const filtrarContas = (all) => {
      if(p) return all.filter(c=>{
        const d=new Date(c.data+'T12:00');
        return d.getFullYear()===p.ano && d.getMonth()>=p.mesIni && d.getMonth()<=p.mesFim;
      });
      let r = all;
      if(ano)  r = r.filter(c=>new Date(c.data+'T12:00').getFullYear()===ano);
      if(!todosMeses && mes!==null) r = r.filter(c=>new Date(c.data+'T12:00').getMonth()===mes);
      return r;
    };
    const baseContas = filtrarContas(CACHE.contas);
    const contas = resp ? filtrarPorResp(baseContas, resp) : baseContas.map(c=>({...c}));

    // Receita: sempre ano completo por mês (o gráfico mostra o ano todo)
    let recMes=0;
    const mesesCalc = todosMeses ? Array.from({length:12},(_,i)=>i) : [mes];
    CACHE.salarios.forEach(s=>{
      mesesCalc.forEach(m=>{ const h=CACHE.getSalarioMes(s,m); const liq=h?h.liquido:0;
        if(!resp)recMes+=liq; else if(s.pessoa===resp)recMes+=liq;
      });
    });
    CACHE.outras.forEach(r=>{
      mesesCalc.forEach(m=>{ const v=r.valores[m]||0;
        if(!resp) recMes+=v;
        else if(r.resp===resp) recMes+=v;
        else if(resp==='Leo & Pri'&&(!r.resp||r.resp==='Ambos')) recMes+=v;
        else if(!r.resp||r.resp==='Ambos') recMes+=v/2;
      });
    });

    const totP    = contas.reduce((s,c)=>s+vEfetivo(c),0);
    const totPend = contas.reduce((s,c)=>s+vPendente(c),0);
    const pendList= contas.filter(c=>!(c.vPago>0));
    const saldo   = recMes-totP;
    const anoLabel = todosAnos ? 'Todos os anos' : String(anoVal);
    const mesLabel = todosMeses ? 'Ano completo' : MESES_F[mes];
    const periodoLabel = `${anoLabel} · ${mesLabel}`;

    const atrasadas=CACHE.getOverdue();
    const banner=document.getElementById('dashInfoBanner');
    if(atrasadas.length>0){banner.style.display='flex';banner.innerHTML=`⚠️ <strong>${atrasadas.length} conta${atrasadas.length>1?'s':''} em atraso!</strong> Clique para ver → ${atrasadas.slice(0,2).map(c=>c.conta).join(', ')}${atrasadas.length>2?'...':''}`;}
    else banner.style.display='none';

    const kpis=[
      {label:'Receita',val:fmt(recMes),sub:periodoLabel+(resp?` — ${resp}`:''),icon:'📈',c:'var(--palm)',hero:false},
      {label:'Total Despesas',val:fmt(totP),sub:`${contas.length} contas`,icon:'📋',c:'var(--blue)',hero:false},
      {label:'Pendente',val:fmt(totPend),sub:`${pendList.length} contas`,icon:'⏳',c:'var(--red)',hero:false},
      {label:'Saldo',val:fmt(saldo),sub:saldo>=0?'✅ Positivo':'⚠️ Atenção',icon:saldo>=0?'💰':'📉',c:saldo>=0?'var(--palm)':'var(--red)',hero:true}
    ];
    document.getElementById('kpiGrid').innerHTML=kpis.map(k=>`<div class="kpi-card${k.hero?' kpi-hero':''}" style="--kc:${k.c}"><div class="kpi-label">${k.label}</div><div class="kpi-value" style="color:${k.c}">${k.val}</div><div class="kpi-sub">${k.sub}</div><div class="kpi-icon">${k.icon}</div></div>`).join('');

    // ── INSIGHTS automáticos ──
    this._renderInsights(mes, ano, totP, totPend, saldo, resp, baseContas);

    document.getElementById('pendentesCount').textContent=pendList.length;
    document.getElementById('tbodyPendentes').innerHTML=pendList.slice(0,8).map(c=>{
      const atr=isOverdue(c);const catNome=CACHE.resolveCat(c.catId||c.cat);
      return`<tr class="mob-card pend-mob-row">
        <td data-label="Descrição"><strong>${c.conta}</strong>${c._split?'<span class="badge" style="background:var(--yellow-lt);color:var(--yellow);margin-left:5px;font-size:9px">÷2</span>':''}</td>
        <td data-label="Responsável">${c.resp}</td>
        <td data-label="Categoria">${catNome}</td>
        <td data-label="Vencimento" style="${atr?'color:var(--orange);font-weight:600':''}">${fmtDate(c.data)}</td>
        <td data-label="Valor" class="neg">${fmt(c.vPagar)}</td>
        <td data-label="Status" class="pend-status-cell ${atr?'pend-atr':'pend-ok'}">
          <span class="badge ${atr?'bg-atr':'bg-pend'}">${atr?'● Atrasado':'● Pendente'}</span>
        </td>
      </tr>`;
    }).join('')||'<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--t4)">Nenhuma pendência 🎉</td></tr>';

    this.chartCategoria(mes,resp,baseContas);this.chartFluxo(baseContas,resp);
    this.renderPareto('canvasParetoDash','paretoTableDash',contas);
  },

  _renderInsights(mes, ano, totP, totPend, saldo, resp, baseContas){
    const el = document.getElementById('insightBar');
    if(!el) return;
    const chips = [];

    // 1. Comparar despesas com mês anterior (só se um mês específico estiver selecionado)
    if(mes !== null && ano !== null){
      const mesPrev = mes === 0 ? 11 : mes - 1;
      const anoPrev = mes === 0 ? ano - 1 : ano;
      const contasPrev = CACHE.contas.filter(c=>{
        const d = new Date(c.data+'T12:00');
        return d.getFullYear()===anoPrev && d.getMonth()===mesPrev && (!resp || c.resp===resp || c.resp==='Leo & Pri');
      });
      const totPrev = contasPrev.reduce((s,c)=>s+vEfetivo(c),0);
      if(totPrev > 0 && totP > 0){
        const diff = ((totP - totPrev) / totPrev) * 100;
        const abs  = Math.abs(diff).toFixed(1);
        const prevLabel = MESES_F[mesPrev];
        if(diff > 5)       chips.push({cls:'insight-up',  text:`📈 Despesas ${abs}% acima de ${prevLabel}`});
        else if(diff < -5) chips.push({cls:'insight-down', text:`📉 Despesas ${abs}% abaixo de ${prevLabel}`});
        else               chips.push({cls:'insight-neu',  text:`➡️ Despesas estáveis vs ${prevLabel} (${diff>0?'+':''}${abs}%)`});
      }
    }

    // 2. Categoria com maior gasto
    if(baseContas.length > 0){
      const map = {};
      baseContas.forEach(c=>{ const n=CACHE.resolveCat(c.catId||c.cat); map[n]=(map[n]||0)+vEfetivo(c); });
      const top = Object.entries(map).sort((a,b)=>b[1]-a[1])[0];
      if(top) chips.push({cls:'insight-neu', text:`🏷️ Maior categoria: ${top[0]} (${fmt(top[1])})`});
    }

    // 3. Saldo negativo — alerta
    if(saldo < 0) chips.push({cls:'insight-warn', text:`⚠️ Despesas superam a receita em ${fmt(Math.abs(saldo))}`});

    // 4. Contas próximas do vencimento (3 dias)
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const em3  = new Date(hoje); em3.setDate(hoje.getDate()+3);
    const proximas = CACHE.contas.filter(c=>{
      if(c.vPago > 0) return false;
      const d = new Date(c.data+'T12:00'); d.setHours(0,0,0,0);
      return d >= hoje && d <= em3;
    });
    if(proximas.length > 0) chips.push({cls:'insight-warn', text:`⏰ ${proximas.length} conta${proximas.length>1?'s':''} vencem nos próximos 3 dias`});

    // 5. Contas recorrentes sem preenchimento no mês atual
    if(mes !== null && ano !== null){
      const recorrentes = CACHE.contas.filter(c=>c.recorrente);
      const comMes = new Set(
        CACHE.contas.filter(c=>{ const d=new Date(c.data+'T12:00'); return d.getFullYear()===ano&&d.getMonth()===mes; }).map(c=>c.conta.toLowerCase()+'|'+c.resp)
      );
      const semMes = recorrentes.filter(c=>!comMes.has(c.conta.toLowerCase()+'|'+c.resp));
      if(semMes.length > 0) chips.push({cls:'insight-warn', text:`🔁 ${semMes.length} conta${semMes.length>1?'s recorrentes':'recorrente'} sem registro neste mês`});
    }

    el.innerHTML = chips.length
      ? chips.map(c=>`<span class="insight-chip ${c.cls}">${c.text}</span>`).join('')
      : '';
  },

  chartCategoria(mes,resp,baseContas){
    const dark = document.documentElement.classList.contains('dark');
    const textColor  = dark ? 'rgba(235,235,245,.85)' : '#374151';
    const borderColor = dark ? '#2c2c2e' : '#fff';
    const base = baseContas || CACHE.contas;
    let src = mes===null ? base : base.filter(c=>new Date(c.data+'T12:00').getMonth()===mes);
    const contas = resp ? filtrarPorResp(src, resp) : [...src];
    const map={};contas.forEach(c=>{const n=CACHE.resolveCat(c.catId||c.cat);map[n]=(map[n]||0)+vEfetivo(c);});
    const sorted=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,9);
    const total = sorted.reduce((s,[,v])=>s+v,0);
    // M03: paleta adaptada ao tema (claro/escuro), garantindo contraste no dark
    const chartColors = getChartColors();
    this.mkChart('canvasCategoria',{
      type:'doughnut',
      data:{
        labels:sorted.map(([k])=>k),
        datasets:[{
          data:sorted.map(([,v])=>v),
          backgroundColor:chartColors,
          borderWidth:3,
          borderColor,
          hoverOffset:6,
        }]
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        cutout:'62%',
        plugins:{
          legend:{
            position:'right',
            labels:{color:textColor,font:{size:11},boxWidth:10,padding:10,
              generateLabels(chart){
                const ds=chart.data.datasets[0];
                return chart.data.labels.map((label,i)=>{
                  const val=ds.data[i];
                  const pct=total>0?((val/total)*100).toFixed(1):'0.0';
                  return{text:`${label} ${pct}%`,fillStyle:ds.backgroundColor[i],hidden:false,index:i};
                });
              }
            }
          },
          tooltip:{
            backgroundColor:'rgba(15,31,20,.92)',padding:10,cornerRadius:8,
            callbacks:{label:ctx=>{
              const pct=total>0?((ctx.raw/total)*100).toFixed(1):'0.0';
              return ` ${ctx.label}: ${fmt(ctx.raw)} (${pct}%)`;
            }}
          }
        }
      }
    });
  },

  chartFluxo(baseContas, resp){
    // O gráfico Receita×Despesa SEMPRE mostra os 12 meses do ano selecionado
    // Ignora filtro de mês específico — usa todos os dados do ano
    resp = (resp !== undefined) ? resp : STATE.dashResp;
    const anoVal = document.getElementById('filtroAnoDash')?.value || 'todos';
    const ano    = anoVal === 'todos' ? null : parseInt(anoVal);

    // Usa TODAS as contas do ano (não só o mês filtrado)
    const contasAno = ano
      ? CACHE.contas.filter(c => new Date(c.data+'T12:00').getFullYear() === ano)
      : CACHE.contas;

    // Agrupa por mês com filtro de responsável — usa vEfetivo
    const despFilt = Array.from({length:12},(_,m)=>{
      const porMes = contasAno.filter(c=>new Date(c.data+'T12:00').getMonth()===m);
      const filtrado = resp ? filtrarPorResp(porMes, resp) : porMes;
      return filtrado.reduce((s,c)=>s+vEfetivo(c),0);
    });

    const rec=Array.from({length:12},(_,m)=>{
      let t=0;
      CACHE.salarios.forEach(s=>{if(!resp||s.pessoa===resp){const h=CACHE.getSalarioMes(s,m);t+=h?h.liquido:0;}});
      CACHE.outras.forEach(r=>{const v=r.valores[m]||0;if(!resp)t+=v;else if(r.resp===resp)t+=v;else if(resp==='Leo & Pri'&&(!r.resp||r.resp==='Ambos'))t+=v;else if(!r.resp||r.resp==='Ambos')t+=v/2;});
      return t;
    });
    const mesAtual = new Date().getMonth();
    const anoAtualNum = new Date().getFullYear();
    const dark = document.documentElement.classList.contains('dark');
    const curMes = !ano || ano===anoAtualNum;
    // Cores adaptadas ao tema
    const recStrong  = dark ? 'rgba(50,215,75,.55)'  : 'rgba(0,100,55,.35)';
    const recLight   = dark ? 'rgba(50,215,75,.14)'  : 'rgba(0,100,55,.15)';
    const despStrong = dark ? 'rgba(255,69,58,.45)'  : 'rgba(220,38,38,.25)';
    const despLight  = dark ? 'rgba(255,69,58,.12)'  : 'rgba(220,38,38,.12)';
    const recBorder  = dark ? '#32d74b' : '#006437';
    const despBorder = dark ? '#ff453a' : '#dc2626';
    const tickColor  = dark ? 'rgba(235,235,245,.4)' : '#9ca3af';
    const gridColor  = dark ? 'rgba(255,255,255,.05)': 'rgba(0,0,0,.04)';
    const textColor  = dark ? 'rgba(235,235,245,.85)': '#374151';
    this.mkChart('canvasFluxo',{
      type:'bar',
      data:{
        labels:MESES,
        datasets:[
          {
            label:'Receita',
            data:rec,
            backgroundColor:rec.map((_,i)=>i===mesAtual&&curMes?recStrong:recLight),
            borderColor:recBorder,
            borderWidth:2,
            borderRadius:{topLeft:5,topRight:5},
            borderSkipped:false,
          },
          {
            label:'Despesas',
            data:despFilt,
            backgroundColor:despFilt.map((_,i)=>i===mesAtual&&curMes?despStrong:despLight),
            borderColor:despBorder,
            borderWidth:2,
            borderRadius:{topLeft:5,topRight:5},
            borderSkipped:false,
          }
        ]
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{
          legend:{labels:{color:textColor,font:{size:10},usePointStyle:true,pointStyle:'circle',padding:16}},
          tooltip:{
            backgroundColor:'rgba(15,31,20,.92)',
            padding:10,
            cornerRadius:8,
            callbacks:{
              title:ctx=>MESES_F[ctx[0].dataIndex]||'',
              label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.raw)}`
            }
          }
        },
        scales:{
          x:{ticks:{color:tickColor,font:{size:10}},grid:{display:false}},
          y:{ticks:{color:tickColor,font:{size:10},callback:v=>`R$${(v/1000).toFixed(0)}k`},grid:{color:gridColor,drawBorder:false}}
        }
      }
    });
  },

});

