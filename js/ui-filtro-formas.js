"use strict";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO ui-filtro-formas.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Filtro de forma de pagamento com seleção múltipla ("painel de distribuição"),
 * usado em Contas e Relatório.
 *
 * REGRAS
 *   • Nenhuma forma marcada, ou todas marcadas = sem filtro ("Todas").
 *   • Cada tela tem a sua seleção, guardada no próprio botão: zera quando a view é
 *     recarregada (navegação), como os demais filtros da barra, e resiste aos
 *     redesenhos da mesma tela (listeners do Firestore).
 *   • O painel mostra cada forma com o que ela soma no recorte atual da tela (todos os
 *     filtros MENOS o de forma): barra, valor, % e quantidade de contas. Soma em
 *     centavos inteiros de vEfetivo, a mesma base do Total da tela.
 *   • Atalhos: Todas; Cartões (nome começa com "Cartão", sem diferença de acento ou
 *     maiúscula); Pareto 80% (menor conjunto de formas, da maior para a menor, que
 *     soma ao menos 80% do valor do recorte).
 *   • Conta legada (nome da forma em `forma`, sem `formaId`) casa pelo nome.
 *
 * INTERFACE
 *   Desktop: popover ancorado no botão. Até 640px: painel inferior com fundo escuro.
 *   O painel vive no <body> para não ser cortado pelo overflow da barra de filtros
 *   recolhível do celular. Esc fecha; ↑/↓ andam pelas formas; Tab fica no painel.
 *
 * USO PELAS TELAS
 *   filtroFormasAtualizar(tela, base)  base = contas filtradas por tudo, menos a forma
 *   filtroFormasAplicar(tela, data)    aplica a seleção
 *   filtroFormasNomes(tela)            nomes selecionados (rótulo do PDF)
 *   filtroFormasDefinir(tela, ids)     troca a seleção sem redesenhar a tela ([] = todas)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const FILTRO_FORMAS_TELAS = {
  contas:    { botao: 'filtroFormaContas', render: app => { app._ordenarContasPorVencimento(); STATE.pg = 1; app.renderContas(); } },
  relatorio: { botao: 'relForma',          render: app => app.renderRelatorio() },
};
const FF_PARETO  = 0.8;
const FF_CELULAR = '(max-width: 640px)';
// Painel aberto: tela dona, ordenação (vale para a sessão) e elementos do <body>
const FF = { tela: null, ordem: 'valor', painel: null, fundo: null, reposicionar: null, fora: null };

