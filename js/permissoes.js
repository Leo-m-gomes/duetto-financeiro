/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO permissoes.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Permissões das contas e aprovação do admin (README 5). Só interface: a regra fica em
 * fin-state.js (permConta, podeDesfazerPg, precisaAprovacao) e as travas de gravação em
 * fin-db.js (FS.updateConta, deleteConta, pagar*, desfazer*, aprovarContas).
 *
 *   • Alerta "Somente o administrador" (modal ovSoAdmin) ao tentar editar, excluir, pagar,
 *     desfazer ou gerenciar parcelamento numa conta travada. Todos veem todas as contas.
 *   • Conta do admin compartilhada: o ✏ abre o modal em modo "nota" (só a nota muda).
 *   • Aprovações (só o admin): sino no topbar com a quantidade, modal ovAprovacoes, selo
 *     "⏳ aprovar" na lista de Contas e aviso no modal da conta. Quem cadastrou não vê nada.
 *
 * DEPENDÊNCIAS: fin-state (permConta, podeDesfazerPg, precisaAprovacao, aprovacaoPendente,
 *   ehAdmin, fmt, fmtDate, centavos), fin-cache (CACHE.contas), fin-db (FS.aprovarContas),
 *   contas.js (APP.verConta), divisao.js (APP.respHtml), ui-toast (APP.toast).
 * IMPORTAÇÃO: depois de divisao.js.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

// Ação tentada → texto do alerta ("Somente o administrador pode …")
const PERM_ACOES = Object.freeze({
  editar:       'editar esta conta',
  excluir:      'excluir esta conta',
  pagar:        'registrar pagamento nesta conta',
  desfazer:     'desfazer este pagamento',
  parcelamento: 'gerenciar este parcelamento',
  divisao:      'mudar a divisão (%) desta conta',
});

