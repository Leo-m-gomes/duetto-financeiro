/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO eac-gestao.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Modais da tela EAC (containers em views/modals.html):
 *   ovEacDetalhe   detalhe de uma linha (consolidado, grupo ou categoria)
 *   ovEacLB        linhas de base: histórico, salvar nova revisão, comparar
 *   ovEacExcl      contas da LB que foram excluídas: cancelada × indevida
 *   ovEacGrupos    grupos de categorias: criar, renomear, ordenar, excluir, mover
 *   ovExcluirConta pergunta da exclusão em Contas quando o ano tem LB
 * Toda gravação passa por FS.* (js/fin-db.js), que registra em eac_log.
 *
 * DEPENDÊNCIAS: eac.js (EAC_ST, helpers eac*, _eacCalcular...), fin-db (FS), ui-money.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

const EAC_LB  = { aba:'hist', escopo:'geral', sel:new Set(), just:'', verbas:{}, a:0, b:0, salvando:false };
const EAC_GRP = { sel:new Set(), edit:null, del:null, erro:'', novo:'', novoNome:null, ocupado:false };
let eacLixeira = null;   // lixeira lida ao abrir o modal de excluídas (quem excluiu e quando)

// Sugestão inicial de grupos (só categorias que existirem com esse nome entram)
const EAC_GRUPOS_SUGERIDOS = [
  ['Moradia', ['Casa','Internet','Telefone','Contrato']],
  ['Alimentação', ['Alimentação','Restaurante','Lanche']],
  ['Transporte', ['Carro','Combustível']],
  ['Educação', ['Escola','Faculdade','Pós-Graduação','Cursos','Estudos']],
  ['Saúde e cuidados', ['Saúde','Farmácia','Barbearia','Salão']],
  ['Lazer e assinaturas', ['Streamer','Games','Presente','Aposta']],
  ['Compromissos financeiros', ['Empréstimo','Negociação']],
  ['Pessoal e outros', ['Roupa','Calçado','Pet','Igreja','Custo com trabalho','Outros']],
];

const eacIco = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const EAC_IC = {
  up:'<polyline points="18 15 12 9 6 15"/>', down:'<polyline points="6 9 12 15 18 9"/>',
  pen:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  lixo:'<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>',
};

