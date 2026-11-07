import * as THREE from 'three';
import {
  INPUTS, VIEWS, FILL_SHAPES, BUILTIN_PADS, BUILTIN_MODELS, PAD_WIDTH,
  loadSource, buildController, makeControls, zoneShape, xboxProfile, emptyProfile, mainTexture,
} from './pad-profile.js';
import { TEXTURES, textureCanvas } from './scene-objects.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const fmt = v => (Math.round(v * 100) / 100).toString();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const host = window.chrome?.webview;
const $ = s => document.querySelector(s);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const themeBg = () => renderer.setClearColor({ wii: 0xe4e7ea, carnet: 0xebe2cf }[window.uiTheme?.()] ?? 0x1e1f26);
themeBg();
addEventListener('uitheme', themeBg);
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x555566, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(80, 160, 220); scene.add(sun);
const back = new THREE.DirectionalLight(0xffffff, 0.6); back.position.set(-120, 80, -200); scene.add(back);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 1, 5000);
const cam = { az: 0, el: 35, dist: 330, target: V() };
function applyCamera() {
  const a = THREE.MathUtils.degToRad(cam.az), e = THREE.MathUtils.degToRad(cam.el);
  camera.position.copy(cam.target).add(V(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(cam.dist));
  camera.lookAt(cam.target);
}
applyCamera();
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const guides = new THREE.Group();
const label = (text, color) => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d'); g.font = 'bold 30px Segoe UI'; g.fillStyle = color; g.textAlign = 'center'; g.fillText(text, 128, 42);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); s.scale.set(64, 16, 1);
  return s;
};
guides.add(new THREE.ArrowHelper(V(0, 0, 1), V(0, 0, 0), 110, 0x3f8cff, 14, 9));
guides.add(new THREE.ArrowHelper(V(0, 1, 0), V(0, 0, 0), 95, 0xff9a3f, 14, 9));
guides.add(new THREE.ArrowHelper(V(1, 0, 0), V(0, 0, 0), 100, 0xd63a45, 14, 9));
{ const a = label('Face (boutons)', '#6fa8ff'); a.position.set(0, 0, 125); guides.add(a); }
{ const a = label('Gâchettes', '#ffb46f'); a.position.set(0, 108, 0); guides.add(a); }
{ const a = label('Droite', '#ff6f78'); a.position.set(114, 0, 0); guides.add(a); }
guides.traverse(o => { if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 9; });
scene.add(guides);

const outline = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false }));
outline.renderOrder = 10;
scene.add(outline);

let list = { profiles: [], models: [], hidden: [] };
let activeId = null;
let current = null;
let source = null, sourceKey = '', built = null, controls = null;
let tab = 'pieces', selected = null, selectedFill = null, placing = false, tint = true;
let status = '';
const undo = [];

const setStatus = t => { status = t; const s = $('.st'); if (s) s.textContent = t; };

let userImages = [];
const swatch = {};
for (const k of Object.keys(TEXTURES)) { const c = document.createElement('canvas'); c.width = c.height = 48; c.getContext('2d').drawImage(textureCanvas(k), 0, 0, 512, 512, 0, 0, 48, 48); swatch[k] = c.toDataURL(); }
async function refreshList() {
  list = await fetch('./api/manettes', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ profiles: [], models: [], hidden: [] }));
  userImages = await fetch('./api/textures', { cache: 'no-store' }).then(r => r.json()).catch(() => []);
  activeId = await fetch('./api/config', { cache: 'no-store' }).then(r => r.json()).then(c => c.padModel).catch(() => null);
  renderLeft();
}

async function openPad(entry) {
  selected = null; selectedFill = null; placing = false;
  if (entry.builtin) {
    current = { id: entry.id, builtin: true, profile: null };
    await showBuiltin(entry.id);
    setStatus('Manette intégrée : dupliquez-la pour la modifier');
  } else {
    const profile = await fetch('./manettes/' + encodeURIComponent(entry.file), { cache: 'no-store' }).then(r => r.json());
    profile.pieces ||= []; profile.formes ||= []; profile.apparence ||= {}; profile.tenue ||= {};
    current = { id: 'perso:' + entry.file, file: entry.file, builtin: false, profile };
    undo.length = 0;
    lastSaved = JSON.stringify(profile);
    await rebuild(true);
    setStatus('');
  }
  renderLeft(); renderRight(); renderTop();
}

async function showBuiltin(id) {
  const modele = id === '8bitdo' ? 'builtin:8bitdo' : 'builtin:xbox';
  const src = await getSource({ modele, orientation: [0, 0, 0] });
  const p = id === '8bitdo' ? emptyProfile(modele, '8BitDo') : xboxProfile(src.raw, id === 'xbox25');
  await showBuilt(p, src);
}

async function getSource(profile) {
  const key = profile.modele + '|' + (profile.orientation || []).join(',');
  if (key !== sourceKey) { setStatus('Chargement du modèle…'); source = await loadSource(profile); sourceKey = key; }
  return source;
}

let rebuildTimer = null, rebuildSeq = 0;
function rebuild(now = false) {
  clearTimeout(rebuildTimer);
  return new Promise(res => {
    rebuildTimer = setTimeout(async () => {
      const seq = ++rebuildSeq;
      if (!current?.profile) return res();
      setStatus('Découpe…');
      const src = await getSource(current.profile);
      if (seq !== rebuildSeq) return res();
      await showBuilt(current.profile, src);
      setStatus(saveTimer ? '…' : '✓ Enregistré');
      res();
    }, now ? 0 : 280);
  });
}

async function showBuilt(profile, src) {
  const b = await buildController(profile, src);
  if (built) { scene.remove(built.model); built.model.traverse(o => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach(m => m.dispose()); } }); }
  built = b; controls = makeControls(built);
  scene.add(built.model);
  applyTint(); drawOutline();
}

function applyTint() {
  if (!built) return;
  const ids = Object.keys(built.parts);
  for (const [i, id] of ids.entries()) {
    const p = built.parts[id];
    const on = tint && id !== 'shell';
    const col = new THREE.Color().setHSL((i * 0.137) % 1, 0.8, 0.55);
    for (const m of p.mats) if (m.emissive) {
      m.userData.baseEmissive ||= m.emissive.clone();
      m.emissive.copy(on ? col : m.userData.baseEmissive);
      m.emissiveIntensity = on ? (id === selected ? 0.55 : 0.22) : 0;
      if (on && m.emissiveMap) { m.userData.emap ||= m.emissiveMap; m.emissiveMap = null; m.needsUpdate = true; }
      if (!on && m.userData.emap && !m.emissiveMap) { m.emissiveMap = m.userData.emap; m.needsUpdate = true; }
    }
  }
}
const partColor = id => { const ids = built ? Object.keys(built.parts) : []; const i = ids.indexOf(id); return i < 0 ? '#888' : '#' + new THREE.Color().setHSL((i * 0.137) % 1, 0.8, 0.55).getHexString(); };

