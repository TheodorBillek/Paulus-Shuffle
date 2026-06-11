'use strict';

const I18n = (() => {
  let _locale = 'en';
  let _strings = {};

  async function load(locale) {
    try {
      const res = await fetch(`/locales/${locale}.json`);
      if (!res.ok) throw new Error('Not found');
      _strings = await res.json();
      _locale = locale;
      localStorage.setItem('lang', locale);
      _applyAll();
    } catch {
      console.warn(`[i18n] Failed to load locale: ${locale}`);
    }
  }

  function t(key, vars = {}) {
    let str = _strings[key] || key;
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, v);
    }
    return str;
  }

  function _applyAll() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (el.tagName === 'INPUT' && el.placeholder !== undefined) {
        el.placeholder = t(key);
      } else {
        el.textContent = t(key);
      }
    });
  }

  async function init() {
    const saved = localStorage.getItem('lang') || 'en';
    await load(saved);
    // Highlight active lang button
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === _locale);
    });
    document.getElementById('settings-lang').value = _locale;
  }

  return { load, t, init, get locale() { return _locale; } };
})();
