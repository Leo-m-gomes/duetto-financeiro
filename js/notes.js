/**
 * DUETTO FINANCEIRO, MODULO notes.js (Fase B.2)
 * Modulo Notas e Acoes. 100% isolado do app.js legado.
 *
 * ARQUITETURA:
 *   Estado:       NOTES_STATE (local, nao polui STATE global)
 *   Persistencia: Firestore colecoes 'notes', 'notes_trash', 'notes_log'
 *   Render:       acionado via evento 'duetto:view-loaded' page='notas'
 *   Permissoes:   consome SEC.isAdmin() e STATE.usuario
 *   Toast:        consome APP.toast(msg, type)
 *   Modais:       vivem dentro de views/notas.html (isolamento DOM)
 *
 * NAMESPACE: window.NT com init() e destroy()
 * ZERO ACOPLAMENTO COM APP.JS:
 *   APP.renderPage('notas') NAO tem case para notas (intencional).
 */
"use strict";

"use strict";

/* ═════════════════════════════════════════════════════════════════════
   CONSTANTES GLOBAIS DO MÓDULO
   ───────────────────────────────────────────────────────────────────── */

/**
 * Nomes dos meses em português, indexados 0-11.
 * Usado pelo filtro de período (padrão Duetto: Ano + Mês Início + Mês Fim).
 */
const NT_MESES_F = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/**
 * Definição centralizada das colunas disponíveis na tabela Lista.
 *
 * Cada coluna possui:
 *   - key: identificador único (chave em listSort, columnsConfig)
 *   - label: rótulo exibido no cabeçalho
 *   - type: 'string' | 'number' | 'date' | 'status' (define comparador e classe CSS)
 *   - sortable: indica se o cabeçalho responde ao clique
 *   - defaultVisible: estado inicial quando o usuário não tem preferência salva
 *   - width: largura sugerida em CSS (string com %)
 *
 * A ordem deste array é a ORDEM PADRÃO. O usuário pode reordenar e ocultar
 * via modal de configuração (persistência em localStorage por usuário).
 */
const NT_LIST_COLUMNS = [
  // Título PRIMEIRO conforme solicitado.
  {key:'titulo',      label:'Título',          type:'string', sortable:true,  defaultVisible:true,  width:'26%'},
  {key:'status',      label:'Status',          type:'status', sortable:true,  defaultVisible:true,  width:'10%'},
  {key:'tipo',        label:'Tipo',            type:'string', sortable:true,  defaultVisible:true,  width:'9%'},
  {key:'autor',       label:'Autor',           type:'string', sortable:true,  defaultVisible:true,  width:'9%'},
  {key:'responsavel', label:'Responsável',     type:'string', sortable:true,  defaultVisible:true,  width:'12%'},
  {key:'prazo',       label:'Prazo',           type:'date',   sortable:true,  defaultVisible:true,  width:'10%'},
  {key:'itens',       label:'Itens',           type:'number', sortable:true,  defaultVisible:true,  width:'7%'},
  // Novas colunas solicitadas.
  {key:'vPrevisto',   label:'Vlr Previsto',    type:'number', sortable:true,  defaultVisible:true,  width:'9%'},
  {key:'vRealizado',  label:'Vlr Realizado',   type:'number', sortable:true,  defaultVisible:true,  width:'9%'}
];

/* ═════════════════════════════════════════════════════════════════════
   CONSTANTES DE GOVERNANÇA
   ───────────────────────────────────────────────────────────────────── */

/**
 * Lista de usuários com poderes administrativos.
 * Admins ignoram a regra de autor único e podem editar/excluir qualquer nota.
 * Em produção, espelhada nas Security Rules do Firestore como segunda camada.
 */
/* ═════════════════════════════════════════════════════════════════════
   ESTADO DO MÓDULO
   ───────────────────────────────────────────────────────────────────── */
const NOTES_STATE = {
  // Usuário simulado, substitui STATE.usuario na fase de integração.
  // Notas ativas (não excluídas).
  notes: [],
  // Notas movidas para a lixeira.
  trash: [],
  // Log de atividades em ordem cronológica de inserção.
  activityLog: [],
  // ID da nota em edição no momento, null quando criando.
  editingId: null,
  // Itens da nota em edição, isolados durante a sessão do modal.
  draftItems: [],
  // Índice em draftItems do item em edição via sub-modal. null = criando novo item.
  editingItemIdx: null,
  // Filtros da listagem. Cada chave em '' significa "sem filtro".
  // Aplicados em AND sobre o conjunto de notas em ntApplyFilters.
  filters: {
    autor:   '',  // '' | 'Leo' | 'Pri'
    tipo:    '',  // '' | 'anotacao' | 'acao'
    status:  ''   // '' | 'ativa' | 'atraso' | 'concluida' (status efetivo)
  },
  // Filtro de período (padrão Duetto), substitui o antigo dataIni/dataFim.
  // Estrutura: null (sem filtro) ou { ano:int, mesIni:0-11, mesFim:0-11 }.
  // Aplica EXCLUSIVAMENTE a notas tipo='acao' com prazo definido.
  periodo: null,
  // Texto da busca rápida profunda. Aplicado em AND junto aos filtros.
  searchQuery: '',
  // Modo de visualização: 'grade' (Kanban, padrão) | 'lista' (Planner).
  viewMode: 'grade',
  // Painel de Análise (KPIs + filtros) inicia oculto, foco no Kanban.
  analyticsOpen: false,
  // Ordenação manual da tabela Lista. Quando column é null, usa ordem default
  // por status. dir aceita 'asc' | 'desc'.
  listSort: { column: null, dir: 'asc' },
  // Configuração de colunas da Lista por usuário.
  // Carregada via ntLoadColumns(STATE.usuario) no init.
  // Estrutura: array de {key, visible} na ordem desejada de exibição.
  columnsConfig: []
};

/* ═════════════════════════════════════════════════════════════════════
   HELPERS PUROS
   ───────────────────────────────────────────────────────────────────── */

/**
 * Gera ID único curto. Em produção, usar Firestore .doc().id.
 * @returns {string}
 */
function ntUid(){
  return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7);
}

/**
 * Data ISO de hoje (YYYY-MM-DD) sem componente de tempo.
 * @returns {string}
 */
function ntToday(){
  return new Date().toISOString().slice(0,10);
}

/**
 * Timestamp ISO completo. Em produção, usar serverTimestamp do Firestore.
 * @returns {string}
 */
function ntNow(){
  return new Date().toISOString();
}

/**
 * Formata centavos inteiros como string monetária pt-BR.
 * @param {number} cents inteiro em centavos
 * @returns {string} R$ X.XXX,XX
 */
function ntFmt(cents){
  if(cents == null || isNaN(cents)) return 'R$ 0,00';
  const v = (cents / 100).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
  return 'R$ ' + v;
}

/**
 * Converte string digitada pelo usuário em centavos inteiros.
 * Aceita "1234,56", "1.234,56", "1234.56", "R$ 1234,56".
 * Resiliente a entradas vazias ou inválidas (retorna 0).
 * @param {string} str
 * @returns {number} centavos
 */