Object.assign(APP, {

  _eacAbrirOv(id){ document.getElementById(id)?.classList.add('open'); },
  _eacSet(id, html){ const el = document.getElementById(id); if(el) el.innerHTML = html; },

  /** Ações que alteram a EAC são só do administrador: avisa e devolve false para os demais. */
  _eacExigirAdmin(){
    if(this.eacPodeAlterar()) return true;
    this.toast('Somente o administrador pode alterar a EAC','error');
    return false;
  },

  _eacFarol(n){
    if(n.dev==null) return '<span class="eac-pill neu">Sem LB</span>';
    if(!n.plan && n.dev>0) return '<span class="eac-pill bad">Fora do plano</span>';
    const p = eacPct(n.dev, n.plan);
    return p>EAC_FAROL_PCT ? '<span class="eac-pill bad">Acima do plano</span>'
         : p>0 ? '<span class="eac-pill warn">Atenção</span>'
         : '<span class="eac-pill ok">Dentro do plano</span>';
  },

  // ══════════════════════════════════════════════════════════════════════
  // DETALHE DA LINHA
  // ══════════════════════════════════════════════════════════════════════

  _eacNo(id){
    const T = EAC_ST.arvore;
    if(!T) return null;
    return id==='tot' ? T.total : T.grupos.find(g=>g.id===id) || T.cats.find(c=>c.id===id) || null;
  },

  _eacMesSVG(n){
    const W = 520, H = 170, ml = 8, mr = 8, mt = 14, mb = 22;
    const max = Math.max(1, ...n.compM, ...(n.planM||[0]))*1.12;
    const slot = (W-ml-mr)/12, bw = slot*0.5, y = v => mt+(H-mt-mb)*(1-v/max);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:360px" role="img" aria-label="Planejado, comprometido e pago por mês">`;
    s += `<line class="eac-grid" x1="${ml}" x2="${W-mr}" y1="${H-mb}" y2="${H-mb}"/>`;
    MESES.forEach((m,i)=>{
      const cx = ml+slot*i+slot/2, c = n.compM[i], r = Math.min(n.realM[i], c||n.realM[i]);
      s += `<rect class="eac-m-comp" x="${cx-bw/2}" y="${y(c)}" width="${bw}" height="${H-mb-y(c)}" rx="2"><title>${MESES_F[i]}: comprometido ${eacFmt(c)}, pago ${eacFmt(n.realM[i])}${n.planM?', planejado '+eacFmt(n.planM[i]):''}</title></rect>`;
      if(r) s += `<rect class="eac-m-real" x="${cx-bw/2}" y="${y(r)}" width="${bw}" height="${H-mb-y(r)}" rx="2"/>`;
      if(n.planM) s += `<line class="eac-m-plan" x1="${cx-bw/2-4}" x2="${cx+bw/2+4}" y1="${y(n.planM[i])}" y2="${y(n.planM[i])}"/>`;
      s += `<text class="eac-ax" x="${cx}" y="${H-7}" text-anchor="middle">${m}</text>`;
    });
    return s+`</svg><div class="eac-legend"><span><i class="eac-m-comp" style="background:color-mix(in srgb,var(--blue) 30%,transparent);height:8px"></i>Comprometido</span><span><i style="background:var(--palm);height:8px"></i>Já pago</span><span><i style="background:var(--t1)"></i>Planejado</span></div>`;
  },

  _eacListaItens(lista, limite=15){
    const esc = v=>this._escHtml(v);
    if(!lista.length) return '<p class="eac-note" style="padding:10px 0">Nada nesta causa.</p>';
    const rest = lista.slice(limite), somaRest = eacSoma(rest.map(i=>i.v));
    const rotulo = i => i.cls==='indevida' ? ' · ignorada na EAC' : i.cls==='cancelada' ? ' · cancelada (economia)' : i.cls==='pendente' ? ' · <b style="color:var(--orange)">a classificar</b>' : '';
    return `<div class="eac-list">${lista.slice(0,limite).map(i=>`<div class="eac-li"><div class="eac-grow"><div class="t">${esc(i.t||'(sem descrição)')}</div><div class="s">${esc(i.s)}${rotulo(i)}</div></div><span class="v money ${i.v>0?'up':'dn'}">${eacFmtSig(i.v)}</span></div>`).join('')}
      ${rest.length?`<div class="eac-li-mais">e mais ${rest.length} conta${rest.length>1?'s':''} · <span class="money">${eacFmtSig(somaRest)}</span></div>`:''}</div>`;
  },

  _eacComposicao(filhos, titulo){
    const arr = filhos.filter(f=>f.dev).sort((a,b)=>Math.abs(b.dev)-Math.abs(a.dev)).slice(0,8);
    if(!arr.length) return '';
    const mx = Math.max(1, ...arr.map(f=>Math.abs(f.dev)));
    return `<div class="eac-sec"><h4>${titulo}</h4><div class="eac-list">${arr.map(f=>`<div class="eac-li"><i class="eac-dot" style="background:${eacCor(f.cor)}"></i><div class="eac-grow"><div class="t">${this._escHtml(f.nome)}</div><div class="eac-hbar"><i style="width:${Math.abs(f.dev)/mx*100}%;background:${f.dev>0?'var(--red)':'var(--green)'}"></i></div></div><span class="v money ${f.dev>0?'up':'dn'}">${eacFmtSig(f.dev)}</span></div>`).join('')}</div></div>`;
  },

  eacAbrirDetalhe(id){
    const n = this._eacNo(id), T = EAC_ST.arvore;
    if(!n) return;
    EAC_ST.detId = id;
    const esc = v=>this._escHtml(v), calc = T.calc;
    const tipo = n.nivel===1 ? 'Consolidado' : n.nivel===2 ? 'Grupo' : 'Categoria';
    const pr = eacPct(n.real, n.comp);
    this._eacSet('eacDetTitulo', `<span class="eac-m-code">${n.code}</span>${esc(n.nome)}`);
    this._eacSet('eacDetSub', `<span class="eac-pill neu">${tipo}</span>${this._eacFarol(n)}<span>${T.ano}${n.nivel===3?' · grupo '+esc(n.grupoNome):''}${STATE.resp?' · '+esc(STATE.resp):''}</span>`);
    const kp = `<div class="eac-mk-grid">
      <div class="eac-mk"><span>Planejado</span><b class="money">${n.plan==null?'sem LB':eacFmt(n.plan)}</b><small>${T.semLB?'sem linha de base':calc.usar0?'LB Rev 0':'LB Rev '+calc.lb.rev}${n.verba?' · verba '+eacFmt(n.verba):''}</small></div>
      <div class="eac-mk"><span>Comprometido</span><b class="money">${eacFmt(n.comp)}</b><small>a pagar ${eacFmt(n.comp-n.real)}</small></div>
      <div class="eac-mk"><span>Realizado</span><b class="money">${eacFmt(n.real)}</b><small>${Math.round(pr)}% do comprometido</small></div>
      <div class="eac-mk"><span>Desvio</span><b class="money" style="color:${n.dev>0?'var(--red)':n.dev<0?'var(--green)':'var(--t1)'}">${n.dev==null?'sem LB':eacFmtSig(n.dev)}</b><small>${n.dev==null?'':n.plan?eacFmtPct(eacPct(n.dev,n.plan))+' do planejado':'sem valor planejado'}</small></div></div>`;
    let extra = '';
    if(n.nivel===3){
      const abas = [['nov','Contas novas'],['rea','Reajustes'],['jd','Juros e descontos'],['exc','Exclusões'],['rec','Troca de categoria']].filter(([k])=>n.det[k].length);
      EAC_ST.detAba = abas[0]?.[0];
      const verba = n.verba ? `<p class="eac-note" style="margin-bottom:8px">Contas novas: <b class="money">${eacFmt(n.novBruto)}</b> contra verba planejada de <b class="money">${eacFmt(n.verba)}</b> no ano.</p>` : '';
      extra = `<div class="eac-sec"><h4>Contas que explicam o desvio</h4>${verba}${abas.length
        ? `<div class="eac-tabs" role="tablist">${abas.map(([k,l],i)=>`<button type="button" role="tab" data-eac-dtab="${k}" aria-selected="${i===0}" onclick="APP.eacDetAba('${k}')">${l} (${n.det[k].length})</button>`).join('')}</div><div id="eacDetItens">${this._eacListaItens(n.det[abas[0][0]])}</div>`
        : '<p class="eac-note">Nenhuma variação: as contas seguem exatamente a linha de base.</p>'}</div>`;
    } else if(!T.semLB){
      extra = this._eacComposicao(n.nivel===1 ? T.grupos : n.filhos, n.nivel===1 ? 'Desvio por grupo' : 'Desvio por categoria');
      if(n.nivel===1){
        extra += this._eacComposicao(T.cats.filter(c=>c.dev>0), 'Categorias que mais estouraram');
        extra += this._eacComposicao(T.cats.filter(c=>c.dev<0), 'Maiores economias');
      }
    }
    const lbs = this.eacLBs(T.ano);
    const hist = n.lbRevs && lbs.length ? `<div class="eac-sec"><h4>Esta linha nas revisões da LB${STATE.resp?' <span class="eac-pill neu">valores da casa</span>':''}</h4><div class="eac-list">${lbs.map((l,i)=>{
        const v = n.lbRevs[i]||0, d = i ? v-(n.lbRevs[i-1]||0) : 0;
        return `<div class="eac-li"><span class="eac-pill ${i===lbs.length-1?'ok':'neu'}">Rev ${l.rev}</span><div class="eac-grow"><div class="s">${l.criadaEmIso?new Date(l.criadaEmIso).toLocaleDateString('pt-BR'):''} · ${esc(l.criadaPor||'')}</div></div><span class="v money">${eacFmt(v)}</span><span class="money" style="min-width:100px;text-align:right;font-size:11.5px;color:${d>0?'var(--red)':d<0?'var(--green)':'var(--t4)'}">${i?(d?eacFmtSig(d):'sem mudança'):'original'}</span></div>`;
      }).join('')}</div></div>` : '';
    this._eacSet('eacDetBody', `${kp}<div class="eac-cols2"><div class="eac-sec"><h4>Ponte do desvio</h4><div class="eac-svgwrap">${this._eacBridgeSVG(n, calc, {compacto:true, w:460, h:220})}</div></div><div class="eac-sec"><h4>Mês a mês</h4><div class="eac-svgwrap">${this._eacMesSVG(n)}</div></div></div>${extra}${hist}`);
    const cat = n.nivel===3 && !n.id.startsWith('?') ? n.id : '';
    this._eacSet('eacDetFooter', `<button type="button" class="btn btn-secondary" onclick="APP.eacVerNoRelatorio('${cat}')">Ver contas no Relatório</button><button type="button" class="btn btn-primary" onclick="APP.closeModal('ovEacDetalhe')">Fechar</button>`);
    this._eacAbrirOv('ovEacDetalhe');
  },

  eacDetAba(k){
    const n = this._eacNo(EAC_ST.detId);
    if(!n || !n.det) return;
    document.querySelectorAll('[data-eac-dtab]').forEach(b=>b.setAttribute('aria-selected', String(b.dataset.eacDtab===k)));
    this._eacSet('eacDetItens', this._eacListaItens(n.det[k]||[]));
  },

  /** Abre o Relatório com o ano da EAC (e a categoria, se houver), sem outros filtros. */
  async eacVerNoRelatorio(catId){
    const ano = EAC_ST.ano;
    this.closeModal('ovEacDetalhe');
    if(window.ROUTER) await ROUTER.navigate('relatorio'); else this.goPage('relatorio');
    const set = (id,v)=>{ const el = document.getElementById(id); if(el) el.value = v; };
    set('relAno', String(ano)); set('relMes', 'todos'); set('relCat', catId ? CACHE.getCatNome(catId) : '');
    ['relStatus','relBusca'].forEach(id=>set(id, ''));
    this.filtroFormasDefinir('relatorio', []);
    STATE.periodo = null;
    this._atualizarPeriodoBadge('relatorio', null);
    this.renderRelatorio();
  },
});

