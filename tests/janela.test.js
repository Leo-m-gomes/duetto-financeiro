/**
 * Testes do contrato de cobertura das contas (README 3.5).
 *
 * Rodar: node --test tests/
 *
 * Carrega js/fin-state.js e js/fin-cache.js numa vm (sem navegador nem Firebase) e verifica:
 *   1. Equivalência: no modo 'on', começando só com a carga de abertura (janela do usuário,
 *      em aberto de antes da janela e pendentes) e carregando sob demanda o que o contrato
 *      pede, toda consulta devolve exatamente o mesmo que a base completa.
 *   2. Contrato: pedido fora da cobertura lança DadosIncompletos no 'on', só registra no
 *      'sombra' e nunca falta no 'off'.
 *   3. Diagnóstico do modo sombra e o campo derivado emAberto.
 *   4. Estático: ninguém fora de fin-cache.js e fin-db.js toca CACHE._contas.
 */
"use strict";
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const RAIZ = path.join(__dirname, '..');

/** Contexto novo com fin-state.js e fin-cache.js carregados; devolve os globais usados. */
function carregar(){
  const ctx = {
    console,
    document: {documentElement: {classList: {toggle(){}}}, querySelector: () => null, getElementById: () => null},
    localStorage: {getItem: () => null, setItem(){}, removeItem(){}},
    ADMIN_USERS: ['Leo'],
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for(const f of ['js/fin-state.js', 'js/fin-cache.js']){
    vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, {filename: f});
  }
  const g = n => vm.runInContext(n, ctx);
  return {ctx, CACHE: g('CACHE'), COBERTURA: g('COBERTURA'), DadosIncompletos: g('DadosIncompletos'),
    today: g('today'), addMeses: g('addMeses'), respsDaVisao: g('respsDaVisao'), contaEmAberto: g('contaEmAberto'),
    filtrarPorResp: g('filtrarPorResp'), isOverdue: g('isOverdue'), aprovacaoPendente: g('aprovacaoPendente'),
    setFS: fs => { ctx.FS = fs; vm.runInContext('var FS = window.FS;', ctx); }};
}

// ── CENÁRIOS-LIMITE (datas relativas a hoje: o teste vale em qualquer dia do ano) ──
const ANO = new Date().getFullYear();
function montarContas(addMeses, hoje){
  let n = 0;
  const c = (dados) => ({id: `c${++n}`, catId: 'cat1', formaId: 'f1', conta: `Conta ${n}`, vPagar: 100, vPago: null, ...dados});
  const pago = {vPago: 100, paidBy: 'Leo', paidAt: hoje};
  const lista = [
    c({resp: 'Leo',       data: `${ANO}-03-10`, ...pago}),
    c({resp: 'Pri',       data: `${ANO}-04-15`}),
    c({resp: 'Leo & Pri', data: `${ANO}-01-05`}),
    c({resp: 'Leo & Pri', data: `${ANO}-12-20`, divisao: {Leo: 6000, Pri: 4000}}),
    c({resp: 'Leo',       data: hoje}),
    // Atrasada sem pagamento de 3 anos atrás
    c({resp: 'Leo',       data: `${ANO-3}-06-01`}),
    c({resp: 'Pri',       data: `${ANO-2}-02-01`}),
    // Compartilhada antiga com só uma parte paga (vPago > 0, não quitada)
    c({resp: 'Leo & Pri', data: `${ANO-2}-08-10`, vPago: 50, pagamentos: {Leo: {valor: 50, paidBy: 'Leo', paidAt: `${ANO-2}-08-10`}}}),
    // Antiga quitada (não entra na carga de abertura)
    c({resp: 'Pri',       data: `${ANO-1}-05-05`, ...pago}),
    c({resp: 'Leo',       data: `${ANO-1}-12-31`, ...pago}),
    // Pendente de aprovação (Pri cadastrou com o admin como responsável) no ano seguinte
    c({resp: 'Leo',       data: `${ANO+1}-02-10`, createdBy: 'Pri', aprovacao: {status: 'pendente', motivo: 'cadastro', por: 'Pri', emIso: 'x'}}),
    // Financiamento longo
    c({resp: 'Leo',       data: '2040-07-01', grupo: 'grp-fin', parcela: '170 de 360'}),
  ];
  // Parcelamento de 24x começando 14 meses atrás (cruza o início da janela)
  const inicio = addMeses(`${ANO}-01-15`, -14);
  for(let i = 0; i < 24; i++){
    lista.push(c({resp: i % 2 ? 'Leo' : 'Leo & Pri', data: addMeses(inicio, i), grupo: 'grp-24', parcela: `${i+1} de 24`,
      ...(i < 10 ? pago : {})}));
  }
  return lista.map(x => ({...x, emAberto: !isQuitadaLocal(x)}));
}
// Mesma regra de isQuitada (fin-state.js), para montar emAberto sem depender do contexto
function isQuitadaLocal(c){
  const ind = c.resp === 'Leo & Pri' && !!(c.pagamentos?.Leo || c.pagamentos?.Pri);
  return ind ? !!(c.pagamentos.Leo && c.pagamentos.Pri) : c.vPago > 0;
}

