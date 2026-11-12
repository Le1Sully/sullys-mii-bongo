import * as THREE from 'three';
import { SLOTS, bonesOf, originalName, osFileName } from './squelette.js';
import { pageTabs } from './editor-pages.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const COLORS = { L: 0x3fb6ff, R: 0xff7a45, mid: 0xffd23f };

export function startBoneEditor(mii, opts = {}) {
  const { rig, camera, scene, renderer, CFG } = mii;
  const host = window.chrome?.webview;
  const canvas = renderer.domElement;
  const root = rig.root;
  const sq = rig.squelette;
  const native = !rig.custom;
  const bones = bonesOf(root);
  const byName = new Map();
  for (const b of bones) if (!byName.has(originalName(b))) byName.set(originalName(b), b);
  const depthOf = b => { let d = 0; for (let p = b.parent; p && p !== root; p = p.parent) d++; return d; };
  const minDepth = Math.min(...bones.map(depthOf));

  const fresh = () => ({ os: { ...(sq?.os || {}) }, demiTour: !!sq?.demiTour });
  let data = native ? { os: Object.fromEntries(SLOTS.filter(s => byName.has(s.id)).map(s => [s.id, s.id])), demiTour: false } : fresh();
  let focus = SLOTS[0].id, picking = null, dirty = false, closed = false;

  const css = document.createElement('style');
  css.textContent = `
    .os { position: fixed; z-index: 20; font: 13px/1.35 "Segoe UI", system-ui, sans-serif; color: #ececf1; user-select: none; }
    .os.panel { background: rgba(26,26,34,.95); border: 1px solid #34343f; border-radius: 12px; padding: 10px 12px; box-shadow: 0 6px 22px #0006; }
    .os h3 { margin: 12px 0 7px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #9b9bab; font-weight: 600; }
    .os h3:first-child { margin-top: 2px; }
    .os button, .os select, .os input { font: inherit; color: inherit; }
    .os button { background: #2a2a34; border: 1px solid #3a3a48; border-radius: 8px; padding: 6px 9px; cursor: pointer; }
    .os button:hover { border-color: #5a5a70; }
    .os button.on, .os button.primary { background: #d63a45; border-color: #d63a45; color: #fff; }
    .os button:disabled { opacity: .4; cursor: default; }
    .os select { background: #2a2a34; border: 1px solid #3a3a48; border-radius: 8px; padding: 4px 6px; flex: 1; min-width: 0; }
    #osLeft { top: 10px; left: 10px; width: 400px; bottom: 10px; overflow: hidden auto; }
    #osTop { top: 10px; left: 436px; right: 10px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 6px 8px; }
    .os .slot { display: grid; grid-template-columns: 118px 1fr 30px; gap: 5px; align-items: center; margin: 3px 0; padding: 2px 4px; border-radius: 8px; border: 1px solid transparent; }
    .os .slot.focus { background: #3a1f26; border-color: #d63a45; }
    .os .slot .n { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .os .slot .n i { color: #ff8a8a; font-style: normal; }
    .os .slot button { padding: 3px 0; }
    .os .muted { color: #9b9bab; font-size: 12px; }
    .os .warn { color: #e0b070; font-size: 12px; margin: 6px 0; }
    .os .ok { color: #7fd8a8; font-size: 12px; margin: 6px 0; }
    .os label.chk { display: flex; gap: 7px; align-items: flex-start; margin: 8px 0; cursor: pointer; }
    .os .row { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
    #osTag { position: fixed; z-index: 19; pointer-events: none; font: 600 12px "Segoe UI", sans-serif; color: #fff; background: #d63a45; padding: 2px 7px; border-radius: 6px; transform: translate(-50%, -150%); white-space: nowrap; display: none; }
    body.os-pick canvas { cursor: crosshair !important; }`;
  document.head.appendChild(css);

  const el = h => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
  const left = el(`<div id="osLeft" class="os panel"></div>`);
  const top = el(`<div id="osTop" class="os panel"></div>`);
  const tag = el(`<div id="osTag"></div>`);
  document.body.append(left, top, tag);

  const markers = new THREE.Group();
  markers.renderOrder = 20;
  scene.add(markers);
  const unit = (rig.modelBox?.getSize(V()).y || 1);
  const dotGeo = new THREE.SphereGeometry(unit * 0.008, 8, 6);
  const bigGeo = new THREE.SphereGeometry(unit * 0.018, 14, 10);
  const mk = (geo, color, opacity = 1) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity }));
    m.renderOrder = 20;
    markers.add(m);
    return m;
  };
  const dots = bones.map(b => ({ b, m: mk(dotGeo, 0x9b9bab, 0.55) }));
  const slotMarks = SLOTS.map(s => ({ s, m: mk(bigGeo, s.cote ? COLORS[s.cote] : COLORS.mid) }));
  const linkGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 12), 3));
  const links = new THREE.LineSegments(linkGeo, new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.7 }));
  links.renderOrder = 20;
  markers.add(links);
  const CHAINS = [['Spine_1', 'Head'], ['Arm_1_L', 'Arm_2_L'], ['Arm_2_L', 'Wrist_L'], ['Arm_1_R', 'Arm_2_R'], ['Arm_2_R', 'Wrist_R'],
    ['Leg_1_L', 'Leg_2_L'], ['Leg_2_L', 'Ankle_L'], ['Leg_1_R', 'Leg_2_R'], ['Leg_2_R', 'Ankle_R'], ['Spine_1', 'Arm_1_L'], ['Spine_1', 'Arm_1_R'], ['Spine_1', 'Leg_1_L']];

  const boneOf = id => byName.get(data.os[id]) || null;
  const wp = (o, out = V()) => { o.updateWorldMatrix(true, false); return out.setFromMatrixPosition(o.matrixWorld); };

  function tick() {
    if (closed) return;
    requestAnimationFrame(tick);
    for (const { b, m } of dots) wp(b, m.position);
    for (const { s, m } of slotMarks) {
      const b = boneOf(s.id);
      m.visible = !!b;
      if (b) wp(b, m.position);
      m.scale.setScalar(s.id === focus ? 1.8 : 1);
    }
    const arr = linkGeo.attributes.position.array;
    arr.fill(0);
    CHAINS.forEach(([a, c], i) => {
      const A = boneOf(a), C = boneOf(c);
      if (!A || !C) return;
      wp(A).toArray(arr, i * 6); wp(C).toArray(arr, i * 6 + 3);
    });
    linkGeo.attributes.position.needsUpdate = true;
    const fb = boneOf(focus);
    if (fb) {
      const p = wp(fb).project(camera);
      const r = canvas.getBoundingClientRect();
      tag.style.display = p.z < 1 ? 'block' : 'none';
      tag.style.left = (r.left + (p.x + 1) / 2 * r.width) + 'px';
      tag.style.top = (r.top + (1 - p.y) / 2 * r.height) + 'px';
      tag.textContent = SLOTS.find(s => s.id === focus).nom.replace(/^\S+\s/, '') + ' : ' + data.os[focus];
    } else tag.style.display = 'none';
  }

  const options = (() => {
    const list = [];
    root.traverse(o => { if (bones.includes(o)) list.push(o); });
    return list.map(b => {
      const n = originalName(b);
      return `<option value="${esc(n)}">${'  '.repeat(Math.min(12, depthOf(b) - minDepth))}${esc(n)}</option>`;
    }).join('');
  })();

  const missing = () => SLOTS.filter(s => (s.req || (s.jambe && SLOTS.some(x => x.jambe && data.os[x.id]))) && !data.os[s.id]);
  const dupes = () => {
    const seen = new Map(), out = [];
    for (const s of SLOTS) { const v = data.os[s.id]; if (!v) continue; if (seen.has(v)) out.push(`${s.nom} = ${seen.get(v)}`); else seen.set(v, s.nom); }
    return out;
  };

  function render() {
    if (native) {
      left.innerHTML = `<h3>🦴 Squelette</h3>
        <div class="ok">✓ ${esc(CFG.model)} est un Mii : ses os sont reconnus tout seuls, il n'y a rien à régler.</div>
        <p class="muted">Cette page sert aux autres modèles 3D riggés (Mixamo, VRoid, Blender…) déposés dans le dossier Mii. Choisissez-en un dans Réglages → Personnage, puis revenez ici pour vérifier ses os.</p>
        <p class="muted">Les points montrent les os reconnus : bleu = côté gauche du personnage, orange = côté droit, jaune = tête et dos.</p>`;
      left.style.bottom = 'auto';
      renderTop();
      return;
    }
    const miss = missing(), dup = dupes();
    left.innerHTML = `<h3>🦴 Squelette de ${esc(CFG.model.replace(/\.(glb|gltf|fbx|obj|dae|3mf|stl|ply|zip)$/i, ''))}</h3>
      <p class="muted">Indiquez quel os du modèle joue chaque rôle. « Gauche » = la gauche du personnage. Cliquez 🎯 puis cliquez sur le modèle pour choisir l'os le plus proche.</p>
      <label class="chk"><input type="checkbox" data-flip ${data.demiTour ? 'checked' : ''}><span>↩ Le modèle regarde vers l'arrière<br><span class="muted">le tourner de 180° (courant pour les modèles VRoid / VRM)</span></span></label>
      ${SLOTS.map(s => `<div class="slot ${s.id === focus ? 'focus' : ''}" data-slot="${s.id}">
        <span class="n" title="${esc(s.aide || '')}">${esc(s.nom)}${s.req ? ' <i>*</i>' : ''}</span>
        <select data-sel="${s.id}"><option value="">— aucun —</option>${options}</select>
        <button data-pick="${s.id}" class="${picking === s.id ? 'on' : ''}" title="Choisir en cliquant sur le modèle">🎯</button></div>`).join('')}
      <p class="muted"><i style="color:#ff8a8a;font-style:normal">*</i> obligatoire. Les jambes servent pour la chaise, le volant et le cinéma, la mâchoire pour parler au micro.</p>
      ${miss.length ? `<div class="warn">⚠ À choisir : ${esc(miss.map(s => s.nom.replace(/^\S+\s/, '')).join(', '))}</div>` : ''}
      ${dup.length ? `<div class="warn">⚠ Même os pour deux rôles : ${esc(dup.join(' · '))}</div>` : ''}
      ${!miss.length && !dup.length ? `<div class="ok">✓ Tous les os nécessaires sont choisis.</div>` : ''}
      ${sq?.problemes?.length ? `<div class="warn">${sq.problemes.map(esc).join('<br>')}</div>` : ''}
      <div class="row">
        <button data-a="save" class="primary" ${miss.length || dup.length ? 'disabled' : ''}>💾 Enregistrer et recharger</button>
        <button data-a="auto" title="Remettre ce que l'appli a reconnu toute seule">✨ Détection auto</button>
        ${sq?.fichier ? `<button data-a="reset" title="Supprimer le réglage enregistré (corbeille) et revenir à la détection automatique">↺ Oublier le réglage</button>` : ''}
      </div>
      <p class="muted">${sq?.fichier ? `Réglage enregistré dans Mii\\${esc(osFileName(CFG.model))}.` : 'Os reconnus automatiquement (rien d\'enregistré pour l\'instant).'} Le Mii reste le personnage conseillé : le visage animé (bouches dessinées, clignement) ne marche que sur les Mii.</p>`;
    for (const s of left.querySelectorAll('select[data-sel]')) s.value = data.os[s.dataset.sel] || '';
    renderTop();
  }
  function renderTop() {
    top.innerHTML = `${opts.seul ? pageTabs('perso') : ''}
      <b>🦴 Squelette</b>
      ${opts.seul ? `<span class="warn" style="margin:0">Le modèle ne peut pas encore bouger : choisissez ses os à gauche.</span>` : `<button data-a="close">✖ Fermer</button>`}
      <span class="muted" data-st></span>`;
  }
  const setStatus = t => { const s = top.querySelector('[data-st]'); if (s) s.textContent = t; };

  left.addEventListener('change', e => {
    const s = e.target.closest('select[data-sel]');
    if (s) { data.os[s.dataset.sel] = s.value; focus = s.dataset.sel; dirty = true; render(); return; }
    if (e.target.matches('[data-flip]')) { data.demiTour = e.target.checked; dirty = true; setStatus('Le demi-tour s\'appliquera après l\'enregistrement.'); }
  });
  left.addEventListener('click', e => {
    const p = e.target.closest('[data-pick]');
    if (p) { picking = picking === p.dataset.pick ? null : p.dataset.pick; focus = p.dataset.pick; document.body.classList.toggle('os-pick', !!picking); render(); setStatus(picking ? 'Cliquez sur le modèle…' : ''); return; }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a) { action(a); return; }
    const row = e.target.closest('[data-slot]');
    if (row && !e.target.closest('select') && row.dataset.slot !== focus) { focus = row.dataset.slot; render(); }
  });
  left.addEventListener('focusin', e => {
    const s = e.target.closest('select[data-sel]');
    if (s && s.dataset.sel !== focus) { focus = s.dataset.sel; for (const r of left.querySelectorAll('.slot')) r.classList.toggle('focus', r.dataset.slot === focus); }
  });
  top.addEventListener('click', e => { if (e.target.closest('[data-a]')?.dataset.a === 'close') close(); });

  function send(payload) {
    if (!host) { console.log('Squelette (hors appli) :', JSON.stringify(payload.data, null, 2)); setStatus("Hors de l'appli : réglage affiché dans la console, pas enregistré."); return; }
    host.postMessage({ type: 'saveBones', model: CFG.model, ...payload });
    setStatus('Enregistrement…');
  }
  function action(a) {
    if (a === 'save') {
      const os = {};
      for (const s of SLOTS) os[s.id] = data.os[s.id] || '';
      send({ data: { format: 'sullys-mii-bongo-squelette', version: 1, modele: CFG.model, demiTour: !!data.demiTour, os } });
    } else if (a === 'auto') {
      data = { os: { ...(sq?.auto?.os || {}) }, demiTour: !!sq?.auto?.demiTour };
      dirty = true;
      render();
      setStatus('Détection auto remise : enregistrez pour l\'appliquer.');
    } else if (a === 'reset') send({ data: null });
  }
  host?.addEventListener('message', e => {
    if (closed) return;
    if (e.data?.type === 'bonesSaved') { setStatus('✓ Enregistré, rechargement…'); setTimeout(() => location.reload(), 250); }
    if (e.data?.type === 'error') setStatus('⚠ ' + e.data.message);
  });

  const ray = new THREE.Raycaster();
  function pickAt(ev) {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
    const meshes = [];
    root.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
    const hit = ray.intersectObjects(meshes, false)[0];
    let best = null, bd = Infinity;
    for (const b of bones) {
      const p = wp(b);
      const d = hit ? p.distanceTo(hit.point) : ray.ray.distanceToPoint(p);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  const onDown = ev => {
    if (!picking || ev.button !== 0) return;
    ev.stopImmediatePropagation();
    ev.preventDefault();
    const b = pickAt(ev);
    if (b) { data.os[picking] = originalName(b); dirty = true; }
    picking = null;
    document.body.classList.remove('os-pick');
    render();
    setStatus(b ? `Os choisi : ${originalName(b)}` : '');
  };
  canvas.addEventListener('pointerdown', onDown, true);

  if (opts.seul) {
    const H = unit;
    const box = rig.modelBox || new THREE.Box3().setFromObject(root);
    const cam = { target: box.getCenter(V()), az: 20, el: 10, dist: H * 2.8 };
    const apply = () => {
      const az = THREE.MathUtils.degToRad(cam.az), el = THREE.MathUtils.degToRad(cam.el);
      camera.position.copy(cam.target).add(V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(cam.dist));
      camera.up.set(0, 1, 0);
      camera.lookAt(cam.target);
      camera.updateProjectionMatrix();
    };
    rig.editorCamera = apply;
    apply();
    let drag = null;
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.pan) {
        const k = cam.dist * 0.0016;
        cam.target.add(V().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(-dx * k)).add(V().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(dy * k));
      } else { cam.az -= dx * 0.4; cam.el = THREE.MathUtils.clamp(cam.el + dy * 0.3, -60, 85); }
      apply();
    });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(e.deltaY * 0.0012), H * 0.2, H * 20); apply(); }, { passive: false });
    const st = document.getElementById('status');
    if (st) st.style.display = 'none';
  }

  function close() {
    if (dirty && !confirm('Fermer sans enregistrer les changements du squelette ?')) return;
    closed = true;
    canvas.removeEventListener('pointerdown', onDown, true);
    document.body.classList.remove('os-pick');
    scene.remove(markers);
    markers.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    left.remove(); top.remove(); tag.remove(); css.remove();
    opts.onClose?.();
  }

  render();
  tick();
  window.osEditor = { get data() { return data; }, action, close, pickAt };
  return { close };
}
