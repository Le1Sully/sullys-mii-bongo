const PAGES = [
  ['scene', '🧱 Scène', '?follow=1&editor=1&bg=1e1f26'],
  ['perso', '🃏 Personnage', '?follow=1&perso=1&bg=1e1f26'],
  ['manettes', '🎮 Manettes', 'manettes.html'],
];
const leaving = [];

export const onLeavePage = fn => leaving.push(fn);

export function pageTabs(current) {
  return `<span class="epages" title="Pages de l'éditeur">${PAGES.map(([k, label]) =>
    `<button data-epage="${k}" class="${k === current ? 'on' : ''}">${label}</button>`).join('')}</span>`;
}

const css = document.createElement('style');
css.textContent = `
  .epages { display: inline-flex; margin-right: 12px; flex: none; }
  .epages button { font-weight: 600; white-space: nowrap; border-radius: 0; margin-left: -1px; }
  .epages button:first-child { border-radius: 8px 0 0 8px; margin-left: 0; }
  .epages button:last-child { border-radius: 0 8px 8px 0; }
  .epages button.on { position: relative; z-index: 1; }`;
document.head.appendChild(css);

const host = window.chrome?.webview;

function go(page) {
  const target = PAGES.find(p => p[0] === page);
  if (!target) return;
  for (const fn of leaving) { try { fn(); } catch { } }
  if (host) host.postMessage({ type: 'editorPage', page });
  else location.href = './' + target[2];
}

document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-epage]');
  if (!b) return;
  e.stopPropagation();
  if (!b.classList.contains('on')) go(b.dataset.epage);
}, true);

host?.addEventListener('message', e => { if (e.data?.type === 'goPage') go(e.data.page); });
