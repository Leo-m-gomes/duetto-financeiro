"use strict";

Object.assign(APP, {

  // ── DETECÇÃO DE DUPLICATAS ──
  // Identidade de uma conta recorrente: descrição normalizada + responsável +
  // forma de pagamento. A forma entra na chave porque contas de cartões
  // diferentes podem ter o mesmo nome e o mesmo vencimento (ex.: "Netflix"
  // no Itaú e no Nubank) e NÃO são duplicatas entre si.
  _recNorm(s){
    return String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,' ').trim();
  },
  _recChave(c){
    return [this._recNorm(c.conta), c.resp||'', this._recNorm(CACHE.resolveForma(c.formaId||c.forma))].join('|');
  },

  /**
   * Procura no banco contas com a mesma chave (descrição + responsável + forma).
   * @param {object} base   dados da recorrente (conta, resp, formaId)
   * @param {string} data   vencimento proposto YYYY-MM-DD
   * @returns {{exata:object|null, mesmoMes:object[]}}
   *   exata    : mesma chave E mesmo vencimento, considerada duplicata
   *   mesmoMes : mesma chave no mesmo mês com outro dia (apenas aviso)
   */
  _recBuscarExistentes(base, data){
    if(!data) return {exata:null, mesmoMes:[]};
    const chave = this._recChave(base);
    const mes   = data.slice(0,7);
    const iguais = CACHE.contas.filter(c=>c.data&&c.data.slice(0,7)===mes&&this._recChave(c)===chave);
    return {
      exata:    iguais.find(c=>c.data===data)||null,
      mesmoMes: iguais.filter(c=>c.data!==data),
    };
  },

  /** Atualiza aviso e checkbox de um item conforme a data proposta. */
  _recValidarItem(el, preservarSelecao){
    const chk  = el.querySelector('.rec-chk');
    const base = JSON.parse(chk.dataset.conta.replace(/&apos;/g,"'"));
    const data = el.querySelector('.rec-data')?.value;
    const {exata, mesmoMes} = this._recBuscarExistentes(base, data);
    const aviso = el.querySelector('.rec-aviso');
    el.dataset.duplicada = exata ? '1' : '';
    if(exata){
      aviso.innerHTML = `⚠️ Já existe em ${fmtDate(exata.data)} (${fmt(exata.vPagar)}); desmarcada para não duplicar`;
      aviso.style.color = 'var(--orange)';
      aviso.style.display = 'block';
      if(!preservarSelecao){ chk.checked=false; el.classList.remove('selected'); }
    } else if(mesmoMes.length){
      aviso.innerHTML = `ℹ️ Já há lançamento neste mês em ${mesmoMes.map(c=>fmtDate(c.data)).join(', ')}; confira antes de gerar`;
      aviso.style.color = 'var(--t3)';
      aviso.style.display = 'block';
    } else {
      aviso.innerHTML = '';
      aviso.style.display = 'none';
    }
  },

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

    // Agrupar por descrição + responsável + forma (mesma chave da detecção de
    // duplicatas) e pegar a mais recente. Agrupar só pelo nome fundia contas
    // homônimas de cartões diferentes, e uma delas sumia da geração.
    const mapa = {};
    recorrentes.forEach(c=>{
      const key = this._recChave(c);
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
      return`<div class="rec-sel-item selected" onclick="APP.recToggleItem(this)">
        <input type="checkbox" class="rec-chk" data-id="${c.id}" data-conta='${JSON.stringify({conta:c.conta,resp:c.resp,formaId:c.formaId||'',catId:c.catId||'',nota:c.nota||'',parcela:'1 de 1',recorrente:true}).replace(/'/g,"&apos;")}' checked>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px;color:var(--t1)">${c.conta} <span class="badge-rec">🔁 REC</span></div>
          <div style="font-size:11px;color:var(--t4);margin-top:2px">${c.resp} · ${CACHE.resolveForma(c.formaId||c.forma)} · ${catNome}</div>
          <div class="rec-aviso" style="display:none;font-size:11px;margin-top:4px;font-weight:600"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0">
          <input type="date" class="rec-data" value="${dSug}" onclick="event.stopPropagation()" onchange="APP._recValidarItem(this.closest('.rec-sel-item'))" style="padding:4px 8px;border:1px solid var(--border);border-radius:var(--r-sm);font-size:12px;background:var(--bg)">
          <input type="text" inputmode="numeric" class="rec-val money-input" value="${maskMoney(floatToCentsStr(c.vPagar))}" onclick="event.stopPropagation()" style="padding:4px 8px;border:1px solid var(--border);border-radius:var(--r-sm);font-size:12px;width:100px;text-align:right;background:var(--bg)">
        </div>
      </div>`;
    }).join('');
    bindAllMoneyInputs(lista);

    const itens = [...lista.querySelectorAll('.rec-sel-item')];
    itens.forEach(el=>this._recValidarItem(el));
    const dups = itens.filter(el=>el.dataset.duplicada).length;
    if(info && dups) info.textContent += ` ${dups} já existe${dups>1?'m':''} no destino com o mesmo vencimento e ${dups>1?'foram desmarcadas':'foi desmarcada'}.`;
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

    // Revalida no momento do clique (o CACHE pode ter mudado desde a abertura)
    selecionados.forEach(el=>this._recValidarItem(el, true));
    const dups = selecionados.filter(el=>el.dataset.duplicada);
    if(dups.length){
      const nomes = dups.slice(0,5).map(el=>'• '+JSON.parse(el.querySelector('.rec-chk').dataset.conta.replace(/&apos;/g,"'")).conta).join('\n');
      if(!confirm(`${dups.length} conta(s) selecionada(s) já existem com o mesmo vencimento:\n${nomes}${dups.length>5?'\n…':''}\n\nGerar mesmo assim (ficarão duplicadas)?`)) return;
    } else if(!confirm(`Gerar ${selecionados.length} conta${selecionados.length>1?'s':''} para ${anoDestino}?`)) return;

    let geradas = 0, erros = 0, ignoradas = 0;
    for(const el of selecionados){
      try{
        const chk   = el.querySelector('.rec-chk');
        const base  = JSON.parse(chk.dataset.conta.replace(/&apos;/g,"'"));
        const data  = el.querySelector('.rec-data')?.value;
        const valor = parseMoney(el.querySelector('.rec-val')?.value);
        if(!data || !valor){ erros++; continue; }
        // Proteção contra duplo clique: a 1ª geração entra no CACHE via onSnapshot
        if(!el.dataset.duplicada && this._recBuscarExistentes(base, data).exata){ ignoradas++; continue; }
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
    if(erros||ignoradas) this.toast(`${geradas} gerada${geradas!==1?'s':''}${ignoradas?`, ${ignoradas} já existia${ignoradas>1?'m':''}`:''}${erros?`, ${erros} com erro`:''}`,'info');
    else      this.toast(`${geradas} conta${geradas!==1?'s':''} gerada${geradas!==1?'s':''} para ${anoDestino} ✅`,'success');
  },
});
