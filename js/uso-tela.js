/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO uso-tela.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Aba "📈 Uso" de Configurações (somente admin, README 13.5). Mostra o que js/uso.js mediu:
 *   • hoje (dia de cota do Firebase): leituras, gravações e exclusões × cota grátis, por pessoa;
 *   • aberturas do app e leituras por abertura (custo de abrir o app);
 *   • últimos 30 dias (% da cota, com tabela), por coleção e por usuário;
 *   • esta sessão: contagem ao vivo, listeners ativos e o que falta gravar;
 *   • armazenamento estimado das coleções que o app mantém em memória.
 * Leitura: uso_diario (até 30 documentos) só ao abrir a aba, no Atualizar ou após 60 s;
 * os redesenhos por dados novos (listeners) reaproveitam a última leitura.
 *
 * DEPENDÊNCIAS: uso.js (USO, USO_COTA), fin-cache (CACHE), ui-charts (APP.mkChart),
 *   firebase-config (FB_CONFIG), relatorios.js (APP._escHtml).
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

const USO_TTL_MS = 60 * 1000;
// Nome amigável das coleções (o ID técnico aparece ao lado)
const USO_NOMES = Object.freeze({
  contas:'Contas', salarios:'Salários', outras_receitas:'Outras receitas', categorias:'Categorias',
  formas:'Formas de pagamento', config:'Configurações', logs:'Log de atividades', logs_acesso:'Log de acesso',
  lixeira:'Lixeira de contas', notes:'Notas', notes_trash:'Lixeira de notas', notes_log:'Log de notas',
  categoria_grupos:'Grupos (EAC)', eac_lb:'Linhas de base (EAC)', eac_lb_itens:'Itens das LBs (EAC)',
  eac_exclusoes:'Excluídas (EAC)', eac_log:'Log da EAC', avatares:'Fotos de perfil', importacoes:'Importações',
  cartoes:'Cartões', uso_diario:'Esta medição de uso', activity_log:'Log antigo',
});

/**
 * Tamanho de um documento pela regra de armazenamento do Firestore: nome do documento
 * (segmentos + 1 byte cada + 16) + campos (nome + 1 byte + valor) + 32 bytes.
 * Valor: texto em UTF-8 + 1; número e data 8; booleano e nulo 1; lista e mapa somam os itens.
 */
const usoTamanhoDoc = (() => {
  const enc = new TextEncoder();
  const txt = s => enc.encode(s).length + 1;
  const valor = v => {
    if(v === null || v === undefined) return 1;
    if(typeof v === 'string') return txt(v);
    if(typeof v === 'number') return 8;
    if(typeof v === 'boolean') return 1;
    if(typeof v.toDate === 'function') return 8;   // Timestamp
    if(Array.isArray(v)) return v.reduce((s, x) => s + valor(x), 0);
    if(typeof v === 'object') return Object.entries(v).reduce((s, [k, x]) => s + txt(k) + valor(x), 0);
    return 8;
  };
  return (colecao, id, dados) => {
    let campos = 0;
    Object.entries(dados || {}).forEach(([k, v]) => { if(k !== 'id') campos += txt(k) + valor(v); });
    return txt(colecao) + txt(String(id)) + 16 + campos + 32;
  };
})();

