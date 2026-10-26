/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO divisao.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Divisão das contas compartilhadas ("Leo & Pri"), README 8.3. Só interface: a regra e o
 * cálculo (centésimos de %, Leo arredondado em centavos, Pri = resto) ficam em fin-state.js
 * e a gravação/trava em fin-db.js (FS.addConta, FS.updateConta).
 *
 *   • DivRegua: régua verde (Leo) e rosa (Pri) com divisor arrastável, campo "Sua parte"
 *     (só quem está logado digita; a outra parte é o restante), atalhos e "Pela renda".
 *   • Modal da conta: responsável em botões com foto. Ao escolher Leo & Pri a régua abre;
 *     depois da escolha recolhe numa linha de resumo (Ajustar reabre). Conta com pagamento:
 *     linha com cadeado, não abre.
 *   • Gerenciar Parcelamento: coluna "Sua parte" e botão "➗ Divisão" (aplica a todas as
 *     parcelas compartilhadas sem pagamento; grava no Salvar).
 *   • Listas: selo com a parte da pessoa filtrada (60%) e mini barra no responsável.
 *
 * DEPENDÊNCIAS: fin-state (DIV_*, divLeo, divValida, montarDivisao, parteCent, fmtPct,
 *   fmtDivisao, temPagamento, fmt), fin-cache (CACHE.salarios, getSalarioVigente),
 *   ui-money (moneyCents), avatares (APP.aplicarAvatares), ui-toast (APP.toast).
 * IMPORTAÇÃO: depois de contas.js.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

const DIV_ATALHOS = [30, 40, 50, 60, 70];   // atalhos da "sua parte", em %

/**
 * Régua de divisão montada dentro de `host`. O valor é sempre a parte do Leo
 * (centésimos de %); o "editor" (quem está logado) digita a própria parte.
 */
class DivRegua {
  /**
   * @param {HTMLElement} host
   * @param {Object}   o
   * @param {number}   [o.leo]        parte inicial do Leo (centésimos de %)
   * @param {string}   [o.editor]     'Leo' ou 'Pri': quem digita a própria parte
   * @param {Function} [o.valorCent]  total em centavos para mostrar as partes em reais; null esconde
   * @param {string}   [o.rotuloOk]   texto do botão de concluir
   * @param {Function} [o.aoMudar]    (leo) a cada mudança válida
   * @param {Function} [o.aoConcluir] Concluir, Enter ou atalho, com valor válido
   */
  constructor(host, o = {}){
    this.host   = host;
    this.editor = o.editor === 'Pri' ? 'Pri' : 'Leo';
    this.outro  = this.editor === 'Leo' ? 'Pri' : 'Leo';
    this.valorCent  = o.valorCent || (() => null);
    this.aoMudar    = o.aoMudar || null;
    this.aoConcluir = o.aoConcluir || null;
    this.renda  = DivRegua.renda();
    this.valido = true;
    this._montar(o.rotuloOk || 'Concluir');
    this.definir(divValida(o.leo) ? o.leo : DIV_PADRAO);
  }

  /** Parte do Leo pela proporção dos salários líquidos atuais (% inteiro); null sem os dois. */
  static renda(){
    const liq = p => CACHE.salarios.filter(s => s.pessoa === p)
      .reduce((t, s) => t + (CACHE.getSalarioVigente(s)?.liquido || 0), 0);
    const l = liq('Leo'), p = liq('Pri');
    if(!(l > 0 && p > 0)) return null;
    return Math.min(99, Math.max(1, Math.round(l / (l + p) * 100))) * 100;
  }

  /** "Sua parte" digitada ("60", "33,5", "33,33") → centésimos de %; null fora de 1% a 99%. */
  static lerPct(txt){
    const t = String(txt || '').trim();
    if(!/^\d{1,3}(,\d{1,2})?$/.test(t)) return null;
    const bp = Math.round(parseFloat(t.replace(',', '.')) * 100);
    return divValida(bp) ? bp : null;
  }
  /** 6000 → "60"; 3333 → "33,33" (sem o símbolo) */
  static fmtNum(bp){ return (bp / 100).toLocaleString('pt-BR', {maximumFractionDigits: 2}); }
  /** Só dígitos e uma vírgula, até 2 casas (campo "Sua parte"). 3 dígitos: "100" chega a
   *  lerPct e mostra o erro, em vez de virar "10" sem aviso. */
  static limpar(txt){
    const [i, ...d] = String(txt || '').replace(/[^\d,]/g, '').split(',');
    return i.slice(0, 3) + (d.length ? ',' + d.join('').slice(0, 2) : '');
  }