/**
 * Prepara um contexto no modo 'on' com só a carga de abertura e um FS falso que "lê" da
 * base completa exatamente o que cada consulta do Firestore leria.
 */
function modoOn(usuario = 'Leo', admin = true){
  const m = carregar();
  const todas = montarContas(m.addMeses, m.today());
  const INI = `${ANO}-01-01`, FIM = `${ANO}-12-31`;
  const base = m.respsDaVisao(usuario);
  const mem = new Map();
  const por = filtro => todas.filter(filtro).forEach(c => mem.set(c.id, c));
  const sync = () => { m.CACHE._contas = [...mem.values()]; };
  por(c => c.data >= INI && c.data <= FIM && base.includes(c.resp));
  por(c => c.data < INI && c.emAberto === true);
  if(admin) por(c => c.aprovacao?.status === 'pendente');
  sync();
  m.CACHE.resetCobertura(false);
  m.CACHE.marcarCoberto({ini: INI, fim: FIM, resps: base});
  m.CACHE.marcarCoberto({abertasAntes: INI});
  if(admin) m.CACHE.marcarCoberto({pendentes: true});
  m.COBERTURA.modo = 'on';
  const cargas = [];
  m.setFS({
    garantirCobertura(falta){
      cargas.push(falta);
      if(falta.tudo) por(() => true);
      else if(falta.grupo) por(c => c.grupo === falta.grupo);
      else if(falta.pendentes) por(c => c.aprovacao?.status === 'pendente');
      else if(falta.ini){
        const todos3 = falta.resps.length === 3;
        por(c => c.data >= falta.ini && c.data <= falta.fim && (todos3 || falta.resps.includes(c.resp)));
      }
      sync();
      m.CACHE.marcarCoberto(falta);
      return Promise.resolve();
    },
  });
  return {...m, todas, cargas};
}

/** Base completa (modo 'off'): a referência das comparações. */
function modoOff(){
  const m = carregar();
  m.CACHE._contas = montarContas(m.addMeses, m.today());
  m.CACHE.resetCobertura(true);
  m.COBERTURA.modo = 'off';
  return m;
}

/** Executa como a tela: se faltar dado, a carga acontece e a tela redesenha (nova tentativa). */
function comCarga(m, fn){
  for(let i = 0; i < 10; i++){
    try { return fn(); }
    catch(e){ if(!(e instanceof m.DadosIncompletos)) throw e; }
  }
  throw new Error('a cobertura não fechou depois de 10 cargas');
}

// Arrays da vm são de outro realm: copia para comparar só o conteúdo
const ids = lista => [...lista].map(c => c.id).sort();
const VISOES = ['', 'Leo', 'Pri', 'Leo & Pri'];

// ── 1. EQUIVALÊNCIA ──
test('atrasadas: janela + em aberto antigas = base completa, em toda visão', () => {
  for(const resp of VISOES){
    const on = modoOn(), off = modoOff();
    assert.deepEqual(ids(comCarga(on, () => on.CACHE.getOverdue(resp))), ids(off.CACHE.getOverdue(resp)), `visão "${resp}"`);
  }
});

test('atrasadas de meses anteriores (todos os meses do ano) batem com a base completa', () => {
  for(const resp of VISOES) for(let mes = 0; mes < 12; mes++){
    const on = modoOn(), off = modoOff();
    assert.deepEqual(ids(comCarga(on, () => on.CACHE.getOverdueAntesDe(ANO, mes, resp))),
      ids(off.CACHE.getOverdueAntesDe(ANO, mes, resp)), `visão "${resp}", mês ${mes}`);
  }
});

test('contas por ano e por mês batem com a base completa, inclusive anos fora da janela', () => {
  for(const resp of VISOES) for(const ano of [ANO-3, ANO-2, ANO-1, ANO, ANO+1, 2040]){
    const on = modoOn(), off = modoOff();
    assert.deepEqual(ids(comCarga(on, () => on.CACHE.contasDoAno(ano, resp))), ids(off.CACHE.contasDoAno(ano, resp)), `${ano} "${resp}"`);
    assert.deepEqual(ids(comCarga(on, () => on.CACHE.getByAnoMes(String(ano), '0', resp))), ids(off.CACHE.getByAnoMes(String(ano), '0', resp)));
  }
});