Object.assign(APP, {

  // ══════════════════════════════════════════════════════════════════════
  // LINHAS DE BASE
  // ══════════════════════════════════════════════════════════════════════

  eacAbrirLB(aba){
    const lbs = this.eacLBs(EAC_ST.ano), vig = lbs[lbs.length-1];
    Object.assign(EAC_LB, {aba:(aba==='salvar' && !this.eacPodeAlterar()) ? 'hist' : (aba||'hist'), escopo:'geral', just:'', a:lbs[0]?.rev||0, b:vig?.rev||0, salvando:false});
    EAC_LB.sel = new Set();
    // Verba inicial: a da LB vigente (o usuário ajusta antes de salvar)
    EAC_LB.verbas = {};
    Object.entries(vig?.porCat||{}).forEach(([c,p])=>{ if(p.verbaMesCent) EAC_LB.verbas[c] = p.verbaMesCent; });
    if(vig) this._eacItens(vig);   // revisão por categoria copia as demais da vigente
    this.eacLBRender();
    this._eacAbrirOv('ovEacLB');
  },

  eacLBAba(aba){ EAC_LB.aba = aba; this.eacLBRender(); },

  eacLBRender(){
    const ano = EAC_ST.ano, lbs = this.eacLBs(ano);
    this._eacSet('eacLBTitulo', `Linhas de base ${ano}`);
    this._eacSet('eacLBSub', `<span>A revisão recomeça em 0 a cada ano</span><span class="eac-pill neu">Revisões imutáveis</span>${lbs.length?'':'<span class="eac-pill bad">Rev 0 pendente</span>'}${this.eacPodeAlterar()?'':'<span class="eac-pill warn">Somente leitura: só o administrador salva revisões</span>'}`);
    const abas = [['hist','Histórico'], ...(this.eacPodeAlterar()?[['salvar','Salvar nova revisão']]:[]), ['comp','Comparar revisões']];
    const corpo = {hist:()=>this._eacLBHist(ano), salvar:()=>this._eacLBSalvarHtml(ano), comp:()=>this._eacLBComp(ano)}[EAC_LB.aba]();
    this._eacSet('eacLBBody', `<div class="eac-tabs" role="tablist">${abas.map(([k,l])=>`<button type="button" role="tab" aria-selected="${EAC_LB.aba===k}" onclick="APP.eacLBAba('${k}')">${l}</button>`).join('')}</div>${corpo}`);
    if(EAC_LB.aba==='salvar') bindAllMoneyInputs(document.getElementById('eacLBBody'));
  },

  _eacEscopoTxt(l){
    if(l.escopo==='geral') return `Geral (${Object.keys(l.porCat||{}).length} categorias)`;
    const nomes = (l.catIds||[]).map(c=>CACHE.getCatNome(c));
    return 'Por categoria: '+(nomes.length>4 ? nomes.slice(0,4).join(', ')+` e mais ${nomes.length-4}` : nomes.join(', '));
  },

  _eacLBHist(ano){
    const lbs = this.eacLBs(ano), esc = v=>this._escHtml(v);
    if(!lbs.length) return `<p class="eac-note" style="padding:16px 0">Nenhuma revisão em ${ano}. Use a aba <b>Salvar nova revisão</b> para criar a Rev 0.</p>`;
    return `<div class="eac-revs">${[...lbs].reverse().map(l=>{
      const ant = lbs.find(x=>x.rev===l.rev-1), d = ant ? l.totalCent-ant.totalCent : 0, cur = l===lbs[lbs.length-1];
      return `<div class="eac-rev${cur?' cur':''}"><span class="eac-rev-n">Rev ${l.rev}</span>
        <div><div class="t">${esc(this._eacEscopoTxt(l))}${cur?'<span class="eac-pill ok">Vigente</span>':''}${l.foraDoPrazo?'<span class="eac-pill warn">Fora do prazo</span>':''}</div>
        <div class="s">Salva${l.criadaEmIso?' em '+new Date(l.criadaEmIso).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):''} por ${esc(l.criadaPor||'?')} · ${l.qtdContas||0} contas</div>
        ${l.justificativa?`<div class="j">${esc(l.justificativa)}</div>`:''}</div>
        <div class="amt"><b class="money">${eacFmt(l.totalCent||0)}</b><span class="money" style="color:${d>0?'var(--red)':d<0?'var(--green)':'var(--t4)'}">${ant?(d?eacFmtSig(d):'sem mudança'):'linha original'}</span></div></div>`;
    }).join('')}</div>`;
  },

  /** Contas cadastradas hoje no ano, por categoria (vPagar em centavos, da casa toda). */
  _eacCadastradoHoje(ano){
    const m = new Map();
    CACHE.contas.forEach(c=>{
      if(eacAnoDe(c.data)!==ano) return;
      const k = this._eacCatId(c), o = m.get(k)||{cent:0, qtd:0};
      o.cent += centavos(c.vPagar); o.qtd++; m.set(k, o);
    });
    return m;
  },

  /** Categorias agrupadas como na tabela (grupos na ordem; "Sem grupo" no fim). */
  _eacCatsAgrupadas(extras){
    const grupos = [...CACHE.grupos].sort((a,b)=>(a.ordem??0)-(b.ordem??0)||a.nome.localeCompare(b.nome,'pt'));
    const ids = new Set([...CACHE.cats.map(c=>c.id), ...(extras||[])]);
    const nome = id => id.startsWith('?') ? (id.slice(1)||'Sem categoria') : CACHE.getCatNome(id);
    const grupoDe = id => { const c = CACHE.cats.find(x=>x.id===id); return c?.grupoId && grupos.some(g=>g.id===c.grupoId) ? c.grupoId : EAC_SEM_GRUPO; };
    const lista = [...grupos, {id:EAC_SEM_GRUPO, nome:'Sem grupo', cor:null}];
    return lista.map(g=>({...g, cats:[...ids].filter(id=>grupoDe(id)===g.id).map(id=>({id, nome:nome(id)})).sort((a,b)=>a.nome.localeCompare(b.nome,'pt'))})).filter(g=>g.cats.length);
  },

  _eacLBSalvarHtml(ano){
    if(!this.eacPodeAlterar()) return '<p class="eac-note" style="padding:16px 0">Somente o administrador salva linhas de base.</p>';
    const sit = this.eacSituacao(ano), lbs = this.eacLBs(ano), vig = lbs[lbs.length-1], prox = lbs.length, esc = v=>this._escHtml(v);
    if(sit==='encerrado') return `<p class="eac-note" style="padding:16px 0">${ano} está encerrado. Linhas de base só podem ser salvas para o ano vigente.</p>`;
    if(sit==='futuro' && prox>0) return `<p class="eac-note" style="padding:16px 0">A Rev 0 de ${ano} já existe. As revisões seguintes ficam liberadas quando ${ano} começar.</p>`;
    if(sit==='futuro' && !this.eacPodePrepararLB(ano)) return `<p class="eac-note" style="padding:16px 0">A Rev 0 de ${ano} é salva em dezembro de ${ano-1}.</p>`;
    if(prox===0) EAC_LB.escopo = 'geral';
    const hoje = this._eacCadastradoHoje(ano);
    const grupos = this._eacCatsAgrupadas([...hoje.keys(), ...Object.keys(vig?.porCat||{})]);
    const porCat = vig?.porCat||{}, porCatat = id => porCat[id] ? eacSoma(porCat[id].mesesCent||[]) : 0;
    const parcial = EAC_LB.escopo==='cat';
    const linha = c => {
      const a = porCatat(c.id), h = hoje.get(c.id)?.cent||0, d = h-a, marcado = EAC_LB.sel.has(c.id), ativo = !parcial || marcado;
      return `<label class="eac-li" style="padding-left:${parcial?34:14}px">${parcial?`<input type="checkbox" ${marcado?'checked':''} onchange="APP.eacLBMarcar('${c.id}',this.checked)">`:''}
        <span class="eac-grow"><span class="t">${esc(c.nome)}</span><span class="s money" style="display:block">${vig?`LB ${eacFmt(a)} → hoje ${eacFmt(h)}`:`hoje ${eacFmt(h)}`} · ${hoje.get(c.id)?.qtd||0} contas</span></span>
        ${vig?`<span class="money" style="font-size:12px;font-weight:700;min-width:90px;text-align:right;color:${d>0?'var(--red)':d<0?'var(--green)':'var(--t4)'}">${d?eacFmtSig(d):'igual'}</span>`:''}
        <input type="text" inputmode="numeric" class="eac-verba money-input" data-eac-verba="${c.id}" aria-label="Verba mensal de ${esc(c.nome)}" placeholder="verba/mês" value="${EAC_LB.verbas[c.id]?maskMoney(String(EAC_LB.verbas[c.id])):''}" ${ativo?'':'disabled'} oninput="APP.eacLBVerba(this)"></label>`;
    };
    const lista = `<div class="eac-list eac-pick">${grupos.map(g=>{
      const todos = g.cats.every(c=>EAC_LB.sel.has(c.id));
      return `<div class="eac-li g">${parcial?`<input type="checkbox" ${todos?'checked':''} aria-label="Marcar ${esc(g.nome)}" onchange="APP.eacLBMarcarGrupo('${g.id}',this.checked)">`:''}<i class="eac-dot" style="background:${eacCor(g.cor)}"></i><span class="eac-grow">${esc(g.nome)}</span><span class="s">verba mensal</span></div>${g.cats.map(linha).join('')}`;
    }).join('')}</div>`;
    return `<div class="eac-sec"><h4>Escopo da Rev ${prox}</h4><div class="eac-radio" role="radiogroup" aria-label="Escopo">
        <button type="button" class="eac-rc" role="radio" aria-checked="${!parcial}" onclick="APP.eacLBEscopo('geral')"><span class="o"></span><span><b>Geral</b><span>Fotografa todas as categorias com as contas cadastradas hoje para ${ano}.</span></span></button>
        <button type="button" class="eac-rc" role="radio" aria-checked="${parcial}" ${prox===0?'disabled title="A Rev 0 é sempre geral"':''} onclick="APP.eacLBEscopo('cat')"><span class="o"></span><span><b>Por categoria</b><span>${prox===0?'Disponível a partir da Rev 1.':`Atualiza só as escolhidas; as demais mantêm o valor da Rev ${prox-1}.`}</span></span></button></div></div>
      <div class="eac-sec"><h4>Categorias <span class="eac-note" style="text-transform:none;letter-spacing:0;font-weight:500">Verba: valor mensal para gastos variáveis (mercado, restaurante, cartão) que ainda não estão cadastrados</span></h4>${lista}</div>
      <div class="eac-summary" id="eacLBResumo">${this._eacLBResumo(ano)}</div>
      <div class="fg eac-fg"><label for="eacLBJust">Justificativa ${prox>0?'(obrigatória)':'(opcional na Rev 0)'}</label><textarea id="eacLBJust" rows="2" maxlength="500" placeholder="Ex.: reajuste do aluguel previsto em contrato" oninput="EAC_LB.just=this.value">${esc(EAC_LB.just)}</textarea></div>
      <p class="eac-note">Ao salvar, a revisão fica imutável (não edita, não apaga) e passa a ser a vigente. Ela guarda autor, data, escopo, valores por categoria e mês e a lista das contas que formaram o plano.</p>
      <div style="display:flex;justify-content:flex-end"><button type="button" class="btn btn-primary" id="eacLBBtnSalvar" onclick="APP.eacLBSalvar()" ${EAC_LB.salvando?'disabled':''}>${EAC_LB.salvando?'Salvando…':'Salvar Rev '+prox}</button></div>`;
  },

  /** Monta a revisão que seria salva agora (usada no resumo e na gravação). */
  _eacLBMontar(ano){
    const lbs = this.eacLBs(ano), vig = lbs[lbs.length-1]||null, parcial = EAC_LB.escopo==='cat' && !!vig;
    const foto = c => ({id:c.id, conta:c.conta||'', catId:this._eacCatId(c), resp:c.resp, mes:eacMesDe(c.data), vCent:centavos(c.vPagar)});
    const contas = CACHE.contas.filter(c=>eacAnoDe(c.data)===ano);
    let itens;
    if(parcial){
      const ant = EAC_ST.itens.get(vig.id);
      if(!ant) return null;   // itens da vigente ainda carregando
      itens = ant.filter(i=>!EAC_LB.sel.has(i.catId)).concat(contas.filter(c=>EAC_LB.sel.has(this._eacCatId(c))).map(foto));
    } else itens = contas.map(foto);
    const porCat = {};
    itens.forEach(i=>{ const p = porCat[i.catId] ||= {mesesCent:Array(12).fill(0), verbaMesCent:0, qtd:0, totalCent:0}; p.mesesCent[i.mes] += i.vCent; p.qtd++; });
    const verbaDe = id => parcial && !EAC_LB.sel.has(id) ? (vig.porCat?.[id]?.verbaMesCent||0) : (EAC_LB.verbas[id]||0);
    const catsVerba = new Set([...Object.keys(EAC_LB.verbas), ...(parcial?Object.keys(vig.porCat||{}):[])]);
    catsVerba.forEach(id=>{ const v = verbaDe(id); if(v>0){ (porCat[id] ||= {mesesCent:Array(12).fill(0), verbaMesCent:0, qtd:0, totalCent:0}).verbaMesCent = v; } });
    Object.values(porCat).forEach(p=>p.totalCent = eacSoma(p.mesesCent)+p.verbaMesCent*12);
    return {itens, porCat, totalCent:eacSoma(Object.values(porCat).map(p=>p.totalCent)), vig, parcial};
  },

  _eacLBResumo(ano){
    const m = this._eacLBMontar(ano);
    if(!m) return '<span>Carregando a linha de base vigente…</span>';
    const antes = m.vig?.totalCent||0, d = m.totalCent-antes;
    const afet = m.parcial ? EAC_LB.sel.size : Object.keys(m.porCat).length;
    return `<span>Total da LB</span><b class="money">${eacFmt(antes)}</b><span>→</span><b class="money">${eacFmt(m.totalCent)}</b>
      <span class="eac-pill ${d>0?'bad':d<0?'ok':'neu'}">${d?eacFmtSig(d):'sem mudança'}</span><span>${afet} categoria${afet===1?'':'s'} · ${m.itens.length} contas</span>`;
  },
  _eacLBAtualizarResumo(){ this._eacSet('eacLBResumo', this._eacLBResumo(EAC_ST.ano)); },

  eacLBEscopo(e){ EAC_LB.just = document.getElementById('eacLBJust')?.value ?? EAC_LB.just; EAC_LB.escopo = e; this.eacLBRender(); },
  eacLBMarcar(id, on){
    on ? EAC_LB.sel.add(id) : EAC_LB.sel.delete(id);
    const inp = document.querySelector(`[data-eac-verba="${CSS.escape(id)}"]`);
    if(inp) inp.disabled = !on;
    this._eacLBAtualizarResumo();
  },
  eacLBMarcarGrupo(gid, on){
    EAC_LB.just = document.getElementById('eacLBJust')?.value ?? EAC_LB.just;
    this._eacCatsAgrupadas().find(g=>g.id===gid)?.cats.forEach(c=>on ? EAC_LB.sel.add(c.id) : EAC_LB.sel.delete(c.id));
    this.eacLBRender();
  },
  eacLBVerba(el){
    // Centavos inteiros pela mesma regra da máscara (ui-money.js)
    const v = moneyCents(el.value);
    if(v>0) EAC_LB.verbas[el.dataset.eacVerba] = v; else delete EAC_LB.verbas[el.dataset.eacVerba];
    this._eacLBAtualizarResumo();
  },

  async eacLBSalvar(){
    if(EAC_LB.salvando || !this._eacExigirAdmin()) return;
    const ano = EAC_ST.ano, sit = this.eacSituacao(ano), lbs = this.eacLBs(ano), rev = lbs.length;
    const just = (document.getElementById('eacLBJust')?.value||'').trim();
    if(sit==='encerrado') return this.toast('Ano encerrado: não é possível salvar linha de base','error');
    if(sit==='futuro' && (rev>0 || !this.eacPodePrepararLB(ano))) return this.toast('Para o próximo ano, só a Rev 0 e só em dezembro','error');
    if(EAC_LB.escopo==='cat' && !EAC_LB.sel.size) return this.toast('Marque ao menos uma categoria','error');
    if(rev>0 && !just){ document.getElementById('eacLBJust')?.focus(); return this.toast('Escreva a justificativa: ela é obrigatória a partir da Rev 1','error'); }
    const m = this._eacLBMontar(ano);
    if(!m) return this.toast('A linha de base vigente ainda está carregando. Tente de novo em instantes.','error');
    if(!m.itens.length && !m.totalCent) return this.toast(`Não há contas nem verba em ${ano} para salvar`,'error');
    const agora = new Date();
    const noPrazo = (agora.getFullYear()===ano && agora.getMonth()===0) || (agora.getFullYear()===ano-1 && agora.getMonth()===11);
    const cab = {
      ano, rev, escopo:m.parcial?'categorias':'geral', catIds:m.parcial?[...EAC_LB.sel]:[], justificativa:just,
      criadaPor:STATE.usuario, criadaEmIso:agora.toISOString(), foraDoPrazo:rev===0 && !noPrazo,
      base:m.vig?.id||null, totalCent:m.totalCent, porCat:m.porCat, qtdContas:m.itens.length,
    };
    EAC_LB.salvando = true; EAC_LB.just = just; this.eacLBRender();
    try{
      const id = await FS.salvarLB(cab, m.itens);
      EAC_ST.itens.set(id, m.itens);
      EAC_LB.just = ''; EAC_LB.aba = 'hist';
      this.toast(`Rev ${rev} de ${ano} salva ✅`,'success');
    }catch(err){
      console.error('[EAC] salvar LB', err);
      this.toast('Não foi possível salvar: '+(err.message||err),'error');
    }finally{
      EAC_LB.salvando = false;
      this.eacLBRender();
    }
  },

  _eacLBComp(ano){
    const lbs = this.eacLBs(ano);
    if(lbs.length<2) return '<p class="eac-note" style="padding:16px 0">É preciso ter ao menos duas revisões no ano para comparar.</p>';
    const A = lbs.find(l=>l.rev===EAC_LB.a)||lbs[0], B = lbs.find(l=>l.rev===EAC_LB.b)||lbs[lbs.length-1];
    const opt = v => lbs.map(l=>`<option value="${l.rev}" ${l.rev===v?'selected':''}>Rev ${l.rev}${l.criadaEmIso?' · '+new Date(l.criadaEmIso).toLocaleDateString('pt-BR'):''}</option>`).join('');
    const ids = new Set([...Object.keys(A.porCat||{}), ...Object.keys(B.porCat||{})]);
    const tot = (l,id) => l.porCat?.[id]?.totalCent||0;
    const dif = [...ids].map(id=>({id, a:tot(A,id), b:tot(B,id)})).filter(x=>x.a!==x.b).sort((x,y)=>Math.abs(y.b-y.a)-Math.abs(x.b-x.a));
    const d = (B.totalCent||0)-(A.totalCent||0);
    return `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><select class="filter-select" aria-label="Revisão de origem" onchange="EAC_LB.a=+this.value;APP.eacLBRender()">${opt(A.rev)}</select><span>→</span><select class="filter-select" aria-label="Revisão de destino" onchange="EAC_LB.b=+this.value;APP.eacLBRender()">${opt(B.rev)}</select></div>
      ${dif.length?`<div class="eac-list">${dif.map(x=>`<div class="eac-li"><div class="eac-grow"><div class="t">${this._escHtml(x.id.startsWith('?')?x.id.slice(1):CACHE.getCatNome(x.id))}</div><div class="s money">${eacFmt(x.a)} → ${eacFmt(x.b)}</div></div><span class="v money ${x.b>x.a?'up':'dn'}">${eacFmtSig(x.b-x.a)}</span></div>`).join('')}</div>`:'<p class="eac-note">As duas revisões têm os mesmos valores.</p>'}
      <div class="eac-summary"><span>Total</span><b class="money">${eacFmt(A.totalCent||0)}</b><span>→</span><b class="money">${eacFmt(B.totalCent||0)}</b><span class="eac-pill ${d>0?'bad':d<0?'ok':'neu'}">${d?eacFmtSig(d):'sem mudança'}</span></div>
      <p class="eac-note">O que entra por revisão deixa de aparecer como desvio contra a LB vigente. Para ver o desvio total desde janeiro, use "Comparar com LB original (Rev 0)" na tela.</p>`;
  },
});