  // Parte do editor ↔ parte do Leo
  _meu(leo){ return this.editor === 'Leo' ? leo : DIV_TOTAL - leo; }
  _doMeu(bp){ return this.editor === 'Leo' ? bp : DIV_TOTAL - bp; }

  _montar(rotuloOk){
    const rd = this.renda;
    const rs = '<span class="div-rs money"></span>';
    // Leo sempre à esquerda e Pri à direita (mesma ordem da régua); o editor tem o campo
    const parte = p => {
      const dir = p === 'Pri', antes = dir ? rs : '', depois = dir ? '' : rs;
      return p === this.editor
        ? `<div class="div-parte${dir ? ' dir' : ''}" data-p="${p}">
             <span class="div-quem"><b>Sua parte</b> · ${p}</span>
             <div class="div-linha">${antes}<label class="div-in"><input type="text" inputmode="decimal" maxlength="6" autocomplete="off" aria-label="Sua parte (${p}), em %"><span aria-hidden="true">%</span></label>${depois}</div>
           </div>`
        : `<div class="div-parte${dir ? ' dir' : ''}" data-p="${p}">
             <span class="div-quem">Parte ${p === 'Leo' ? 'do' : 'da'} <b>${p}</b></span>
             <div class="div-linha">${antes}<span class="div-ro"><b></b>%</span>${depois}</div>
             <span class="div-rest">🔒 restante</span>
           </div>`;
    };
    this.host.innerHTML = `<div class="div-painel" data-editor="${this.editor}">
      <div class="div-topo">
        <span class="div-tit">Divisão da conta</span>
        <div class="div-atalhos" role="group" aria-label="Atalhos da sua parte">
          <span class="div-atalhos-lb">Sua parte</span>
          ${DIV_ATALHOS.map(p => `<button type="button" class="div-chip" data-pct="${p}">${p}%</button>`).join('')}
          <button type="button" class="div-chip renda" data-renda${rd ? '' : ' disabled'}
            title="${rd ? `Proporção dos salários líquidos atuais: Leo ${fmtPct(rd)}, Pri ${fmtPct(DIV_TOTAL - rd)}` : 'Cadastre os salários de Leo e Pri para usar'}">Pela renda${rd ? ' · ' + fmtPct(this._meu(rd)) : ''}</button>
        </div>
      </div>
      <div class="div-regua" role="slider" tabindex="0" aria-label="Divisão entre Leo e Pri (parte do Leo)" aria-valuemin="1" aria-valuemax="99">
        <span class="who-av who-leo div-av esq" data-avatar="Leo" aria-hidden="true">L</span>
        <span class="who-av who-pri div-av dir" data-avatar="Pri" aria-hidden="true">P</span>
        <span class="div-knob" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="div-m50" aria-hidden="true">50</span>
      </div>
      <div class="div-partes">${parte('Leo')}${parte('Pri')}</div>
      <div class="div-pe"><span class="div-dica" aria-live="polite"></span><button type="button" class="btn btn-primary btn-sm div-ok">${rotuloOk}</button></div>
    </div>`;

    const q = s => this.host.querySelector(s);
    this.el = {regua: q('.div-regua'), input: q('.div-in input'), dica: q('.div-dica'), outro: q(`.div-parte[data-p="${this.outro}"] .div-ro b`)};
    const {regua, input} = this.el;

    this.host.querySelectorAll('.div-chip[data-pct]').forEach(b => b.addEventListener('click', () => {
      this.definir(this._doMeu(+b.dataset.pct * 100)); this.concluir();
    }));
    q('[data-renda]').addEventListener('click', () => { if(rd){ this.definir(rd); this.concluir(); } });
    q('.div-ok').addEventListener('click', () => this.concluir());

    input.addEventListener('input', () => {
      input.value = DivRegua.limpar(input.value);
      const bp = DivRegua.lerPct(input.value);
      if(bp === null) this._erro(true); else this.definir(this._doMeu(bp), {doCampo: true});
    });
    input.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); this.concluir(); } });

    // Arrastar (mouse e toque). pan-y no CSS: deslizar na vertical ainda rola o modal.
    regua.addEventListener('pointerdown', e => {
      if(e.button !== 0) return;
      e.preventDefault(); regua.focus();
      regua.setPointerCapture?.(e.pointerId);
      this._arrastando = true; regua.classList.add('arrastando');
      this._doPonteiro(e);
    });
    regua.addEventListener('pointermove', e => { if(this._arrastando) this._doPonteiro(e); });
    const soltar = () => { this._arrastando = false; regua.classList.remove('arrastando'); };
    regua.addEventListener('pointerup', soltar);
    regua.addEventListener('pointercancel', soltar);

    // Teclado: setas 1% (Shift: 5%), PageUp/PageDown 10%, Home/End nos limites, Enter conclui
    regua.addEventListener('keydown', e => {
      const passo = {ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10}[e.key];
      if(passo){
        e.preventDefault();
        const pct = Math.round(this.leo / 100) + passo * (e.shiftKey ? 5 : 1);
        this.definir(Math.min(99, Math.max(1, pct)) * 100);
      } else if(e.key === 'Home' || e.key === 'End'){
        e.preventDefault(); this.definir(e.key === 'Home' ? DIV_MIN : DIV_MAX);
      } else if(e.key === 'Enter'){
        e.preventDefault(); this.concluir();
      }
    });
  }

  _doPonteiro(e){
    const r = this.el.regua.getBoundingClientRect();
    if(!r.width) return;
    const pct = Math.round((e.clientX - r.left) / r.width * 100);
    this.definir(Math.min(99, Math.max(1, pct)) * 100);
  }

  /** Aplica a parte do Leo (centésimos de %) em régua, campos, valores e atalhos. */
  definir(leo, o = {}){
    this.leo = leo;
    this._erro(false);
    const d = montarDivisao(leo), {regua, input} = this.el;
    regua.style.setProperty('--leo', (leo / 100) + '%');
    regua.setAttribute('aria-valuenow', String(Math.round(leo / 100)));
    regua.setAttribute('aria-valuetext', `Leo ${fmtPct(d.Leo)}, Pri ${fmtPct(d.Pri)}`);
    if(!o.doCampo) input.value = DivRegua.fmtNum(d[this.editor]);
    input.style.width = (Math.max(2, input.value.length) + 0.3) + 'ch';
    this.el.outro.textContent = DivRegua.fmtNum(d[this.outro]);
    this.host.querySelectorAll('.div-chip[data-pct]').forEach(b => b.classList.toggle('on', +b.dataset.pct * 100 === d[this.editor]));
    this.host.querySelector('[data-renda]').classList.toggle('on', !!this.renda && this.renda === leo);
    this.valores();
    this.aoMudar?.(leo);
  }

  /** Partes em reais (centavos: Leo arredondado, Pri = resto). */
  valores(){
    const t = this.valorCent();
    this.host.querySelectorAll('.div-parte').forEach(el => {
      const rs = el.querySelector('.div-rs');
      rs.hidden = t === null;
      rs.textContent = t > 0 ? fmt(parteCent(t, this.leo, el.dataset.p) / 100) : '—';
    });
  }

  _erro(on){
    this.valido = !on;
    this.el.input.setAttribute('aria-invalid', String(on));
    this.el.dica.classList.toggle('erro', on);
    this.el.dica.textContent = on
      ? 'Sua parte deve ficar entre 1% e 99%. Para 100%, escolha só Leo ou só Pri.'
      : 'Arraste a régua ou digite a sua parte. A outra parte se ajusta sozinha.';
  }
  /** Mostra o erro sem tirar o foco de onde a pessoa está. */
  mostrarErro(){ this._erro(true); }

  /** Conclui com valor válido; com valor inválido mostra o erro e volta ao campo. */
  concluir(){
    if(!this.valido){ this._erro(true); this.el.input.focus(); return false; }
    this.aoConcluir?.(this.leo);
    return true;
  }

  focar(){ this.el.regua.focus(); }
}
window.DivRegua = DivRegua;

