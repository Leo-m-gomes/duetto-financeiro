/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO duplicatas.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade: detectar contas possivelmente repetidas e comunicar ao
 * usuário, que decide se é ou não duplicata. O sistema NUNCA bloqueia sozinho.
 *
 * Usado por: cadastro manual (contas.js), upload (upload.js),
 *            gerar recorrentes (recorrentes.js).
 *
 * IDENTIDADE (chave): descrição normalizada + responsável + forma de pagamento.
 *   A forma entra porque contas homônimas de cartões diferentes não são
 *   duplicatas entre si.
 *
 * NÍVEIS:
 *   'provavel' : forte indício. Pré-desmarcado / exige confirmação.
 *   'possivel' : indício fraco. Apenas aviso; usuário confere.
 *
 * REGRAS (entre contas com a mesma chave):
 *   1. Ambas com data de compra (cartão):
 *      • compra diferente           → compras distintas, ignora
 *      • mesma compra, parcela diferente → parcelas distintas, ignora
 *      • mesma compra e parcela, valor similar   → provável
 *      • mesma compra e parcela, valor diferente → possível
 *   2. Sem data de compra em alguma delas (vencimento):
 *      • mês de vencimento diferente → ignora
 *      • mesmo vencimento, valor similar   → provável
 *      • mesmo vencimento, valor diferente → possível (ex.: reajuste)
 *      • mesmo mês, outro dia              → possível
 *
 * VALOR SIMILAR: diferença de até TOLERANCIA (10%) do maior valor.
 *   Comparação feita em centavos inteiros para evitar erro de ponto flutuante.
 *
 * EXPORTS GLOBAIS:
 *   window.DUP
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

