import * as THREE from 'three';
import { SHAPES, TEXTURES } from './scene-objects.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = v => (Math.round(v * 1000) / 1000).toString();
const POINTS = { tete: '🙂 Tête', corps: '👕 Corps', taille: '🩳 Taille', mainG: '✋ Main gauche', mainD: '🤚 Main droite' };
const ZONES = { yeux: '👀 Les yeux', bouche: '👄 La bouche', tout: '🙂 Les deux' };
const FORMS = ['cube', 'sphere', 'pyramid', 'column', 'stairs'];
const POINT_DEFAULTS = {
  tete: { pos: [0, 0.14, 0], taille: 0.14 }, corps: { pos: [0, 0, 0.07], taille: 0.12 }, taille: { pos: [0, 0, 0.07], taille: 0.12 },
  mainG: { pos: [0, 0, 0], taille: 0.09 }, mainD: { pos: [0, 0, 0], taille: 0.09 },
};

export async function startCharEditor(mii) {
  const { camera, rig, renderer, char } = mii;
  const host = window.chrome?.webview;
  const canvas = renderer.domElement;
  const H = rig.sceneUnit || rig.modelBox.getSize(V()).y || 1;
  POINT_DEFAULTS.tete.pos = [0, Math.round(((rig.headTop || 0.2) + POINT_DEFAULTS.tete.taille * 0.35) * 1000) / 1000, 0];

  let data = { format: 'sullys-mii-bongo-personnage', version: 1, items: [] };
  let lists = { expressions: [], models: [], mii: mii.CFG.model };
  let rev = Date.now();
  async function fetchAll(first) {
    const res = await fetch('./api/personnage', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
    if (!res) { setStatus("⚠ Appli injoignable"); return; }
    lists = { expressions: res.expressions || [], models: res.models || [], mii: res.mii || mii.CFG.model };
    if (first) {
      data = res.data && Array.isArray(res.data.items) ? res.data : data;
      data.format = 'sullys-mii-bongo-personnage'; data.version = 1;
      mii.setCharacterOn(res.on || []);
      mii.applyCharacter(data);
    }
  }
  await fetchAll(true);

  let selected = data.items[0]?.id || null;
  const sel = () => data.items.find(i => i.id === selected) || null;
  let saveTimer = null;
  const save = () => {
    mii.applyCharacter(data);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { host?.postMessage({ type: 'savePerso', data }); setStatus('✓ Enregistré'); }, 300);
  };
  const setPreview = () => { char.preview = selected; };
  setPreview();

  const anchorPos = name => {
    const a = rig.anchors?.[name];
    if (!a) return rig.modelBox.getCenter(V());
    rig.root.updateMatrixWorld(true);
    return a.bone.localToWorld(a.local.clone());
  };
  const cam = { target: anchorPos('tete'), az: 20, el: 10, dist: H * 1.0 };
  const fit = h => (h * H) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * Math.max(1, 1.25 / (camera.aspect || 1.6));
  const views = {
    tete: () => ({ target: anchorPos('tete').add(V(0, H * 0.1, 0)), dist: fit(1.15) }),
    buste: () => ({ target: anchorPos('corps').lerp(anchorPos('tete'), 0.5), dist: fit(1.3) }),
    corps: () => ({ target: rig.modelBox.getCenter(V()), dist: fit(1.6) }),
  };
  const applyCamera = () => {
    const a = THREE.MathUtils.degToRad(cam.az), e = THREE.MathUtils.degToRad(cam.el);
    camera.position.copy(cam.target).add(V(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(cam.dist));
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.target);
    camera.near = cam.dist * 0.01; camera.far = cam.dist * 80;
    camera.updateProjectionMatrix();
  };
  rig.editorCamera = applyCamera;
  const goView = name => { Object.assign(cam, views[name]()); applyCamera(); };
  goView('tete');

  let drag = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, pan: e.button === 1 || e.button === 2 || e.shiftKey };
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) {
      const k = cam.dist * 0.0016;
      const right = V().setFromMatrixColumn(camera.matrixWorld, 0), up = V().setFromMatrixColumn(camera.matrixWorld, 1);
      cam.target.add(right.multiplyScalar(-dx * k)).add(up.multiplyScalar(dy * k));
    } else {
      cam.az -= dx * 0.4;
      cam.el = THREE.MathUtils.clamp(cam.el + dy * 0.3, -60, 85);
    }
    applyCamera();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(e.deltaY * 0.0012), H * 0.25, H * 30);
    applyCamera();
  }, { passive: false });

  const css = document.createElement('style');
  css.textContent = `
    #status { display: none !important; }
    .ce { position: fixed; z-index: 10; font: 13px/1.35 "Segoe UI", system-ui, sans-serif; color: #ececf1; user-select: none; }
    .ce.panel { background: rgba(26,26,34,.94); border: 1px solid #34343f; border-radius: 12px; padding: 10px 12px; box-shadow: 0 6px 22px #0006; }
    .ce h3 { margin: 12px 0 7px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #9b9bab; font-weight: 600; }
    .ce h3:first-child { margin-top: 2px; }
    .ce button, .ce select, .ce input { font: inherit; color: inherit; }
    .ce button { background: #2a2a34; border: 1px solid #3a3a48; border-radius: 8px; padding: 6px 9px; cursor: pointer; }
    .ce button:hover { border-color: #5a5a70; }
    .ce button.on, .ce button.primary { background: #d63a45; border-color: #d63a45; color: #fff; }
    .ce button:disabled { opacity: .4; cursor: default; }
    #ceTop { top: 10px; left: 282px; right: 362px; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; align-items: center; padding: 6px 8px; }
    #ceTop b { margin: 0 8px 0 4px; white-space: nowrap; }
    #ceTop .st { color: #9b9bab; font-size: 12px; min-width: 100px; margin-left: 6px; }
    #ceLeft { top: 10px; left: 10px; width: 260px; bottom: 10px; overflow: hidden auto; }
    #ceRight { top: 10px; right: 10px; width: 340px; bottom: 10px; overflow: hidden auto; }
    .add { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .add button { padding: 8px 6px; }
    .items { display: flex; flex-direction: column; gap: 3px; }
    .it { display: flex; align-items: center; gap: 6px; border: 1px solid transparent; border-radius: 8px; padding: 4px 6px; cursor: pointer; }
    .it:hover { background: #24242d; }
    .it.sel { background: #3a1f26; border-color: #d63a45; }
    .it .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .it .k { font-size: 10.5px; color: #c9c9d6; background: #2f2f3b; border-radius: 5px; padding: 1px 5px; white-space: nowrap; }
    .sw { width: 34px; height: 19px; border-radius: 99px; background: #45455a; position: relative; flex: none; cursor: pointer; border: 0; padding: 0; }
    .sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 13px; height: 13px; border-radius: 50%; background: #fff; transition: .12s; }
    .ce .sw.on { background: #3fb67f; border: 0; } .sw.on::after { left: 18px; }
    .row { display: flex; gap: 6px; align-items: center; margin: 7px 0; flex-wrap: wrap; }
    .row > label { color: #9b9bab; min-width: 70px; font-size: 12px; }
    .ce select, .ce input[type=text] { background: #2a2a34; border: 1px solid #3a3a48; border-radius: 8px; padding: 5px 7px; flex: 1; min-width: 0; }
    .ce input[type=number] { background: #2a2a34; border: 1px solid #3a3a48; border-radius: 7px; padding: 3px 4px; width: 62px; }
    .ce input[type=range] { flex: 1; accent-color: #d63a45; min-width: 0; }
    .ce input[type=color] { width: 54px; height: 28px; background: none; border: 0; padding: 0; }
    .seg { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; }
    .seg button { padding: 4px 8px; }
    .sl { display: grid; grid-template-columns: 70px 1fr 62px; gap: 6px; align-items: center; margin: 5px 0; font-size: 12px; color: #9b9bab; }
    .imgs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
    .imgs button { padding: 0; aspect-ratio: 1; border-radius: 8px; overflow: hidden; border: 2px solid transparent; position: relative; background: #f1c9a5 50% 55% / 165% no-repeat; }
    .ce .imgs button.on { border-color: #ffd23f; background-color: #f1c9a5; background-position: 50% 55%; background-size: 165%; background-repeat: no-repeat; }
    .imgs button i { position: absolute; left: 0; right: 0; bottom: 0; font-style: normal; font-size: 9px; background: #000a; color: #fff; text-align: center; white-space: nowrap; overflow: hidden; }
    .muted { color: #9b9bab; font-size: 12px; }
    .warn { color: #e0b070; font-size: 12px; }
    .key { display: inline-block; min-width: 90px; text-align: center; background: #15151b; border: 1px solid #44445a; border-radius: 7px; padding: 5px 8px; font-weight: 600; }
    .key.wait { border-color: #ffd23f; color: #ffd23f; animation: blink 1s infinite; }
    @keyframes blink { 50% { opacity: .5; } }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .danger { color: #ffb3b8; }
    #ceHelp { left: 282px; right: 362px; bottom: 8px; text-align: center; font-size: 11.5px; color: #c8c8d4; text-shadow: 0 1px 2px #000; pointer-events: none; }
  `;
  document.head.appendChild(css);
  const el = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };
  const top = el(`<div id="ceTop" class="ce panel"></div>`);
  const left = el(`<div id="ceLeft" class="ce panel"></div>`);
  const right = el(`<div id="ceRight" class="ce panel"></div>`);
  const help = el(`<div id="ceHelp" class="ce">Glisser : tourner autour du Mii · clic droit + glisser : déplacer la vue · molette : zoom. L'ajout sélectionné est toujours montré ici ; ailleurs, seulement quand il est activé.</div>`);
  document.body.append(top, left, right, help);

  let statusText = '';
  const setStatus = t => { statusText = t; const s = top.querySelector('.st'); if (s) s.textContent = t; };
  function renderTop() {
    top.innerHTML = `<b>🃏 Éditeur de personnage</b>
      <button data-v="tete">🙂 Tête</button><button data-v="buste">👕 Buste</button><button data-v="corps">🧍 Corps entier</button>
      <button data-a="all" class="${char.showAll ? 'on' : ''}" title="Montrer tous les ajouts en même temps (aperçu, ici seulement)">👁 Tout montrer</button>
      <span class="st">${esc(statusText)}</span>`;
  }
  top.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.v) goView(b.dataset.v);
    if (b.dataset.a === 'all') { char.showAll = !char.showAll; renderTop(); }
  });

  const keyLabel = it => it.touche ? (it.maintien ? '⏬ ' : '') + it.touche : '';
  function renderLeft() {
    const row = it => `<div class="it ${it.id === selected ? 'sel' : ''}" data-id="${esc(it.id)}">
        <span>${it.type === 'objet' ? '🎩' : '🙂'}</span><span class="n">${esc(it.nom || 'Sans nom')}</span>
        ${it.touche ? `<span class="k" title="Raccourci">${esc(keyLabel(it))}</span>` : ''}
        <button class="sw ${char.on.has(it.id) ? 'on' : ''}" data-on="${esc(it.id)}" title="Activer / désactiver (comme dans les réglages)"></button></div>`;
    const exprs = data.items.filter(i => i.type === 'expression'), objs = data.items.filter(i => i.type === 'objet');
    left.innerHTML = `<h3>Ajouter</h3>
      <div class="add"><button data-add="expression">🙂 + Expression</button><button data-add="objet">🎩 + Objet 3D</button></div>
      <h3>Expressions (visage)</h3><div class="items">${exprs.map(row).join('') || '<div class="muted">Aucune. Une expression change les yeux, la bouche ou les deux.</div>'}</div>
      <h3>Objets accrochés</h3><div class="items">${objs.map(row).join('') || '<div class="muted">Aucun. Chapeau, lunettes, épée… sur la tête, le corps ou dans une main.</div>'}</div>
      <h3>Dossiers</h3>
      <div class="grid2"><button data-act="openExpressions">📁 Expressions</button><button data-act="openAccessoires">📁 Accessoires</button></div>
      <p class="muted">Interrupteur vert = activé partout (fenêtre du Mii et OBS), comme dans les réglages.</p>`;
  }
  left.addEventListener('click', e => {
    const on = e.target.closest('[data-on]');
    if (on) { toggleOn(on.dataset.on); return; }
    const add = e.target.closest('[data-add]');
    if (add) { addItem(add.dataset.add); return; }
    const act = e.target.closest('[data-act]');
    if (act) { host?.postMessage({ type: 'action', name: act.dataset.act }); return; }
    const it = e.target.closest('[data-id]');
    if (it) { select(it.dataset.id); }
  });
  function toggleOn(id) {
    const on = !char.on.has(id);
    mii.setCharacterOn(on ? [...char.on, id] : [...char.on].filter(x => x !== id));
    host?.postMessage({ type: 'setOn', id, on });
    renderLeft(); renderRight();
  }
  function select(id) {
    if (capturing) cancelCapture();
    selected = id; setPreview();
    const it = sel();
    if (it?.type === 'objet') goView(it.point === 'tete' ? 'tete' : it.point === 'corps' || it.point === 'taille' ? 'buste' : 'buste');
    else if (it) goView('tete');
    renderLeft(); renderRight();
  }
  const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function addItem(type) {
    const n = data.items.filter(i => i.type === type).length + 1;
    const it = type === 'expression'
      ? { id: newId(), type, nom: 'Expression ' + n, image: '', zone: 'tout', parler: true, touche: '', maintien: false }
      : { id: newId(), type, nom: 'Objet ' + n, modele: lists.models[0] || 'forme:cube', couleur: '#e8574a', texture: 'uni', point: 'tete', ...JSON.parse(JSON.stringify(POINT_DEFAULTS.tete)), rot: [0, 0, 0], touche: '', maintien: false };
    data.items.push(it);
    save(); select(it.id);
  }

  let capturing = false;
  const imgUrl = f => './personnage/Expressions/' + encodeURIComponent(f) + '?v=' + rev;
  function renderRight() {
    const it = sel();
    if (!it) { right.innerHTML = `<h3>Personnage</h3><p class="muted">Ajoutez une expression ou un objet avec les boutons à gauche.</p>`; return; }
    const seg = (key, opts, val) => `<div class="seg" data-seg="${key}">${Object.entries(opts).map(([v, t]) => `<button data-v="${esc(v)}" class="${String(val) === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    let body = `<h3>${it.type === 'objet' ? '🎩 Objet accroché' : '🙂 Expression'}</h3>
      <div class="row"><label>Nom</label><input type="text" data-f="nom" value="${esc(it.nom)}" maxlength="60"></div>`;
    if (it.type === 'expression') {
      const imgs = lists.expressions.map(f => `<button data-img="${esc(f)}" class="${it.image === f ? 'on' : ''}" style="background-image:url('${imgUrl(f).replace(/'/g, '%27')}')" title="${esc(f)}"><i>${esc(f.replace(/\.(png|webp)$/i, ''))}</i></button>`).join('');
      body += `<h3>Image du visage</h3>
        <div class="imgs">${imgs || ''}</div>
        ${lists.expressions.length ? '' : '<p class="muted">Aucune image : créez-en une avec Paint ci-dessous.</p>'}
        <div class="grid2" style="margin-top:7px">
          <button data-x="create" class="primary" title="Une copie du visage actuel du Mii s'ouvre dans Paint : dessinez, enregistrez, revenez ici">🖌 Créer dans Paint</button>
          <button data-x="edit" ${it.image ? '' : 'disabled'} title="Ouvrir cette image dans Paint">✏️ Modifier dans Paint</button>
          <button data-x="reload" title="Après avoir enregistré dans Paint">↻ Recharger</button>
          <button data-act="openExpressions">📁 Dossier</button>
        </div>
        <p class="muted">Même disposition que la texture du visage (fond transparent). Le haut de l'image donne les yeux, le bas la bouche.</p>
        <h3>Ce qu'elle remplace</h3>${seg('zone', ZONES, it.zone || 'tout')}
        ${it.zone === 'yeux' ? '' : `<h3>Quand vous parlez</h3>${seg('parler', { true: '🗣 La bouche parle', false: '🔒 Garder cette bouche' }, String(it.parler !== false))}`}`;
    } else {
      const forms = FORMS.map(f => `<option value="forme:${f}" ${it.modele === 'forme:' + f ? 'selected' : ''}>${SHAPES[f].icon} ${SHAPES[f].label}</option>`).join('');
      const models = lists.models.map(f => `<option value="${esc(f)}" ${it.modele === f ? 'selected' : ''}>📦 ${esc(f.replace(/\.glb$/i, ''))}</option>`).join('');
      const missing = it.modele && !it.modele.startsWith('forme:') && !lists.models.includes(it.modele) ? `<option value="${esc(it.modele)}" selected>⚠ ${esc(it.modele)} (introuvable)</option>` : '';
      const isForm = (it.modele || '').startsWith('forme:');
      const texs = Object.entries(TEXTURES).map(([k, t]) => `<option value="${k}" ${it.texture === k ? 'selected' : ''}>${t.label}</option>`).join('');
      const p = it.pos || [0, 0, 0], r = it.rot || [0, 0, 0];
      const slider = (lbl, f, i, min, max, step, v) => `<div class="sl"><span>${lbl}</span><input type="range" data-v3="${f}" data-i="${i}" min="${min}" max="${max}" step="${step}" value="${v}"><input type="number" data-v3="${f}" data-i="${i}" min="${min}" max="${max}" step="${step}" value="${fmt(v)}"></div>`;
      body += `<h3>Modèle 3D</h3>
        <div class="row"><select data-f="modele"><optgroup label="Vos modèles (dossier Accessoires)">${models || '<option disabled>— aucun : déposez des .glb —</option>'}</optgroup><optgroup label="Formes simples">${forms}</optgroup>${missing}</select></div>
        <div class="grid2"><button data-act="openAccessoires">📁 Dossier Accessoires</button><button data-x="lists">↻ Actualiser</button></div>
        ${isForm ? `<div class="row"><label>Couleur</label><input type="color" data-f="couleur" value="${esc(it.couleur || '#ffffff')}"><select data-f="texture">${texs}</select></div>` : ''}
        <h3>Accroché à</h3>${seg('point', POINTS, it.point || 'tete')}
        <h3>Position</h3>
        ${slider('← Gauche · Droite →', 'pos', 0, -0.6, 0.6, 0.005, +p[0] || 0)}
        ${slider('↓ Bas · Haut ↑', 'pos', 1, -0.6, 0.6, 0.005, +p[1] || 0)}
        ${slider('↙ Arrière · Avant ↗', 'pos', 2, -0.6, 0.6, 0.005, +p[2] || 0)}
        <h3>Rotation (degrés)</h3>
        ${slider('Pencher avant', 'rot', 0, -180, 180, 1, +r[0] || 0)}
        ${slider('Tourner', 'rot', 1, -180, 180, 1, +r[1] || 0)}
        ${slider('Incliner côté', 'rot', 2, -180, 180, 1, +r[2] || 0)}
        <div class="sl"><span>Taille</span><input type="range" data-f="taille" min="0.02" max="1" step="0.005" value="${+it.taille || 0.15}"><input type="number" data-f="taille" min="0.02" max="2" step="0.005" value="${fmt(+it.taille || 0.15)}"></div>
        <button data-x="resetPos">↺ Position par défaut</button>`;
    }
    const others = data.items.filter(o => o.id !== it.id && o.touche && normKey(o.touche) === normKey(it.touche));
    body += `<h3>Activation</h3>
      <div class="row"><label>Activé</label><button class="sw ${char.on.has(it.id) ? 'on' : ''}" data-on="${esc(it.id)}"></button><span class="muted">aussi dans les réglages</span></div>
      <div class="row"><label>Raccourci</label><span class="key ${capturing ? 'wait' : ''}">${capturing ? 'Appuyez…' : esc(it.touche || 'aucun')}</span>
        <button data-x="capture" ${host ? '' : 'disabled'}>${capturing ? 'Annuler' : '⌨ Choisir…'}</button>${it.touche ? '<button data-x="nokey" title="Supprimer le raccourci">✕</button>' : ''}</div>
      ${capturing ? '<p class="warn">Appuyez sur la combinaison voulue (ex. Ctrl + Maj + F1). Échap : annuler.</p>' : ''}
      <div class="row"><label>ou</label><select data-f="toucheListe"><option value="">une touche sans l'appuyer (F13…F24, souris…)</option>${
        [...Array.from({ length: 24 }, (_, i) => 'F' + (i + 1)), 'Souris4', 'Souris5', 'SourisMilieu', ...Array.from({ length: 10 }, (_, i) => 'Num' + i)]
          .map(k => `<option value="${k}">${k}</option>`).join('')}</select></div>
      ${others.length ? `<p class="warn">⚠ Même raccourci que « ${esc(others.map(o => o.nom).join(' », « '))} » : ils s'activeront ensemble.</p>` : ''}
      ${seg('maintien', { false: '👆 Appuyer = activer / désactiver', true: '⏬ Actif tant que la touche est enfoncée' }, String(!!it.maintien))}
      <p class="muted">Les raccourcis marchent partout, même en jeu. Ils ne bloquent pas la touche : préférez des combinaisons libres (Ctrl+Maj+F1…F12, pavé numérique).</p>
      <h3>Mii</h3>
      <div class="row"><select data-f="mii"><option value="">Tous les Mii</option><option value="${esc(lists.mii)}" ${it.mii === lists.mii ? 'selected' : ''}>Seulement ${esc(lists.mii.replace(/\.(glb|gltf)$/i, ''))}</option>${it.mii && it.mii !== lists.mii ? `<option value="${esc(it.mii)}" selected>Seulement ${esc(it.mii)}</option>` : ''}</select></div>
      <div class="grid2" style="margin-top:12px"><button data-x="dup">⧉ Dupliquer</button><button data-x="del" class="danger">🗑 Supprimer</button></div>`;
    right.innerHTML = body;
  }
  const normKey = k => (k || '').toLowerCase().replace(/shift/g, 'maj').split('+').map(s => s.trim()).sort().join('+');

  right.addEventListener('click', e => {
    const it = sel();
    if (!it) return;
    const on = e.target.closest('[data-on]');
    if (on) { toggleOn(on.dataset.on); return; }
    const act = e.target.closest('[data-act]');
    if (act) { host?.postMessage({ type: 'action', name: act.dataset.act }); return; }
    const img = e.target.closest('[data-img]');
    if (img) { it.image = img.dataset.img; save(); renderRight(); return; }
    const sg = e.target.closest('[data-seg] [data-v]');
    if (sg) {
      const key = sg.parentElement.dataset.seg, v = sg.dataset.v;
      if (key === 'parler' || key === 'maintien') it[key] = v === 'true';
      else if (key === 'point') {
        if (it.point !== v) Object.assign(it, JSON.parse(JSON.stringify(POINT_DEFAULTS[v] || POINT_DEFAULTS.tete)), { point: v });
        goView(v === 'tete' ? 'tete' : 'buste');
      } else it[key] = v;
      save(); renderLeft(); renderRight(); return;
    }
    const x = e.target.closest('[data-x]')?.dataset.x;
    if (!x) return;
    if (x === 'create') createInPaint(it);
    if (x === 'edit' && it.image) { host?.postMessage({ type: 'openPaint', file: it.image }); paintPending = true; setStatus('Paint ouvert : enregistrez puis revenez ici'); }
    if (x === 'reload') reloadImages();
    if (x === 'lists') fetchAll(false).then(() => { renderRight(); setStatus('Listes actualisées'); });
    if (x === 'resetPos') { Object.assign(it, JSON.parse(JSON.stringify(POINT_DEFAULTS[it.point] || POINT_DEFAULTS.tete)), { rot: [0, 0, 0] }); save(); renderRight(); }
    if (x === 'capture') { if (capturing) cancelCapture(); else { capturing = true; host?.postMessage({ type: 'captureKey' }); renderRight(); } }
    if (x === 'nokey') { it.touche = ''; save(); renderLeft(); renderRight(); }
    if (x === 'dup') {
      const copy = JSON.parse(JSON.stringify(it));
      copy.id = newId(); copy.nom = (it.nom || '') + ' (copie)'; copy.touche = '';
      data.items.splice(data.items.indexOf(it) + 1, 0, copy);
      save(); select(copy.id);
    }
    if (x === 'del' && confirm(`Supprimer « ${it.nom || 'cet ajout'} » ?\n(Les images et modèles 3D restent dans leurs dossiers.)`)) {
      const i = data.items.indexOf(it);
      data.items.splice(i, 1);
      selected = data.items[Math.min(i, data.items.length - 1)]?.id || null;
      setPreview(); save(); renderLeft(); renderRight();
    }
  });
  const onField = (e, final) => {
    const it = sel();
    const t = e.target;
    if (!it || !t.dataset) return;
    if (t.dataset.f === 'toucheListe') {
      if (final && t.value) { if (capturing) cancelCapture(); it.touche = t.value; save(); renderLeft(); renderRight(); }
      return;
    }
    if (t.dataset.f) {
      const f = t.dataset.f;
      if (f === 'taille') it.taille = Math.max(0.005, +t.value || 0.15);
      else if (f === 'mii') { if (t.value) it.mii = t.value; else delete it.mii; }
      else it[f] = t.value;
      if (f === 'taille') syncPair(t, it.taille);
      save();
      if (f === 'nom') renderLeft();
      if (final && (f === 'modele' || f === 'mii')) renderRight();
    } else if (t.dataset.v3) {
      const f = t.dataset.v3, i = +t.dataset.i;
      it[f] = (it[f] || [0, 0, 0]).slice();
      let v = +t.value || 0;
      syncPair(t, v);
      it[f][i] = v;
      save();
    }
  };
  const syncPair = (t, v) => {
    const sib = [...t.parentElement.querySelectorAll('input')].find(x => x !== t);
    if (sib) sib.value = sib.type === 'number' ? fmt(v) : v;
  };
  right.addEventListener('input', e => onField(e, false));
  right.addEventListener('change', e => onField(e, true));

  function cancelCapture() { capturing = false; host?.postMessage({ type: 'cancelCapture' }); renderRight(); }

  let paintPending = false;
  function faceImage() {
    const img = mii.face.baseImg;
    if (!img) return null;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  }
  function createInPaint(it) {
    const png = faceImage();
    if (!png) { setStatus("⚠ Visage du Mii introuvable (matériau « Mask »)"); return; }
    if (!host) { setStatus("Depuis l'appli seulement"); return; }
    host.postMessage({ type: 'saveExpression', name: it.nom || 'Expression', data: png, paint: true, id: it.id });
    setStatus('Copie du visage enregistrée, Paint s\'ouvre…');
  }
  async function reloadImages() {
    rev = Date.now();
    await fetchAll(false);
    mii.reloadExpressions();
    host?.postMessage({ type: 'reloadPerso' });
    renderRight();
    setStatus('↻ Images rechargées');
  }
  window.addEventListener('focus', () => { if (paintPending) { paintPending = false; reloadImages(); } });

  host?.addEventListener('message', e => {
    const m = e.data || {};
    if (m.type === 'keyCaptured') {
      capturing = false;
      const it = sel();
      if (it && m.combo) { it.touche = m.combo; save(); setStatus('Raccourci : ' + m.combo); }
      renderLeft(); renderRight();
    }
    if (m.type === 'expressionSaved') {
      const it = sel();
      fetchAll(false).then(() => {
        if (it && it.type === 'expression') { it.image = m.file; save(); }
        paintPending = true;
        renderRight();
        setStatus('Dessinez dans Paint, enregistrez (Ctrl+S), puis revenez ici');
      });
    }
    if (m.type === 'persoKey') {
      const it = data.items.find(i => i.id === m.id);
      if (it) {
        if (m.touche != null) it.touche = m.touche;
        if (m.maintien != null) it.maintien = m.maintien;
        renderLeft(); if (!capturing) renderRight();
      }
    }
    if (m.type === 'error') setStatus('⚠ ' + (m.message || 'erreur'));
  });

  let onSig = '';
  setInterval(() => {
    const s = [...char.on].sort().join('|');
    if (s !== onSig) { onSig = s; if (!capturing) { renderLeft(); renderRight(); } else renderLeft(); }
  }, 250);

  renderTop(); renderLeft(); renderRight();
  host?.postMessage({ type: 'ready' });
  window.charEditor = { get data() { return data; }, select, addItem, toggleOn };
}