function drawOutline() {
  const z = current?.profile?.pieces.find(p => p.id === selected) || (!current?.profile && null);
  outline.visible = !!z;
  if (!z) return;
  const view = VIEWS[z.view] || VIEWS.face, a = V(...view.a), u = V(...view.u), v = V(...view.v);
  const part = built?.parts[z.id];
  let top = (z.depth?.[0] ?? 0) + 2;
  if (part && !part.bb.isEmpty()) top = Math.max(top, part.anchor.getWorldPosition(V()).dot(a) + 0.6);
  const pts = [], [cu, cv] = z.center || [0, 0];
  const add = (du, dv) => pts.push(u.clone().multiplyScalar(cu + du).add(v.clone().multiplyScalar(cv + dv)).add(a.clone().multiplyScalar(top)));
  if (z.shape === 'circle') for (let i = 0; i < 64; i++) { const t = i / 64 * Math.PI * 2; add(Math.cos(t) * z.r, Math.sin(t) * z.r); }
  else {
    const f = zoneShape({ ...z, center: [0, 0], view: 'face' });
    for (let i = 0; i < 96; i++) {
      const t = i / 96 * Math.PI * 2, dx = Math.cos(t), dy = Math.sin(t);
      let lo = 0, hi = 400;
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (f([dx * m, dy * m, 0]) > 0) lo = m; else hi = m; }
      add(dx * lo, dy * lo);
    }
  }
  outline.geometry.dispose();
  outline.geometry = new THREE.BufferGeometry().setFromPoints(pts);
}

let saveTimer = null;
function changed(rebuildNeeded = true) {
  if (!current?.profile) return;
  undo.push(lastSaved); if (undo.length > 60) undo.shift();
  lastSaved = JSON.stringify(current.profile);
  clearTimeout(saveTimer);
  setStatus('…');
  saveTimer = setTimeout(() => { saveTimer = null; host?.postMessage({ type: 'savePad', file: current.file, data: current.profile }); setStatus('✓ Enregistré'); }, 500);
  if (rebuildNeeded) rebuild(); else { applyTint(); drawOutline(); }
  renderTop();
}
let lastSaved = '';
function doUndo() {
  if (!undo.length || !current?.profile) return;
  current.profile = JSON.parse(undo.pop());
  lastSaved = JSON.stringify(current.profile);
  host?.postMessage({ type: 'savePad', file: current.file, data: current.profile });
  rebuild(); renderRight(); renderTop();
}

function fitContour(z) {
  if (!source) return false;
  const view = VIEWS[z.view] || VIEWS.face, a = view.a, u = view.u, v = view.v;
  const [cu, cv] = z.center, R = 26, S = 0.12, N = Math.round(2 * R / S);
  const H = new Float32Array(N * N).fill(-1e9);
  const p = [V(), V(), V()];
  for (const m of source.meshes) {
    const pos = m.geometry.attributes.position, idx = m.geometry.index;
    const tri = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < tri; t++) {
      const q = [0, 1, 2].map(k => idx ? idx.getX(t * 3 + k) : t * 3 + k);
      const P2 = q.map(i => { const x = pos.getX(i), y = pos.getY(i), w = pos.getZ(i); return [(x * u[0] + y * u[1] + w * u[2] - cu + R) / S, (x * v[0] + y * v[1] + w * v[2] - cv + R) / S, x * a[0] + y * a[1] + w * a[2]]; });
      const minX = Math.max(0, Math.floor(Math.min(P2[0][0], P2[1][0], P2[2][0]))), maxX = Math.min(N - 1, Math.ceil(Math.max(P2[0][0], P2[1][0], P2[2][0])));
      const minY = Math.max(0, Math.floor(Math.min(P2[0][1], P2[1][1], P2[2][1]))), maxY = Math.min(N - 1, Math.ceil(Math.max(P2[0][1], P2[1][1], P2[2][1])));
      if (minX > maxX || minY > maxY) continue;
      const [x0, y0, z0] = P2[0], [x1, y1, z1] = P2[1], [x2, y2, z2] = P2[2];
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (Math.abs(area) < 1e-9) continue;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const w0 = ((x1 - x) * (y2 - y) - (x2 - x) * (y1 - y)) / area, w1 = ((x2 - x) * (y0 - y) - (x0 - x) * (y2 - y)) / area, w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const h = w0 * z0 + w1 * z1 + w2 * z2, k = y * N + x; if (h > H[k]) H[k] = h;
      }
    }
  }
  const hz = (du, dv) => { const i = Math.round((du + R) / S), j = Math.round((dv + R) / S); if (i < 0 || j < 0 || i >= N || j >= N) return null; const h = H[j * N + i]; return h < -1e8 ? null : h; };
  const h0 = hz(0, 0); if (h0 == null) return false;
  const edge = [], floors = [];
  for (let k = 0; k < 72; k++) {
    const t = k / 72 * Math.PI * 2, dx = Math.cos(t), dy = Math.sin(t);
    const prof = []; for (let r = 0.6; r <= R - 1; r += 0.1) prof.push([r, hz(dx * r, dy * r)]);
    let found = null;
    for (let i = 0; i < prof.length && !found; i++) {
      const [r, h] = prof[i]; if (h == null) { found = [r, h0 - 3]; break; }
      if (h < h0 - 2.5) { found = [r, h]; break; }
      const w = prof.filter(q => Math.abs(q[0] - r) <= 1.2 && q[1] != null);
      if (w.length < 10 || r < 1.5) continue;
      const mean = w.reduce((s, q) => s + q[1], 0) / w.length;
      const isMin = w.every(q => q[1] >= h - 1e-6);
      if (isMin && h - mean < -0.12) found = [r, h];
    }
    if (found) { edge.push([dx * found[0], dy * found[0]]); floors.push(found[1]); }
  }
  if (edge.length < 20) return false;
  const covering = () => {
    const d = edge.map(([x, y]) => Math.hypot(x, y)).sort((x, y) => x - y);
    const r = d[Math.floor(d.length * 0.85)];
    if (!(r > 0.8)) return false;
    floors.sort((x, y) => x - y);
    z.shape = 'circle'; z.r = Math.round(r * 100) / 100;
    z.depth = [Math.round((floors[Math.floor(floors.length / 2)] - 1.5) * 10) / 10, null];
    return true;
  };
  let pts = edge, cx = 0, cy = 0, rr = 0;
  for (let pass = 0; pass < 2; pass++) {
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0; const n = pts.length;
    for (const [x, y] of pts) { const q = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * q; syz += y * q; sz += q; }
    const M = new THREE.Matrix3().set(sxx, sxy, sx, sxy, syy, sy, sx, sy, n).invert();
    const s = new THREE.Vector3(sxz, syz, sz).applyMatrix3(M);
    cx = s.x / 2; cy = s.y / 2; rr = Math.sqrt(Math.max(0, s.z + cx * cx + cy * cy));
    pts = pts.filter(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - rr) < 1.2);
    if (pts.length < Math.max(12, edge.length * 0.45)) return covering();
  }
  if (!(rr > 0.8 && rr < R - 2)) return covering();
  floors.sort((x, y) => x - y);
  z.shape = 'circle'; z.center = [cu + cx, cv + cy]; z.r = Math.round(rr * 100) / 100;
  z.depth = [Math.round((floors[Math.floor(floors.length / 2)] - 1.5) * 10) / 10, null];
  return true;
}

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const hitModel = e => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return built ? ray.intersectObject(built.model, true)[0] : null;
};
let drag = null;
canvas.addEventListener('pointerdown', e => {
  try { canvas.setPointerCapture(e.pointerId); } catch { }
  drag = { x: e.clientX, y: e.clientY, az: cam.az, el: cam.el, target: cam.target.clone(), button: e.button, moved: false, shift: e.shiftKey };
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 3) drag.moved = true;
  if (!drag.moved) return;
  if (drag.button === 1 || drag.shift) {
    const k = cam.dist / canvas.clientHeight;
    const right = V().setFromMatrixColumn(camera.matrixWorld, 0), up = V().setFromMatrixColumn(camera.matrixWorld, 1);
    cam.target.copy(drag.target).addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
  } else {
    cam.az = drag.az - dx * 0.4; cam.el = THREE.MathUtils.clamp(drag.el + dy * 0.3, -89, 89);
  }
  applyCamera();
});
canvas.addEventListener('pointerup', e => {
  const d = drag; drag = null;
  if (!d || d.moved || d.button !== 0) return;
  const hit = hitModel(e);
  if (placing && hit && current?.profile) { placeZone(hit); return; }
  if (!hit) { select(null); return; }
  let o = hit.object; while (o && !Object.values(built.parts).some(p => p.obj === o)) o = o.parent;
  const part = o && Object.values(built.parts).find(p => p.obj === o);
  if (hit.object.userData.fillId) { selectedFill = hit.object.userData.fillId; tab = 'formes'; renderRight(); return; }
  select(part ? part.id : null);
});
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = THREE.MathUtils.clamp(cam.dist * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 60, 2000); applyCamera(); }, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea') || $('.modal')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
  if (e.key === 'Escape') { placing = false; select(null); renderTop(); }
  if ((e.key === 'Delete') && selected && selected !== 'shell') removePiece(selected);
});

