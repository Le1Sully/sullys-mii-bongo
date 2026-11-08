(function () {
  const THEMES = ['wii', 'carnet', 'notice', 'windows', 'xbox', 'switch', 'playstation'];
  const DARKABLE = ['wii', 'windows', 'switch'];
  const norm = t => (THEMES.includes(t) ? t : 'classique');
  for (const t of THEMES) {
    if (document.querySelector(`link[href$="theme-${t}.css"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = `./theme-${t}.css`;
    document.head.appendChild(link);
  }
  const root = document.documentElement;
  function setDark(on) {
    if (on) root.dataset.dark = '1'; else delete root.dataset.dark;
    try { localStorage.setItem('themeDark', on ? '1' : ''); } catch { }
  }
  function apply(t, dark) {
    t = norm(t);
    const wasDark = 'dark' in root.dataset;
    const nowDark = dark === undefined ? wasDark : !!dark;
    if (root.dataset.theme === t && wasDark === nowDark) return;
    root.dataset.theme = t;
    setDark(nowDark);
    try { localStorage.setItem('theme', t); } catch { }
    window.dispatchEvent(new CustomEvent('uitheme', { detail: t }));
  }
  window.uiThemes = THEMES;
  window.uiDarkThemes = DARKABLE;
  window.setUiTheme = apply;
  window.uiTheme = () => norm(root.dataset.theme);
  window.uiDark = () => 'dark' in root.dataset && DARKABLE.includes(norm(root.dataset.theme));
  let saved = 'classique', savedDark = false;
  try { saved = localStorage.getItem('theme') || saved; savedDark = !!localStorage.getItem('themeDark'); } catch { }
  root.dataset.theme = norm(saved);
  setDark(savedDark);
  fetch('./api/config', { cache: 'no-store' }).then(r => r.json()).then(c => apply(c.theme, !!c.themeDark)).catch(() => { });
})();
