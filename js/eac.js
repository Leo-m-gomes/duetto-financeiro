/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO eac.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Tela EAC: o que foi planejado no início do ano está se cumprindo?
 *
 *   Planejado    = linha de base (LB) vigente do ano: vPagar de cada conta da foto, por mês
 *                  e categoria, mais a verba mensal de gastos variáveis. Contas da LB que
 *                  foram excluídas e classificadas como "indevidas" saem do Planejado.
 *   Comprometido = Σ vEfetivo das contas com vencimento no ano (pago com juros/desconto ou
 *                  valor atual em aberto), incluindo contas novas.
 *   Realizado    = Σ vPago das contas do ano.
 *   Desvio       = Comprometido − Planejado (> 0 gasto acima do plano; < 0 economia).
 *
 * Tudo em CENTAVOS INTEIROS. A tela só lê; as gravações (LB, exclusões, grupos) ficam nos
 * modais de js/eac-gestao.js e passam por FS.*. Gráficos em SVG (cores por CSS).
 *
 * DEPENDÊNCIAS: fin-state (centavos, vEfetivo, filtrarPorResp, fmt, MESES), fin-cache
 *   (CACHE.contas/cats/grupos/lbs/eacExcl), fin-db (FS.lerItensLB), relatorios (_escHtml).
 * IMPORTAÇÃO: depois de relatorios.js e antes de eac-gestao.js.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

const EAC_FAROL_PCT = 5;          // desvio até 5%: atenção; acima: acima do plano
const EAC_SEM_GRUPO = '__sem';    // grupo virtual das categorias sem grupoId
const EAC_CORES = ['cat-1','cat-2','cat-3','cat-4','cat-5','cat-6','eac-g7','eac-g8'];

// Estado da tela. Como os filtros das outras telas, não é salvo (volta ao padrão ao recarregar).
const EAC_ST = {
  ano:null, mes:null, cmp:'cur', nivel:3, ordem:'eap', recolhidos:new Set(), foco:false,
  itens:new Map(),        // lbId → contas da foto (LB é imutável: cache sem expiração)
  carregando:new Set(), erroItens:new Map(),
  arvore:null,            // último cálculo, usado pelos modais
};