Object.assign(APP, {

  _usoCache: null,      // {em, dias, erro}
  _usoLendo: null,      // leitura em andamento (evita leituras repetidas nos redesenhos)

  /** Abre/atualiza a aba. forcar: lê uso_diario de novo (botão Atualizar). */
  async cfgUsoCarregar(forcar = false){
    const corpo = document.getElementById('cfgUsoCorpo');
    if(!corpo || typeof USO === 'undefined') return;
    const link = document.getElementById('cfgUsoConsole');
    if(link && typeof FB_CONFIG !== 'undefined') link.href = `https://console.firebase.google.com/project/${FB_CONFIG.projectId}/firestore/databases/-default-/usage`;
    const fresco = this._usoCache && Date.now() - this._usoCache.em < USO_TTL_MS;
    if(forcar || !fresco){
      if(!this._usoLendo){
        const btn = document.getElementById('cfgUsoAtualizar');
        btn?.classList.add('loading');
        this._usoLendo = USO.lerDias(this._usoIds()[0])
          .then(dias => ({em: Date.now(), dias, erro: ''}))
          .catch(e => ({em: Date.now(), dias: this._usoCache?.dias || [], erro: e.message || String(e)}))
          .then(r => { this._usoCache = r; })
          .finally(() => { this._usoLendo = null; btn?.classList.remove('loading'); });
      }
      if(!this._usoCache) corpo.innerHTML = '<p class="uso-vazio">⏳ Lendo o uso dos últimos 30 dias…</p>';
      await this._usoLendo;
    }
    if(document.getElementById('cfgUsoCorpo')) this._usoRender();
  },

  /**
   * Os 30 dias de cota até hoje, do mais antigo ao atual ('YYYY-MM-DD'). Aritmética de
   * calendário (UTC): passos de 24 h pulariam ou repetiriam um dia na troca de horário do Pacífico.
   */
  _usoIds(){
    const [y, m, d] = USO.diaCota().split('-').map(Number);
    return Array.from({length: 30}, (_, i) => new Date(Date.UTC(y, m - 1, d - 29 + i)).toISOString().slice(0, 10));
  },

  _usoRender(){
    const corpo = document.getElementById('cfgUsoCorpo');
    if(!corpo) return;
    const esc = v => this._escHtml(v);
    const n = v => Math.round(v || 0).toLocaleString('pt-BR');
    const pct = (v, cota) => v > 0 && v / cota < 1e-4 ? '< 0,01%'
      : (v / cota * 100).toLocaleString('pt-BR', {maximumFractionDigits: v / cota < .01 ? 2 : 1}) + '%';
    const soma = m => Object.values(m || {}).reduce((t, v) => t + (Number(v) || 0), 0);
    const s = USO.retrato();
    const cache = this._usoCache || {dias: [], erro: ''};

    // Dias: documento do servidor; hoje soma também o que esta sessão ainda não gravou
    const porDia = new Map(cache.dias.map(d => [d.id, d]));
    const totalDia = d => ({l: soma(d?.leituras), g: soma(d?.gravacoes), e: soma(d?.exclusoes), s: soma(d?.sessoes), c: soma(d?.carga)});
    const hoje = totalDia(porDia.get(s.dia));
    hoje.l += s.pend.l; hoje.g += s.pend.g; hoje.e += s.pend.e;
    const hojeQuem = {};
    ['leituras','gravacoes','exclusoes'].forEach((k, i) => {
      Object.entries(porDia.get(s.dia)?.[k] || {}).forEach(([u, v]) => { (hojeQuem[u] ||= {l:0,g:0,e:0})['lge'[i]] += Number(v) || 0; });
    });
    if(STATE.usuario){ const q = (hojeQuem[STATE.usuario] ||= {l:0,g:0,e:0}); q.l += s.pend.l; q.g += s.pend.g; q.e += s.pend.e; }

    // 30 dias de cota, do mais antigo ao de hoje (dias sem uso = 0)
    const ids = this._usoIds();
    const serie = ids.map(id => id === s.dia ? hoje : totalDia(porDia.get(id)));
    const ult7 = serie.slice(-7), media7 = ult7.reduce((t, d) => t + d.l, 0) / 7;
    const pico = serie.reduce((m, d, i) => d.l > m.v ? {v: d.l, i} : m, {v: 0, i: -1});
    const tot30 = serie.reduce((t, d) => ({l: t.l + d.l, g: t.g + d.g, e: t.e + d.e, s: t.s + d.s, c: t.c + d.c}), {l:0,g:0,e:0,s:0,c:0});

    // Status pela fração da cota: texto + cor (a cor nunca sozinha)
    const status = f => f >= .8 ? ['alto', 'Perto do limite'] : f >= .5 ? ['medio', 'Atenção'] : ['ok', 'Folga'];
    const kpi = (tit, v, cota, chave) => {
      const f = v / cota, [cls, rot] = status(f);
      const quem = Object.entries(hojeQuem).filter(([, q]) => q[chave]).map(([u, q]) => `${esc(u)} ${n(q[chave])}`).join(' · ');
      return `<div class="uso-kpi">
        <span class="uso-kpi-tit">${tit}</span>
        <b class="uso-kpi-v">${n(v)}</b>
        <span class="uso-kpi-de">de ${n(cota)} por dia · <b>${pct(v, cota)}</b> <span class="uso-st ${cls}">${rot}</span></span>
        <span class="uso-barra ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, f * 100).toFixed(1)}" aria-label="${tit}: ${pct(v, cota)} da cota diária"><i style="width:${Math.min(100, f * 100)}%"></i></span>
        <span class="uso-kpi-quem">${quem || 'Sem uso hoje'}</span>
      </div>`;
    };
    const stat = (rot, val, dica = '') => `<div class="up-stat uso-stat"${dica ? ` title="${esc(dica)}"` : ''}><label>${rot}</label><div class="sv">${val}</div></div>`;
    const diaBr = id => id ? id.split('-').reverse().join('/') : '—';
    const hora = d => d ? d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : '—';

    // Por coleção e por usuário (30 dias)
    const porCol = {};
    cache.dias.forEach(d => Object.entries(d.colecoes || {}).forEach(([c, v]) => {
      const a = porCol[c] ||= {l:0,g:0,e:0};
      a.l += Number(v.l) || 0; a.g += Number(v.g) || 0; a.e += Number(v.e) || 0;
    }));
    const cols = Object.entries(porCol).sort((x, y) => y[1].l - x[1].l || y[1].g - x[1].g);
    const lTot = cols.reduce((t, [, v]) => t + v.l, 0) || 1;
    const porUsr = {};
    cache.dias.forEach(d => ['leituras','gravacoes','exclusoes','sessoes','carga'].forEach(k =>
      Object.entries(d[k] || {}).forEach(([u, v]) => { (porUsr[u] ||= {leituras:0,gravacoes:0,exclusoes:0,sessoes:0,carga:0})[k] += Number(v) || 0; })));

    // Armazenamento estimado: só o que o app mantém em memória
    const notas = typeof NOTES_STATE !== 'undefined' ? NOTES_STATE : null;
    const fontes = [
      ['contas', CACHE.contas], ['salarios', CACHE.salarios], ['outras_receitas', CACHE.outras],
      ['categorias', CACHE.cats], ['formas', CACHE.formas], ['categoria_grupos', CACHE.grupos],
      ['eac_lb', CACHE.lbs], ['eac_exclusoes', CACHE.eacExcl],
      ['avatares', Object.entries(CACHE.avatares || {}).map(([id, d]) => ({id, ...d}))],
      ['config', CACHE.tabelas ? [{id: 'tabelas', ...CACHE.tabelas}] : []],
      ['notes', notas?.notes || []], ['notes_trash', notas?.trash || []],
    ].map(([c, docs]) => ({c, qtd: docs.length, bytes: docs.reduce((t, d) => t + usoTamanhoDoc(c, d.id, d), 0)}))
     .filter(x => x.qtd);
    const bytesTot = fontes.reduce((t, x) => t + x.bytes, 0);
    const tam = b => b >= 1048576 ? `${(b / 1048576).toLocaleString('pt-BR', {maximumFractionDigits: 1})} MB` : `${(b / 1024).toLocaleString('pt-BR', {maximumFractionDigits: 1})} KB`;
    const nomeCol = c => `${esc(USO_NOMES[c] || c)} <code>${esc(c)}</code>`;
    const sessCols = Object.entries(s.col).sort((x, y) => y[1].l - x[1].l).slice(0, 4).filter(([, v]) => v.l)
      .map(([c, v]) => `${esc(USO_NOMES[c] || c)} ${n(v.l)}`).join(' · ');

    const avisos = [
      cache.erro && `<div class="callout callout-error uso-callout">⚠️ Não foi possível ler <code>uso_diario</code>: ${esc(cache.erro)}. Confira as regras do Firestore (README, seção 15). A sessão atual continua medida abaixo.</div>`,
      s.desligado && `<div class="callout callout-warn uso-callout">⚠️ A medição desta sessão não está sendo gravada${s.erro ? `: ${esc(s.erro)}` : ''}. Os números de hoje mostram só este aparelho até a regra do Firestore liberar <code>uso_diario</code>.</div>`,
    ].filter(Boolean).join('');

    corpo.innerHTML = `
      <div class="callout callout-info uso-callout">ℹ️ Medido pelo próprio app em cada aparelho (Leo e Pri) e somado por dia. É uma estimativa: o número oficial, com leituras do Console e cobranças de reconexão, está no <b>Console do Firebase</b>. O dia da cota grátis vira à meia-noite do horário do Pacífico (entre 4h e 5h em Brasília).</div>
      ${avisos}
      <h4 class="uso-tit">Hoje <span>dia de cota ${diaBr(s.dia)}</span></h4>
      <div class="uso-kpis">
        ${kpi('Leituras', hoje.l, USO_COTA.leituras, 'l')}
        ${kpi('Gravações', hoje.g, USO_COTA.gravacoes, 'g')}
        ${kpi('Exclusões', hoje.e, USO_COTA.exclusoes, 'e')}
      </div>
      <div class="uso-stats">
        ${stat('Aberturas hoje', n(hoje.s), 'Sessões do app que gravaram uso hoje (1 por aparelho aberto)')}
        ${stat('Leituras por abertura', tot30.s ? n(tot30.c / tot30.s) : '—', 'Média de 30 dias da carga inicial dos listeners: o custo de abrir o app')}
        ${stat('Média de leituras (7 dias)', n(media7), `${pct(media7, USO_COTA.leituras)} da cota diária`)}
        ${stat('Pico de leituras (30 dias)', pico.i >= 0 ? `${n(pico.v)} <small>${diaBr(ids[pico.i])}</small>` : '—', pico.i >= 0 ? `${pct(pico.v, USO_COTA.leituras)} da cota` : '')}
      </div>

      <h4 class="uso-tit">Últimos 30 dias <span>% da cota diária de cada operação</span></h4>
      <div class="uso-grafico"><canvas id="cfgUsoGrafico" role="img" aria-label="Uso dos últimos 30 dias em % da cota diária: leituras, gravações e exclusões. Os valores estão na tabela abaixo."></canvas></div>
      <details class="uso-det"><summary>Ver os dias em tabela</summary>
        <div class="table-wrap"><table class="data-table uso-tab">
          <thead><tr><th>Dia de cota</th><th class="num">Aberturas</th><th class="num">Leituras</th><th class="num">Gravações</th><th class="num">Exclusões</th></tr></thead>
          <tbody>${serie.map((d, i) => ({d, id: ids[i]})).reverse().filter(x => x.d.l || x.d.g || x.d.e).map(({d, id}) =>
            `<tr><td>${diaBr(id)}</td><td class="num">${n(d.s)}</td><td class="num">${n(d.l)}</td><td class="num">${n(d.g)}</td><td class="num">${n(d.e)}</td></tr>`).join('')
            || '<tr><td colspan="5" class="uso-vazio">Nenhum uso registrado ainda.</td></tr>'}</tbody>
          <tfoot><tr><td>30 dias</td><td class="num">${n(tot30.s)}</td><td class="num">${n(tot30.l)}</td><td class="num">${n(tot30.g)}</td><td class="num">${n(tot30.e)}</td></tr></tfoot>
        </table></div>
      </details>

      <div class="uso-duas">
        <div>
          <h4 class="uso-tit">Por usuário <span>30 dias</span></h4>
          <div class="table-wrap"><table class="data-table uso-tab">
            <thead><tr><th>Usuário</th><th class="num">Aberturas</th><th class="num">Leituras</th><th class="num">Gravações</th><th class="num">Exclusões</th><th class="num">Leit./abertura</th></tr></thead>
            <tbody>${Object.entries(porUsr).sort((x, y) => y[1].leituras - x[1].leituras).map(([u, v]) =>
              `<tr><td><span class="audit-chip">${esc(u)}</span></td><td class="num">${n(v.sessoes)}</td><td class="num">${n(v.leituras)}</td><td class="num">${n(v.gravacoes)}</td><td class="num">${n(v.exclusoes)}</td><td class="num">${v.sessoes ? n(v.carga / v.sessoes) : '—'}</td></tr>`).join('')
              || '<tr><td colspan="6" class="uso-vazio">Sem dados ainda.</td></tr>'}</tbody>
          </table></div>
        </div>
        <div>
          <h4 class="uso-tit">Por coleção <span>30 dias</span></h4>
          <div class="table-wrap"><table class="data-table uso-tab">
            <thead><tr><th>Coleção</th><th class="num">Leituras</th><th class="num">Gravações</th><th class="num">Exclusões</th><th class="num">% leituras</th></tr></thead>
            <tbody>${cols.map(([c, v]) => `<tr><td>${nomeCol(c)}</td><td class="num">${n(v.l)}</td><td class="num">${n(v.g)}</td><td class="num">${n(v.e)}</td>
              <td class="num"><span class="uso-mini" aria-hidden="true"><i style="width:${(v.l / lTot * 100).toFixed(1)}%"></i></span>${pct(v.l, lTot)}</td></tr>`).join('')
              || '<tr><td colspan="5" class="uso-vazio">Sem dados ainda.</td></tr>'}</tbody>
          </table></div>
        </div>
      </div>

      <h4 class="uso-tit">Esta sessão <span>aberta às ${hora(s.inicio)} neste aparelho</span></h4>
      <div class="uso-stats">
        ${stat('Leituras', n(s.l))}
        ${stat('Gravações', n(s.g))}
        ${stat('Exclusões', n(s.e))}
        ${stat('Carga ao abrir', n(s.carga), 'Leituras da primeira resposta de cada listener (dados que o app baixa ao abrir)')}
        ${stat('Listeners ativos', n(s.listeners), 'Conexões em tempo real abertas (cada mudança em um documento delas custa 1 leitura)')}
        ${stat('A gravar', n(s.pend.l + s.pend.g + s.pend.e), `Ainda não somado em uso_diario. Grava a cada 5 min, ao esconder a aba e ao sair. Última gravação: ${hora(s.ultimaGravacao)}`)}
      </div>
      ${sessCols ? `<p class="uso-nota">Mais lidas nesta sessão: ${sessCols}.</p>` : ''}

      <h4 class="uso-tit">Armazenamento estimado <span>${tam(bytesTot)} de 1 GB grátis · ${pct(bytesTot, USO_COTA.bytes)}</span></h4>
      <div class="table-wrap"><table class="data-table uso-tab">
        <thead><tr><th>Coleção</th><th class="num">Documentos</th><th class="num">Tamanho</th></tr></thead>
        <tbody>${fontes.sort((x, y) => y.bytes - x.bytes).map(x => `<tr><td>${nomeCol(x.c)}</td><td class="num">${n(x.qtd)}</td><td class="num">${tam(x.bytes)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="uso-nota">Calculado pela regra de tamanho do Firestore sobre os dados em memória. Índices e as coleções que o app lê só sob demanda (logs, lixeira, importações, itens das linhas de base, uso) não entram: o total oficial está no Console.</p>`;

    this._usoGrafico(ids, serie);
  },

  /** Linhas de % da cota (um eixo só: cada operação dividida pela própria cota). */
  _usoGrafico(ids, serie){
    if(typeof Chart === 'undefined') return;
    const css = getComputedStyle(document.documentElement);
    const cor = v => css.getPropertyValue(v).trim();
    const dark = document.documentElement.classList.contains('dark');
    const tick = dark ? 'rgba(235,235,245,.45)' : '#6b7280', grade = dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)';
    const SERIES = [['Leituras', 'l', USO_COTA.leituras, '--cat-1'], ['Gravações', 'g', USO_COTA.gravacoes, '--cat-2'], ['Exclusões', 'e', USO_COTA.exclusoes, '--cat-3']];
    const p = (v, c) => v / c * 100;
    this.mkChart('cfgUsoGrafico', {
      type: 'line',
      data: {
        labels: ids.map(id => id.slice(8, 10) + '/' + id.slice(5, 7)),
        datasets: SERIES.map(([rot, k, cota, v]) => ({
          label: rot, data: serie.map(d => p(d[k], cota)), _abs: serie.map(d => d[k]),
          borderColor: cor(v), backgroundColor: cor(v), borderWidth: 2, tension: .25,
          pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 12,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: {mode: 'index', intersect: false},
        plugins: {
          legend: {labels: {color: tick, font: {size: 11}, usePointStyle: true, pointStyle: 'line', padding: 16}},
          tooltip: {
            backgroundColor: 'rgba(15,31,20,.92)', padding: 10, cornerRadius: 8,
            callbacks: {
              title: ctx => 'Dia de cota ' + ctx[0].label,
              label: ctx => ` ${ctx.dataset.label}: ${Math.round(ctx.dataset._abs[ctx.dataIndex]).toLocaleString('pt-BR')} (${ctx.raw.toLocaleString('pt-BR', {maximumFractionDigits: 2})}%)`,
            },
          },
        },
        scales: {
          x: {ticks: {color: tick, font: {size: 10}, maxRotation: 0, autoSkip: true, maxTicksLimit: 10}, grid: {display: false}},
          y: {beginAtZero: true, suggestedMax: 5, ticks: {color: tick, font: {size: 10}, callback: v => v + '%'}, grid: {color: grade}},
        },
      },
    });
  },
});
