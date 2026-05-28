"use strict";

Object.assign(APP, {
  // ============================================================
  // SALÁRIO
  // ============================================================
  renderSalario(){
    document.getElementById('salCards').innerHTML=CACHE.salarios.map(s=>{
      const hist=[...s.historico].sort((a,b)=>b.mesInicio-a.mesInicio);const atual=hist[0];
      const histRows=hist.map(h=>`<div class="hist-item"><span class="mes">A partir de ${MESES_F[h.mesInicio]}</span><span>${fmt(h.salario)}</span><span class="pos" style="font-weight:600">${fmt(h.liquido)}</span><button class="action-btn del" onclick="APP.deleteSalHist('${s.id}',${h.mesInicio})" style="width:20px;height:20px;font-size:10px">✕</button></div>`).join('');
      return`<div class="sal-card"><div class="sal-card-head"><h4>👤 ${s.nome} ${s.pessoa?`<span style="font-size:11px;background:rgba(255,255,255,.25);padding:2px 8px;border-radius:99px;font-family:var(--font-b);font-weight:600">${s.pessoa}</span>`:''}</h4><div style="display:flex;gap:5px"><button class="action-btn edit" onclick="APP.openSalario('${s.id}')" style="background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.3);color:#fff">✏</button><button class="action-btn del" onclick="APP.deletePessoa('${s.id}')" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.7)">✕</button></div></div><div class="sal-card-body"><div class="sal-row"><span>Nº Dependentes</span><span>${atual.deps}</span></div><div class="sal-row"><span>Salário Bruto</span><span>${fmt(atual.salario)}</span></div>${atual.bonificacao?`<div class="sal-row"><span>Bonificação</span><span>${fmt(atual.bonificacao)}</span></div>`:''}<div class="sal-row ded" style="cursor:pointer" onclick="APP.openCalculoDetalhe('${s.id}')" title="Ver cálculo"><span>(-) INSS</span><span>${fmt(atual.inss)}</span></div><div class="sal-row ded" style="cursor:pointer" onclick="APP.openCalculoDetalhe('${s.id}')" title="Ver cálculo"><span>(-) IR</span><span>${fmt(atual.ir)}</span></div><div class="sal-row total"><span>Salário Líquido</span><span>${fmt(atual.liquido)}</span></div><div style="text-align:center;padding:6px 0 2px"><a href="#" onclick="event.preventDefault();APP.openCalculoDetalhe('${s.id}')" style="font-size:11px;color:var(--blue);text-decoration:none;font-weight:600">📊 Ver cálculo detalhado</a></div></div>${hist.length>0?`<div class="sal-hist"><div class="sal-hist-toggle" onclick="this.nextElementSibling.classList.toggle('open')">📅 Histórico (${hist.length}) ▾</div><div class="sal-hist-body">${histRows}</div></div>`:''}</div>`;
    }).join('')||'<div style="color:var(--t4);padding:20px">Nenhuma pessoa cadastrada. Clique em "Novo Salário" para começar.</div>';

  },

  openSalariosModal(){
    this.renderSalario();
    document.getElementById('ovSalarios').classList.add('open');
  },

  closeSalariosModal(){
    APP.closeModal('ovSalarios');
    if(STATE.page === 'receitas') APP.renderReceitas();
  },

  openSalario(pessoaId=null){
    STATE.editSalPessoa=pessoaId;
    document.getElementById('titleSal').textContent=pessoaId?'Atualizar Salário':'Novo Salário';
    ['sNome','sSal','sBon','sINSS','sIR','sLiq','sPessoa'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('sDeps').value=0;document.getElementById('sBon').value=0;
    document.getElementById('sMesInicio').value=new Date().getMonth();
    document.getElementById('sNome').disabled=false;
    if(pessoaId){
      const s=CACHE.salarios.find(x=>x.id===pessoaId);
      if(s){
        document.getElementById('sNome').value=s.nome;
        document.getElementById('sNome').disabled=true;
        if(document.getElementById('sPessoa'))document.getElementById('sPessoa').value=s.pessoa||'';
        const h=[...s.historico].sort((a,b)=>b.mesInicio-a.mesInicio)[0];
        setMoneyValue(document.getElementById('sSal'),h.salario);
        setMoneyValue(document.getElementById('sBon'),h.bonificacao);
        document.getElementById('sDeps').value=h.deps||0;
        this.calcSalario();
      }
    }
    document.getElementById('ovSalario').classList.add('open');
    bindAllMoneyInputs(document.getElementById('ovSalario'));
    setTimeout(()=>document.getElementById('sSal').focus(),100);
  },

  calcSalario(){
    const sal=parseMoney(document.getElementById('sSal').value);
    const bon=parseMoney(document.getElementById('sBon').value);
    const dep=parseInt(document.getElementById('sDeps').value)||0;
    const total=sal+bon;const inss=CACHE.calcINSS(total);const ir=CACHE.calcIR(total,inss,dep);
    const liq=parseFloat((total-inss-ir).toFixed(2));
    document.getElementById('sINSS').value=fmtMoney(inss);
    document.getElementById('sIR').value=fmtMoney(ir);
    document.getElementById('sLiq').value=fmtMoney(liq);
  },

  async saveSalario(){
    const nome=document.getElementById('sNome').value.trim();
    const pessoa=document.getElementById('sPessoa')?.value||'';
    const sal=parseMoney(document.getElementById('sSal').value);
    const bon=parseMoney(document.getElementById('sBon').value);
    const deps=parseInt(document.getElementById('sDeps').value)||0;
    const mes=parseInt(document.getElementById('sMesInicio').value);
    if(!sal)return this.toast('Informe o salário','error');
    const inss=CACHE.calcINSS(sal+bon);const ir=CACHE.calcIR(sal+bon,inss,deps);
    const liq=parseFloat((sal+bon-inss-ir).toFixed(2));
    const histEntry={mesInicio:mes,deps,salario:sal,bonificacao:bon,inss,ir,liquido:liq,updatedBy:STATE.usuario,updatedAt:today()};

    if(STATE.editSalPessoa){
      const s=CACHE.salarios.find(x=>x.id===STATE.editSalPessoa);
      if(s){
        const hist=s.historico.filter(h=>h.mesInicio!==mes);hist.push(histEntry);hist.sort((a,b)=>a.mesInicio-b.mesInicio);
        await FS.saveSalario(STATE.editSalPessoa,{...s,historico:hist,pessoa:pessoa||s.pessoa});
        this.toast(`Salário atualizado a partir de ${MESES_F[mes]}`,'success');
      }
    } else {
      if(!nome)return this.toast('Nome é obrigatório','error');
      if(!pessoa)return this.toast('Selecione a pessoa','error');
      await fbDb.collection('salarios').add({nome,pessoa,historico:[histEntry],createdBy:STATE.usuario});
      this.toast(`${nome} cadastrado!`,'success');
    }
    APP.closeModal('ovSalario');
    this.renderSalario();
    document.getElementById('sNome').disabled=false;STATE.editSalPessoa=null;
  },

  async deleteSalHist(pessoaId,mes){
    const s=CACHE.salarios.find(x=>x.id===pessoaId);
    if(!s||s.historico.length<=1){this.toast('Mantenha ao menos um registro','error');return;}
    if(!confirm(`Remover salário de ${MESES_F[mes]}?`))return;
    const hist=s.historico.filter(h=>h.mesInicio!==mes);
    await FS.saveSalario(pessoaId,{...s,historico:hist});
    this.toast('Registro removido','success');
    this.renderSalario();
  },

  async deletePessoa(id){
    const s=CACHE.salarios.find(x=>x.id===id);
    if(!s||!confirm(`Excluir ${s.nome}?`))return;
    await FS.deleteSalario(id);this.toast('Excluído','success');
    this.renderSalario();
  },

  // ── CÁLCULO DETALHADO ──
  _findFaixa(tabela, valor){
    for(let i = tabela.length - 1; i >= 0; i--){
      if(valor >= tabela[i].de) return tabela[i];
    }
    return tabela[0];
  },

  openCalculoDetalhe(pessoaId){
    const s = CACHE.salarios.find(x => x.id === pessoaId);
    if(!s) return;
    const h = [...s.historico].sort((a,b) => b.mesInicio - a.mesInicio)[0];
    if(!h) return;

    const tab = CACHE.tabelas || DEFAULT_TABELAS;
    const bruto = h.salario || 0;
    const bon = h.bonificacao || 0;
    const base = bruto + bon;
    const deps = h.deps || 0;

    // INSS
    const fxI = this._findFaixa(tab.inss, base);
    const inssRaw = parseFloat((base * fxI.al - fxI.ded).toFixed(2));
    const usouTeto = inssRaw > tab.tetoINSS;
    const inss = usouTeto ? tab.tetoINSS : inssRaw;
    const efINSS = base > 0 ? (inss / base * 100).toFixed(1) : '0.0';

    // IR
    const dedDeps = deps * tab.dedDep;
    const baseIR = Math.max(0, parseFloat((base - inss - dedDeps).toFixed(2)));
    const fxR = this._findFaixa(tab.ir, baseIR);
    const ir = Math.max(0, parseFloat((baseIR * fxR.al - fxR.ded).toFixed(2)));
    const efIR = base > 0 ? (ir / base * 100).toFixed(1) : '0.0';
    const liq = parseFloat((base - inss - ir).toFixed(2));

    // Helpers de template
    const box = t => '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12.5px;color:var(--t2);line-height:1.8;font-family:Menlo,Monaco,Consolas,monospace;margin-bottom:8px;word-break:break-word">'+t+'</div>';
    const row = (l,v,st) => '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;'+(st||'')+'"><span style="color:var(--t3)">'+l+'</span><span style="font-weight:600">'+v+'</span></div>';
    const sub = (i,t) => '<div style="font-size:12px;font-weight:700;color:var(--palm);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">'+i+' '+t+'</div>';
    const ef  = t => '<div style="font-size:11px;color:var(--t4);padding:2px 0;margin-bottom:4px">'+t+'</div>';
    const fmtAte = v => v != null ? fmt(v) : '+';

    let html = '';

    // ── Remuneração ──
    html += '<div style="margin-bottom:20px">';
    html += '<div style="font-size:16px;font-weight:700;color:var(--t1);margin-bottom:12px;font-family:var(--font-d)">👤 '+s.nome+' <span style="font-size:12px;color:var(--t4);font-weight:500">'+(s.pessoa||'')+'</span></div>';
    html += row('Salário Bruto', fmt(bruto));
    if(bon) html += row('Bonificação', fmt(bon));
    if(bon) html += row('<strong>Base de cálculo</strong>', '<strong>'+fmt(base)+'</strong>', 'border-bottom:2px solid var(--palm-lt)');
    if(deps > 0) html += row('Dependentes', deps+' × '+fmt(tab.dedDep)+' = '+fmt(dedDeps));
    html += '</div>';

    // ── INSS ──
    html += '<div style="margin-bottom:20px">';
    html += sub('📊','INSS');
    if(usouTeto){
      html += box(
        'Faixa: '+(fxI.al*100).toFixed(1)+'% ('+fmt(fxI.de)+' – '+fmtAte(fxI.ate)+')<br>'+
        fmt(base)+' × '+(fxI.al*100).toFixed(1)+'% − '+fmt(fxI.ded)+' = '+fmt(inssRaw)+'<br>'+
        '<strong style="color:var(--yellow)">⚠ Teto INSS aplicado: '+fmt(tab.tetoINSS)+'</strong>'
      );
    } else {
      html += box(
        'Faixa: '+(fxI.al*100).toFixed(1)+'% ('+fmt(fxI.de)+' – '+fmtAte(fxI.ate)+')<br>'+
        fmt(base)+' × '+(fxI.al*100).toFixed(1)+'% − '+fmt(fxI.ded)+' = <strong>'+fmt(inss)+'</strong>'
      );
    }
    html += row('(-) INSS', fmt(inss), 'color:var(--red)');
    html += ef('Alíquota efetiva: <strong>'+efINSS+'%</strong>');
    html += '</div>';

    // ── IR ──
    html += '<div style="margin-bottom:20px">';
    html += sub('📊','Imposto de Renda');
    let irTxt = '';
    if(deps > 0) irTxt += 'Dependentes: '+deps+' × '+fmt(tab.dedDep)+' = '+fmt(dedDeps)+'<br>';
    irTxt += 'Base IR = '+fmt(base)+' − '+fmt(inss);
    if(deps > 0) irTxt += ' − '+fmt(dedDeps);
    irTxt += ' = <strong>'+fmt(baseIR)+'</strong>';
    if(fxR.al > 0){
      irTxt += '<br><br>Faixa: '+(fxR.al*100).toFixed(1)+'% ('+fmt(fxR.de)+' – '+fmtAte(fxR.ate)+')';
      irTxt += '<br>'+fmt(baseIR)+' × '+(fxR.al*100).toFixed(1)+'% − '+fmt(fxR.ded)+' = <strong>'+fmt(ir)+'</strong>';
    } else {
      irTxt += '<br><br><strong style="color:var(--green)">Isento de IR</strong>';
    }
    html += box(irTxt);
    html += row('(-) IR', fmt(ir), 'color:var(--red)');
    html += ef('Alíquota efetiva: <strong>'+efIR+'%</strong>');
    html += '</div>';

    // ── Líquido ──
    html += '<div style="background:var(--palm-lt);border:1px solid #c6e8d4;border-radius:10px;padding:16px">';
    html += '<div style="font-size:12.5px;color:var(--t3);line-height:1.8;font-family:Menlo,Monaco,Consolas,monospace;margin-bottom:10px;word-break:break-word">';
    html += 'Líquido = '+fmt(base)+' − '+fmt(inss)+' − '+fmt(ir)+' = <strong style="color:var(--palm);font-size:14px">'+fmt(liq)+'</strong>';
    html += '</div>';
    html += '<div style="display:flex;justify-content:space-between;padding:8px 0 0;font-size:16px;font-weight:700;color:var(--palm);border-top:1px solid #c6e8d4">';
    html += '<span>💰 Salário Líquido</span><span>'+fmt(liq)+'</span></div>';
    html += '</div>';

    document.getElementById('titleCalcDetalhe').textContent = 'Cálculo — ' + s.nome;
    document.getElementById('calcContent').innerHTML = html;
    document.getElementById('ovCalculoDetalhe').classList.add('open');
  },

  // ── TABELAS FISCAIS ──
  openTabelas(){
    const tab=CACHE.tabelas||DEFAULT_TABELAS;
    document.getElementById('tabelasEditor').style.display='none';
    document.getElementById('btnSalvarTabelas').style.display='none';
    document.getElementById('atualizarStatus').innerHTML='';
    document.getElementById('editorIR').value=JSON.stringify(tab.ir,null,2);
    document.getElementById('editorINSS').value=JSON.stringify(tab.inss,null,2);
    setMoneyValue(document.getElementById('edDedDep'),tab.dedDep);
    setMoneyValue(document.getElementById('edTetoINSS'),tab.tetoINSS);
    document.getElementById('vigencia').value=tab.vigencia||'';
    document.getElementById('ovTabelas').classList.add('open');
    bindAllMoneyInputs(document.getElementById('ovTabelas'));
  },

  buscarTabelasOnline(){
    const status=document.getElementById('atualizarStatus');
    status.innerHTML='<div style="background:var(--blue-lt);border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;font-size:12.5px;color:#1d4ed8">Consulte os valores vigentes em <a href="https://www.gov.br/receitafederal" target="_blank" rel="noopener">gov.br/receitafederal</a> e edite manualmente abaixo.</div>';
    document.getElementById('tabelasEditor').style.display='block';
    document.getElementById('btnSalvarTabelas').style.display='flex';
  },

  async salvarTabelas(){
    try{
      const ir=JSON.parse(document.getElementById('editorIR').value);
      const inss=JSON.parse(document.getElementById('editorINSS').value);
      const dedDep=parseMoney(document.getElementById('edDedDep').value)||189.59;
      const tetoINSS=parseMoney(document.getElementById('edTetoINSS').value)||908.86;
      const vigencia=document.getElementById('vigencia').value;
      await FS.saveTabelas({ir,inss,dedDep,tetoINSS,vigencia});
      APP.closeModal('ovTabelas');
      this.toast('Tabelas fiscais atualizadas! ✅','success');
    }catch(e){this.toast('JSON inválido. Verifique o formato.','error');}
  },

});

