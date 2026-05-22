"use strict";

Object.assign(APP, {

  sortTable(tabela, col) {
    const key = tabela === 'contas' ? 'sortContas' : 'sortRel';
    if (STATE[key].col === col) {
      STATE[key].dir *= -1;
    } else {
      STATE[key].col = col;
      STATE[key].dir = 1;
    }
    document.querySelectorAll('.sort-icon').forEach(el => {
      el.classList.remove('asc', 'desc');
    });
    const icone = document.querySelector(`.sort-icon[data-col="${col}"]`);
    if (icone) icone.classList.add(STATE[key].dir === 1 ? 'asc' : 'desc');

    if (tabela === 'contas') this.renderContas();
    else                     this.renderRelatorio();
  },

  _aplicarSort(data, key) {
    const s = STATE[key];
    if (!s.col) return data;
    return [...data].sort((a, b) => {
      let va, vb;
      const col = s.col;
      if (col === 'conta' || col === 'resp' || col === 'parcela') {
        va = String(a[col] || '').toLowerCase();
        vb = String(b[col] || '').toLowerCase();
      } else if (col === 'data') {
        va = a.data || '';
        vb = b.data || '';
      } else if (col === 'vPagar' || col === 'vPago') {
        va = Number(a[col] || 0);
        vb = Number(b[col] || 0);
      } else if (col === 'forma') {
        va = CACHE.resolveForma(a.formaId || a.forma).toLowerCase();
        vb = CACHE.resolveForma(b.formaId || b.forma).toLowerCase();
      } else if (col === 'cat') {
        va = CACHE.resolveCat(a.catId || a.cat).toLowerCase();
        vb = CACHE.resolveCat(b.catId || b.cat).toLowerCase();
      } else {
        va = a[col] || ''; vb = b[col] || '';
      }
      if (va < vb) return -1 * s.dir;
      if (va > vb) return  1 * s.dir;
      return 0;
    });
  }

});
