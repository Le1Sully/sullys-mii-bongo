(function () {
  const F = 'fill="#000" stroke="none"';
  const ICONS = {
    folder: '<path d="M3 7.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2h-7l-2-2.5H5a2 2 0 0 0-2 2z"/>',
    face: `<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1.9 2 5.1 2 7 0"/><circle cx="9" cy="10" r="1.3" ${F}/><circle cx="15" cy="10" r="1.3" ${F}/>`,
    keyboard: '<rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7.5 14h9"/>',
    gamepad: `<path d="M7 8h10a4.5 4.5 0 0 1 4.4 5.4l-.7 3.4a2.2 2.2 0 0 1-3.9.9L15 15.5H9l-1.8 2.2a2.2 2.2 0 0 1-3.9-.9l-.7-3.4A4.5 4.5 0 0 1 7 8z"/><path d="M7.5 10.5v3M6 12h3"/><circle cx="16" cy="11" r="1" ${F}/><circle cx="17.8" cy="12.9" r="1" ${F}/>`,
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
    clipboard: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 3.5h6v3H9zM8.5 12h7M8.5 16h5"/>',
    pencil: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5zM13.5 7l3 3"/>',
    trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
    hat: '<path d="M7 16V7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5V16M3 16.5h18V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM7 12.5h10"/>',
    hold: '<path d="M7 4.5l5 5 5-5M7 11.5l5 5 5-5M5 20h14"/>',
    person: '<circle cx="12" cy="7.5" r="4"/><path d="M4.5 21v-1A5.5 5.5 0 0 1 10 14.5h4a5.5 5.5 0 0 1 5.5 5.5v1"/>',
    people: '<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="8" r="3"/><path d="M2.5 20v-1A4.5 4.5 0 0 1 7 14.5h2a4.5 4.5 0 0 1 4.5 4.5v1M13.2 14.8a4.4 4.4 0 0 1 2.3-.5H17a4.5 4.5 0 0 1 4.5 4.5V20"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    brush: '<path d="M14.5 4.5l5 5L12 17l-5-5zM7 12c-2.5 0-3.5 2-3.5 4.5S2.5 20 2.5 20s5 .5 6.5-1.5c1-1.3 1-3.5 1-3.5"/>',
    upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14"/>',
    bricks: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 9.7v4.6M9 14.3V19M16 5v4.7"/>',
    house: '<path d="M3.5 11.5L12 4l8.5 7.5M6 9.8V20h12V9.8M10 20v-5h4v5"/>',
    window: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9h17M6.6 6.5h.01M9.2 6.5h.01"/>',
    box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>',
    robot: `<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 5v3M9.5 13h.01M14.5 13h.01M9.5 16.2h5M3 12.5v3M21 12.5v3"/><circle cx="12" cy="4" r="1.2" ${F}/>`,
    masks: '<path d="M3.5 5.5c3-1 6-1 9 0V11a4.5 4.5 0 0 1-9 0zM12.5 9.6c2.7-.8 5.3-.8 8 0V15a4 4 0 0 1-8 0M6 9h.01M10 9h.01M6.5 12.5c1 .8 2.5.8 3.5 0M15 13h.01M18 13h.01M15.5 17c.8-.6 1.7-.6 2.5 0"/>',
    chair: '<path d="M7.5 3.5h9l-1 8h-7zM5.5 11.5h13M8.5 11.5L7 20.5M15.5 11.5l1.5 9M12 11.5v6"/>',
    bolt: '<path d="M13.5 3L5 13.5h6L10 21l9-11h-6z"/>',
    setsquare: '<path d="M4 4v16h16zM8 12v4h4z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    tap: '<path d="M9 11.5V4.8a1.8 1.8 0 0 1 3.6 0V10l4.3.9a2.4 2.4 0 0 1 1.9 2.8l-.9 4.6A3 3 0 0 1 14.9 21H11a3 3 0 0 1-2.4-1.2l-3.1-4.2a1.6 1.6 0 0 1 2.3-2.2L9 14.5"/>',
    piano: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7.5 5v8M12 5v8M16.5 5v8M7.5 13v6M12 13v6M16.5 13v6M6 13h3M10.5 13h3M15 13h3"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
    palette: `<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.5-1.3-1.8-1.3-3.1 0-1 .8-1.9 1.9-1.9H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.3" ${F}/><circle cx="10" cy="7" r="1.3" ${F}/><circle cx="15" cy="7.3" r="1.3" ${F}/>`,
    tv: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 3l3.5 4 3.5-4"/>',
    vr: '<path d="M3 9.5A2.5 2.5 0 0 1 5.5 7h13A2.5 2.5 0 0 1 21 9.5v4a2.5 2.5 0 0 1-2.5 2.5h-3l-2-2.2a2 2 0 0 0-3 0l-2 2.2h-3A2.5 2.5 0 0 1 3 13.5z"/>',
    picture: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="9" r="1.5"/>',
    wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.2"/><path d="M3.5 10.5h6.3M14.2 10.5h6.3M12 14.2V21"/>',
    shirt: '<path d="M8.5 3.5L3.5 6.5l2 4 2-1V20h9V9.5l2 1 2-4-5-3c-.5 1.6-1.8 2.5-3.5 2.5S9 5.1 8.5 3.5z"/>',
    camera: '<rect x="3" y="7" width="12.5" height="10" rx="2"/><path d="M15.5 10.5l5.5-3v9l-5.5-3"/>',
    checkbox: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M8 12.5l3 3 5.5-6"/>',
    sparkles: '<path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>',
    hand: '<path d="M7 12V6.5a1.5 1.5 0 0 1 3 0V11M10 10.5V4.5a1.5 1.5 0 0 1 3 0v6M13 10.5V5.5a1.5 1.5 0 0 1 3 0V12M16 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.6-2.2l-2.8-3.3a1.6 1.6 0 0 1 2.4-2.1L7 13.5"/>',
    clapper: '<rect x="3" y="9" width="18" height="11" rx="1.5"/><path d="M3 9l1.3-4.6 16 3.3L20 9M8.3 5.3l1.5 3.6M13.6 6.4l1.5 3"/>',
    waist: '<path d="M5 4h14l1.5 15h-6L12 10.5 9.5 19h-6zM5 7.5h14"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    drum: '<ellipse cx="12" cy="10" rx="8" ry="3"/><path d="M4 10v6.5c0 1.7 3.6 3 8 3s8-1.3 8-3V10M15.5 3.5L12.5 9M8.5 3.5l3 5.5"/>',
    eyes: `<ellipse cx="8" cy="12" rx="3.8" ry="5.5"/><ellipse cx="16" cy="12" rx="3.8" ry="5.5"/><circle cx="9.2" cy="13" r="1.5" ${F}/><circle cx="17.2" cy="13" r="1.5" ${F}/>`,
    forbidden: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    column: '<path d="M3.5 8L12 3.5 20.5 8zM6 8v10M10 8v10M14 8v10M18 8v10M3.5 20.5h17"/>',
    wrench: '<path d="M15 3.5a5 5 0 0 0-4.6 6.9l-6.5 6.5a2 2 0 0 0 2.8 2.8l6.5-6.5A5 5 0 0 0 20.2 8l-3 3-3.2-1-1-3.2 3-3a5 5 0 0 0-1-.3z"/>',
    circle: '<circle cx="12" cy="12" r="8"/>',
    target: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" ${F}/>`,
    leaf: '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15M5 19c3-3 6-6 9-8"/>',
    square: '<rect x="5" y="5" width="14" height="14" rx="2.5"/>',
    log: '<rect x="3" y="7" width="14" height="10" rx="1.5"/><ellipse cx="17" cy="12" rx="3.5" ry="5"/><path d="M6.5 10h6M6 14h5"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5v-3a4 4 0 0 1 8 0v3"/>',
    stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
    speak: '<path d="M4 5h16v10.5H10L5.5 19.5v-4H4zM8 9h8M8 12h5"/>',
    rocket: '<path d="M14 4c3.5-1 6-1 6-1s0 2.5-1 6l-6 6-5-5zM8 10l-3.5.5L3 13l4 1M14 16l-.5 3.5L11 21l-1-4"/><circle cx="15.5" cy="8.5" r="1.4"/>',
    repeat: '<path d="M4 11V9a3 3 0 0 1 3-3h12M16 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H5M8 21l-3-3 3-3"/>',
    mouth: '<path d="M3 12c3-3.5 6-4 9-2 3-2 6-1.5 9 2-3 4-6 5.5-9 5.5S6 16 3 12zM3 12h18"/>',
    magnet: '<path d="M5 4h4v8a3 3 0 0 0 6 0V4h4v8a7 7 0 0 1-14 0zM5 8h4M15 8h4"/>',
    triangle: '<path d="M12 4l9 15H3z"/>',
    tiles: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 12h16M12 4v16"/>',
    popcorn: '<path d="M6 9l1.5 11h9L18 9zM9.5 9l.5 11M14.5 9L14 20"/><path d="M6 9a2.5 2.5 0 0 1 2-4 2.5 2.5 0 0 1 4-1.5A2.5 2.5 0 0 1 16 5a2.5 2.5 0 0 1 2 4"/>',
    save: '<path d="M5 4h11.5L20 7.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4M7.5 20v-6h9v6"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    bulb: '<path d="M9 17.5h6M10 20.5h4M8.2 14.5a6 6 0 1 1 7.6 0c-.8.7-1.3 1.6-1.3 2.6V17.5h-5v-.4c0-1-.5-1.9-1.3-2.6z"/>',
    mouse: '<rect x="6.5" y="3.5" width="11" height="17" rx="5.5"/><path d="M12 3.5v6M6.5 9.5h11"/>',
  };
  const EMOJI = {
    '📁': 'folder', '📂': 'folder', '🙂': 'face', '😀': 'face', '⌨': 'keyboard', '🎮': 'gamepad', '🖥': 'monitor', '💻': 'monitor',
    '📋': 'clipboard', '✏': 'pencil', '📝': 'pencil', '🗑': 'trash', '🎩': 'hat', '⏬': 'hold', '🃏': 'person', '🧍': 'person', '👤': 'person',
    '🧑‍🤝‍🧑': 'people', '👥': 'people', '➕': 'plus', '✚': 'plus', '🖌': 'brush', '📤': 'upload', '📥': 'download', '🧱': 'bricks',
    '🏠': 'house', '🪟': 'window', '📦': 'box', '🧊': 'box', '🤖': 'robot', '🎭': 'masks', '🪑': 'chair', '⚡': 'bolt', '📐': 'setsquare',
    '⚙': 'gear', '👆': 'tap', '🎹': 'piano', '👁': 'eye', '🙈': 'eyeoff', '🎨': 'palette', '📺': 'tv', '🥽': 'vr', '🖼': 'picture',
    '🏎': 'wheel', '👕': 'shirt', '🎥': 'camera', '✅': 'checkbox', '✨': 'sparkles', '🤚': 'hand', '✋': 'hand', '👋': 'hand', '🎬': 'clapper',
    '🩳': 'waist', '🎤': 'mic', '🥁': 'drum', '👀': 'eyes', '🚫': 'forbidden', '🏛': 'column', '🔧': 'wrench', '⚪': 'circle',
    '🎯': 'target', '🍃': 'leaf', '🌿': 'leaf', '🟦': 'square', '⬜': 'square', '⬛': 'square', '◼': 'square', '🪵': 'log', '🔒': 'lock',
    '🪜': 'stairs', '🗣': 'speak', '🚀': 'rocket', '🔁': 'repeat', '👄': 'mouth', '🧲': 'magnet', '🔺': 'triangle', '♟': 'tiles', '🍿': 'popcorn', '💾': 'save', '▶': 'play', '💡': 'bulb', '🖱': 'mouse',
  };

  const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const sketch = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">`
    + `<defs><filter id="a" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".32" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="1.5" xChannelSelector="R" yChannelSelector="G"/></filter>`
    + `<filter id="b" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".45" numOctaves="1" seed="11"/><feDisplacementMap in="SourceGraphic" scale="1.9" xChannelSelector="G" yChannelSelector="R"/></filter></defs>`
    + `<g filter="url(#a)">${body}</g><g filter="url(#b)" opacity=".42" stroke-width="1.1" transform="translate(.45 .35)">${body}</g></svg>`;
  const fine = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter">${body}</svg>`;
  const css = document.createElement('style');
  css.textContent = `
    .wi { display: inline-block; width: 1.25em; height: 1.25em; vertical-align: -0.25em; background: currentColor;
          -webkit-mask: var(--i) center / contain no-repeat; mask: var(--i) center / contain no-repeat; flex: none; }
    .wi-emoji { filter: grayscale(1) brightness(.55) contrast(1.3); }
    ${Object.entries(ICONS).map(([n, b]) => `.wi-${n} { --i: url("data:image/svg+xml,${encodeURIComponent(svg(b))}"); }`).join('\n')}
    :is(:root[data-theme="carnet"], .icons-carnet) .wi-emoji { filter: grayscale(1) sepia(.5) brightness(.5) contrast(1.2); }
    ${Object.entries(ICONS).map(([n, b]) => `:root[data-theme="carnet"] .wi-${n}:not(.prev-wii *), .icons-carnet .wi-${n} { --i: url("data:image/svg+xml,${encodeURIComponent(sketch(b))}"); }`).join('\n')}
    :root[data-theme="notice"] .wi-emoji { filter: grayscale(1) brightness(.4) contrast(1.4); }
    ${Object.entries(ICONS).map(([n, b]) => `:root[data-theme="notice"] .wi-${n}:not(.prev *) { --i: url("data:image/svg+xml,${encodeURIComponent(fine(b))}"); }`).join('\n')}`;
  document.head.appendChild(css);

  const RX = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*️?/gu;
  const SKIP = 'script, style, textarea, select, .wi, .wi-emoji, [contenteditable]';
  const keyOf = e => e.replace(/️/g, '');

  function swap(root, onlyMarked) {
    if (!root || root.nodeType !== 1 && root.nodeType !== 3) return;
    if (root.nodeType === 1 && !onlyMarked) for (const o of root.querySelectorAll ? root.querySelectorAll('option, optgroup') : []) {
      const attr = o.tagName === 'OPTGROUP' ? 'label' : null;
      const txt = attr ? o.label : o.textContent;
      RX.lastIndex = 0;
      if (!RX.test(txt)) continue;
      o.dataset.wiiOrig = txt;
      const clean = txt.replace(RX, '').replace(/^\s+/, '');
      if (attr) o.label = clean; else o.textContent = clean;
    }
    const texts = [];
    if (root.nodeType === 3) texts.push(root);
    else {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) texts.push(n);
    }
    for (const n of texts) {
      const p = n.parentElement;
      if (!p || p.closest(SKIP)) continue;
      if (onlyMarked && !p.closest('[data-wii-icons]')) continue;
      const s = n.nodeValue;
      RX.lastIndex = 0;
      if (!RX.test(s)) continue;
      RX.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0;
      for (const m of s.matchAll(RX)) {
        if (m.index > last) frag.append(s.slice(last, m.index));
        const name = EMOJI[keyOf(m[0])];
        const span = document.createElement('span');
        if (name) { span.className = 'wi wi-' + name; span.setAttribute('aria-hidden', 'true'); }
        else { span.className = 'wi-emoji'; span.textContent = m[0]; }
        span.dataset.e = m[0];
        frag.append(span);
        last = m.index + m[0].length;
      }
      if (last < s.length) frag.append(s.slice(last));
      n.replaceWith(frag);
      markSolo(p);
    }
  }

  function markSolo(p) {
    const box = p.closest('button, label, summary, h2, h3') || p;
    const solo = !box.textContent.replace(RX, '').trim();
    for (const sp of box.querySelectorAll('.wi, .wi-emoji')) sp.classList.toggle('solo', solo);
  }

  function restore() {
    for (const sp of document.querySelectorAll('.wi, .wi-emoji')) {
      if (sp.closest('[data-wii-icons]')) continue;
      const parent = sp.parentNode;
      sp.replaceWith(document.createTextNode(sp.dataset.e || ''));
      parent?.normalize();
    }
    for (const o of document.querySelectorAll('[data-wii-orig]')) {
      if (o.tagName === 'OPTGROUP') o.label = o.dataset.wiiOrig; else o.textContent = o.dataset.wiiOrig;
      delete o.dataset.wiiOrig;
    }
  }

  let on = false, pending = new Set(), scheduled = false;
  const observer = new MutationObserver(list => {
    for (const r of list) {
      if (r.type === 'characterData') pending.add(r.target);
      else for (const n of r.addedNodes) pending.add(n);
    }
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const nodes = [...pending]; pending.clear();
        for (const n of nodes) if (n.isConnected) swap(n, !on);
      });
    }
  });

  function update() {
    const wii = ['wii', 'carnet', 'notice'].includes(document.documentElement.dataset.theme);
    if (wii === on && update.done) return;
    update.done = true;
    on = wii;
    if (on) swap(document.body, false);
    else { restore(); swap(document.body, true); }
  }
  function start() {
    update();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    addEventListener('uitheme', update);
  }
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);
})();
