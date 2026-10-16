"use strict";

/**
 * Filtro por Período (modal #ovPeriodo): intervalo de meses dentro de um ano.
 * Cada tela guarda o seu período em STATE e, enquanto ativo, ignora os
 * filtros de Ano/Mês da própria tela. Telas suportadas em PERIODO_TELAS.
 */
const PERIODO_TELAS = {
  dashboard: { chave: 'periodoDash',     badge: 'periodoBadgeDash',     render: app => app.renderDashboard() },
  contas:    { chave: 'periodoContas',   badge: 'periodoBadgeContas',   render: app => { app._ordenarContasPorVencimento(); STATE.pg = 1; app.renderContas(); } },
  receitas:  { chave: 'periodoReceitas', badge: 'periodoBadgeReceitas', render: app => { STATE.pgReceitas = 1; app.renderReceitas(); } },
  relatorio: { chave: 'periodo',         badge: 'periodoBadge',         render: app => app.renderRelatorio() },
};

Object.assign(APP, {

  /** Tela alvo do modal; desconhecida cai em 'relatorio' (comportamento original). */
  _telaPeriodo(tela) {
    const t = tela || document.getElementById('ovPeriodo').getAttribute('data-tela') || STATE.periodoTela || 'relatorio';
    return PERIODO_TELAS[t] ? t : 'relatorio';
  },

  openPeriodo(tela) {
    const t = this._telaPeriodo(tela || 'relatorio');
    STATE.periodoTela = t;
    document.getElementById('ovPeriodo').setAttribute('data-tela', t);
    const p = STATE[PERIODO_TELAS[t].chave];
    document.getElementById('periodoAno').value    = p ? p.ano    : new Date().getFullYear();
    document.getElementById('periodoMesIni').value = p ? p.mesIni : '';
    document.getElementById('periodoMesFim').value = p ? p.mesFim : '';
    document.getElementById('ovPeriodo').classList.add('open');
  },

  aplicarPeriodo(tela) {
    const t = this._telaPeriodo(tela);
    const ano    = parseInt(document.getElementById('periodoAno').value);
    const mesIni = document.getElementById('periodoMesIni').value;
    const mesFim = document.getElementById('periodoMesFim').value;
    if (!anoValido(ano)) return this.toast('Informe um ano valido (4 digitos)', 'error');
    if (mesIni === '' || mesFim === '')    return this.toast('Selecione o mes inicial e o mes final', 'error');
    if (parseInt(mesFim) < parseInt(mesIni)) return this.toast('O mes final nao pode ser anterior ao mes inicial', 'error');
    const p = { ano, mesIni: parseInt(mesIni), mesFim: parseInt(mesFim) };
    STATE[PERIODO_TELAS[t].chave] = p;
    APP.closeModal('ovPeriodo');
    this._atualizarPeriodoBadge(t, p);
    PERIODO_TELAS[t].render(this);
  },

  limparPeriodo(tela) {
    const t = this._telaPeriodo(tela);
    STATE[PERIODO_TELAS[t].chave] = null;
    APP.closeModal('ovPeriodo');
    this._atualizarPeriodoBadge(t, null);
    PERIODO_TELAS[t].render(this);
  },

  _atualizarPeriodoBadge(tela, p) {
    const badge = PERIODO_TELAS[tela] && document.getElementById(PERIODO_TELAS[tela].badge);
    if (!badge) return;
    if (!p) { badge.style.display = 'none'; return; }
    badge.style.display = 'inline-flex';
    badge.innerHTML = `📅 ${MESES_F[p.mesIni]} → ${MESES_F[p.mesFim]} ${p.ano} &nbsp;✕`;
  }

});
