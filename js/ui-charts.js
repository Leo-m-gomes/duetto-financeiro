"use strict";

Object.assign(APP, {

  mkChart(id, cfg) {
    if (STATE.charts[id]) { STATE.charts[id].destroy(); delete STATE.charts[id]; }
    const c = document.getElementById(id);
    if (!c) return;
    STATE.charts[id] = new Chart(c, cfg);
    return STATE.charts[id];
  }

});
