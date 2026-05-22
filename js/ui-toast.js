"use strict";

Object.assign(APP, {

  toast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast show ${type}`;
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('show'), 3500);
  },

  toggleDark() {
    STATE.darkMode = !STATE.darkMode;
    document.documentElement.classList.toggle('dark', STATE.darkMode);
    localStorage.setItem('dt_dark', STATE.darkMode ? '1' : '0');
    this.renderPage(STATE.page);
  },

  initDark() {
    if (STATE.darkMode) document.documentElement.classList.add('dark');
  },

  togglePrivacy() {
    STATE.hideValues = !STATE.hideValues;
    document.documentElement.classList.toggle('privacy-mode', STATE.hideValues);
    const iconOn = document.getElementById('iconPrivacyOn');
    const iconOff = document.getElementById('iconPrivacyOff');
    if (iconOn) iconOn.style.display = STATE.hideValues ? 'none' : 'block';
    if (iconOff) iconOff.style.display = STATE.hideValues ? 'block' : 'none';
    const btn = document.getElementById('btnTogglePrivacy');
    if (btn) btn.title = STATE.hideValues ? 'Mostrar valores' : 'Ocultar valores';
  }

});

APP.initDark();
