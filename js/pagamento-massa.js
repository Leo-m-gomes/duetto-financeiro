"use strict";

Object.assign(APP, {

  _getSelecionadas(){
    return [...document.querySelectorAll('.chk-conta:checked')].map(chk=>({
      id:  chk.dataset.id,
      val: parseFloat(chk.dataset.val)||0,
    }));
  },

  atualizarBarraPagamento(){
    const selecionadas = this._getSelecionadas();
    const barra = document.getElementById('barraPagamento');
    const count = document.getElementById('barraCount');
    const total = document.getElementById('barraTotal');
    const chkAll = document.getElementById('chkSelectAll');

    if(!barra) return;

    if(selecionadas.length === 0){
      barra.style.display = 'none';
      if(chkAll) chkAll.indeterminate = false, chkAll.checked = false;
      return;
    }

    const totalVal = selecionadas.reduce((s,c)=>s+c.val, 0);
    count.textContent = `${selecionadas.length} conta${selecionadas.length>1?'s':''} selecionada${selecionadas.length>1?'s':''}`;
    total.textContent = `Total: ${fmt(totalVal)}`;
    barra.style.display = 'flex';

    // Atualiza estado do checkbox de selecionar todos
    const totalChks = document.querySelectorAll('.chk-conta').length;
    if(chkAll){
      chkAll.indeterminate = selecionadas.length > 0 && selecionadas.length < totalChks;
      chkAll.checked       = selecionadas.length === totalChks && totalChks > 0;
    }
  },

  toggleSelectAll(chk){
    const checked = chk.checked;
    document.querySelectorAll('.chk-conta').forEach(c=>{ c.checked = checked; });
    this.atualizarBarraPagamento();
  },

  limparSelecao(){
    document.querySelectorAll('.chk-conta').forEach(c=>{ c.checked = false; });
    const chkAll = document.getElementById('chkSelectAll');
    if(chkAll){ chkAll.checked = false; chkAll.indeterminate = false; }
    this.atualizarBarraPagamento();
  },

  abrirPagamentoMassa(){
    const selecionadas = this._getSelecionadas();
    if(!selecionadas.length){ this.toast('Selecione ao menos uma conta','error'); return; }

    // Modo de baixa das contas compartilhadas (Leo & Pri), congelado na abertura:
    //   filtro 'Leo'/'Pri'        → baixa apenas da parte do responsável filtrado
    //   filtro vazio/'Leo & Pri'  → baixa integral (as duas partes)
    const filtro = document.getElementById('filtroRespContas')?.value || '';
    const respParte = (filtro==='Leo'||filtro==='Pri') ? filtro : '';

    let temCompartilhada = false;

    // Monta tabela do modal com valores editáveis
    const tbody = document.getElementById('tbodyPagMassa');
    tbody.innerHTML = selecionadas.map(s=>{
      const c = CACHE.contas.find(x=>x.id===s.id);
      if(!c) return '';
      const catNome = CACHE.resolveCat(c.catId||c.cat);
      const isShared = c.resp==='Leo & Pri';
      // rowResp define a gravação: 'Leo'/'Pri' → pagarContaIndividual; '' → baixa integral
      let rowResp = '';
      if(isShared){
        temCompartilhada = true;
        if(respParte) rowResp = respParte;
        else if(!!c.pagamentos?.Leo !== !!c.pagamentos?.Pri) rowResp = c.pagamentos?.Leo ? 'Pri' : 'Leo';
      }
      const badge = isShared
        ? `<div style="font-size:10px;margin-top:2px;color:var(--t4)">${rowResp?`baixa da parte de <strong>${rowResp}</strong>`:'baixa integral (Leo e Pri)'}</div>`
        : '';
      return`<tr>
        <td style="max-width:200px;white-space:normal;font-weight:600">${c.conta}${c.parcela?`<br><span style="font-size:10px;color:var(--t4)">${c.parcela}</span>`:''}</td>
        <td>${c.resp}${badge}</td>
        <td><span class="badge bg-cat">${catNome}</span></td>
        <td style="color:var(--t4)">${fmt(s.val)}</td>
        <td><input type="text" inputmode="numeric" class="pag-massa-val money-input" data-id="${c.id}" data-pagresp="${rowResp}"
          value="${maskMoney(floatToCentsStr(s.val))}"
          oninput="APP.recalcularTotalMassa()"
          style="width:110px;padding:5px 8px;border:1px solid var(--border);border-radius:var(--r-sm);font-size:13px;text-align:right;background:var(--bg);color:var(--t1)"></td>
      </tr>`;
    }).join('');

    const aviso = document.getElementById('pagMassaAviso');
    if(aviso){
      if(temCompartilhada){
        aviso.style.display='block';
        aviso.textContent = respParte
          ? `Filtro "${respParte}" ativo: contas compartilhadas (Leo & Pri) terão baixa apenas da parte de ${respParte}.`
          : 'Sem filtro de responsável: contas compartilhadas (Leo & Pri) serão quitadas integralmente (as duas partes).';
      } else {
        aviso.style.display='none';
      }
    }

    this.recalcularTotalMassa();
    document.getElementById('ovPagMassa').classList.add('open');
    bindAllMoneyInputs(document.getElementById('ovPagMassa'));
  },

  recalcularTotalMassa(){
    const vals = [...document.querySelectorAll('.pag-massa-val')];
    const total = vals.reduce((s,el)=>s+parseMoney(el.value), 0);
    document.getElementById('pagMassaTotal').textContent = fmt(total);
  },

  async confirmarPagamentoMassa(){
    const btn = document.getElementById('btnConfirmarMassa');
    const inputs = [...document.querySelectorAll('.pag-massa-val')];
    if(!inputs.length){ this.toast('Nenhuma conta para pagar','error'); return; }

    // Validar valores
    for(const el of inputs){
      if(!parseMoney(el.value)||parseMoney(el.value)<=0){
        this.toast('Informe um valor válido para todas as contas','error');
        el.focus(); el.style.borderColor='var(--red)';
        return;
      }
    }

    const total = inputs.reduce((s,el)=>s+parseMoney(el.value),0);
    const n = inputs.length;
    if(!confirm(`Confirmar pagamento de ${n} conta${n>1?'s':''} totalizando ${fmt(total)}?`)) return;

    btn.disabled = true;
    btn.textContent = `⏳ Pagando 0 de ${n}...`;

    let ok = 0, erros = 0;
    for(const el of inputs){
      try{
        const valor   = parseMoney(el.value);
        const pagresp = el.dataset.pagresp || '';
        if(pagresp) await FS.pagarContaIndividual(el.dataset.id, pagresp, STATE.usuario, valor);
        else        await this._pagarContaAuto(el.dataset.id, valor);
        ok++;
        btn.textContent = `⏳ Pagando ${ok} de ${n}...`;
      } catch(e){ erros++; }
    }

    btn.disabled = false;
    btn.textContent = '✅ Confirmar todos';
    APP.closeModal('ovPagMassa');
    this.limparSelecao();

    if(erros)  this.toast(`${ok} pago${ok>1?'s':''}, ${erros} com erro`,'info');
    else       this.toast(`${ok} conta${ok>1?'s':''} paga${ok>1?'s':''} com sucesso ✅`,'success');
  },
});
