/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO janela-tela.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Aba "🗂 Dados" de Configurações (só o admin): modo de carga das contas e o caminho seguro
 * para ligar a janela (README 3.5).
 *
 *   • Situação: modo em uso, janela, contas na memória, aviso (ex.: 'on' sem emAberto).
 *   • Passo 1, preparar contas: grava o campo emAberto onde falta ou diverge (FS.prepararEmAberto).
 *   • Passo 2, diagnóstico do modo sombra: o que o 'on' leria ao abrir e o que deixaria de ver.
 *     Critério para ligar: as quatro verificações zeradas.
 *   • Passo 3, índices e regras do Firestore (texto; criados no Console).
 *   • Modo de todos os aparelhos (config/sistema) e override deste aparelho (localStorage).
 *   • Cargas sob demanda registradas (faltas) e segmentos ligados.
 * Não lê o Firestore: usa a memória (FS.janelaEstado). Gravações só nos botões.
 *
 * DEPENDÊNCIAS: fin-db (FS.janelaEstado, FS.prepararEmAberto, FS.salvarModoJanela), fin-cache
 *   (CACHE.contaPorId), app (APP._escHtml, APP.toast).
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

Object.assign(APP, {

  _janelaOcupado: false,

  /** Redesenha a aba Dados se ela estiver aberta (chamado também quando as contas mudam). */
  janelaAtualizarPainel(){
    const el = document.getElementById('cfgJanelaCorpo');
    if(!el || !el.offsetParent || STATE.usuario !== 'Leo') return;
    const esc = v => this._escHtml(v);
    const n   = v => Number(v || 0).toLocaleString('pt-BR');
    const st  = FS.janelaEstado();
    const NOMES = {off:'Off (coleção inteira)', sombra:'Sombra (inteira + diagnóstico)', on:'On (janela + sob demanda)'};
    const quando = iso => { try{ const d = iso?.toDate ? iso.toDate() : new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-BR'); }catch(e){ return ''; } };
    const stat = (rot, val, dica = '') => `<div class="up-stat uso-stat"${dica ? ` title="${esc(dica)}"` : ''}><label>${rot}</label><div class="sv">${val}</div></div>`;
    const selo = ok => ok ? '<span class="uso-st ok">OK</span>' : '<span class="uso-st alto">Corrigir</span>';
    const exemplos = ids => ids.slice(0, 8).map(id => { const c = CACHE.contaPorId(id); return c ? `${esc(c.conta || id)} (${esc(c.data || 'sem data')}, ${esc(c.resp || 'sem responsável')})` : esc(id); }).join('; ')
      + (ids.length > 8 ? `; e mais ${n(ids.length - 8)}` : '');

    const migrado = st.cfg.emAbertoMigrado === true;
    const d = st.diag;
    const checks = d ? [
      ['Contas em aberto de antes da janela sem emAberto (sumiriam das atrasadas)', d.abertasPerdidas],
      ['emAberto diferente do pagamento', d.emAbertoDivergente],
      ['Vencimento fora do formato AAAA-MM-DD (ficariam fora das consultas)', d.dataInvalida],
      ['Responsável fora de Leo, Pri ou Leo & Pri', d.respInvalido],
    ] : [];
    const tudoOk = !!d && checks.every(([, ids]) => !ids.length);
    const leituraOn = d ? d.base + d.abertas + d.pendentes : 0;

    el.innerHTML = [
      st.aviso && `<div class="callout callout-warn uso-callout">⚠️ ${esc(st.aviso)}</div>`,
      `<div class="uso-stats">
        ${stat('Modo em uso', esc(NOMES[st.modo] || st.modo), st.local ? 'Definido só neste aparelho' : 'Definido para todos os aparelhos (ou padrão do sistema)')}
        ${stat('Janela de abertura', st.ini ? `${esc(st.ini.slice(0,4))}${st.fim.slice(0,4) !== st.ini.slice(0,4) ? '–' + esc(st.fim.slice(0,4)) : ''}` : '—', 'Vencimentos carregados ao abrir no modo on (contas do usuário logado e compartilhadas)')}
        ${stat('Contas na memória', `${n(st.carregadas)} <small>${st.completa || st.modo === 'sombra' ? 'coleção inteira' : 'parcial'}</small>`)}
      </div>`,
      `<p class="uso-nota">No modo <b>on</b>, o app abre só com as contas do usuário logado e as compartilhadas que vencem no ano vigente, mais as em aberto de anos anteriores e, para você, as pendentes de aprovação. Ao escolher outro ano, "Todos", a outra pessoa, a EAC ou um parcelamento, o app carrega o que falta e mostra "Carregando contas…" até chegar. Nenhum total é calculado com dados pela metade.</p>`,

      `<div class="uso-tit">1. Preparar contas <span>campo emAberto, usado para achar as atrasadas de anos anteriores</span></div>`,
      migrado
        ? `<p class="uso-nota">${selo(true)} Preparado${st.cfg.emAbertoPor ? ` por ${esc(st.cfg.emAbertoPor)}` : ''}${st.cfg.emAbertoEm ? ` em ${esc(quando(st.cfg.emAbertoEm))}` : ''} (${n(st.cfg.emAbertoCorrigidas)} conta(s) gravadas). Pode rodar de novo para corrigir divergências.</p>`
        : `<p class="uso-nota">${selo(false)} Ainda não preparado: o modo on fica bloqueado até isso.</p>`,
      `<div class="uso-acoes"><button class="btn btn-secondary btn-sm" onclick="APP.janelaPreparar()" ${this._janelaOcupado ? 'disabled' : ''}>${this._janelaOcupado ? '⏳ Gravando…' : '🛠️ Preparar contas'}</button></div>`,
      `<p class="uso-nota">Grava 1 vez em cada conta que não tem o campo ou que está divergente (conta na cota de gravações do dia). <b>Antes</b>, inclua <code>emAberto</code> na regra de pagamento das contas no Firestore (README, seção 15), senão os pagamentos da Pri em contas compartilhadas do admin são recusados.</p>`,

      `<div class="uso-tit">2. Diagnóstico do modo sombra <span>${d ? `atualizado às ${esc(d.em.toLocaleTimeString('pt-BR'))}` : 'disponível só no modo sombra'}</span></div>`,
      d ? `<div class="table-wrap"><table class="data-table uso-tab"><thead><tr><th>Verificação</th><th class="num">Contas</th><th>Situação</th></tr></thead><tbody>
        ${checks.map(([rot, ids]) => `<tr><td>${esc(rot)}${ids.length ? `<div class="uso-nota" style="margin:4px 0 0">${exemplos(ids)}</div>` : ''}</td><td class="num">${n(ids.length)}</td><td>${selo(!ids.length)}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="uso-stats">
          ${stat('Leituras ao abrir no on', `${n(leituraOn)} <small>de ${n(d.total)}</small>`, `Janela do usuário ${n(d.base)} + em aberto antigas ${n(d.abertas)} + pendentes ${n(d.pendentes)}`)}
          ${stat('Economia por abertura', d.total ? `${Math.max(0, Math.round((1 - leituraOn / d.total) * 100))}%` : '—', 'Comparado com ler a coleção inteira')}
          ${stat('Contas por responsável', Object.entries(d.porResp).map(([r, q]) => `${esc(r)} ${n(q)}`).join(' · ') || '—')}
        </div>
        <p class="uso-nota">${tudoOk ? selo(true) + ' Critério atendido: com o campo preparado, o modo on pode ser ligado.' : 'Ligue o modo on só com as quatro verificações zeradas. Corrija as contas listadas (edite a data ou o responsável) e rode "Preparar contas" de novo.'}</p>`
        : `<p class="uso-nota">Use o modo sombra por alguns dias para conferir aqui, com os dados reais, o que o modo on carregaria.</p>`,

      `<div class="uso-tit">3. Índices do Firestore <span>criados uma vez no Console</span></div>`,
      `<p class="uso-nota">O modo on usa dois índices compostos na coleção <code>contas</code>: <code>resp</code> + <code>data</code> e <code>emAberto</code> + <code>data</code> (ambos crescentes). Sem eles, o Firestore recusa a consulta, o app avisa, carrega todas as contas (correto, sem economia) e o erro no console traz o link que cria o índice.</p>`,

      `<div class="uso-tit">Modo de carga</div>`,
      `<div class="janela-modos">
        <label>Todos os aparelhos
          <select id="janelaModoSistema">${['off','sombra','on'].map(m => `<option value="${m}"${(st.cfg.janelaContas || FEATURES.janelaContas) === m ? ' selected' : ''}${m === 'on' && !migrado ? ' disabled' : ''}>${esc(NOMES[m])}</option>`).join('')}</select>
        </label>
        <button class="btn btn-primary btn-sm" onclick="APP.janelaSalvarModo()">Salvar</button>
        <label>Só neste aparelho
          <select id="janelaModoLocal"><option value="">Seguir o sistema</option>${['off','sombra','on'].map(m => `<option value="${m}"${st.local === m ? ' selected' : ''}>${esc(NOMES[m])}</option>`).join('')}</select>
        </label>
        <button class="btn btn-ghost btn-sm" onclick="APP.janelaAplicarLocal()">Aplicar e recarregar</button>
      </div>`,
      `<p class="uso-nota">O modo vale na próxima abertura do app em cada aparelho. Para testar o on só no seu aparelho antes de ligar para todos, use "Só neste aparelho". Voltar para off desfaz tudo na hora seguinte em que o app abrir.</p>`,

      st.faltas.length ? `<details class="uso-det"><summary>Cargas sob demanda nesta sessão (${n(st.faltas.length)})</summary>
        <div class="table-wrap"><table class="data-table uso-tab"><thead><tr><th>Pedido</th><th class="num">Vezes</th></tr></thead><tbody>
        ${st.faltas.map(f => `<tr><td>${esc(f.origem)}</td><td class="num">${n(f.vezes)}</td></tr>`).join('')}
        </tbody></table></div></details>` : '',
      st.segmentos.length ? `<details class="uso-det"><summary>Consultas ligadas (${n(st.segmentos.length)})</summary>
        <div class="table-wrap"><table class="data-table uso-tab"><thead><tr><th>Consulta</th><th class="num">Contas</th></tr></thead><tbody>
        ${st.segmentos.map(s => `<tr><td><code>${esc(s.chave)}</code>${s.pronto ? '' : ' (carregando)'}</td><td class="num">${n(s.docs)}</td></tr>`).join('')}
        </tbody></table></div></details>` : '',
    ].filter(Boolean).join('');
  },

  async janelaPreparar(){
    if(this._janelaOcupado) return;
    if(!confirm('Gravar o campo emAberto nas contas que não o têm ou estão divergentes?\n\nConfirme antes que a regra do Firestore aceita o campo emAberto (README, seção 15).')) return;
    this._janelaOcupado = true; this.janelaAtualizarPainel();
    try{
      const n = await FS.prepararEmAberto();
      this.toast(`Contas preparadas: ${n} gravada(s) ✅`, 'success');
    }catch(e){
      console.error('[Dados] preparar contas:', e);
      this.toast('Falha ao preparar as contas: ' + e.message, 'error');
    }finally{
      this._janelaOcupado = false; this.janelaAtualizarPainel();
    }
  },

  async janelaSalvarModo(){
    const modo = document.getElementById('janelaModoSistema')?.value;
    try{
      await FS.salvarModoJanela(modo);
      this.toast('Modo salvo: vale na próxima abertura do app em cada aparelho', 'success');
      this.janelaAtualizarPainel();
    }catch(e){ this.toast(e.message, 'error'); }
  },

  janelaAplicarLocal(){
    const modo = document.getElementById('janelaModoLocal')?.value || '';
    try{ modo ? localStorage.setItem('dt_janela', modo) : localStorage.removeItem('dt_janela'); }
    catch(e){ return this.toast('Este navegador não deixou gravar a preferência', 'error'); }
    location.reload();
  },
});