Object.assign(APP, {

  // ══════════════════════════════════════════════════════════════════════
  // PERMISSÕES
  // ══════════════════════════════════════════════════════════════════════

  /** Permissão do usuário logado na conta (regra em fin-state.js → permConta). */
  permContaAtual(c){ return permConta(c, STATE.usuario); },

  /** true se pode; senão abre o alerta e devolve false. chave: editar, nota, excluir, pagar. */
  _podeOuAvisa(c, chave, acao = chave){
    if(!c || this.permContaAtual(c)[chave]) return true;
    this.avisarSoAdmin(c, acao);
    return false;
  },

  /** Modo de edição do modal da conta: 'editar' (total), 'nota' (parcial) ou null (avisou). */
  _modoEdicao(c){
    const p = this.permContaAtual(c);
    if(p.editar) return 'editar';
    if(p.nota) return 'nota';
    this.avisarSoAdmin(c, 'editar');
    return null;
  },

  /** Algum pagamento desta conta pode ser desfeito pelo usuário logado? (botão ↩ da lista) */
  _podeDesfazerAlgum(c){
    if(this.permContaAtual(c).nivel === 'total') return true;
    const partes = ['Leo','Pri'].filter(r => c.pagamentos?.[r]);
    return partes.length ? partes.some(r => podeDesfazerPg(c, r, STATE.usuario)) : podeDesfazerPg(c, '', STATE.usuario);
  },

  /** Alerta de conta travada: quem cadastrou, o que só o admin faz e o que a pessoa pode fazer. */
  avisarSoAdmin(c, acao = 'editar'){
    const ov = document.getElementById('ovSoAdmin');
    const verbo = PERM_ACOES[acao] || PERM_ACOES.editar;
    if(!ov){ this.toast(`Somente o administrador pode ${verbo}`, 'error'); return; }
    const esc = v => this._escHtml(v);
    const p = this.permContaAtual(c);
    const autor = c.createdBy ? `por <b>${esc(c.createdBy)}</b>` : 'antes do controle de autor (vale como do administrador)';
    document.getElementById('soAdmConta').innerHTML = `<b>${esc(c.conta)}</b> · ${esc(c.resp)}${c.parcela && c.parcela !== '1 de 1' ? ' · ' + esc(c.parcela) : ''}`;
    document.getElementById('soAdmTexto').innerHTML = `Esta conta foi cadastrada ${autor}. Somente o administrador pode ${verbo}.`;
    document.getElementById('soAdmPode').textContent = p.nivel === 'parcial'
      ? 'Como ela é compartilhada com você, você pode registrar pagamento, desfazer os pagamentos que você registrou e editar a nota.'
      : 'Você pode visualizar todos os dados da conta.';
    ov.classList.add('open');
    if(!ov._escLigado){
      ov._escLigado = true;
      ov.addEventListener('keydown', e => { if(e.key === 'Escape'){ e.stopPropagation(); APP.closeModal('ovSoAdmin'); } });
    }
    setTimeout(() => document.getElementById('soAdmOk')?.focus(), 60);
  },

  /**
   * Aviso no topo do modal da conta. Admin: aprovação pendente com o botão Aprovar.
   * Demais usuários: o que podem fazer quando o acesso não é total.
   */
  _contaAvisoHtml(c){
    if(!c) return '';
    if(ehAdmin(STATE.usuario)){
      if(!this._precisaAprovar(c)) return '';
      const a = c.aprovacao;
      return `<span class="cs-tag pend">⏳ Aguarda sua aprovação</span><span>${this._escHtml(a.por)} ${a.motivo === 'edicao' ? 'alterou' : 'cadastrou'} ${this._quandoAprov(a.emIso)}</span>`
        + `<button type="button" class="btn btn-primary btn-sm conta-aviso-btn" onclick="APP.aprovarConta('${c.id}')">✓ Aprovar</button>`;
    }
    const p = this.permContaAtual(c);
    if(p.nivel === 'parcial') return '<span class="cs-tag trava">🔒 Conta do administrador</span><span>Compartilhada com você: registre pagamento e edite a nota. O % e os demais campos, só o administrador altera.</span>';
    if(p.nivel === 'leitura') return '<span class="cs-tag trava">🔒 Conta do administrador</span><span>Você pode visualizar; alterações, só o administrador.</span>';
    return '';
  },

  // ══════════════════════════════════════════════════════════════════════
  // APROVAÇÕES (somente o admin)
  // ══════════════════════════════════════════════════════════════════════

  /** Pendente e ainda com o admin como responsável (se o admin trocou o responsável, sai da lista). */
  _precisaAprovar(c){ return aprovacaoPendente(c) && precisaAprovacao(c.resp, c.aprovacao.por); },

  aprovacoesPendentes(){ return ehAdmin(STATE.usuario) ? CACHE.contas.filter(c => this._precisaAprovar(c)) : []; },

  /** Selo "⏳ aprovar" ao lado da descrição na lista de Contas (só o admin vê). */
  seloAprovacao(c){
    if(!ehAdmin(STATE.usuario) || !this._precisaAprovar(c)) return '';
    const a = c.aprovacao;
    return `<button type="button" class="selo-aprov" onclick="APP.abrirAprovacoes()" title="${this._escHtml(a.por)} ${a.motivo === 'edicao' ? 'alterou' : 'cadastrou'} com você como responsável: aguarda sua aprovação">⏳ aprovar</button>`;
  },

  /**
   * Sino do topbar. Chamado pelo listener de contas (fin-db.js) e no boot. Só o admin o vê,
   * e só com pendências. Pendência nova com o app aberto também avisa num toast.
   */
  atualizarAprovacoes(){
    const btn = document.getElementById('btnAprovacoes');
    if(!btn || !ehAdmin(STATE.usuario)) return;
    const n = this.aprovacoesPendentes().length;
    btn.hidden = !n;
    const rot = `${n} conta${n !== 1 ? 's' : ''} para aprovar`;
    btn.title = rot; btn.setAttribute('aria-label', rot);
    const el = document.getElementById('aprovCount');
    if(el) el.textContent = n > 99 ? '99+' : String(n);
    if(this._ready){
      if(n > (this._aprovN || 0)) this.toast(`🔔 ${rot} (em seu nome, por outro usuário)`, 'info');
      this._aprovN = n;
    }
    if(document.getElementById('ovAprovacoes')?.classList.contains('open')) this.renderAprovacoes();
  },

  abrirAprovacoes(){
    if(!ehAdmin(STATE.usuario)) return;
    this.renderAprovacoes();
    document.getElementById('ovAprovacoes').classList.add('open');
  },

  /** "agora", "há 5 min", "há 3 h", "ontem 14:20" ou "12/10/2026 14:20" */
  _quandoAprov(iso){
    const t = Date.parse(iso || '');
    if(!t) return '';
    const min = Math.round((Date.now() - t) / 60000);
    if(min < 1) return 'agora';
    if(min < 60) return `há ${min} min`;
    if(min < 12 * 60) return `há ${Math.round(min / 60)} h`;
    const d = new Date(t), hora = d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    const ontem = isoLocal(new Date(Date.now() - 864e5)) === isoLocal(d);
    return ontem ? `ontem ${hora}` : `em ${d.toLocaleDateString('pt-BR')} ${hora}`;
  },

  /**
   * Itens da lista: parcelas pendentes do mesmo parcelamento (e mesmo motivo) viram um item só.
   * @returns {{chave:string, contas:Object[], motivo:string, por:string, emIso:string}[]}
   */
  _itensAprovacao(){
    const pend = this.aprovacoesPendentes();
    const porGrupo = {};
    pend.forEach(c => { if(c.grupo) porGrupo[c.grupo] = (porGrupo[c.grupo] || 0) + 1; });
    const itens = new Map();
    pend.forEach(c => {
      const a = c.aprovacao;
      const chave = c.grupo && porGrupo[c.grupo] > 1 ? `g:${c.grupo}:${a.motivo}` : `c:${c.id}`;
      if(!itens.has(chave)) itens.set(chave, {chave, contas:[], motivo:a.motivo, por:a.por, emIso:a.emIso});
      const it = itens.get(chave);
      it.contas.push(c);
      if(a.emIso > it.emIso) it.emIso = a.emIso;
    });
    const lista = [...itens.values()];
    lista.forEach(it => it.contas.sort((x, y) => (x.data || '').localeCompare(y.data || '')));
    return lista.sort((x, y) => (y.emIso || '').localeCompare(x.emIso || ''));   // mais recentes primeiro
  },

  renderAprovacoes(){
    const el = document.getElementById('aprovLista');
    if(!el) return;
    const esc = v => this._escHtml(v);
    const itens = this._itensAprovacao();
    this._aprovItens = new Map(itens.map(it => [it.chave, it]));
    const total = itens.reduce((s, it) => s + it.contas.length, 0);
    const btnTodas = document.getElementById('aprovTodas');
    if(btnTodas){ btnTodas.hidden = total < 2; btnTodas.textContent = `✓ Aprovar todas (${total})`; }
    if(!itens.length){
      el.innerHTML = '<div class="aprov-vazio">✅ Nenhuma conta aguardando aprovação.</div>';
      return;
    }
    el.innerHTML = itens.map(it => {
      const c = it.contas[0], n = it.contas.length, ult = it.contas[n - 1];
      const cent = it.contas.reduce((s, x) => s + centavos(x.vPagar), 0);
      const mesmoValor = it.contas.every(x => centavos(x.vPagar) === centavos(c.vPagar));
      const parcelas = n > 1
        ? `${n} parcelas (${esc(c.parcela)} a ${esc(ult.parcela)})${mesmoValor ? ` · <span class="money">${fmt(c.vPagar)}</span> cada` : ''}`
        : (c.parcela && c.parcela !== '1 de 1' ? esc(c.parcela) : '');
      const vence = n > 1 ? `${fmtDate(c.data)} a ${fmtDate(ult.data)}` : `vence ${fmtDate(c.data)}`;
      const meta = [`${esc(it.por)} ${it.motivo === 'edicao' ? 'alterou' : 'cadastrou'} ${this._quandoAprov(it.emIso)}`,
        this.respHtml(c), parcelas, vence].filter(Boolean).join(' · ');
      const det = it.motivo === 'edicao' && c.aprovacao.detalhes
        ? `<div class="aprov-det">${esc(c.aprovacao.detalhes)}</div>` : '';
      return `<div class="aprov-item">
        <div class="aprov-top">
          <span class="aprov-tag ${it.motivo === 'edicao' ? 'edi' : 'cad'}">${it.motivo === 'edicao' ? 'Alterada' : 'Nova'}</span>
          <button type="button" class="aprov-nome" onclick="APP.verConta('${c.id}')" title="Ver dados da conta">${esc(c.conta)}</button>
          <span class="aprov-valor money">${fmt(cent / 100)}</span>
        </div>
        <div class="aprov-meta">${meta}</div>${det}
        <div class="aprov-acoes">
          <button type="button" class="btn btn-ghost btn-sm" onclick="APP.verConta('${c.id}')">Ver conta</button>
          <button type="button" class="btn btn-primary btn-sm" data-aprov="${esc(it.chave)}" onclick="APP.aprovarItem(this.dataset.aprov, this)">✓ Aprovar${n > 1 ? ` ${n}` : ''}</button>
        </div>
      </div>`;
    }).join('');
    this.aplicarAvatares?.();
  },

  /** Grava a aprovação (FS.aprovarContas confere, em transação, se cada conta segue na versão vista). */
  async _aprovar(contas, btn){
    if(btn) btn.classList.add('loading');
    try{
      const r = await FS.aprovarContas(contas.map(c => ({id:c.id, emIso:c.aprovacao.emIso})));
      if(r.ok) this.toast(`${r.ok} conta${r.ok > 1 ? 's' : ''} aprovada${r.ok > 1 ? 's' : ''} ✅`, 'success');
      if(r.mudaram) this.toast(`${r.mudaram} conta${r.mudaram > 1 ? 's mudaram' : ' mudou'} depois que a lista abriu: confira de novo`, 'info');
      return r;
    }catch(e){
      this.toast(e.message || 'Erro ao aprovar', 'error');
      return null;
    }finally{ if(btn) btn.classList.remove('loading'); }
  },

  aprovarItem(chave, btn){
    const it = this._aprovItens?.get(chave);
    if(it) this._aprovar(it.contas, btn);
  },

  async aprovarTodas(){
    const contas = this.aprovacoesPendentes();
    if(!contas.length) return;
    if(!confirm(`Aprovar ${contas.length} conta${contas.length > 1 ? 's' : ''}?`)) return;
    await this._aprovar(contas, document.getElementById('aprovTodas'));
  },

  /** Botão Aprovar do modal da conta. */
  async aprovarConta(id){
    const c = CACHE.contas.find(x => x.id === id);
    if(!c || !this._precisaAprovar(c)) return;
    const r = await this._aprovar([c]);
    if(r?.ok){ const av = document.getElementById('contaAviso'); if(av){ av.hidden = true; av.innerHTML = ''; } }
  },
});