Object.assign(APP, {

  _ffBotao(tela){
    const t = FILTRO_FORMAS_TELAS[tela];
    return t ? document.getElementById(t.botao) : null;
  },

  /** Resolve id (contas novas) e nome (contas legadas) para a forma. Id vence nome se colidirem. */
  _ffIndice(){
    const m = new Map();
    CACHE.formas.forEach(f => m.set(f.nome, f));
    CACHE.formas.forEach(f => m.set(f.id, f));
    return m;
  },

  _ffIdDaConta(c, indice){
    const f = indice.get(c.formaId || c.forma);
    return f ? f.id : null;
  },

  _ffEhCartao(f){ return this._normBusca(f.nome).trim().startsWith('cartao'); },

  _ffPct(cent, total){
    return (total ? cent / total * 100 : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  },

  _ffContas(n){ return n === 1 ? '1 conta' : `${n} contas`; },

  /** Seleção válida da tela ([] = todas): ids de formas excluídas saem e todas marcadas vira []. */
  filtroFormasSelecao(tela){
    const sel = this._ffBotao(tela)?._ffSel || [];
    const validos = sel.filter(id => CACHE.formas.some(f => f.id === id));
    return validos.length === CACHE.formas.length ? [] : validos;
  },

  filtroFormasAplicar(tela, data){
    const sel = this.filtroFormasSelecao(tela);
    if(!sel.length) return data;
    const ids = new Set(sel), indice = this._ffIndice();
    return data.filter(c => ids.has(this._ffIdDaConta(c, indice)));
  },

  filtroFormasNomes(tela){
    const ids = new Set(this.filtroFormasSelecao(tela));
    return CACHE.getAllFormas().filter(f => ids.has(f.id)).map(f => f.nome);
  },

  filtroFormasDefinir(tela, ids){
    const btn = this._ffBotao(tela);
    if(!btn) return;
    btn._ffSel = [...new Set(ids || [])];
    this._ffDesenharBotao(tela);
    if(FF.tela === tela) this._ffDesenharPainel();
  },

  /** Chamado pelo render da tela com o recorte sem o filtro de forma. */
  filtroFormasAtualizar(tela, base){
    const btn = this._ffBotao(tela);
    if(!btn) return;
    btn._ffBase = base || [];
    this._ffDesenharBotao(tela);
    if(FF.tela === tela) this._ffDesenharPainel();
  },

  /**
   * Quanto cada forma soma no recorte, em centavos. Formas sem conta entram com 0.
   * @param {object[]} base contas do recorte
   * @returns {{total:number, qtd:number, itens:{f:object, cent:number, qtd:number}[]}}
   */
  _ffDistribuicao(base){
    const indice = this._ffIndice();
    const porId = new Map(CACHE.getAllFormas().map(f => [f.id, { f, cent: 0, qtd: 0 }]));
    let total = 0;
    base.forEach(c => {
      const cent = centavos(vEfetivo(c));
      total += cent;
      const it = porId.get(this._ffIdDaConta(c, indice));
      if(it){ it.cent += cent; it.qtd++; }
    });
    return { total, qtd: base.length, itens: [...porId.values()] };
  },

  /** Menor conjunto de formas (da maior para a menor) que soma ao menos 80% do total. */
  _ffPareto(dist){
    const ids = [];
    let cent = 0;
    const desc = dist.itens.filter(i => i.cent > 0).sort((a, b) => b.cent - a.cent);
    for(const i of desc){
      if(cent >= dist.total * FF_PARETO) break;
      ids.push(i.f.id);
      cent += i.cent;
    }
    return { ids, cent };
  },

  _ffDesenharBotao(tela){
    const btn = this._ffBotao(tela);
    if(!btn) return;
    const sel = this.filtroFormasSelecao(tela), on = new Set(sel), todas = !sel.length;
    const dist = this._ffDistribuicao(btn._ffBase || []);
    const mini = btn.querySelector('.ff-mini'), qtd = btn.querySelector('.ff-qtd');
    if(mini) mini.innerHTML = !dist.total ? '' : dist.itens
      .filter(i => i.cent > 0).sort((a, b) => b.cent - a.cent)
      .map(i => `<span class="${todas || on.has(i.f.id) ? 'on' : ''}" style="width:${(i.cent / dist.total * 100).toFixed(2)}%"></span>`)
      .join('');
    if(qtd) qtd.textContent = todas ? 'Todas' : `${sel.length} de ${CACHE.formas.length}`;
    const nomes = this.filtroFormasNomes(tela).join(', ');
    btn.classList.toggle('ff-ativo', !todas);
    btn.setAttribute('aria-expanded', String(FF.tela === tela));
    btn.setAttribute('aria-label', 'Forma de pagamento: ' + (todas ? 'todas' : nomes));
    btn.title = todas ? 'Filtrar por forma de pagamento' : nomes;
  },

  _ffDesenharPainel(){
    const p = FF.painel, btn = this._ffBotao(FF.tela);
    if(!p || !btn) return;
    const esc = v => this._escHtml(v);
    const sel = this.filtroFormasSelecao(FF.tela), on = new Set(sel), todas = !sel.length;
    const dist = this._ffDistribuicao(btn._ffBase || []);
    const max = Math.max(1, ...dist.itens.map(i => i.cent));
    const pareto = this._ffPareto(dist);
    const cartoes = CACHE.getAllFormas().filter(f => this._ffEhCartao(f)).map(f => f.id);
    const igual = ids => !todas && ids.length === sel.length && ids.every(id => on.has(id));
    const porNome = (a, b) => a.f.nome.localeCompare(b.f.nome, 'pt');
    const ordem = FF.ordem === 'valor' ? (a, b) => b.cent - a.cent || porNome(a, b) : porNome;

    const linha = i => {
      const marcada = on.has(i.f.id), pct = this._ffPct(i.cent, dist.total);
      const valores = i.cent
        ? `<span class="ff-barra" aria-hidden="true"><span class="${todas || marcada ? 'on' : ''}" style="width:${(i.cent / max * 100).toFixed(2)}%"></span></span>
           <span class="ff-valor money">${fmt(i.cent / 100)}</span><span class="ff-pct">${pct}</span>`
        : `<span class="ff-valor money">${fmt(0)}</span>`;
      return `<button type="button" class="ff-linha${i.cent ? '' : ' ff-zero'}" data-ff-id="${esc(i.f.id)}" aria-pressed="${marcada}"
        aria-label="${esc(i.f.nome)}, ${fmt(i.cent / 100)}, ${pct} do recorte, ${this._ffContas(i.qtd)}">
        <span class="ff-chk" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>
        <span class="ff-nome">${esc(i.f.nome)}</span>${valores}</button>`;
    };
    const comValor = dist.itens.filter(i => i.cent > 0).sort(ordem);
    const zeradas  = dist.itens.filter(i => !i.cent).sort(porNome);

    const atalho = (acao, rotulo, ativo, dica) =>
      `<button type="button" class="ff-chip" data-ff-acao="${acao}" aria-pressed="${ativo}" title="${dica}">${rotulo}</button>`;
    const atalhos = [
      atalho('todas', 'Todas', todas, 'Sem filtro de forma'),
      cartoes.length ? atalho('cartoes', 'Cartões', igual(cartoes), 'Formas cujo nome começa com “Cartão”') : '',
      pareto.ids.length ? atalho('pareto', 'Pareto 80%', igual(pareto.ids), 'Menor grupo de formas que soma 80% do valor do recorte') : '',
    ].join('');
    const paretoInfo = igual(pareto.ids)
      ? `<p class="ff-info">${pareto.ids.length === 1 ? '1 forma concentra' : `${pareto.ids.length} formas concentram`} ${this._ffPct(pareto.cent, dist.total)} do valor do recorte.</p>`
      : '';

    const escolhidas = dist.itens.filter(i => on.has(i.f.id));
    const centSel = todas ? dist.total : escolhidas.reduce((s, i) => s + i.cent, 0);
    const qtdSel  = todas ? dist.qtd   : escolhidas.reduce((s, i) => s + i.qtd, 0);
    const resumo = todas
      ? `Todas as formas · ${this._ffContas(qtdSel)}`
      : `Selecionado <strong class="money">${fmt(centSel / 100)}</strong> · ${this._ffPct(centSel, dist.total)} do recorte · ${this._ffContas(qtdSel)}`;

    // Redesenho preserva foco e rolagem (cada clique numa forma redesenha o painel)
    const ativo = p.contains(document.activeElement) ? document.activeElement : null;
    const chaveFoco = ativo?.dataset.ffId ? `[data-ff-id="${CSS.escape(ativo.dataset.ffId)}"]`
      : ativo?.dataset.ffAcao ? `[data-ff-acao="${CSS.escape(ativo.dataset.ffAcao)}"]` : null;
    const rolagem = p.querySelector('.ff-lista')?.scrollTop || 0;

    p.innerHTML = `
      <div class="ff-alca" aria-hidden="true"></div>
      <div class="ff-cab">
        <div class="ff-cab-txt">
          <h2 id="ffTitulo">Forma de pagamento</h2>
          <span class="ff-sub">Recorte atual: <span class="money">${fmt(dist.total / 100)}</span> em ${this._ffContas(dist.qtd)}</span>
        </div>
        <button type="button" class="ff-fechar" data-ff-acao="fechar" aria-label="Fechar"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <div class="ff-seg" role="group" aria-label="Ordenar formas">
          <button type="button" data-ff-acao="ordem-valor" aria-pressed="${FF.ordem === 'valor'}">Por valor</button>
          <button type="button" data-ff-acao="ordem-nome" aria-pressed="${FF.ordem === 'nome'}">A–Z</button>
        </div>
      </div>
      <div class="ff-atalhos"><span class="ff-rotulo">Atalhos</span>${atalhos}${paretoInfo}</div>
      <div class="ff-lista" role="group" aria-label="Formas de pagamento">
        ${comValor.map(linha).join('')}
        ${zeradas.length ? `<div class="ff-sec">Sem contas no recorte · ${zeradas.length}</div>${zeradas.map(linha).join('')}` : ''}
        ${CACHE.formas.length ? '' : '<p class="ff-vazio">Nenhuma forma de pagamento cadastrada.</p>'}
      </div>
      <div class="ff-rodape">
        <span class="ff-resumo">${resumo}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-ff-acao="limpar"${todas ? ' disabled' : ''}>Limpar</button>
        <button type="button" class="btn btn-primary btn-sm" data-ff-acao="fechar"><span class="ff-so-desk">Concluir</span><span class="ff-so-cel">Ver ${this._ffContas(qtdSel)} · <span class="money">${fmt(centSel / 100)}</span></span></button>
      </div>`;

    p.querySelector('.ff-lista').scrollTop = rolagem;
    const alvo = chaveFoco && p.querySelector(chaveFoco);
    if(alvo && !alvo.disabled && alvo.offsetParent) alvo.focus({ preventScroll: true });
    else if(ativo) p.querySelector('.ff-linha')?.focus({ preventScroll: true });
  },

  /** Abre o painel da tela (ou fecha, se já estiver aberto nela). */
  filtroFormasAbrir(tela){
    if(FF.tela === tela) return this.filtroFormasFechar();
    if(FF.tela) this.filtroFormasFechar(false);
    if(!this._ffBotao(tela)) return;
    if(!FF.painel){
      FF.fundo  = Object.assign(document.createElement('div'), { className: 'ff-fundo', hidden: true });
      FF.painel = Object.assign(document.createElement('div'), { className: 'ff-painel', id: 'ffPainel', hidden: true });
      FF.painel.setAttribute('role', 'dialog');
      FF.painel.setAttribute('aria-labelledby', 'ffTitulo');
      FF.painel.addEventListener('click', e => this._ffClique(e));
      FF.painel.addEventListener('keydown', e => this._ffTecla(e));
      document.body.append(FF.fundo, FF.painel);
      // Rolagem da própria lista não reposiciona; a da página sim
      FF.reposicionar = e => { if(!(e && e.target instanceof Node && FF.painel.contains(e.target))) requestAnimationFrame(() => this._ffPosicionar()); };
      FF.fora = e => { const btn = this._ffBotao(FF.tela); if(!FF.painel.contains(e.target) && !btn?.contains(e.target)) this.filtroFormasFechar(false); };
    }
    FF.tela = tela;
    FF.painel.hidden = false;
    FF.fundo.hidden = false;
    document.documentElement.classList.add('ff-aberto');
    this._ffDesenharPainel();
    this._ffDesenharBotao(tela);
    this._ffPosicionar();
    window.addEventListener('resize', FF.reposicionar);
    window.addEventListener('scroll', FF.reposicionar, true);
    document.addEventListener('pointerdown', FF.fora, true);
    // Foco na primeira forma marcada: a lista rola até ela (o painel é fixo, a página não mexe)
    (FF.painel.querySelector('.ff-linha[aria-pressed="true"]') || FF.painel.querySelector('.ff-linha'))?.focus();
  },

  filtroFormasFechar(devolverFoco = true){
    if(!FF.tela) return;
    const btn = this._ffBotao(FF.tela);
    FF.tela = null;
    FF.painel.hidden = true;
    FF.painel.innerHTML = '';
    FF.fundo.hidden = true;
    document.documentElement.classList.remove('ff-aberto');
    window.removeEventListener('resize', FF.reposicionar);
    window.removeEventListener('scroll', FF.reposicionar, true);
    document.removeEventListener('pointerdown', FF.fora, true);
    if(btn){
      btn.setAttribute('aria-expanded', 'false');
      if(devolverFoco) btn.focus();
    }
  },

  /** Desktop: abaixo do botão (acima, se faltar espaço). Celular: o CSS prende no rodapé. */
  _ffPosicionar(){
    const p = FF.painel, btn = this._ffBotao(FF.tela);
    if(!p || !btn) return;
    p.style.top = p.style.bottom = p.style.left = p.style.maxHeight = '';
    if(matchMedia(FF_CELULAR).matches) return;
    const r = btn.getBoundingClientRect(), margem = 12, folga = 6;
    if(!r.width || r.bottom < 0 || r.top > innerHeight) return this.filtroFormasFechar(false);
    p.style.left = Math.max(margem, Math.min(r.left, innerWidth - p.offsetWidth - margem)) + 'px';
    const abaixo = innerHeight - r.bottom - folga - margem, acima = r.top - folga - margem;
    if(abaixo >= 320 || abaixo >= acima){
      p.style.top = (r.bottom + folga) + 'px';
      p.style.maxHeight = abaixo + 'px';
    } else {
      p.style.bottom = (innerHeight - r.top + folga) + 'px';
      p.style.maxHeight = acima + 'px';
    }
  },

  _ffClique(e){
    const alvo = e.target.closest('[data-ff-id],[data-ff-acao]');
    if(!alvo || alvo.disabled) return;
    if(alvo.dataset.ffId) return this._ffAlternar(alvo.dataset.ffId);
    const base = () => this._ffBotao(FF.tela)?._ffBase || [];
    switch(alvo.dataset.ffAcao){
      case 'fechar':      return this.filtroFormasFechar();
      case 'limpar':
      case 'todas':       return this._ffSelecionar([]);
      case 'cartoes':     return this._ffSelecionar(CACHE.getAllFormas().filter(f => this._ffEhCartao(f)).map(f => f.id));
      case 'pareto':      return this._ffSelecionar(this._ffPareto(this._ffDistribuicao(base())).ids);
      case 'ordem-valor': FF.ordem = 'valor'; return this._ffDesenharPainel();
      case 'ordem-nome':  FF.ordem = 'nome';  return this._ffDesenharPainel();
    }
  },

  _ffAlternar(id){
    const atual = this.filtroFormasSelecao(FF.tela);
    this._ffSelecionar(atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id]);
  },

  /** Troca a seleção e redesenha a tela; o render chama filtroFormasAtualizar, que redesenha o painel. */
  _ffSelecionar(ids){
    const btn = this._ffBotao(FF.tela);
    if(!btn) return;
    btn._ffSel = ids;
    FILTRO_FORMAS_TELAS[FF.tela].render(this);
  },

  _ffTecla(e){
    if(e.key === 'Escape'){ e.stopPropagation(); return this.filtroFormasFechar(); }
    if(e.key === 'Tab'){
      const foco = [...FF.painel.querySelectorAll('button:not([disabled])')].filter(b => b.offsetParent);
      const prim = foco[0], ult = foco[foco.length - 1];
      if(e.shiftKey && document.activeElement === prim){ e.preventDefault(); ult.focus(); }
      else if(!e.shiftKey && document.activeElement === ult){ e.preventDefault(); prim.focus(); }
      return;
    }
    if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const linhas = [...FF.painel.querySelectorAll('.ff-linha')];
    const i = linhas.indexOf(document.activeElement);
    if(i < 0) return;
    e.preventDefault();
    linhas[Math.max(0, Math.min(linhas.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
  },

});

// Trocar de tela recria a barra de filtros: o painel da tela anterior fecha
document.addEventListener('duetto:view-loaded', () => APP.filtroFormasFechar(false));