const DUP = {

  TOLERANCIA: 0.10,

  _norm(s){
    return String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,' ').trim();
  },

  /** Nome da forma de pagamento, aceitando id, nome legado ou campo `forma`. */
  _formaNome(c){
    return CACHE.resolveForma(c.formaId||c.forma)||c.forma||'';
  },

  chave(c){
    return [this._norm(c.conta), c.resp||'', this._norm(this._formaNome(c))].join('|');
  },

  _centavos(v){ return Math.round((Number(v)||0)*100); },

  valorSimilar(a, b){
    const ca=this._centavos(a), cb=this._centavos(b);
    const maior=Math.max(ca, cb);
    if(!maior) return ca===cb;
    return Math.abs(ca-cb) <= Math.round(maior*this.TOLERANCIA);
  },

  /** Parcela normalizada ("3 de 12" → "3/12"); vazio e "1 de 1" equivalem. */
  _parcela(p){
    const m=String(p||'').match(/(\d+)\s*(?:de|\/)\s*(\d+)/i);
    if(!m) return '1/1';
    return `${parseInt(m[1])}/${parseInt(m[2])}`;
  },

  /**
   * Compara um candidato com uma conta existente de mesma chave.
   * @returns {{nivel:'provavel'|'possivel', motivo:string}|null}
   */
  _comparar(cand, c){
    if(!cand.data || !c.data) return null;
    const sim = this.valorSimilar(cand.vPagar, c.vPagar);

    if(cand.dataCompra && c.dataCompra){
      if(cand.dataCompra !== c.dataCompra) return null;
      if(this._parcela(cand.parcela) !== this._parcela(c.parcela)) return null;
      return sim
        ? {nivel:'provavel', motivo:`mesma compra em ${fmtDate(c.dataCompra)}, mesma parcela e valor semelhante`}
        : {nivel:'possivel', motivo:`mesma compra em ${fmtDate(c.dataCompra)} e parcela, valor diferente`};
    }

    if(cand.data.slice(0,7) !== c.data.slice(0,7)) return null;
    if(cand.data === c.data){
      return sim
        ? {nivel:'provavel', motivo:'mesmo vencimento e valor semelhante'}
        : {nivel:'possivel', motivo:'mesmo vencimento, valor diferente'};
    }
    return {nivel:'possivel', motivo:'lançamento no mesmo mês, em outro dia'};
  },

  /**
   * Procura possíveis duplicatas de `cand` em `base` (default: CACHE.contas).
   * @param {object} cand  {conta, resp, formaId|forma, data, vPagar, parcela?, dataCompra?}
   * @param {object} [opts]
   * @param {object[]} [opts.base]      lista onde procurar
   * @param {string}   [opts.ignorarId] id a desconsiderar (edição)
   * @returns {{conta:object, nivel:string, motivo:string}[]} prováveis primeiro
   */
  buscar(cand, opts={}){
    const base  = opts.base || CACHE.contas;
    const chave = this.chave(cand);
    const achados = [];
    base.forEach(c=>{
      if(opts.ignorarId && c.id===opts.ignorarId) return;
      if(this.chave(c)!==chave) return;
      const r=this._comparar(cand, c);
      if(r) achados.push({conta:c, ...r});
    });
    return achados.sort((a,b)=>(a.nivel==='provavel'?0:1)-(b.nivel==='provavel'?0:1));
  },

  nivel(achados){
    if(!achados.length) return null;
    return achados.some(a=>a.nivel==='provavel') ? 'provavel' : 'possivel';
  },

  _esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  },

  /** Texto curto para badges/avisos inline. */
  resumo(achados){
    if(!achados.length) return '';
    const a=achados[0];
    const ic=a.nivel==='provavel'?'⚠️ Provável duplicata':'ℹ️ Possível duplicata';
    const extra=achados.length>1?` (+${achados.length-1})`:'';
    return `${ic}: ${a.motivo}; existente em ${fmtDate(a.conta.data)}, ${fmt(a.conta.vPagar)}${extra}`;
  },

  /**
   * Modal de decisão. Lista candidatos e contas encontradas; o usuário decide.
   * @param {{titulo:string, itens:{candidato:object, achados:object[]}[], btnSim?:string}} cfg
   * @returns {Promise<boolean>} true = prosseguir mesmo assim
   */
  confirmar(cfg){
    return new Promise(resolve=>{
      const ov=document.getElementById('ovDuplicatas');
      if(!ov){
        // Fallback se o modal não estiver no DOM
        const txt=cfg.itens.map(i=>`• ${i.candidato.conta}: ${this.resumo(i.achados)}`).join('\n');
        return resolve(confirm(`${cfg.titulo}\n\n${txt}\n\nProsseguir mesmo assim?`));
      }
      document.getElementById('dupTitulo').textContent=cfg.titulo;
      const linha=(c,extra)=>`<tr>
          <td>${this._esc(c.conta)}${extra||''}</td><td>${this._esc(c.resp)}</td><td>${this._esc(this._formaNome(c))}</td>
          <td>${fmtDate(c.data)}</td><td>${c.dataCompra?fmtDate(c.dataCompra):'—'}</td>
          <td>${this._esc(c.parcela||'1 de 1')}</td><td class="money">${fmt(c.vPagar)}</td></tr>`;
      document.getElementById('dupCorpo').innerHTML=cfg.itens.map(i=>`
        <div class="dup-bloco">
          <div class="dup-bloco-tit">Nova: <strong>${this._esc(i.candidato.conta)}</strong></div>
          <table class="dup-tab"><thead><tr><th>Descrição</th><th>Resp.</th><th>Forma</th><th>Vencimento</th><th>Compra</th><th>Parcela</th><th>Valor</th></tr></thead><tbody>
            ${linha(i.candidato,' <span class="badge bg-cat">nova</span>')}
            ${i.achados.map(a=>linha(a.conta,` <span class="badge ${a.nivel==='provavel'?'bg-atr':'bg-pend'}">${a.nivel==='provavel'?'provável':'possível'}</span><div class="dup-motivo">${this._esc(a.motivo)}</div>`)).join('')}
          </tbody></table>
        </div>`).join('');
      const btnSim=document.getElementById('dupBtnSim'), btnNao=document.getElementById('dupBtnNao');
      btnSim.textContent=cfg.btnSim||'Não é duplicata, cadastrar';
      const fechar=val=>{
        ov.classList.remove('open');
        btnSim.onclick=btnNao.onclick=null;
        ov.querySelectorAll('[data-dup-close]').forEach(b=>b.onclick=null);
        ov._aoFecharNoFundo=null;
        resolve(val);
      };
      btnSim.onclick=()=>fechar(true);
      btnNao.onclick=()=>fechar(false);
      ov.querySelectorAll('[data-dup-close]').forEach(b=>b.onclick=()=>fechar(false));
      // Clique no fundo = "não cadastrar". Antes o fundo só escondia o modal e a gravação
      // ficava esperando uma resposta que nunca vinha (botão Salvar travado em carregamento).
      ov._aoFecharNoFundo=()=>fechar(false);
      ov.classList.add('open');
    });
  },
};

window.DUP = DUP;