// ── Helpers de data e formatação (centavos) ──
const eacAnoDe = iso => parseInt(String(iso||'').slice(0,4),10);
const eacMesDe = iso => parseInt(String(iso||'').slice(5,7),10)-1;
const eacSoma  = arr => (arr||[]).reduce((s,v)=>s+v,0);
const eacFmt   = cent => fmt(cent/100);
const eacFmtSig= cent => (cent>0?'+':cent<0?'−':'') + fmt(Math.abs(cent)/100);
const eacPct   = (a,b) => b ? a/b*100 : 0;
const eacFmtPct= v => (v>0?'+':v<0?'−':'') + Math.abs(v).toLocaleString('pt-BR',{maximumFractionDigits:1}) + '%';
/** Valor curto para eixos e rótulos de gráfico: 12,3 mil · 940 */
const eacFmtK  = cent => {
  const n = cent/100, a = Math.abs(n);
  const s = a>=1000 ? (a/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil' : a.toLocaleString('pt-BR',{maximumFractionDigits:0});
  return (n<0?'−':'') + s;
};
const eacCor   = cor => `var(--${EAC_CORES.includes(cor)?cor:'t4'})`;

Object.assign(APP, {

  // ══════════════════════════════════════════════════════════════════════
  // DADOS: anos, linhas de base e itens
  // ══════════════════════════════════════════════════════════════════════

  /** Só o administrador (Leo) altera a EAC: salva linha de base, classifica excluídas e mexe nos grupos. */
  eacPodeAlterar(){ return (typeof SEC!=='undefined' && SEC.isAdmin && SEC.isAdmin()) || STATE.usuario==='Leo'; },

  /** Revisões de LB de um ano, da Rev 0 à vigente. */
  eacLBs(ano){ return CACHE.lbs.filter(l=>l.ano===ano).sort((a,b)=>a.rev-b.rev); },
  eacLBVigente(ano){ const l=this.eacLBs(ano); return l[l.length-1]||null; },

  /** Anos do seletor: anos com contas ou LB, o atual e, em dezembro, o seguinte (preparar a Rev 0). */
  eacAnos(){
    const hoje = new Date(), atual = hoje.getFullYear();
    const anos = new Set([atual]);
    CACHE.contas.forEach(c=>{ const y=eacAnoDe(c.data); if(y>=2019&&y<=atual) anos.add(y); });
    CACHE.lbs.forEach(l=>{ if(l.ano<=atual) anos.add(l.ano); });
    if(hoje.getMonth()===11) anos.add(atual+1);
    return [...anos].filter(a=>a>=2019&&a<=2035).sort((a,b)=>b-a);
  },

  /** Situação do ano: 'atual', 'encerrado' (anterior) ou 'futuro' (só o próximo, em dezembro). */
  eacSituacao(ano){ const a=new Date().getFullYear(); return ano===a?'atual':ano<a?'encerrado':'futuro'; },

  /** Contas da foto de uma LB. Lê do Firestore uma vez e guarda; null enquanto carrega. */
  _eacItens(lb){
    if(EAC_ST.itens.has(lb.id)) return EAC_ST.itens.get(lb.id);
    if(EAC_ST.erroItens.has(lb.id)) return null;
    if(!EAC_ST.carregando.has(lb.id)){
      EAC_ST.carregando.add(lb.id);
      FS.lerItensLB(lb.id)
        .then(itens=>EAC_ST.itens.set(lb.id, itens))
        .catch(err=>{ console.error('[EAC] itens da LB '+lb.id, err); EAC_ST.erroItens.set(lb.id, err.message||String(err)); })
        .finally(()=>{ EAC_ST.carregando.delete(lb.id); this.eacAoMudarDados(); });
    }
    return null;
  },

  eacTentarDeNovo(){ EAC_ST.erroItens.clear(); this.renderEAC(); },

  /** ID da categoria de uma conta (contas legadas guardam o nome em `cat`). */
  _eacCatId(c){
    if(c.catId) return c.catId;
    const x = CACHE.cats.find(k=>k.nome===c.cat);
    return x ? x.id : '?'+(c.cat||'');
  },

  /**
   * Fração de um valor que pertence ao filtro global de responsável (mesma regra do
   * Dashboard): compartilhada vale metade para Leo e para Pri. Usada na LB e na verba.
   */
  _eacFrac(resp, filtro){
    if(!filtro) return 1;
    if(filtro==='Leo & Pri') return resp==='Leo & Pri' ? 1 : 0;
    if(resp===filtro) return 1;
    return resp==='Leo & Pri' ? 0.5 : 0;
  },

  /**
   * Valores de uma conta em centavos para o filtro de responsável.
   * pag = vPagar (previsto), ef = vEfetivo (pesa no Comprometido), pago = vPago.
   * Na metade ÷2, pag usa o mesmo arredondamento da LB para não gerar reajuste de 1 centavo.
   * @returns {{pag:number, ef:number, pago:number}|null} null se a conta não entra no filtro
   */
  _eacValores(c, filtro){
    const f = this._eacFrac(c.resp, filtro);
    if(!f) return null;
    if(f===1) return {pag:centavos(c.vPagar), ef:centavos(vEfetivo(c)), pago:centavos(c.vPago||0)};
    const s = filtrarPorResp([c], filtro)[0];
    const pag = Math.round(centavos(c.vPagar)*f), pago = centavos(s.vPago||0);
    return {pag, ef: pago>0 ? pago : pag, pago};
  },

  // ══════════════════════════════════════════════════════════════════════
  // CÁLCULO
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Calcula Planejado, Comprometido, Realizado e as causas do desvio por categoria.
   * Ponte (fecha exatamente, em centavos):
   *   Planejado [+ Revisões, se comparando com a Rev 0] + (Contas novas − Verba) + Reajustes
   *   + Juros e multas + Descontos + Exclusões/saídas + Troca de categoria = Comprometido
   * @returns {{status:'ok'|'carregando'|'erro', lb, lb0, usar0, cats:Map}}
   */
  _eacCalcular(ano, filtro){
    const lbs = this.eacLBs(ano), lb = lbs[lbs.length-1]||null, lb0 = lbs[0]||null;
    const usar0 = EAC_ST.cmp==='rev0' && !!lb && lb0.id!==lb.id;
    let itens = null, itens0 = null;
    if(lb){
      itens = this._eacItens(lb);
      if(itens===null) return {status:EAC_ST.erroItens.has(lb.id)?'erro':'carregando', lb};
    }
    if(usar0){
      itens0 = this._eacItens(lb0);
      if(itens0===null) return {status:EAC_ST.erroItens.has(lb0.id)?'erro':'carregando', lb:lb0};
    }
    const porId = new Map(CACHE.contas.map(c=>[c.id,c]));
    const excl  = new Map(CACHE.eacExcl.map(e=>[e.contaId||e.id, e]));
    // Indevida só vale enquanto a conta não existir: restaurada da lixeira, volta a contar
    const indevida = id => !porId.has(id) && excl.get(id)?.classificacao==='indevida';
    const z = () => Array(12).fill(0);
    const cats = new Map();
    const acc = id => {
      if(!cats.has(id)) cats.set(id, {id, nivel:3, planM:z(), plan0M:z(), compM:z(), realM:z(), verba:0, novBruto:0,
        causas:{rev:0,nov:0,rea:0,jur:0,des:0,exc:0,rec:0}, det:{nov:[],rea:[],jd:[],exc:[],rec:[]}});
      return cats.get(id);
    };
    const planejar = (lista, doc, campo) => {
      lista.forEach(it=>{
        if(indevida(it.id)) return;
        const f = this._eacFrac(it.resp, filtro);
        if(f) acc(it.catId)[campo][it.mes] += Math.round(it.vCent*f);
      });
      // Verba (gastos variáveis): é da casa, então pesa como compartilhada no filtro
      const fv = this._eacFrac('Leo & Pri', filtro);
      Object.entries(doc.porCat||{}).forEach(([catId,p])=>{
        const v = Math.round((p.verbaMesCent||0)*fv);
        if(!v) return;
        const a = acc(catId);
        for(let m=0;m<12;m++) a[campo][m] += v;
        if(campo==='planM') a.verba += v*12;
      });
    };
    if(lb) planejar(itens, lb, 'planM');
    if(usar0) planejar(itens0, lb0, 'plan0M');

    // Contas do ano: Comprometido, Realizado e contas novas (fora da LB)
    const naLB = new Set(lb ? itens.map(i=>i.id) : []);
    CACHE.contas.forEach(c=>{
      if(eacAnoDe(c.data)!==ano) return;
      const v = this._eacValores(c, filtro);
      if(!v) return;
      const a = acc(this._eacCatId(c)), m = eacMesDe(c.data);
      a.compM[m] += v.ef; a.realM[m] += v.pago;
      if(lb && !naLB.has(c.id) && v.ef){
        a.novBruto += v.ef;
        a.det.nov.push({id:c.id, t:c.conta, s:`Vence ${fmtDate(c.data)} · ${c.resp}`, v:v.ef});
      }
    });

    // Contas da LB: exclusões, troca de categoria, reajuste e juros/descontos
    if(lb) itens.forEach(it=>{
      if(indevida(it.id)) return;
      const p = Math.round(it.vCent*this._eacFrac(it.resp, filtro));
      const c = porId.get(it.id);
      if(!c || eacAnoDe(c.data)!==ano){
        if(!p) return;
        const a = acc(it.catId);
        a.causas.exc -= p;
        a.det.exc.push({id:it.id, t:it.conta, v:-p, movida:!!c,
          s: c ? `Vencimento mudou para ${fmtDate(c.data)}` : 'Excluída',
          cls: c ? null : (excl.get(it.id)?.classificacao||'pendente')});
        return;
      }
      const v = this._eacValores(c, filtro) || {pag:0, ef:0, pago:0};
      const cat = this._eacCatId(c);
      if(cat!==it.catId && p){
        acc(it.catId).causas.rec -= p; acc(cat).causas.rec += p;
        acc(it.catId).det.rec.push({id:c.id, t:c.conta, s:`Foi para ${CACHE.getCatNome(cat)}`, v:-p});
        acc(cat).det.rec.push({id:c.id, t:c.conta, s:`Veio de ${CACHE.getCatNome(it.catId)}`, v:p});
      }
      const a = acc(cat);
      if(v.pag!==p){
        a.causas.rea += v.pag-p;
        a.det.rea.push({id:c.id, t:c.conta, s:`Na LB ${eacFmt(p)} · hoje ${eacFmt(v.pag)}`, v:v.pag-p});
      }
      const jd = v.ef-v.pag;
      if(jd){
        a.causas[jd>0?'jur':'des'] += jd;
        a.det.jd.push({id:c.id, t:c.conta, s:jd>0?'Pago com juros ou multa':'Pago com desconto', v:jd});
      }
    });

    cats.forEach(a=>{
      a.causas.nov = a.novBruto - a.verba;   // contas novas além da verba planejada
      if(usar0) a.causas.rev = eacSoma(a.planM) - eacSoma(a.plan0M);
      Object.values(a.det).forEach(l=>l.sort((x,y)=>Math.abs(y.v)-Math.abs(x.v)));
    });
    return {status:'ok', lb, lb0, usar0, cats};
  },

  /** Soma nós (categorias ou grupos) num nó pai. */
  _eacSomar(filhos, semLB){
    const z = () => Array(12).fill(0);
    const o = {planM:semLB?null:z(), compM:z(), realM:z(), verba:0, novBruto:0, causas:{rev:0,nov:0,rea:0,jur:0,des:0,exc:0,rec:0}, lbRevs:null};
    filhos.forEach(f=>{
      if(!semLB) f.planM.forEach((v,i)=>o.planM[i]+=v);
      f.compM.forEach((v,i)=>o.compM[i]+=v);
      f.realM.forEach((v,i)=>o.realM[i]+=v);
      o.verba += f.verba; o.novBruto += f.novBruto;
      Object.keys(o.causas).forEach(k=>o.causas[k]+=f.causas[k]);
      if(f.lbRevs) o.lbRevs = (o.lbRevs||f.lbRevs.map(()=>0)).map((v,i)=>v+f.lbRevs[i]);
    });
    return this._eacTotais(o);
  },
  _eacTotais(n){
    n.plan = n.planM ? eacSoma(n.planM) : null;
    n.comp = eacSoma(n.compM); n.real = eacSoma(n.realM);
    n.dev  = n.plan==null ? null : n.comp-n.plan;
    return n;
  },

  /** Monta a árvore 1 Consolidado > 1.x Grupo > 1.x.y Categoria a partir do cálculo. */
  _eacArvore(calc, ano){
    const semLB = !calc.lb;
    const lbs = this.eacLBs(ano);
    const grupos = [...CACHE.grupos].sort((a,b)=>(a.ordem??0)-(b.ordem??0)||a.nome.localeCompare(b.nome,'pt'));
    const grupoDe = catId => {
      const cat = CACHE.cats.find(c=>c.id===catId);
      return cat && cat.grupoId && grupos.some(g=>g.id===cat.grupoId) ? cat.grupoId : EAC_SEM_GRUPO;
    };
    const nomeCat = id => id.startsWith('?') ? (id.slice(1)||'Sem categoria') : (CACHE.cats.some(c=>c.id===id) ? CACHE.getCatNome(id) : 'Categoria excluída');
    const cats = [...calc.cats.values()].map(a=>{
      const n = {...a, nome:nomeCat(a.id), grupoId:grupoDe(a.id)};
      n.planM = semLB ? null : (calc.usar0 ? a.plan0M : a.planM);
      n.lbRevs = lbs.map(l=>l.porCat?.[a.id]?.totalCent||0);
      return this._eacTotais(n);
    }).filter(n=>n.plan||n.comp||n.real||n.det.exc.length)
      .sort((a,b)=>a.nome.localeCompare(b.nome,'pt'));
    const lista = [...grupos.map(g=>({id:g.id, nome:g.nome, cor:g.cor})), {id:EAC_SEM_GRUPO, nome:'Sem grupo', cor:null}];
    const nos = lista.map(g=>({g, filhos:cats.filter(c=>c.grupoId===g.id)})).filter(x=>x.filhos.length)
      .map((x,gi)=>{
        const no = {...this._eacSomar(x.filhos, semLB), id:x.g.id, nome:x.g.nome, cor:x.g.cor, nivel:2, filhos:x.filhos, code:'1.'+(gi+1)};
        x.filhos.forEach((f,fi)=>{ f.code = no.code+'.'+(fi+1); f.cor = x.g.cor; f.grupoNome = x.g.nome; });
        return no;
      });
    const total = {...this._eacSomar(cats, semLB), id:'tot', nome:'Consolidado '+ano, nivel:1, code:'1', filhos:nos};
    return {total, grupos:nos, cats, calc, ano, semLB};
  },
});

Object.assign(APP, {

  // ══════════════════════════════════════════════════════════════════════
  // RENDER DA TELA
  // ══════════════════════════════════════════════════════════════════════

  renderEAC(){
    if(!document.getElementById('page-eac')) return;
    const anos = this.eacAnos(), atual = new Date().getFullYear();
    if(EAC_ST.ano==null || !anos.includes(EAC_ST.ano)) EAC_ST.ano = atual;
    const ano = EAC_ST.ano, sit = this.eacSituacao(ano);
    if(EAC_ST.mes==null) EAC_ST.mes = sit==='atual' ? new Date().getMonth() : sit==='encerrado' ? 11 : 0;
    if(this.eacLBs(ano).length<2) EAC_ST.cmp = 'cur';

    const sel = document.getElementById('eacAno');
    sel.innerHTML = anos.map(a=>`<option value="${a}">${a} ${a===atual?'(vigente)':a<atual?'(encerrado)':'(preparar LB)'}</option>`).join('');
    sel.value = String(ano);
    document.getElementById('eacContent').classList.toggle('eac-foco', EAC_ST.foco);
    this._eacRenderFocoBtn();

    const calc = this._eacCalcular(ano, STATE.resp);
    this._eacRenderHead(ano, calc);
    if(calc.status!=='ok'){
      EAC_ST.arvore = null;
      const msg = calc.status==='erro'
        ? `Não foi possível ler a linha de base (${this._escHtml(EAC_ST.erroItens.get(calc.lb.id)||'')}). <button type="button" class="btn btn-secondary btn-sm" onclick="APP.eacTentarDeNovo()">Tentar de novo</button>`
        : 'Carregando a linha de base…';
      ['eacStrip','eacKpis','eacBridge','eacCurve'].forEach(id=>{ document.getElementById(id).innerHTML = ''; });
      document.getElementById('eacBridge').innerHTML = `<p class="eac-empty">${msg}</p>`;
      document.getElementById('eacTbody').innerHTML = `<tr class="eac-load"><td colspan="6">${msg}</td></tr>`;
      this.atualizarContextoTopbar();
      return;
    }
    const T = this._eacArvore(calc, ano);
    EAC_ST.arvore = T;
    this._eacRenderBanner(ano, sit, T);
    this._eacRenderStrip(ano, sit, T);
    this._eacRenderKpis(ano, sit, T);
    document.getElementById('eacBridge').innerHTML = this._eacBridgeSVG(T.total, calc);
    document.getElementById('eacBridgeBase').textContent = T.semLB ? 'Sem LB' : 'Base: '+(calc.usar0 ? 'LB Rev 0' : 'LB Rev '+calc.lb.rev);
    document.getElementById('eacCurve').innerHTML = this._eacCurveSVG(T.total, ano, sit);
    this._eacRenderTabela(T);
    this._eacRenderSub();
    this.atualizarContextoTopbar();
  },

  /** Redesenha a tela e os modais da EAC abertos quando os dados mudam (listeners do Firestore). */
  eacAoMudarDados(){
    if(STATE.page==='eac') this.renderEAC();
    const aberto = id => document.getElementById(id)?.classList.contains('open');
    if(aberto('ovEacGrupos')) this.eacGruposRender?.();
    if(aberto('ovEacExcl'))   this.eacExclRender?.();
    // Na aba de salvar, redesenhar apagaria o que está sendo digitado: só o resumo é atualizado
    if(aberto('ovEacLB')) EAC_LB.aba==='salvar' ? this._eacLBAtualizarResumo?.() : this.eacLBRender?.();
  },

  _eacRenderHead(ano, calc){
    const lb = this.eacLBVigente(ano), sit = this.eacSituacao(ano);
    const chip = document.getElementById('eacLbChip');
    chip.classList.toggle('sem', !lb);
    document.getElementById('eacLbRev').textContent = lb ? 'Rev '+lb.rev : 'Sem LB';
    document.getElementById('eacLbTxt').textContent = lb ? (sit==='encerrado' ? 'Linha de base final de '+ano : 'Linha de base vigente') : 'Nenhuma LB em '+ano;
    document.getElementById('eacLbSub').textContent = lb
      ? `salva${lb.criadaEmIso?' em '+new Date(lb.criadaEmIso).toLocaleDateString('pt-BR'):''}${lb.criadaPor?' por '+lb.criadaPor:''}${lb.foraDoPrazo?' · fora do prazo':''}`
      : (sit==='encerrado' ? 'ano encerrado sem LB' : 'Rev 0 pendente');
    const tem0 = this.eacLBs(ano).length>1;
    const c0 = document.getElementById('eacCmpRev0'), cc = document.getElementById('eacCmpCur');
    c0.disabled = !tem0; c0.title = tem0 ? 'Planejado pela Rev 0 (plano original do ano)' : 'Só existe uma revisão neste ano';
    c0.setAttribute('aria-pressed', String(EAC_ST.cmp==='rev0')); cc.setAttribute('aria-pressed', String(EAC_ST.cmp!=='rev0'));
    const pend = calc.status==='ok' ? this.eacExcluidas(ano).filter(e=>!e.cls).length : 0;
    document.getElementById('eacExclTxt').innerHTML = pend ? `Excluídas <span class="eac-pill warn">${pend} a classificar</span>` : 'Excluídas';
  },

  _eacRenderBanner(ano, sit, T){
    const b = [], hoje = new Date();
    const btn = (txt, js, cls='btn-secondary') => `<button type="button" class="btn ${cls} btn-sm" onclick="${js}">${txt}</button>`;
    const adm = this.eacPodeAlterar();
    const salvar0 = adm ? btn('Salvar Rev 0',"APP.eacAbrirLB('salvar')",'btn-primary') : '<span class="eac-pill neu">Só o administrador salva a linha de base</span>';
    if(sit==='atual' && T.semLB){
      b[hoje.getMonth()===0?'push':'unshift'](hoje.getMonth()===0
        ? `<div class="eac-banner warn" role="status"><span class="eac-grow"><b>Linha de base de ${ano} pendente.</b> Janeiro é o mês de salvar a Rev 0. ${FEATURES.recorrentes?'Gere as recorrentes do ano':'Cadastre as contas previstas do ano'} antes; sem LB, a coluna Planejado fica vazia e o desvio não é calculado.</span>${salvar0}</div>`
        : `<div class="eac-banner bad" role="alert"><span class="eac-grow"><b>Sem linha de base em ${ano}.</b> A Rev 0 deveria ter sido salva em janeiro. Salve agora: ela fica marcada como fora do prazo e passa a valer a partir de hoje.</span>${salvar0}</div>`);
    }
    if(sit==='encerrado') b.push(`<div class="eac-banner warn"><span class="eac-grow"><b>${ano} encerrado.</b> Consulta somente leitura${T.semLB?'; o ano não teve linha de base.':`: resultado final contra a Rev ${T.calc.lb.rev}.`}</span></div>`);
    if(sit==='futuro') b.push(`<div class="eac-banner info"><span class="eac-grow"><b>Preparação de ${ano}.</b> Em dezembro dá para salvar a Rev 0 do ano seguinte. ${FEATURES.recorrentes?'Gere as recorrentes':'Cadastre as contas previstas'} de ${ano} antes de salvar.</span>${T.semLB?salvar0:''}</div>`);
    if(sit==='atual' && hoje.getMonth()===11 && !this.eacLBs(ano+1).length)
      b.push(`<div class="eac-banner info"><span class="eac-grow"><b>Dezembro:</b> já dá para preparar a linha de base de ${ano+1}.</span>${btn('Preparar Rev 0 de '+(ano+1),`APP.eacSetAno(${ano+1})`)}</div>`);
    const pend = this.eacExcluidas(ano).filter(e=>!e.cls).length;
    if(pend && sit!=='encerrado')
      b.push(`<div class="eac-banner warn"><span class="eac-grow"><b>${pend} conta${pend>1?'s':''} da LB ${pend>1?'foram excluídas e aguardam':'foi excluída e aguarda'} classificação${adm?'':' do administrador'}.</b> Enquanto não classificadas, contam como economia. Cadastro errado ou duplicado deve ser marcado como indevido para sair do cálculo.</span>${btn(adm?'Classificar':'Ver excluídas','APP.eacAbrirExcluidas()')}</div>`);
    document.getElementById('eacBanner').innerHTML = b.join('');
  },

  _eacRenderStrip(ano, sit, T){
    const hoje = new Date(), mesHoje = hoje.getMonth();
    const rec = MESES.map((_,m)=>centavos(CACHE.getReceitaMes(ano, m, STATE.resp)));
    const des = T.total.compM;
    const max = Math.max(1, ...rec, ...des);
    document.getElementById('eacStrip').innerHTML = MESES.map((m,i)=>{
      const sal = rec[i]-des[i], fut = sit==='futuro' || (sit==='atual' && i>mesHoje);
      const cls = sal>0?'pos':sal<0?'neg':'zero';
      return `<button type="button" class="eac-mcell${des[i]>rec[i]?' red':''}${fut?' fut':''}" aria-pressed="${EAC_ST.mes===i}" onclick="APP.eacSetMes(${i})"
        title="${MESES_F[i]}: receita ${eacFmt(rec[i])}, despesa comprometida ${eacFmt(des[i])}">
        ${sit==='atual'&&i===mesHoje?'<span class="today">HOJE</span>':''}
        <span class="mn">${m}</span>
        <span class="eac-mbars" aria-hidden="true"><i class="r" style="height:${Math.max(3,rec[i]/max*34)}px"></i><i class="d" style="height:${Math.max(3,des[i]/max*34)}px"></i></span>
        <span class="mv money ${cls}">${sal>0?'+':''}${eacFmtK(sal)}</span></button>`;
    }).join('');
  },

  _eacCardRD(titulo, rec, des, sub){
    const sal = rec-des, p = eacPct(des, rec), bad = des>rec;
    return `<div class="eac-kpi" style="--kc:${bad?'var(--red)':'var(--palm)'}">
      <div class="eac-kpi-l"><span>${titulo}</span><span class="eac-pill ${bad?'bad':'ok'}">${bad?'Despesas maiores':'Receitas cobrem'}</span></div>
      <div class="eac-kpi-v money" style="color:${sal>=0?'var(--green)':'var(--red)'}">${eacFmtSig(sal)}</div>
      <div class="eac-kpi-rows"><span>Receitas</span><b class="money">${eacFmt(rec)}</b><span>Despesas comprometidas</span><b class="money">${eacFmt(des)}</b></div>
      <div><div class="eac-meter" role="img" aria-label="Despesas usam ${Math.round(p)}% da receita"><i class="${bad?'bad':''}" style="width:${Math.min(100,p)}%"></i><span class="mtk" style="left:calc(100% - 2px)" title="Limite da receita"></span></div>
      <div class="eac-meter-l"><span>${rec?Math.round(p)+'% da receita comprometida':'sem receita no período'}</span><span>${sub}</span></div></div></div>`;
  },

  _eacRenderKpis(ano, sit, T){
    const m = EAC_ST.mes, t = T.total;
    const recM = centavos(CACHE.getReceitaMes(ano, m, STATE.resp));
    const recMeses = MESES.map((_,i)=>centavos(CACHE.getReceitaMes(ano, i, STATE.resp)));
    const recA = eacSoma(recMeses);
    const vermelhos = recMeses.filter((r,i)=>t.compM[i]>r).length;
    const futuro = sit==='futuro' || (sit==='atual' && m>new Date().getMonth());
    let dev;
    if(t.plan==null){
      dev = `<div class="eac-kpi" style="--kc:var(--t4)"><div class="eac-kpi-l"><span>Desvio do ano</span><span class="eac-pill neu">Sem LB</span></div>
        <div class="eac-kpi-v" style="color:var(--t4)">Sem LB</div>
        <div class="eac-kpi-s">Salve a Rev 0 de ${ano} para medir o desvio. Comprometido até agora: <b class="money">${eacFmt(t.comp)}</b></div></div>`;
    } else {
      const d = t.dev, p = eacPct(d, t.plan), base = T.calc.usar0 ? 'LB original (Rev 0)' : 'LB Rev '+T.calc.lb.rev;
      dev = `<div class="eac-kpi hero${d>0?' badv':''}" style="--kc:${d>0?'var(--red)':'var(--green)'}">
        <div class="eac-kpi-l"><span>Desvio do ano</span><span class="eac-pill ${d>0?'bad':'ok'}">${eacFmtPct(p)}</span></div>
        <div class="eac-kpi-v money" style="color:${d>0?'var(--red)':'var(--green)'}">${eacFmtSig(d)}</div>
        <div class="eac-kpi-s">${d>0?'Gasto acima':'Economia'} contra a ${base}<br><span class="money">Planejado ${eacFmt(t.plan)} · Comprometido ${eacFmt(t.comp)}</span></div></div>`;
    }
    const decorrido = this._eacDecorrido(ano, sit), exec = eacPct(t.real, t.comp);
    const dTxt = decorrido.toLocaleString('pt-BR',{maximumFractionDigits:1});
    const ritmo = `<div class="eac-kpi" style="--kc:var(--blue)">
      <div class="eac-kpi-l"><span>Ritmo de execução</span><span class="eac-pill info">${sit==='encerrado'?'Ano fechado':sit==='futuro'?'Não começou':'Até hoje'}</span></div>
      <div class="eac-kpi-v">${Math.round(exec)}% pago</div>
      <div class="eac-kpi-rows"><span>Realizado</span><b class="money">${eacFmt(t.real)}</b><span>A pagar no ano</span><b class="money">${eacFmt(t.comp-t.real)}</b></div>
      <div><div class="eac-meter" role="img" aria-label="${Math.round(exec)}% do comprometido pago; ${dTxt}% do ano decorrido"><i style="width:${Math.min(100,exec)}%;background:var(--blue)"></i><span class="mtk" style="left:calc(${decorrido}% - 1px)"></span></div>
      <div class="eac-meter-l"><span>Barra: pago</span><span>Marca: ${dTxt}% do ano</span></div></div></div>`;
    document.getElementById('eacKpis').innerHTML =
      this._eacCardRD(`${MESES_F[m]} ${ano}`, recM, t.compM[m], futuro ? 'mês futuro' : 'mês selecionado') +
      this._eacCardRD(`Ano ${ano} consolidado`, recA, t.comp, `${vermelhos} ${vermelhos===1?'mês':'meses'} no vermelho`) + dev + ritmo;
    document.getElementById('eacRitmo').textContent = `${Math.round(exec)}% pago · ${dTxt}% do ano`;
  },

  /** Percentual do ano já decorrido (0 a 100). */
  _eacDecorrido(ano, sit){
    if(sit==='encerrado') return 100;
    if(sit==='futuro') return 0;
    const ini = new Date(ano,0,1), fim = new Date(ano+1,0,1);
    return Math.round((Date.now()-ini)/(fim-ini)*1000)/10;
  },
});

Object.assign(APP, {

  // ══════════════════════════════════════════════════════════════════════
  // GRÁFICOS (SVG em escala; cores pelas classes .eac-* do CSS)
  // ══════════════════════════════════════════════════════════════════════

  /** Degraus da ponte do desvio de um nó. compacto: esconde causas zeradas. */
  _eacPassos(n, calc, compacto){
    const c = n.causas;
    const st = [{l:'Planejado', s:calc.usar0?'LB Rev 0':'LB vigente', v:n.plan, tot:true}];
    if(calc.usar0) st.push({l:'Revisões', s:'da LB', v:c.rev, rev:true});
    st.push({l:'Contas', s:n.verba?'além da verba':'novas', v:c.nov},
            {l:'Reajustes', s:'de valor', v:c.rea},
            {l:'Juros', s:'e multas', v:c.jur},
            {l:'Descontos', s:'obtidos', v:c.des},
            {l:'Exclusões', s:'e saídas', v:c.exc});
    if(c.rec) st.push({l:'Troca de', s:'categoria', v:c.rec});
    st.push({l:'Comprometido', s:'hoje', v:n.comp, tot:true});
    return compacto ? st.filter(p=>p.tot||p.v) : st;
  },

  _eacBridgeSVG(n, calc, opt={}){
    if(n.plan==null) return '<p class="eac-empty">Sem linha de base no ano: a ponte aparece depois que a Rev 0 for salva.</p>';
    const st = this._eacPassos(n, calc, opt.compacto);
    const W = opt.w||560, H = opt.h||250, mt = 24, mb = 40, ml = 6, mr = 6;
    let run = 0; const lv = [];
    st.forEach(p=>{ if(p.tot){ lv.push([0,p.v]); run = p.v; } else { lv.push([run, run+p.v]); run += p.v; } });
    const tops = lv.flatMap(([a,b],i)=>st[i].tot ? [b] : [a,b]);
    const hi = Math.max(...tops), lo = Math.min(...tops), span = Math.max(hi-lo, Math.abs(hi)*0.02, 100);
    // Eixo recortado: começa abaixo do menor nível para as variações ficarem visíveis
    const y0 = lo-span*1.1, y1 = hi+span*0.18;
    const y = v => mt+(H-mt-mb)*(1-(Math.max(v,y0)-y0)/(y1-y0));
    const slot = (W-ml-mr)/st.length, bw = Math.min(54, slot*0.62);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:${opt.compacto?360:480}px" role="img" aria-label="Ponte do desvio: ${st.map(p=>p.l+' '+eacFmtK(p.v)).join(', ')}">`;
    s += `<line class="eac-grid" x1="${ml}" x2="${W-mr}" y1="${H-mb}" y2="${H-mb}"/>`;
    st.forEach((p,i)=>{
      const cx = ml+slot*i+slot/2, [a,b] = lv[i];
      const top = y(Math.max(a,b)), bot = p.tot ? H-mb : y(Math.min(a,b));
      const cls = p.tot?'eac-wf-tot':p.rev?'eac-wf-rev':p.v>0?'eac-wf-up':'eac-wf-dn';
      s += `<rect class="${cls}" x="${cx-bw/2}" y="${top}" width="${bw}" height="${Math.max(2,bot-top)}" rx="3"/>`;
      if(p.tot) s += `<path class="eac-wf-cut" d="M${cx-bw/2} ${H-mb-12} l${bw/4} -5 l${bw/4} 5 l${bw/4} -5 l${bw/4} 5"/>`;
      if(i<st.length-1){ const nx = ml+slot*(i+1)+slot/2; s += `<line class="eac-wf-link" x1="${cx+bw/2}" x2="${nx-bw/2}" y1="${y(b)}" y2="${y(b)}"/>`; }
      s += `<text class="eac-lbl" x="${cx}" y="${top-6}" text-anchor="middle">${p.tot?'':p.v>0?'+':''}${eacFmtK(p.v)}</text>`;
      s += `<text class="eac-ax" x="${cx}" y="${H-mb+15}" text-anchor="middle">${p.l}</text><text class="eac-lbl-s" x="${cx}" y="${H-mb+28}" text-anchor="middle">${p.s}</text>`;
    });
    return s+'</svg><p class="eac-note" style="margin-top:4px">Eixo vertical recortado (não começa em zero) para mostrar as variações; os totais têm a marca ∿ na base. Valores em R$.</p>';
  },

  /** Posição de "hoje" no ano: mês e fração do mês (encerrado = fim do ano; futuro = início). */
  _eacHoje(ano, sit){
    if(sit==='encerrado') return {h:11, f:1};
    if(sit==='futuro') return {h:0, f:0};
    const d = new Date(), dias = new Date(ano, d.getMonth()+1, 0).getDate();
    return {h:d.getMonth(), f:d.getDate()/dias};
  },

  _eacCurveSVG(n, ano, sit, opt={}){
    const W = opt.w||520, H = opt.h||250, ml = 48, mr = 12, mt = 14, mb = 26;
    const acc = a => { let s = 0; return a.map(v=>s+=v); };
    const P = n.planM ? acc(n.planM) : null, C = acc(n.compM);
    const {h, f} = this._eacHoje(ano, sit);
    // Pago acumulado por mês de vencimento até hoje; o ponto de hoje soma todo o já pago
    const R = []; let s = 0; for(let i=0;i<h;i++){ s += n.realM[i]; R.push(s); }
    const max = Math.max(1, ...C, ...(P||[0]), n.real)*1.06;
    const x = t => ml+(W-ml-mr)*t/12, y = v => mt+(H-mt-mb)*(1-v/max);
    let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:${opt.compacto?340:420}px" role="img" aria-label="Curva S: comprometido ${eacFmtK(C[11])}${P?', planejado '+eacFmtK(P[11]):''}, pago ${eacFmtK(n.real)}">`;
    for(let k=0;k<=4;k++){ const v = max*k/4; g += `<line class="eac-grid" x1="${ml}" x2="${W-mr}" y1="${y(v)}" y2="${y(v)}"/><text class="eac-ax" x="${ml-6}" y="${y(v)+3}" text-anchor="end">${eacFmtK(v)}</text>`; }
    MESES.forEach((m,i)=>{ g += `<text class="eac-ax" x="${x(i+0.5)}" y="${H-8}" text-anchor="middle">${m[0]}</text>`; });
    const linha = arr => `M${x(0)} ${y(0)}` + arr.map((v,i)=>` L${x(i+1)} ${y(v)}`).join('');
    const rpts = [[0,0], ...R.map((v,i)=>[i+1,v]), [h+f, n.real]];
    if(sit!=='futuro'){
      g += `<path class="eac-c-real-a" d="M${x(0)} ${y(0)}${rpts.map(([t,v])=>` L${x(t)} ${y(v)}`).join('')} L${x(h+f)} ${y(0)} Z"/>`;
    }
    if(P) g += `<path class="eac-c-plan" d="${linha(P)}"/>`;
    g += `<path class="eac-c-comp" d="${linha(C)}"/>`;
    if(sit!=='futuro'){
      g += `<path class="eac-c-real" d="M${rpts.map(([t,v])=>`${x(t)} ${y(v)}`).join(' L')}"/>`;
      g += `<circle class="eac-c-dot" cx="${x(h+f)}" cy="${y(n.real)}" r="4"/>`;
    }
    if(sit==='atual') g += `<line class="eac-c-today" x1="${x(h+f)}" x2="${x(h+f)}" y1="${mt}" y2="${H-mb}"/><text class="eac-lbl-s" x="${x(h+f)+4}" y="${mt+8}">hoje</text>`;
    const fim = (v,cor,dy) => `<text class="eac-lbl" x="${W-mr}" y="${y(v)+dy}" text-anchor="end" style="fill:${cor}">${eacFmtK(v)}</text>`;
    if(P) g += fim(P[11], 'var(--t3)', P[11]>C[11]?-6:14);
    g += fim(C[11], 'var(--blue)', P&&P[11]>C[11]?14:-6);
    return g+'</svg>';
  },

  // ══════════════════════════════════════════════════════════════════════
  // TABELA EAP
  // ══════════════════════════════════════════════════════════════════════

  _eacLinhas(T){
    const out = [T.total], porDesvio = (a,b)=>(b.dev||0)-(a.dev||0);
    const gs = EAC_ST.ordem==='dev' ? [...T.grupos].sort(porDesvio) : T.grupos;
    gs.forEach(g=>{
      out.push(g);
      const fs = EAC_ST.ordem==='dev' ? [...g.filhos].sort(porDesvio) : g.filhos;
      fs.forEach((c,i)=>out.push({...c, _ultima:i===fs.length-1, _grupoId:g.id}));
    });
    return out;
  },

  _eacVisivel(r){
    if(r.nivel===1) return true;
    if(EAC_ST.recolhidos.has('tot')) return false;
    return r.nivel===3 ? !EAC_ST.recolhidos.has(r._grupoId) : true;
  },

  _eacRenderTabela(T){
    const esc = v=>this._escHtml(v);
    const max = {2:Math.max(1,...T.grupos.map(g=>Math.abs(g.dev||0))), 3:Math.max(1,...T.cats.map(c=>Math.abs(c.dev||0)))};
    const html = this._eacLinhas(T).map(r=>{
      const chave = r.nivel===1 ? 'tot' : r.id;
      const temFilhos = r.nivel<3, aberto = temFilhos && !EAC_ST.recolhidos.has(chave);
      const cor = r.nivel>1 ? eacCor(r.cor) : null;
      const tw = temFilhos ? `<button type="button" class="eac-tw" data-eac-tw="${chave}" aria-expanded="${aberto}" aria-label="${aberto?'Recolher':'Expandir'} ${esc(r.nome)}" onclick="APP.eacToggle('${chave}')"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></button>` : '';
      const guia = r.nivel===3 ? `<span class="eac-guide${r._ultima?' last':''}"></span>` : r.nivel===2 ? '<span class="eac-ind"></span>' : '';
      const dot = r.nivel===2 ? `<i class="eac-dot" style="background:${cor}"></i>` : '';
      const meta = r.nivel===1 ? `<span class="eac-meta">${T.grupos.length} grupo${T.grupos.length===1?'':'s'} · ${T.cats.length} categorias</span>`
                 : r.nivel===2 ? `<span class="eac-meta">${r.filhos.length} cat.</span>`
                 : (r.det.exc.length ? `<span class="eac-pill neu" title="Contas da LB excluídas ou que saíram do ano">${r.det.exc.length} excl.</span>` : '');
      const pr = eacPct(r.real, r.comp);
      let dv;
      if(r.dev==null) dv = '<span class="eac-dv-v zero">sem LB</span>';
      else {
        const p = eacPct(r.dev, r.plan), cl = r.dev>0?'up':r.dev<0?'dn':'zero';
        const w = r.nivel===1 ? (r.dev?50:0) : Math.min(50, Math.abs(r.dev)/max[r.nivel]*50);
        dv = `<div class="eac-dv"><span class="eac-dv-v ${cl} money">${eacFmtSig(r.dev)}</span><span class="eac-pill ${r.dev>0?'bad':r.dev<0?'ok':'neu'} eac-dv-p" ${r.plan?'':'title="Sem valor planejado na LB"'}>${r.plan||!r.dev?eacFmtPct(p):'novo'}</span><span class="eac-dvbar" aria-hidden="true">${r.dev?`<i class="${cl}" style="width:${w}%"></i>`:''}</span></div>`;
      }
      return `<tr class="l${r.nivel}" data-eac-row="${r.id}" ${cor?`style="--gc:${cor}"`:''} ${this._eacVisivel(r)?'':'hidden'}>
        <td class="code">${r.code}</td>
        <td class="name"><div class="eac-nm">${guia}${tw}${dot}<button type="button" class="eac-lnk" data-eac-open="${r.id}" onclick="APP.eacAbrirDetalhe('${r.id}')">${esc(r.nome)}</button>${meta}</div></td>
        <td class="v">${r.plan==null?'<span class="eac-pill neu">sem LB</span>':`<span class="money">${eacFmt(r.plan)}</span>`}</td>
        <td class="v"><span class="money">${eacFmt(r.comp)}</span></td>
        <td class="v"><div class="eac-real"><span class="money">${eacFmt(r.real)}</span><span class="eac-rbar" title="${Math.round(pr)}% do comprometido já pago"><i style="width:${Math.min(100,pr)}%"></i></span></div></td>
        <td class="v">${dv}</td></tr>`;
    }).join('');
    const tbody = document.getElementById('eacTbody');
    tbody.innerHTML = T.cats.length ? html : `<tr class="eac-load"><td colspan="6">Nenhuma conta nem linha de base em ${T.ano}.</td></tr>`;
    if(!tbody._eacTeclado){
      tbody._eacTeclado = true;
      // ← recolhe e → expande a linha do nome em foco
      tbody.addEventListener('keydown', e=>{
        if(e.key!=='ArrowLeft' && e.key!=='ArrowRight') return;
        const tw = e.target.closest('tr')?.querySelector('[data-eac-tw]');
        if(!tw) return;
        const id = tw.dataset.eacTw, fechado = EAC_ST.recolhidos.has(id);
        if((e.key==='ArrowLeft') === fechado) return;
        e.preventDefault();
        this.eacToggle(id);
        tbody.querySelector(`tr[data-eac-row="${e.target.closest('tr').dataset.eacRow}"] [data-eac-open]`)?.focus();
      });
    }
    document.querySelectorAll('[data-eac-nivel]').forEach(b=>b.setAttribute('aria-pressed', String(+b.dataset.eacNivel===EAC_ST.nivel)));
    document.querySelectorAll('[data-eac-ordem]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.eacOrdem===EAC_ST.ordem)));
  },

  /** Subtítulo da tabela: no modo foco mostra o contexto que some com o painel. */
  _eacRenderSub(){
    const sub = document.getElementById('eacTblSub'), T = EAC_ST.arvore;
    if(!sub || !T) return;
    const sem = T.grupos.find(g=>g.id===EAC_SEM_GRUPO);
    const aviso = sem ? `<span class="eac-pill warn">${sem.filhos.length} categoria${sem.filhos.length>1?'s':''} sem grupo</span>` : '';
    const base = T.semLB ? 'sem LB' : T.calc.usar0 ? 'LB original (Rev 0)' : 'LB Rev '+T.calc.lb.rev;
    sub.innerHTML = EAC_ST.foco
      ? `${T.ano} · Planejado: ${base}${STATE.resp?' · '+this._escHtml(STATE.resp):''} · tecla F ou Esc volta ao painel${aviso}`
      : `Clique no nome de qualquer linha para ver o detalhe${aviso}`;
  },

  // ══════════════════════════════════════════════════════════════════════
  // INTERAÇÕES
  // ══════════════════════════════════════════════════════════════════════

  eacSetAno(v){
    EAC_ST.ano = parseInt(v,10); EAC_ST.mes = null; EAC_ST.cmp = 'cur';
    this.renderEAC();
  },
  eacSetMes(m){ EAC_ST.mes = m; if(EAC_ST.arvore){ const s=this.eacSituacao(EAC_ST.ano); this._eacRenderStrip(EAC_ST.ano, s, EAC_ST.arvore); this._eacRenderKpis(EAC_ST.ano, s, EAC_ST.arvore); } },
  eacSetCmp(v){ EAC_ST.cmp = v; this.renderEAC(); },
  eacSetOrdem(v){ EAC_ST.ordem = v; if(EAC_ST.arvore) this._eacRenderTabela(EAC_ST.arvore); },
  eacSetNivel(n){
    EAC_ST.nivel = n; EAC_ST.recolhidos.clear();
    if(n===1) EAC_ST.recolhidos.add('tot');
    if(n<=2 && EAC_ST.arvore) EAC_ST.arvore.grupos.forEach(g=>EAC_ST.recolhidos.add(g.id));
    if(EAC_ST.arvore) this._eacRenderTabela(EAC_ST.arvore);
  },
  eacToggle(id){
    EAC_ST.recolhidos.has(id) ? EAC_ST.recolhidos.delete(id) : EAC_ST.recolhidos.add(id);
    EAC_ST.nivel = 0;   // nenhum nível do segmentado corresponde mais ao que está aberto
    if(EAC_ST.arvore) this._eacRenderTabela(EAC_ST.arvore);
    document.querySelector(`[data-eac-tw="${id}"]`)?.focus();
  },

  /** Modo "só a tabela": esconde régua, cards, gráficos e avisos. Botão ou tecla F; Esc sai. */
  eacSetFoco(on){
    EAC_ST.foco = !!on;
    document.getElementById('eacContent')?.classList.toggle('eac-foco', EAC_ST.foco);
    this._eacRenderFocoBtn();
    this._eacRenderSub();
  },
  _eacRenderFocoBtn(){
    const b = document.getElementById('eacBtnFoco');
    if(!b) return;
    const on = EAC_ST.foco;
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? 'Mostrar cards e gráficos (tecla F)' : 'Ocultar cards e gráficos (tecla F)';
    b.querySelector('span').textContent = on ? 'Mostrar painel' : 'Só a tabela';
    b.querySelector('svg').innerHTML = on
      ? '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>'
      : '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>';
  },
});

// Tecla F alterna o modo "só a tabela" e Esc sai dele (só na tela EAC, sem modal nem busca aberta
// e fora de campos de texto).
document.addEventListener('keydown', e=>{
  if(STATE.page!=='eac' || !document.getElementById('page-eac')) return;
  if(e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if(document.querySelector('.modal-overlay.open, .cmdk-overlay:not([hidden])')) return;
  if(e.key==='f' || e.key==='F'){ e.preventDefault(); APP.eacSetFoco(!EAC_ST.foco); }
  else if(e.key==='Escape' && EAC_ST.foco) APP.eacSetFoco(false);
});
