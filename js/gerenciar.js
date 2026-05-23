"use strict";

Object.assign(APP, {
  // ── GERENCIAR CATS / FORMAS ──
  openGerenciar(tipo){
    STATE.gerenciarTipo=tipo;
    document.getElementById('titleGerenciar').textContent=tipo==='cat'?'Gerenciar Categorias':'Gerenciar Formas de Pagamento';
    document.getElementById('gNovoNome').value='';
    this.renderGerenciarLista();
    document.getElementById('ovGerenciar').classList.add('open');
    setTimeout(()=>document.getElementById('gNovoNome').focus(),100);
  },

  renderGerenciarLista(){
    const tipo=STATE.gerenciarTipo;
    const itens=tipo==='cat'?CACHE.getAllCats():CACHE.getAllFormas();
    document.getElementById('gerenciarLista').innerHTML=itens.length===0
      ?'<div style="padding:20px;text-align:center;color:var(--t4);font-size:13px">Nenhum item cadastrado</div>'
      :itens.map(item=>`<div id="gitem-${item.id}" style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border)"><span class="badge bg-cat" style="font-size:10px;flex-shrink:0">${tipo==='cat'?'CAT':'PGTO'}</span><span id="gnome-${item.id}" style="flex:1;font-size:13px;color:var(--t1)">${item.nome}</span><input id="gedit-${item.id}" type="text" value="${item.nome}" style="display:none;flex:1;padding:5px 9px;border:1px solid var(--palm);border-radius:5px;font-size:12.5px;outline:none;font-family:var(--font-b)" onkeydown="if(event.key==='Enter')APP.gerenciarSalvar('${item.id}');if(event.key==='Escape')APP.gerenciarCancelarEdit('${item.id}')"><div id="gbtn-view-${item.id}" style="display:flex;gap:5px"><button class="action-btn edit" onclick="APP.gerenciarEditar('${item.id}')">✏</button><button class="action-btn del" onclick="APP.gerenciarExcluir('${item.id}')">✕</button></div><div id="gbtn-edit-${item.id}" style="display:none;gap:5px"><button class="btn btn-primary btn-sm" onclick="APP.gerenciarSalvar('${item.id}')">✓ Salvar</button><button class="btn btn-ghost btn-sm" onclick="APP.gerenciarCancelarEdit('${item.id}')">Cancelar</button></div></div>`).join('');
  },

  async gerenciarAdicionar(){
    const nome=document.getElementById('gNovoNome').value.trim();if(!nome)return this.toast('Digite um nome','error');
    const tipo=STATE.gerenciarTipo;
    const itens=tipo==='cat'?CACHE.getAllCats():CACHE.getAllFormas();
    if(itens.some(x=>x.nome.toLowerCase()===nome.toLowerCase()))return this.toast('Nome já existe','error');
    tipo==='cat'?await FS.addCat(nome):await FS.addForma(nome);
    document.getElementById('gNovoNome').value='';
    this.toast(`"${nome}" adicionado ✅`,'success');
  },

  gerenciarEditar(id){
    document.getElementById(`gnome-${id}`).style.display='none';document.getElementById(`gbtn-view-${id}`).style.display='none';
    document.getElementById(`gedit-${id}`).style.display='block';document.getElementById(`gbtn-edit-${id}`).style.display='flex';
    document.getElementById(`gedit-${id}`).focus();document.getElementById(`gedit-${id}`).select();
  },

  gerenciarCancelarEdit(id){
    const tipo=STATE.gerenciarTipo;const item=(tipo==='cat'?CACHE.getAllCats():CACHE.getAllFormas()).find(x=>x.id===id);
    if(item)document.getElementById(`gedit-${id}`).value=item.nome;
    document.getElementById(`gnome-${id}`).style.display='';document.getElementById(`gbtn-view-${id}`).style.display='flex';
    document.getElementById(`gedit-${id}`).style.display='none';document.getElementById(`gbtn-edit-${id}`).style.display='none';
  },

  async gerenciarSalvar(id){
    const novoNome=document.getElementById(`gedit-${id}`)?.value.trim();if(!novoNome)return this.toast('Nome não pode ser vazio','error');
    const tipo=STATE.gerenciarTipo;
    tipo==='cat'?await FS.updateCat(id,novoNome):await FS.updateForma(id,novoNome);
    this.toast('Nome atualizado ✅','success');
  },

  async gerenciarExcluir(id){
    const tipo=STATE.gerenciarTipo;const item=(tipo==='cat'?CACHE.getAllCats():CACHE.getAllFormas()).find(x=>x.id===id);if(!item)return;
    const emUso=CACHE.contas.some(c=>tipo==='cat'?c.catId===id:c.formaId===id);
    if(emUso){this.toast(`❌ "${item.nome}" está em uso e não pode ser excluída.`,'error');return;}
    if(!confirm(`Excluir "${item.nome}"?`))return;
    tipo==='cat'?await FS.deleteCat(id):await FS.deleteForma(id);
    this.toast(`"${item.nome}" excluído`,'success');
  }

});