function ntParseCents(str){
  if(str == null) return 0;
  let s = String(str).trim();
  if(!s) return 0;
  // Remove qualquer caractere não numérico, mantendo vírgula e ponto e sinal de menos.
  s = s.replace(/[^\d,.-]/g, '');
  if(!s) return 0;
  // Heurística: se há vírgula, tratar como separador decimal pt-BR.
  // Pontos antes da vírgula são separadores de milhar, descartar.
  if(s.indexOf(',') >= 0){
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const f = parseFloat(s);
  if(isNaN(f)) return 0;
  // Math.round evita erros de ponto flutuante (ex: 1.005*100 = 100.49999...).
  return Math.round(f * 100);
}

/**
 * Formata data ISO como pt-BR (DD/MM/YYYY). Retorna fallback se vazia.
 * @param {string|null} iso YYYY-MM-DD
 * @returns {string}
 */
function ntFmtDate(iso){
  if(!iso) return '...';
  const d = new Date(iso + 'T12:00');
  if(isNaN(d)) return '...';
  return d.toLocaleDateString('pt-BR');
}

/**
 * Formata timestamp ISO como pt-BR com hora.
 * @param {string} iso
 * @returns {string}
 */
function ntFmtDateTime(iso){
  if(!iso) return '...';
  const d = new Date(iso);
  if(isNaN(d)) return '...';
  return d.toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

/* ═════════════════════════════════════════════════════════════════════
   GOVERNANÇA, REGRA AUTOR-OWNER
   ───────────────────────────────────────────────────────────────────── */

/**
 * Decide se o usuário corrente pode editar/excluir uma nota.
 *
 * Regras avaliadas em ordem (primeira que aprova encerra a checagem):
 *   1. Admin override: SEC.isAdmin() retorna true para o admin (Leo).
 *   2. Autor: o criador da nota sempre pode editar/excluir o próprio conteúdo.
 *   3. Responsabilidade compartilhada: notas com responsavel === 'Leo & Pri'
 *      liberam ambos os usuários, refletindo trabalho conjunto.
 *
 * Estas regras precisam estar replicadas nas Security Rules do Firestore
 * (defesa em profundidade contra manipulações via console/API).
 *
 * @param {object} note
 * @param {string} user
 * @returns {boolean}
 */
function ntCanEdit(note, user){
  if(!note || !user) return false;
  // 1. Admin override.
  if(SEC.isAdmin()) return true;
  // 2. Autor.
  if(note.autor === user) return true;
  // 3. Responsabilidade compartilhada.
  if(note.responsavel === 'Leo & Pri') return true;
  return false;
}

/* ═════════════════════════════════════════════════════════════════════
   STATUS DERIVADO
   "Em Atraso" não é persistido. Calculado a cada render.
   Garantia: a fonte da verdade é a data atual, nunca um campo defasado.
   ───────────────────────────────────────────────────────────────────── */

/**
 * Retorna o status efetivo da nota considerando a data atual.
 * @param {object} note
 * @returns {'ativa'|'concluida'|'atraso'}
 */
function ntStatusEfetivo(note){
  if(note.status === 'concluida') return 'concluida';
  if(note.tipo === 'acao' && note.prazo && note.prazo < ntToday()) return 'atraso';
  return 'ativa';
}

/* ═════════════════════════════════════════════════════════════════════
   REGISTRO DE ATIVIDADES
   Em produção, escreve em fbDb.collection('activity_log').
   ───────────────────────────────────────────────────────────────────── */

/**
 * Registra evento imutável na coleção notes_log do Firestore.
 * Toda criação, edição, exclusão e restauração passa por aqui.
 * Imutável: Security Rules devem bloquear update e delete nesta coleção.
 *
 * @param {string} evento identificador semântico (cadastro, edicao, etc)
 * @param {string} noteId
 * @param {string} detalhes texto livre legível
 */
async function ntLog(evento, noteId, detalhes){
  try {
    await fbDb.collection('notes_log').add({
      evento,
      noteId: noteId || null,
      detalhes: detalhes || '',
      usuario: STATE.usuario,
      timestamp: ntNow(),
      serverTimestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(e) {
    console.warn('[NT] Falha ao registrar log:', e);
    // Log nunca bloqueia operação principal
  }
}

/* ═════════════════════════════════════════════════════════════════════
   OPERAÇÕES CRUD, FIRESTORE REAL
   Cada função escreve em fbDb.collection('notes'), 'notes_trash' ou
   'notes_log'. Os arrays NOTES_STATE.notes e .trash são atualizados
   automaticamente pelos listeners onSnapshot (setupNotesListeners).
   Por isso, as funções CRUD NÃO manipulam os arrays diretamente.
   ───────────────────────────────────────────────────────────────────── */

/**
 * Cria nota nova no Firestore. Autor fixado no usuário corrente.
 * @param {object} data
 * @returns {Promise<string>} id do documento criado
 */
async function ntCreateNote(data){
  const doc = {
    titulo: data.titulo,
    descricao: data.descricao || '',
    tipo: data.tipo,
    status: data.status,
    prazo: data.prazo || null,
    responsavel: data.responsavel || null,
    autor: STATE.usuario,
    criadaEm: ntNow(),
    atualizadaEm: ntNow(),
    itens: data.itens || [],
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const ref = await fbDb.collection('notes').add(doc);
  await ntLog('cadastro', ref.id, 'Nota "' + data.titulo + '" criada');
  return ref.id;
}

/**
 * Atualiza nota existente. Bloqueia se o usuário não for autor/admin.
 * @param {string} id
 * @param {object} data
 * @returns {Promise<boolean>} sucesso
 */
async function ntUpdateNote(id, data){
  const note = NOTES_STATE.notes.find(n => n.id === id);
  if(!note) return false;
  if(!ntCanEdit(note, STATE.usuario)){
    APP.toast('Sem permissão: somente o autor pode editar', 'error');
    return false;
  }
  await fbDb.collection('notes').doc(id).update({
    titulo: data.titulo,
    descricao: data.descricao || '',
    tipo: data.tipo,
    status: data.status,
    prazo: data.prazo || null,
    responsavel: data.responsavel || null,
    itens: data.itens || [],
    atualizadaEm: ntNow(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await ntLog('edicao', id, 'Nota "' + data.titulo + '" editada');
  return true;
}

/**
 * Soft-delete: move nota para coleção 'notes_trash' e remove de 'notes'.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function ntDeleteNote(id){
  const note = NOTES_STATE.notes.find(n => n.id === id);
  if(!note) return false;
  if(!ntCanEdit(note, STATE.usuario)){
    APP.toast('Sem permissão: somente o autor pode excluir', 'error');
    return false;
  }
  // Copia para trash com metadados de exclusão
  const trashData = { ...note };
  delete trashData.id; // Firestore gera novo ID no trash
  trashData.origemId = id;
  trashData.excluidoPor = STATE.usuario;
  trashData.excluidoEm = ntNow();
  trashData.excluidoAt = firebase.firestore.FieldValue.serverTimestamp();
  await fbDb.collection('notes_trash').add(trashData);
  await fbDb.collection('notes').doc(id).delete();
  await ntLog('exclusao', id, 'Nota "' + note.titulo + '" movida para lixeira');
  return true;
}

/**
 * Restaura nota da lixeira para a coleção principal.
 * @param {string} trashDocId ID do documento na coleção notes_trash
 * @returns {Promise<boolean>}
 */
async function ntRestoreNote(trashDocId){
  const note = NOTES_STATE.trash.find(n => n.id === trashDocId);
  if(!note) return false;
  if(!ntCanEdit(note, STATE.usuario)){
    APP.toast('Sem permissão: somente o autor pode restaurar', 'error');
    return false;
  }
  // Reconstrói o documento limpo (sem metadados de lixeira)
  const restored = { ...note };
  delete restored.id;
  delete restored.excluidoPor;
  delete restored.excluidoEm;
  delete restored.excluidoAt;
  delete restored.origemId;
  restored.atualizadaEm = ntNow();
  restored.restoredAt = firebase.firestore.FieldValue.serverTimestamp();
  await fbDb.collection('notes').add(restored);
  await fbDb.collection('notes_trash').doc(trashDocId).delete();
  await ntLog('restauracao', trashDocId, 'Nota "' + note.titulo + '" restaurada da lixeira');
  return true;
}

/* ═════════════════════════════════════════════════════════════════════
   APLICAÇÃO DE FILTROS
   Filtros combinados em AND. Cada filtro vazio é ignorado.
   Funções puras: recebem o array, devolvem novo array. Sem efeitos colaterais.
   Em produção (Firestore): filtros são aplicados em JavaScript após o fetch,
   nunca combinando orderBy + where na query (diretriz v1.0).
   ───────────────────────────────────────────────────────────────────── */

/**
 * Filtra a lista de notas conforme NOTES_STATE.filters, periodo e searchQuery.
 * O filtro de status considera o status efetivo (com cálculo de atraso),
 * não o campo bruto persistido, garantindo coerência com o que o usuário vê.
 *
 * Regra do filtro de período (padrão Duetto): janela {ano, mesIni, mesFim}.
 * Aplica EXCLUSIVAMENTE a notas tipo='acao'. Anotações ignoram e passam direto.
 * Ações sem prazo são excluídas quando o período está ativo (não há como afirmar
 * que pertencem ao intervalo).
 *
 * @param {object[]} list lista bruta de notas
 * @returns {object[]} subconjunto que passa em todos os filtros ativos
 */
function ntApplyFilters(list){
  const f = NOTES_STATE.filters;
  const p = NOTES_STATE.periodo;
  const q = NOTES_STATE.searchQuery || '';

  return list.filter(n => {
    if(f.autor  && n.autor !== f.autor) return false;
    if(f.tipo   && n.tipo  !== f.tipo)  return false;
    if(f.status && ntStatusEfetivo(n) !== f.status) return false;

    // Período aplica somente a Ações; Anotações passam direto.
    if(p && n.tipo === 'acao'){
      if(!n.prazo) return false;  // ação sem prazo é excluída quando período ativo
      // Construção segura: prazo é YYYY-MM-DD, parsing local com horário noon
      // evita problemas de timezone que jogariam a data para o dia anterior.
      const d = new Date(n.prazo + 'T12:00');
      if(isNaN(d)) return false;
      if(d.getFullYear() !== p.ano) return false;
      const m = d.getMonth();
      if(m < p.mesIni || m > p.mesFim) return false;
    }

    // Busca profunda: percorre titulo, descrição geral e itens.
    if(q && !ntMatchesSearch(n, q)) return false;
    return true;
  });
}

/**
 * Normaliza string para comparação: lowercase + remoção de diacríticos.
 * Garante que "ação" case com "acao", "açao", "AÇÃO", etc.
 * @param {string} s
 * @returns {string}
 */
function ntNormalize(s){
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/**
 * Verifica se a nota contém o termo de busca em qualquer campo textual relevante.
 * Escopo: titulo, descricao (geral), e em cada item: descricao e nota.
 *
 * @param {object} note
 * @param {string} query texto digitado pelo usuário
 * @returns {boolean}
 */
function ntMatchesSearch(note, query){
  const q = ntNormalize(query.trim());
  if(!q) return true;
  if(ntNormalize(note.titulo).includes(q)) return true;
  if(ntNormalize(note.descricao).includes(q)) return true;
  if(Array.isArray(note.itens)){
    for(const it of note.itens){
      if(ntNormalize(it.descricao).includes(q)) return true;
      if(ntNormalize(it.nota).includes(q))      return true;
    }
  }
  return false;
}

/**
 * Conta quantos filtros estão ativos no momento.
 * Período conta como 1 filtro independentemente das chaves internas.
 * Busca rápida não é contabilizada aqui (controle separado da toolbar).
 * @returns {number}
 */
function ntCountActiveFilters(){
  const f = NOTES_STATE.filters;
  const periodo = NOTES_STATE.periodo ? 1 : 0;
  return (f.autor ? 1 : 0) + (f.tipo ? 1 : 0) + (f.status ? 1 : 0) + periodo;
}

/**
 * Atualiza o estado visual da barra de filtros: badges, classes ativas,
 * visibilidade do botão "Limpar filtros" e do badge de período.
 */
function ntRenderFilterChrome(){
  const active = ntCountActiveFilters();
  const f = NOTES_STATE.filters;

  // Cada select recebe classe .active no grupo pai quando preenchido.
  document.getElementById('ntFG_autor').classList.toggle('active',  !!f.autor);
  document.getElementById('ntFG_tipo').classList.toggle('active',   !!f.tipo);
  document.getElementById('ntFG_status').classList.toggle('active', !!f.status);

  // Badge do período (estilo Duetto): texto "Janeiro → Março 2026 ✕".
  const badge = document.getElementById('ntPeriodoBadge');
  const p = NOTES_STATE.periodo;
  if(p){
    badge.classList.add('show');
    badge.innerHTML = '📅 ' + NT_MESES_F[p.mesIni] + ' → ' + NT_MESES_F[p.mesFim] + ' ' + p.ano + ' &nbsp;✕';
  } else {
    badge.classList.remove('show');
    badge.innerHTML = '';
  }

  const countEl = document.getElementById('ntFilterCount');
  const btnEl   = document.getElementById('ntBtnClearFilters');
  if(active === 0){
    countEl.style.display = 'none';
    btnEl.style.display   = 'none';
  } else {
    countEl.style.display = 'inline-flex';
    countEl.textContent   = active === 1 ? '1 filtro ativo' : active + ' filtros ativos';
    btnEl.style.display   = 'inline-flex';
  }
}

/**
 * Limpa todos os filtros e re-renderiza. Não afeta a busca rápida.
 */
function ntClearFilters(){
  NOTES_STATE.filters = {autor:'', tipo:'', status:''};
  NOTES_STATE.periodo = null;
  document.getElementById('ntFilterAutor').value   = '';
  document.getElementById('ntFilterTipo').value    = '';
  document.getElementById('ntFilterStatus').value  = '';
  ntRenderAll();
  APP.toast('Filtros removidos', 'success');
}



function ntRenderAll(){
  ntRenderFilterChrome();
  ntRenderKpis();
  ntRenderCards();
  ntRenderTrashCount();
}

function ntRenderKpis(){
  // KPIs refletem o escopo filtrado, mantendo coerência visual com a listagem.
  const escopo = ntApplyFilters(NOTES_STATE.notes);
  const total = escopo.length;
  const ativas = escopo.filter(n => ntStatusEfetivo(n) === 'ativa').length;
  const atraso = escopo.filter(n => ntStatusEfetivo(n) === 'atraso').length;
  const concluidas = escopo.filter(n => ntStatusEfetivo(n) === 'concluida').length;

  const filtroAtivo = ntCountActiveFilters() > 0;
  const totalLabel = filtroAtivo ? 'Resultado filtrado' : 'Total de Notas';

  const html = [
    {label: totalLabel,    value: total,      cls:'palm'},
    {label:'Ativas',       value: ativas,     cls:'blue'},
    {label:'Em Atraso',    value: atraso,     cls:'red'},
    {label:'Concluídas',   value: concluidas, cls:'green'}
  ].map(k => `
    <div class="nt-kpi ${k.cls}">
      <div class="nt-kpi-label"><span class="nt-kpi-dot"></span> ${k.label}</div>
      <div class="nt-kpi-value">${k.value}</div>
    </div>
  `).join('');
  document.getElementById('ntKpis').innerHTML = html;
}

/**
 * Aplica o modo de visualização atual (grade ou lista) ocultando o wrapper
 * oposto. Não recria nodes do modal aberto, evitando perda de estado.
 */
function ntApplyViewMode(){
  const mode = NOTES_STATE.viewMode === 'lista' ? 'lista' : 'grade';
  document.getElementById('ntGridView').classList.toggle('hidden', mode !== 'grade');
  document.getElementById('ntListView').classList.toggle('active',  mode === 'lista');
  // Atualiza highlight do segmented control.
  document.querySelectorAll('#ntViewMode button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });
}

function ntRenderCards(){
  // Aplica filtros + busca antes de distribuir.
  const escopo = ntApplyFilters(NOTES_STATE.notes);

  if(NOTES_STATE.viewMode === 'lista'){
    // Em modo lista, renderiza a tabela única e oculta a grade.
    ntRenderList(escopo);
    return;
  }

  // Modo grade: distribui em buckets por status efetivo.
  const buckets = {ativa: [], concluida: [], atraso: []};
  for(const note of escopo){
    buckets[ntStatusEfetivo(note)].push(note);
  }

  // Ordenação centralizada (sem orderBy combinado com where, diretriz v1.0).
  buckets.ativa.sort(ntSortNotes);
  buckets.atraso.sort(ntSortNotes);
  buckets.concluida.sort(ntSortNotes);

  // Visibilidade de seção: quando o filtro de status é específico,
  // ocultamos as seções que não correspondem para reduzir ruído visual.
  const fStatus = NOTES_STATE.filters.status;
  ntToggleSectionVisibility('ativa',     !fStatus || fStatus === 'ativa');
  ntToggleSectionVisibility('atraso',    !fStatus || fStatus === 'atraso');
  ntToggleSectionVisibility('concluida', !fStatus || fStatus === 'concluida');

  ntRenderBucket('ntGridAtiva',     'ntCountAtiva',     buckets.ativa,     'ativa');
  ntRenderBucket('ntGridAtraso',    'ntCountAtraso',    buckets.atraso,    'atraso');
  ntRenderBucket('ntGridConcluida', 'ntCountConcluida', buckets.concluida, 'concluida');
}

/**
 * Renderiza modo lista (Planner): tabela única com colunas configuráveis
 * por usuário e ordenação manual via cabeçalho clicável.
 *
 * @param {object[]} escopo notas já filtradas
 */
function ntRenderList(escopo){
  const head = document.getElementById('ntListHead');
  const tbody = document.getElementById('ntListBody');
  const sortInfoEl = document.getElementById('ntListSortInfo');

  // Resolve colunas visíveis preservando a ordem definida pelo usuário.
  const visibleCols = NOTES_STATE.columnsConfig
    .filter(c => c.visible)
    .map(c => NT_LIST_COLUMNS.find(d => d.key === c.key))
    .filter(Boolean);

  // ── Cabeçalho com indicador de ordenação ──
  const s = NOTES_STATE.listSort;
  head.innerHTML = visibleCols.map(col => {
    const isActive = s.column === col.key;
    const arrow = isActive ? (s.dir === 'asc' ? '▲' : '▼') : '○';
    const cls = (col.sortable ? 'sortable ' : '') + (isActive ? 'active' : '');
    const numClass = col.type === 'number' ? 'nt-num-col' : '';
    return `<th class="${cls} ${numClass}" data-col="${col.key}" style="width:${col.width}">
      ${ntEscape(col.label)}
      ${col.sortable ? `<span class="sort-arrow">${arrow}</span>` : ''}
    </th>`;
  }).join('');

  // Bindings dos cabeçalhos sortable.
  head.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => ntToggleListSort(th.dataset.col));
  });

  // Info textual da ordenação atual.
  if(s.column){
    const colDef = NT_LIST_COLUMNS.find(c => c.key === s.column);
    sortInfoEl.textContent = 'Ordenado por ' + (colDef ? colDef.label : s.column) +
                              (s.dir === 'asc' ? ' (crescente)' : ' (decrescente)');
  } else {
    sortInfoEl.textContent = 'Ordenação padrão (Status > Tipo > Prazo)';
  }

  // ── Estado vazio ──
  if(escopo.length === 0){
    const filtroAtivo = ntCountActiveFilters() > 0 || NOTES_STATE.searchQuery;
    const msg = filtroAtivo
      ? 'Nenhuma nota corresponde aos filtros ou busca aplicados.'
      : 'Nenhuma nota cadastrada ainda. Use + Nova Nota para começar.';
    tbody.innerHTML = `<tr><td colspan="${visibleCols.length}" class="nt-list-empty">${msg}</td></tr>`;
    return;
  }

  // ── Ordenação ──
  let sorted;
  if(s.column){
    // Ordenação manual: aplica comparador único na coluna escolhida.
    sorted = [...escopo].sort((a, b) => {
      const r = ntListSortComparator(a, b, s.column);
      return s.dir === 'asc' ? r : -r;
    });
  } else {
    // Ordenação default: status como critério primário e ntSortNotes como secundário.
    const statusOrder = {ativa: 0, atraso: 1, concluida: 2};
    sorted = [...escopo].sort((a, b) => {
      const sa = statusOrder[ntStatusEfetivo(a)];
      const sb = statusOrder[ntStatusEfetivo(b)];
      if(sa !== sb) return sa - sb;
      return ntSortNotes(a, b);
    });
  }

  // ── Renderização das linhas ──
  const statusLabel = {ativa:'Ativa', atraso:'Em Atraso', concluida:'Concluída'};

  tbody.innerHTML = sorted.map(n => {
    const cells = visibleCols.map(col => ntRenderListCell(n, col, statusLabel)).join('');
    return `<tr data-noteid="${n.id}" tabindex="0">${cells}</tr>`;
  }).join('');

  tbody.querySelectorAll('tr[data-noteid]').forEach(tr => {
    tr.addEventListener('click', () => ntOpenEditModal(tr.dataset.noteid));
    tr.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        ntOpenEditModal(tr.dataset.noteid);
      }
    });
  });
}

/**
 * Renderiza uma célula individual da tabela Lista, baseada na coluna definida.
 * Centraliza a lógica de formatação visual por tipo de coluna.
 *
 * @param {object} n nota
 * @param {object} col definição da coluna (de NT_LIST_COLUMNS)
 * @param {object} statusLabel mapa de label de status
 * @returns {string} HTML da <td>
 */
function ntRenderListCell(n, col, statusLabel){
  const st = ntStatusEfetivo(n);
  const isAcao = n.tipo === 'acao';
  switch(col.key){
    case 'titulo':
      return `<td><strong>${ntEscape(n.titulo)}</strong></td>`;
    case 'status':
      return `<td><span class="nt-list-status ${st}">${statusLabel[st]}</span></td>`;
    case 'tipo':
      return `<td><span class="nt-list-tipo ${isAcao ? 'acao' : ''}">${isAcao ? 'Ação' : 'Anotação'}</span></td>`;
    case 'autor':
      return `<td><span class="nt-list-author">${n.autor}</span></td>`;
    case 'responsavel':
      return n.responsavel
        ? `<td>${ntEscape(n.responsavel)}</td>`
        : `<td style="color:var(--t4)">...</td>`;
    case 'prazo':
      if(isAcao && n.prazo){
        const lateClass = st === 'atraso' ? 'nt-list-late' : '';
        return `<td class="${lateClass}">${ntFmtDate(n.prazo)}</td>`;
      }
      return `<td style="color:var(--t4)">...</td>`;
    case 'itens': {
      const c = (n.itens || []).length;
      return c === 0
        ? `<td style="color:var(--t4)">...</td>`
        : `<td>${c} ${c === 1 ? 'item' : 'itens'}</td>`;
    }
    case 'vPrevisto': {
      const total = (n.itens || []).reduce((s, it) => s + (it.vPrevistoCent || 0), 0);
      return total === 0
        ? `<td class="nt-num-col" style="color:var(--t4)">...</td>`
        : `<td class="nt-num-col"><strong>${ntFmt(total)}</strong></td>`;
    }
    case 'vRealizado': {
      const total = (n.itens || []).reduce((s, it) => s + (it.vRealizadoCent || 0), 0);
      return total === 0
        ? `<td class="nt-num-col" style="color:var(--t4)">...</td>`
        : `<td class="nt-num-col" style="color:var(--green)"><strong>${ntFmt(total)}</strong></td>`;
    }
    default:
      return `<td>...</td>`;
  }
}

/**
 * Comparador centralizado para ordenação de notas.
 *
 * Regras de prioridade (de cima para baixo):
 *   1. Ações têm precedência absoluta sobre Anotações no topo da coluna.
 *   2. Entre Ações, ordenação por prazo crescente (mais próximo primeiro).
 *   3. Ações sem prazo vão ao final do grupo Ações.
 *   4. Entre Anotações, ordenação alfabética por título.
 *
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function ntSortNotes(a, b){
  const aIsAcao = a.tipo === 'acao';
  const bIsAcao = b.tipo === 'acao';
  // Regra 1: ações antes de anotações.
  if(aIsAcao && !bIsAcao) return -1;
  if(!aIsAcao &&  bIsAcao) return  1;
  // Regra 2 e 3: ambas ações, comparar por prazo (sem prazo vai para o fim).
  if(aIsAcao && bIsAcao){
    const pa = a.prazo || '9999-12-31';
    const pb = b.prazo || '9999-12-31';
    return pa.localeCompare(pb);
  }
  // Regra 4: ambas anotações, ordem alfabética.
  return a.titulo.localeCompare(b.titulo, 'pt');
}

/**
 * Mostra ou esconde a seção <section> que envolve um determinado bucket.
 * Usa o id do grid como ponto de partida e sobe para a tag <section> ancestral.
 *
 * @param {'ativa'|'atraso'|'concluida'} statusKey
 * @param {boolean} visible
 */
function ntToggleSectionVisibility(statusKey, visible){
  const map = {ativa:'ntGridAtiva', atraso:'ntGridAtraso', concluida:'ntGridConcluida'};
  const grid = document.getElementById(map[statusKey]);
  if(!grid) return;
  const section = grid.closest('section');
  if(!section) return;
  section.style.display = visible ? '' : 'none';
}

function ntRenderBucket(gridId, countId, items, statusKey){
  const grid  = document.getElementById(gridId);
  const count = document.getElementById(countId);
  count.textContent = items.length;

  if(items.length === 0){
    const filtroAtivo = ntCountActiveFilters() > 0;
    const labelStatus = statusKey === 'atraso' ? 'em atraso' : statusKey + 's';
    const msg = filtroAtivo
      ? `Nenhuma nota ${labelStatus} corresponde aos filtros aplicados.`
      : `Nenhuma nota ${labelStatus}.`;
    grid.innerHTML = `<div class="nt-empty" style="grid-column:1/-1">${msg}</div>`;
    return;
  }

  grid.innerHTML = items.map(n => ntCardHTML(n, statusKey)).join('');
  // Eventos de clique no card delegados via dataset.
  grid.querySelectorAll('[data-nt-card]').forEach(el => {
    el.addEventListener('click', () => ntOpenEditModal(el.dataset.ntCard));
  });
}

function ntCardHTML(note, statusKey){
  const canEdit = ntCanEdit(note, STATE.usuario);
  const isAcao = note.tipo === 'acao';
  const statusEf = ntStatusEfetivo(note);
  const totalPrev = (note.itens || []).reduce((s, it) => s + (it.vPrevistoCent || 0), 0);
  const totalReal = (note.itens || []).reduce((s, it) => s + (it.vRealizadoCent || 0), 0);

  const metaParts = [];
  if(isAcao && note.prazo){
    const lateClass = statusEf === 'atraso' ? 'style="color:var(--red);font-weight:600"' : '';
    metaParts.push(`<span ${lateClass}><strong>Prazo:</strong> ${ntFmtDate(note.prazo)}</span>`);
  }
  if(note.responsavel){
    metaParts.push(`<span><strong>Resp:</strong> ${note.responsavel}</span>`);
  }
  if((note.itens || []).length){
    metaParts.push(`<span><strong>${note.itens.length}</strong> ${note.itens.length === 1 ? 'item' : 'itens'}</span>`);
  }
  const totalsLine = totalPrev > 0
    ? `<span><strong>Previsto:</strong> ${ntFmt(totalPrev)} &nbsp; <strong>Realizado:</strong> ${ntFmt(totalReal)}</span>`
    : '';

  return `
    <div class="nt-card ${statusKey}" data-nt-card="${note.id}" role="button" tabindex="0">
      <div class="nt-card-head">
        <div class="nt-card-title">${ntEscape(note.titulo)}</div>
        <span class="nt-card-type ${isAcao ? 'acao' : ''}">${isAcao ? 'Ação' : 'Anotação'}</span>
      </div>
      <div class="nt-card-meta">
        ${metaParts.join('')}
        ${totalsLine}
      </div>
      <div class="nt-card-foot">
        <span class="nt-author">${note.autor}</span>
        ${canEdit ? '' : '<span class="nt-readonly">Somente leitura</span>'}
      </div>
    </div>
  `;
}

function ntEscape(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ═════════════════════════════════════════════════════════════════════
   MODAL DE NOTA
   ───────────────────────────────────────────────────────────────────── */

function ntOpenNewModal(){
  NOTES_STATE.editingId = null;
  NOTES_STATE.draftItems = [];
  document.getElementById('ntModalTitle').textContent = 'Nova Nota';
  document.getElementById('ntF_titulo').value = '';
  document.getElementById('ntF_descricao').value = '';
  document.getElementById('ntF_tipo').value = 'anotacao';
  document.getElementById('ntF_status').value = 'ativa';
  document.getElementById('ntF_prazo').value = '';
  document.getElementById('ntF_resp').value = '';
  document.getElementById('ntBtnDelete').style.display = 'none';
  ntApplyTipoUX();
  ntApplyEditPermissionUX(true);
  ntRenderItems();
  ntOpenOverlay('ntModalOverlay');
  setTimeout(() => document.getElementById('ntF_titulo').focus(), 80);
}

function ntOpenEditModal(noteId){
  const note = NOTES_STATE.notes.find(n => n.id === noteId);
  if(!note){ APP.toast('Nota não encontrada', 'error'); return; }
  NOTES_STATE.editingId = note.id;
  // Cópia profunda dos itens, edições só persistem ao salvar.
  NOTES_STATE.draftItems = JSON.parse(JSON.stringify(note.itens || []));
  document.getElementById('ntModalTitle').textContent = 'Editar Nota';
  document.getElementById('ntF_titulo').value = note.titulo;
  document.getElementById('ntF_descricao').value = note.descricao || '';
  document.getElementById('ntF_tipo').value = note.tipo;
  document.getElementById('ntF_status').value = note.status;
  document.getElementById('ntF_prazo').value = note.prazo || '';
  document.getElementById('ntF_resp').value = note.responsavel || '';

  const canEdit = ntCanEdit(note, STATE.usuario);
  document.getElementById('ntBtnDelete').style.display = canEdit ? 'inline-flex' : 'none';
  ntApplyTipoUX();
  ntApplyEditPermissionUX(canEdit);
  ntRenderItems();
  ntOpenOverlay('ntModalOverlay');
}

/**
 * Renderização condicional estrita por tipo de nota.
 *
 * Tipo "Anotação":
 *   - Containers .nt-fg de Prazo e Responsável recebem display:none.
 *   - Atributo required removido para evitar bloqueio de submit.
 *   - Valores são preservados no DOM mas ignorados no payload (ntSaveNote).
 *
 * Tipo "Ação":
 *   - Containers visíveis (display herda da regra base).
 *   - Atributo required adicionado em ambos os campos.
 *   - O label do select é forçado para "Selecione..." e bloqueia salvamento sem escolha.
 */
function ntApplyTipoUX(){
  const tipo = document.getElementById('ntF_tipo').value;
  const fgPrazo = document.getElementById('ntFG_prazo');
  const fgResp  = document.getElementById('ntFG_resp');
  const inPrazo = document.getElementById('ntF_prazo');
  const inResp  = document.getElementById('ntF_resp');

  if(tipo === 'acao'){
    fgPrazo.style.display = '';
    fgResp.style.display  = '';
    inPrazo.setAttribute('required', 'required');
    inResp.setAttribute('required', 'required');
  } else {
    fgPrazo.style.display = 'none';
    fgResp.style.display  = 'none';
    inPrazo.removeAttribute('required');
    inResp.removeAttribute('required');
  }
}

/**
 * Aplica trava de UI quando o usuário corrente não pode editar a nota.
 * A camada server-side (Security Rules) é a defesa final, esta é cosmética
 * mas necessária para clareza e prevenção de erros do usuário.
 */
function ntApplyEditPermissionUX(canEdit){
  const ids = ['ntF_titulo','ntF_descricao','ntF_tipo','ntF_status','ntF_prazo','ntF_resp'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if(canEdit) el.removeAttribute('disabled');
    else el.setAttribute('disabled', 'disabled');
  });
  document.getElementById('ntBtnSave').disabled    = !canEdit;
  document.getElementById('ntBtnAddItem').disabled = !canEdit;
}

/* ═════════════════════════════════════════════════════════════════════
   TABELA DE NOTAS ADICIONAIS, MODO LEITURA
   Edição via sub-modal. Linhas clicáveis abrem o sub-modal preenchido.
   ───────────────────────────────────────────────────────────────────── */

function ntRenderItems(){
  const tbody = document.getElementById('ntItemsBody');
  const wrap  = document.getElementById('ntItemsWrap');
  const empty = document.getElementById('ntItemsEmpty');
  const totals = document.getElementById('ntItemsTotals');
  const items = NOTES_STATE.draftItems;

  // Exibição condicional: tabela e totais só aparecem quando há item.
  if(items.length === 0){
    wrap.classList.add('hidden');
    totals.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  wrap.classList.remove('hidden');
  totals.style.display = '';
  empty.style.display = 'none';

  // Verificação de permissão: se a nota não pode ser editada, sub-modal
  // abre em modo leitura (controlado dentro de ntOpenItemModal).
  const editingNote = NOTES_STATE.editingId
    ? NOTES_STATE.notes.find(n => n.id === NOTES_STATE.editingId)
    : null;
  const canEdit = editingNote ? ntCanEdit(editingNote, STATE.usuario) : true;

  tbody.innerHTML = items.map((it, idx) => `
    <tr data-idx="${idx}">
      <td class="readonly">${ntEscape(it.descricao) || '<span style="color:var(--t4)">(sem descrição)</span>'}</td>
      <td class="readonly">${it.data ? ntFmtDate(it.data) : '...'}</td>
      <td class="readonly">${ntEscape(it.nota) || '...'}</td>
      <td class="nt-num readonly">${it.vPrevistoCent  ? ntFmt(it.vPrevistoCent)  : 'R$ 0,00'}</td>
      <td class="nt-num readonly">${it.vRealizadoCent ? ntFmt(it.vRealizadoCent) : 'R$ 0,00'}</td>
      <td>
        <div class="nt-row-actions">
          <button class="nt-icon-btn" data-act="edit" title="Editar item">${canEdit ? '✏' : '👁'}</button>
        </div>
      </td>
    </tr>
  `).join('');

  // Linha inteira clicável (padrão Contas) e botão de ação delegado.
  tbody.querySelectorAll('tr[data-idx]').forEach(tr => {
    tr.addEventListener('click', () => {
      const idx = parseInt(tr.dataset.idx, 10);
      ntOpenItemModal(idx);
    });
  });

  ntRecalcTotals();
}

function ntRecalcTotals(){
  const items = NOTES_STATE.draftItems;
  // Soma como inteiros, sem perda de precisão. Conversão para decimal só no display.
  const tp = items.reduce((s, it) => s + (it.vPrevistoCent  || 0), 0);
  const tr = items.reduce((s, it) => s + (it.vRealizadoCent || 0), 0);
  document.getElementById('ntTotalPrevisto').textContent  = ntFmt(tp);
  document.getElementById('ntTotalRealizado').textContent = ntFmt(tr);
}

/* ═════════════════════════════════════════════════════════════════════
   SUB-MODAL DE ITEM
   Padrão Contas: cadastro/edição de item ocorre em modal sobreposto.
   Sem edição inline na tabela. Sub-modal opera sobre NOTES_STATE.draftItems
   e só persiste ao confirmar; cancelamento descarta a edição do item.
   ───────────────────────────────────────────────────────────────────── */

/**
 * Formata centavos como número editável sem prefixo de moeda.
 * Ex: 240050 vira "2.400,50". String vazia se zero/null.
 */
function ntFmtNumero(cents){
  if(!cents) return '';
  return (cents / 100).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}

/* ═════════════════════════════════════════════════════════════════════
   MÁSCARA DE MOEDA EM TEMPO REAL
   ─────────────────────────────────────────────────────────────────────
   Uso: adicionar a classe .nt-money no <input>. O binding é idempotente
   (guard via data-nt-money-bound) — pode ser chamado em qualquer momento
   sem duplicar listeners. Não exige biblioteca externa.

   Modelo: o usuário digita SOMENTE dígitos. Cada keystroke o valor é
   re-lido como inteiro de centavos, reformatado pt-BR (ponto de milhar +
   vírgula decimal) e devolvido ao input. Cursor sempre ao final, porque
   a posição muda de forma não-trivial à medida que separadores entram e
   saem (UX padrão de máscara financeira mobile).

   Sanitização: na hora do submit/save, basta chamar ntParseCents(value)
   para obter centavos inteiros, ou ntMoneyToDecimal(value) para obter
   string decimal padrão americano ("1234.56"). Ambos funcionam mesmo se
   o input estiver vazio, formatado, ou com a string crua.
   ───────────────────────────────────────────────────────────────────── */

/**
 * Lê um valor formatado pt-BR e devolve string decimal padrão americano.
 * Útil para enviar ao backend quando o contrato é "number como string".
 * Exemplos:  "1.234,56" → "1234.56"   "0,00" → "0.00"   "" → "0.00"
 *
 * @param {string} str valor do input
 * @returns {string} decimal com ponto, sempre com 2 casas
 */
function ntMoneyToDecimal(str){
  const cents = ntParseCents(str);
  return (cents / 100).toFixed(2);
}

/**
 * Aplica a máscara a um valor cru e devolve a string formatada.
 * Não toca em nenhum DOM; pode ser usada para popular o input via JS
 * sem disparar o listener (ex: ao abrir o sub-modal de edição).
 *
 * @param {string|number} raw entrada arbitrária (digitada ou centavos)
 * @returns {string} ex: "1.000,50"
 */
function ntMaskMoney(raw){
  if(raw == null) return '';
  const onlyDigits = String(raw).replace(/\D/g, '');
  if(!onlyDigits) return '';
  // Trava em 13 dígitos = R$ 99.999.999.999,99 (limite defensivo).
  const safe = onlyDigits.slice(0, 13);
  const cents = parseInt(safe, 10) || 0;
  return (cents / 100).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}

/**
 * Aplica a máscara diretamente ao valor de um <input>.
 * @param {HTMLInputElement} input
 */
function ntApplyMoneyMaskTo(input){
  if(!input) return;
  input.value = ntMaskMoney(input.value);
}

/**
 * Liga a máscara em todos os inputs .nt-money dentro de scope (default document).
 * Idempotente: cada input é marcado com data-nt-money-bound após a primeira ligação.
 *
 * @param {Document|HTMLElement} [scope]
 */
function ntBindMoneyMasks(scope){
  const root = scope || document;
  root.querySelectorAll('input.nt-money:not([data-nt-money-bound])').forEach(el => {
    el.setAttribute('data-nt-money-bound', '1');
    // Otimiza teclado mobile, mesmo que o HTML já traga inputmode.
    if(!el.getAttribute('inputmode')) el.setAttribute('inputmode', 'numeric');
    // Bloqueia caracteres não-numéricos antes mesmo de entrarem.
    el.addEventListener('keydown', e => {
      if(e.ctrlKey || e.metaKey || e.altKey) return;
      const allowed = ['Backspace','Delete','Tab','Escape','Enter',
                       'ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];
      if(allowed.includes(e.key)) return;
      if(!/^\d$/.test(e.key)) e.preventDefault();
    });
    // Reaplica a máscara a cada keystroke; mantém cursor ao final.
    el.addEventListener('input', () => {
      ntApplyMoneyMaskTo(el);
      // Cursor ao final — UX padrão para máscara de moeda right-to-left.
      const len = el.value.length;
      try { el.setSelectionRange(len, len); } catch(_){}
    });
    // Cola: passa pelo mesmo pipeline.
    el.addEventListener('paste', () => {
      setTimeout(() => ntApplyMoneyMaskTo(el), 0);
    });
    // Garante formato final mesmo se o usuário sair com algo estranho.
    el.addEventListener('blur', () => {
      const cents = ntParseCents(el.value);
      el.value = ntFmtNumero(cents);
    });
  });
}

/**
 * Abre o sub-modal de item.
 * @param {number|null} idx índice em draftItems, null para criação
 */
function ntOpenItemModal(idx){
  // Verifica permissão para edição da nota pai.
  const editingNote = NOTES_STATE.editingId
    ? NOTES_STATE.notes.find(n => n.id === NOTES_STATE.editingId)
    : null;
  const canEdit = editingNote ? ntCanEdit(editingNote, STATE.usuario) : true;

  NOTES_STATE.editingItemIdx = (idx == null ? null : idx);

  const titleEl = document.getElementById('ntItemModalTitle');
  const delBtn  = document.getElementById('ntBtnDeleteItem');
  const saveBtn = document.getElementById('ntBtnSaveItem');

  if(idx == null){
    // Criação.
    titleEl.textContent = 'Novo Item';
    document.getElementById('ntI_descricao').value = '';
    document.getElementById('ntI_data').value      = ntToday();
    document.getElementById('ntI_nota').value      = '';
    document.getElementById('ntI_vPrevisto').value  = '';
    document.getElementById('ntI_vRealizado').value = '';
    delBtn.style.display = 'none';
  } else {
    // Edição.
    const it = NOTES_STATE.draftItems[idx];
    if(!it){ APP.toast('Item não encontrado', 'error'); return; }
    titleEl.textContent = canEdit ? 'Editar Item' : 'Visualizar Item';
    document.getElementById('ntI_descricao').value  = it.descricao || '';
    document.getElementById('ntI_data').value       = it.data || '';
    document.getElementById('ntI_nota').value       = it.nota || '';
    document.getElementById('ntI_vPrevisto').value  = ntFmtNumero(it.vPrevistoCent);
    document.getElementById('ntI_vRealizado').value = ntFmtNumero(it.vRealizadoCent);
    delBtn.style.display = canEdit ? 'inline-flex' : 'none';
  }

  // Habilita ou desabilita campos conforme permissão.
  ['ntI_descricao','ntI_data','ntI_nota','ntI_vPrevisto','ntI_vRealizado'].forEach(id => {
    const el = document.getElementById(id);
    if(canEdit) el.removeAttribute('disabled');
    else el.setAttribute('disabled', 'disabled');
  });
  saveBtn.disabled = !canEdit;

  ntOpenOverlay('ntItemModalOverlay');
  if(canEdit) setTimeout(() => document.getElementById('ntI_descricao').focus(), 80);
}

/**
 * Persiste o item editado no sub-modal de volta em draftItems.
 * Quando a nota já existe no Firestore (editingId != null), persiste
 * imediatamente o array de itens, sem precisar clicar em Salvar no modal
 * principal (Melhoria 02 — save imediato de item).
 */
async function ntSaveItem(){
  const desc       = document.getElementById('ntI_descricao').value.trim();
  const data       = document.getElementById('ntI_data').value || null;
  const nota       = document.getElementById('ntI_nota').value.trim();
  const vPrevisto  = ntParseCents(document.getElementById('ntI_vPrevisto').value);
  const vRealizado = ntParseCents(document.getElementById('ntI_vRealizado').value);

  if(!desc){ APP.toast('Descrição do item é obrigatória', 'error'); return; }

  const idx = NOTES_STATE.editingItemIdx;
  if(idx == null){
    // Criação.
    NOTES_STATE.draftItems.push({
      id: ntUid(),
      descricao: desc,
      data,
      nota,
      vPrevistoCent:  vPrevisto,
      vRealizadoCent: vRealizado
    });
  } else {
    // Edição.
    const it = NOTES_STATE.draftItems[idx];
    if(!it){ APP.toast('Item não encontrado', 'error'); return; }
    it.descricao = desc;
    it.data = data;
    it.nota = nota;
    it.vPrevistoCent  = vPrevisto;
    it.vRealizadoCent = vRealizado;
  }

  NOTES_STATE.editingItemIdx = null;
  ntCloseOverlay('ntItemModalOverlay');
  ntRenderItems();

  // ── Persist imediato ao Firestore (apenas quando nota já existe) ──
  // Para notas novas (editingId === null), o save ocorre quando o usuário
  // salvar a nota pela primeira vez no modal principal (comportamento mantido).
  if(NOTES_STATE.editingId){
    try {
      const itensPayload = NOTES_STATE.draftItems.map(it => ({
        id:             it.id,
        descricao:      it.descricao || '',
        data:           it.data || null,
        nota:           it.nota || '',
        vPrevistoCent:  it.vPrevistoCent  || 0,
        vRealizadoCent: it.vRealizadoCent || 0
      }));
      await fbDb.collection('notes').doc(NOTES_STATE.editingId).update({
        itens:       itensPayload,
        atualizadaEm: ntNow(),
        updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
      });
      APP.toast(idx == null ? 'Item adicionado e salvo' : 'Item atualizado e salvo', 'success');
    } catch(err) {
      console.error('[NT] Erro ao salvar item imediatamente:', err);
      // Item já está em draftItems; o toast alerta sem bloquear fluxo.
      APP.toast('Item salvo localmente (falha ao sincronizar)', 'warning');
    }
  } else {
    APP.toast(idx == null ? 'Item adicionado' : 'Item atualizado', 'success');
  }
}

/**
 * Remove o item atualmente em edição. Confirmação obrigatória.
 * Quando a nota já existe no Firestore, persiste a remoção imediatamente.
 */
async function ntDeleteItem(){
  const idx = NOTES_STATE.editingItemIdx;
  if(idx == null){ APP.toast('Sem item selecionado', 'error'); return; }
  const it = NOTES_STATE.draftItems[idx];
  if(!it) return;
  if(!confirm(`Remover o item "${it.descricao || '(sem descrição)'}" desta nota?`)) return;

  NOTES_STATE.draftItems.splice(idx, 1);
  NOTES_STATE.editingItemIdx = null;
  ntCloseOverlay('ntItemModalOverlay');
  ntRenderItems();

  // Persist imediato quando a nota já existe no Firestore.
  if(NOTES_STATE.editingId){
    try {
      const itensPayload = NOTES_STATE.draftItems.map(it => ({
        id:             it.id,
        descricao:      it.descricao || '',
        data:           it.data || null,
        nota:           it.nota || '',
        vPrevistoCent:  it.vPrevistoCent  || 0,
        vRealizadoCent: it.vRealizadoCent || 0
      }));
      await fbDb.collection('notes').doc(NOTES_STATE.editingId).update({
        itens:       itensPayload,
        atualizadaEm: ntNow(),
        updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
      });
      APP.toast('Item removido e salvo', 'success');
    } catch(err) {
      console.error('[NT] Erro ao remover item imediatamente:', err);
      APP.toast('Item removido localmente (falha ao sincronizar)', 'warning');
    }
  } else {
    APP.toast('Item removido', 'success');
  }
}



async function ntSaveNote(){
  const titulo    = document.getElementById('ntF_titulo').value.trim();
  const descricao = document.getElementById('ntF_descricao').value.trim();
  const tipo      = document.getElementById('ntF_tipo').value;
  const status    = document.getElementById('ntF_status').value;
  // Captura bruta. Para tipo=anotação, ignoramos esses valores no payload final.
  const prazoBruto = document.getElementById('ntF_prazo').value || null;
  const respBruto  = document.getElementById('ntF_resp').value  || null;

  if(!titulo){ APP.toast('Título é obrigatório', 'error'); return; }
  if(tipo === 'acao'){
    if(!prazoBruto){ APP.toast('Ações exigem prazo', 'error'); return; }
    if(!respBruto){  APP.toast('Ações exigem responsável', 'error'); return; }
  }

  // Se existe editingId, validar autoria/permissão antes de prosseguir.
  if(NOTES_STATE.editingId){
    const note = NOTES_STATE.notes.find(n => n.id === NOTES_STATE.editingId);
    if(!note || !ntCanEdit(note, STATE.usuario)){
      APP.toast('Sem permissão de edição', 'error');
      return;
    }
  }

  // Payload normalizado. Anotações nunca propagam prazo/responsável.
  const payload = {
    titulo, descricao, tipo, status,
    prazo:       tipo === 'acao' ? prazoBruto : null,
    responsavel: tipo === 'acao' ? respBruto  : null,
    itens: NOTES_STATE.draftItems.map(it => ({
      id: it.id,
      descricao: it.descricao || '',
      data: it.data || null,
      nota: it.nota || '',
      vPrevistoCent:  it.vPrevistoCent  || 0,
      vRealizadoCent: it.vRealizadoCent || 0
    }))
  };

  try {
    if(NOTES_STATE.editingId){
      const ok = await ntUpdateNote(NOTES_STATE.editingId, payload);
      if(ok){
        APP.toast('Nota atualizada', 'success');
        ntCloseOverlay('ntModalOverlay');
        // onSnapshot re-renderiza automaticamente
      }
    } else {
      await ntCreateNote(payload);
      APP.toast('Nota criada', 'success');
      ntCloseOverlay('ntModalOverlay');
      // onSnapshot re-renderiza automaticamente
    }
  } catch(err) {
    console.error('[NT] Erro ao salvar nota:', err);
    APP.toast('Erro ao salvar: ' + err.message, 'error');
  }
}

async function ntDeleteCurrent(){
  if(!NOTES_STATE.editingId) return;
  const note = NOTES_STATE.notes.find(n => n.id === NOTES_STATE.editingId);
  if(!note) return;
  if(!confirm(`Mover "${note.titulo}" para a lixeira?`)) return;
  try {
    const ok = await ntDeleteNote(note.id);
    if(ok){
      APP.toast('Nota movida para lixeira', 'success');
      ntCloseOverlay('ntModalOverlay');
      // onSnapshot re-renderiza automaticamente
    }
  } catch(err) {
    console.error('[NT] Erro ao excluir:', err);
    APP.toast('Erro ao excluir: ' + err.message, 'error');
  }
}

/* ═════════════════════════════════════════════════════════════════════
   LIXEIRA E LOG
   ───────────────────────────────────────────────────────────────────── */

function ntRenderTrashCount(){
  document.getElementById('ntTrashCount').textContent = NOTES_STATE.trash.length;
}

function ntRenderTrash(){
  const tbody = document.getElementById('ntTrashBody');
  if(NOTES_STATE.trash.length === 0){
    tbody.innerHTML = `<tr><td colspan="6" class="nt-items-empty">Lixeira vazia.</td></tr>`;
    return;
  }
  tbody.innerHTML = NOTES_STATE.trash.map(n => {
    const canRestore = ntCanEdit(n, STATE.usuario);
    return `
      <tr>
        <td>${ntEscape(n.titulo)}</td>
        <td>${n.tipo === 'acao' ? 'Ação' : 'Anotação'}</td>
        <td>${n.autor}</td>
        <td>${n.excluidoPor}</td>
        <td>${ntFmtDateTime(n.excluidoEm)}</td>
        <td>
          <div class="nt-row-actions">
            <button class="nt-btn nt-btn-secondary" data-restore="${n.id}" ${canRestore ? '' : 'disabled'} style="padding:4px 10px;font-size:11px">Restaurar</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  tbody.querySelectorAll('[data-restore]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const ok = await ntRestoreNote(btn.dataset.restore);
        if(ok){
          APP.toast('Nota restaurada', 'success');
          // onSnapshot re-renderiza automaticamente
        }
      } catch(err) {
        console.error('[NT] Erro ao restaurar:', err);
        APP.toast('Erro ao restaurar: ' + err.message, 'error');
      }
    });
  });
}

async function ntRenderLog(){
  const tbody = document.getElementById('ntLogBody');
  tbody.innerHTML = '<tr><td colspan="4" class="nt-items-empty">Carregando...</td></tr>';

  try {
    // Carrega os últimos 100 eventos do log, ordenados por timestamp descendente.
    // Diretriz: não combinar orderBy + where. Ordenamos no JS.
    const snap = await fbDb.collection('notes_log').get();
    const sorted = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    if(sorted.length === 0){
      tbody.innerHTML = '<tr><td colspan="4" class="nt-items-empty">Nenhum evento registrado.</td></tr>';
      return;
    }
    const evMap = {
      cadastro:    'Cadastro',
      edicao:      'Edição',
      exclusao:    'Exclusão',
      restauracao: 'Restauração'
    };
  tbody.innerHTML = sorted.map(e => `
    <tr>
      <td>${ntFmtDateTime(e.timestamp)}</td>
      <td>${evMap[e.evento] || e.evento}</td>
      <td>${ntEscape(e.detalhes)}</td>
      <td>${e.usuario}</td>
    </tr>
  `).join('');
  } catch(err) {
    console.error('[NT] Erro ao carregar log:', err);
    tbody.innerHTML = '<tr><td colspan="4" class="nt-items-empty">Erro ao carregar log.</td></tr>';
  }
}

/* ═════════════════════════════════════════════════════════════════════
   PAINEL DE ANÁLISE COLAPSÁVEL
   Mantém o foco no Kanban; KPIs e filtros recolhidos por padrão.
   ───────────────────────────────────────────────────────────────────── */

function ntToggleAnalytics(){
  NOTES_STATE.analyticsOpen = !NOTES_STATE.analyticsOpen;
  ntApplyAnalyticsState();
}

function ntApplyAnalyticsState(){
  const panel = document.getElementById('ntAnalyticsPanel');
  const btn   = document.getElementById('ntBtnToggleAnalytics');
  const lbl   = document.getElementById('ntToggleAnalyticsLabel');
  const isOpen = !!NOTES_STATE.analyticsOpen;

  panel.classList.toggle('open', isOpen);
  btn.classList.toggle('open', isOpen);
  btn.setAttribute('aria-expanded', String(isOpen));
  lbl.textContent = isOpen ? 'Ocultar Painel de Análise' : 'Mostrar Painel de Análise';
}

/* ═════════════════════════════════════════════════════════════════════
   OVERLAYS
   ───────────────────────────────────────────────────────────────────── */

function ntOpenOverlay(id){
  document.getElementById(id).classList.add('open');
}
function ntCloseOverlay(id){
  document.getElementById(id).classList.remove('open');
}

/* ═════════════════════════════════════════════════════════════════════
   SEED DESATIVADO (dados reais vêm do Firestore)
   ───────────────────────────────────────────────────────────────────── */

function ntSeed(){
  // Desativado na Fase B.2: dados reais vêm do Firestore via onSnapshot.
  // Mantido como função vazia para compatibilidade com chamadas existentes.
}

/* ═════════════════════════════════════════════════════════════════════
   LISTENERS REAL-TIME (FIRESTORE)
   Espelham os dados do Firestore em NOTES_STATE.notes e .trash.
   Cada snapshot atualiza o array local e re-renderiza a UI.
   Mesma abordagem usada por fin-db.js para CACHE.contas.
   ───────────────────────────────────────────────────────────────────── */

const _ntListeners = [];

/**
 * Instala listeners onSnapshot para as coleções notes e notes_trash.
 * Chamado UMA VEZ no NT.init(). Idempotente: se já instalou, não duplica.
 *
 * Os listeners atualizam NOTES_STATE.notes e .trash automaticamente.
 * Cada mudança no Firestore (por Leo OU Pri, em qualquer dispositivo)
 * dispara re-render imediato sem precisar de refresh.
 */
function setupNotesListeners(){
  // Guard: não duplicar listeners
  if(_ntListeners.length > 0) return;

  // ── Coleção principal: notes ──
  _ntListeners.push(
    fbDb.collection('notes').onSnapshot(snap => {
      NOTES_STATE.notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Re-renderizar apenas se estamos na tela de Notas
      if(typeof STATE !== 'undefined' && STATE.page === 'notas'){
        ntRenderAll();
      }
    }, err => {
      console.error('[NT] Erro no listener de notes:', err);
    })
  );

  // ── Coleção de lixeira: notes_trash ──
  _ntListeners.push(
    fbDb.collection('notes_trash').onSnapshot(snap => {
      NOTES_STATE.trash = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if(typeof STATE !== 'undefined' && STATE.page === 'notas'){
        ntRenderTrashCount();
        // Se o modal da lixeira estiver aberto, re-renderiza
        const trashOv = document.getElementById('ntTrashOverlay');
        if(trashOv && trashOv.classList.contains('open')){
          ntRenderTrash();
        }
      }
    }, err => {
      console.error('[NT] Erro no listener de notes_trash:', err);
    })
  );
}

/**
 * Remove listeners. Chamado no NT.destroy() para evitar listeners
 * órfãos consumindo quota do Firestore quando o módulo não está ativo.
 */
function teardownNotesListeners(){
  _ntListeners.forEach(unsub => {
    if(typeof unsub === 'function') unsub();
  });
  _ntListeners.length = 0;
}

/* ═════════════════════════════════════════════════════════════════════
   FILTRO DE PERÍODO, padrão Duetto (Ano + Mês Início + Mês Fim)
   ───────────────────────────────────────────────────────────────────── */

/**
 * Abre o modal de período pré-preenchido com o estado atual.
 * Se não há período, usa o ano corrente como sugestão.
 */
function ntOpenPeriodoModal(){
  const p = NOTES_STATE.periodo;
  document.getElementById('ntPeriodoAno').value    = p ? p.ano    : new Date().getFullYear();
  document.getElementById('ntPeriodoMesIni').value = p ? String(p.mesIni) : '';
  document.getElementById('ntPeriodoMesFim').value = p ? String(p.mesFim) : '';
  ntOpenOverlay('ntPeriodoOverlay');
  setTimeout(() => document.getElementById('ntPeriodoAno').focus(), 80);
}

/**
 * Aplica o período informado no modal. Validações:
 *   - Ano entre 2019 e 2035 (limite alinhado com o app principal)
 *   - mesIni e mesFim obrigatórios
 *   - mesFim não pode ser anterior a mesIni dentro do mesmo ano
 */
function ntAplicarPeriodo(){
  const ano    = parseInt(document.getElementById('ntPeriodoAno').value, 10);
  const mesIni = document.getElementById('ntPeriodoMesIni').value;
  const mesFim = document.getElementById('ntPeriodoMesFim').value;
  if(!ano || ano < 2019 || ano > 2035){
    APP.toast('Informe um ano válido (2019 a 2035)', 'error'); return;
  }
  if(mesIni === '' || mesFim === ''){
    APP.toast('Selecione o mês inicial e o mês final', 'error'); return;
  }
  const mi = parseInt(mesIni, 10);
  const mf = parseInt(mesFim, 10);
  if(mf < mi){
    APP.toast('O mês final não pode ser anterior ao mês inicial', 'error'); return;
  }
  NOTES_STATE.periodo = {ano, mesIni: mi, mesFim: mf};
  ntCloseOverlay('ntPeriodoOverlay');
  ntRenderAll();
  APP.toast('Período aplicado', 'success');
}

/**
 * Remove o filtro de período. Pode ser chamado pelo botão do modal
 * ou pelo clique no badge.
 */
function ntLimparPeriodo(){
  NOTES_STATE.periodo = null;
  ntCloseOverlay('ntPeriodoOverlay');
  ntRenderAll();
}

/* ═════════════════════════════════════════════════════════════════════
   ORDENAÇÃO DA TABELA LISTA
   Estado: NOTES_STATE.listSort = {column, dir}.
   Quando column é null, usa ordenação default por status.
   Persistência: por usuário em localStorage (junto com columnsConfig).
   ───────────────────────────────────────────────────────────────────── */

/**
 * Alterna ordenação ao clicar em um cabeçalho da Lista.
 * Comportamento:
 *   - Primeiro clique em coluna nova: define como asc
 *   - Segundo clique na mesma coluna: alterna para desc
 *   - Terceiro clique na mesma coluna: remove ordenação manual (volta ao default)
 *
 * @param {string} columnKey
 */
function ntToggleListSort(columnKey){
  const s = NOTES_STATE.listSort;
  if(s.column !== columnKey){
    s.column = columnKey;
    s.dir    = 'asc';
  } else if(s.dir === 'asc'){
    s.dir = 'desc';
  } else {
    s.column = null;
    s.dir    = 'asc';
  }
  ntSavePrefs();
  ntRenderAll();
}

/**
 * Comparador genérico para uso no sort do modo Lista.
 * Trata strings com localeCompare(pt), números diretamente, datas YYYY-MM-DD
 * com localeCompare (lexicograficamente correto), e status com ordem fixa.
 *
 * @param {object} a nota
 * @param {object} b nota
 * @param {string} key chave da coluna (titulo, status, tipo, ...)
 * @returns {number}
 */
function ntListSortComparator(a, b, key){
  const col = NT_LIST_COLUMNS.find(c => c.key === key);
  if(!col) return 0;

  // Extração do valor de comparação por coluna.
  const getVal = (note) => {
    switch(key){
      case 'titulo':      return note.titulo || '';
      case 'status':      return ntStatusEfetivo(note);
      case 'tipo':        return note.tipo || '';
      case 'autor':       return note.autor || '';
      case 'responsavel': return note.responsavel || '';
      case 'prazo':       return note.prazo || '';
      case 'itens':       return (note.itens || []).length;
      case 'vPrevisto':   return (note.itens || []).reduce((s, it) => s + (it.vPrevistoCent  || 0), 0);
      case 'vRealizado':  return (note.itens || []).reduce((s, it) => s + (it.vRealizadoCent || 0), 0);
      default: return '';
    }
  };
  const va = getVal(a);
  const vb = getVal(b);

  // Vazios sempre ao final, independentemente da direção, para evitar que
  // a coluna pareça "quebrada" quando há muitos itens sem valor.
  const isEmpty = v => v === '' || v == null;
  if(isEmpty(va) && !isEmpty(vb)) return 1;
  if(!isEmpty(va) && isEmpty(vb)) return -1;
  if(isEmpty(va) && isEmpty(vb))  return 0;

  if(col.type === 'status'){
    // Ordem semântica: ativa antes de atraso antes de concluida.
    const order = {ativa:0, atraso:1, concluida:2};
    return (order[va] || 0) - (order[vb] || 0);
  }
  if(col.type === 'number'){
    return va - vb;
  }
  // string e date: localeCompare. Para date YYYY-MM-DD, lexicográfico funciona.
  return String(va).localeCompare(String(vb), 'pt', {numeric:true, sensitivity:'base'});
}

/* ═════════════════════════════════════════════════════════════════════
   CONFIGURAÇÃO DE COLUNAS POR USUÁRIO
   Persistência: localStorage com chave nt_columns_<usuario>.
   Em produção, virará campo no documento users/{uid} no Firestore.
   ───────────────────────────────────────────────────────────────────── */

/**
 * Retorna a configuração default de colunas a partir de NT_LIST_COLUMNS.
 * Cada coluna recebe {key, visible} na ordem original do array fonte.
 */
function ntDefaultColumns(){
  return NT_LIST_COLUMNS.map(c => ({key: c.key, visible: c.defaultVisible}));
}

/**
 * Carrega configuração de colunas do localStorage para o usuário corrente.
 * Caso não haja registro, retorna a configuração default.
 *
 * Resiliência: se o JSON estiver corrompido ou faltarem colunas (ex: nova
 * coluna adicionada na lib após o último save do usuário), reconstrói
 * o array preservando a ordem do usuário e adicionando novas colunas ao final
 * com defaultVisible=true.
 */
function ntLoadColumns(usuario){
  try{
    const raw = localStorage.getItem('nt_columns_' + usuario);
    if(!raw) return ntDefaultColumns();
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed)) return ntDefaultColumns();

    const validKeys = new Set(NT_LIST_COLUMNS.map(c => c.key));
    // Mantém apenas colunas válidas, preservando ordem do usuário.
    const result = parsed
      .filter(c => c && validKeys.has(c.key))
      .map(c => ({key: c.key, visible: !!c.visible}));

    // Adiciona ao final colunas que existem na lib mas não estavam salvas.
    const seen = new Set(result.map(c => c.key));
    NT_LIST_COLUMNS.forEach(col => {
      if(!seen.has(col.key)){
        result.push({key: col.key, visible: col.defaultVisible});
      }
    });
    // Garante pelo menos 1 coluna visível (fallback de segurança).
    if(!result.some(c => c.visible)) result[0].visible = true;
    return result;
  } catch(e){
    return ntDefaultColumns();
  }
}

/**
 * Persiste a configuração atual no localStorage para o usuário corrente.
 */
function ntPersistColumns(){
  try{
    localStorage.setItem(
      'nt_columns_' + STATE.usuario,
      JSON.stringify(NOTES_STATE.columnsConfig)
    );
  } catch(e){
    APP.toast('Não foi possível salvar a configuração: ' + e.message, 'error');
  }
}

/**
 * Persiste preferências adicionais (listSort, viewMode) por usuário.
 * Chave: nt_prefs_<usuario>.
 */
function ntSavePrefs(){
  try{
    const data = {
      listSort: NOTES_STATE.listSort,
      viewMode: NOTES_STATE.viewMode
    };
    localStorage.setItem('nt_prefs_' + STATE.usuario, JSON.stringify(data));
  } catch(e){
    // Falhas em prefs não são críticas; apenas logamos no console.
    console.warn('[NotesPrefs]', e);
  }
}

function ntLoadPrefs(usuario){
  try{
    const raw = localStorage.getItem('nt_prefs_' + usuario);
    if(!raw) return {listSort: {column:null, dir:'asc'}, viewMode: 'grade'};
    const p = JSON.parse(raw);
    return {
      listSort: (p.listSort && typeof p.listSort.column !== 'undefined')
        ? p.listSort
        : {column:null, dir:'asc'},
      viewMode: (p.viewMode === 'lista' || p.viewMode === 'grade') ? p.viewMode : 'grade'
    };
  } catch(e){
    return {listSort: {column:null, dir:'asc'}, viewMode: 'grade'};
  }
}

/**
 * Aplica ao estado as preferências carregadas do storage.
 */
function ntApplyUserPrefs(usuario){
  NOTES_STATE.columnsConfig = ntLoadColumns(usuario);
  const prefs = ntLoadPrefs(usuario);
  NOTES_STATE.listSort = prefs.listSort;
  NOTES_STATE.viewMode = prefs.viewMode;
}

/* ═════════════════════════════════════════════════════════════════════
   MODAL DE CONFIGURAÇÃO DE COLUNAS
   Drag and drop nativo HTML5 + setas ↑↓ para acessibilidade mobile.
   Estado temporário em ntColumnsDraft, só persiste ao salvar.
   ───────────────────────────────────────────────────────────────────── */

let ntColumnsDraft = null;

function ntOpenColumnsModal(){
  // Cópia profunda para edição isolada; cancelamento descarta.
  ntColumnsDraft = JSON.parse(JSON.stringify(NOTES_STATE.columnsConfig));
  ntRenderColumnsList();
  ntOpenOverlay('ntColumnsOverlay');
}

function ntRenderColumnsList(){
  const list = document.getElementById('ntColumnsList');
  list.innerHTML = ntColumnsDraft.map((c, idx) => {
    const def = NT_LIST_COLUMNS.find(d => d.key === c.key);
    const label = def ? def.label : c.key;
    const isFirst = idx === 0;
    const isLast  = idx === ntColumnsDraft.length - 1;
    return `
      <div class="nt-col-row" draggable="true" data-idx="${idx}">
        <div class="nt-col-grip" title="Arraste para reordenar">
          <svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="8" y2="6.01"/><line x1="8" y1="12" x2="8" y2="12.01"/><line x1="8" y1="18" x2="8" y2="18.01"/><line x1="16" y1="6" x2="16" y2="6.01"/><line x1="16" y1="12" x2="16" y2="12.01"/><line x1="16" y1="18" x2="16" y2="18.01"/></svg>
        </div>
        <label class="nt-col-checkbox">
          <input type="checkbox" data-key="${c.key}" ${c.visible ? 'checked' : ''}>
        </label>
        <span class="nt-col-name ${c.visible ? '' : 'disabled'}">${label}</span>
        <div class="nt-col-arrows">
          <button data-act="up" data-idx="${idx}" ${isFirst ? 'disabled' : ''} title="Mover para cima">
            <svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button data-act="down" data-idx="${idx}" ${isLast ? 'disabled' : ''} title="Mover para baixo">
            <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Bindings de checkboxes.
  list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', e => {
      const key = e.target.dataset.key;
      const c = ntColumnsDraft.find(x => x.key === key);
      if(c) c.visible = e.target.checked;
      // Re-render parcial: apenas atualiza a classe disabled do label.
      const span = e.target.closest('.nt-col-row').querySelector('.nt-col-name');
      span.classList.toggle('disabled', !c.visible);
    });
  });

  // Bindings das setas.
  list.querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const dir = btn.dataset.act === 'up' ? -1 : 1;
      const target = idx + dir;
      if(target < 0 || target >= ntColumnsDraft.length) return;
      const tmp = ntColumnsDraft[idx];
      ntColumnsDraft[idx] = ntColumnsDraft[target];
      ntColumnsDraft[target] = tmp;
      ntRenderColumnsList();
    });
  });

  // Drag and drop nativo HTML5 (apenas desktop com mouse).
  let dragSrc = null;
  list.querySelectorAll('.nt-col-row').forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrc = parseInt(row.dataset.idx, 10);
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      list.querySelectorAll('.nt-col-row').forEach(r => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.nt-col-row').forEach(r => r.classList.remove('drag-over'));
      row.classList.add('drag-over');
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      const tgt = parseInt(row.dataset.idx, 10);
      if(dragSrc == null || dragSrc === tgt) return;
      const moved = ntColumnsDraft.splice(dragSrc, 1)[0];
      ntColumnsDraft.splice(tgt, 0, moved);
      dragSrc = null;
      ntRenderColumnsList();
    });
  });
}

