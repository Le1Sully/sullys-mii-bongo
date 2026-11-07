(function () {
  const norm = t => (['wii', 'carnet'].includes(t) ? t : 'classique');
  function apply(t) {
    t = norm(t);
    if (document.documentElement.dataset.theme === t) return;
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('theme', t); } catch { }
    window.dispatchEvent(new CustomEvent('uitheme', { detail: t }));
  }
  window.setUiTheme = apply;
  window.uiTheme = () => norm(document.documentElement.dataset.theme);
  let saved = 'classique';
  try { saved = localStorage.getItem('theme') || saved; } catch { }
  document.documentElement.dataset.theme = norm(saved);
  fetch('./api/config', { cache: 'no-store' }).then(r => r.json()).then(c => apply(c.theme)).catch(() => { });
})();
