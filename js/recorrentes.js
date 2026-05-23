"use strict";

Object.assign(APP, {

  openRecorrentes(){
    // Popular selects de ano
    const anos = [...new Set(CACHE.contas.map(c=>new Date(c.data+'T12:00').getFullYear()))].sort((a,b)=>b-a);
    const anoAtual = new Date().getFullYear();

    const origemSel = document.getElementById('recAnoOrigem');
    const destSel   = document.getElementById('recAnoDestino');
    origemSel.innerHTML = anos.map(a=>`<option value="${a}" ${a===anoAtual?'selected':''}>${a}</option>`).join('');

    // Destino: anos futuros
    const anosDestino = [anoAtual, anoAtual+1, anoAtual+2];
    destSel.innerHTML = anosDestino.map(a=>`<option value="${a}" ${a===anoAtual+1?'selected':''}>${a}</option>`).join('');

    document.getElementById('ovRecorrentes').classList.add('open');
    this.recCarregarLista();
  },

  recCarregarLista(){
    const anoOrigem = parseInt(document.getElementById('recAnoOrigem').value);
    const lista = document.getElementById('recLista');
    const info  = document.getElementById('recInfo');

    // Buscar contas recorrentes do ano de origem (sem duplicatas por nome+mês)
    const recorrentes = CACHE.contas.filter(c=>{
      const d = new Date(c.data+'T12:00');
      return c.recorrente && d.getFullYear()===anoOrigem;
    });

    // Agrupar por nome — pegar a mais recente de cada nome
    const mapa = {};
    recorrentes.forEach(c=>{
      const key = c.conta.toLowerCase().trim();
      if(!mapa[key] || c.data > mapa[key].data) mapa[key] = c;
    });
    const unicas = Object.values(mapa).sort((a,b)=>a.conta.localeCompare(b.conta));

    if(!unicas.length){
      lista.innerHTML=`<div style="padding:24px;text-align:center;color:var(--t4)">Nenhuma conta marcada como recorrente em ${anoOrigem}.<br><small>Marque o campo "🔁 Conta recorrente" ao cadastrar ou editar.</small></div>`;
      if(info) info.textContent = '0 contas recorrentes encontradas.';
      return;
    }

    if(info) info.textContent = `${unicas.length} conta${unicas.length>1?'s recorrentes':'recorrente'} encontrada${unicas.length>1?'s':''} em ${anoOrigem}. Ajuste data e valor antes de gerar.`;

    lista.innerHTML = unicas.map(c=>{
      const catNome = CACHE.resolveCat(c.catId||c.cat);
      // Calcular data sugerida: mesmo dia/mês no ano destino
      const dOrig = new Date(c.data+'T12:00');
      const dSug  = `${document.getElementById('recAnoDestino').value}-${String(dOrig.getMonth()+1).padStart(2,'0')}-${String(dOrig.getDate()).padStart(2,'0')}`;
      return`<div class="rec-sel-item" onclick="APP.recToggleItem(this)">
        <input type="checkbox" class="rec-chk" data-id="${c.id}" data-conta='${JSON.stringify({conta:c.conta,resp:c.resp,formaId:c.formaId||'',catId:c.catId||'',nota:c.nota||'',parcela:'1 de 1',recorrente:true}).replace(/'/g,"&apos;")}' checked>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px;color:var(--t1)">${c.conta} <span class="badge-rec">🔁 REC</span></div>
          <div style="font-size:11px;color:var(--t4);margin-top:2px">${c.resp} · ${catNome}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0">
          <input type="date" class="rec-data" value="${dSug}" onclick="event.stopPropagation()" style="padding:4px 8px;border:1px solid var(--border);border-radius:var(--r-sm);font-size:12px;background:var(--bg)">
          <input type="text" inputmode="decimal" class="rec-val money-input" value="${fmtMoney(c.vPagar)}" onclick="event.stopPropagation()" style="padding:4px 8px;border:1px solid var(--border);border-radius:var(--r-sm);font-size:12px;width:100px;text-align:right;background:var(--bg)">
        </div>
      </div>`;
    }).join('');
    bindAllMoneyInputs(lista);
  },

  recToggleItem(el){
    const chk = el.querySelector('input[type=checkbox]');
    if(!chk) return;
    chk.checked = !chk.checked;
    el.classList.toggle('selected', chk.checked);
  },

  recSelecionarTodos(){
    document.querySelectorAll('.rec-chk').forEach(c=>{ c.checked=true; c.closest('.rec-sel-item').classList.add('selected'); });
  },
  recDeselecionarTodos(){
    document.querySelectorAll('.rec-chk').forEach(c=>{ c.checked=false; c.closest('.rec-sel-item').classList.remove('selected'); });
  },

  async recGerarContas(){
    const itens = [...document.querySelectorAll('.rec-sel-item')];
    const selecionados = itens.filter(el=>el.querySelector('.rec-chk')?.checked);
    if(!selecionados.length){ this.toast('Selecione ao menos uma conta','error'); return; }

    const anoDestino = parseInt(document.getElementById('recAnoDestino').value);

    if(!confirm(`Gerar ${selecionados.length} conta${selecionados.length>1?'s':''} para ${anoDestino}?`)) return;

    let geradas = 0, erros = 0;
    for(const el of selecionados){
      try{
        const chk   = el.querySelector('.rec-chk');
        const base  = JSON.parse(chk.dataset.conta.replace(/&apos;/g,"'"));
        const data  = el.querySelector('.rec-data')?.value;
        const valor = parseMoney(el.querySelector('.rec-val')?.value);
        if(!data || !valor){ erros++; continue; }
        await FS.addConta({
          ...base,
          data, vPagar:valor, vPago:null,
          grupo:`grp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
          createdBy:STATE.usuario,
        });
        geradas++;
        await new Promise(r=>setTimeout(r,50)); // evitar rate-limit
      }catch(e){ erros++; }
    }

    APP.closeModal('ovRecorrentes');
    if(erros) this.toast(`${geradas} gerada${geradas!==1?'s':''}, ${erros} com erro`,'info');
    else      this.toast(`${geradas} conta${geradas!==1?'s':''} gerada${geradas!==1?'s':''} para ${anoDestino} ✅`,'success');
  },
});
