"use strict";

Object.assign(APP, {

  _cfgTabAtual: 'usuarios',
  _cfgUsuarios: [], // carregados do Firestore

  // ── RENDER PRINCIPAL ──
  async renderConfig(){
    if(STATE.usuario!=='Leo') return;
    this.cfgTab(this._cfgTabAtual);
    await this.cfgCarregarUsuarios();
    this.cfgAtualizarStats();
    this.cfgCarregarPrefs();
    this.cfgCarregarTabelasDisplay();
  },

  cfgTab(tab){
    this._cfgTabAtual = tab;
    document.querySelectorAll('.cfg-tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
    document.querySelectorAll('.cfg-panel').forEach(p=>p.classList.toggle('active', p.id===`cfgPanel-${tab}`));
    if(tab==='log') this.cfgCarregarLog();
    if(tab==='acesso') this.cfgCarregarLogAcesso();
    if(tab==='lixeira') this.lixeiraCarregar();
  },

  // ── USUÁRIOS ──
  async cfgCarregarUsuarios(){
    const el = document.getElementById('cfgListaUsuarios');
    if(!el) return;

    // Buscar usuários da coleção config/usuarios (se existir)
    let extras = [];
    try{
      const snap = await fbDb.collection('config').doc('usuarios').get();
      if(snap.exists) extras = snap.data().lista || [];
    }catch(e){}

    // Lista base: Leo e Pri (fixos no sistema)
    const base = [
      {nome:'Leonardo Gomes', email:'leonardo.phn7@gmail.com', role:'admin'},
      {nome:'Priscila Alverim', email:'pri.alverim@gmail.com', role:'user'},
    ];

    // Mesclar com extras do Firestore
    const todos = [...base, ...extras.filter(e=>!base.some(b=>b.email===e.email))];
    this._cfgUsuarios = todos;

    el.innerHTML = todos.map(u=>`
      <div class="cfg-user-item">
        <div class="info">
          <div class="nome">${u.nome} ${u.role==='admin'?'👑':''}</div>
          <div class="email">${u.email}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="role ${u.role==='admin'?'role-admin':'role-user'}">${u.role==='admin'?'Admin':'Usuário'}</span>
          ${!['leonardo.phn7@gmail.com','pri.alverim@gmail.com'].includes(u.email)
            ? `<button class="action-btn del" onclick="APP.cfgRemoverUsuario('${u.email}')" title="Remover">✕</button>`
            : `<span style="font-size:11px;color:var(--t4)">Fixo</span>`}
        </div>
      </div>`).join('');
  },

  async cfgAdicionarUsuario(){
    const nome  = document.getElementById('cfgNovoNome').value.trim();
    const email = document.getElementById('cfgNovoEmail').value.trim().toLowerCase();
    if(!nome)  return this.toast('Informe o nome','error');
    if(!email||!email.includes('@')) return this.toast('E-mail inválido','error');
    if(this._cfgUsuarios.some(u=>u.email===email)) return this.toast('E-mail já cadastrado','error');

    const snap = await fbDb.collection('config').doc('usuarios').get();
    const lista = snap.exists ? (snap.data().lista||[]) : [];
    lista.push({nome, email, role:'user', adicionadoPor:STATE.usuario, em:new Date().toISOString()});
    await fbDb.collection('config').doc('usuarios').set({lista});

    document.getElementById('cfgNovoNome').value='';
    document.getElementById('cfgNovoEmail').value='';
    await this.cfgCarregarUsuarios();
    this.toast(`${nome} adicionado ✅. Lembre de atualizar as regras do Firestore para liberar o acesso completo.`,'success');
  },

  async cfgRemoverUsuario(email){
    if(!confirm(`Remover ${email} do sistema?`)) return;
    const snap = await fbDb.collection('config').doc('usuarios').get();
    if(!snap.exists) return;
    const lista = (snap.data().lista||[]).filter(u=>u.email!==email);
    await fbDb.collection('config').doc('usuarios').set({lista});
    await this.cfgCarregarUsuarios();
    this.toast('Usuário removido','success');
  },

  // ── BACKUP (chama as funções já existentes) ──
  async cfgAtualizarStats(){
    const el1=document.getElementById('cfgBkContas');
    const el2=document.getElementById('cfgBkSalarios');
    const el3=document.getElementById('cfgBkCats');
    const el4=document.getElementById('cfgBkImps');
    if(el1) el1.textContent = CACHE.contas.length;
    if(el2) el2.textContent = CACHE.salarios.length;
    if(el3) el3.textContent = CACHE.getAllCats().length;
    if(el4){
      fbDb.collection('importacoes').get().then(s=>{ if(el4) el4.textContent=s.size; });
    }
    // Sincronizar log de backup com a página de config
    this._syncBackupLog();
  },

  _syncBackupLog(){
    const el = document.getElementById('cfgBackupLog');
    if(!el) return;
    if(!this._backupLog||!this._backupLog.length){
      el.innerHTML='<span style="color:var(--t4);font-size:12.5px">Nenhum backup realizado nesta sessão.</span>';
      return;
    }
    el.innerHTML=this._backupLog.map(l=>`
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:18px">${l.tipo==='json'?'📄':'📊'}</span>
        <div><div style="font-weight:600;font-size:12.5px">${l.arquivo}</div>
        <div style="font-size:11px;color:var(--t4)">${l.data} às ${l.hora} · ${l.registros} registros</div></div>
        <span class="badge bg-pago" style="margin-left:auto">✅</span>
      </div>`).join('');
  },

  async cfgBackupJSON(){
    const btn=document.getElementById('cfgBtnJSON');
    if(btn){ btn.disabled=true; btn.textContent='⏳ Exportando...'; }
    await this.backupJSON();
    this._syncBackupLog();
    if(btn){ btn.disabled=false; btn.textContent='⬇ Exportar JSON'; }
  },

  async cfgBackupExcel(){
    const btn=document.getElementById('cfgBtnExcel');
    if(btn){ btn.disabled=true; btn.textContent='⏳ Exportando...'; }
    await this.backupExcel();
    this._syncBackupLog();
    if(btn){ btn.disabled=false; btn.textContent='⬇ Exportar Excel'; }
  },

  async cfgBackupAmbos(){
    await this.cfgBackupJSON();
    await this.cfgBackupExcel();
  },

  // ── TABELAS FISCAIS (chama openTabelas existente, mas exibe inline) ──
  cfgCarregarTabelasDisplay(){
    const el = document.getElementById('cfgTabelasContent');
    if(!el) return;
    const tab = CACHE.tabelas;
    if(!tab){ el.innerHTML='<p style="color:var(--t4)">Tabelas não carregadas.</p>'; return; }
    el.innerHTML=`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--palm);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">TABELA IR</div>
          <textarea id="cfgEditorIR" rows="7" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--r-sm);font-family:monospace;font-size:10.5px;outline:none;resize:vertical;background:var(--bg);color:var(--t1)">${JSON.stringify(tab.ir||[],null,2)}</textarea>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--palm);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">TABELA INSS</div>
          <textarea id="cfgEditorINSS" rows="7" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--r-sm);font-family:monospace;font-size:10.5px;outline:none;resize:vertical;background:var(--bg);color:var(--t1)">${JSON.stringify(tab.inss||[],null,2)}</textarea>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
        <div class="fg"><label>Dedução por dependente (R$)</label><input type="text" inputmode="numeric" id="cfgEdDedDep" class="money-input" value="${maskMoney(floatToCentsStr(tab.dedDep||189.59))}" style="background:var(--bg);color:var(--t1)"></div>
        <div class="fg"><label>Teto INSS (R$)</label><input type="text" inputmode="numeric" id="cfgEdTetoINSS" class="money-input" value="${maskMoney(floatToCentsStr(tab.tetoINSS||908.86))}" style="background:var(--bg);color:var(--t1)"></div>
        <div class="fg"><label>Vigência</label><input type="text" id="cfgVigencia" value="${tab.vigencia||''}" placeholder="Ex: Jan/2024" style="background:var(--bg);color:var(--t1)"></div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="APP.buscarTabelasOnline()">🌐 Buscar online</button>
        <button class="btn btn-primary" onclick="APP.salvarTabelasConfig()">💾 Salvar Tabelas</button>
      </div>`;
    document.getElementById('cfgBtnSalvarTabelas').style.display='none';
    bindAllMoneyInputs(el);
  },

  async salvarTabelasConfig(){
    // Tenta ler dos editores inline da Config, senão usa os do modal original
    const irEl     = document.getElementById('cfgEditorIR')  || document.getElementById('editorIR');
    const inssEl   = document.getElementById('cfgEditorINSS')|| document.getElementById('editorINSS');
    const dedEl    = document.getElementById('cfgEdDedDep')  || document.getElementById('edDedDep');
    const tetoEl   = document.getElementById('cfgEdTetoINSS')|| document.getElementById('edTetoINSS');
    const vigEl    = document.getElementById('cfgVigencia')  || document.getElementById('vigencia');
    try{
      const ir      = JSON.parse(irEl.value);
      const inss    = JSON.parse(inssEl.value);
      const dedDep  = parseMoney(dedEl.value)||189.59;
      const tetoINSS= parseMoney(tetoEl.value)||908.86;
      const vigencia= vigEl.value;
      await FS.saveTabelas({ir,inss,dedDep,tetoINSS,vigencia});
      // Fechar modal se estiver aberto
      APP.closeModal('ovTabelas');
      this.toast('Tabelas fiscais atualizadas ✅','success');
      setTimeout(()=>this.cfgCarregarTabelasDisplay(), 1000);
    }catch(e){ this.toast('JSON inválido: '+e.message,'error'); }
  },

  // ── LOG DE ATIVIDADES ──
  cfgLimparFiltrosLog(){
    ['logDataIni','logDataFim','logResp','logEvento'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.value='';
    });
    this.cfgCarregarLog();
  },

  async cfgCarregarLog(){
    const tbody   = document.getElementById('cfgLogBody');
    const counter = document.getElementById('logContador');
    if(!tbody) return;
    tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--t4)">⏳ Carregando...</td></tr>`;

    // Ler filtros
    const dataIni  = document.getElementById('logDataIni')?.value  || '';
    const dataFim  = document.getElementById('logDataFim')?.value  || '';
    const respFilt = document.getElementById('logResp')?.value     || '';
    const evFilt   = document.getElementById('logEvento')?.value   || '';

    // ── Busca: sem filtros de período = limite 50 / com período = busca tudo
    // Filtros de evento e usuário são sempre feitos em JS para evitar índices compostos
    const temPeriodo = dataIni || dataFim;
    const snap = await fbDb.collection('logs')
      .orderBy('timestamp','desc')
      .limit(temPeriodo ? 10000 : 500) // com período busca tudo; sem período busca 500 para filtrar depois
      .get()
      .catch(()=>null);

    if(!snap){
      tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--red)">
        ⚠️ Erro ao carregar. Verifique se o índice existe no Firestore:<br>
        <code style="font-size:11px;background:var(--bg);padding:2px 8px;border-radius:4px;margin-top:6px;display:inline-block">
          Coleção: logs · Campo: timestamp · Ordem: Descending
        </code>
      </td></tr>`;
      return;
    }

    let registros = snap.docs.map(d=>({_id:d.id,...d.data()}));

    // ── Todos os filtros em JavaScript ── sem índices compostos necessários

    // Filtro de usuário/responsável
    if(respFilt){
      registros = registros.filter(r=>r.usuario===respFilt);
    }

    // Filtro de tipo de evento
    if(evFilt){
      registros = registros.filter(r=>r.evento===evFilt);
    }

    // Filtro de período (timestamp é Firestore Timestamp)
    if(dataIni){
      const ini = new Date(dataIni+'T00:00:00');
      registros = registros.filter(r=>{
        const t = r.timestamp?.toDate?.();
        return t && t >= ini;
      });
    }
    if(dataFim){
      const fim = new Date(dataFim+'T23:59:59');
      registros = registros.filter(r=>{
        const t = r.timestamp?.toDate?.();
        return t && t <= fim;
      });
    }

    // Limitar a 50 somente quando não há filtro de período
    const total = registros.length;
    if(!temPeriodo) registros = registros.slice(0,50);

    const mostrando = registros.length;
    if(counter){
      if(temPeriodo){
        counter.textContent = `${mostrando} registro${mostrando!==1?'s':''} no período`;
      } else {
        counter.textContent = `${mostrando} registro${mostrando!==1?'s':''} encontrado${mostrando!==1?'s':''}${total>50?' (últimos 50)':''}`;
      }
    }

    if(!registros.length){
      tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--t4)">Nenhum registro encontrado para os filtros aplicados</td></tr>`;
      return;
    }

    // Ícones e cores por tipo de evento
    const EVT = {
      cadastro:          {icon:'➕', label:'Cadastro',          cor:'var(--blue)'},
      edicao:            {icon:'✏️', label:'Edição',            cor:'var(--orange)'},
      pagamento:         {icon:'✅', label:'Pagamento',         cor:'var(--green)'},
      desfazer_pagamento:{icon:'↩',  label:'Desfazer pgto.',   cor:'var(--yellow)'},
      exclusao:          {icon:'🗑', label:'Exclusão',          cor:'var(--red)'},
      restauracao:       {icon:'↺',  label:'Restauração',      cor:'var(--palm)'},
    };

    tbody.innerHTML = registros.map(r=>{
      const ev  = EVT[r.evento] || {icon:'•', label:r.evento, cor:'var(--t3)'};
      const ts  = r.timestamp?.toDate?.();
      const dt  = ts ? ts.toLocaleDateString('pt-BR') : '—';
      const hr  = ts ? ts.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
      const val = r.valor!=null ? fmt(r.valor) : '—';
      const valCor = ['pagamento','cadastro'].includes(r.evento) ? 'var(--green)'
                   : r.evento==='exclusao' ? 'var(--red)' : 'var(--t2)';

      return`<tr>
        <td style="font-size:11px;color:var(--t4);white-space:nowrap">${dt}<br><span style="color:var(--t4)">${hr}</span></td>
        <td style="white-space:nowrap"><span style="color:${ev.cor};font-weight:600">${ev.icon} ${ev.label}</span></td>
        <td style="max-width:200px;white-space:normal;font-weight:500">${r.conta||'—'}</td>
        <td style="max-width:280px;white-space:normal;font-size:11.5px;color:var(--t3)">${r.detalhes||'—'}</td>
        <td><span class="audit-chip">${r.usuario||'—'}</span></td>
        <td style="font-weight:600;color:${valCor};white-space:nowrap">${val}</td>
      </tr>`;
    }).join('');
  },

  // ── LOG DE ACESSO ──
  cfgLimparFiltrosLogAcesso(){
    ['logAcessoDataIni','logAcessoDataFim','logAcessoResp'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.value='';
    });
    this.cfgCarregarLogAcesso();
  },

  async cfgCarregarLogAcesso(){
    const tbody   = document.getElementById('cfgLogAcessoBody');
    const counter = document.getElementById('logAcessoContador');
    if(!tbody) return;
    tbody.innerHTML=`<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--t4)">⏳ Carregando...</td></tr>`;

    const dataIni  = document.getElementById('logAcessoDataIni')?.value  || '';
    const dataFim  = document.getElementById('logAcessoDataFim')?.value  || '';
    const respFilt = document.getElementById('logAcessoResp')?.value     || '';

    const temPeriodo = dataIni || dataFim;
    const snap = await fbDb.collection('logs_acesso')
      .orderBy('timestamp','desc')
      .limit(temPeriodo ? 10000 : 50)
      .get()
      .catch(()=>null);

    if(!snap){
      tbody.innerHTML=`<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--red)">
        ⚠️ Erro ao carregar. Verifique se o índice existe no Firestore:<br>
        <code style="font-size:11px;background:var(--bg);padding:2px 8px;border-radius:4px;margin-top:6px;display:inline-block">
          Coleção: logs_acesso · Campo: timestamp · Ordem: Descending
        </code>
      </td></tr>`;
      return;
    }

    let registros = snap.docs.map(d=>({_id:d.id,...d.data()}));

    if(respFilt){
      registros = registros.filter(r=>r.usuario===respFilt);
    }
    if(dataIni){
      const ini = new Date(dataIni+'T00:00:00');
      registros = registros.filter(r=>{
        const t = r.timestamp?.toDate?.();
        return t && t >= ini;
      });
    }
    if(dataFim){
      const fim = new Date(dataFim+'T23:59:59');
      registros = registros.filter(r=>{
        const t = r.timestamp?.toDate?.();
        return t && t <= fim;
      });
    }

    const total = registros.length;
    if(!temPeriodo) registros = registros.slice(0,50);

    const mostrando = registros.length;
    if(counter){
      if(temPeriodo){
        counter.textContent = `${mostrando} acesso${mostrando!==1?'s':''} no período`;
      } else {
        counter.textContent = `Últimos ${mostrando} acesso${mostrando!==1?'s':''}${total>50?' (de '+total+')':''}`;
      }
    }

    if(!registros.length){
      tbody.innerHTML=`<tr><td colspan="4" style="text-align:center;padding:28px;color:var(--t4)">Nenhum registro de acesso encontrado</td></tr>`;
      return;
    }

    tbody.innerHTML = registros.map(r=>{
      const ts = r.timestamp?.toDate?.();
      const dt = ts ? ts.toLocaleDateString('pt-BR') : '—';
      const hr = ts ? ts.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
      const ua = r.userAgent || '—';
      const disp = /Mobile|Android|iPhone|iPad/i.test(ua) ? '📱 Mobile' : '💻 Desktop';

      return`<tr>
        <td style="font-size:11px;color:var(--t4);white-space:nowrap">${dt}<br><span style="color:var(--t4)">${hr}</span></td>
        <td><span class="audit-chip">${r.usuario||'—'}</span></td>
        <td style="font-size:12px;color:var(--t3)">${r.email||'—'}</td>
        <td style="font-size:11.5px;color:var(--t3)">${disp}</td>
      </tr>`;
    }).join('');
  },

  // ── PREFERÊNCIAS ──
  cfgCarregarPrefs(){
    const prefs = JSON.parse(localStorage.getItem('dt_prefs')||'{}');
    const pgSz    = document.getElementById('cfgPgSz');
    const parcPad = document.getElementById('cfgParcelaPadrao');
    const alertD  = document.getElementById('cfgAlertaDias');
    const tema    = document.getElementById('cfgTema');
    if(pgSz    && prefs.pgSz)         pgSz.value    = prefs.pgSz;
    if(parcPad && prefs.parcPadrao)   parcPad.value = prefs.parcPadrao;
    if(alertD  && prefs.alertaDias!=null) alertD.value = prefs.alertaDias;
    if(tema)                           tema.value    = STATE.darkMode?'dark':'light';
    const moeda = document.getElementById('cfgMoeda');
    if(moeda && prefs.moeda)           moeda.value   = prefs.moeda;
  },

  cfgSalvarPrefs(){
    const pgSz    = parseInt(document.getElementById('cfgPgSz')?.value)||20;
    const parcPad = parseInt(document.getElementById('cfgParcelaPadrao')?.value)||1;
    const alertD  = parseInt(document.getElementById('cfgAlertaDias')?.value)||5;
    const moeda   = document.getElementById('cfgMoeda')?.value||'BRL';
    const prefs   = {pgSz, parcPadrao:parcPad, alertaDias:alertD, moeda};
    localStorage.setItem('dt_prefs', JSON.stringify(prefs));
    STATE.pgSz = pgSz;
    this.toast('Preferências salvas ✅','success');
  },

  cfgAplicarTema(valor){
    STATE.darkMode = valor==='dark';
    document.documentElement.classList.toggle('dark', STATE.darkMode);
    localStorage.setItem('dt_dark', STATE.darkMode?'1':'0');
    this.cfgSalvarPrefs();
  },

  cfgAplicarMoeda(valor){
    moneySetCurrency(valor);
    this.cfgSalvarPrefs();
    this.toast(`Moeda alterada para ${MONEY_CFG.simbolo} (${valor})`,'success');
  },

  // Carregar preferências salvas na inicialização
  carregarPrefsInicio(){
    const prefs = JSON.parse(localStorage.getItem('dt_prefs')||'{}');
    if(prefs.pgSz) STATE.pgSz = parseInt(prefs.pgSz);
    if(prefs.moeda) moneySetCurrency(prefs.moeda);
  },
});

APP.carregarPrefsInicio();