function select(id) { selected = id; if (id) tab = 'pieces'; applyTint(); drawOutline(); renderRight(); }

function placeZone(hit) {
  placing = false;
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const p = hit.point;
  const viewName = n.z > 0.35 ? 'face' : n.z < -0.6 ? 'back'
    : Math.abs(n.y) >= Math.abs(n.x) ? (n.y > 0 ? 'top' : 'bottom') : (n.x > 0 ? 'right' : 'left');
  const view = VIEWS[viewName];
  const P = [p.x, p.y, p.z], d = (A) => A[0] * P[0] + A[1] * P[1] + A[2] * P[2];
  const prof = current.profile;
  let k = 1; while (prof.pieces.some(z => z.id === 'p' + k)) k++;
  const z = { id: 'p' + k, nom: 'Pièce ' + k, view: viewName, shape: 'circle', center: [d(view.u), d(view.v)], r: 5, depth: [d(view.a) - 3, null], input: '' };
  const ok = fitContour(z);
  prof.pieces.push(z);
  selected = z.id; tab = 'pieces';
  setStatus(ok ? '📐 Contour trouvé' : 'Contour non trouvé : réglez la taille à la main');
  changed(); renderRight(); renderTop();
}

function removePiece(id) {
  const prof = current?.profile; if (!prof) return;
  prof.pieces = prof.pieces.filter(z => z.id !== id);
  delete prof.apparence[id];
  for (const f of prof.formes) if (f.attache === id) f.attache = 'shell';
  selected = null; changed(); renderRight();
}