test('"Todos os anos" e anos com dados batem com a base completa', () => {
  for(const resp of VISOES){
    const on = modoOn(), off = modoOff();
    assert.deepEqual(ids(comCarga(on, () => on.CACHE.getByAnoMes('todos', 'todos', resp))), ids(off.CACHE.getByAnoMes('todos', 'todos', resp)));
  }
  const on = modoOn(), off = modoOff();
  assert.deepEqual([...comCarga(on, () => on.CACHE.anosComDados())], [...off.CACHE.anosComDados()]);
});

test('parcelamento que cruza a janela vem inteiro (nenhuma parcela fica fora das operações)', () => {
  const on = modoOn(), off = modoOff();
  const parcs = comCarga(on, () => on.CACHE.getByGrupo('grp-24'));
  assert.equal(parcs.length, 24);
  assert.deepEqual(ids(parcs), ids(off.CACHE.getByGrupo('grp-24')));
  assert.ok(on.cargas.some(f => f.grupo === 'grp-24'), 'leu o grupo sob demanda');
});

test('pendentes de aprovação fora da janela aparecem para o admin', () => {
  const on = modoOn(), off = modoOff();
  assert.deepEqual(ids(on.CACHE.pendentesAprovacao()), ids(off.CACHE.pendentesAprovacao()));
  assert.equal(on.cargas.length, 0, 'já vêm na abertura');
});

test('intervalo de dias (próximos vencimentos, mês anterior) bate com a base completa', () => {
  for(const resp of VISOES){
    const on = modoOn(), off = modoOff();
    const ini = on.addMeses(on.today(), -1), fim = on.addMeses(on.today(), 1);
    assert.deepEqual(ids(comCarga(on, () => on.CACHE.contasEntre(ini, fim, resp))), ids(off.CACHE.contasEntre(ini, fim, resp)));
    const dez = `${ANO-1}-12-01`, dezFim = `${ANO-1}-12-31`;
    assert.deepEqual(ids(comCarga(on, () => on.CACHE.contasEntre(dez, dezFim, resp))), ids(off.CACHE.contasEntre(dez, dezFim, resp)));
  }
});

test('visão filtrada por pessoa (filtrarPorResp) dá os mesmos valores', () => {
  for(const resp of ['Leo', 'Pri']){
    const on = modoOn(), off = modoOff();
    const val = l => l.map(c => `${c.id}:${c.vPagar}:${c.vPago}`).sort();
    assert.deepEqual(val(on.filtrarPorResp(comCarga(on, () => on.CACHE.contasDoAno(ANO, resp)), resp)),
      val(off.filtrarPorResp(off.CACHE.contasDoAno(ANO, resp), resp)));
  }
});

// ── 2. CONTRATO ──
test('abertura do modo on cobre a visão do usuário no ano vigente sem carga extra', () => {
  const on = modoOn('Leo');
  on.CACHE.contasDoAno(ANO, 'Leo');
  on.CACHE.getOverdue('Leo');
  on.CACHE.getOverdueAntesDe(ANO, new Date().getMonth(), 'Leo');
  assert.equal(on.cargas.length, 0);
});

test('fora da cobertura: on lança DadosIncompletos e pede a carga; depois não pede de novo', () => {
  const on = modoOn('Leo');
  assert.throws(() => on.CACHE.contasDoAno(ANO, ''), e => e instanceof on.DadosIncompletos);
  assert.deepEqual([...on.cargas.at(-1).resps].sort(), ['Leo', 'Leo & Pri', 'Pri']);
  on.CACHE.contasDoAno(ANO, '');
  assert.throws(() => on.CACHE.contasDoAno(ANO - 1, 'Leo'), e => e instanceof on.DadosIncompletos);
  assert.throws(() => on.CACHE.contas, e => e instanceof on.DadosIncompletos, 'acesso legado exige tudo');
});

test('sombra registra a falta sem interromper e simula a carga; off nunca falta', () => {
  const s = modoOff();
  s.CACHE.resetCobertura(false);
  s.CACHE.marcarCoberto({ini: `${ANO}-01-01`, fim: `${ANO}-12-31`, resps: ['Leo', 'Leo & Pri']});
  s.CACHE.marcarCoberto({abertasAntes: `${ANO}-01-01`});
  s.COBERTURA.modo = 'sombra';
  assert.ok(s.CACHE.contasDoAno(ANO - 1, 'Leo').length > 0);
  assert.equal(s.COBERTURA.faltas.size, 1);
  s.CACHE.contasDoAno(ANO - 1, 'Leo');
  assert.equal([...s.COBERTURA.faltas.values()][0].vezes, 1, 'carga simulada: não falta de novo');
  const off = modoOff();
  off.CACHE.contas; off.CACHE.getOverdue(''); off.CACHE.getByGrupo('grp-24');
  assert.equal(off.COBERTURA.faltas.size, 0);
});

