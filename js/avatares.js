/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUETTO FINANCEIRO, MÓDULO avatares.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidade: foto de perfil de cada usuário.
 *
 *   • Foto exibida: a enviada pelo usuário (avatares/{usuario}, data URL JPEG)
 *     ou, sem ela, a padrão do repositório (AVATAR_PADRAO, pasta img/).
 *     Se nenhuma carregar, fica a inicial na cor de identidade.
 *   • Onde aparece: todo elemento com data-avatar="Leo|Pri" (avatar do trilho,
 *     filtro de responsável do topbar e botão de perfil do celular).
 *   • "Meu perfil" (ovPerfil): recorte quadrado com foco no rosto. Arrastar move,
 *     roda do mouse, pinça e slider dão zoom, toque centraliza e aproxima.
 *     Com o FaceDetector nativo do navegador (alguns Chrome), a foto nova já abre
 *     centrada no rosto; sem ele, abre no terço de cima (onde o rosto costuma estar).
 *     Salva um JPEG de AVATAR_LADO px. O canvas não copia metadados: EXIF e GPS
 *     da foto original não vão para o banco.
 *   • Cada usuário altera só a própria foto (FS.salvarAvatar / FS.removerAvatar).
 *
 * DEPENDÊNCIAS:
 *   fin-state.js: STATE, AVATAR_PADRAO, AVATAR_LADO, AVATAR_MAX_CHARS
 *   fin-cache.js: CACHE.avatares · fin-db.js: FS · security.js: SEC
 *   ui-modals.js: ligarFecharNoFundo, APP.closeModal · ui-toast.js: APP.toast
 *
 * EXPORTS (em APP): iniciarAvatares, aplicarAvatares, avatarUrl, abrirPerfil,
 *   fecharPerfil, perfilArquivo, perfilZoomSlider, perfilZoomPasso, perfilSalvar,
 *   perfilUsarPadrao
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";

const AV_FONTE_MAX   = 3072;              // lado maior da cópia de trabalho (canvas do iOS vai até 16,7 MP)
const AV_RECORTE_MIN = 160;               // menor recorte em px da cópia (zoom máximo; evita ampliar pixels)
const AV_ARQ_MAX     = 25 * 1024 * 1024;  // arquivo maior que isso nem é aberto
const AV_TOQUE_PX    = 6;                 // até quanto o dedo pode andar para ainda ser "toque"
const AV_TOQUE_MS    = 350;

// Resultado do carregamento de cada URL de foto: 'ok' | 'erro' | Promise (carregando)
const AV_CARGA = new Map();

// Estado do editor de "Meu perfil" (null com o modal fechado).
// Recorte em px da cópia de trabalho: centro (cx, cy) e lado L, entre Lmin e Lmax.
let AV_ED = null;

function avCarregar(url){
  if(AV_CARGA.has(url)) return AV_CARGA.get(url);
  const p = new Promise(res=>{
    const img = new Image();
    img.onload  = ()=>{ AV_CARGA.set(url,'ok');   res('ok'); };
    img.onerror = ()=>{ AV_CARGA.set(url,'erro'); res('erro'); };
    img.src = url;
  });
  AV_CARGA.set(url, p);
  return p;
}

/**
 * Recorta o quadrado (sx, sy, L) da fonte em `lado` px. Reduz em etapas de até 2x:
 * reduzir muito de uma vez serrilha no Safari e no Firefox. Fundo branco (JPEG não tem
 * transparência; PNG transparente ficaria preto).
 */
function avRecortar(fonte, sx, sy, L, lado){
  let src = fonte, x = sx, y = sy, l = L;
  while(l > lado * 2){
    const n = Math.ceil(l / 2), c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, x, y, l, l, 0, 0, n, n);
    src = c; x = 0; y = 0; l = n;
  }
  const out = document.createElement('canvas');
  out.width = out.height = lado;
  const g = out.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, lado, lado);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, x, y, l, l, 0, 0, lado, lado);
  return out;
}

const avLimitar = (v, a, b) => Math.min(b, Math.max(a, v));