const pad = { b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, at: 0, ok: null, s: '' };
function connect() {
  let ws;
  try { ws = new WebSocket(`ws://${location.host}/ws`); } catch { return setTimeout(connect, 2000); }
  ws.onmessage = e => {
    if (typeof e.data !== 'string') return;
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'pad') { Object.assign(pad, m, { at: performance.now() }); }
    if (m.t === 'pads') { pad.ok = m.ok; pad.s = m.s; renderPadState(); }
    if (m.t === 'cfg' && m.c?.theme) window.setUiTheme?.(m.c.theme);
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
connect();
let lastPressed = '';
function renderPadState() {
  const el = $('#padTest'); if (!el) return;
  const names = Object.entries(INPUTS).filter(([, i]) => i.mask && (pad.b & i.mask)).map(([k]) => k);
  if (pad.lt > 0.1) names.push('LT'); if (pad.rt > 0.1) names.push('RT');
  if (Math.hypot(pad.lx, pad.ly) > 0.3) names.push('LSTICK'); if (Math.hypot(pad.rx, pad.ry) > 0.3) names.push('RSTICK');
  const key = names.join(',') + pad.s;
  if (key === lastPressed) return; lastPressed = key;
  el.innerHTML = names.length ? names.map(n => `<span>${esc(INPUTS[n]?.label.split(' (')[0] || n)}</span>`).join('') : `<span style="background:none;color:var(--muted)">${esc(pad.ok === false ? pad.s || 'aucune manette' : 'appuyez sur des boutons…')}</span>`;
  document.querySelectorAll('.map label[data-in]').forEach(l => l.classList.toggle('lit', names.includes(l.dataset.in) || (l.dataset.in === 'DPAD' && names.some(n => n.startsWith('D') && n !== 'DPAD'))));
}

const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (controls) {
    const fresh = performance.now() - pad.at < 1500;
    for (const c of controls.controls) {
      const down = fresh && (pad.b & c.mask) !== 0;
      c.k += ((down ? 1 : 0) - c.k) * (1 - Math.exp(-(down ? 40 : 18) * dt));
      if (!tint || !c.mats) c.apply(c.k); else c.obj.position.copy(c.base).addScaledVector(c.view.a, -c.k * 1.4);
    }
    controls.updateDpad();
    controls.ls.tilt(fresh ? pad.lx : 0, fresh ? pad.ly : 0);
    controls.rs.tilt(fresh ? pad.rx : 0, fresh ? pad.ry : 0);
    controls.triggers.L.apply(fresh ? pad.lt || 0 : 0); controls.triggers.R.apply(fresh ? pad.rt || 0 : 0);
    if (tint) applyTint();
  }
  guides.visible = tab === 'modele';
  renderPadState();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

const left = document.createElement('div'); left.id = 'left'; left.className = 'panel';
const right = document.createElement('div'); right.id = 'right'; right.className = 'panel';
const top = document.createElement('div'); top.id = 'top'; top.className = 'panel';
const help = document.createElement('div'); help.id = 'help';
help.innerHTML = 'Clic droit (ou glisser dans le vide) : tourner · <b>Maj</b> + glisser ou clic molette : déplacer la vue · molette : zoom · clic : choisir une pièce · <b>Ctrl+Z</b> : annuler · <b>Suppr</b> : supprimer la pièce';
const made = document.createElement('div'); made.className = 'madeby'; made.textContent = 'Made with AI';
document.body.append(left, right, top, help, made);

function renderTop() {
  const editable = current && !current.builtin;
  top.innerHTML = `<b>🎮 Éditeur de manettes</b>
    <button data-t="place" class="${placing ? 'on' : ''}" ${editable ? '' : 'disabled'} title="Puis cliquez sur le modèle, là où se trouve le bouton">＋ Ajouter une pièce</button>
    <button data-t="tint" class="${tint ? 'on' : ''}" title="Colorer chaque pièce pour bien voir la découpe">🎨 Repérer les pièces</button>
    <button data-t="undo" ${undo.length && editable ? '' : 'disabled'}>↶ Annuler</button>
    <button data-t="view" title="Vue de face">⤢ Face</button>
    <span class="st">${esc(status)}</span>`;
}
top.addEventListener('click', e => {
  const t = e.target.closest('[data-t]')?.dataset.t; if (!t) return;
  if (t === 'place') { placing = !placing; setStatus(placing ? 'Cliquez sur le modèle, au milieu du bouton…' : ''); }
  if (t === 'tint') { tint = !tint; applyTint(); }
  if (t === 'undo') doUndo();
  if (t === 'view') { Object.assign(cam, { az: 0, el: 35, dist: 330, target: V() }); applyCamera(); }
  renderTop();
});

function renderLeft() {
  const hidden = new Set(list.hidden || []);
  const item = (id, label, sub, extra = '') => `<button data-open="${esc(id)}" class="${current?.id === id ? 'on' : ''}">${activeId === id ? '✅' : '🎮'} ${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}${extra}</button>`;
  left.innerHTML = `<h3>Manettes</h3>
    <div class="list">${BUILTIN_PADS.map(p => item(p.id, p.nom, hidden.has(p.id) ? 'masquée' : 'intégrée')).join('')}
    ${list.profiles.map(p => item('perso:' + p.file, p.nom || p.file, '')).join('') || ''}</div>
    <div class="grid2" style="margin-top:10px">
      <button data-l="new" class="primary">➕ Nouvelle</button>
      <button data-l="dup" ${current ? '' : 'disabled'}>⧉ Dupliquer</button>
      <button data-l="use" ${current ? '' : 'disabled'} title="Le Mii tient cette manette">✓ Utiliser</button>
      ${current?.builtin
        ? `<button data-l="hide">${hidden.has(current?.id) ? '👁 Montrer' : '🙈 Masquer'}</button>`
        : `<button data-l="del" ${current ? '' : 'disabled'} title="Vers la corbeille de Windows">🗑 Supprimer</button>`}
    </div>
    <div class="grid2" style="margin-top:6px"><button data-l="folder">📁 Dossier</button><button data-l="refresh">↻ Actualiser</button></div>
    <div class="muted" style="margin-top:10px">Votre propre modèle : déposez un fichier <b>.glb</b> dans le dossier <b>Manettes</b>, puis <b>➕ Nouvelle</b>.</div>
    <div class="muted" style="margin-top:6px">Les manettes intégrées ne se modifient pas : <b>Dupliquer</b> en fait une copie modifiable.</div>`;
}
left.addEventListener('click', async e => {
  const open = e.target.closest('[data-open]')?.dataset.open;
  if (open) {
    const b = BUILTIN_PADS.find(p => p.id === open);
    await openPad(b || { file: open.slice(6) });
    return;
  }
  const l = e.target.closest('[data-l]')?.dataset.l; if (!l) return;
  if (l === 'new') showNew();
  if (l === 'dup') duplicate();
  if (l === 'use') { host?.postMessage({ type: 'usePad', id: current.id }); activeId = current.id; renderLeft(); setStatus('✓ Le Mii tient cette manette'); }
  if (l === 'del') {
    if (!confirm(`Supprimer « ${current.profile.nom} » ? (le fichier va dans la corbeille)`)) return;
    host?.postMessage({ type: 'deletePad', file: current.file });
    current = null; built && scene.remove(built.model); built = null; controls = null;
    setTimeout(refreshList, 400); renderRight(); renderTop();
  }
  if (l === 'hide') { const h = new Set(list.hidden || []); h.has(current.id) ? h.delete(current.id) : h.add(current.id); list.hidden = [...h]; host?.postMessage({ type: 'hidePads', ids: list.hidden }); renderLeft(); }
  if (l === 'folder') host?.postMessage({ type: 'action', name: 'openManettes' });
  if (l === 'refresh') refreshList();
});

function modal(html, onClick) {
  document.querySelector('.modal')?.remove();
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="box panel">${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m) m.remove(); else onClick(e, m); });
  document.body.appendChild(m);
  return m;
}
function showNew() {
  const models = [...Object.entries(BUILTIN_MODELS).map(([k, v]) => [k, v.label + ' (intégré)']), ...list.models.map(f => [f, f])];
  modal(`<h2>➕ Nouvelle manette</h2>
    <div class="row"><label>Nom</label><input type="text" id="nNom" value="Ma manette"></div>
    <div class="row"><label>Modèle 3D</label><select id="nModele">${models.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select></div>
    <div class="muted">Votre modèle n'est pas dans la liste ? Déposez le fichier <b>.glb</b> dans le dossier <b>Manettes</b> (bouton 📁), puis ↻ Actualiser.</div>
    <div class="muted" style="margin-top:6px">Ensuite : onglet <b>Modèle</b> pour l'orienter, puis <b>＋ Ajouter une pièce</b> pour chaque bouton.</div>
    <div class="btns"><button data-x>Annuler</button><button data-go class="primary">Créer</button></div>`,
    (e, m) => {
      if (e.target.closest('[data-x]')) m.remove();
      if (e.target.closest('[data-go]')) {
        const p = emptyProfile(m.querySelector('#nModele').value, m.querySelector('#nNom').value.trim() || 'Ma manette');
        m.remove(); create(p, 'modele');
      }
    });
}
async function duplicate() {
  let p;
  if (current.builtin) {
    if (current.id === '8bitdo') p = emptyProfile('builtin:8bitdo', '8BitDo (copie)');
    else { const src = await getSource({ modele: 'builtin:xbox', orientation: [0, 0, 0] }); p = xboxProfile(src.raw, current.id === 'xbox25'); }
  } else { p = JSON.parse(JSON.stringify(current.profile)); p.nom += ' (copie)'; }
  create(p, 'pieces');
}
async function textureAction(a) {
  const P = current?.profile; if (!P) return;
  if (a === 'folder') { host?.postMessage({ type: 'action', name: 'openManettes' }); return; }
  if (a === 'reload') { P.textureRev = (P.textureRev || 0) + 1; changed(); setStatus('↻ Texture rechargée'); return; }
  if (a === 'paint' && P.texture) { host?.postMessage({ type: 'openPaint', file: P.texture }); setStatus('🖌 Ouverte dans Paint : enregistrez, puis ↻ Recharger'); return; }
  const src = await getSource(P), t = mainTexture(src);
  if (!t?.image) { setStatus("Ce modèle n'a pas de texture"); return; }
  setStatus('Export de la texture…');
  const c = document.createElement('canvas'); c.width = t.image.width; c.height = t.image.height;
  c.getContext('2d').drawImage(t.image, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  if (!host) { setStatus("Export : depuis l'appli seulement"); return; }
  host.postMessage({ type: 'saveTexture', name: (P.nom || 'manette') + ' - texture.png', data, paint: a === 'paint' });
}

let pendingTab = 'pieces';
function create(profile, nextTab) { pendingTab = nextTab; host ? host.postMessage({ type: 'createPad', data: profile }) : setStatus("Créer : depuis l'appli seulement"); }
host?.addEventListener('message', async e => {
  const m = e.data || {};
  if (m.type === 'padCreated') { await refreshList(); await openPad({ file: m.file }); tab = pendingTab; renderRight(); setStatus('✓ Manette créée'); }
  if (m.type === 'error') setStatus('⚠ ' + (m.message || 'erreur'));
  if (m.type === 'textureSaved' && current?.profile) {
    current.profile.texture = m.file; await refreshList(); changed(); renderRight();
    setStatus(m.paint ? '🖌 Ouverte dans Paint : enregistrez, puis ↻ Recharger' : '📤 Exportée : ' + m.file);
  }
});

const num = (k, val, step, lbl) => `<div>${lbl}<input type="number" step="${step}" data-n="${k}" value="${fmt(val)}"></div>`;
function renderRight() {
  if (!current) { right.innerHTML = `<h3>Bienvenue</h3><div class="muted">Choisissez une manette à gauche, ou créez-en une.</div>`; return; }
  if (current.builtin) {
    right.innerHTML = `<h3>${esc(BUILTIN_PADS.find(p => p.id === current.id)?.nom)}</h3>
      <div class="muted">Manette intégrée à l'appli. Pour changer ses pièces, ses boutons ou ses couleurs : <b>⧉ Dupliquer</b> (à gauche), puis modifiez la copie.</div>
      <h3>Tester</h3><div class="pressed" id="padTest"></div>
      <div class="muted">Appuyez sur les boutons de votre manette : ils s'enfoncent sur l'aperçu.</div>`;
    lastPressed = ''; return;
  }
  const P = current.profile;
  const tabs = [['modele', 'Modèle'], ['pieces', 'Pièces'], ['formes', 'Formes'], ['boutons', 'Boutons']];
  let body = '';
  if (tab === 'modele') {
    const o = P.orientation || [0, 0, 0], t = P.tenue || {};
    body = `<div class="row"><label>Nom</label><input type="text" data-f="nom" value="${esc(P.nom)}"></div>
      <div class="muted">Modèle : ${esc(BUILTIN_MODELS[P.modele]?.label || P.modele)}</div>
      <h3>Orientation</h3>
      <div class="muted">Tournez le modèle pour que ses boutons regardent la flèche <b style="color:#6fa8ff">bleue</b> et ses gâchettes la flèche <b style="color:#ffb46f">orange</b>.</div>
      <div class="grid3" style="margin-top:8px">
        <button data-rot="0,90">↻ X</button><button data-rot="1,90">↻ Y</button><button data-rot="2,90">↻ Z</button>
        <button data-rot="0,-90">↺ X</button><button data-rot="1,-90">↺ Y</button><button data-rot="2,-90">↺ Z</button>
      </div>
      <div class="row"><label>Réglage fin</label><div class="trio">${num('o.0', o[0], 1, 'X (°)')}${num('o.1', o[1], 1, 'Y (°)')}${num('o.2', o[2], 1, 'Z (°)')}</div></div>
      ${P.pieces.length ? '<div class="warn">Tourner le modèle déplace aussi ses pièces déjà délimitées : orientez-le avant de délimiter.</div>' : ''}
      <h3>Dans les mains du Mii</h3>
      <div class="row"><label>Taille</label><input type="range" min="0.5" max="1.8" step="0.05" data-t="taille" value="${t.taille ?? 1}"><span class="muted">×${fmt(t.taille ?? 1)}</span></div>
      <div class="row"><label>Hauteur</label><input type="range" min="-0.4" max="0.4" step="0.02" data-t="hauteur" value="${t.hauteur ?? 0}"><span class="muted">${fmt(t.hauteur ?? 0)}</span></div>
      <div class="row"><label>Inclinaison</label><input type="range" min="-40" max="40" step="1" data-t="inclinaison" value="${t.inclinaison ?? 0}"><span class="muted">${fmt(t.inclinaison ?? 0)}°</span></div>
      <div class="row"><label>Lumière</label><input type="color" data-f="lumiere" value="${P.lumiere || '#ffffff'}"><span class="muted">bouton pressé</span></div>
      <h3>Texture du modèle</h3>
      <div class="muted">Modifiez la vraie texture de la manette dans Paint (ou un autre logiciel de dessin), puis rechargez-la ici.</div>
      <div class="grid2" style="margin-top:8px">
        <button data-tx="paint" class="primary" title="Enregistre la texture dans le dossier Manettes (si besoin) et l'ouvre dans Paint">🖌 Modifier dans Paint</button>
        <button data-tx="reload" title="Après avoir enregistré dans Paint">↻ Recharger</button>
        <button data-tx="export" title="Enregistre une copie de la texture d'origine dans le dossier Manettes">📤 Exporter</button>
        <button data-tx="folder">📁 Dossier</button>
      </div>
      <div class="row"><label>Utilisée</label><select data-f="texture"><option value="">Texture d'origine</option>${(list.textures || []).map(f => `<option value="${esc(f)}" ${P.texture === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
      <div class="muted">Pour une seule pièce (coque, boutons…), utilisez plutôt son <b>Apparence</b> dans l'onglet Pièces : couleur, motif ou texture.</div>`;
  } else if (tab === 'pieces') {
    const z = P.pieces.find(x => x.id === selected);
    const items = [['shell', 'Coque (le reste)'], ...P.pieces.map(x => [x.id, `${x.nom}`, x.input])];
    body = `<div class="list">${items.map(([id, n, inp]) => `<button data-sel="${esc(id)}" class="${selected === id ? 'on' : ''}"><span class="dot" style="background:${partColor(id)}"></span>${esc(n)}<small>${esc(inp ? INPUTS[inp]?.label.split(' (')[0] : id === 'shell' ? '' : 'fixe')}</small></button>`).join('')}</div>
      <button data-p="place" class="primary" style="width:100%;margin-top:8px">＋ Ajouter une pièce (puis cliquez sur le modèle)</button>
      ${z ? zoneForm(z) : selected === 'shell' ? lookForm('shell') : '<div class="muted" style="margin-top:8px">Choisissez une pièce ou ajoutez-en une. Chaque pièce découpe la partie du modèle qui bouge (bouton, stick, gâchette…).</div>'}`;
  } else if (tab === 'formes') {
    const f = P.formes.find(x => x.id === selectedFill);
    body = `<div class="muted">Des formes à ajouter au modèle : pour boucher un trou (sous un stick transparent…) ou compléter une pièce. Attachées à une pièce, elles bougent avec elle.</div>
      <div class="grid2" style="margin-top:8px">${Object.entries(FILL_SHAPES).map(([k, l]) => `<button data-add="${k}">＋ ${l}</button>`).join('')}</div>
      <div class="list" style="margin-top:8px">${P.formes.map(x => `<button data-fsel="${esc(x.id)}" class="${x.id === selectedFill ? 'on' : ''}">◼ ${esc(FILL_SHAPES[x.shape])}<small>${esc(P.pieces.find(z => z.id === x.attache)?.nom || 'coque')}</small></button>`).join('')}</div>
      ${f ? `<h3>Forme</h3>
        <div class="row"><label>Forme</label><select data-ff="shape">${Object.entries(FILL_SHAPES).map(([k, l]) => `<option value="${k}" ${f.shape === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="row"><label>Attachée à</label><select data-ff="attache"><option value="shell">la coque (fixe)</option>${P.pieces.map(z => `<option value="${esc(z.id)}" ${f.attache === z.id ? 'selected' : ''}>${esc(z.nom)}</option>`).join('')}</select></div>
        <div class="row"><label>Position</label><div class="trio">${num('pos.0', f.pos[0], 0.5, 'x')}${num('pos.1', f.pos[1], 0.5, 'y (haut)')}${num('pos.2', f.pos[2], 0.5, 'z (face)')}</div></div>
        <div class="row"><label>Rotation</label><div class="trio">${num('rot.0', f.rot[0], 5, 'x °')}${num('rot.1', f.rot[1], 5, 'y °')}${num('rot.2', f.rot[2], 5, 'z °')}</div></div>
        <div class="row"><label>Taille</label><div class="trio">${num('size.0', f.size[0], 0.5, 'largeur')}${num('size.1', f.size[1], 0.5, 'hauteur')}${num('size.2', f.size[2], 0.5, 'profondeur')}</div></div>
        <div class="row"><label>Couleur</label><input type="color" data-ff="color" value="${f.color || '#1c1c1f'}"></div>
        <div class="grid2"><button data-fdo="dup">⧉ Dupliquer</button><button data-fdo="del">🗑 Supprimer</button></div>` : ''}`;
  } else {
    const byInput = {};
    for (const z of P.pieces) if (z.input) byInput[z.input] = z.id;
    body = `<h3>Disposition</h3>
      <div class="grid2"><button data-lay="swapAB" title="A ↔ B et X ↔ Y : disposition Nintendo">🔁 A↔B, X↔Y</button><button data-lay="auto" title="Les 4 boutons en losange à droite : bas = A, droite = B, gauche = X, haut = Y">🎯 A B X Y auto</button></div>
      <h3>Tester avec votre manette</h3><div class="pressed" id="padTest"></div>
      <div class="muted">Les boutons pressés s'allument ici et s'enfoncent sur l'aperçu.</div>
      <h3>Assignation</h3>
      <div class="map">${Object.entries(INPUTS).filter(([k]) => k).map(([k, i]) => `<label data-in="${k}">${esc(i.label)}</label>
        <select data-map="${k}"><option value="">—</option>${P.pieces.map(z => `<option value="${esc(z.id)}" ${byInput[k] === z.id ? 'selected' : ''}>${esc(z.nom)}</option>`).join('')}</select>`).join('')}</div>`;
    lastPressed = '';
  }
  right.innerHTML = `<div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>${body}`;
}
function zoneForm(z) {
  const circle = z.shape === 'circle';
  return `<h3>Pièce</h3>
    <div class="row"><label>Nom</label><input type="text" data-z="nom" value="${esc(z.nom)}"></div>
    <div class="row"><label>Bouton</label><select data-z="input">${Object.entries(INPUTS).map(([k, i]) => `<option value="${k}" ${z.input === k ? 'selected' : ''}>${esc(i.label)}</option>`).join('')}</select></div>
    <h3>Délimitation</h3>
    <div class="row"><label>Forme</label><div class="seg">${[['circle', 'Cercle'], ['pill', 'Pilule'], ['rect', 'Rectangle'], ['cross', 'Croix +']].map(([k, l]) => `<button data-shape="${k}" class="${z.shape === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="row"><label>Vue</label><select data-z="view">${Object.entries(VIEWS).map(([k, v]) => `<option value="${k}" ${z.view === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
    <div class="row"><label>Centre</label><div class="duo">${num('center.0', z.center[0], 0.1, '↔')}${num('center.1', z.center[1], 0.1, '↕')}</div></div>
    ${circle ? `<div class="row"><label>Rayon</label><input type="range" min="0.5" max="40" step="0.05" data-zr="r" value="${z.r}"><span class="muted">${fmt(z.r)}</span></div>`
      : `<div class="row"><label>Taille</label><div class="duo">${num('size.0', z.size?.[0] ?? 10, 0.1, 'largeur')}${num('size.1', z.size?.[1] ?? 6, 0.1, 'hauteur')}</div></div>
         ${z.shape === 'cross' ? '<div class="muted">Croix : largeur = longueur totale, hauteur = épaisseur des branches.</div>' : ''}
         ${z.shape === 'rect' ? `<div class="row"><label>Coins</label><input type="range" min="0" max="20" step="0.1" data-zr="corner" value="${z.corner ?? 2}"><span class="muted">${fmt(z.corner ?? 2)}</span></div>` : ''}`}
    <div class="row"><label>Profondeur</label><input type="range" min="${fmt((z.depth[0] ?? 0) - 30)}" max="${fmt((z.depth[0] ?? 0) + 30)}" step="0.1" data-zd="0" value="${z.depth[0]}"><span class="muted">${fmt(z.depth[0])}</span></div>
    <div class="muted">Profondeur : ce qui est au-dessus (vu de ${VIEWS[z.view]?.label.replace('de ', '').replace('côté ', 'côté ')}) appartient à la pièce.</div>
    <div class="grid2" style="margin-top:8px">
      <button data-p="fit" title="Trouve le sillon autour du bouton">📐 Ajuster au contour</button>
      <button data-p="mirror" title="Copie de l'autre côté (gauche ↔ droite)">⇋ Copie miroir</button>
      <button data-p="up" title="Prioritaire sur les pièces suivantes là où elles se touchent">▲ Monter</button>
      <button data-p="del">🗑 Supprimer</button>
      <button data-p="split4" style="grid-column:1/-1" title="Croix directionnelle classique (PS4, PS5, Switch…) : 4 boutons séparés haut / bas / gauche / droite">✚ Croix en 4 flèches séparées (PlayStation…)</button>
    </div>
    ${lookForm(z.id)}`;
}
function lookForm(id) {
  const P = current.profile, l = P.apparence[id] || { mode: 'origine' };
  return `<h3>Apparence</h3>
    <div class="row"><div class="seg">${[['origine', "D'origine"], ['couleur', 'Couleur'], ['motif', 'Motif'], ['texture', 'Texture']].map(([k, t]) => `<button data-look="${k}" class="${(l.mode || 'origine') === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
    ${l.mode === 'texture' ? `
      <div class="texgrid">${[...Object.entries(TEXTURES).map(([k, t]) => [k, t.label, `url(${swatch[k]})`]), ...userImages.map(f => ['img:' + f, f.replace(/\.[^.]+$/, ''), `url('./textures/${encodeURIComponent(f)}')`])]
        .map(([k, lb, bg]) => `<button data-ltex="${esc(k)}" class="${(l.tex || 'bois') === k ? 'on' : ''}" style="background-image:${bg}" title="${esc(lb)}"><i>${esc(lb)}</i></button>`).join('')}</div>
      <div class="muted" style="margin-top:4px">Vos images : dossier <b>Images</b> de l'appli.</div>
      <div class="row"><label>Teinte</label><input type="color" data-lk="color" value="${l.color || '#ffffff'}"></div>
      <div class="row"><label>Motif</label><input type="range" min="0.2" max="4" step="0.05" data-lsc="scale" value="${l.scale ?? 1}"><span class="muted">×${fmt(l.scale ?? 1)}</span></div>
      <div class="row"><label>Finition</label><div class="seg">${[['mat', 'Mate'], ['brillant', 'Brillante']].map(([k, t]) => `<button data-lf="${k}" class="${(l.finish || 'mat') === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>` : ''}
    ${l.mode && l.mode !== 'origine' && l.mode !== 'texture' ? `
      <div class="row"><label>Couleur</label><input type="color" data-lk="color" value="${l.color || '#ffffff'}">${l.mode === 'motif' ? `<input type="color" data-lk="color2" value="${l.color2 || '#000000'}" title="2ᵉ couleur">` : ''}</div>
      ${l.mode === 'motif' ? `<div class="row"><label>Motif</label><div class="seg">${[['fumee', 'Fumée'], ['camo', 'Camouflage'], ['degrade', 'Dégradé']].map(([k, t]) => `<button data-lp="${k}" class="${(l.pattern || 'fumee') === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>` : ''}
      <div class="row"><label>Finition</label><div class="seg">${[['mat', 'Mate'], ['brillant', 'Brillante']].map(([k, t]) => `<button data-lf="${k}" class="${(l.finish || 'mat') === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>` : ''}`;
}

const setPath = (obj, path, v) => { const [k, i] = path.split('.'); if (i == null) obj[k] = v; else obj[k][+i] = v; };
right.addEventListener('click', e => {
  const t = e.target;
  const tb = t.closest('[data-tab]')?.dataset.tab; if (tb) { tab = tb; renderRight(); return; }
  if (!current?.profile) return;
  const P = current.profile, z = P.pieces.find(x => x.id === selected);
  const sel = t.closest('[data-sel]')?.dataset.sel; if (sel) { select(sel); return; }
  const pAct = t.closest('[data-p]')?.dataset.p;
  if (pAct === 'place') { placing = true; setStatus('Cliquez sur le modèle, au milieu du bouton…'); renderTop(); return; }
  if (pAct === 'fit' && z) { const ok = fitContour(z); setStatus(ok ? '📐 Contour trouvé' : 'Contour non trouvé'); changed(); renderRight(); return; }
  if (pAct === 'mirror' && z) {
    const c = JSON.parse(JSON.stringify(z)); let k = 1; while (P.pieces.some(x => x.id === 'p' + k)) k++;
    c.id = 'p' + k; c.nom = z.nom.replace(/gauche/i, '§').replace(/droite?/i, 'gauche').replace('§', 'droite') + (c.nom === z.nom ? ' (miroir)' : '');
    if (['face', 'back', 'top', 'bottom'].includes(c.view)) c.center[0] = -c.center[0];
    if (c.view === 'left') c.view = 'right'; else if (c.view === 'right') c.view = 'left';
    const swap = { LB: 'RB', RB: 'LB', LT: 'RT', RT: 'LT', LSTICK: 'RSTICK', RSTICK: 'LSTICK', DLEFT: 'DRIGHT', DRIGHT: 'DLEFT' };
    c.input = swap[c.input] ?? '';
    if (P.apparence[z.id]) P.apparence[c.id] = { ...P.apparence[z.id] };
    P.pieces.push(c); selected = c.id; changed(); renderRight(); return;
  }
  if (pAct === 'split4' && z) {
    const R = z.shape === 'circle' ? z.r : Math.max(...(z.size || [20, 20])) / 2;
    const gap = R * 0.22, w = R * 0.62, len = R - gap;
    const [cu, cv] = z.center, i = P.pieces.indexOf(z);
    const arrows = [['DUP', 'haut', 0, 1], ['DDOWN', 'bas', 0, -1], ['DLEFT', 'gauche', -1, 0], ['DRIGHT', 'droite', 1, 0]].map(([input, n, dx, dy], k) => {
      let id = 1; while (P.pieces.some(x => x.id === 'p' + id) || false) id++;
      const zz = { id: 'p' + id, nom: 'Flèche ' + n, view: z.view, shape: 'rect', center: [cu + dx * (gap + len / 2), cv + dy * (gap + len / 2)],
        size: dx ? [len, w] : [w, len], corner: w * 0.25, depth: [...z.depth], input };
      P.pieces.push(zz);
      return zz;
    });
    P.pieces = P.pieces.filter(x => !arrows.includes(x) && x !== z);
    P.pieces.splice(i, 0, ...arrows);
    if (P.apparence[z.id]) for (const a of arrows) P.apparence[a.id] = { ...P.apparence[z.id] };
    delete P.apparence[z.id];
    selected = arrows[0].id; changed(); renderRight(); setStatus('✚ 4 flèches créées : ajustez-les si besoin'); return;
  }
  if (pAct === 'up' && z) { const i = P.pieces.indexOf(z); if (i > 0) { P.pieces.splice(i, 1); P.pieces.splice(i - 1, 0, z); changed(); renderRight(); } return; }
  if (pAct === 'del' && z) { removePiece(z.id); return; }
  const shape = t.closest('[data-shape]')?.dataset.shape;
  if (shape && z) {
    if (shape !== 'circle' && !z.size) z.size = [z.r * 2 || 10, z.shape === 'pill' ? (z.r || 3) : z.r * 2 || 10];
    if (shape === 'cross') z.size = [(z.r || 10) * 1.9, (z.r || 10) * 0.65];
    if (shape === 'circle' && !z.r) z.r = Math.min(...(z.size || [10, 10])) / 2;
    z.shape = shape; changed(); renderRight(); return;
  }
  const ltex = t.closest('[data-ltex]')?.dataset.ltex;
  if (ltex) { const l = P.apparence[selected || 'shell'] ||= { mode: 'texture' }; l.tex = ltex; changed(); renderRight(); return; }
  const tx = t.closest('[data-tx]')?.dataset.tx;
  if (tx) { textureAction(tx); return; }
  const look = t.closest('[data-look]')?.dataset.look, lp = t.closest('[data-lp]')?.dataset.lp, lf = t.closest('[data-lf]')?.dataset.lf;
  const id = selected || 'shell';
  if (look || lp || lf) {
    const l = P.apparence[id] ||= { mode: 'origine' };
    if (look) {
      l.mode = look;
      if (look === 'texture') { l.tex ||= 'bois'; l.color = l.color && l.color !== '#c3202a' ? l.color : '#ffffff'; }
      else if (look !== 'origine') { l.color ||= '#c3202a'; l.color2 ||= '#2a0a0e'; l.pattern ||= 'fumee'; }
    }
    if (lp) l.pattern = lp; if (lf) l.finish = lf;
    changed(); renderRight(); return;
  }
  const rot = t.closest('[data-rot]')?.dataset.rot;
  if (rot) { const [ax, d] = rot.split(',').map(Number); P.orientation ||= [0, 0, 0]; P.orientation[ax] = ((P.orientation[ax] + d + 540) % 360) - 180; changed(); renderRight(); return; }
  const add = t.closest('[data-add]')?.dataset.add;
  if (add) {
    let k = 1; while (P.formes.some(f => f.id === 'f' + k)) k++;
    const part = built?.parts[selected];
    const at = part ? part.anchor.getWorldPosition(V()).addScaledVector(part.view.a, -6) : V(0, 0, 0);
    P.formes.push({ id: 'f' + k, shape: add, attache: part ? selected : 'shell', pos: at.toArray().map(v => Math.round(v * 10) / 10), rot: [add === 'cylinder' || add === 'cone' ? 90 : 0, 0, 0], size: [12, 12, 12], color: '#1c1c1f' });
    selectedFill = 'f' + k; changed(); renderRight(); return;
  }
  const fsel = t.closest('[data-fsel]')?.dataset.fsel; if (fsel) { selectedFill = fsel; renderRight(); return; }
  const fdo = t.closest('[data-fdo]')?.dataset.fdo, f = P.formes.find(x => x.id === selectedFill);
  if (fdo === 'del' && f) { P.formes = P.formes.filter(x => x !== f); selectedFill = null; changed(); renderRight(); return; }
  if (fdo === 'dup' && f) { const c = JSON.parse(JSON.stringify(f)); let k = 1; while (P.formes.some(x => x.id === 'f' + k)) k++; c.id = 'f' + k; c.pos[0] = -c.pos[0]; P.formes.push(c); selectedFill = c.id; changed(); renderRight(); return; }
  const lay = t.closest('[data-lay]')?.dataset.lay;
  if (lay === 'swapAB') {
    const sw = { A: 'B', B: 'A', X: 'Y', Y: 'X' };
    for (const zz of P.pieces) if (sw[zz.input]) zz.input = sw[zz.input];
    changed(false); renderRight(); return;
  }
  if (lay === 'auto') {
    const face = P.pieces.filter(zz => zz.view === 'face' && zz.shape === 'circle' && !INPUTS[zz.input]?.stick && zz.input !== 'DPAD').sort((a, b) => b.center[0] - a.center[0]).slice(0, 4);
    if (face.length < 4) { setStatus('Il faut 4 boutons ronds sur la face'); return; }
    const cx = face.reduce((s, q) => s + q.center[0], 0) / 4, cy = face.reduce((s, q) => s + q.center[1], 0) / 4;
    for (const q of face) {
      const dx = q.center[0] - cx, dy = q.center[1] - cy;
      q.input = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'B' : 'X') : (dy > 0 ? 'Y' : 'A');
    }
    changed(false); renderRight(); setStatus('✓ A B X Y assignés (disposition Xbox)'); return;
  }
});
right.addEventListener('input', e => {
  const t = e.target; if (!current?.profile) return;
  const P = current.profile, z = P.pieces.find(x => x.id === selected), f = P.formes.find(x => x.id === selectedFill);
  const val = () => parseFloat(t.value);
  const after = txt => { if (t.nextElementSibling?.classList.contains('muted')) t.nextElementSibling.textContent = txt; };
  if (t.dataset.zr && z) { z[t.dataset.zr] = val(); after(fmt(val())); drawOutline(); scheduleZone(); return; }
  if (t.dataset.zd && z) { z.depth[0] = val(); after(fmt(val())); scheduleZone(); return; }
  if (t.dataset.lsc) { const l = P.apparence[selected || 'shell'] ||= { mode: 'texture' }; l.scale = val(); after('×' + fmt(val())); scheduleZone(); return; }
  if (t.dataset.t) { P.tenue[t.dataset.t] = val(); after(t.dataset.t === 'inclinaison' ? fmt(val()) + '°' : t.dataset.t === 'taille' ? '×' + fmt(val()) : fmt(val())); scheduleSave(); return; }
});
let zoneTimer = null;
function scheduleZone() { clearTimeout(zoneTimer); zoneTimer = setTimeout(() => changed(), 250); }
let tenueTimer = null;
function scheduleSave() { clearTimeout(tenueTimer); tenueTimer = setTimeout(() => changed(false), 300); }
right.addEventListener('change', e => {
  const t = e.target; if (!current?.profile) return;
  const P = current.profile, z = P.pieces.find(x => x.id === selected), f = P.formes.find(x => x.id === selectedFill);
  if (t.dataset.f) {
    if (t.dataset.f === 'texture') { if (t.value) P.texture = t.value; else delete P.texture; changed(); return; }
    P[t.dataset.f] = t.value; changed(t.dataset.f === 'lumiere'); renderLeft(); return;
  }
  if (t.dataset.z && z) { z[t.dataset.z] = t.value; changed(t.dataset.z !== 'nom'); renderRight(); return; }
  if (t.dataset.n) {
    const v = parseFloat(t.value); if (!Number.isFinite(v)) return;
    if (t.dataset.n.startsWith('o.')) { P.orientation[+t.dataset.n.slice(2)] = v; changed(); return; }
    if (tab === 'formes' && f) { setPath(f, t.dataset.n, v); changed(); return; }
    if (z) { setPath(z, t.dataset.n, v); drawOutline(); changed(); return; }
  }
  if (t.dataset.ff && f) { f[t.dataset.ff] = t.value; changed(); renderRight(); return; }
  if (t.dataset.lk) { const l = P.apparence[selected || 'shell'] ||= { mode: 'couleur' }; l[t.dataset.lk] = t.value; changed(); return; }
  if (t.dataset.map) {
    const input = t.dataset.map;
    for (const q of P.pieces) if (q.input === input) q.input = '';
    const q = P.pieces.find(x => x.id === t.value); if (q) q.input = input;
    changed(false); renderRight(); return;
  }
});

renderTop(); renderRight();
await refreshList();
const first = activeId?.startsWith('perso:') ? { file: activeId.slice(6) } : BUILTIN_PADS.find(p => p.id === activeId) || BUILTIN_PADS[1];
await openPad(first);
host?.postMessage({ type: 'ready' });
window.padEditor = {
  get built() { return built; }, get current() { return current; }, get controls() { return controls; }, fitContour, openPad, pad,
  async edit(p) { current = { id: 'perso:test.json', file: 'test.json', builtin: false, profile: p }; lastSaved = JSON.stringify(p); await rebuild(true); renderLeft(); renderRight(); renderTop(); },
  placeAt(x, y) { placeZone(hitModel({ clientX: x, clientY: y })); },
};