test('faixas contíguas se somam; lacuna não cobre', () => {
  const m = carregar();
  m.CACHE.resetCobertura(false);
  m.CACHE.marcarCoberto({ini: '2026-01-01', fim: '2026-12-31', resps: ['Leo']});
  m.CACHE.marcarCoberto({ini: '2027-01-01', fim: '2027-06-30', resps: ['Leo']});
  assert.ok(m.CACHE.cobre('2026-12-01', '2027-01-31', ['Leo']));
  assert.ok(!m.CACHE.cobre('2026-12-01', '2027-07-01', ['Leo']));
  assert.ok(!m.CACHE.cobre('2026-12-01', '2027-01-31', ['Leo', 'Pri']));
  m.CACHE.marcarCoberto({ini: '2027-08-01', fim: '2027-12-31', resps: ['Leo']});
  assert.ok(!m.CACHE.cobre('2027-06-01', '2027-09-01', ['Leo']), 'julho de 2027 falta');
});

// ── 3. DIAGNÓSTICO E emAberto ──
test('emAberto: compartilhada com uma parte paga continua em aberto', () => {
  const m = carregar();
  assert.equal(m.contaEmAberto({resp: 'Leo & Pri', vPago: 50, pagamentos: {Leo: {valor: 50}}}), true);
  assert.equal(m.contaEmAberto({resp: 'Leo & Pri', vPago: 100, pagamentos: {Leo: {valor: 50}, Pri: {valor: 50}}}), false);
  assert.equal(m.contaEmAberto({resp: 'Leo', vPago: null}), true);
  assert.equal(m.contaEmAberto({resp: 'Leo', vPago: 10}), false);
});

test('diagnóstico aponta conta em aberto antiga sem emAberto, data e responsável inválidos', () => {
  const m = carregar();
  const contas = montarContas(m.addMeses, m.today());
  const antiga = contas.find(c => c.data === `${ANO-3}-06-01`);
  delete antiga.emAberto;
  contas.push({id: 'x1', resp: 'Ambos', data: `${ANO}-02-02`, vPagar: 1, vPago: null, emAberto: true});
  contas.push({id: 'x2', resp: 'Leo', data: '02/03/2026', vPagar: 1, vPago: null, emAberto: true});
  const d = m.COBERTURA.diagnostico(contas, {ini: `${ANO}-01-01`, fim: `${ANO}-12-31`, usuario: 'Leo', admin: true});
  assert.deepEqual([...d.abertasPerdidas], [antiga.id]);
  assert.ok(d.emAbertoDivergente.includes(antiga.id));
  assert.deepEqual([...d.respInvalido], ['x1']);
  assert.deepEqual([...d.dataInvalida], ['x2']);
  assert.ok(d.unicas < d.total, 'a abertura lê menos que a coleção inteira');
});

// ── 4. ESTÁTICO ──
test('CACHE._contas só é tocado por fin-cache.js e fin-db.js', () => {
  const arquivos = [path.join(RAIZ, 'app.js'), ...fs.readdirSync(path.join(RAIZ, 'js')).map(f => path.join(RAIZ, 'js', f))];
  const fora = arquivos.filter(f => f.endsWith('.js') && !/fin-cache\.js$|fin-db\.js$/.test(f))
    .filter(f => /\b_contas\b/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(fora, []);
});

test('CACHE.contas (acesso legado, carrega tudo) só onde a tela precisa de todas as contas', () => {
  // EAC compara a linha de base com todas as contas; recorrentes está desligado (README 8.7)
  const permitidos = ['eac.js', 'eac-gestao.js', 'recorrentes.js'];
  const arquivos = [path.join(RAIZ, 'app.js'), ...fs.readdirSync(path.join(RAIZ, 'js')).map(f => path.join(RAIZ, 'js', f))];
  const fora = arquivos.filter(f => f.endsWith('.js') && !permitidos.includes(path.basename(f)) && !/fin-cache\.js$/.test(f))
    .filter(f => /CACHE\.contas\b(?!Entre|DoAno|Todas|Carregadas)/.test(fs.readFileSync(f, 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')));
  assert.deepEqual(fora.map(f => path.basename(f)), []);
});
