"use strict";

/**
 * Fecha um overlay de modal com clique no fundo, mas só quando o clique COMEÇA e TERMINA
 * no fundo. O navegador dispara "click" no ancestral comum de onde o botão foi pressionado e
 * solto: selecionar texto arrastando de dentro da caixa para fora (ou o contrário) gerava um
 * click no fundo e fechava o modal, perdendo o que foi digitado. Usado por todos os modais
 * (app.js → modals, notes.js). Idempotente.
 * @param {HTMLElement} ov     o overlay (.modal-overlay, .nt-modal-overlay...)
 * @param {Function}    fechar ação de fechar
 */
function ligarFecharNoFundo(ov, fechar){
  if(!ov || ov._fecharNoFundoLigado) return;
  ov._fecharNoFundoLigado = true;
  let comecouNoFundo = false, terminouNoFundo = false;
  ov.addEventListener('pointerdown', e => { comecouNoFundo = e.target === ov; terminouNoFundo = false; });
  ov.addEventListener('pointerup',   e => { terminouNoFundo = e.target === ov; });
  ov.addEventListener('click', e => {
    if(e.target === ov && comecouNoFundo && terminouNoFundo) fechar();
    comecouNoFundo = terminouNoFundo = false;
  });
}
window.ligarFecharNoFundo = ligarFecharNoFundo;

Object.assign(APP, {

  closeModal(id) {
    const ov = document.getElementById(id);
    if (!ov || !ov.classList.contains('open')) return;
    ov.classList.add('closing');
    setTimeout(() => {
      ov.classList.remove('open', 'closing');
    }, 180);
  },

  initTopbarScroll() {
    if (this._topbarScrollInit) return;
    this._topbarScrollInit = true;
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
        topbar.classList.toggle('scrolled', scrollTop > 8);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    const mainEl = document.querySelector('.main');
    if (mainEl) {
      mainEl.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          topbar.classList.toggle('scrolled', mainEl.scrollTop > 8);
          ticking = false;
        });
      }, { passive: true });
    }
  },

  initMobileNavScroll() {
    if (this._mobileNavScrollInit) return;
    this._mobileNavScrollInit = true;

    const nav = document.getElementById('bottomNav');
    if (!nav) return;

    let lastY = 0;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (window.innerWidth > 768) {
          nav.classList.remove('bnav-hidden');
          ticking = false;
          return;
        }
        const y = window.pageYOffset || document.documentElement.scrollTop || 0;
        if (y > lastY && y > 60) {
          nav.classList.add('bnav-hidden');
        } else {
          nav.classList.remove('bnav-hidden');
        }
        lastY = y;
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    const mainEl = document.querySelector('.main');
    if (mainEl) {
      mainEl.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          if (window.innerWidth > 768) { ticking = false; return; }
          const y = mainEl.scrollTop;
          if (y > lastY && y > 60) {
            nav.classList.add('bnav-hidden');
          } else {
            nav.classList.remove('bnav-hidden');
          }
          lastY = y;
          ticking = false;
        });
      }, { passive: true });
    }
  }

});