// Estado da divisão no modal da conta. leo: parte do Leo; abertoEm: valor ao abrir (Esc volta
// a ele); travada: conta compartilhada com pagamento (FS.updateConta também recusa a mudança).
const DIVC = {leo: DIV_PADRAO, abertoEm: null, regua: null, travada: false};

Object.assign(APP, {

  /** Quem digita a própria parte: o usuário logado (Leo, se não for nenhum dos dois). */
  _divEditor(){ return STATE.usuario === 'Pri' ? 'Pri' : 'Leo'; },

  // ══════════════════════════════════════════════════════════════════════
  // MODAL DA CONTA
  // ══════════════════════════════════════════════════════════════════════

  /** Responsável do modal da conta (botões com foto). Sem argumento lê; com argumento marca. */
  _respConta(v){
    const rs = [...document.querySelectorAll('#ovConta input[name="fResp"]')];
    if(v === undefined) return rs.find(r => r.checked)?.value || '';
    rs.forEach(r => { r.checked = r.value === v; });
    this._divSincronizar(false);
  },

  /** Clique num responsável: Leo & Pri abre a régua (conta nova ou edição sem pagamento). */
  respContaMudou(){ this._divSincronizar(true); },

  /** Divisão da conta em edição (ou 50/50 na nova). Chamado por clearConta, antes de preencher. */
  _divCarregar(c){
    DIVC.travada = !!c && c.resp === 'Leo & Pri' && temPagamento(c);
    DIVC.leo = c && c.resp === 'Leo & Pri' ? divLeo(c) : DIV_PADRAO;
    DIVC.abertoEm = null;
    this.divRecolher(false);
    this._divSincronizar(false);
  },

  /** Mostra a divisão só com Leo & Pri; abrir=true abre a régua (escolha feita agora). */
  _divSincronizar(abrir){
    const campo = document.getElementById('fDivCampo');
    if(!campo) return;
    const comp = this._respConta() === 'Leo & Pri';
    campo.hidden = !comp;
    if(!comp){ this.divRecolher(false); return; }
    if(abrir && !DIVC.travada && STATE.contaModo !== 'ver') this.divAbrir(false);
    else if(!DIVC.regua) this._divResumo();
  },

  _divTravadaMsg(){
    const c = STATE.editContaId ? CACHE.contas.find(x => x.id === STATE.editContaId) : null;
    const quem = ['Leo', 'Pri'].filter(p => c?.pagamentos?.[p]);
    const ja = quem.length ? `${quem.join(' e ')} já ${quem.length > 1 ? 'pagaram' : 'pagou'} a parte` : 'A conta já foi paga';
    return `${ja}. Para mudar a divisão, desfaça o pagamento.`;
  },

  /** Abre a régua (clique em Ajustar ou escolha de Leo & Pri). */
  divAbrir(focar = true){
    if(STATE.contaModo === 'ver') return;
    if(DIVC.travada){ this.toast(this._divTravadaMsg(), 'info'); return; }
    const painel = document.getElementById('fDivPainel'), resumo = document.getElementById('fDivResumo');
    if(!painel || DIVC.regua) return;
    DIVC.abertoEm = DIVC.leo;
    painel.hidden = false;
    DIVC.regua = new DivRegua(painel, {
      leo: DIVC.leo, editor: this._divEditor(),
      valorCent: () => moneyCents(document.getElementById('fVP')?.value || ''),
      aoMudar: leo => { DIVC.leo = leo; },
      aoConcluir: () => this.divRecolher(),
    });
    resumo.hidden = true;
    resumo.setAttribute('aria-expanded', 'true');
    this._divLigarModal();
    this.aplicarAvatares?.();
    if(focar) DIVC.regua.focar();
  },

  /** Recolhe a régua na linha de resumo; devolve o foco ao resumo se ele estava na régua. */
  divRecolher(devolverFoco = true){
    const painel = document.getElementById('fDivPainel'), resumo = document.getElementById('fDivResumo');
    if(!painel || !resumo) return;
    const tinhaFoco = painel.contains(document.activeElement);
    DIVC.regua = null;
    painel.hidden = true; painel.innerHTML = '';
    resumo.hidden = false;
    resumo.setAttribute('aria-expanded', 'false');
    this._divResumo();
    if(devolverFoco && tinhaFoco) resumo.focus();
  },

  /** Esc desfaz o ajuste; foco em outro campo do modal recolhe (com valor válido). Liga uma vez. */
  _divLigarModal(){
    const ov = document.getElementById('ovConta'), painel = document.getElementById('fDivPainel');
    if(!ov || ov._divLigado) return;
    ov._divLigado = true;
    painel.addEventListener('keydown', e => {
      if(e.key !== 'Escape' || !DIVC.regua) return;
      e.preventDefault(); e.stopPropagation();
      if(DIVC.abertoEm !== null) DIVC.leo = DIVC.abertoEm;
      this.divRecolher();
    });
    ov.addEventListener('focusin', e => {
      if(!DIVC.regua || painel.contains(e.target) || e.target.closest('.resp-seg')) return;
      if(!DIVC.regua.valido){ DIVC.regua.mostrarErro(); return; }
      this.divRecolher(false);
    });
  },

  /** Linha de resumo: "Leo 60% R$ … ━━━━ R$ … 40% Pri ✏ Ajustar" (ou 🔒 Paga). */
  _divResumo(){
    const r = document.getElementById('fDivResumo');
    if(!r) return;
    const d = montarDivisao(DIVC.leo), t = moneyCents(document.getElementById('fVP')?.value || '');
    const rs = p => t > 0 ? `<small class="money">${fmt(parteCent(t, DIVC.leo, p) / 100)}</small>` : '';
    const ver = STATE.contaModo === 'ver';
    r.innerHTML = `<span class="div-r-p"><span class="who-av who-leo div-r-av" data-avatar="Leo" aria-hidden="true">L</span><b>Leo ${fmtPct(d.Leo)}</b>${rs('Leo')}</span>`
      + `<span class="div-r-bar" style="--leo:${d.Leo / 100}%" aria-hidden="true"></span>`
      + `<span class="div-r-p">${rs('Pri')}<b>${fmtPct(d.Pri)} Pri</b><span class="who-av who-pri div-r-av" data-avatar="Pri" aria-hidden="true">P</span></span>`
      + (DIVC.travada ? '<span class="div-r-acao">🔒 Paga</span>' : ver ? '' : '<span class="div-r-acao">✏<span class="div-r-acao-tx">Ajustar</span></span>');
    r.classList.toggle('travada', DIVC.travada);
    r.setAttribute('aria-disabled', String(DIVC.travada || ver));
    r.setAttribute('aria-label', `Divisão: Leo ${fmtPct(d.Leo)}, Pri ${fmtPct(d.Pri)}.`
      + (DIVC.travada ? ' Travada: a conta tem pagamento.' : ver ? '' : ' Ajustar.'));
    r.title = DIVC.travada ? this._divTravadaMsg() : '';
    this.aplicarAvatares?.();
  },

  /** Valor da parcela mudou: atualiza as partes em reais (régua aberta ou resumo). */
  divAtualizarValores(){
    if(DIVC.regua) DIVC.regua.valores();
    else if(!document.getElementById('fDivCampo')?.hidden) this._divResumo();
  },

  /**
   * Divisão a gravar no saveConta. undefined = não enviar (travada: FS mantém a gravada);
   * null = valor inválido (a régua mostra o erro).
   */
  _divParaSalvar(){
    if(DIVC.travada) return undefined;
    if(DIVC.regua && !DIVC.regua.valido){ DIVC.regua.mostrarErro(); return null; }
    return montarDivisao(DIVC.leo);
  },

  // ══════════════════════════════════════════════════════════════════════
  // GERENCIAR PARCELAMENTO
  // ══════════════════════════════════════════════════════════════════════

  /** Célula "Sua parte" de uma parcela (resp = valor atual do select da linha). */
  _parcDivCelula(c, resp = c.resp){
    if(resp !== 'Leo & Pri') return '<span style="color:var(--t4)">—</span>';
    if(c.resp === 'Leo & Pri' && temPagamento(c))
      return `<span class="parc-div-trava" title="Parcela com pagamento: a divisão não muda">🔒 ${fmtDivisao(c)}</span>`;
    const ed = this._divEditor(), leo = c.resp === 'Leo & Pri' ? divLeo(c) : DIV_PADRAO;
    return `<label class="parc-div-in" title="Divisão Leo/Pri: ${fmtDivisao({divisao: montarDivisao(leo)})}"><input type="text" inputmode="decimal" maxlength="6" id="parc_div_${c.id}" value="${DivRegua.fmtNum(montarDivisao(leo)[ed])}" oninput="this.value=DivRegua.limpar(this.value)" aria-label="Sua parte (${ed}) na parcela ${this._escHtml(c.parcela || '')}, em %"><span aria-hidden="true">%</span></label>`;
  },

  /** Select de responsável da linha mudou: mostra ou esconde a parte. */
  parcsRespMudou(id, resp){
    const c = CACHE.contas.find(x => x.id === id), td = document.getElementById(`parc_divcel_${id}`);
    if(c && td) td.innerHTML = this._parcDivCelula(c, resp);
  },

  /**
   * Divisões das linhas editáveis para o parcsSaveAll: {id: divisao}. Linha com valor inválido
   * mostra o erro e devolve null (nada é gravado).
   */
  _parcsDivisoes(parcs){
    const ed = this._divEditor(), out = {};
    for(const c of parcs){
      const el = document.getElementById(`parc_div_${c.id}`);
      if(!el) continue;   // não compartilhada ou com pagamento
      const bp = DivRegua.lerPct(el.value);
      if(bp === null){
        this.toast(`Parcela ${c.parcela || ''}: sua parte deve ficar entre 1% e 99%`, 'error');
        el.focus(); el.setAttribute('aria-invalid', 'true');
        return null;
      }
      out[c.id] = montarDivisao(ed === 'Leo' ? bp : DIV_TOTAL - bp);
    }
    return out;
  },

  /** "➗ Divisão": mesma divisão para todas as parcelas compartilhadas sem pagamento. */
  parcsAbrirDivisao(){
    const parcs = CACHE.getByGrupo(STATE.parcGrupo);
    const campos = parcs.map(c => document.getElementById(`parc_div_${c.id}`)).filter(Boolean);
    if(!campos.length){ this.toast('Nenhuma parcela compartilhada sem pagamento: escolha Leo & Pri no responsável', 'info'); return; }
    const travadas = parcs.filter(c => c.resp === 'Leo & Pri' && temPagamento(c)).length;
    document.getElementById('parcsDivAviso').textContent =
      `Vale para ${campos.length} parcela${campos.length > 1 ? 's' : ''} compartilhada${campos.length > 1 ? 's' : ''} sem pagamento.`
      + (travadas ? ` ${travadas} com pagamento ${travadas > 1 ? 'mantêm' : 'mantém'} a divisão.` : '')
      + ' A gravação acontece no Salvar do parcelamento.';
    const ed = this._divEditor(), meu = DivRegua.lerPct(campos[0].value);
    const ov = document.getElementById('ovParcsDivisao');
    const regua = new DivRegua(document.getElementById('parcsDivRegua'), {
      leo: meu === null ? DIV_PADRAO : (ed === 'Leo' ? meu : DIV_TOTAL - meu),
      editor: ed, rotuloOk: '✅ Aplicar às parcelas',
      aoConcluir: leo => {
        const v = DivRegua.fmtNum(montarDivisao(leo)[ed]);
        campos.forEach(el => { el.value = v; el.removeAttribute('aria-invalid'); });
        APP.closeModal('ovParcsDivisao');
        this.toast(`Divisão ${fmtDivisao({divisao: montarDivisao(leo)})} aplicada a ${campos.length} parcela${campos.length > 1 ? 's' : ''}: clique em Salvar`, 'info');
      },
    });
    ov.classList.add('open');
    this.aplicarAvatares?.();
    setTimeout(() => regua.focar(), 100);
  },

  // ══════════════════════════════════════════════════════════════════════
  // LISTAS
  // ══════════════════════════════════════════════════════════════════════

  /** Selo da parte da pessoa filtrada numa compartilhada (ex.: "60%"); vazio fora do filtro. */
  seloParte(c){
    return c._split
      ? `<span class="badge selo-parte" title="Parte de ${this._escHtml(STATE.resp)} nesta conta (Leo/Pri ${fmtDivisao(c)})">${fmtPct(c._pct)}</span>`
      : '';
  },

  /** Responsável nas listas; compartilhada ganha a mini barra e "60/40". */
  respHtml(c){
    if(c.resp !== 'Leo & Pri') return this._escHtml(c.resp || '');
    const d = divisaoDe(c);
    return `<span class="resp-div">Leo &amp; Pri<span class="resp-div-bar" style="--leo:${d.Leo / 100}%" aria-hidden="true"></span><small>${fmtDivisao(c)}</small></span>`;
  },
});
