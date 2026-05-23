"use strict";

Object.assign(APP, {
  // ============================================================
  // SALÁRIO
  // ============================================================
  renderSalario(){
    document.getElementById('salCards').innerHTML=CACHE.salarios.map(s=>{
      const hist=[...s.historico].sort((a,b)=>b.mesInicio-a.mesInicio);const atual=hist[0];
      const histRows=hist.map(h=>`<div class="hist-item"><span class="mes">A partir de ${MESES_F[h.mesInicio]}</span><span>${fmt(h.salario)}</span><span class="pos" style="font-weight:600">${fmt(h.liquido)}</span><button class="action-btn del" onclick="APP.deleteSalHist('${s.id}',${h.mesInicio})" style="width:20px;height:20px;font-size:10px">✕</button></div>`).join('');
      return`<div class="sal-card"><div class="sal-card-head"><h4>👤 ${s.nome} ${s.pessoa?`<span style="font-size:11px;background:rgba(255,255,255,.25);padding:2px 8px;border-radius:99px;font-family:var(--font-b);font-weight:600">${s.pessoa}</span>`:''}</h4><div style="display:flex;gap:5px"><button class="action-btn edit" onclick="APP.openSalario('${s.id}')" style="background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.3);color:#fff">✏</button><button class="action-btn del" onclick="APP.deletePessoa('${s.id}')" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.7)">✕</button></div></div><div class="sal-card-body"><div class="sal-row"><span>Nº Dependentes</span><span>${atual.deps}</span></div><div class="sal-row"><span>Salário Bruto</span><span>${fmt(atual.salario)}</span></div>${atual.bonificacao?`<div class="sal-row"><span>Bonificação</span><span>${fmt(atual.bonificacao)}</span></div>`:''}<div class="sal-row ded"><span>(-) INSS</span><span>${fmt(atual.inss)}</span></div><div class="sal-row ded"><span>(-) IR</span><span>${fmt(atual.ir)}</span></div><div class="sal-row total"><span>Salário Líquido</span><span>${fmt(atual.liquido)}</span></div></div>${hist.length>0?`<div class="sal-hist"><div class="sal-hist-toggle" onclick="this.nextElementSibling.classList.toggle('open')">📅 Histórico (${hist.length}) ▾</div><div class="sal-hist-body">${histRows}</div></div>`:''}</div>`;
    }).join('')||'<div style="color:var(--t4);padding:20px">Nenhuma pessoa cadastrada. Clique em "Novo Salário" para começar.</div>';

    const tab=CACHE.tabelas||DEFAULT_TABELAS;
    document.getElementById('vigenciaIR').textContent=`Vigência: ${tab.vigencia||'—'}`;
    document.getElementById('vigenciaINSS').textContent=`Vigência: ${tab.vigencia||'—'}`;
    document.getElementById('tblIR').innerHTML=`<thead><tr><th>De</th><th>Até</th><th>Alíquota</th><th>Ded.</th></tr></thead><tbody>${tab.ir.map(r=>`<tr><td>${fmt(r.de)}</td><td>${r.ate?fmt(r.ate):'+'}</td><td>${(r.al*100).toFixed(1)}%</td><td>${fmt(r.ded)}</td></tr>`).join('')}<tr style="border-top:2px solid var(--palm-lt)"><td colspan="2" style="color:var(--t4)">Por Dependente</td><td colspan="2" style="color:var(--yellow);font-weight:600">${fmt(tab.dedDep)}</td></tr></tbody>`;
    document.getElementById('tblINSS').innerHTML=`<thead><tr><th>De</th><th>Até</th><th>Alíquota</th><th>Ded.</th></tr></thead><tbody>${tab.inss.map(r=>`<tr><td>${fmt(r.de)}</td><td>${fmt(r.ate)}</td><td>${(r.al*100).toFixed(1)}%</td><td>${fmt(r.ded)}</td></tr>`).join('')}<tr style="border-top:2px solid var(--palm-lt)"><td colspan="2" style="color:var(--t4)">Teto INSS</td><td colspan="2" style="color:var(--yellow);font-weight:600">${fmt(tab.tetoINSS)}</td></tr></tbody>`;
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
        const h=s.historico[s.historico.length-1];
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
    document.getElementById('sNome').disabled=false;STATE.editSalPessoa=null;
  },

  async deleteSalHist(pessoaId,mes){
    const s=CACHE.salarios.find(x=>x.id===pessoaId);
    if(!s||s.historico.length<=1){this.toast('Mantenha ao menos um registro','error');return;}
    if(!confirm(`Remover salário de ${MESES_F[mes]}?`))return;
    const hist=s.historico.filter(h=>h.mesInicio!==mes);
    await FS.saveSalario(pessoaId,{...s,historico:hist});
    this.toast('Registro removido','success');
  },

  async deletePessoa(id){
    const s=CACHE.salarios.find(x=>x.id===id);
    if(!s||!confirm(`Excluir ${s.nome}?`))return;
    await FS.deleteSalario(id);this.toast('Excluído','success');
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

  async buscarTabelasOnline(){
    const btn=document.getElementById('btnBuscarOnline');const status=document.getElementById('atualizarStatus');
    btn.innerHTML='⏳ Buscando...';btn.disabled=true;
    status.innerHTML='<div style="background:var(--blue-lt);border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;font-size:12.5px;color:#1d4ed8">🌐 Consultando Receita Federal...</div>';
    try{
      const resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1500,tools:[{type:'web_search_20250305',name:'web_search'}],messages:[{role:'user',content:'Busque as tabelas vigentes 2025/2026 do IRPF e INSS Brasil. Retorne SOMENTE JSON: {"ir":[{"de":0,"ate":2259.20,"al":0,"ded":0}],"inss":[{"de":0,"ate":1518,"al":0.075,"ded":0}],"dedDep":189.59,"tetoINSS":908.86,"vigencia":"2025","fonte":"URL"}'}]})});
      const data=await resp.json();const text=data.content.map(b=>b.text||'').join('');
      const match=text.replace(/```json?|```/g,'').trim().match(/\{[\s\S]*\}/);
      if(!match)throw new Error('JSON não encontrado');
      const parsed=JSON.parse(match[0]);
      document.getElementById('editorIR').value=JSON.stringify(parsed.ir,null,2);
      document.getElementById('editorINSS').value=JSON.stringify(parsed.inss,null,2);
      setMoneyValue(document.getElementById('edDedDep'),parsed.dedDep||189.59);
      setMoneyValue(document.getElementById('edTetoINSS'),parsed.tetoINSS||908.86);
      document.getElementById('vigencia').value=parsed.vigencia||'2025';
      status.innerHTML=`<div style="background:var(--green-lt);border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;font-size:12.5px;color:var(--green)">✅ Encontrado! Revise e clique em Salvar.</div>`;
      document.getElementById('tabelasEditor').style.display='block';document.getElementById('btnSalvarTabelas').style.display='flex';
    }catch(e){
      status.innerHTML='<div style="background:var(--red-lt);border:1px solid #fecaca;border-radius:8px;padding:10px 14px;font-size:12.5px;color:var(--red)">⚠️ Não foi possível buscar. Use "Editar manualmente".</div>';
      document.getElementById('tabelasEditor').style.display='block';document.getElementById('btnSalvarTabelas').style.display='flex';
    }
    btn.innerHTML='🌐 Buscar nos sites oficiais';btn.disabled=false;
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

