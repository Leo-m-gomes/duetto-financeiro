"use strict";

Object.assign(APP, {

  openPeriodo(tela) {
    const t = tela || 'relatorio';
    STATE.periodoTela = t;
    document.getElementById('ovPeriodo').setAttribute('data-tela', t);
    const p = t === 'dashboard' ? STATE.periodoDash : t === 'contas' ? STATE.periodoContas : STATE.periodo;
    document.getElementById('periodoAno').value    = p ? p.ano    : new Date().getFullYear();
    document.getElementById('periodoMesIni').value = p ? p.mesIni : '';
    document.getElementById('periodoMesFim').value = p ? p.mesFim : '';
    document.getElementById('ovPeriodo').classList.add('open');
  },

  aplicarPeriodo(tela) {
    const t = tela || document.getElementById('ovPeriodo').getAttribute('data-tela') || STATE.periodoTela || 'relatorio';
    const ano    = parseInt(document.getElementById('periodoAno').value);
    const mesIni = document.getElementById('periodoMesIni').value;
    const mesFim = document.getElementById('periodoMesFim').value;
    if (!ano || ano < 2019 || ano > 2035) return this.toast('Informe um ano valido (2019-2035)', 'error');
    if (mesIni === '' || mesFim === '')    return this.toast('Selecione o mes inicial e o mes final', 'error');
    if (parseInt(mesFim) < parseInt(mesIni)) return this.toast('O mes final nao pode ser anterior ao mes inicial', 'error');
    const p = { ano, mesIni: parseInt(mesIni), mesFim: parseInt(mesFim) };
    if (t === 'dashboard')      STATE.periodoDash   = p;
    else if (t === 'contas')    STATE.periodoContas = p;
    else                        STATE.periodo       = p;
    APP.closeModal('ovPeriodo');
    this._atualizarPeriodoBadge(t, p);
    if (t === 'dashboard')      this.renderDashboard();
    else if (t === 'contas')  { this._ordenarContasPorVencimento(); STATE.pg = 1; this.renderContas(); }
    else                        this.renderRelatorio();
  },

  limparPeriodo(tela) {
    const t = tela || document.getElementById('ovPeriodo').getAttribute('data-tela') || STATE.periodoTela || 'relatorio';
    if (t === 'dashboard')      STATE.periodoDash   = null;
    else if (t === 'contas')    STATE.periodoContas = null;
    else                        STATE.periodo       = null;
    APP.closeModal('ovPeriodo');
    this._atualizarPeriodoBadge(t, null);
    if (t === 'dashboard')      this.renderDashboard();
    else if (t === 'contas')  { this._ordenarContasPorVencimento(); STATE.pg = 1; this.renderContas(); }
    else                        this.renderRelatorio();
  },

  _atualizarPeriodoBadge(tela, p) {
    const idMap = { dashboard: 'periodoBadgeDash', contas: 'periodoBadgeContas', relatorio: 'periodoBadge' };
    const badge = document.getElementById(idMap[tela]);
    if (!badge) return;
    if (!p) { badge.style.display = 'none'; return; }
    badge.style.display = 'inline-flex';
    badge.innerHTML = `📅 ${MESES_F[p.mesIni]} → ${MESES_F[p.mesFim]} ${p.ano} &nbsp;✕`;
  }

});
