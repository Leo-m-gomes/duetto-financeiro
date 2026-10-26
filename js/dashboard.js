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
    const resp = STATE.resp;

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

    // Receita dos MESMOS meses e anos das despesas: período (mesIni..mesFim do ano dele), ano
    // completo ou o mês. Outras receitas são por ano; com "Todos os anos" soma os anos com
    // movimento (o salário vale para qualquer ano e não pode ser somado sem limite).
    const mesesCalc = p
      ? Array.from({length:p.mesFim-p.mesIni+1},(_,i)=>p.mesIni+i)
      : todosMeses ? Array.from({length:12},(_,i)=>i) : [mes];
    const anosCalc = p ? [p.ano] : (todosAnos ? CACHE.anosComDados() : [ano]);
    const recCent = anosCalc.reduce((s,a)=>s+mesesCalc.reduce((t,m)=>t+centavos(CACHE.getReceitaMes(a, m, resp)),0),0);
    const recMes  = recCent/100;

    const totPCent= contas.reduce((s,c)=>s+centavos(vEfetivo(c)),0);
    const totP    = totPCent/100;
    const totPend = contas.reduce((s,c)=>s+vPendente(c),0);
    const pendList= contas.filter(c=>!isQuitada(c));
    const saldoCent = recCent-totPCent;
    const saldo     = saldoCent/100;
    const anoLabel = todosAnos ? 'Todos os anos' : String(anoVal);
    const mesLabel = todosMeses ? 'Ano completo' : MESES_F[mes];
    const periodoLabel = p
      ? `${MESES_F[p.mesIni]} → ${MESES_F[p.mesFim]} ${p.ano}`
      : `${anoLabel} · ${mesLabel}`;

    // Vencidas e não pagas de meses anteriores ao mês de referência (mesma regra de Contas e
    // Relatório: só com mês específico ou período). Entram no que falta pagar (KPI Pendente,
    // tabela de pendentes) e numa linha "Após atrasadas anteriores" do Saldo. O valor principal
    // de Total Despesas e Saldo segue o mês de vencimento: a conta já pesou no mês dela.
    const mergeRef = p ? {y:p.ano, m:p.mesIni} : (!todosAnos && !todosMeses ? {y:ano, m:mes} : null);
    const anteriores = mergeRef
      ? filtrarPorResp(CACHE.getOverdueAntesDe(mergeRef.y, mergeRef.m), resp).filter(c=>!isQuitada(c))
      : [];
    const pendPeriodoCent   = contas.reduce((s,c)=>s+centavos(vPendente(c)),0);
    const pendAnterioresCent= anteriores.reduce((s,c)=>s+centavos(vPendente(c)),0);
    const pendTotal = [...anteriores, ...pendList].sort((a,b)=>a.data.localeCompare(b.data));

    // Alerta: todas as atrasadas (qualquer mês), com o valor que falta pagar (÷2 quando filtrado)
    const atrasadas = filtrarPorResp(CACHE.getOverdue(), resp).filter(c=>!isQuitada(c));
    const atrasadasCent = atrasadas.reduce((s,c)=>s+centavos(vPendente(c)),0);
    const banner=document.getElementById('dashInfoBanner');
    if(atrasadas.length>0){banner.style.display='flex';banner.innerHTML=`⚠️ <strong>${atrasadas.length} conta${atrasadas.length>1?'s':''} em atraso (<span class="money">${fmt(atrasadasCent/100)}</span>)!</strong> Clique para ver → ${atrasadas.slice(0,2).map(c=>c.conta).join(', ')}${atrasadas.length>2?'...':''}`;}
    else banner.style.display='none';

    const pendSub = `${pendTotal.length} contas`
      + (anteriores.length ? `<br>${fmt(pendAnterioresCent/100)} de meses anteriores` : '');
    // Saldo projetado: o que sobra do mês depois de quitar também as atrasadas anteriores
    const saldoSub = (saldo>=0 ? '✅ Positivo' : '⚠️ Atenção')
      + (anteriores.length ? `<br>Após atrasadas anteriores: <span style="white-space:nowrap">${fmt((saldoCent-pendAnterioresCent)/100)}</span>` : '');
    const kpis=[
      {label:'Receita',val:fmt(recMes),sub:periodoLabel+(resp?` — ${resp}`:''),icon:'📈',c:'var(--palm)',hero:false},
      {label:'Total Despesas',val:fmt(totP),sub:`${contas.length} contas`,icon:'📋',c:'var(--blue)',hero:false},
      {label:'Pendente',val:fmt((pendPeriodoCent+pendAnterioresCent)/100),sub:pendSub,icon:'⏳',c:'var(--red)',hero:false},
      {label:'Saldo',val:fmt(saldo),sub:saldoSub,icon:saldo>=0?'💰':'📉',c:saldo>=0?'var(--palm)':'var(--red)',hero:true}
    ];
    document.getElementById('kpiGrid').innerHTML=kpis.map(k=>`<div class="kpi-card${k.hero?' kpi-hero':''}" style="--kc:${k.c}"><div class="kpi-label">${k.label}</div><div class="kpi-value" style="color:${k.c}">${k.val}</div><div class="kpi-sub">${k.sub}</div><div class="kpi-icon">${k.icon}</div></div>`).join('');

    // ── INSIGHTS automáticos ── (com período ativo, mês/ano do seletor não valem: comparação desligada)
    this._renderInsights(p?null:mes, p?null:ano, totP, totPend, saldo, resp, contas);

    // Pendentes: atrasadas de meses anteriores primeiro (mais antigas no topo), depois as do período
    const PEND_MAX = 8;
    document.getElementById('pendentesCount').textContent=pendTotal.length;
    const antNote=document.getElementById('pendentesAntNote');
    if(antNote){
      antNote.hidden = !anteriores.length;
      antNote.innerHTML = anteriores.length
        ? `inclui ${anteriores.length} de meses anteriores · <span class="money">${fmt(pendAnterioresCent/100)}</span>`
        : '';
    }
    const pendMais = pendTotal.length>PEND_MAX
      ? `<tr><td colspan="6" style="text-align:center;padding:12px;font-size:12px;color:var(--t3)">Mostrando ${PEND_MAX} de ${pendTotal.length} · <a href="#" onclick="APP.goPage('contas');return false" style="color:var(--palm);font-weight:600">Ver todas em Contas</a></td></tr>`
      : '';
    document.getElementById('tbodyPendentes').innerHTML=pendTotal.slice(0,PEND_MAX).map(c=>{
      const atr=isOverdue(c);const catNome=CACHE.resolveCat(c.catId||c.cat);
      return`<tr class="mob-card pend-mob-row">
        <td data-label="Descrição"><strong>${c.conta}</strong>${this.seloParte(c)}</td>
        <td data-label="Responsável">${c.resp}</td>
        <td data-label="Categoria">${catNome}</td>
        <td data-label="Vencimento" style="${atr?'color:var(--orange);font-weight:600':''}">${fmtDate(c.data)}</td>
        <td data-label="Valor" class="neg">${fmt(c.vPagar)}</td>
        <td data-label="Status" class="pend-status-cell ${atr?'pend-atr':'pend-ok'}">
          <span class="badge ${atr?'bg-atr':'bg-pend'}">${atr?'● Atrasado':'● Pendente'}</span>
        </td>
      </tr>`;
    }).join('')+pendMais||'<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--t4)">Nenhuma pendência 🎉</td></tr>';

    this.chartCategoria(contas);this.chartFluxo(baseContas,resp);
    this.renderPareto('canvasParetoDash','paretoTableDash',contas);
    this.atualizarContextoTopbar();   // selo de período no topbar
  },

  /**
   * @param {Array} contas contas do período JÁ filtradas por responsável (÷2 aplicado),
   *                       as mesmas dos KPIs, para os chips baterem com os cards.
   */
  _renderInsights(mes, ano, totP, totPend, saldo, resp, contas){
    const el = document.getElementById('insightBar');
    if(!el) return;
    const chips = [];

    // 1. Comparar despesas com mês anterior (só se um mês específico estiver selecionado)
    if(mes !== null && ano !== null){
      const mesPrev = mes === 0 ? 11 : mes - 1;
      const anoPrev = mes === 0 ? ano - 1 : ano;
      const basePrev = CACHE.contas.filter(c=>{
        const d = new Date(c.data+'T12:00');
        return d.getFullYear()===anoPrev && d.getMonth()===mesPrev;
      });
      // Mesmo ÷2 do mês atual: antes o mês anterior entrava inteiro e a variação saía inflada
      const contasPrev = resp ? filtrarPorResp(basePrev, resp) : basePrev;
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
    if(contas.length > 0){
      const map = {};
      contas.forEach(c=>{ const n=CACHE.resolveCat(c.catId||c.cat); map[n]=(map[n]||0)+centavos(vEfetivo(c)); });
      const top = Object.entries(map).sort((a,b)=>b[1]-a[1])[0];
      if(top) chips.push({cls:'insight-neu', text:`🏷️ Maior categoria: ${top[0]} (${fmt(top[1]/100)})`});
    }

    // 3. Saldo negativo — alerta
    if(saldo < 0) chips.push({cls:'insight-warn', text:`⚠️ Despesas superam a receita em ${fmt(Math.abs(saldo))}`});

    // 4. Contas próximas do vencimento (3 dias)
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const em3  = new Date(hoje); em3.setDate(hoje.getDate()+3);
    const proximas = CACHE.contas.filter(c=>{
      if(isQuitada(c)) return false;
      if(resp && c.resp !== resp && c.resp !== 'Leo & Pri') return false;
      const d = new Date(c.data+'T12:00'); d.setHours(0,0,0,0);
      return d >= hoje && d <= em3;
    });
    if(proximas.length > 0) chips.push({cls:'insight-warn', text:`⏰ ${proximas.length} conta${proximas.length>1?'s':''} vencem nos próximos 3 dias`});

    // 5. Contas recorrentes sem preenchimento no mês atual (só com o recurso ligado)
    if(FEATURES.recorrentes && mes !== null && ano !== null){
      const recorrentes = CACHE.contas.filter(c=>c.recorrente && (!resp || c.resp===resp || c.resp==='Leo & Pri'));
      const comMes = new Set(
        CACHE.contas.filter(c=>{ const d=new Date(c.data+'T12:00'); return d.getFullYear()===ano&&d.getMonth()===mes; }).map(c=>c.conta.toLowerCase()+'|'+c.resp)
      );
      const semMes = recorrentes.filter(c=>!comMes.has(c.conta.toLowerCase()+'|'+c.resp));
      if(semMes.length > 0) chips.push({cls:'insight-warn', text:`🔁 ${semMes.length} conta${semMes.length>1?'s recorrentes':'recorrente'} sem registro neste mês`});
    }

    // 6. Receitas antigas sem ano confirmado: a receita do Dashboard usa o ano inferido
    const semAno = CACHE.receitasSemAno().length;
    if(semAno) chips.push({cls:'insight-warn', acao:"APP.goPage('receitas')",
      text:`📅 ${semAno} receita${semAno>1?'s':''} antiga${semAno>1?'s':''} sem ano confirmado: revise em Receitas`});

    el.innerHTML = chips.length
      ? chips.map(c=>c.acao
          ? `<span class="insight-chip ${c.cls}" role="button" tabindex="0" style="cursor:pointer" onclick="${c.acao}" onkeydown="if(event.key==='Enter')${c.acao}">${c.text}</span>`
          : `<span class="insight-chip ${c.cls}">${c.text}</span>`).join('')
      : '';
  },

  /**
   * Despesas por Categoria: donut + tabela HTML (nome, valor, %).
   *  • Até 6 categorias: uma fatia cada. Acima disso: as 5 maiores + "Demais" (cinza),
   *    que abre na tabela para mostrar as categorias agrupadas.
   *  • Percentuais sobre o total de TODAS as categorias, calculado antes do agrupamento.
   *  • Somas em centavos inteiros.
   *  • Cores das fatias vêm dos tokens --cat-* (theme.css). Textos e valores ficam no HTML,
   *    então seguem o tema e o modo privacidade (.money) sem código extra.
   * @param {Array} contas contas do período, já filtradas por responsável (÷2 aplicado)
   */
  chartCategoria(contas){
    const MAX_FATIAS = 6;
    const layout = document.getElementById('catLayout');
    const vazio  = document.getElementById('catEmpty');
    const tbody  = document.getElementById('tbodyCatLegend');
    const canvas = document.getElementById('canvasCategoria');
    if(!layout || !tbody || !canvas) return;

    const porCat = {};
    contas.forEach(c=>{
      const nome = CACHE.resolveCat(c.catId||c.cat);
      porCat[nome] = (porCat[nome]||0) + centavos(vEfetivo(c));
    });
    const ordenadas = Object.entries(porCat)
      .filter(([,v])=>v>0)
      .sort((a,b)=>b[1]-a[1])
      .map(([nome,v])=>({nome,v}));
    const total = ordenadas.reduce((s,d)=>s+d.v,0);

    if(!total){
      if(STATE.charts.canvasCategoria){ STATE.charts.canvasCategoria.destroy(); delete STATE.charts.canvasCategoria; }
      layout.hidden = true;
      if(vazio) vazio.hidden = false;
      return;
    }
    layout.hidden = false;
    if(vazio) vazio.hidden = true;

    const resto  = ordenadas.length > MAX_FATIAS ? ordenadas.slice(MAX_FATIAS-1) : [];
    const fatias = resto.length
      ? [...ordenadas.slice(0,MAX_FATIAS-1), {nome:`Demais (${resto.length})`, v:resto.reduce((s,d)=>s+d.v,0), resto}]
      : ordenadas;
    const corVar = (f,i) => f.resto ? '--cat-rest' : `--cat-${i+1}`;

    const loc   = typeof MONEY_CFG!=='undefined' ? MONEY_CFG.locale : 'pt-BR';
    const pct   = v => (Math.round(v*1000/total)/10).toLocaleString(loc,{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
    const valor = v => fmt(v/100);
    const esc   = s => this._escHtml(s);
    const aberto = !!this._catDemaisAberto;

    // ── Tabela (legenda) ──
    tbody.innerHTML = fatias.map((f,i)=>{
      const sw = `<span class="cat-sw" style="background:var(${corVar(f,i)})"></span>`;
      const nome = f.resto
        ? `<button type="button" class="cat-disc" aria-expanded="${aberto}"><span class="cat-chev" aria-hidden="true">▶</span><span class="cat-txt">${esc(f.nome)}</span></button>`
        : `<span class="cat-txt" title="${esc(f.nome)}">${esc(f.nome)}</span>`;
      const linha = `<tr class="cat-row" data-i="${i}"><td><span class="cat-nome">${sw}${nome}</span></td><td class="num money">${valor(f.v)}</td><td class="num cat-pct">${pct(f.v)}</td></tr>`;
      const subs = (f.resto||[]).map(r=>
        `<tr class="cat-sub"${aberto?'':' hidden'}><td><span class="cat-txt" title="${esc(r.nome)}">${esc(r.nome)}</span></td><td class="num money dim">${valor(r.v)}</td><td class="num cat-pct">${pct(r.v)}</td></tr>`
      ).join('');
      return linha + subs;
    }).join('') + `<tr class="cat-total"><td>Total</td><td class="num money">${valor(total)}</td><td class="num cat-pct">${pct(total)}</td></tr>`;

    const totalEl = document.getElementById('catTotal');
    if(totalEl) totalEl.textContent = valor(total);
    canvas.setAttribute('aria-label', 'Despesas por categoria: ' + fatias.map(f=>`${f.nome} ${pct(f.v)}`).join(', '));

    // ── Donut ── cores lidas do tema ativo (por isso o toggle de tema redesenha o dashboard)
    const css = getComputedStyle(document.documentElement);
    const cores = fatias.map((f,i)=>css.getPropertyValue(corVar(f,i)).trim());
    const superficie = css.getPropertyValue('--surface').trim();
    const linhas = [...tbody.querySelectorAll('tr.cat-row')];
    let ativo = -1;
    const marcar = i => linhas.forEach(tr=>tr.classList.toggle('is-active', Number(tr.dataset.i)===i));

    const chart = this.mkChart('canvasCategoria',{
      type:'doughnut',
      data:{
        labels:fatias.map(f=>f.nome),
        datasets:[{
          data:fatias.map(f=>f.v),
          backgroundColor:cores,
          borderColor:superficie, hoverBorderColor:superficie,
          borderWidth:2,          // vão de 2px na cor do cartão entre fatias
          hoverOffset:5,
        }]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        cutout:'70%', layout:{padding:6},
        // Sem legenda nem tooltip no canvas: a tabela mostra nome, valor e %
        plugins:{legend:{display:false}, tooltip:{enabled:false}},
        onHover:(e,els)=>{ ativo = els.length ? els[0].index : -1; marcar(ativo); },
      }
    });
    if(!chart) return;

    // Linha da tabela ↔ fatia do donut (handlers por propriedade: o render repete sem acumular)
    const ativar = i => {
      if(i===ativo) return;
      ativo = i;
      chart.setActiveElements(i<0 ? [] : [{datasetIndex:0,index:i}]);
      chart.update();
      marcar(i);
    };
    canvas.onmouseleave = () => { ativo = -1; marcar(-1); };
    tbody.onmouseover = e => {
      const tr = e.target.closest('tr');
      ativar(tr?.classList.contains('cat-row') ? Number(tr.dataset.i)
           : tr?.classList.contains('cat-sub') ? fatias.length-1
           : -1);
    };
    tbody.onmouseleave = () => ativar(-1);
    tbody.onclick = e => {
      const btn = e.target.closest('.cat-disc');
      if(!btn) return;
      this._catDemaisAberto = btn.getAttribute('aria-expanded')!=='true';
      btn.setAttribute('aria-expanded', String(this._catDemaisAberto));
      tbody.querySelectorAll('tr.cat-sub').forEach(tr=>{ tr.hidden = !this._catDemaisAberto; });
    };
  },

  chartFluxo(baseContas, resp){
    // O gráfico Receita×Despesa SEMPRE mostra os 12 meses do ano selecionado (ou do ano do
    // período personalizado, quando ativo). Ignora o filtro de mês.
    resp = (resp !== undefined) ? resp : STATE.resp;
    const anoVal = document.getElementById('filtroAnoDash')?.value || 'todos';
    const ano    = STATE.periodoDash ? STATE.periodoDash.ano : (anoVal === 'todos' ? null : parseInt(anoVal));

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

    // Receita do ano selecionado; "Todos os anos" soma o mês em cada ano com movimento
    const anosRec = ano ? [ano] : CACHE.anosComDados();
    const rec=Array.from({length:12},(_,m)=>anosRec.reduce((s,a)=>s+CACHE.getReceitaMes(a, m, resp),0));
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