Object.assign(APP, {

  // ══════════════════════════════════════════════════════════════════════
  // CONTAS DA LB QUE FORAM EXCLUÍDAS
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Contas da LB vigente do ano que não existem mais (excluídas), com a classificação.
   * Independe do filtro de responsável. Vazio enquanto os itens da LB carregam.
   * @returns {{id, conta, catId, resp, vCent, cls:'cancelada'|'indevida'|null}[]}
   */
  eacExcluidas(ano){
    const lb = this.eacLBVigente(ano), itens = lb && EAC_ST.itens.get(lb.id);
    if(!itens) return [];
    const existe = new Set(CACHE.contas.map(c=>c.id));
    const excl = new Map(CACHE.eacExcl.map(e=>[e.contaId||e.id, e]));
    return itens.filter(i=>!existe.has(i.id)).map(i=>({...i, cls:excl.get(i.id)?.classificacao||null}));
  },

  async eacAbrirExcluidas(){
    eacLixeira = null;
    this.eacExclRender();
    this._eacAbrirOv('ovEacExcl');
    try{ eacLixeira = await FS.lerLixeira(); }catch(e){ console.warn('[EAC] lixeira:', e.message); eacLixeira = []; }
    if(document.getElementById('ovEacExcl')?.classList.contains('open')) this.eacExclRender();
  },

  eacExclRender(){
    const ano = EAC_ST.ano, esc = v=>this._escHtml(v), lista = this.eacExcluidas(ano);
    const fechado = this.eacSituacao(ano)==='encerrado', adm = this.eacPodeAlterar(), bloqueado = fechado || !adm;
    const lb = this.eacLBVigente(ano);
    const lix = new Map((eacLixeira||[]).map(l=>[l.origemId, l]));
    const quando = l => l ? ` · excluída${l.excluidoEm?' em '+new Date(l.excluidoEm).toLocaleDateString('pt-BR'):''}${l.excluidoPor?' por '+esc(l.excluidoPor):''}` : (eacLixeira ? ' · apagada da lixeira' : '');
    this._eacSet('eacExclSub', `<span>${ano}${lb?' · LB Rev '+lb.rev:''}</span><span class="eac-pill neu">Valores da casa, sem filtro de responsável</span>${adm?'':'<span class="eac-pill warn">Somente leitura</span>'}`);
    if(!lb){ this._eacSet('eacExclBody', `<p class="eac-note">${ano} não tem linha de base: não há contas planejadas para acompanhar.</p>`); return; }
    if(!EAC_ST.itens.has(lb.id)){ this._eacSet('eacExclBody', '<p class="eac-note">Carregando a linha de base…</p>'); return; }
    const indev = eacSoma(lista.filter(e=>e.cls==='indevida').map(e=>e.vCent)), eco = eacSoma(lista.filter(e=>e.cls!=='indevida').map(e=>e.vCent));
    const linha = e => `<div class="eac-li${e.cls==='indevida'?' ign':''}"><div class="eac-grow"><div class="t">${esc(e.conta||'(sem descrição)')}</div><div class="s">${esc(e.catId.startsWith('?')?e.catId.slice(1):CACHE.getCatNome(e.catId))} · ${esc(e.resp||'')} · vencia em ${MESES_F[e.mes]}${quando(lix.get(e.id))}</div></div>
      <span class="v money">${eacFmt(e.vCent)}</span>
      <div class="eac-cls" role="group" aria-label="Classificação de ${esc(e.conta)}">
        <button type="button" class="c" aria-pressed="${e.cls==='cancelada'}" ${bloqueado?'disabled':''} onclick="APP.eacClassificar('${e.id}','cancelada')">Cancelada</button>
        <button type="button" class="i" aria-pressed="${e.cls==='indevida'}" ${bloqueado?'disabled':''} onclick="APP.eacClassificar('${e.id}','indevida')">Indevida</button></div>
      ${e.cls?'':'<span class="eac-pill warn">a classificar</span>'}</div>`;
    const naLB = new Set(EAC_ST.itens.get(lb.id).map(i=>i.id));
    const fora = (eacLixeira||[]).filter(l=>eacAnoDe(l.data)===ano && !naLB.has(l.origemId)).slice(0,30);
    this._eacSet('eacExclBody', `
      <div class="eac-radio"><div class="eac-rc" style="cursor:default"><i class="eac-dot" style="background:var(--green);margin-top:5px"></i><span><b>Cancelada</b><span>A despesa deixou de existir (ex.: cancelou a assinatura). Continua no Planejado e vira economia na ponte do desvio.</span></span></div>
        <div class="eac-rc" style="cursor:default"><i class="eac-dot" style="background:var(--t4);margin-top:5px"></i><span><b>Indevida</b><span>Cadastro errado ou duplicado. Sai do Planejado e das listas da EAC; o desvio não registra economia falsa.</span></span></div></div>
      <div class="eac-summary"><span>Economia por exclusão</span><b class="money" style="color:var(--green)">${eacFmtSig(-eco)}</b><span>Ignorado (indevidas)</span><b class="money">${eacFmt(indev)}</b></div>
      <div class="eac-sec"><h4>Estavam na linha de base <span class="eac-pill neu">${lista.length}</span></h4>${lista.length?`<div class="eac-list">${lista.map(linha).join('')}</div>`:'<p class="eac-note">Nenhuma conta da linha de base foi excluída.</p>'}</div>
      ${eacLixeira===null?'<p class="eac-note">Lendo a lixeira…</p>':fora.length?`<div class="eac-sec"><h4>Excluídas que não estavam na LB <span class="eac-pill neu">sem efeito no cálculo</span></h4><div class="eac-list">${fora.map(l=>`<div class="eac-li"><div class="eac-grow"><div class="t">${esc(l.conta||'')}</div><div class="s">${esc(CACHE.resolveCat(l.catId||l.cat))}${quando(l)}</div></div><span class="v money" style="color:var(--t4)">${fmt(l.vPagar)}</span></div>`).join('')}</div></div>`:''}
      <p class="eac-note">A classificação fica separada da lixeira: apagar a conta de vez da lixeira não muda a LB nem a classificação. Se a conta for restaurada, ela volta para o Comprometido e a classificação deixa de valer.${fechado?' Ano encerrado: somente leitura.':!adm?' Somente o administrador classifica as exclusões.':''}</p>`);
  },

  async eacClassificar(id, cls){
    if(!this._eacExigirAdmin()) return;
    const e = this.eacExcluidas(EAC_ST.ano).find(x=>x.id===id);
    if(!e || e.cls===cls) return;
    try{
      await FS.classificarExclusoes([{contaId:e.id, ano:EAC_ST.ano, conta:e.conta||'', catId:e.catId, resp:e.resp||'', vCent:e.vCent}], cls);
      this.toast(`"${e.conta}" marcada como ${cls==='indevida'?'indevida (fora da EAC)':'cancelada (economia)'}`,'success');
    }catch(err){ this.toast('Não foi possível classificar: '+(err.message||err),'error'); }
  },

  /**
   * Confirma a exclusão de contas em Contas. Se alguma conta é de um ano com LB, pergunta se é
   * cancelamento (economia) ou cadastro indevido; senão usa o confirm de sempre.
   * @returns {Promise<{classificacao:string|null, motivo?:string}|null>} null = desistiu
   */
  confirmarExclusaoConta(contas, pergunta){
    // Classificar é decisão do administrador: para os demais, confirm de sempre e a conta fica
    // "a classificar" na EAC até o administrador decidir.
    const comLB = this.eacPodeAlterar() && contas.some(c=>CACHE.lbs.some(l=>l.ano===eacAnoDe(c.data)));
    const ov = document.getElementById('ovExcluirConta');
    if(!comLB || !ov) return Promise.resolve(confirm(pergunta) ? {classificacao:null} : null);
    return new Promise(resolve=>{
      let escolha = null;
      const fim = r => { ov._aoFecharNoFundo = null; this.closeModal('ovExcluirConta'); resolve(r); };
      document.getElementById('eacExcPergunta').textContent = pergunta;
      const btnOk = document.getElementById('eacExcOk');
      btnOk.disabled = true;
      ov.querySelectorAll('[data-eac-exc]').forEach(b=>{
        b.setAttribute('aria-checked','false');
        b.onclick = ()=>{ escolha = b.dataset.eacExc; ov.querySelectorAll('[data-eac-exc]').forEach(x=>x.setAttribute('aria-checked', String(x===b))); btnOk.disabled = false; };
      });
      btnOk.onclick = ()=>escolha && fim({classificacao:escolha, motivo:escolha==='indevida'?'cadastro indevido (EAC)':'despesa cancelada (EAC)'});
      ov.querySelectorAll('[data-eac-exc-cancelar]').forEach(b=>b.onclick = ()=>fim(null));
      ov._aoFecharNoFundo = ()=>fim(null);
      ov.classList.add('open');
    });
  },

  /** Grava a classificação das contas excluídas que são de anos com LB (falha só avisa). */
  async eacRegistrarExclusao(contas, cls){
    if(!cls || !this.eacPodeAlterar()) return;
    const regs = contas.filter(c=>CACHE.lbs.some(l=>l.ano===eacAnoDe(c.data)))
      .map(c=>({contaId:c.id, ano:eacAnoDe(c.data), conta:c.conta||'', catId:this._eacCatId(c), resp:c.resp||'', vCent:centavos(c.vPagar)}));
    try{ await FS.classificarExclusoes(regs, cls); }
    catch(e){ console.warn('[EAC] classificar exclusão:', e); this.toast('Conta excluída, mas a classificação da EAC falhou: classifique na tela EAC','error'); }
  },
});

