"use strict";

Object.assign(APP, {

  /**
   * Fecha um modal com animacao de saida (M10).
   * Aplica .closing por 180ms (duracao da animacao CSS), depois
   * remove .open e .closing, restaurando o estado inicial.
   * Seguro: se o modal ja estiver fechado, nao faz nada.
   * @param {string} id - ID do elemento .modal-overlay (ex: 'ovConta')
   */
  closeModal(id) {
    const ov = document.getElementById(id);
    if (!ov || !ov.classList.contains('open')) return;
    ov.classList.add('closing');
    setTimeout(() => {
      ov.classList.remove('open', 'closing');
    }, 180);
  },

  /**
   * Inicializa o listener de scroll da topbar (M06).
   * Adiciona/remove a classe .scrolled conforme o conteudo rola,
   * acionando a sombra de "flutuacao" via CSS. Usa rAF throttle
   * para evitar layout thrashing.
   * Idempotente: pode ser chamada multiplas vezes sem efeito colateral.
   */
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
  }

});