Object.assign(APP, {

  /** URL da foto do usuário: a enviada, senão a padrão de img/, senão ''. */
  avatarUrl(usuario){
    return CACHE.avatares?.[usuario]?.foto || AVATAR_PADRAO[usuario] || '';
  },

  /** Liga o avatar do trilho e o botão de perfil do celular ao usuário logado (APP.boot). */
  iniciarAvatares(){
    const u = STATE.usuario || '';
    const inicial = (u || '?').charAt(0).toUpperCase();
    const chip = document.getElementById('sbUserChip');
    if(chip){
      chip.textContent = inicial;
      chip.dataset.user = u;          // cor de identidade (css/shell.css)
      chip.dataset.avatar = u;
      chip.title = `${u}: meu perfil e foto`;
      chip.setAttribute('aria-label', `Conectado como ${u}. Abrir meu perfil e trocar a foto`);
    }
    const tb = document.getElementById('tbPerfilAv');
    if(tb){
      tb.textContent = inicial;
      tb.dataset.user = u;
      tb.dataset.avatar = u;
    }
    this.aplicarAvatares();
  },

  /**
   * Pinta a foto em todo [data-avatar]. Só troca a inicial pela foto depois que a imagem
   * carrega: foto quebrada ou sem permissão deixa a inicial, nunca um círculo vazio.
   * Chamado no boot e a cada mudança em avatares/ (listener em fin-db.js).
   */
  aplicarAvatares(){
    document.querySelectorAll('[data-avatar]').forEach(el=>{
      const usuario = el.dataset.avatar, url = this.avatarUrl(usuario);
      const semFoto = () => { el.style.background = ''; el.classList.remove('com-foto'); };
      if(!url){ semFoto(); return; }
      const pinta = r => {
        if(this.avatarUrl(usuario) !== url) return;   // a foto mudou enquanto esta carregava
        if(r === 'ok'){
          el.style.background = `center / cover no-repeat url("${url}")`;
          el.classList.add('com-foto');
        } else semFoto();
      };
      const st = avCarregar(url);
      if(typeof st === 'string') pinta(st); else st.then(pinta);
    });
    if(AV_ED) this._perfilBotoes();
  },

  // ── MEU PERFIL ──

  abrirPerfil(){
    const ov = document.getElementById('ovPerfil');
    const u  = STATE.usuario;
    if(!ov || !u) return;
    this._perfilLigar(ov);
    AV_ED = {usuario:u, fonte:null, w:0, h:0, L:0, Lmin:0, Lmax:0, cx:0, cy:0,
             alterou:false, mexeu:false, salvando:false, ptrs:new Map(), gesto:null, raf:0, carga:0,
             foco:document.activeElement};   // devolve o foco a quem abriu
    document.getElementById('perfilNome').textContent  = u;
    document.getElementById('perfilEmail').textContent = (typeof SEC !== 'undefined' && SEC.getEmail?.()) || '';
    document.getElementById('perfilVazio').textContent = u.charAt(0).toUpperCase();
    document.getElementById('perfilArquivo').value = '';
    ov.classList.add('open');
    ov.querySelector('.modal')?.focus({preventScroll:true});   // Esc fecha (keydown no overlay)
    this._perfilBotoes();
    this._perfilDesenhar();
    const url = this.avatarUrl(u);
    if(!url){ this._perfilDica('Escolha uma foto para o seu perfil.'); return; }
    this._perfilDica('Abrindo a foto atual...');
    const ed = AV_ED, carga = ++ed.carga;
    this._perfilFonte(url)
      .then(fonte=>{
        if(AV_ED !== ed || ed.carga !== carga) return;
        this._perfilUsar(fonte, null, false);
        this._perfilDica('Escolha outra foto ou ajuste o recorte desta.');
      })
      .catch(()=>{ if(AV_ED === ed) this._perfilDica('Não foi possível abrir a foto atual. Escolha uma foto.'); });
  },

  fecharPerfil(){
    const foco = AV_ED?.foco;
    if(AV_ED) cancelAnimationFrame(AV_ED.raf);
    AV_ED = null;
    const inp = document.getElementById('perfilArquivo');
    if(inp) inp.value = '';
    this.closeModal('ovPerfil');
    if(foco?.isConnected && foco.offsetParent) foco.focus({preventScroll:true});
  },

  /** Arquivo escolhido: abre, mostra e tenta achar o rosto. */
  async perfilArquivo(input){
    const f = input.files?.[0];
    input.value = '';   // permite escolher o mesmo arquivo de novo
    const ed = AV_ED;
    if(!f || !ed) return;
    const heic = /\.hei[cf]$/i.test(f.name) || /hei[cf]/i.test(f.type);
    if(f.type && !f.type.startsWith('image/') && !heic){ this.toast('Escolha um arquivo de imagem', 'error'); return; }
    if(f.size > AV_ARQ_MAX){ this.toast('Foto acima de 25 MB: escolha uma menor', 'error'); return; }
    const carga = ++ed.carga;
    this._perfilDica('Abrindo a foto...');
    let fonte;
    try { fonte = await this._perfilFonte(f); }
    catch(err){
      if(AV_ED !== ed || ed.carga !== carga) return;
      this._perfilDica('');
      this.toast(heic
        ? 'Este navegador não abre fotos HEIC. Envie pelo iPhone (a galeria converte) ou exporte como JPG.'
        : 'Não foi possível abrir esta imagem. Use JPG, PNG ou WebP.', 'error');
      return;
    }
    if(AV_ED !== ed || ed.carga !== carga) return;
    ed.mexeu = false;
    this._perfilUsar(fonte, null, true);
    if(!('FaceDetector' in window)){ this._perfilDica(); return; }
    this._perfilDica('Procurando o rosto...');
    const rosto = await this._perfilRosto(fonte);
    if(AV_ED !== ed || ed.carga !== carga) return;
    if(rosto && !ed.mexeu){
      this._perfilUsar(fonte, rosto, true);
      this._perfilDica('Rosto encontrado e centralizado. Ajuste se precisar.');
    } else this._perfilDica();
  },

  perfilZoomSlider(v){
    const ed = AV_ED;
    if(!ed?.fonte) return;
    this._perfilZoom(ed.Lmax * Math.pow(ed.Lmin / ed.Lmax, Number(v) / 1000), null, false);
  },

  perfilZoomPasso(dir){
    const ed = AV_ED;
    if(!ed?.fonte) return;
    this._perfilZoom(dir > 0 ? ed.L / 1.25 : ed.L * 1.25);
  },

  async perfilSalvar(){
    const ed = AV_ED;
    if(!ed?.fonte || !ed.alterou || ed.salvando) return;
    ed.salvando = true;
    this._perfilBotoes();
    try{
      const c = avRecortar(ed.fonte, ed.cx - ed.L / 2, ed.cy - ed.L / 2, ed.L, AVATAR_LADO);
      let foto = c.toDataURL('image/jpeg', 0.85);
      if(foto.length > AVATAR_MAX_CHARS) foto = c.toDataURL('image/jpeg', 0.7);
      await FS.salvarAvatar(ed.usuario, foto);
      AV_CARGA.set(foto, 'ok');
      this.aplicarAvatares();
      this.toast('Foto atualizada');
      if(AV_ED === ed) this.fecharPerfil();
    }catch(err){
      console.error('[perfilSalvar]', err);
      this.toast(this._perfilErro(err), 'error');
      ed.salvando = false;
      if(AV_ED === ed) this._perfilBotoes();
    }
  },

  /** Apaga a foto enviada e volta para a padrão de img/. */
  async perfilUsarPadrao(){
    const ed = AV_ED;
    if(!ed) return;
    const temPadrao = !!AVATAR_PADRAO[ed.usuario];
    if(!confirm(temPadrao ? 'Voltar para a foto padrão? A foto enviada será apagada.' : 'Remover sua foto?')) return;
    try{
      await FS.removerAvatar(ed.usuario);
      this.toast(temPadrao ? 'Foto padrão restaurada' : 'Foto removida');
      if(AV_ED === ed) this.fecharPerfil();
    }catch(err){
      console.error('[perfilUsarPadrao]', err);
      this.toast(this._perfilErro(err), 'error');
    }
  },

  _perfilErro(err){
    if(err?.code === 'permission-denied')
      return 'O banco recusou a foto: falta liberar a coleção "avatares" nas Regras do Firestore (README, seção 15).';
    return 'Não foi possível salvar a foto: ' + (err?.message || err);
  },

  _perfilDica(txt){
    const el = document.getElementById('perfilDica');
    if(el) el.textContent = txt ?? 'Arraste para posicionar. Toque no rosto para centralizar e aproximar.';
  },

  _perfilBotoes(){
    const ed = AV_ED;
    if(!ed) return;
    const salvar = document.getElementById('perfilSalvar');
    if(salvar){
      salvar.disabled    = ed.salvando || !(ed.fonte && ed.alterou);
      salvar.textContent = ed.salvando ? 'Salvando...' : 'Salvar';
    }
    const padrao = document.getElementById('perfilPadrao');
    if(padrao){
      padrao.hidden = !CACHE.avatares?.[ed.usuario]?.foto;
      padrao.textContent = AVATAR_PADRAO[ed.usuario] ? 'Usar foto padrão' : 'Remover foto';
    }
    document.getElementById('perfilVista')?.classList.toggle('tem-fonte', !!ed.fonte);
  },

  /**
   * Abre a imagem (arquivo ou URL) numa cópia de trabalho em canvas, com no máximo
   * AV_FONTE_MAX px no lado maior. O navegador já aplica a orientação do EXIF.
   */
  async _perfilFonte(src){
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    try{
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      const w0 = img.naturalWidth, h0 = img.naturalHeight;
      if(!w0 || !h0) throw new Error('Imagem vazia');
      const k = Math.min(1, AV_FONTE_MAX / Math.max(w0, h0));
      const c = document.createElement('canvas');
      c.width  = Math.max(1, Math.round(w0 * k));
      c.height = Math.max(1, Math.round(h0 * k));
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally {
      if(typeof src !== 'string') URL.revokeObjectURL(url);
    }
  },

  /**
   * Detecção de rosto nativa (FaceDetector, Shape Detection API). Existe só em alguns
   * Chrome; nos demais navegadores devolve null e o usuário ajusta à mão.
   * Retorna o recorte sugerido {x, y, lado} ou null.
   */
  async _perfilRosto(fonte){
    if(!('FaceDetector' in window)) return null;
    try{
      const fd = new window.FaceDetector({fastMode:false, maxDetectedFaces:10});
      const faces = await Promise.race([
        fd.detect(fonte),
        new Promise((_, rej)=>setTimeout(()=>rej(new Error('tempo esgotado')), 4000)),
      ]);
      if(!faces?.length) return null;
      // Maior rosto da foto. A caixa vai da sobrancelha ao queixo: ocupa metade do recorte,
      // com o centro um pouco acima do meio dela para caber o cabelo.
      const b = faces.map(f=>f.boundingBox).sort((p, q)=>q.width * q.height - p.width * p.height)[0];
      return {x:b.x + b.width / 2, y:b.y + b.height * 0.42, lado:Math.max(b.width, b.height) / 0.5};
    }catch(err){
      console.warn('[Avatares] FaceDetector:', err.message);
      return null;
    }
  },

  /**
   * Coloca a fonte no editor. Sem foco: foto quadrada (a atual) aparece inteira; foto nova
   * abre no zoom mínimo, centrada na horizontal e no terço de cima em fotos em pé.
   */
  _perfilUsar(fonte, foco, alterou){
    const ed = AV_ED;
    if(!ed) return;
    ed.fonte = fonte; ed.w = fonte.width; ed.h = fonte.height;
    ed.Lmax = Math.min(ed.w, ed.h);
    ed.Lmin = Math.min(AV_RECORTE_MIN, ed.Lmax / 2);
    if(foco){
      ed.L = foco.lado; ed.cx = foco.x; ed.cy = foco.y;
    } else {
      ed.L = ed.Lmax; ed.cx = ed.w / 2;
      ed.cy = (alterou && ed.h > ed.w * 1.15) ? ed.h * 0.3 : ed.h / 2;
    }
    ed.alterou = alterou;
    this._perfilLimitar();
    this._perfilBotoes();
    this._perfilDesenhar();
  },

  /** Mantém o recorte dentro da foto e o zoom entre o mínimo e o máximo. */
  _perfilLimitar(){
    const ed = AV_ED;
    ed.L  = avLimitar(ed.L, ed.Lmin, ed.Lmax);
    ed.cx = avLimitar(ed.cx, ed.L / 2, ed.w - ed.L / 2);
    ed.cy = avLimitar(ed.cy, ed.L / 2, ed.h - ed.L / 2);
  },

  /**
   * Zoom para o lado L, mantendo parado o ponto (px, py) da área de recorte
   * (null = centro). Marca a foto como alterada.
   */
  _perfilZoom(L, ponto = null, slider = true){
    const ed = AV_ED, V = this._perfilLado();
    if(!ed?.fonte || !V) return;
    const px = ponto ? ponto.x : V / 2, py = ponto ? ponto.y : V / 2;
    const ix = ed.cx + (px - V / 2) * ed.L / V, iy = ed.cy + (py - V / 2) * ed.L / V;
    ed.L  = avLimitar(L, ed.Lmin, ed.Lmax);
    ed.cx = ix - (px - V / 2) * ed.L / V;
    ed.cy = iy - (py - V / 2) * ed.L / V;
    this._perfilMudou(slider);
  },

  _perfilMudou(slider = true){
    const ed = AV_ED;
    ed.alterou = ed.mexeu = true;
    this._perfilLimitar();
    this._perfilBotoes();
    this._perfilDesenhar(slider);
  },

  _perfilLado(){ return document.getElementById('perfilVista')?.clientWidth || 0; },

  /** Desenha o recorte e as prévias no próximo quadro (um desenho por quadro, mesmo arrastando). */
  _perfilDesenhar(slider = true){
    const ed = AV_ED;
    if(!ed) return;
    cancelAnimationFrame(ed.raf);
    ed.raf = requestAnimationFrame(()=>{
      if(AV_ED !== ed) return;
      const cv = document.getElementById('perfilCanvas'), V = this._perfilLado();
      if(!cv || !V) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3), n = Math.round(V * dpr);
      if(cv.width !== n){ cv.width = cv.height = n; }
      const g = cv.getContext('2d');
      g.clearRect(0, 0, n, n);
      const prevs = ['perfilPrev1', 'perfilPrev2'].map(id=>document.getElementById(id)).filter(Boolean);
      prevs.forEach(p=>{
        const m = Math.round((p.clientWidth || 22) * dpr);
        if(p.width !== m){ p.width = p.height = m; }
        p.getContext('2d').clearRect(0, 0, m, m);
      });
      if(!ed.fonte) return;
      g.imageSmoothingQuality = 'high';
      g.drawImage(ed.fonte, ed.cx - ed.L / 2, ed.cy - ed.L / 2, ed.L, ed.L, 0, 0, n, n);
      prevs.forEach(p=>{
        const pg = p.getContext('2d');
        pg.imageSmoothingQuality = 'high';
        pg.drawImage(cv, 0, 0, n, n, 0, 0, p.width, p.height);
      });
      if(slider){
        const z = document.getElementById('perfilZoom');
        if(z) z.value = ed.Lmax > ed.Lmin ? Math.round(1000 * Math.log(ed.L / ed.Lmax) / Math.log(ed.Lmin / ed.Lmax)) : 0;
      }
    });
  },

  /** Gestos da área de recorte (uma vez por sessão; o modal é injetado no boot). */
  _perfilLigar(ov){
    if(ov._perfilLigado) return;
    ov._perfilLigado = true;
    // APP.modals() já liga o clique no fundo de todo .modal-overlay e chama ov._aoFecharNoFundo
    ov._aoFecharNoFundo = () => this.fecharPerfil();
    ligarFecharNoFundo(ov, ()=>this.fecharPerfil());   // idempotente: só vale se APP.modals() não ligou
    ov.addEventListener('keydown', e=>{ if(e.key === 'Escape'){ e.preventDefault(); this.fecharPerfil(); } });

    const vista = document.getElementById('perfilVista');
    const ponto = e => { const r = vista.getBoundingClientRect(); return {x:e.clientX - r.left, y:e.clientY - r.top}; };
    const dist  = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const meio  = (a, b) => ({x:(a.x + b.x) / 2, y:(a.y + b.y) / 2});
    // Começa (ou recomeça) o gesto com os dedos que estão na tela agora
    const iniciar = () => {
      const ed = AV_ED, ps = [...ed.ptrs.values()];
      if(ps.length >= 2) ed.gesto = {tipo:'pinca', d0:dist(ps[0], ps[1]) || 1, L0:ed.L, m0:meio(ps[0], ps[1]), cx0:ed.cx, cy0:ed.cy};
      else if(ps.length === 1) ed.gesto = {tipo:'arrasto', p0:ps[0], cx0:ed.cx, cy0:ed.cy, t0:performance.now(), andou:0, toque:true};
      else ed.gesto = null;
    };

    vista.addEventListener('pointerdown', e=>{
      const ed = AV_ED;
      if(!ed?.fonte || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      vista.setPointerCapture?.(e.pointerId);
      ed.ptrs.set(e.pointerId, ponto(e));
      iniciar();
    });
    vista.addEventListener('pointermove', e=>{
      const ed = AV_ED;
      if(!ed?.gesto || !ed.ptrs.has(e.pointerId)) return;
      ed.ptrs.set(e.pointerId, ponto(e));
      const V = this._perfilLado(), gs = ed.gesto, ps = [...ed.ptrs.values()];
      if(gs.tipo === 'arrasto'){
        const dx = ps[0].x - gs.p0.x, dy = ps[0].y - gs.p0.y;
        gs.andou = Math.max(gs.andou, Math.hypot(dx, dy));
        if(gs.andou < AV_TOQUE_PX) return;
        ed.cx = gs.cx0 - dx * ed.L / V;
        ed.cy = gs.cy0 - dy * ed.L / V;
        this._perfilMudou(false);
      } else if(ps.length >= 2){
        // Pinça: o ponto da foto que estava sob o meio dos dedos acompanha os dedos
        const m = meio(ps[0], ps[1]);
        const ix = gs.cx0 + (gs.m0.x - V / 2) * gs.L0 / V, iy = gs.cy0 + (gs.m0.y - V / 2) * gs.L0 / V;
        ed.L  = avLimitar(gs.L0 * gs.d0 / (dist(ps[0], ps[1]) || 1), ed.Lmin, ed.Lmax);
        ed.cx = ix - (m.x - V / 2) * ed.L / V;
        ed.cy = iy - (m.y - V / 2) * ed.L / V;
        this._perfilMudou();
      }
    });
    const soltar = e=>{
      const ed = AV_ED;
      if(!ed || !ed.ptrs.has(e.pointerId)) return;
      const gs = ed.gesto, p = ed.ptrs.get(e.pointerId);
      ed.ptrs.delete(e.pointerId);
      // Toque rápido sem arrastar: centraliza naquele ponto e aproxima
      if(e.type === 'pointerup' && gs?.tipo === 'arrasto' && gs.toque && gs.andou < AV_TOQUE_PX
         && performance.now() - gs.t0 < AV_TOQUE_MS){
        const V = this._perfilLado();
        ed.cx += (p.x - V / 2) * ed.L / V;
        ed.cy += (p.y - V / 2) * ed.L / V;
        this._perfilZoom(ed.L / 1.5);
      }
      if(ed.ptrs.size){ iniciar(); if(ed.gesto) ed.gesto.toque = false; } else ed.gesto = null;
    };
    vista.addEventListener('pointerup', soltar);
    vista.addEventListener('pointercancel', soltar);
    vista.addEventListener('wheel', e=>{
      const ed = AV_ED;
      if(!ed?.fonte) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;   // Firefox rola em linhas
      this._perfilZoom(ed.L * Math.exp(avLimitar(dy, -100, 100) * 0.002), ponto(e));
    }, {passive:false});
    vista.addEventListener('keydown', e=>{
      const ed = AV_ED;
      if(!ed?.fonte) return;
      const passo = ed.L * 0.05;
      const mover = {ArrowLeft:[-passo, 0], ArrowRight:[passo, 0], ArrowUp:[0, -passo], ArrowDown:[0, passo]}[e.key];
      if(mover){ e.preventDefault(); ed.cx += mover[0]; ed.cy += mover[1]; this._perfilMudou(false); }
      else if(e.key === '+' || e.key === '='){ e.preventDefault(); this.perfilZoomPasso(1); }
      else if(e.key === '-' || e.key === '_'){ e.preventDefault(); this.perfilZoomPasso(-1); }
    });
  },

});

// Script carregado depois do boot (rede lenta: os dados chegaram antes dele): liga os avatares agora.
// APP.boot chama de novo; é idempotente.
if(STATE.usuario) APP.iniciarAvatares();