Object.assign(APP, {

  // ══════════════════════════════════════════════════════════════════════
  // GRUPOS DE CATEGORIAS
  // ══════════════════════════════════════════════════════════════════════

  _eacGrupos(){ return [...CACHE.grupos].sort((a,b)=>(a.ordem??0)-(b.ordem??0)||a.nome.localeCompare(b.nome,'pt')); },
  _eacSemGrupo(){ const ids = new Set(CACHE.grupos.map(g=>g.id)); return CACHE.getAllCats().filter(c=>!c.grupoId || !ids.has(c.grupoId)); },
  _eacGrupoDaCat(id){ const c = CACHE.cats.find(x=>x.id===id); return c?.grupoId && CACHE.grupos.some(g=>g.id===c.grupoId) ? c.grupoId : EAC_SEM_GRUPO; },

  _eacNomeGrupoValido(nome, ignorarId){
    const n = nome.trim();
    if(!n) return 'Digite o nome do grupo.';
    if(n.length>40) return 'Use até 40 caracteres.';
    if(n.toLowerCase()==='sem grupo') return '"Sem grupo" é reservado pelo sistema.';
    if(CACHE.grupos.some(g=>g.id!==ignorarId && g.nome.trim().toLowerCase()===n.toLowerCase())) return `Já existe um grupo chamado "${n}".`;
    return '';
  },

  /** Sugestão inicial: só categorias existentes (comparação sem acento e sem maiúsculas). */
  _eacSugestao(){
    const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
    const usadas = new Set();
    return EAC_GRUPOS_SUGERIDOS.map(([nome, cats],i)=>({
      nome, ordem:i, cor:EAC_CORES[i%EAC_CORES.length],
      catIds: cats.map(n=>CACHE.cats.find(c=>norm(c.nome)===norm(n))).filter(c=>c && !usadas.has(c.id) && usadas.add(c.id)).map(c=>c.id),
    })).filter(g=>g.catIds.length);
  },

  eacAbrirGrupos(){
    Object.assign(EAC_GRP, {edit:null, del:null, erro:'', novo:'', novoNome:null, ocupado:false});
    EAC_GRP.sel = new Set();
    this.eacGruposRender();
    this._eacAbrirOv('ovEacGrupos');
    this._eacLigarArrastar();
  },

  eacGruposRender(focoSel){
    const esc = v=>this._escHtml(v), grupos = this._eacGrupos(), sem = this._eacSemGrupo(), oc = EAC_GRP.ocupado ? 'disabled' : '', adm = this.eacPodeAlterar();
    const body = document.getElementById('eacGrpBody');
    const rolagem = body?.scrollTop || 0;
    // A seleção só guarda categorias que ainda existem
    EAC_GRP.sel.forEach(id=>{ if(!CACHE.cats.some(c=>c.id===id)) EAC_GRP.sel.delete(id); });
    const chip = c => !adm ? `<span class="eac-gchip eac-gchip-ro">${esc(c.nome)}</span>` : `<button type="button" class="eac-gchip" draggable="true" data-eac-gcat="${c.id}" aria-pressed="${EAC_GRP.sel.has(c.id)}" ${oc} onclick="APP.eacGrpSelecionar('${c.id}')" title="Clique para selecionar; arraste para outro grupo">${esc(c.nome)}</button>`;
    const catsDe = g => CACHE.getAllCats().filter(c=>c.grupoId===g.id);
    const card = (g,i) => {
      const cs = catsDe(g), ed = EAC_GRP.edit===g.id, del = EAC_GRP.del===g.id;
      return `<div class="eac-gcard" data-eac-gdrop="${g.id}" style="--gc:${eacCor(g.cor)}">
        <div class="eac-gc-h">
          ${adm?`<div class="eac-gord"><button type="button" class="eac-ibtn" ${i===0?'disabled':oc} aria-label="Subir ${esc(g.nome)}" onclick="APP.eacGrpMover('${g.id}',-1)">${eacIco(EAC_IC.up)}</button><button type="button" class="eac-ibtn" ${i===grupos.length-1?'disabled':oc} aria-label="Descer ${esc(g.nome)}" onclick="APP.eacGrpMover('${g.id}',1)">${eacIco(EAC_IC.down)}</button></div>`:''}
          <span class="eac-gcode">1.${i+1}</span>
          ${ed ? `<input id="eacGrpRen" value="${esc(EAC_GRP.novoNome??g.nome)}" maxlength="40" aria-label="Novo nome de ${esc(g.nome)}" onkeydown="if(event.key==='Enter'){event.preventDefault();APP.eacGrpRenomearSalvar('${g.id}')}if(event.key==='Escape'){event.preventDefault();APP.eacGrpCancelar()}"><button type="button" class="btn btn-primary btn-sm" ${oc} onclick="APP.eacGrpRenomearSalvar('${g.id}')">Salvar</button><button type="button" class="btn btn-ghost btn-sm" onclick="APP.eacGrpCancelar()">Cancelar</button>`
               : `<span class="eac-gname">${esc(g.nome)}</span><span class="eac-pill neu">${cs.length} cat.</span>${adm?`<button type="button" class="eac-ibtn" ${oc} aria-label="Renomear ${esc(g.nome)}" title="Renomear" onclick="APP.eacGrpRenomear('${g.id}')">${eacIco(EAC_IC.pen)}</button><button type="button" class="eac-ibtn del" ${oc} aria-label="Excluir ${esc(g.nome)}" title="Excluir grupo" onclick="APP.eacGrpExcluir('${g.id}')">${eacIco(EAC_IC.lixo)}</button>`:''}`}
        </div>
        ${ed && EAC_GRP.erro ? `<p class="eac-gerr" role="alert" style="margin:0 12px 8px 14px">${esc(EAC_GRP.erro)}</p>` : ''}
        ${del ? `<div class="eac-gconf" role="alert"><span class="eac-grow">${cs.length?`As ${cs.length} categorias de ${esc(g.nome)} vão para "Sem grupo". Nenhum valor muda.`:`Excluir o grupo ${esc(g.nome)}?`}</span><button type="button" class="btn btn-ghost btn-sm" onclick="APP.eacGrpCancelar()">Cancelar</button><button type="button" class="btn btn-danger btn-sm" id="eacGrpDelOk" ${oc} onclick="APP.eacGrpExcluirOk('${g.id}')">Excluir grupo</button></div>` : ''}
        <div class="eac-gc-b">${cs.length ? cs.map(chip).join('') : '<span class="eac-gempty">Grupo vazio. Arraste categorias para cá ou use "Mover para".</span>'}</div></div>`;
    };
    const k = EAC_GRP.sel.size;
    const opts = [...grupos.map(g=>[g.id,g.nome]), [EAC_SEM_GRUPO,'Sem grupo']].map(([id,n])=>`<option value="${id}">${esc(n)}</option>`).join('');
    const barra = !adm ? '' : k
      ? `<div class="eac-gmove" role="region" aria-label="Mover categorias selecionadas"><span>${k} selecionada${k>1?'s':''}</span><label for="eacGrpDest">Mover para</label><select class="filter-select" id="eacGrpDest">${opts}</select><button type="button" class="btn btn-primary btn-sm" ${oc} onclick="APP.eacGrpMoverSel()">Mover</button><button type="button" class="btn btn-ghost btn-sm" onclick="APP.eacGrpLimparSel()">Limpar seleção</button></div>`
      : '<p class="eac-ghint">Clique nas categorias para selecionar várias e mover de uma vez, ou arraste uma categoria para outro grupo.</p>';
    const sug = adm && !grupos.length ? this._eacSugestao() : [];
    const sugHtml = sug.length ? `<div class="eac-sec"><h4>Sugestão inicial <button type="button" class="btn btn-primary btn-sm" ${oc} onclick="APP.eacGrpAplicarSugestao()">Aplicar sugestão</button></h4><div class="eac-list">${sug.map(g=>`<div class="eac-li"><i class="eac-dot" style="background:${eacCor(g.cor)}"></i><div class="eac-grow"><div class="t">${esc(g.nome)}</div><div class="s">${g.catIds.map(id=>esc(CACHE.getCatNome(id))).join(', ')}</div></div></div>`).join('')}</div><p class="eac-note" style="margin-top:6px">Depois de aplicar, dá para renomear, mover categorias e criar outros grupos.</p></div>` : '';
    this._eacSet('eacGrpSub', `<span>Estrutura 1.x da tabela EAC</span><span class="eac-pill neu">${grupos.length} grupo${grupos.length===1?'':'s'} · ${CACHE.cats.length} categorias</span>${adm?'':'<span class="eac-pill warn">Somente leitura</span>'}`);
    this._eacSet('eacGrpBody', `
      ${sugHtml}
      ${adm?'':`<p class="eac-ghint">Somente leitura: só o administrador cria, renomeia, ordena e exclui grupos e move categorias.${grupos.length?'':' Ainda não há grupos.'}</p>`}
      <div class="eac-sec" ${adm?'':'hidden'}><h4>Novo grupo</h4><div class="eac-gnew"><input id="eacGrpNovo" maxlength="40" placeholder="Ex.: Viagens" value="${esc(EAC_GRP.novo)}" aria-label="Nome do novo grupo" ${EAC_GRP.erro&&!EAC_GRP.edit?'aria-invalid="true" aria-describedby="eacGrpErr"':''} oninput="EAC_GRP.novo=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();APP.eacGrpAdicionar()}"><button type="button" class="btn btn-primary" ${oc} onclick="APP.eacGrpAdicionar()">Adicionar grupo</button></div>${EAC_GRP.erro&&!EAC_GRP.edit?`<p class="eac-gerr" id="eacGrpErr" role="alert">${esc(EAC_GRP.erro)}</p>`:''}</div>
      ${barra}
      <div class="eac-gcards">${grupos.map(card).join('')}
        <div class="eac-gcard sem" data-eac-gdrop="${EAC_SEM_GRUPO}" style="--gc:var(--t4)"><div class="eac-gc-h"><span class="eac-gname">Sem grupo</span><span class="eac-pill neu">${sem.length} cat.</span></div>
          <p class="eac-note" style="padding:0 14px 8px">Categorias novas cadastradas em Contas entram aqui até receberem um grupo. Se tiverem valor no ano, aparecem no fim da tabela num grupo "Sem grupo" e a tela avisa.</p>
          <div class="eac-gc-b">${sem.length ? sem.map(chip).join('') : '<span class="eac-gempty">Todas as categorias têm grupo.</span>'}</div></div>
      </div>
      <p class="eac-note">A ordem dos grupos (setas) define a numeração 1.1, 1.2... da tabela; dentro do grupo, as categorias ficam em ordem alfabética. Mudar grupos não altera valores: a linha de base guarda categorias, então o novo agrupamento vale também para os anos anteriores.</p>`);
    const b2 = document.getElementById('eacGrpBody'); if(b2) b2.scrollTop = rolagem;
    if(focoSel) document.querySelector(focoSel)?.focus();
    if(EAC_GRP.edit){ const r = document.getElementById('eacGrpRen'); r?.focus(); r?.select(); }
  },

  /** Executa uma gravação de grupos com o modal travado; o listener redesenha ao concluir. */
  async _eacGrpExec(fn, ok, focoSel){
    if(!this._eacExigirAdmin()) return;
    EAC_GRP.ocupado = true; this.eacGruposRender();
    try{ await fn(); if(ok) this.toast(ok,'success'); }
    catch(err){ console.error('[EAC] grupos', err); this.toast('Não foi possível salvar: '+(err.message||err),'error'); }
    finally{ EAC_GRP.ocupado = false; this.eacGruposRender(focoSel); }
  },

  eacGrpAdicionar(){
    if(!this._eacExigirAdmin()) return;
    const nome = document.getElementById('eacGrpNovo')?.value || '';
    EAC_GRP.novo = nome; EAC_GRP.edit = null;
    EAC_GRP.erro = this._eacNomeGrupoValido(nome);
    if(EAC_GRP.erro) return this.eacGruposRender('#eacGrpNovo');
    const grupos = this._eacGrupos();
    const ordem = grupos.length ? Math.max(...grupos.map(g=>g.ordem??0))+1 : 0;
    const usadas = new Set(grupos.map(g=>g.cor));
    const cor = EAC_CORES.find(c=>!usadas.has(c)) || EAC_CORES[grupos.length % EAC_CORES.length];
    EAC_GRP.novo = '';
    this._eacGrpExec(()=>FS.addGrupo(nome.trim(), ordem, cor), `Grupo "${nome.trim()}" criado`, '#eacGrpNovo');
  },

  eacGrpRenomear(id){ if(!this._eacExigirAdmin()) return; Object.assign(EAC_GRP, {edit:id, del:null, erro:'', novoNome:null}); this.eacGruposRender(); },
  eacGrpCancelar(){ Object.assign(EAC_GRP, {edit:null, del:null, erro:'', novoNome:null}); this.eacGruposRender(); },
  eacGrpRenomearSalvar(id){
    const g = CACHE.grupos.find(x=>x.id===id), v = document.getElementById('eacGrpRen')?.value || '';
    if(!g) return;
    const err = this._eacNomeGrupoValido(v, id);
    if(err){ EAC_GRP.erro = err; EAC_GRP.novoNome = v; return this.eacGruposRender(); }
    Object.assign(EAC_GRP, {edit:null, erro:'', novoNome:null});
    if(v.trim()===g.nome) return this.eacGruposRender();
    this._eacGrpExec(()=>FS.renomearGrupo(id, g.nome, v.trim()), `"${g.nome}" renomeado para "${v.trim()}"`);
  },

  eacGrpMover(id, delta){
    if(!this._eacExigirAdmin()) return;
    const ids = this._eacGrupos().map(g=>g.id), i = ids.indexOf(id), j = i+delta;
    if(i<0 || j<0 || j>=ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    this._eacGrpExec(()=>FS.ordenarGrupos(ids), '', `[aria-label^="${delta<0?'Subir':'Descer'}"]`);
  },

  eacGrpExcluir(id){ if(!this._eacExigirAdmin()) return; Object.assign(EAC_GRP, {del:id, edit:null, erro:''}); this.eacGruposRender('#eacGrpDelOk'); },
  eacGrpExcluirOk(id){
    const g = CACHE.grupos.find(x=>x.id===id);
    if(!g) return;
    const cats = CACHE.cats.filter(c=>c.grupoId===id).map(c=>c.id);
    EAC_GRP.del = null;
    EAC_ST.recolhidos.delete(id);
    this._eacGrpExec(()=>FS.excluirGrupo(id, g.nome, cats), `Grupo "${g.nome}" excluído`+(cats.length?`; ${cats.length} categoria(s) em "Sem grupo"`:''));
  },

  eacGrpSelecionar(id){ if(!this._eacExigirAdmin()) return; EAC_GRP.sel.has(id) ? EAC_GRP.sel.delete(id) : EAC_GRP.sel.add(id); this.eacGruposRender(`[data-eac-gcat="${id}"]`); },
  eacGrpLimparSel(){ EAC_GRP.sel.clear(); this.eacGruposRender(); },
  eacGrpMoverSel(){ this._eacMoverCats([...EAC_GRP.sel], document.getElementById('eacGrpDest')?.value); },

  _eacMoverCats(ids, dest){
    if(!dest || !this._eacExigirAdmin()) return;
    const mover = ids.filter(id=>this._eacGrupoDaCat(id)!==dest);
    EAC_GRP.sel.clear();
    if(!mover.length){ this.toast('As categorias já estavam nesse grupo','info'); return this.eacGruposRender(); }
    const nome = dest===EAC_SEM_GRUPO ? 'Sem grupo' : CACHE.grupos.find(g=>g.id===dest)?.nome;
    this._eacGrpExec(()=>FS.moverCategorias(mover, dest===EAC_SEM_GRUPO?null:dest, nome),
      `${mover.length} categoria${mover.length>1?'s':''} movida${mover.length>1?'s':''} para ${nome}`);
  },

  eacGrpAplicarSugestao(){
    const sug = this._eacSugestao();
    if(!sug.length || CACHE.grupos.length) return;
    this._eacGrpExec(()=>FS.criarGruposIniciais(sug), `${sug.length} grupos criados`);
  },

  /** Arrastar e soltar categorias entre grupos (ligado uma vez no corpo do modal). */
  _eacLigarArrastar(){
    const body = document.getElementById('eacGrpBody');
    if(!body || body._eacArrastar) return;
    body._eacArrastar = true;
    const zona = e => e.target.closest?.('[data-eac-gdrop]');
    body.addEventListener('dragstart', e=>{
      const ch = e.target.closest?.('[data-eac-gcat]');
      if(!ch || EAC_GRP.ocupado || !this.eacPodeAlterar()) return;
      const id = ch.dataset.eacGcat, ids = EAC_GRP.sel.has(id) ? [...EAC_GRP.sel] : [id];
      e.dataTransfer.setData('text/plain', ids.join(','));
      e.dataTransfer.effectAllowed = 'move';
    });
    body.addEventListener('dragover', e=>{
      const z = zona(e); if(!z) return;
      e.preventDefault();
      body.querySelectorAll('.eac-gcard.over').forEach(x=>x!==z && x.classList.remove('over'));
      z.classList.add('over');
    });
    body.addEventListener('dragleave', e=>{ const z = zona(e); if(z && !z.contains(e.relatedTarget)) z.classList.remove('over'); });
    body.addEventListener('drop', e=>{
      const z = zona(e); if(!z) return;
      e.preventDefault(); z.classList.remove('over');
      const ids = (e.dataTransfer.getData('text/plain')||'').split(',').filter(Boolean);
      if(ids.length) this._eacMoverCats(ids, z.dataset.eacGdrop);
    });
  },
});