/**
 * Salva configuração de colunas do draft no estado e no localStorage.
 * Validação: pelo menos 1 coluna deve estar visível.
 */
function ntSaveColumns(){
  if(!ntColumnsDraft.some(c => c.visible)){
    APP.toast('Pelo menos uma coluna deve ficar visível', 'error');
    return;
  }
  NOTES_STATE.columnsConfig = JSON.parse(JSON.stringify(ntColumnsDraft));
  ntPersistColumns();
  ntCloseOverlay('ntColumnsOverlay');
  ntRenderAll();
  APP.toast('Configuração de colunas salva', 'success');
}

/**
 * Restaura as colunas para a configuração padrão e re-renderiza o modal.
 * O usuário ainda precisa clicar em Salvar para persistir.
 */
function ntResetColumns(){
  ntColumnsDraft = ntDefaultColumns();
  ntRenderColumnsList();
  APP.toast('Padrão restaurado, clique em Salvar para confirmar', 'success');
}



function ntBindEvents(){
  document.getElementById('ntBtnNew').addEventListener('click', ntOpenNewModal);
  document.getElementById('ntBtnTrash').addEventListener('click', () => {
    ntRenderTrash();
    ntOpenOverlay('ntTrashOverlay');
  });
  document.getElementById('ntBtnLog').addEventListener('click', () => {
    ntRenderLog();
    ntOpenOverlay('ntLogOverlay');
  });

  // Painel de Análise: toggle visibilidade de KPIs e filtros.
  document.getElementById('ntBtnToggleAnalytics').addEventListener('click', ntToggleAnalytics);

  // Filtros, atualizam estado e re-renderizam KPIs e cards.
  document.getElementById('ntFilterAutor').addEventListener('change', e => {
    NOTES_STATE.filters.autor = e.target.value;
    ntRenderAll();
  });
  document.getElementById('ntFilterTipo').addEventListener('change', e => {
    NOTES_STATE.filters.tipo = e.target.value;
    ntRenderAll();
  });
  document.getElementById('ntFilterStatus').addEventListener('change', e => {
    NOTES_STATE.filters.status = e.target.value;
    ntRenderAll();
  });
  // Período (padrão Duetto), abre o modal Ano + Mês Início + Mês Fim.
  document.getElementById('ntBtnPeriodo').addEventListener('click', ntOpenPeriodoModal);
  // Badge clicável remove o período diretamente.
  document.getElementById('ntPeriodoBadge').addEventListener('click', () => {
    NOTES_STATE.periodo = null;
    ntRenderAll();
    APP.toast('Período removido', 'success');
  });
  // Botões dentro do modal de período.
  document.getElementById('ntBtnAplicarPeriodo').addEventListener('click', ntAplicarPeriodo);
  document.getElementById('ntBtnLimparPeriodo').addEventListener('click', ntLimparPeriodo);

  document.getElementById('ntBtnClearFilters').addEventListener('click', ntClearFilters);

  // Busca rápida profunda. Debounce de 120ms para evitar render excessivo
  // em digitação rápida sobre bases maiores.
  const searchInput = document.getElementById('ntSearchInput');
  let searchTimer = null;
  searchInput.addEventListener('input', e => {
    const val = e.target.value;
    e.target.classList.toggle('has-value', val.length > 0);
    if(searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      NOTES_STATE.searchQuery = val;
      ntRenderAll();
    }, 120);
  });
  document.getElementById('ntSearchClear').addEventListener('click', () => {
    searchInput.value = '';
    searchInput.classList.remove('has-value');
    NOTES_STATE.searchQuery = '';
    if(searchTimer) clearTimeout(searchTimer);
    ntRenderAll();
    searchInput.focus();
  });

  // Alternância de visualização Grade <-> Lista.
  // O modo escolhido é persistido por usuário (localStorage), restaurado no boot
  // e ao trocar de usuário via ntApplyUserPrefs.
  document.querySelectorAll('#ntViewMode button').forEach(btn => {
    btn.addEventListener('click', () => {
      NOTES_STATE.viewMode = btn.dataset.view === 'lista' ? 'lista' : 'grade';
      ntSavePrefs();
      ntApplyViewMode();
      ntRenderAll();
    });
  });

  // Configuração de colunas da tabela Lista.
  document.getElementById('ntBtnColumns').addEventListener('click', ntOpenColumnsModal);
  document.getElementById('ntBtnSaveColumns').addEventListener('click', ntSaveColumns);
  document.getElementById('ntBtnResetColumns').addEventListener('click', ntResetColumns);

  // Fechamento de modais e sub-modal via [data-nt-close] e clique fora.
  document.querySelectorAll('[data-nt-close]').forEach(b => {
    b.addEventListener('click', () => ntCloseOverlay(b.dataset.ntClose));
  });
  document.querySelectorAll('.nt-modal-overlay, .nt-submodal-overlay').forEach(ov => {
    ov.addEventListener('click', e => { if(e.target === ov) ntCloseOverlay(ov.id); });
  });

  // Mudança de tipo no formulário ajusta UX (campos prazo/responsável).
  document.getElementById('ntF_tipo').addEventListener('change', ntApplyTipoUX);

  // Save / Delete da nota.
  document.getElementById('ntBtnSave').addEventListener('click', ntSaveNote);
  document.getElementById('ntBtnDelete').addEventListener('click', ntDeleteCurrent);

  // + Item, agora abre o sub-modal em modo criação.
  document.getElementById('ntBtnAddItem').addEventListener('click', () => ntOpenItemModal(null));

  // Sub-modal de item: salvar e excluir (async: persist imediato ao Firestore).
  document.getElementById('ntBtnSaveItem').addEventListener('click', () => ntSaveItem());
  document.getElementById('ntBtnDeleteItem').addEventListener('click', () => ntDeleteItem());

  // Máscara de moeda em tempo real para todos os campos .nt-money.
  // Reaproveita ntParseCents (string → centavos) e ntFmtNumero (centavos → string pt-BR).
  // Idempotente: pode ser chamado várias vezes sem duplicar listeners (guard data-nt-money-bound).
  ntBindMoneyMasks(document);

  // ESC fecha o overlay mais alto na pilha (sub-modal antes do modal principal).
  document.addEventListener('keydown', e => {
    if(e.key !== 'Escape') return;
    const subOpen = document.querySelector('.nt-submodal-overlay.open');
    if(subOpen){ subOpen.classList.remove('open'); return; }
    document.querySelectorAll('.nt-modal-overlay.open').forEach(ov => ov.classList.remove('open'));
  });
}

/* ═════════════════════════════════════════════════════════════════════
   BOOT
   ───────────────────────────────────────────────────────────────────── */




/* =====================================================================
   NAMESPACE NT + BOOT VIA EVENTO
   ===================================================================== */

const NT = {
  _initialized: false,

  init() {
    // Instalar listeners real-time do Firestore (idempotente)
    setupNotesListeners();
    // Carregar preferências do usuário (colunas, ordenação, viewMode)
    ntApplyUserPrefs(STATE.usuario);
    // Instalar event listeners nos elementos da view
    ntBindEvents();
    // Aplicar estado visual inicial
    ntApplyAnalyticsState();
    ntApplyViewMode();
    // Render inicial (onSnapshot populará os dados e re-renderizará)
    ntRenderAll();
    this._initialized = true;
  },

  destroy() {
    teardownNotesListeners();
    this._initialized = false;
  }
};

window.NT = NT;

document.addEventListener('duetto:view-loaded', e => {
  if (e.detail && e.detail.page === 'notas') {
    NT.init();
  }
});
