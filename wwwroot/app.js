import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from './vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildController, makeControls, PAD_WIDTH } from './pad-profile.js';
import { buildScene, disposeObject, setRenderer as setObjectsRenderer, normalizeScene, makeMaterial, boxGeo, getTexture, makeObject, SHAPES } from './scene-objects.js';

const params = new URLSearchParams(location.search);

const FOLLOW = params.get('follow') === '1';
let followedCfg = null;
if (FOLLOW) {
  try {
    const r = await fetch('./api/config', { cache: 'no-store' });
    followedCfg = await r.text();
    const c = JSON.parse(followedCfg);
    params.set('mode', c.mode); params.set('view', c.view); params.set('model', c.model);
    params.set('mirror', c.mirror ? '1' : '0');
    params.set('decor', c.decor ? '1' : '0'); params.set('dview', c.decorView || 'back'); params.set('deco', c.deco || '');
    params.set('slive', c.screenLive === false ? '0' : '1');
    params.set('floor', c.floor || 'classic');
    params.set('pad', c.padModel || '8bitdo');
    params.set('face', c.face ?? '');
    params.set('objs', c.objects === false ? '0' : '1');
    params.set('occ', c.occlude === false ? '0' : '1');
    if (c.fps) params.set('fps', c.fps);
    params.set('minis', c.minis ? '1' : '0');
    if (c.orbit) { params.set('orbit', c.orbit.on ? '1' : '0'); params.set('oaz', c.orbit.az); params.set('oel', c.orbit.el); params.set('oz', c.orbit.zoom); }
  } catch { }
}
const CFG = {
  model: params.get('model') || 'Défaut.glb',
  mode: ['bongo', 'vr', 'wheel', 'pad'].includes(params.get('mode')) ? params.get('mode') : 'keyboard',
  mirror: params.get('mirror') === '1',
  bg: params.get('bg') || 'transparent',
  view: params.get('view') || 'bust',
  notes: params.get('notes') !== '0',
  look: params.get('look') !== '0',
  blink: params.get('blink') !== '0',
  inApp: params.get('app') === '1',
  decor: params.get('decor') === '1',
  decorView: ['front', 'back2', 'tri', 'tri2'].includes(params.get('dview')) ? params.get('dview') : 'back',
  decos: new Set((params.get('deco') || '').split(',').filter(Boolean)),
  screenLive: params.get('slive') !== '0',
  floor: ['wood', 'tiles', 'carpet', 'grass'].includes(params.get('floor')) ? params.get('floor') : 'classic',
  padModel: ['xbox', 'xbox25'].includes(params.get('pad')) || /^perso:/.test(params.get('pad') || '') ? params.get('pad') : '8bitdo',
  face: params.get('face') ?? 'Défaut',
  objs: params.get('objs') !== '0',
  occlude: params.get('occ') !== '0',
  fps: ['60', '30'].includes(params.get('fps')) ? params.get('fps') : 'auto',
  minis: params.get('minis') === '1',
  editor: params.get('editor') === '1',
  perso: params.get('perso') === '1',
};
if (CFG.perso) { CFG.decor = false; CFG.objs = false; }
const orbit = {
  on: params.get('orbit') === '1',
  az: Number(params.get('oaz') ?? 30) || 0,
  el: Number(params.get('oel') ?? 18) || 0,
  zoom: Number(params.get('oz') ?? 1) || 1,
};
const screenLayout = CFG.decor && location.protocol.startsWith('http')
  ? await fetch('./api/screens', { cache: 'no-store' }).then(r => r.json()).catch(() => [])
  : [];
const KEYBOARD = CFG.mode === 'keyboard';
const VR = CFG.mode === 'vr';
const WHEEL = CFG.mode === 'wheel';
const PAD = CFG.mode === 'pad';
const PHYSICAL = true;
const isBehind = () => orbit.on ? Math.cos(THREE.MathUtils.degToRad(orbit.az)) < 0 : CFG.decor && CFG.decorView !== 'front';
const CINEMA = CFG.decor && CFG.decos.has('cinema');
const CINEMA_SEATED = CINEMA && (KEYBOARD || PAD);
const RECLINE = 0.85;
const sideSwap = s => isBehind() ? (s === 'L' ? 'R' : s === 'R' ? 'L' : s) : s;
if (VR) CFG.view = 'full';

const statusEl = document.getElementById('status');
let statusTimer;
function status(msg, ms = 2500) {
  if (FOLLOW) return;
  statusEl.textContent = msg;
  statusEl.classList.remove('hidden');
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => statusEl.classList.add('hidden'), ms);
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false });
const pixelRatio = () => CFG.fps === '30' ? 1 : Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const BG = { green: '#00ff00', dark: '#1e1f26' };
if (CFG.bg === 'transparent') renderer.setClearColor(0x000000, 0);
else renderer.setClearColor(new THREE.Color(BG[CFG.bg] || ('#' + CFG.bg.replace('#', ''))), 1);
if (CFG.editor || CFG.perso) {
  for (const href of ['./theme-wii.css', './theme-carnet.css']) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = href;
    document.head.appendChild(link);
  }
  for (const src of ['./theme.js', './theme-icons.js'])
    await new Promise(res => { const s = document.createElement('script'); s.src = src; s.onload = s.onerror = res; document.head.appendChild(s); });
  const themeBg = () => renderer.setClearColor({ wii: 0xe4e7ea, carnet: 0xebe2cf }[window.uiTheme?.()] ?? 0x1e1f26, 1);
  themeBg();
  addEventListener('uitheme', themeBg);
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, window.innerHeight > 0 ? window.innerWidth / window.innerHeight : 1, 0.01, 100);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a70, 1.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
keyLight.position.set(0.6, 1.4, 2.2);
scene.add(keyLight);
const rim = new THREE.DirectionalLight(0xffffff, 0.5);
rim.position.set(-1.5, 1.0, -1.0);
scene.add(rim);

let lastSize = '';
function onResize() {
  if (!(window.innerWidth > 0 && window.innerHeight > 0)) return;
  const sz = `${window.innerWidth}x${window.innerHeight}`;
  if (sz === lastSize) return;
  lastSize = sz;
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  frameCamera();
}
addEventListener('resize', onResize);
new ResizeObserver(onResize).observe(document.documentElement);

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function worldPos(obj, out = new THREE.Vector3()) {
  obj.updateWorldMatrix(true, false);
  return out.setFromMatrixPosition(obj.matrixWorld);
}

function rotateWorld(bone, qWorld) {
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(_q1);
  bone.parent.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(_q3.copy(qWorld).multiply(_q1)));
  bone.updateMatrixWorld(true);
}

function aimAt(bone, child, target) {
  const from = worldPos(bone, _v1);
  const cur = worldPos(child, _v2).sub(from).normalize();
  const want = _v3.copy(target).sub(from).normalize();
  rotateWorld(bone, new THREE.Quaternion().setFromUnitVectors(cur, want));
}

function solveIK(arm, target) {
  const S = worldPos(arm.upper, new THREE.Vector3());
  const a = arm.lenA, b = arm.lenB;
  const toT = target.clone().sub(S);
  const d = THREE.MathUtils.clamp(toT.length(), Math.abs(a - b) + 1e-4, (a + b) * 0.999);
  const n = toT.normalize();
  const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const m = arm.pole.clone().addScaledVector(n, -arm.pole.dot(n)).normalize();
  const elbow = S.clone().addScaledVector(n, a * cosA).addScaledVector(m, a * sinA);
  const end = S.clone().addScaledVector(n, d);
  aimAt(arm.upper, arm.lower, elbow);
  aimAt(arm.lower, arm.end, end);
}

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });

function makeDrum(radius, height) {
  const g = new THREE.Group();
  const wood = mat(0xb5651d, { roughness: 0.55, side: THREE.DoubleSide });
  const band = mat(0x3a2a20, { roughness: 0.4, metalness: 0.3 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.78, height, 32, 1, true), wood);
  body.position.y = -height / 2;
  g.add(body);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.78, 32), wood);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -height;
  g.add(bottom);
  for (const y of [-height * 0.08, -height * 0.55]) {
    const r = radius * (1 - 0.22 * Math.abs(y) / height);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, radius * 0.06, 8, 32), band);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }
  const skin = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, radius * 0.06, 32), mat(0xf3e3c3, { roughness: 0.9 }));
  g.add(skin);
  g.userData = { skin, hit: 0, radius };
  return g;
}

const KEY_ROWS = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.25],
  [1.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],
  [1.5, 1, 1.5, 7, 1.5, 1, 1.5],
];

function makeKeyboard(width) {
  const u = width / 15.6;
  const g = new THREE.Group();
  const depth = u * 6.6;
  const base = new THREE.Mesh(new THREE.BoxGeometry(width, u * 0.6, depth), mat(0x2a2a33, { roughness: 0.5 }));
  base.position.y = u * 0.3;
  g.add(base);
  const keyGeo = new THREE.BoxGeometry(1, u * 0.45, u * 0.82);
  const keyMat = mat(0xeeeef2, { roughness: 0.5 });
  const keys = [];
  KEY_ROWS.forEach((row, r) => {
    let x = 0;
    const z = (r - 2.5) * -u - (r === 0 ? u * 0.15 : 0);
    for (const w of row) {
      const m = new THREE.Mesh(keyGeo, keyMat.clone());
      m.scale.x = w * u - u * 0.16;
      const cx = x + w / 2;
      m.position.set((PHYSICAL ? 7.5 - cx : cx - 7.5) * u, u * 0.6 + u * 0.22, z);
      g.add(m);
      keys.push({ mesh: m, row: r, x0: x, x1: x + w, cx, lit: 0, held: 0, baseY: m.position.y });
      x += w;
    }
  });
  g.userData = { keys, u, width, depth };
  return g;
}

function findKey(kb, x, row) {
  const keys = kb.userData.keys.filter(k => k.row === THREE.MathUtils.clamp(row, 0, 5));
  return keys.find(k => x >= k.x0 && x < k.x1) ||
    keys.reduce((a, b) => Math.abs(a.cx - x) < Math.abs(b.cx - x) ? a : b);
}

function makeMouse(size) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 24, 16), mat(0xf4f4f6, { roughness: 0.35 }));
  body.scale.set(0.62, 0.42, 1);
  body.position.y = size * 0.12;
  g.add(body);
  const btnMat = () => mat(0xdcdce2, { roughness: 0.35, emissive: 0xd42b2b, emissiveIntensity: 0 });
  const btnL = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 16, 12, 0, Math.PI, 0, Math.PI / 2), btnMat());
  const btnR = btnL.clone(); btnR.material = btnMat();
  for (const [b, s] of [[btnL, -1], [btnR, 1]]) {
    b.scale.set(0.3, 0.44, 0.5);
    b.rotation.y = s > 0 ? 0 : Math.PI;
    b.position.set(s * size * 0.155, size * 0.125, size * 0.18);
    g.add(b);
  }
  g.userData = { left: btnL.position.x < btnR.position.x ? btnL : btnR, right: btnL.position.x < btnR.position.x ? btnR : btnL, size };
  return g;
}

const noteTextures = ['#d42b2b', '#6a2a8a', '#ffffff'].map(color => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 100px "Segoe UI Symbol", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#000';
  ctx.strokeText('♪', 64, 68);
  ctx.fillStyle = color;
  ctx.fillText('♪', 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
});
const notes = [];
function spawnNote(pos, scale, dir = 0) {
  if (!CFG.notes) return;
  if (notes.length > 24) { const old = notes.shift(); scene.remove(old.sprite); old.sprite.material.dispose(); }
  const m = new THREE.SpriteMaterial({ map: noteTextures[Math.floor(Math.random() * noteTextures.length)], transparent: true, depthWrite: false, depthTest: false });
  const s = new THREE.Sprite(m);
  s.renderOrder = 10;
  s.position.copy(pos);
  s.scale.setScalar(scale);
  scene.add(s);
  notes.push({ sprite: s, life: 0, vx: (dir * 0.8 + (Math.random() - 0.5)) * scale * 1.2, vy: scale * (1.6 + Math.random()), base: scale * 0.4, wob: Math.random() * 6 });
}
function updateNotes(dt) {
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    n.life += dt;
    n.sprite.position.x += (n.vx + Math.sin(n.life * 8 + n.wob) * n.base * 0.8) * dt;
    n.sprite.position.y += n.vy * dt;
    const fade = THREE.MathUtils.clamp((1.1 - n.life) / 0.35, 0, 1);
    n.sprite.scale.setScalar(n.base / 0.4 * fade);
    n.sprite.material.rotation = Math.sin(n.life * 6 + n.wob) * 0.3;
    if (n.life > 1.1) { scene.remove(n.sprite); n.sprite.material.dispose(); notes.splice(i, 1); }
  }
}

const rig = { root: null, bones: {}, rest: new Map(), arms: {}, drums: {}, unit: 1, bodyBase: new THREE.Vector3(), props: [] };

const state = {
  mouse: { x: 0.5, y: 0.5 }, look: { x: 0, y: 0 }, game: false, nudge: { x: 0, y: 0 },
  hands: {
    L: { held: 0, downUntil: 0, h: 0, wasDown: false },
    R: { held: 0, downUntil: 0, h: 0, wasDown: false },
  },
  typing: { x: 6, row: 3, cx: 6, crow: 3, last: -10, heldKeys: new Map() },
  click: { L: 0, R: 0, M: 0 },
  bounce: 0, bounceVel: 0, wheel: 0, mic: 0, micAt: 0,
  vr: { at: 0 }, vrRecenter: false, vrOk: null,
  drv: { a: 0, g: 0, b: 0, c: 0, gear: 0, pl: 0, pr: 0, at: 0 }, drvOk: null,
  pad: { b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, at: 0 }, padOk: null,
};

const face = { ready: false, mat: null, tex: null, levels: 1, eyes: 0, mouth: 0, talk: 0, nextBlink: 2, blinkUntil: 0, doubleAt: 0 };

function findBone(name) {
  let found = null;
  rig.root.traverse(o => { if (!found && o.name === name) found = o; });
  return found;
}

function addProp(obj, frame = true) { scene.add(obj); if (frame) rig.props.push(obj); return obj; }

async function fetchSceneData() {
  try {
    const raw = await fetch('./api/scene', { cache: 'no-store' }).then(r => r.json());
    return normalizeScene(raw).scene;
  } catch (e) { console.warn('Scène illisible :', e); return { base: {}, objects: [] }; }
}

async function loadModel() {
  const loader = new GLTFLoader();
  rig.sceneData = await fetchSceneData();
  status(`Chargement de ${CFG.model}…`, 0);
  const gltf = await loader.loadAsync('./mii/' + encodeURIComponent(CFG.model));
  const root = gltf.scene;
  rig.root = root;
  scene.add(root);
  root.traverse(o => {
    if (o.isMesh) {
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m && m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.1);
    }
  });

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  root.scale.setScalar(1 / box.getSize(new THREE.Vector3()).y);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
  if (CFG.decor && CFG.decos.has('chair') && !VR && !WHEEL && !CINEMA) {
    const hip = worldPos(findBone('Leg_1_L')), knee = worldPos(findBone('Leg_2_L')), ankle = worldPos(findBone('Ankle_L'));
    const shin = knee.distanceTo(ankle);
    rig.floorAnkleY = ankle.y;
    root.position.y -= hip.y - shin * 0.97 - ankle.y;
    root.updateMatrixWorld(true);
    rig.seated = true;
  }
  rig.bodyBase.copy(root.position);
  rig.modelBox = new THREE.Box3().setFromObject(root);
  if (rig.seated) rig.modelBox.min.y = 0;

  const names = ['Spine_1', 'Head', 'Arm_1_L', 'Arm_2_L', 'Wrist_L', 'Arm_1_R', 'Arm_2_R', 'Wrist_R'];
  for (const n of names) rig.bones[n] = findBone(n);
  const missing = names.filter(n => !rig.bones[n]);
  if (missing.length) { status('Os manquants : ' + missing.join(', '), 0); throw new Error('squelette non reconnu'); }

  root.traverse(o => { if (o.isBone) rig.rest.set(o, o.quaternion.clone()); });

  rig.headRestWorldQ = rig.bones.Head.getWorldQuaternion(new THREE.Quaternion());
  let faceBox = null;
  root.traverse(o => { if (o.isMesh && (o.name === 'Faceline' || o.parent?.name === 'Faceline')) faceBox = new THREE.Box3().setFromObject(o); });
  const eyeWorld = faceBox
    ? V(0, faceBox.min.y + (faceBox.max.y - faceBox.min.y) * 0.66, faceBox.max.z - 0.02)
    : worldPos(rig.bones.Head).add(V(0, 0.2, 0.15));
  rig.eyeLocal = rig.bones.Head.worldToLocal(eyeWorld);

  rig.anchors = {};
  const anchor = (name, boneName, at) => {
    const bone = findBone(boneName);
    if (!bone) return;
    rig.anchors[name] = { bone, local: bone.worldToLocal((at || worldPos(bone)).clone()), restInv: bone.getWorldQuaternion(new THREE.Quaternion()).invert() };
  };
  const headBox = faceBox ? faceBox.clone() : null;
  root.traverse(o => { if (o.isMesh && o.name === 'Hair' && headBox) headBox.union(new THREE.Box3().setFromObject(o)); });
  anchor('tete', 'Head', headBox ? headBox.getCenter(V()) : null);
  if (rig.anchors.tete) rig.headTop = Math.max(0.05, (rig.modelBox.max.y - rig.anchors.tete.bone.localToWorld(rig.anchors.tete.local.clone()).y) / (rig.modelBox.max.y - rig.modelBox.min.y || 1));
  anchor('corps', findBone('Spine_2') ? 'Spine_2' : 'Spine_1');
  anchor('taille', findBone('Waist') ? 'Waist' : 'Spine_1');
  anchor('mainG', 'Wrist_L');
  anchor('mainD', 'Wrist_R');

  if (CINEMA_SEATED) {
    const hips = () => worldPos(findBone('Leg_1_L')).add(worldPos(findBone('Leg_1_R'))).multiplyScalar(0.5);
    const seatHip = V(0, 0.16, hips().z);
    root.rotation.x = -RECLINE;
    root.updateMatrixWorld(true);
    root.position.add(seatHip.clone().sub(hips()));
    root.updateMatrixWorld(true);
    rig.bodyBase.copy(root.position);
    rig.modelBox = new THREE.Box3().setFromObject(root);
    rig.modelBox.min.y = 0;
    rig.hipY = seatHip.y;
    rig.seated = rig.cinema = true;
  }

  const mk = (u, l, e) => {
    const A = worldPos(rig.bones[u]), B = worldPos(rig.bones[l]), C = worldPos(rig.bones[e]);
    return { upper: rig.bones[u], lower: rig.bones[l], end: rig.bones[e], lenA: A.distanceTo(B), lenB: B.distanceTo(C), shoulder: A };
  };
  const armA = mk('Arm_1_L', 'Arm_2_L', 'Wrist_L');
  const armB = mk('Arm_1_R', 'Arm_2_R', 'Wrist_R');
  const [left, right] = armA.shoulder.x < armB.shoulder.x ? [armA, armB] : [armB, armA];
  rig.arms = { L: left, R: right };
  const reach = rig.unit = left.lenA + left.lenB;
  left.pole = V(-1, -0.6, -0.3).normalize();
  right.pole = V(1, -0.6, -0.3).normalize();

  if (rig.seated) {
    const chain = (a, b, c, side) => {
      const A = worldPos(findBone(a)), B = worldPos(findBone(b)), C = worldPos(findBone(c));
      return { upper: findBone(a), lower: findBone(b), end: findBone(c), lenA: A.distanceTo(B), lenB: B.distanceTo(C), side, pole: V(side * 0.15, 0.4, 1).normalize() };
    };
    const a = chain('Leg_1_L', 'Leg_2_L', 'Ankle_L', 1), b = chain('Leg_1_R', 'Leg_2_R', 'Ankle_R', -1);
    if (worldPos(a.upper).x < worldPos(b.upper).x) { a.side = -1; b.side = 1; a.pole.x *= -1; b.pole.x *= -1; }
    rig.seatLegs = [a, b];
  }

  if (VR) buildVR(left, right, reach);
  else if (WHEEL) buildCockpit(left, right, reach);
  else if (PAD) {
    try { await buildGamepadModel(left, right, reach); }
    catch (e) { console.warn('Modèle de manette indisponible, manette simplifiée :', e); buildGamepad(left, right, reach); }
    if (CFG.minis) setupMinis();
  }
  else if (KEYBOARD) buildDesk(left, right, reach);
  else buildDrums(left, right, reach);

  if (rig.seated && !PAD && !rig.cinema) {
    const back = reach * 0.18;
    root.position.z -= back;
    rig.bodyBase.z -= back;
    rig.modelBox.translate(V(0, 0, -back));
    root.updateMatrixWorld(true);
    rig.extraLean = 0.24;
  }
  if (CFG.decor) buildDecor(left, right, reach);
  if (CFG.objs || CFG.editor) await loadUserScene();

  await setupFace().catch(e => console.warn('Visage :', e));
  if (!CFG.perso) loadCharacter();

  frameCamera();
  try {
    rig.root.traverse(o => { for (const m of [].concat(o.material || [])) for (const k of ['map', 'normalMap', 'emissiveMap']) if (m?.[k]) renderer.initTexture(m[k]); });
    await renderer.compileAsync(scene, viewCam);
  } catch { }
  status(CFG.inApp ? 'Glisser pour déplacer · molette pour redimensionner' : `${CFG.model} chargé`);
}

function buildDrums(left, right, reach) {
  const shoulderY = left.shoulder.y;
  const halfW = Math.abs(right.shoulder.x - left.shoulder.x) / 2;
  for (const side of ['L', 'R']) {
    const arm = rig.arms[side];
    const sign = side === 'L' ? -1 : 1;
    const r = reach * (side === 'L' ? 0.36 : 0.32);
    const drum = addProp(makeDrum(r, reach * 0.9));
    drum.position.set(sign * (halfW + reach * 0.3), shoulderY - reach * 0.66, arm.shoulder.z + reach * 0.6);
    drum.rotation.x = 0.18;
    rig.drums[side] = drum;
    arm.hit = drum.position.clone().add(V(-sign * r * 0.15, reach * 0.06, -r * 0.1));
    arm.hover = arm.hit.clone().add(V(-sign * reach * 0.05, reach * 0.32, -reach * 0.18));
  }
  const L = rig.drums.L.position, R = rig.drums.R.position;
  const link = addProp(new THREE.Mesh(new THREE.BoxGeometry(R.x - L.x, reach * 0.12, reach * 0.12), mat(0x5a3418)));
  link.position.set((L.x + R.x) / 2, (L.y + R.y) / 2 - reach * 0.22, (L.z + R.z) / 2);
  link.rotation.x = 0.18;

  const metal = mat(0x2b2b30, { roughness: 0.4, metalness: 0.6 });
  const pole = addProp(new THREE.Mesh(new THREE.CylinderGeometry(reach * 0.035, reach * 0.035, link.position.y, 12), metal));
  pole.position.set(link.position.x, link.position.y / 2, link.position.z);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const leg = addProp(new THREE.Mesh(new THREE.CylinderGeometry(reach * 0.025, reach * 0.025, reach * 0.55, 8), metal));
    leg.position.set(link.position.x + Math.cos(a) * reach * 0.22, reach * 0.08, link.position.z + Math.sin(a) * reach * 0.22);
    leg.lookAt(link.position.x, reach * 0.35, link.position.z);
    leg.rotateX(Math.PI / 2);
  }
  rig.focusBottom = L.y - reach * 0.42;
}

function buildDesk(left, right, reach) {
  const deskY = rig.cinema ? Math.max(left.shoulder.y - reach * 0.72, rig.hipY + reach * 0.45) : left.shoulder.y - reach * 0.72;
  const zBody = left.shoulder.z;

  if (rig.cinema) {
    const wood = mat(0x5a3a26, { roughness: 0.6 }), metal = mat(0x2b2b30, { metalness: 0.5, roughness: 0.4 });
    const thick = reach * 0.08, trayW = reach * 2.7, trayD = reach * 0.95;
    const tray = addProp(new THREE.Mesh(new THREE.BoxGeometry(trayW, thick, trayD), wood));
    tray.position.set(0, deskY - thick / 2, zBody + reach * 0.62);
    const armX = -(reach * 0.9 + reach * 0.25);
    const bar = addProp(new THREE.Mesh(new THREE.BoxGeometry(Math.abs(armX) - trayW / 2 + reach * 0.4, reach * 0.06, reach * 0.08), metal));
    bar.position.set((armX - trayW / 2 + reach * 0.4) / 2, deskY - thick - reach * 0.05, tray.position.z);
    const post = addProp(new THREE.Mesh(new THREE.BoxGeometry(reach * 0.08, deskY - rig.hipY, reach * 0.08), metal));
    post.position.set(armX, (deskY + rig.hipY) / 2 - thick, tray.position.z);
  } else {
  const deskW = reach * 3.4, deskD = reach * 1.5, thick = reach * 0.12;
  const desk = addProp(new THREE.Mesh(new THREE.BoxGeometry(deskW, thick, deskD), mat(0xc98a4b, { roughness: 0.7 })), CFG.view === 'full');
  desk.position.set(0, deskY - thick / 2, zBody + reach * 0.35 + deskD / 2);
  const legMat = mat(0x8a5a2b, { roughness: 0.7 });
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = addProp(new THREE.Mesh(new THREE.BoxGeometry(reach * 0.12, deskY - thick, reach * 0.12), legMat), CFG.view === 'full');
    leg.position.set(sx * (deskW / 2 - reach * 0.12), (deskY - thick) / 2, desk.position.z + sz * (deskD / 2 - reach * 0.12));
    leg.userData.corner = [sx, sz];
    legs.push(leg);
  }
  rig.table = { desk, legs, legMat, deskW, deskD, thick, deskY, back: zBody + reach * 0.35, leg: reach * 0.12 };
  }

  const kbW = reach * 1.15;
  const kb = addProp(makeKeyboard(kbW));
  kb.position.set((left.shoulder.x - reach * 0.22) * (PHYSICAL ? -1 : 1), deskY, zBody + reach * 0.62);
  kb.rotation.y = PHYSICAL ? -0.12 : 0.12;
  kb.updateMatrixWorld(true);
  rig.keyboard = kb;

  const padW = reach * 0.95, padD = reach * 0.78;
  const pad = addProp(new THREE.Mesh(new THREE.BoxGeometry(padW, reach * 0.015, padD), mat(0x6a2a8a, { roughness: 0.9 })));
  if (rig.table) rig.table.pad = pad;
  pad.position.set((right.shoulder.x + reach * 0.5) * (PHYSICAL ? -1 : 1), deskY + reach * 0.008, zBody + reach * 0.6);
  const mouse = addProp(makeMouse(reach * 0.2));
  mouse.position.copy(pad.position).setY(deskY + reach * 0.015);
  rig.pad = { center: pad.position.clone(), w: padW, d: padD, y: deskY + reach * 0.015 };
  rig.mouse = mouse;

  rig.focusBottom = deskY - reach * 0.25;
  applyTable(rig.sceneData?.base?.table);
}

function applyTable(t) {
  const T = rig.table; if (!T) return;
  t = { tex: 'uni', color: '#c98a4b', texScale: 1, legColor: '#8a5a2b', padColor: '#6a2a8a', width: 1, depth: 1, hidden: false, ...(t || {}) };
  const us = rig.sceneUnit ||= rig.modelBox.getSize(V()).y || 1;
  const w = T.deskW * t.width, d = T.deskD * t.depth;
  const key = JSON.stringify([t.tex, t.color, t.texScale, t.width, t.depth]);
  if (T.key !== key) {
    T.key = key;
    T.desk.geometry.dispose();
    const tile = (t.texScale || 1) * 0.6;
    T.desk.geometry = boxGeo(w / us, T.thick / us, d / us, tile).scale(us, us, us);
    T.baseMat ||= T.desk.material;
    if (T.desk.material !== T.baseMat) T.desk.material.dispose();
    T.desk.material = t.tex === 'uni' && t.texScale === 1 ? (T.baseMat.color.set(t.color), T.baseMat) : makeMaterial({ tex: t.tex, color: t.color, texScale: t.texScale });
    T.desk.position.set(0, T.deskY - T.thick, T.back + d / 2);
    for (const leg of T.legs) {
      const [sx, sz] = leg.userData.corner;
      leg.position.x = sx * (w / 2 - T.leg);
      leg.position.z = T.desk.position.z + sz * (d / 2 - T.leg);
    }
  }
  T.legMat.color.set(t.legColor);
  T.pad?.material.color.set(t.padColor);
  T.desk.visible = !t.hidden;
  for (const leg of T.legs) leg.visible = !t.hidden;
}

const WHITE = 0xf2f2f4, LIGHT = 0xdedee3, DARK = 0x26262b;

function roundedBox(w, h, d, r, material) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const bevel = Math.min(r, d) * 0.45;
  const g = new THREE.ExtrudeGeometry(s, { depth: d - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 10 });
  g.translate(0, 0, -(d - bevel * 2) / 2);
  return new THREE.Mesh(g, material);
}

function pill(radius, length, material) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 12), material);
}

function makeHeadset(face) {
  const g = new THREE.Group();
  const w = face.width * 0.86, h = face.height * 0.4, d = face.height * 0.27;
  const visor = roundedBox(w, h, d, h * 0.36, mat(WHITE, { roughness: 0.35 }));
  visor.position.z = d / 2;
  g.add(visor);
  const cushion = roundedBox(w * 0.94, h * 0.9, d * 0.5, h * 0.32, mat(0x55555c, { roughness: 0.9 }));
  cushion.position.z = -d * 0.1;
  g.add(cushion);
  const sensorMat = mat(DARK, { roughness: 0.25, metalness: 0.2 });
  for (const sx of [-0.33, 0, 0.33]) {
    const p = pill(h * 0.09, h * (sx === 0 ? 0.22 : 0.34), sensorMat);
    p.position.set(sx * w, sx === 0 ? -h * 0.12 : 0, d + 0.001);
    p.scale.z = 0.4;
    g.add(p);
  }
  const strap = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, h * 0.32, 48, 1, true), mat(0x3a3a40, { roughness: 0.8, side: THREE.DoubleSide }));
  strap.scale.set(face.headHalfWidth * 1.04, 1, face.headHalfDepth * 1.04);
  strap.position.set(0, 0, face.headCenterZ - face.front);
  g.add(strap);
  g.position.set(0, face.eyeY, face.front);
  return g;
}

function makeController(size, isLeft) {
  const outer = new THREE.Group();
  const g = new THREE.Group();
  outer.add(g);
  const body = mat(WHITE, { roughness: 0.4 });
  const face = mat(LIGHT, { roughness: 0.5 });
  const dark = mat(DARK, { roughness: 0.3 });

  const tilt = THREE.MathUtils.degToRad(35);
  const handle = pill(0.16, 0.5, body);
  handle.rotation.x = -tilt;
  const handleCenter = V(0, -0.36 * Math.cos(tilt), 0.36 * Math.sin(tilt));
  handle.position.copy(handleCenter);
  g.add(handle);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.2, 32), body);
  head.position.set(0, 0, -0.05);
  head.rotation.x = 0.25;
  g.add(head);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 32), face);
  plate.position.set(0, 0.105, -0.075);
  plate.rotation.x = 0.25;
  g.add(plate);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.1, 16), dark);
  const sx = isLeft ? 0.08 : -0.08;
  stick.position.set(sx, 0.16, 0.0);
  stick.rotation.x = 0.25;
  g.add(stick);
  for (const [bx, bz] of [[-sx * 1.2, -0.02], [-sx * 0.55, -0.16]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), dark);
    b.position.set(bx, 0.13, bz - 0.04);
    b.rotation.x = 0.25;
    g.add(b);
  }
  const trigger = pill(0.06, 0.12, mat(DARK, { roughness: 0.3, emissive: 0xd42b2b, emissiveIntensity: 0 }));
  trigger.position.set(0, -0.12, -0.27);
  trigger.rotation.x = 0.9;
  g.add(trigger);

  g.position.copy(handleCenter).multiplyScalar(-1);
  outer.scale.setScalar(size);
  outer.userData = { trigger };
  return outer;
}

const RED = 0xc8202a;

const XI = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, START: 16, BACK: 32, LS: 64, RS: 128, LB: 256, RB: 512, HOME: 1024, A: 4096, B: 8192, X: 16384, Y: 32768 };
const MINT = 0xa6e3cf, MINT_LIGHT = 0xc8f0e2, MINT_DARK = 0x6fbfa5, PAD_DARK = 0x2f3a37;

function buildGamepad(left, right, reach) {
  const u = reach;
  const deskY = left.shoulder.y - u * 0.75;
  const zBody = left.shoulder.z;

  const deskW = u * 3.4, deskD = u * 1.6, thick = u * 0.12;
  const desk = addProp(new THREE.Mesh(new THREE.BoxGeometry(deskW, thick, deskD), mat(0xc98a4b, { roughness: 0.7 })), CFG.view === 'full');
  desk.position.set(0, deskY - thick / 2, zBody + u * 0.35 + deskD / 2);
  const legMat = mat(0x8a5a2b, { roughness: 0.7 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = addProp(new THREE.Mesh(new THREE.BoxGeometry(u * 0.12, deskY - thick, u * 0.12), legMat), CFG.view === 'full');
    leg.position.set(sx * (deskW / 2 - u * 0.12), (deskY - thick) / 2, desk.position.z + sz * (deskD / 2 - u * 0.12));
  }

  const W = u * 2.0, D = u * 0.92, T = u * 0.2;
  const g = new THREE.Group();
  const body = roundedBox(W, D, T, D * 0.42, mat(MINT, { roughness: 0.45 }));
  body.rotation.x = Math.PI / 2;
  body.position.y = -T / 2;
  g.add(body);
  for (const sx of [-1, 1]) {
    const grip = pill(D * 0.27, D * 0.42, mat(MINT, { roughness: 0.45 }));
    grip.position.set(sx * W * 0.33, -T * 0.55, D * 0.42);
    grip.rotation.set(Math.PI / 2 - 0.35, 0, sx * 0.28);
    g.add(grip);
  }
  const plate = roundedBox(W * 0.62, D * 0.5, u * 0.01, D * 0.2, mat(MINT_LIGHT, { roughness: 0.5 }));
  plate.rotation.x = Math.PI / 2;
  plate.position.set(0, 0.002, -D * 0.12);
  g.add(plate);

  const controls = [];
  const addControl = (obj, side, mask, depth, topY, colorMat) => {
    const anchor = new THREE.Object3D();
    anchor.position.y = topY;
    obj.add(anchor);
    g.add(obj);
    const c = { obj, side, mask, depth, anchor, baseY: obj.position.y, mat: colorMat, down: false, k: 0, at: 0 };
    controls.push(c);
    return c;
  };

  const makeStick = (x, z, side, mask) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(D * 0.13, D * 0.025, 8, 24), mat(MINT_DARK, { roughness: 0.4 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.004, z);
    g.add(ring);
    const s = new THREE.Group();
    s.position.set(x, 0, z);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.04, D * 0.05, D * 0.12, 12), mat(PAD_DARK));
    shaft.position.y = D * 0.06;
    s.add(shaft);
    const capMat = mat(0x3c4744, { roughness: 0.8, emissive: MINT, emissiveIntensity: 0 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.11, D * 0.1, D * 0.05, 24), capMat);
    cap.position.y = D * 0.13;
    s.add(cap);
    return addControl(s, side, mask, D * 0.03, D * 0.16, capMat);
  };
  const ls = makeStick(-W * 0.3, -D * 0.15, 'L', XI.LS);
  const rs = makeStick(W * 0.13, D * 0.1, 'R', XI.RS);

  const dpadC = V(-W * 0.13, 0, D * 0.1);
  const center = new THREE.Mesh(new THREE.BoxGeometry(D * 0.1, D * 0.05, D * 0.1), mat(PAD_DARK));
  center.position.copy(dpadC).setY(D * 0.025);
  g.add(center);
  for (const [mask, dx, dz] of [[XI.UP, 0, -1], [XI.DOWN, 0, 1], [XI.LEFT, -1, 0], [XI.RIGHT, 1, 0]]) {
    const m = mat(PAD_DARK, { emissive: MINT, emissiveIntensity: 0 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(dx ? D * 0.11 : D * 0.1, D * 0.05, dz ? D * 0.11 : D * 0.1), m);
    arm.position.set(dpadC.x + dx * D * 0.105, D * 0.025, dpadC.z + dz * D * 0.105);
    addControl(arm, 'L', mask, D * 0.02, D * 0.03, m);
  }

  const abxy = V(W * 0.3, 0, -D * 0.15), sp = D * 0.13;
  for (const [mask, dx, dz, color] of [[XI.A, 0, 1, 0x6cc070], [XI.B, 1, 0, 0xe06060], [XI.X, -1, 0, 0x5a8de0], [XI.Y, 0, -1, 0xe8c84a]]) {
    const m = mat(color, { roughness: 0.35, emissive: color, emissiveIntensity: 0 });
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.065, D * 0.065, D * 0.06, 20), m);
    btn.position.set(abxy.x + dx * sp, D * 0.03, abxy.z + dz * sp);
    addControl(btn, 'R', mask, D * 0.03, D * 0.035, m);
  }

  for (const [mask, x, side] of [[XI.BACK, -W * 0.09, 'L'], [XI.START, W * 0.09, 'R']]) {
    const m = mat(PAD_DARK, { emissive: MINT, emissiveIntensity: 0 });
    const b = pill(D * 0.025, D * 0.05, m);
    b.rotation.z = Math.PI / 2;
    b.position.set(x, D * 0.02, -D * 0.2);
    addControl(b, side, mask, D * 0.015, D * 0.025, m);
  }
  const homeMat = mat(0xffffff, { roughness: 0.3, emissive: MINT, emissiveIntensity: 0 });
  const home = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.055, D * 0.055, D * 0.03, 20), homeMat);
  home.position.set(0, D * 0.015, -D * 0.34);
  addControl(home, 'R', XI.HOME, D * 0.012, D * 0.02, homeMat);

  const triggers = {};
  for (const [side, sx] of [['L', -1], ['R', 1]]) {
    const m = mat(MINT_DARK, { roughness: 0.4, emissive: MINT, emissiveIntensity: 0 });
    const bump = roundedBox(W * 0.26, D * 0.08, D * 0.1, D * 0.035, m);
    bump.position.set(sx * W * 0.3, -T * 0.15, -D * 0.5);
    addControl(bump, side, side === 'L' ? XI.LB : XI.RB, D * 0.025, D * 0.06, m);
    const tm = mat(PAD_DARK, { roughness: 0.5, emissive: MINT, emissiveIntensity: 0 });
    const trig = roundedBox(W * 0.16, D * 0.14, D * 0.1, D * 0.04, tm);
    trig.position.set(sx * W * 0.3, -T * 0.85, -D * 0.47);
    g.add(trig);
    const anchor = new THREE.Object3D();
    anchor.position.set(0, D * 0.06, -D * 0.04);
    trig.add(anchor);
    triggers[side] = { obj: trig, mat: tm, anchor, baseY: trig.position.y };
  }

  g.position.set(0, deskY + T * 0.75, zBody + u * 0.82);
  g.rotation.x = 0.4;
  addProp(g);
  g.updateMatrixWorld(true);

  for (const ctl of controls) ctl.apply = k => { ctl.obj.position.y = ctl.baseY - k * ctl.depth; if (ctl.mat) ctl.mat.emissiveIntensity = k * 0.7; };
  for (const s of [ls, rs]) s.tilt = (x, y) => s.obj.rotation.set(-y * 0.45, 0, -x * 0.45);
  for (const side of ['L', 'R']) {
    const tr = triggers[side];
    tr.apply = v => { tr.obj.position.y = tr.baseY - v * u * 0.05; tr.mat.emissiveIntensity = v * 0.7; };
    tr.grab = controls.find(x => x.mask === (side === 'L' ? XI.LB : XI.RB)).anchor;
  }
  rig.gamepad = {
    frame: g, normalLocal: V(0, 1, 0), towardLocal: V(0, 0, -1), arm: { L: rig.arms.L, R: rig.arms.R },
    controls, ls, rs, triggers, hand: { L: null, R: null }, bounce: 0, bounceVel: 0,
  };
  rig.focusBottom = deskY - u * 0.25;
}

async function buildGamepadModel(left, right, reach) {
  if (CFG.padModel === 'xbox' || CFG.padModel === 'xbox25') return buildXboxModel(left, right, reach, CFG.padModel === 'xbox25');
  if (CFG.padModel.startsWith('perso:')) return buildProfilePad(left, right, reach, CFG.padModel.slice(6));
  const u = reach;
  const gltf = await new GLTFLoader().loadAsync('./props/manette_8bitdo_2c.glb');
  const src = gltf.scene;
  src.updateMatrixWorld(true);

  let base = null;
  src.traverse(o => { if (o.isMesh && !base) base = o.material; });
  const orm = resizeTexture(base.roughnessMap || base.aoMap, 1024);
  const normalMap = base.normalMap ? resizeTexture(base.normalMap, 1024) : null;
  const makeMat = (variant, size = 2048) => {
    const m = base.clone();
    m.map = recolorTexture(base.map, variant, size);
    if (base.roughnessMap) m.roughnessMap = orm;
    if (base.metalnessMap) m.metalnessMap = orm;
    if (base.aoMap) m.aoMap = orm;
    if (normalMap) m.normalMap = normalMap;
    m.metalness = 0; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 0;
    m.needsUpdate = true;
    return m;
  };
  const shellMat = makeMat('shell'), bottomMat = makeMat('shellBottom');
  const coralMat = makeMat('coral', 1024), trigMat = makeMat('trigger', 1024);
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) base[k]?.dispose();

  const geos = {};
  src.traverse(o => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); geos[o.parent.name] = g; } });
  const model = new THREE.Group();

  const boundsOf = geo => {
    const bb = new THREE.Box3(), p = new THREE.Vector3(), pos = geo.attributes.position;
    if (geo.index) for (const i of geo.index.array) bb.expandByPoint(p.fromBufferAttribute(pos, i));
    else bb.setFromBufferAttribute(pos);
    geo.boundingBox = bb;
    geo.boundingSphere = bb.getBoundingSphere(new THREE.Sphere());
    return bb;
  };
  const makePart = (geo, material, pivotAtBase) => {
    const bb = boundsOf(geo), c = bb.getCenter(new THREE.Vector3());
    const pivot = pivotAtBase ? V(c.x, c.y, bb.min.z) : c;
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.copy(pivot).negate();
    const obj = new THREE.Group();
    obj.position.copy(pivot);
    obj.add(mesh);
    model.add(obj);
    const anchor = new THREE.Object3D();
    anchor.position.set(0, 0, bb.max.z - pivot.z);
    obj.add(anchor);
    return { obj, anchor, base: obj.position.clone(), mat: Array.isArray(material) ? material[0] : material, bb };
  };
  const twoTone = (geo, keep) => {
    const pos = geo.attributes.position, idx = geo.index.array, a = [], b = [];
    const p = new THREE.Vector3(), q = new THREE.Vector3(), r = new THREE.Vector3();
    for (let i = 0; i < idx.length; i += 3) {
      p.fromBufferAttribute(pos, idx[i]); q.fromBufferAttribute(pos, idx[i + 1]); r.fromBufferAttribute(pos, idx[i + 2]);
      (keep(p.add(q).add(r).multiplyScalar(1 / 3)) ? a : b).push(idx[i], idx[i + 1], idx[i + 2]);
    }
    geo.setIndex([...a, ...b]);
    geo.clearGroups();
    geo.addGroup(0, a.length, 0);
    geo.addGroup(a.length, b.length, 1);
    return geo;
  };
  const split = (geo, keyOf) => {
    const pos = geo.attributes.position, idx = geo.index.array, groups = {};
    const p = new THREE.Vector3(), q = new THREE.Vector3(), r = new THREE.Vector3();
    for (let i = 0; i < idx.length; i += 3) {
      p.fromBufferAttribute(pos, idx[i]); q.fromBufferAttribute(pos, idx[i + 1]); r.fromBufferAttribute(pos, idx[i + 2]);
      const k = keyOf(p.add(q).add(r).multiplyScalar(1 / 3));
      (groups[k] ||= []).push(idx[i], idx[i + 1], idx[i + 2]);
    }
    const out = {};
    for (const k in groups) { const g = geo.clone(); g.setIndex(groups[k]); out[k] = g; }
    return out;
  };
  const find = prefix => Object.keys(geos).find(n => n.startsWith(prefix));

  const mainGeo = geos[find('Main_LP')];
  const mb = boundsOf(mainGeo);
  const seamZ = mb.min.z + (mb.max.z - mb.min.z) * 0.64;
  const mainMesh = new THREE.Mesh(twoTone(mainGeo, c => c.z > seamZ), [shellMat, bottomMat]);
  model.add(mainMesh);
  for (const [n, m] of [['TopMiddleButton', bottomMat], ['LP_Back_Switch', bottomMat], ['Charger_LP', bottomMat], ['LP_Button_R4', trigMat]]) {
    const key = find(n);
    if (key) model.add(new THREE.Mesh(geos[key], m));
  }

  const controls = [];
  const addControl = (part, side, mask, apply) => {
    const ctl = { ...part, side, mask, down: false, k: 0, at: 0 };
    ctl.apply = apply ? k => apply(ctl, k) : k => {
      ctl.obj.position.copy(ctl.base).setZ(ctl.base.z - k * 4);
      ctl.mat.emissiveIntensity = k * 0.35;
    };
    controls.push(ctl);
    return ctl;
  };

  const sticks = split(geos[find('JoySticks')], c => c.x < -35 ? 'L' : 'R');
  const stick = (geo, side, mask) => {
    const bb = boundsOf(geo), capZ = bb.min.z + (bb.max.z - bb.min.z) * 0.62;
    const part = makePart(twoTone(geo, c => c.z > capZ), [coralMat.clone(), shellMat], true);
    const ctl = addControl(part, side, mask);
    ctl.tilt = (x, y) => part.obj.rotation.set(-y * 0.42, x * 0.42, 0);
    return ctl;
  };
  const ls = stick(sticks.L, 'L', XI.LS), rs = stick(sticks.R, 'R', XI.RS);

  const abxyGeo = geos[find('X,')];
  const ac = boundsOf(abxyGeo).getCenter(new THREE.Vector3());
  const abxy = split(abxyGeo, c => { const dx = c.x - ac.x, dy = c.y - ac.y; return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'B' : 'X') : (dy > 0 ? 'Y' : 'A'); });
  for (const k of ['A', 'B', 'X', 'Y']) addControl(makePart(abxy[k], coralMat.clone()), 'R', XI[k]);

  const dpad = makePart(geos[find('LP_Arrow')], coralMat.clone());
  const dpadDirs = { UP: [0, 1], DOWN: [0, -1], LEFT: [-1, 0], RIGHT: [1, 0] };
  const dpadCtl = [];
  for (const [name, [dx, dy]] of Object.entries(dpadDirs)) {
    const anchor = new THREE.Object3D();
    anchor.position.set(dx * 24, dy * 24, dpad.bb.max.z - dpad.base.z);
    dpad.obj.add(anchor);
    dpadCtl.push(addControl({ ...dpad, anchor }, 'L', XI[name], () => {}));
  }
  const updateDpad = () => {
    const k = n => dpadCtl.find(c => c.mask === XI[n]).k;
    dpad.obj.rotation.set((k('DOWN') - k('UP')) * 0.16, (k('RIGHT') - k('LEFT')) * 0.16, 0);
    dpad.mat.emissiveIntensity = Math.max(...dpadCtl.map(c => c.k)) * 0.3;
  };

  const ray = new THREE.Raycaster();
  const onFace = (x, y) => {
    ray.set(V(x, y, 500), V(0, 0, -1));
    const hit = mainMesh ? ray.intersectObject(mainMesh)[0] : null;
    return hit ? hit.point.z : 60;
  };
  for (const [mask, x, y, side] of [[XI.BACK, -70, 121, 'L'], [XI.START, 67, 121, 'R'], [XI.HOME, 0, 121, 'R']]) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(mask === XI.HOME ? 17 : 12, 24), m);
    const obj = new THREE.Group();
    obj.position.set(x, y, onFace(x, y) + 1);
    obj.add(disc);
    model.add(obj);
    const anchor = new THREE.Object3D();
    obj.add(anchor);
    addControl({ obj, anchor, base: obj.position.clone(), mat: m }, side, mask, (c, k) => { m.opacity = k * 0.8; });
  }

  const bumpers = split(geos[find('LP_Button_RB')], c => c.x < 0 ? 'L' : 'R');
  const trigs = split(geos[find('LP_Button_RT')], c => c.x < 0 ? 'L' : 'R');
  const triggers = {};
  for (const side of ['L', 'R']) {
    const bp = makePart(bumpers[side], trigMat.clone());
    const bctl = addControl(bp, side, side === 'L' ? XI.LB : XI.RB, (c, k) => {
      c.obj.position.copy(c.base).setY(c.base.y - k * 5);
      c.mat.emissiveIntensity = k * 0.35;
    });
    const tp = makePart(trigs[side], trigMat.clone());
    triggers[side] = {
      apply: v => { tp.obj.rotation.x = -v * 0.35; tp.mat.emissiveIntensity = v * 0.35; },
      grab: bctl.anchor,
    };
  }

  const holder = new THREE.Group();
  holder.add(model);
  const W = u * 2.9;
  model.scale.setScalar(W / 455);
  const basis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(-1, 0, 0), V(0, 0, 1), V(0, 1, 0)));
  holder.quaternion.copy(qAxis(AX, -0.18).multiply(basis));
  const faceY = rig.cinema ? Math.max(left.shoulder.y - u * 0.68, rig.hipY + u * 0.55) : left.shoulder.y - u * 0.68;
  holder.position.set(0, faceY - 66 * W / 455, left.shoulder.z + u * 0.62);
  addProp(holder);
  holder.updateMatrixWorld(true);

  const armLeft = right.shoulder.x > left.shoulder.x ? right : left;
  const armRight = armLeft === right ? left : right;

  rig.gamepad = {
    frame: holder, normalLocal: V(0, 0, 1), towardLocal: V(0, -1, 0), arm: { L: armLeft, R: armRight },
    controls, ls, rs, triggers, updateDpad, hand: { L: null, R: null }, bounce: 0, bounceVel: 0, lean: 0.32,
  };
  rig.focusBottom = faceY - u * 0.55;
}

const XBOX_AXIS_X = [0.99, -0.12, -0.078], XBOX_FACE_N = [0.106, 0.222, 0.969];
const XBOX_CX = -9.75, XBOX_CY = -5.5, XBOX_FACE_Z = 26, XBOX_WIDTH = 154;
const XBOX_PARTS = {
  LS: { c: [-48.47, 16.22], r: 8.7, zMin: 21 }, RS: { c: [10.86, -6.85], r: 8.7, zMin: 21 },
  DP: { c: [-29.53, -8.95], r: 11.58, zMin: 22 },
  Y: { c: [29.16, 26.09], r: 4.93, zMin: 21.4 }, X: { c: [18.99, 16.0], r: 4.94, zMin: 22.6 },
  B: { c: [39.58, 15.81], r: 4.88, zMin: 19.4 }, A: { c: [29.48, 5.75], r: 4.96, zMin: 21.6 },
  VIEW: { c: [-20.54, 16.01], r: 3.39, zMin: 23.9 }, MENU: { c: [1.36, 16.17], r: 3.37, zMin: 23.6 },
  SHARE: { c: [-9.49, 7.56], r: 2.42, stadium: 2.1, zMin: 23.7 },
  HOME: { c: [-9.74, 31.41], r: 6.04, zMin: 23.4 },
};
const XBOX_TRIGGERS = { L: { x: [-63, -46] }, R: { x: [25.6, 45] }, zBackMost: -21, corner: 5, yMin: 27 };
const xboxSeamZ = x => 4.5 + Math.max(0, Math.abs(x - XBOX_CX) - 40) * 0.3;

function xboxCutFields() {
  const out = {};
  for (const [k, p] of Object.entries(XBOX_PARTS)) {
    const [cx, cy] = p.c, L = p.stadium || 0;
    const radial = (x, y) => p.r - Math.hypot(Math.max(Math.abs(x - cx) - L, 0), y - cy);
    out[k] = { fields: [radial, (x, y, z) => z - p.zMin], near: (x, y, z) => radial(x, y) > -1.5 && z > p.zMin - 1.5 };
  }
  for (const s of ['L', 'R']) {
    const [x0, x1] = XBOX_TRIGGERS[s].x, rc = XBOX_TRIGGERS.corner;
    const roundRect = (x, z) => {
      const cx = (x0 + x1) / 2, z0 = XBOX_TRIGGERS.zBackMost, z1 = xboxSeamZ(x), cz = (z0 + z1) / 2;
      const qx = Math.abs(x - cx) - ((x1 - x0) / 2 - rc), qz = Math.abs(z - cz) - ((z1 - z0) / 2 - rc);
      return rc - (Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0));
    };
    const fields = [(x, y, z) => roundRect(x, z), (x, y) => y - XBOX_TRIGGERS.yMin];
    out[s + 'T'] = { fields, near: (x, y, z) => fields.every(f => f(x, y, z) > -1.5) };
    const sign = s === 'L' ? -1 : 1;
    const bf = [(x) => sign * (x - XBOX_CX) - 24, (x, y) => y - 38.5, (x, y, z) => z - xboxSeamZ(x), (x, y, z) => 20.8 - z];
    out[s + 'B'] = { fields: bf, near: (x, y, z) => bf.every(f => f(x, y, z) > -1.5) };
  }
  return out;
}

function cutXbox(geo) {
  const parts = xboxCutFields(), keys = Object.keys(parts);
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, U = geo.attributes.uv.array, idx = geo.index.array;
  const out = {};
  const sink = k => (out[k] ||= { p: [], n: [], u: [] });
  const vert = i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2], U[i * 2], U[i * 2 + 1]];
  const lerp = (a, b, t) => a.map((v, j) => v + (b[j] - v) * t);
  const emit = (k, poly) => {
    const s = sink(k);
    for (let i = 1; i + 1 < poly.length; i++) for (const v of [poly[0], poly[i], poly[i + 1]]) {
      const l = Math.hypot(v[3], v[4], v[5]) || 1;
      s.p.push(v[0], v[1], v[2]); s.n.push(v[3] / l, v[4] / l, v[5] / l); s.u.push(v[6], v[7]);
    }
  };
  const clip = (poly, f) => {
    const inside = [], outside = [], fv = poly.map(v => f(v[0], v[1], v[2]));
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length, a = poly[i], fa = fv[i], fb = fv[j];
      (fa > 0 ? inside : outside).push(a);
      if ((fa > 0) !== (fb > 0)) { const v = lerp(a, poly[j], fa / (fa - fb)); inside.push(v); outside.push(v); }
    }
    return [inside, outside];
  };
  const assign = (poly, from) => {
    let cx = 0, cy = 0, cz = 0;
    for (const v of poly) { cx += v[0]; cy += v[1]; cz += v[2]; }
    cx /= poly.length; cy /= poly.length; cz /= poly.length;
    let ki = -1;
    for (let i = from; i < keys.length; i++) if (parts[keys[i]].near(cx, cy, cz)) { ki = i; break; }
    if (ki < 0) { emit('shell', poly); return; }
    for (const f of parts[keys[ki]].fields) {
      const [inside, outside] = clip(poly, f);
      if (outside.length >= 3) assign(outside, ki + 1);
      poly = inside;
      if (poly.length < 3) return;
    }
    emit(keys[ki], poly);
  };
  for (let t = 0; t < idx.length; t += 3) assign([vert(idx[t]), vert(idx[t + 1]), vert(idx[t + 2])], 0);
  const geos = {};
  for (const [k, s] of Object.entries(out)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(s.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(s.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(s.u, 2));
    g.computeBoundingBox(); g.computeBoundingSphere();
    geos[k] = g;
  }
  return geos;
}

function trianglesWhere(geo, keep) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, p = [], n = [];
  for (let i = 0; i < P.length; i += 9) {
    if (!keep((P[i] + P[i + 3] + P[i + 6]) / 3, (P[i + 1] + P[i + 4] + P[i + 7]) / 3, (P[i + 2] + P[i + 5] + P[i + 8]) / 3)) continue;
    for (let j = 0; j < 9; j++) { p.push(P[i + j]); n.push(N[i + j]); }
  }
  if (!p.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  return g;
}

const GLSL_NOISE = `
float x25h(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float x25n(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(x25h(i), x25h(i + vec3(1,0,0)), f.x), mix(x25h(i + vec3(0,1,0)), x25h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(x25h(i + vec3(0,0,1)), x25h(i + vec3(1,0,1)), f.x), mix(x25h(i + vec3(0,1,1)), x25h(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float x25fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * x25n(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return v; }
`;

function xboxMaterial(base, kind, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    map: base.map, roughness: opts.roughness ?? 0.55, metalness: 0,
    emissive: new THREE.Color(opts.emissive ?? 0xffffff), emissiveIntensity: opts.glow ?? 0,
    emissiveMap: opts.emissiveMap ? base.map : null,
    clearcoat: opts.clearcoat ?? 0, clearcoatRoughness: 0.18,
    side: THREE.DoubleSide,
  });
  if (kind === 'plain') return m;
  const color = new THREE.Color(opts.color ?? 0xffffff);
  const PATTERNS = { uni: 0, fumee: 1, camo: 2, degrade: 3 };
  m.userData.uniforms = {
    uTint: { value: color }, uA: { value: new THREE.Color(opts.color ?? 0xffffff) }, uB: { value: new THREE.Color(opts.alt ?? 0x000000) },
    uPat: { value: PATTERNS[opts.pattern] ?? 0 }, uLight: { value: new THREE.Color(opts.light ?? 0xbff2a6) },
  };
  m.customProgramCacheKey = () => 'xbox-' + kind;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    const detail = `
      vec4 texel = texture2D(map, vMapUv);
      float lum = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
      float detail = clamp(lum / 0.045, 0.55, 1.6); // relief et grain du scan, sans sa couleur noire`;
    const body = kind === 'smoke' ? `
      // vert translucide clair, traversé de volutes vert sombre (comme la coque de l'édition 25 ans)
      float n = x25fbm(vObj * 0.045);
      float s = x25fbm(vec3(vObj.x * 0.028, vObj.y * 0.075, vObj.z * 0.04) + n * 2.4);
      float fine = x25fbm(vObj * 0.16 + n);
      float smoke = smoothstep(0.36, 0.66, s) * (0.75 + 0.5 * fine);
      float wisp = smoothstep(0.03, 0.0, abs(s - 0.47)) * 0.5; // filaments plus clairs au bord des volutes
      vec3 lime = vec3(0.15, 0.40, 0.035), deep = vec3(0.006, 0.04, 0.008);
      vec3 col = mix(lime, deep, clamp(smoke, 0.0, 1.0) * 0.92) + vec3(0.09, 0.2, 0.03) * wisp;
      diffuseColor.rgb = col * mix(1.0, detail, 0.55);` : kind === 'logo' ? `
      // bouton Xbox vert : logo clair dessiné ici (cercle + X), le scan le montre à peine
      vec2 lp = vObj.xy - vec2(${XBOX_PARTS.HOME.c[0].toFixed(2)}, ${XBOX_PARTS.HOME.c[1].toFixed(2)});
      float lr = length(lp);
      float ring = smoothstep(0.42, 0.18, abs(lr - 3.75));
      float cross = smoothstep(0.62, 0.3, abs(abs(lp.x) - abs(lp.y))) * smoothstep(3.6, 3.2, lr);
      float logo = max(ring, cross);
      diffuseColor.rgb = mix(uTint * mix(1.0, detail, 0.3), uLight, logo);` : kind === 'paint' ? `
      // coque peinte : couleur principale, 2e couleur selon le motif (calculé dans la manette : aucune couture)
      float m2 = 0.0, wisp = 0.0;
      if (uPat > 0.5 && uPat < 1.5) {        // fumée (volutes)
        float n = x25fbm(vObj * 0.045);
        float s = x25fbm(vec3(vObj.x * 0.028, vObj.y * 0.075, vObj.z * 0.04) + n * 2.4);
        m2 = clamp(smoothstep(0.36, 0.66, s) * (0.75 + 0.5 * x25fbm(vObj * 0.16 + n)), 0.0, 1.0) * 0.92;
        wisp = smoothstep(0.03, 0.0, abs(s - 0.47)) * 0.35;
      } else if (uPat > 1.5 && uPat < 2.5) { // camouflage (taches nettes)
        float c1 = x25fbm(vObj * 0.05 + vec3(3.0)), c2 = x25fbm(vObj * 0.085 + vec3(11.0));
        m2 = max(step(0.52, c1) * 0.65, step(0.58, c2));
      } else if (uPat > 2.5) {              // dégradé (du haut vers les poignées)
        m2 = smoothstep(30.0, -45.0, vObj.y);
      }
      vec3 col = mix(uA, uB, m2) + (uA + uB) * 0.25 * wisp;
      diffuseColor.rgb = col * mix(1.0, detail, 0.5);` : kind === 'tint' ? `
      diffuseColor.rgb = uTint * mix(1.0, detail, 0.6);` : `
      // bouton coloré, lettre plus foncée (la lettre colorée du scan sert de masque)
      float mx = max(max(texel.r, texel.g), texel.b), mn = min(min(texel.r, texel.g), texel.b);
      float letter = smoothstep(0.03, 0.12, mx - mn);
      diffuseColor.rgb = mix(uTint * mix(1.0, detail, 0.4), uTint * 0.28, letter);`;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nuniform vec3 uTint, uA, uB, uLight;\nuniform float uPat;\n' + GLSL_NOISE)
      .replace('#include <map_fragment>', detail + body);
  };
  return m;
}

function xbox25Decal(shellGeo) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 400;
  const g = c.getContext('2d');
  g.fillStyle = '#071407';
  g.textAlign = 'center';
  g.globalAlpha = 0.9;
  g.font = '900 128px "Segoe UI Black", "Arial Black", sans-serif';
  g.fillText('XBOX', 256, 150);
  g.font = 'italic 900 220px "Segoe UI Black", "Arial Black", sans-serif';
  g.fillText('25', 256, 365);
  for (const [y, h, dx] of [[60, 14, 10], [205, 18, -12], [300, 10, 14]]) {
    const strip = g.getImageData(0, y, 512, h);
    g.clearRect(0, y, 512, h);
    g.putImageData(strip, dx, y);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const x0 = 26.5, x1 = 51.5, y0 = -24, y1 = -4.5;
  const geo = trianglesWhere(shellGeo, (x, y, z) => x > x0 - 1 && x < x1 + 1 && y > y0 - 1 && y < y1 + 1 && z > 10);
  if (!geo) return null;
  const pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) - x0) / (x1 - x0); uv[i * 2 + 1] = (pos.getY(i) - y0) / (y1 - y0); }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  return new THREE.Mesh(geo, m);
}

async function buildXboxModel(left, right, reach, anniversary, style = null) {
  const u = reach;
  const gltf = await new GLTFLoader().loadAsync('./props/manette_xbox.glb');
  const src = gltf.scene;
  src.updateMatrixWorld(true);
  let base = null;
  src.traverse(o => { if (o.isMesh && !base) base = o.material; });
  base.map.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const xa = V(...XBOX_AXIS_X).normalize(), n0 = V(...XBOX_FACE_N);
  const za = n0.sub(xa.clone().multiplyScalar(n0.dot(xa))).normalize(), ya = za.clone().cross(xa).normalize();
  const toPad = new THREE.Matrix4().makeBasis(xa, ya, za).transpose();
  const geos = [];
  src.traverse(o => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld).applyMatrix4(toPad); geos.push(g); } });
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  const parts = cutXbox(merged);
  merged.dispose();

  const glossy = style?.finish === 'brillant';
  const finish = glossy ? { roughness: 0.28, clearcoat: 0.9 } : { roughness: 0.58, clearcoat: 0 };
  const M = style ? {
    shell: () => xboxMaterial(base, 'paint', { ...finish, color: style.shell, alt: style.alt, pattern: style.pattern, emissive: style.light }),
    trigger: () => style.trig
      ? xboxMaterial(base, 'paint', { ...finish, color: style.trig, alt: style.trig, pattern: 'uni', emissive: style.light })
      : xboxMaterial(base, 'paint', { ...finish, color: style.shell, alt: style.alt, pattern: style.pattern, emissive: style.light }),
    stick: () => xboxMaterial(base, 'tint', { color: style.sticks, roughness: 0.7, emissive: style.light }),
    button: color => style.buttons === 'noir'
      ? xboxMaterial(base, 'plain', { roughness: 0.22, clearcoat: 0.6, emissiveMap: true })
      : xboxMaterial(base, 'jelly', { color: style.buttons === 'mono' ? style.btn : color, roughness: 0.2, clearcoat: 1, emissive: style.buttons === 'mono' ? style.btn : color }),
    small: () => xboxMaterial(base, 'tint', { color: style.sticks, roughness: 0.4, emissive: style.light }),
    home: () => xboxMaterial(base, 'logo', { color: style.sticks, light: style.light, roughness: 0.2, clearcoat: 1, emissive: style.light, glow: 0.25 }),
  } : anniversary ? {
    shell: () => xboxMaterial(base, 'smoke', { roughness: 0.3, clearcoat: 0.9, emissive: 0x7dff4a }),
    stick: () => xboxMaterial(base, 'plain', { roughness: 0.7, emissiveMap: true }),
    button: color => xboxMaterial(base, 'jelly', { color, roughness: 0.2, clearcoat: 1, emissive: color }),
    small: () => xboxMaterial(base, 'plain', { roughness: 0.35, emissiveMap: true }),
    home: () => xboxMaterial(base, 'logo', { color: 0x3f9a1c, roughness: 0.2, clearcoat: 1, emissive: 0x9dff6a, glow: 0.18 }),
  } : {
    shell: () => xboxMaterial(base, 'plain', { roughness: 0.6, emissiveMap: true }),
    stick: () => xboxMaterial(base, 'plain', { roughness: 0.72, emissiveMap: true }),
    button: () => xboxMaterial(base, 'plain', { roughness: 0.22, clearcoat: 0.6, emissiveMap: true }),
    small: () => xboxMaterial(base, 'plain', { roughness: 0.3, emissiveMap: true }),
    home: () => xboxMaterial(base, 'plain', { roughness: 0.25, clearcoat: 0.6, emissiveMap: true, glow: 0.9 }),
  };
  const ABXY_COLORS = { A: 0x5fbf2f, B: 0xe0332a, X: 0x2f86e8, Y: 0xf5c518 };

  const inner = new THREE.Group();
  inner.position.set(-XBOX_CX, -XBOX_CY, 0);
  const model = new THREE.Group();
  model.add(inner);

  const shellMat = M.shell();
  inner.add(new THREE.Mesh(parts.shell, shellMat));
  if (anniversary) { const decal = xbox25Decal(parts.shell); if (decal) inner.add(decal); }

  const makePart = (geo, material, pivot) => {
    const bb = geo.boundingBox, c = bb.getCenter(new THREE.Vector3());
    pivot ||= c;
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.copy(pivot).negate();
    const obj = new THREE.Group();
    obj.position.copy(pivot);
    obj.add(mesh);
    inner.add(obj);
    const anchor = new THREE.Object3D();
    anchor.position.set(c.x - pivot.x, c.y - pivot.y, bb.max.z - pivot.z);
    obj.add(anchor);
    return { obj, anchor, base: obj.position.clone(), mat: material, bb };
  };

  const controls = [];
  const addControl = (part, side, mask, apply, glow = 0.9) => {
    const ctl = { ...part, side, mask, down: false, k: 0, at: 0 };
    const rest = part.mat.emissiveIntensity;
    ctl.apply = apply ? k => apply(ctl, k) : k => {
      ctl.obj.position.copy(ctl.base).setZ(ctl.base.z - k * 1.3);
      ctl.mat.emissiveIntensity = rest + k * glow;
    };
    controls.push(ctl);
    return ctl;
  };

  const stick = (key, side, mask) => {
    const [x, y] = XBOX_PARTS[key].c;
    const part = makePart(parts[key], M.stick(), V(x, y, 14));
    const ctl = addControl(part, side, mask, (c, k) => { c.obj.position.copy(c.base).setZ(c.base.z - k * 1.8); c.mat.emissiveIntensity = k * (style ? 0.45 : 2.5); });
    ctl.tilt = (tx, ty) => part.obj.rotation.set(-ty * 0.3, tx * 0.3, 0);
    return ctl;
  };
  const ls = stick('LS', 'L', XI.LS), rs = stick('RS', 'R', XI.RS);

  for (const k of ['A', 'B', 'X', 'Y'])
    if (parts[k]) addControl(makePart(parts[k], M.button(ABXY_COLORS[k])), 'R', XI[k], null, anniversary || (style && style.buttons !== 'noir') ? 0.55 : 3);
  for (const [k, side, mask] of [['VIEW', 'L', XI.BACK], ['MENU', 'R', XI.START], ['HOME', 'R', XI.HOME]]) {
    if (!parts[k]) continue;
    const part = makePart(parts[k], k === 'HOME' ? M.home() : M.small());
    addControl(part, side, mask, (c, kk) => { c.obj.position.copy(c.base).setZ(c.base.z - kk * 0.8); c.mat.emissiveIntensity = (k === 'HOME' ? (anniversary ? 0.18 : style ? 0.25 : 0.9) : 0) + kk * (k === 'HOME' ? 1.5 : style ? 0.5 : 3); });
  }
  if (parts.SHARE) makePart(parts.SHARE, M.small());

  const dp = XBOX_PARTS.DP.c;
  const dpad = makePart(parts.DP, M.stick(), V(dp[0], dp[1], 20));
  const dpadCtl = [];
  for (const [name, [dx, dy]] of Object.entries({ UP: [0, 1], DOWN: [0, -1], LEFT: [-1, 0], RIGHT: [1, 0] })) {
    const anchor = new THREE.Object3D();
    anchor.position.set(dx * 8, dy * 8, dpad.bb.max.z - 20);
    dpad.obj.add(anchor);
    dpadCtl.push(addControl({ ...dpad, anchor }, 'L', XI[name], () => {}));
  }
  const updateDpad = () => {
    const k = n => dpadCtl.find(c => c.mask === XI[n]).k;
    dpad.obj.rotation.set((k('DOWN') - k('UP')) * 0.12, (k('RIGHT') - k('LEFT')) * 0.12, 0);
    dpad.mat.emissiveIntensity = Math.max(...dpadCtl.map(c => c.k)) * (style ? 0.45 : 2.5);
  };

  const triggers = {};
  for (const side of ['L', 'R']) {
    const bp = makePart(parts[side + 'B'], (M.trigger || M.shell)());
    const brest = bp.mat.emissiveIntensity;
    const bctl = addControl(bp, side, side === 'L' ? XI.LB : XI.RB, (c, k) => {
      c.obj.position.copy(c.base).setY(c.base.y - k * 1.5);
      c.mat.emissiveIntensity = brest + k * (anniversary || style ? 0.5 : 2);
    });
    const tx = XBOX_TRIGGERS[side].x, tcx = (tx[0] + tx[1]) / 2;
    const tp = makePart(parts[side + 'T'], (M.trigger || M.shell)(), V(tcx, 43, xboxSeamZ(tcx) - 1));
    triggers[side] = {
      apply: v => { tp.obj.rotation.x = -v * 0.3; tp.mat.emissiveIntensity = v * (anniversary || style ? 0.5 : 2); },
      grab: bctl.anchor,
    };
  }

  const holder = new THREE.Group();
  holder.add(model);
  const W = u * 2.9;
  model.scale.setScalar(W / XBOX_WIDTH);
  const basis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(-1, 0, 0), V(0, 0, 1), V(0, 1, 0)));
  holder.quaternion.copy(qAxis(AX, -0.18).multiply(basis));
  const faceY = rig.cinema ? Math.max(left.shoulder.y - u * 0.68, rig.hipY + u * 0.55) : left.shoulder.y - u * 0.68;
  holder.position.set(0, faceY - XBOX_FACE_Z * W / XBOX_WIDTH, left.shoulder.z + u * 0.62);
  addProp(holder);
  holder.updateMatrixWorld(true);

  const armLeft = right.shoulder.x > left.shoulder.x ? right : left;
  const armRight = armLeft === right ? left : right;
  rig.gamepad = {
    frame: holder, normalLocal: V(0, 0, 1), towardLocal: V(0, -1, 0), arm: { L: armLeft, R: armRight },
    controls, ls, rs, triggers, updateDpad, hand: { L: null, R: null }, bounce: 0, bounceVel: 0, lean: 0.32,
  };
  rig.focusBottom = faceY - u * 0.55;
}

async function buildProfilePad(left, right, reach, file) {
  const u = reach;
  const profile = await fetch('./manettes/' + encodeURIComponent(file), { cache: 'no-store' }).then(r => {
    if (!r.ok) throw new Error('manette introuvable : ' + file);
    return r.json();
  });
  const built = await buildController(profile);
  const { controls, ls, rs, triggers, updateDpad } = makeControls(built);
  const t = profile.tenue || {};
  const holder = new THREE.Group();
  holder.add(built.model);
  const W = u * 2.9 * (t.taille || 1);
  built.model.scale.setScalar(W / PAD_WIDTH);
  const basis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(-1, 0, 0), V(0, 0, 1), V(0, 1, 0)));
  holder.quaternion.copy(qAxis(AX, -0.18 - THREE.MathUtils.degToRad(t.inclinaison || 0)).multiply(basis));
  const faceY = rig.cinema ? Math.max(left.shoulder.y - u * 0.68, rig.hipY + u * 0.55) : left.shoulder.y - u * 0.68;
  const faceZ = built.size.z * 0.35;
  holder.position.set(0, faceY - faceZ * W / PAD_WIDTH + (t.hauteur || 0) * u, left.shoulder.z + u * 0.62);
  addProp(holder);
  holder.updateMatrixWorld(true);
  const armLeft = right.shoulder.x > left.shoulder.x ? right : left;
  const armRight = armLeft === right ? left : right;
  rig.gamepad = {
    frame: holder, normalLocal: V(0, 0, 1), towardLocal: V(0, -1, 0), arm: { L: armLeft, R: armRight },
    controls, ls, rs, triggers, updateDpad, hand: { L: null, R: null }, bounce: 0, bounceVel: 0, lean: 0.32,
  };
  rig.focusBottom = faceY - u * 0.55;
}

function resizeTexture(tex, size) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.min(size, tex.image.width);
  c.getContext('2d').drawImage(tex.image, 0, 0, c.width, c.height);
  return copyTexSettings(new THREE.CanvasTexture(c), tex);
}
function copyTexSettings(t, from) {
  for (const k of ['flipY', 'colorSpace', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'channel']) t[k] = from[k];
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.needsUpdate = true;
  return t;
}

function recolorTexture(tex, variant, size = 2048) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.min(size, tex.image.width);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(tex.image, 0, 0, c.width, c.height);
  const img = g.getImageData(0, 0, c.width, c.height), p = img.data;
  const PALETTE = {
    shell: [[0.78, 0.91, 0.87], [0.64, 0.80, 0.76]],
    shellBottom: [[0.93, 0.83, 0.79], [0.64, 0.80, 0.76]],
    coral: [[0.93, 0.35, 0.29], [0.98, 0.92, 0.84]],
    trigger: [[0.66, 0.81, 0.77], [0.34, 0.45, 0.42]],
  };
  const [bodyCol, accentCol] = PALETTE[variant] || PALETTE.shell;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i] / 255, gr = p[i + 1] / 255, b = p[i + 2] / 255;
    const mx = Math.max(r, gr, b), mn = Math.min(r, gr, b), L = (r + gr + b) / 3;
    let out = null;
    if (gr > r + 0.12 && gr > b + 0.12) {
      const f = 0.85 + gr * 0.15;
      out = accentCol.map(v => v * f);
    } else if (mx - mn < 0.14 && L < 0.55) {
      const f = THREE.MathUtils.clamp(0.94 + (L - 0.15) * 1.0, 0.7, 1.08);
      out = bodyCol.map(v => v * f);
    }
    if (out) { p[i] = Math.min(255, out[0] * 255); p[i + 1] = Math.min(255, out[1] * 255); p[i + 2] = Math.min(255, out[2] * 255); }
  }
  g.putImageData(img, 0, 0);
  return copyTexSettings(new THREE.CanvasTexture(c), tex);
}

function solvePad(t, dt) {
  const c = rig.gamepad, d = state.pad, u = rig.unit, now = performance.now();
  if (!c) return;
  const b = d.b | 0;

  for (const ctl of c.controls) {
    const down = (b & ctl.mask) !== 0;
    if (down && !ctl.down) { ctl.at = now; c.bounceVel -= 0.7; }
    ctl.down = down;
    ctl.k = damp(ctl.k, down ? 1 : 0, down ? 40 : 18, dt);
    ctl.apply(ctl.k);
  }
  c.updateDpad?.();
  c.ls.tilt(d.lx || 0, d.ly || 0);
  c.rs.tilt(d.rx || 0, d.ry || 0);
  for (const side of ['L', 'R']) c.triggers[side].apply((side === 'L' ? d.lt : d.rt) || 0);

  c.bounceVel += (-c.bounce * 260 - c.bounceVel * 16) * dt;
  c.bounce += c.bounceVel * dt;
  rig.root.position.y += c.bounce * 0.01;
  const lean = (c.lean ?? 0.18) + Math.sin(t * 1.3) * 0.015 - c.bounce * 0.05;
  const sway = Math.sin(t * 0.9) * 0.02 + (d.lx || 0) * 0.04;
  rotateWorld(rig.bones.Spine_1, qAxis(AX, lean).multiply(qAxis(AZ, -sway)));

  const talkNod = face.talk * Math.sin(t * 14) * 0.035;
  const yaw = Math.sin(t * 0.6) * 0.025;
  const pitch = -lean + Math.sin(t * 1.7) * 0.01 + talkNod;
  rotateWorld(rig.bones.Head, qAxis(AY, yaw).multiply(qAxis(AX, pitch)).multiply(qAxis(AZ, sway)));

  c.frame.updateMatrixWorld(true);
  const normal = c.normalLocal.clone().applyQuaternion(c.frame.quaternion);
  const towardMii = c.towardLocal.clone().applyQuaternion(c.frame.quaternion);
  for (const side of ['L', 'R']) {
    const held = c.controls.filter(x => x.side === side && x.down).sort((a, b2) => b2.at - a.at)[0];
    const trigV = (side === 'L' ? d.lt : d.rt) || 0;
    let anchor, press, back = u * 0.05;
    if (held) { anchor = held.anchor; press = 1; }
    else if (trigV > 0.15) {
      anchor = c.triggers[side].grab; press = trigV * 0.6; back = 0;
    }
    else { anchor = (side === 'L' ? c.ls : c.rs).anchor; press = 0; }
    const target = anchor.getWorldPosition(new THREE.Vector3())
      .addScaledVector(normal, u * (0.11 - press * 0.04))
      .addScaledVector(towardMii, back);
    if (!c.hand[side]) c.hand[side] = target.clone();
    c.hand[side].lerp(target, 1 - Math.exp(-30 * dt));
    solveIK(c.arm[side], c.hand[side]);
  }
}

function cloneSkinned(src) {
  const clone = src.clone(true);
  const a = [], b = [];
  src.traverse(o => a.push(o));
  clone.traverse(o => b.push(o));
  const index = new Map(a.map((o, i) => [o, i]));
  for (let i = 0; i < a.length; i++) {
    if (!a[i].isSkinnedMesh) continue;
    const sk = a[i].skeleton;
    b[i].bind(new THREE.Skeleton(sk.bones.map(bn => b[index.get(bn)]), sk.boneInverses), a[i].bindMatrix);
  }
  return clone;
}

function setupMinis() {
  const c = rig.gamepad;
  if (!c) return;
  const fr = c.frame;
  fr.updateMatrixWorld(true);
  const center = new THREE.Box3().setFromObject(fr).getCenter(V());
  const turn = qAxis(AX, 0.5).multiply(qAxis(AY, Math.PI));
  fr.position.sub(center).applyQuaternion(turn).add(center);
  fr.quaternion.premultiply(turn);
  fr.updateMatrixWorld(true);
  const P = o => o.getWorldPosition(V());
  const h = Math.max(0.05, P(c.ls.anchor).distanceTo(P(c.rs.anchor)) * 0.5);
  const restByName = new Map([...rig.rest].map(([bone, q]) => [bone.name, q]));
  let phase = 0;
  const make = (role, extra) => {
    const model = cloneSkinned(rig.root);
    model.visible = true;
    model.position.set(0, 0, 0); model.rotation.set(0, 0, 0); model.scale.copy(rig.root.scale);
    const bones = {}, rest = [];
    model.traverse(o => {
      if (!o.isBone) return;
      const q = restByName.get(o.name);
      if (q) { o.quaternion.copy(q); rest.push([o, q]); }
      bones[o.name] = o;
    });
    model.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(model);
    const inner = new THREE.Group();
    inner.add(model);
    model.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    inner.scale.setScalar(h / Math.max(1e-6, bb.max.y - bb.min.y));
    const holder = new THREE.Group();
    holder.add(inner);
    scene.add(holder);
    return { role, holder, bones, rest, pos: null, from: null, goal: null, hop: 1, phase: phase++ * 1.7, ...extra };
  };
  const byMask = m => c.controls.find(x => x.mask === m);
  const pick = masks => masks.map(byMask).filter(Boolean);
  const minis = [
    make('stick', { stick: c.ls, click: byMask(64), side: 'L' }),
    make('stick', { stick: c.rs, click: byMask(128), side: 'R' }),
  ];
  const groups = [
    { ctls: pick([4096, 8192, 16384, 32768]) }, { ctls: pick([1, 2, 4, 8]) },
    { ctls: pick([256]), trig: 'L' }, { ctls: pick([512]), trig: 'R' },
  ].filter(g => g.ctls.length || (g.trig && c.triggers?.[g.trig]));
  const btn = groups.map(g => make('buttons', { ...g, homeCtls: [...g.ctls] }));
  const home = m => {
    const pts = (m.homeCtls || m.ctls).map(x => P(x.anchor));
    if (!pts.length && m.trig) pts.push(P(c.triggers[m.trig].grab));
    return pts.reduce((s, p) => s.add(p), V()).multiplyScalar(1 / Math.max(1, pts.length));
  };
  const used = new Set([64, 128, ...btn.flatMap(m => m.ctls.map(x => x.mask))]);
  for (const ctl of c.controls.filter(x => !used.has(x.mask))) {
    const p = P(ctl.anchor);
    const near = btn.filter(m => m.ctls.length).sort((a, b2) => home(a).distanceTo(p) - home(b2).distanceTo(p))[0];
    near?.ctls.push(ctl);
  }
  minis.push(...btn);
  rig.minis = { list: minis, h, home };
  rig.root.visible = false;
  if (rig.seat) rig.seat.visible = false;
  updateMinis(0, 0);
  const box = new THREE.Box3().setFromObject(c.frame);
  for (const m of minis) box.expandByObject(m.holder);
  rig.modelBox = box;
  rig.focusBottom = box.min.y;
}

const _mq = new THREE.Quaternion(), _mm = new THREE.Matrix4();
function updateMinis(t, dt) {
  const c = rig.gamepad, d = state.pad, { list, h, home } = rig.minis;
  c.frame.updateMatrixWorld(true);
  const n = c.normalLocal.clone().applyQuaternion(c.frame.quaternion).normalize();
  const right = V(1, 0, 0).applyQuaternion(c.frame.quaternion);
  const top = V(0, 1, 0).applyQuaternion(c.frame.quaternion);
  const up = V(0, 1, 0), fwd = V(0, 0, 1);
  const base = new THREE.Quaternion();
  for (const m of list) {
    for (const [b, q] of m.rest) b.quaternion.copy(q);
    let target, squash = 0, arms = 0.18 + Math.sin(t * 2.1 + m.phase) * 0.04, lean = null;
    if (m.role === 'stick') {
      target = m.stick.anchor.getWorldPosition(V());
      const x = (m.side === 'L' ? d.lx : d.rx) || 0, y = (m.side === 'L' ? d.ly : d.ry) || 0;
      lean = right.clone().multiplyScalar(x).addScaledVector(top, y);
      squash = m.click?.k || 0;
      arms = 0.3 + Math.min(1, Math.hypot(x, y)) * 0.9;
    } else {
      const held = m.ctls.filter(x => x.down).sort((a, b) => b.at - a.at)[0];
      const trigV = m.trig ? ((m.trig === 'L' ? d.lt : d.rt) || 0) : 0;
      if (held) { target = held.anchor.getWorldPosition(V()); squash = held.k; }
      else if (trigV > 0.15) { target = c.triggers[m.trig].grab.getWorldPosition(V()); squash = trigV; }
      else target = home(m);
      arms = 0.18 + squash * 0.9 + Math.sin(t * 2.1 + m.phase) * 0.04;
    }
    target.addScaledVector(n, h * 0.03);
    if (!m.pos) { m.pos = target.clone(); m.from = target.clone(); m.goal = target.clone(); }
    if (m.goal.distanceTo(target) > h * 0.2) { m.from.copy(m.pos); m.hop = 0; }
    m.goal.copy(target);
    m.hop = Math.min(1, m.hop + dt / 0.17);
    const e = m.hop * m.hop * (3 - 2 * m.hop);
    m.pos.lerpVectors(m.from, m.goal, e).addScaledVector(up, Math.sin(Math.PI * m.hop) * h * 0.4 + Math.sin(t * 3 + m.phase) * h * 0.008);
    m.holder.position.copy(m.pos);
    m.holder.quaternion.copy(base);
    if (lean && lean.lengthSq() > 1e-4) {
      lean.addScaledVector(up, -lean.dot(up));
      const ax = V().crossVectors(up, lean).normalize();
      m.holder.quaternion.premultiply(_mq.setFromAxisAngle(ax, Math.min(1, lean.length()) * 0.42));
    }
    m.holder.scale.set(1 + squash * 0.12, 1 - squash * 0.28, 1 + squash * 0.12);
    m.holder.updateMatrixWorld(true);
    const f = fwd.clone().applyQuaternion(_mq.copy(m.holder.quaternion).multiply(base.clone().invert()));
    if (m.bones.Arm_1_L) rotateWorld(m.bones.Arm_1_L, qAxisV(f, arms));
    if (m.bones.Arm_1_R) rotateWorld(m.bones.Arm_1_R, qAxisV(f, -arms));
  }
}
const qAxisV = (axis, a) => new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), a);

function buildCockpit(left, right, reach) {
  const u = reach;
  const armL = right.shoulder.x > left.shoulder.x ? right : left;
  const armR = armL === right ? left : right;
  armL.pole = V(1, -0.9, -0.3).normalize();
  armR.pole = V(-1, -0.9, -0.3).normalize();

  const leg = (a, b, c, side) => {
    const A = worldPos(findBone(a)), B = worldPos(findBone(b)), C = worldPos(findBone(c));
    return { upper: findBone(a), lower: findBone(b), end: findBone(c), lenA: A.distanceTo(B), lenB: B.distanceTo(C), hip: A, pole: V(side * 0.15, 0.4, 1).normalize() };
  };
  const legs = [leg('Leg_1_L', 'Leg_2_L', 'Ankle_L', 1), leg('Leg_1_R', 'Leg_2_R', 'Ankle_R', -1)];
  const [legL, legR] = legs[0].hip.x > legs[1].hip.x ? legs : [legs[1], legs[0]];
  const hipY = (legL.hip.y + legR.hip.y) / 2, hipZ = legL.hip.z;
  const thigh = legL.lenA, shin = legL.lenB;

  const seatMat = mat(0x1d1d22, { roughness: 0.8 }), stripe = mat(RED, { roughness: 0.6 });
  const seatTop = hipY - u * 0.12;
  const seat = new THREE.Group();
  const cushion = roundedBox(u * 1.25, thigh * 1.15, u * 0.14, u * 0.05, seatMat);
  cushion.rotation.x = Math.PI / 2;
  cushion.position.set(0, seatTop - u * 0.07, hipZ + thigh * 0.4);
  seat.add(cushion);
  const backH = u * 2.0;
  const back = roundedBox(u * 1.3, backH, u * 0.16, u * 0.12, seatMat);
  back.position.set(0, seatTop + backH / 2 - u * 0.05, hipZ - u * 0.45);
  back.rotation.x = -0.12;
  seat.add(back);
  for (const sx of [-1, 1]) {
    const bolster = roundedBox(u * 0.16, backH * 0.75, u * 0.32, u * 0.07, seatMat);
    bolster.position.set(sx * u * 0.62, seatTop + backH * 0.35, hipZ - u * 0.32);
    bolster.rotation.x = -0.12;
    seat.add(bolster);
    const st = new THREE.Mesh(new THREE.BoxGeometry(u * 0.08, backH * 0.9, u * 0.02), stripe);
    st.position.set(sx * u * 0.22, seatTop + backH * 0.45, hipZ - u * 0.36);
    st.rotation.x = -0.12;
    seat.add(st);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(u * 0.9, seatTop - u * 0.14, u * 0.7), mat(0x2b2b30, { metalness: 0.5, roughness: 0.4 }));
  rail.position.set(0, (seatTop - u * 0.14) / 2, hipZ + thigh * 0.2);
  seat.add(rail);
  addProp(seat, CFG.view === 'full');

  const R = u * 0.58;
  const mount = new THREE.Group();
  mount.position.set(0, armL.shoulder.y - u * 0.36, armL.shoulder.z + u * 0.78);
  mount.rotation.x = 0.35;
  const spin = new THREE.Group();
  mount.add(spin);
  const rimMat = mat(0x3a3a42, { roughness: 0.65 }), metal = mat(0x8a8a92, { metalness: 0.6, roughness: 0.35 });
  spin.add(new THREE.Mesh(new THREE.TorusGeometry(R, u * 0.075, 14, 48), rimMat));
  for (const a of [0, Math.PI, -Math.PI / 2]) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(R, u * 0.09, u * 0.04), metal);
    sp.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0);
    sp.rotation.z = a;
    spin.add(sp);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(u * 0.2, u * 0.2, u * 0.08, 24), mat(0x2a2a30, { roughness: 0.5 }));
  hub.rotation.x = Math.PI / 2;
  spin.add(hub);
  const logo = new THREE.Mesh(new THREE.CylinderGeometry(u * 0.08, u * 0.08, u * 0.02, 20), stripe);
  logo.rotation.x = Math.PI / 2;
  logo.position.z = -u * 0.05;
  spin.add(logo);
  const marker = new THREE.Mesh(new THREE.BoxGeometry(u * 0.06, u * 0.16, u * 0.16), stripe);
  marker.position.y = R;
  spin.add(marker);
  const paddles = {};
  for (const [name, sx] of [['pl', 1], ['pr', -1]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(u * 0.06, u * 0.28, u * 0.03), mat(0x9a9aa2, { metalness: 0.6, roughness: 0.3, emissive: RED, emissiveIntensity: 0 }));
    p.position.set(sx * R * 0.62, R * 0.1, u * 0.09);
    spin.add(p);
    paddles[name] = p;
  }
  const base = roundedBox(u * 0.42, u * 0.3, u * 0.42, u * 0.1, mat(0x2b2b30, { roughness: 0.5 }));
  base.position.set(0, -u * 0.24, u * 0.3);
  mount.add(base);
  scene.add(mount);
  mount.updateMatrixWorld(true);
  const baseWorld = base.getWorldPosition(new THREE.Vector3());
  const standMat = mat(0x2b2b30, { metalness: 0.4, roughness: 0.5 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(u * 1.7, u * 0.08, u * 0.45), standMat);
  deck.position.set(0, baseWorld.y - u * 0.17, baseWorld.z + u * 0.05);
  addProp(deck, CFG.view === 'full');
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(u * 0.12, deck.position.y, u * 0.12), standMat);
    post.position.set(sx * u * 0.8, deck.position.y / 2, deck.position.z);
    addProp(post, CFG.view === 'full');
  }
  rig.props.push(mount);

  const shifter = new THREE.Group();
  shifter.position.set(armR.shoulder.x - u * 0.62, hipY + u * 0.05, armR.shoulder.z + u * 0.42);
  const box = roundedBox(u * 0.42, u * 0.42, u * 0.2, u * 0.06, mat(0x2b2b30, { roughness: 0.5 }));
  box.rotation.x = Math.PI / 2;
  shifter.add(box);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(u * 0.36, u * 0.01, u * 0.36), metal);
  plate.position.y = u * 0.1;
  shifter.add(plate);
  const lever = new THREE.Group();
  lever.position.y = u * 0.1;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(u * 0.025, u * 0.025, u * 0.42, 10), metal);
  rod.position.y = u * 0.21;
  lever.add(rod);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(u * 0.08, 16, 12), mat(0x1a1a1e, { roughness: 0.4 }));
  knob.position.y = u * 0.44;
  lever.add(knob);
  shifter.add(lever);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(u * 0.15, shifter.position.y - u * 0.1, u * 0.15), mat(0x2b2b30, { metalness: 0.4 }));
  stand.position.set(shifter.position.x, (shifter.position.y - u * 0.1) / 2, shifter.position.z);
  addProp(stand, CFG.view === 'full');
  addProp(shifter);

  const pedalY = hipY - shin * 1.05, pedalZ = hipZ + thigh + shin * 0.35;
  const plateMesh = new THREE.Mesh(new THREE.BoxGeometry(u * 0.9, u * 0.05, u * 0.75), mat(0x2b2b30, { metalness: 0.4, roughness: 0.5 }));
  plateMesh.position.set((legL.hip.x + legR.hip.x) / 2, pedalY - u * 0.3, pedalZ + u * 0.05);
  addProp(plateMesh, CFG.view === 'full');
  const pedals = {};
  const mkPedal = (x, key, tall) => {
    const g = new THREE.Group();
    g.position.set(x, pedalY - u * 0.27, pedalZ + u * 0.22);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(u * 0.035, u * 0.32, u * 0.035), metal);
    arm.position.y = u * 0.16;
    g.add(arm);
    const h = tall ? u * 0.26 : u * 0.18;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(u * 0.16, h, u * 0.03), mat(0xb4b4bc, { metalness: 0.7, roughness: 0.3 }));
    pad.position.set(0, u * 0.3, -u * 0.01);
    g.add(pad);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(u * 0.12, h * 0.75, u * 0.01), mat(0x222226, { roughness: 0.9 }));
    grip.position.set(0, u * 0.3, -u * 0.03);
    g.add(grip);
    g.rotation.x = -0.45;
    addProp(g, CFG.view === 'full');
    pedals[key] = { g, pad, rest: -0.45 };
  };
  const midX = (legL.hip.x + legR.hip.x) / 2, gap = u * 0.36;
  mkPedal(midX + gap, 'c');
  mkPedal(midX, 'b');
  mkPedal(midX - gap, 'g', true);

  rig.cockpit = { armL, armR, legL, legR, mount, spin, R, paddles, lever, knob, pedals, shiftUntil: 0, lastGear: 0, gx: 0, gz: 0, footX: 0, sh: 0, lean: 0, turn: 0 };
  rig.focusBottom = seatTop - u * 0.2;
}

function solveWheel(t, dt) {
  const c = rig.cockpit, d = state.drv, u = rig.unit, now = performance.now();
  const live = now - d.at < 3000 || state.drvOk;

  const ang = THREE.MathUtils.degToRad(d.a || 0);
  c.spin.rotation.z = damp(c.spin.rotation.z, ang, 30, dt);
  c.turn = damp(c.turn, THREE.MathUtils.clamp((d.a || 0) / 300, -1, 1), 8, dt);
  for (const k of ['pl', 'pr']) {
    c.paddles[k].material.emissiveIntensity = d[k] ? 0.9 : 0;
    c.paddles[k].rotation.x = d[k] ? -0.3 : 0;
  }

  c.lean = damp(c.lean, 0.06 + (d.b || 0) * 0.14 - (d.g || 0) * 0.05, 6, dt);
  rotateWorld(rig.bones.Spine_1, qAxis(AX, c.lean).multiply(qAxis(AZ, -c.turn * 0.09)));

  const yaw = live ? -c.turn * 0.45 : state.look.x * 0.9;
  const pitch = (live ? 0 : state.look.y * 0.5) - c.lean * 0.6 + Math.sin(t * 1.7) * 0.01 + face.talk * Math.sin(t * 14) * 0.035;
  rotateWorld(rig.bones.Head, qAxis(AY, yaw).multiply(qAxis(AX, pitch)).multiply(qAxis(AZ, c.turn * 0.12)));

  const handAng = THREE.MathUtils.clamp(c.spin.rotation.z, -1.9, 1.9);
  const grip = (sx) => {
    const a = sx > 0 ? 0.25 : Math.PI - 0.25;
    const local = V(Math.cos(a) * c.R, Math.sin(a) * c.R, -u * 0.06).applyAxisAngle(AZ, handAng);
    return c.mount.localToWorld(local);
  };

  const gear = d.gear || 0;
  if (gear !== c.lastGear) { c.lastGear = gear; c.shiftUntil = now + 650; }
  const gx = gear === 0 ? 0 : gear === -1 ? -1 : gear <= 2 ? 1 : gear <= 4 ? 0 : -1;
  const gz = gear === 0 ? 0 : gear === -1 ? -1 : gear % 2 === 1 ? 1 : -1;
  c.gx = damp(c.gx, gx, 25, dt);
  c.gz = damp(c.gz, gz, 25, dt);
  c.lever.rotation.set(c.gz * 0.38, 0, -c.gx * 0.32);
  c.sh = damp(c.sh, now < c.shiftUntil ? 1 : 0, now < c.shiftUntil ? 22 : 9, dt);

  solveIK(c.armL, grip(1));
  const knob = c.knob.getWorldPosition(new THREE.Vector3()).add(V(0, u * 0.08, -u * 0.02));
  solveIK(c.armR, grip(-1).lerp(knob, c.sh));

  const press = { g: d.g || 0, b: d.b || 0, c: d.c || 0 };
  for (const k of ['g', 'b', 'c']) c.pedals[k].g.rotation.x = c.pedals[k].rest + press[k] * 0.5;
  c.pedals.g.g.updateMatrixWorld(true); c.pedals.b.g.updateMatrixWorld(true); c.pedals.c.g.updateMatrixWorld(true);
  const padPos = k => c.pedals[k].pad.getWorldPosition(new THREE.Vector3()).add(V(0, u * 0.05, -u * 0.12));
  const onBrake = press.b > 0.03 && press.b >= press.g;
  c.footX = damp(c.footX, onBrake ? 1 : 0, 14, dt);
  solveIK(c.legR, padPos('g').lerp(padPos('b'), c.footX));
  solveIK(c.legL, padPos('c'));
}

function buildVR(left, right, reach) {
  const box = name => { let b = null; rig.root.traverse(o => { if (o.isMesh && (o.name === name || o.parent?.name === name)) b = new THREE.Box3().setFromObject(o); }); return b; };
  const faceBox = box('Faceline') || rig.modelBox;
  const hair = box('Hair') || faceBox;
  const faceH = faceBox.max.y - faceBox.min.y;
  const face = {
    width: faceBox.max.x - faceBox.min.x,
    height: faceH,
    eyeY: faceBox.min.y + faceH * 0.66,
    front: faceBox.max.z - faceH * 0.03,
    headHalfWidth: Math.max(hair.max.x, faceBox.max.x),
    headHalfDepth: (Math.max(hair.max.z, faceBox.max.z) - Math.min(hair.min.z, faceBox.min.z)) / 2,
    headCenterZ: (Math.max(hair.max.z, faceBox.max.z) + Math.min(hair.min.z, faceBox.min.z)) / 2,
  };
  const headset = makeHeadset(face);
  scene.add(headset);
  headset.updateMatrixWorld(true);
  rig.bones.Head.attach(headset);

  rig.vr = {
    left: right.shoulder.x > left.shoulder.x ? right : left,
    right: right.shoulder.x > left.shoulder.x ? left : right,
    ctrl: {},
    bodyYaw: null, ref: null, lean: V(), headQ: new THREE.Quaternion(),
    s: reach / 0.62,
  };
  rig.vr.left.pole = V(1, -1, -0.6).normalize();
  rig.vr.right.pole = V(-1, -1, -0.6).normalize();
  for (const side of ['left', 'right']) {
    const c = makeController(reach * 1.05, side === 'left');
    scene.add(c);

    rig.vr.ctrl[side] = c;
  }
}

const R_VR = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI);
const R_VR_INV = R_VR.clone().invert();
const yawOf = q => { const f = V(0, 0, -1).applyQuaternion(q); return Math.atan2(-f.x, -f.z); };
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const mirrorQ = q => new THREE.Quaternion(q.x, -q.y, -q.z, q.w);

function solveVR(t, dt) {
  const vr = rig.vr, d = state.vr, u = rig.unit;
  const live = d.h && performance.now() - d.at < 500;

  const shL = worldPos(vr.left.upper), shR = worldPos(vr.right.upper);
  const shoulderMid = shL.clone().add(shR).multiplyScalar(0.5);

  if (!live) {
    rotateWorld(rig.bones.Head, qAxis(AY, (state.look.x) * 0.9).multiply(qAxis(AX, state.look.y * 0.5)));
    const sway = Math.sin(t * 1.5) * u * 0.02;
    for (const [arm, side, sx] of [[vr.left, 'left', 1], [vr.right, 'right', -1]]) {
      const target = shoulderMid.clone().add(V(sx * u * 0.6, -u * 0.55 + sway * sx, u * 0.42));
      solveIK(arm, target);
      placeController(vr.ctrl[side], arm, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0)), 0);
    }
    return;
  }

  const hp = V(d.h[0], d.h[1], d.h[2]);
  let hq = new THREE.Quaternion(d.h[3], d.h[4], d.h[5], d.h[6]);

  const headYaw = yawOf(hq);
  if (vr.bodyYaw === null || state.vrRecenter) { vr.bodyYaw = headYaw; vr.ref = hp.clone(); state.vrRecenter = false; }
  let diff = wrapAngle(headYaw - vr.bodyYaw);
  const dead = 0.7;
  if (Math.abs(diff) > dead) vr.bodyYaw += diff - Math.sign(diff) * dead;
  vr.bodyYaw += wrapAngle(headYaw - vr.bodyYaw) * (1 - Math.exp(-0.25 * dt));
  const bodyInv = qAxis(AY, -vr.bodyYaw);
  vr.ref.lerp(hp, 1 - Math.exp(-0.4 * dt));

  const toMiiDir = v => { const o = v.clone().applyQuaternion(bodyInv); if (CFG.mirror) o.x = -o.x; return o.applyQuaternion(R_VR); };
  const toMiiRot = q => { let o = bodyInv.clone().multiply(q); if (CFG.mirror) o = mirrorQ(o); return o; };

  const off = toMiiDir(hp.clone().sub(vr.ref));
  vr.lean.x = damp(vr.lean.x, THREE.MathUtils.clamp(off.z * 1.6, -0.35, 0.35), 10, dt);
  vr.lean.z = damp(vr.lean.z, THREE.MathUtils.clamp(-off.x * 1.6, -0.35, 0.35), 10, dt);
  rotateWorld(rig.bones.Spine_1, qAxis(AX, vr.lean.x).multiply(qAxis(AZ, vr.lean.z)));

  const headLocal = R_VR.clone().multiply(toMiiRot(hq)).multiply(R_VR_INV);
  vr.headQ.slerp(headLocal, 1 - Math.exp(-25 * dt));
  rotateWorld(rig.bones.Head, vr.headQ.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(AX, -vr.lean.x * 0.6)));

  const userShoulders = hp.clone().add(V(0, -0.24, 0.09).applyQuaternion(qAxis(AY, vr.bodyYaw)));
  for (const side of ['left', 'right']) {
    const key = (side === 'left') !== CFG.mirror ? 'l' : 'r';
    const arm = vr[side], c = d[key];
    if (!c) { solveIK(arm, shoulderMid.clone().add(V(side === 'left' ? u * 0.35 : -u * 0.35, -u * 0.62, u * 0.3))); continue; }
    const cp = V(c[0], c[1], c[2]);
    const target = shoulderMid.clone().addScaledVector(toMiiDir(cp.sub(userShoulders)), vr.s);
    solveIK(arm, target);
    const cq = R_VR.clone().multiply(toMiiRot(new THREE.Quaternion(c[3], c[4], c[5], c[6])));
    placeController(vr.ctrl[side], arm, cq, d['t' + key] || 0);
  }
}

function placeController(ctrl, arm, q, trigger) {
  const wrist = worldPos(arm.end);
  const fore = wrist.clone().sub(worldPos(arm.lower)).normalize();
  ctrl.position.copy(wrist).addScaledVector(fore, rig.unit * 0.05);
  ctrl.quaternion.slerp(q, 0.6);
  const tr = ctrl.userData.trigger;
  tr.material.emissiveIntensity = trigger * 0.9;
  tr.rotation.x = 0.9 - trigger * 0.35;
}

function keyWorld(key) {
  const kb = rig.keyboard;
  return key.mesh.getWorldPosition(new THREE.Vector3()).add(V(0, kb.userData.u * 0.3, 0));
}
function keyAt(x, row) {
  const kb = rig.keyboard, u = kb.userData.u;
  const local = V((PHYSICAL ? 7.5 - x : x - 7.5) * u, u * 0.9, (row - 2.5) * -u);
  return kb.localToWorld(local);
}

async function setupFace() {
  let cfg = null;
  if (CFG.face) {
    try {
      const r = await fetch('./api/faces', { cache: 'no-cache' });
      if (r.ok) cfg = (await r.json()).find(f => f.name === CFG.face) || null;
    } catch { }
    if (!cfg) console.warn('Visage introuvable :', CFG.face);
  }
  const matName = cfg?.material || 'Mask';

  let target = null;
  rig.root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m?.name === matName) target = m;
  });
  if (!target) rig.root.traverse(o => {
    if (!o.isMesh || target) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (/mask|face|visage/i.test(m?.name || '') && m.map) target = m;
  });
  if (!target?.map) { console.warn('Matériau du visage introuvable :', matName); return; }

  const orig = target.map;
  face.orig = orig;
  face.baseImg = orig.image;
  face.split = cfg?.split ?? 0.586;
  face.blink = cfg?.blink ? await loadFaceImage(cfg.blink).catch(() => null) : null;
  face.mouths = [null, ...(await Promise.all((cfg?.mouths || []).map(src => loadFaceImage(src).catch(() => null)))).filter(Boolean)];
  face.levels = face.mouths.length;
  face.cache = new Map();
  face.key = '';
  face.mat = target;
  face.ready = true;
}

function loadFaceImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('image introuvable : ' + src));
    i.src = src;
  });
}

function faceTexture(key, eyes, mouth) {
  if (!eyes && !mouth) return face.orig;
  let t = face.cache.get(key);
  if (t) { face.cache.delete(key); face.cache.set(key, t); return t; }
  while (face.cache.size >= 12) {
    const [oldKey, old] = face.cache.entries().next().value;
    face.cache.delete(oldKey);
    if (old !== face.mat?.map) old.dispose();
  }
  const orig = face.orig, baseImg = face.baseImg;
  const W = baseImg.width, H = baseImg.height, split = Math.round(face.split * H);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.save(); g.beginPath(); g.rect(0, 0, W, split); g.clip(); g.drawImage(eyes || baseImg, 0, 0, W, H); g.restore();
  g.save(); g.beginPath(); g.rect(0, split, W, H - split); g.clip(); g.drawImage(mouth || baseImg, 0, 0, W, H); g.restore();
  t = new THREE.CanvasTexture(c);
  for (const k of ['flipY', 'colorSpace', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'channel']) t[k] = orig[k];
  t.offset.copy(orig.offset); t.repeat.copy(orig.repeat); t.center.copy(orig.center); t.rotation = orig.rotation;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.needsUpdate = true;
  face.cache.set(key, t);
  return t;
}

function updateFace(t, dt) {
  if (!face.ready) return;
  if (performance.now() - state.micAt > 250) state.mic = 0;
  face.talk = damp(face.talk, state.mic, state.mic > face.talk ? 30 : 12, dt);

  let mouth = 0;
  if (face.levels > 1 && face.talk > 0.06) {
    mouth = 1 + Math.floor(((face.talk - 0.06) / 0.94) * (face.levels - 1) * 0.999);
    mouth = Math.min(face.levels - 1, mouth);
  }

  if (CFG.blink) {
    if (t > face.nextBlink) {
      face.blinkUntil = t + 0.11;
      face.nextBlink = t + 2.2 + Math.random() * 4;
      if (Math.random() < 0.18) face.doubleAt = t + 0.24;
    }
    if (face.doubleAt && t > face.doubleAt) { face.blinkUntil = t + 0.1; face.doubleAt = 0; }
  }
  const blinking = t < face.blinkUntil && face.blink;

  let ex = null, mx = null;
  const consider = e => { if (!e?.img) return; if (e.zone !== 'bouche') ex = e; if (e.zone !== 'yeux') mx = e; };
  for (const id of char.order) if (charOn(id)) consider(char.expr.get(id));
  if (char.preview) consider(char.expr.get(char.preview));
  const talking = mouth > 0 && !(mx && mx.parler === false);
  const eyesImg = ex ? ex.img : blinking ? face.blink : null;
  const mouthImg = talking ? face.mouths[mouth] : mx ? mx.img : null;
  const key = (ex ? 'x' + ex.key : blinking ? 'b' : '0') + '|' + (talking ? 'm' + mouth : mx ? 'x' + mx.key : '0');
  if (key !== face.key) {
    face.key = key;
    face.mat.map = faceTexture(key, eyesImg, mouthImg);
  }
}

const char = { items: [], on: new Set(), order: [], expr: new Map(), objs: new Map(), rev: Date.now(), preview: null, seq: 0, showAll: false };
const charOn = id => char.showAll || char.on.has(id) || char.preview === id;
const charLoader = new GLTFLoader();
const charGlb = new Map();

async function loadCharacter() {
  const seq = ++char.seq;
  let res;
  try { res = await fetch('./api/personnage', { cache: 'no-store' }).then(r => r.json()); } catch { return; }
  if (seq !== char.seq || !rig.root) return;
  setCharacterOn(res.on || []);
  applyCharacter(res.data || { items: [] });
}

function setCharacterOn(ids) {
  const next = new Set(ids);
  char.order = [...char.order.filter(id => next.has(id)), ...ids.filter(id => !char.order.includes(id))];
  char.on = next;
}

function applyCharacter(data) {
  const items = (Array.isArray(data?.items) ? data.items : []).filter(it => it && it.id && (!it.mii || it.mii === CFG.model));
  char.items = items;
  const byId = new Map(items.map(i => [i.id, i]));
  for (const id of [...char.expr.keys()]) if (byId.get(id)?.type !== 'expression') char.expr.delete(id);
  for (const it of items.filter(i => i.type === 'expression')) {
    const zone = ['yeux', 'bouche'].includes(it.zone) ? it.zone : 'tout';
    let e = char.expr.get(it.id);
    const src = it.image ? './personnage/Expressions/' + encodeURIComponent(it.image) + '?v=' + char.rev : '';
    if (!e || e.src !== src) {
      e = { id: it.id, src, img: null, key: it.id + '@' + Math.random().toString(36).slice(2, 7) };
      char.expr.set(it.id, e);
      if (src) loadFaceImage(src).then(img => { if (char.expr.get(it.id) === e) { e.img = img; face.key = ''; } }).catch(() => console.warn('Expression introuvable :', it.image));
    }
    e.zone = zone; e.parler = it.parler !== false;
  }
  face.key = '';
  for (const [id, o] of char.objs) {
    const it = byId.get(id);
    if (!it || it.type !== 'objet' || objectSig(it) !== o.sig) { scene.remove(o.group); disposeObject(o.group); char.objs.delete(id); }
  }
  for (const it of items.filter(i => i.type === 'objet')) {
    let o = char.objs.get(it.id);
    if (!o) { o = buildCharObject(it); char.objs.set(it.id, o); }
    o.item = it;
    const [rx, ry, rz] = (it.rot || [0, 0, 0]).map(v => THREE.MathUtils.degToRad(+v || 0));
    o.rotQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  }
}

const objectSig = it => [it.modele || '', it.couleur || '', it.texture || ''].join('|');

function buildCharObject(it) {
  const group = new THREE.Group();
  group.visible = false;
  group.userData.charId = it.id;
  scene.add(group);
  const o = { group, sig: objectSig(it), item: it, rotQ: new THREE.Quaternion() };
  const m = it.modele || 'forme:cube';
  if (m.startsWith('forme:')) {
    let type = m.slice(6);
    if (!SHAPES[type] || ['glb', 'screen', 'panel', 'wall', 'plate'].includes(type)) type = 'cube';
    const shape = makeObject({ id: it.id, type, size: [1, 1, 1], tex: it.texture || 'uni', color: it.couleur || '#ffffff' }, 1);
    shape.position.y = -0.5;
    group.add(shape);
  } else {
    if (!charGlb.has(m)) charGlb.set(m, charLoader.loadAsync('./personnage/Accessoires/' + encodeURIComponent(m)));
    charGlb.get(m).then(gltf => {
      if (!group.parent) return;
      const model = gltf.scene.clone(true);
      const bb = new THREE.Box3().setFromObject(model), s = bb.getSize(V());
      const k = 1 / Math.max(s.x, s.y, s.z, 1e-6);
      model.scale.setScalar(k);
      model.position.copy(bb.getCenter(V()).multiplyScalar(-k));
      model.traverse(n => { if (n.isMesh) n.frustumCulled = false; });
      group.add(model);
    }).catch(e => {
      console.warn('Accessoire introuvable :', m, e);
      charGlb.delete(m);
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff4040, wireframe: true })));
    });
  }
  return o;
}

const _aq = new THREE.Quaternion(), _ap = new THREE.Vector3(), _ao = new THREE.Vector3();
function updateAttachments() {
  if (!char.objs.size || !rig.anchors) return;
  if (rig.minis) { for (const o of char.objs.values()) o.group.visible = false; return; }
  let any = false;
  for (const o of char.objs.values()) { o.group.visible = charOn(o.item.id); any ||= o.group.visible; }
  if (!any) return;
  rig.root.updateMatrixWorld(true);
  const H = rig.sceneUnit || rig.modelBox?.getSize(V()).y || 1;
  for (const o of char.objs.values()) {
    if (!o.group.visible) continue;
    const it = o.item, a = rig.anchors[it.point] || rig.anchors.tete;
    if (!a) { o.group.visible = false; continue; }
    a.bone.getWorldQuaternion(_aq).multiply(a.restInv);
    _ap.copy(a.local); a.bone.localToWorld(_ap);
    const p = it.pos || [0, 0, 0];
    _ao.set(+p[0] || 0, +p[1] || 0, +p[2] || 0).multiplyScalar(H).applyQuaternion(_aq);
    o.group.position.copy(_ap).add(_ao);
    o.group.quaternion.copy(_aq).multiply(o.rotQ);
    o.group.scale.setScalar(H * Math.max(0.005, +it.taille || 0.15));
  }
}

const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
const DECOR_VIEWS = { back: { az: 145, el: 38 }, back2: { az: -145, el: 38 }, front: { az: 40, el: 30 }, tri: { az: 123, el: 22, close: true }, tri2: { az: -123, el: 22, close: true } };
let viewCam = camera;
rig.decor = [];
rig.screens = [];

function buildDecor(left, right, reach) {
  const u = reach;
  const scene0 = rig.modelBox.clone();
  for (const p of rig.props) scene0.expandByObject(p);

  if (CINEMA) {
    buildCinemaScreen(u, Math.max(scene0.max.z + u * 2.2, left.shoulder.z + u * 5.5));
    if (rig.cinema) buildCinemaSeat(u);
  } else {
    if (CFG.decos.has('screens')) buildScreens(u, Math.max(scene0.max.z + u * 1.4, left.shoulder.z + u * 3.0));
    if (rig.seated) buildChair(u, left.shoulder.y);
  }

  const all = scene0.clone();
  for (const d of rig.decor) all.expandByObject(d);
  const pad = u * 0.9;
  const w = all.max.x - all.min.x + pad * 2, d = all.max.z - all.min.z + pad * 2, th = u * 0.25;
  const { top, side, rug: hasRug } = makeFloorMaterials(CFG.floor, w, d);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, th, d), [side, side, top, side, side, side]);
  floor.position.set((all.min.x + all.max.x) / 2, -th / 2 - 0.001, (all.min.z + all.max.z) / 2);
  floor.userData.floor = true;
  scene.add(floor);
  rig.decor.push(floor);
  if (hasRug) {
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(u * 1.6, u * 1.6, 0.004, 40), mat(0xc85a5a, { roughness: 1 }));
    rug.position.set(0, 0.002, left.shoulder.z + u * 0.3);
    rug.userData.floor = true;
    rig.decor.push(rug);
    scene.add(rug);
  }

  const az = THREE.MathUtils.degToRad(DECOR_VIEWS[CFG.decorView].az);
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(Math.sin(az) * 2, 2.2, Math.cos(az) * 2);
  scene.add(sun);
  rig.sun = sun;
  if (!CFG.editor && !CFG.perso) viewCam = orthoCam;
}

function floorTexture(size, draw, tileWorld, w, d) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w / tileWorld, d / tileWorld);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function makeFloorMaterials(style, w, d) {
  const rnd = seeded(42);
  switch (style) {
    case 'wood': {
      const map = floorTexture(512, (g, S) => {
        const rows = 6, rh = S / rows;
        for (let r = 0; r < rows; r++) {
          const offset = (r % 2) * S * 0.45 + rnd() * S * 0.2;
          for (let k = -1; k < 3; k++) {
            const x0 = (offset + k * S * 0.62) % S;
            const tone = 0.82 + rnd() * 0.3;
            g.fillStyle = `rgb(${Math.round(176 * tone)},${Math.round(116 * tone)},${Math.round(64 * tone)})`;
            g.fillRect(x0, r * rh, S * 0.62, rh);
            g.fillRect(x0 - S, r * rh, S * 0.62, rh);
            g.strokeStyle = 'rgba(70,40,15,0.18)'; g.lineWidth = 1.2;
            for (let v = 0; v < 5; v++) {
              const y = r * rh + rh * (0.15 + v * 0.17) + rnd() * 3;
              g.beginPath(); g.moveTo(x0, y);
              g.bezierCurveTo(x0 + S * 0.2, y + rnd() * 6 - 3, x0 + S * 0.4, y + rnd() * 6 - 3, x0 + S * 0.62, y);
              g.stroke();
            }
            g.fillStyle = 'rgba(40,22,8,0.55)'; g.fillRect(x0, r * rh, 2, rh);
          }
          g.fillStyle = 'rgba(40,22,8,0.6)'; g.fillRect(0, r * rh, S, 2);
        }
      }, 0.9, w, d);
      return { top: mat(0xffffff, { map, roughness: 0.55 }), side: mat(0x6b4426, { roughness: 0.7 }), rug: true };
    }
    case 'tiles': {
      const map = floorTexture(256, (g, S) => {
        const n = 4, s = S / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          g.fillStyle = (i + j) % 2 ? '#1d1d22' : '#f1efe9';
          g.fillRect(i * s, j * s, s, s);
          g.fillStyle = (i + j) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
          g.fillRect(i * s + s * 0.1, j * s + s * 0.1, s * 0.35, s * 0.35);
        }
        g.strokeStyle = '#8f8a80'; g.lineWidth = 2;
        for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, S); g.moveTo(0, i * s); g.lineTo(S, i * s); g.stroke(); }
      }, 0.5, w, d);
      return { top: mat(0xffffff, { map, roughness: 0.25, metalness: 0.05 }), side: mat(0x3a3a40, { roughness: 0.5 }), rug: true };
    }
    case 'carpet': {
      const c = document.createElement('canvas');
      c.width = c.height = 1024;
      const g = c.getContext('2d');
      g.fillStyle = '#1d2a55'; g.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 9000; i++) {
        const v = rnd();
        g.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
        g.fillRect(rnd() * 1024, rnd() * 1024, 2, 2);
      }
      g.strokeStyle = 'rgba(214,180,90,0.35)'; g.lineWidth = 3;
      for (let x = -1024; x < 2048; x += 128) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 1024, 1024); g.stroke();
        g.beginPath(); g.moveTo(x + 1024, 0); g.lineTo(x, 1024); g.stroke();
      }
      g.strokeStyle = '#c9a13a'; g.lineWidth = 22; g.strokeRect(40, 40, 944, 944);
      g.strokeStyle = '#8e1424'; g.lineWidth = 10; g.strokeRect(70, 70, 884, 884);
      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return { top: mat(0xffffff, { map, roughness: 1 }), side: mat(0x141d3d, { roughness: 1 }), rug: false };
    }
    case 'grass': {
      const map = floorTexture(512, (g, S) => {
        g.fillStyle = '#4f8f3a'; g.fillRect(0, 0, S, S);
        for (let i = 0; i < 260; i++) {
          g.fillStyle = rnd() > 0.5 ? 'rgba(120,180,80,0.18)' : 'rgba(30,70,20,0.18)';
          g.beginPath(); g.arc(rnd() * S, rnd() * S, 6 + rnd() * 26, 0, Math.PI * 2); g.fill();
        }
        g.lineWidth = 1.4;
        for (let i = 0; i < 4500; i++) {
          const x = rnd() * S, y = rnd() * S, h = 4 + rnd() * 7, lean = (rnd() - 0.5) * 4;
          const tone = 90 + rnd() * 90;
          g.strokeStyle = `rgb(${Math.round(tone * 0.45)},${Math.round(tone)},${Math.round(tone * 0.35)})`;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + lean, y - h); g.stroke();
        }
      }, 0.7, w, d);
      return { top: mat(0xffffff, { map, roughness: 1 }), side: mat(0x5a3f26, { roughness: 1 }), rug: false };
    }
    default:
      return { top: mat(0xeadfcd, { roughness: 0.85 }), side: mat(0xb89f80, { roughness: 0.85 }), rug: true };
  }
}

function drawScreenOff(g, w, h) {
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#15161b'); grad.addColorStop(1, '#07070a');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  g.beginPath(); g.moveTo(w * 0.18, 0); g.lineTo(w * 0.42, 0); g.lineTo(w * 0.12, h); g.lineTo(0, h); g.lineTo(0, h * 0.6); g.closePath(); g.fill();
}

function buildCinemaScreen(u, zFront) {
  const sw = u * 6.2, sh = sw * 9 / 16, border = u * 0.15;
  const centerY = rig.modelBox.max.y * 0.85 + sh * 0.1;
  const c = document.createElement('canvas');
  c.width = 854; c.height = 480;
  const g = c.getContext('2d');
  if (CFG.screenLive) {
    g.fillStyle = '#0d0d10'; g.fillRect(0, 0, 854, 480);
    g.fillStyle = '#c9a13a'; g.font = 'bold 64px "Segoe UI", sans-serif'; g.textAlign = 'center';
    g.fillText('🎬  Cinéma', 427, 260);
  } else drawScreenOff(g, 854, 480);
  const tex = new THREE.Texture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  screenTex[0] = tex;

  const grp = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(sw + border * 2, sh + border * 2, u * 0.12), mat(0x0b0b0e, { roughness: 0.9 }));
  frame.position.z = -u * 0.07;
  grp.add(frame);
  const display = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  (screenMats[0] ||= new Set()).add(display.material);
  grp.add(display);
  const velvet = mat(0x8e1424, { roughness: 0.95 }), gold = mat(0xc9a13a, { metalness: 0.4, roughness: 0.4 });
  const curtainH = centerY + sh / 2 + border * 2;
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const fold = new THREE.Mesh(new THREE.CylinderGeometry(u * 0.16, u * 0.16, curtainH, 10), velvet);
      fold.position.set(sx * (sw / 2 + border + u * 0.15 + k * u * 0.26), -centerY + curtainH / 2, u * 0.15);
      grp.add(fold);
    }
  }
  const valance = new THREE.Mesh(new THREE.BoxGeometry(sw + border * 2 + u * 2.6, u * 0.55, u * 0.3), velvet);
  valance.position.set(0, sh / 2 + border + u * 0.3, u * 0.2);
  grp.add(valance);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(sw + border * 2 + u * 2.6, u * 0.07, u * 0.32), gold);
  trim.position.set(0, sh / 2 + border + u * 0.03, u * 0.2);
  grp.add(trim);

  grp.position.set(0, centerY, zFront);
  grp.rotation.y = Math.PI;
  grp.userData.screen = true;
  scene.add(grp);
  rig.decor.push(grp);
  rig.screens[0] = { display, w: sw, h: sh };
}

function buildCinemaSeat(u) {
  const [la, lb] = rig.seatLegs;
  const hip = worldPos(la.upper).add(worldPos(lb.upper)).multiplyScalar(0.5);
  const velvet = mat(0xa31c2c, { roughness: 0.95 }), dark = mat(0x2a1a1d, { roughness: 0.7 });
  const g = new THREE.Group();
  const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
  const W = u * 1.8;

  const seatTop = hip.y - u * 0.1;
  add(new THREE.BoxGeometry(W, u * 0.3, u * 1.3), velvet, 0, seatTop - u * 0.15, hip.z + u * 0.1);
  add(new THREE.BoxGeometry(W * 1.05, seatTop - u * 0.3, u * 1.2), dark, 0, (seatTop - u * 0.3) / 2, hip.z + u * 0.05);

  const up = V(0, Math.cos(RECLINE), -Math.sin(RECLINE)), fwd = V(0, Math.sin(RECLINE), Math.cos(RECLINE));
  const backLen = u * 2.2;
  const backC = hip.clone().addScaledVector(up, backLen / 2 - u * 0.1).addScaledVector(fwd, -u * 0.48);
  add(new THREE.BoxGeometry(W, backLen, u * 0.32), velvet, 0, backC.y, backC.z, -RECLINE);
  const pillow = hip.clone().addScaledVector(up, backLen + u * 0.4).addScaledVector(fwd, -u * 0.62);
  const p = add(new THREE.CylinderGeometry(u * 0.3, u * 0.3, W * 0.8, 20), velvet, 0, pillow.y, pillow.z);
  p.rotation.z = Math.PI / 2;

  const legLen = la.lenA + la.lenB;
  add(new THREE.BoxGeometry(W * 0.95, u * 0.22, legLen * 0.75), velvet, 0, hip.y - u * 0.32, hip.z + legLen * 0.62);
  add(new THREE.BoxGeometry(W * 0.5, u * 0.06, legLen * 0.5), dark, 0, hip.y - u * 0.5, hip.z + legLen * 0.35);

  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(u * 0.25, u * 0.55, u * 1.3), velvet, sx * (W / 2 + u * 0.125), seatTop + u * 0.05, hip.z + u * 0.05);
  }
  const cupX = W / 2 + u * 0.125, cupZ = hip.z + u * 0.55, cupY = seatTop + u * 0.32;
  const sc = document.createElement('canvas');
  sc.width = 64; sc.height = 8;
  const sg = sc.getContext('2d');
  for (let i = 0; i < 8; i++) { sg.fillStyle = i % 2 ? '#ffffff' : '#d42b2b'; sg.fillRect(i * 8, 0, 8, 8); }
  const stripes = new THREE.CanvasTexture(sc);
  stripes.colorSpace = THREE.SRGBColorSpace;
  const bucket = add(new THREE.CylinderGeometry(u * 0.17, u * 0.12, u * 0.36, 16, 1, true), mat(0xffffff, { map: stripes, side: THREE.DoubleSide }), cupX, cupY + u * 0.18, cupZ);
  bucket.renderOrder = 1;
  const corn = mat(0xffe9a8, { roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, r = u * (0.03 + (i % 3) * 0.04);
    add(new THREE.SphereGeometry(u * 0.06, 8, 6), corn, cupX + Math.cos(a) * r, cupY + u * 0.38 + (i % 2) * u * 0.04, cupZ + Math.sin(a) * r);
  }

  scene.add(g);
  rig.decor.push(g);
  rig.seat = g;
}

function buildChair(u, shoulderY) {
  const [la, lb] = rig.seatLegs;
  const hipA = worldPos(la.upper), hipB = worldPos(lb.upper);
  const hipY = (hipA.y + hipB.y) / 2, hipZ = (hipA.z + hipB.z) / 2;

  const c = document.createElement('canvas');
  c.width = 8; c.height = 64;
  const cg = c.getContext('2d');
  cg.fillStyle = '#3a3a40'; cg.fillRect(0, 0, 8, 64);
  cg.fillStyle = '#1c1c20';
  for (let y = 0; y < 64; y += 4) cg.fillRect(0, y, 8, 2);
  const meshTex = new THREE.CanvasTexture(c);
  meshTex.colorSpace = THREE.SRGBColorSpace;
  meshTex.wrapS = meshTex.wrapT = THREE.RepeatWrapping;
  meshTex.repeat.set(1, 0.9);
  const meshMat = mat(0xffffff, { map: meshTex, roughness: 0.95 });
  const black = mat(0x1d1d21, { roughness: 0.55 });
  const seatMat = mat(0x34343a, { roughness: 0.95 });
  const chrome = mat(0xdadce2, { metalness: 0.95, roughness: 0.15 });

  const g = new THREE.Group();
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };

  const W = u * 1.6, D = u * 1.35, T = u * 0.2;
  const seatTop = hipY - u * 0.1;
  const seat = roundedBox(W, D, T, u * 0.14, seatMat);
  seat.rotation.x = Math.PI / 2;
  seat.position.set(0, seatTop - T / 2, hipZ + D * 0.3);
  g.add(seat);
  const cz = hipZ + D * 0.25;

  const mechY = seatTop - T - u * 0.07;
  add(new THREE.BoxGeometry(u * 0.55, u * 0.14, u * 0.6), black, 0, mechY, cz);
  const lever = add(new THREE.BoxGeometry(u * 0.5, u * 0.03, u * 0.05), black, -u * 0.45, mechY - u * 0.03, cz + u * 0.15);
  lever.rotation.y = 0.3;
  const baseY = u * 0.17, liftTop = mechY - u * 0.07;
  add(new THREE.CylinderGeometry(u * 0.11, u * 0.11, (liftTop - baseY) * 0.45, 16), black, 0, liftTop - (liftTop - baseY) * 0.22, cz);
  add(new THREE.CylinderGeometry(u * 0.07, u * 0.07, liftTop - baseY, 16), chrome, 0, (liftTop + baseY) / 2, cz);
  add(new THREE.CylinderGeometry(u * 0.13, u * 0.15, u * 0.1, 20), chrome, 0, baseY, cz);
  const legLen = u * 1.15;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    const arm = add(new THREE.BoxGeometry(u * 0.1, u * 0.06, legLen), chrome, Math.cos(a) * legLen / 2, baseY - u * 0.02, cz + Math.sin(a) * legLen / 2);
    arm.rotation.y = Math.PI / 2 - a;
    const ex = Math.cos(a) * legLen, ez = cz + Math.sin(a) * legLen;
    add(new THREE.CylinderGeometry(u * 0.03, u * 0.03, u * 0.06, 8), black, ex, baseY - u * 0.06, ez);
    const wheel = add(new THREE.CylinderGeometry(u * 0.06, u * 0.06, u * 0.07, 16), black, ex, u * 0.06, ez);
    wheel.rotation.z = Math.PI / 2;
    wheel.rotation.y = Math.PI / 2 - a;
  }

  const backBottom = seatTop + u * 0.12, backTop = shoulderY + u * 0.12;
  const backH = backTop - backBottom, backZ = hipZ - u * 0.62;
  const back = roundedBox(W * 0.92, backH, u * 0.07, u * 0.1, meshMat);
  back.position.set(0, backBottom + backH / 2, backZ);
  back.rotation.x = -0.1;
  g.add(back);
  for (const sx of [-1, 1]) {
    const rail = add(new THREE.BoxGeometry(u * 0.05, backH, u * 0.08), black, sx * W * 0.46, backBottom + backH / 2, backZ);
    rail.rotation.x = -0.1;
  }
  add(new THREE.BoxGeometry(u * 0.3, u * 0.08, u * 0.5), black, 0, seatTop - T - u * 0.02, backZ + u * 0.3);
  add(new THREE.BoxGeometry(u * 0.3, backBottom - (seatTop - T), u * 0.08), black, 0, (backBottom + seatTop - T) / 2, backZ);

  const headBack = rig.modelBox.min.z - u * 0.12;
  const headY = backTop + u * 0.65;
  for (const sx of [-1, 1]) {
    const from = V(sx * u * 0.22, backTop - u * 0.05, backZ - u * 0.06), to = V(sx * u * 0.22, headY - u * 0.15, headBack + u * 0.02);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(u * 0.025, u * 0.025, from.distanceTo(to), 8), chrome);
    rod.position.copy(from).add(to).multiplyScalar(0.5);
    rod.quaternion.setFromUnitVectors(V(0, 1, 0), to.clone().sub(from).normalize());
    g.add(rod);
  }
  const headrest = roundedBox(W * 0.62, u * 0.42, u * 0.08, u * 0.1, meshMat);
  headrest.position.set(0, headY, headBack);
  g.add(headrest);

  const armY = seatTop + u * 0.62;
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + u * 0.08);
    const pad = roundedBox(u * 0.2, u * 0.08, u * 0.85, u * 0.04, black);
    pad.rotation.x = Math.PI / 2;
    pad.position.set(x, armY, hipZ + u * 0.18);
    pad.rotation.set(0, 0, 0);
    g.add(pad);
    add(new THREE.BoxGeometry(u * 0.09, armY - (seatTop - T / 2), u * 0.12), black, x, (armY + seatTop - T / 2) / 2 - u * 0.04, hipZ + u * 0.05);
    add(new THREE.BoxGeometry(Math.abs(x) - W * 0.35, u * 0.06, u * 0.12), black, sx * (Math.abs(x) + W * 0.35) / 2, seatTop - T - u * 0.02, hipZ + u * 0.05);
  }

  scene.add(g);
  rig.decor.push(g);
  rig.seat = g;
}

const screenTex = [], screenBusy = [];
function buildScreens(u, zFront) {
  const sw = u * 2.7, sh = sw * 9 / 16, bezel = u * 0.06, depth = u * 0.1;
  const centerY = rig.modelBox.max.y * 0.62;
  const standMat = mat(0x2a2a30, { roughness: 0.4, metalness: 0.4 });
  rig.baseScreens = [];
  const lay = screenLayout;
  const secondSide = lay.length > 1 && lay[1].x < lay[0].x ? 1 : -1;
  [0, 1].forEach(i => {
    const grp = new THREE.Group();
    const frameMat = mat(0x1b1b20, { roughness: 0.4 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(sw + bezel * 2, sh + bezel * 2, depth), frameMat);
    frame.position.z = -depth / 2 - 0.001;
    grp.add(frame);
    const display = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), screenMaterial(i + 1));
    display.userData.source = i + 1;
    grp.add(display);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(u * 0.05, u * 0.05, centerY, 12), standMat);
    pole.position.set(0, -centerY / 2, -depth - u * 0.06);
    grp.add(pole);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(u * 0.45, u * 0.5, u * 0.06, 24), standMat);
    foot.position.set(0, -centerY + u * 0.03, -depth - u * 0.06);
    grp.add(foot);

    if (i === 0) {
      grp.position.set(0, centerY, zFront);
      grp.rotation.y = Math.PI;
    } else {
      const angle = 0.45, gap = bezel * 2.5;
      const edge = secondSide * (sw / 2 + bezel + gap);
      grp.position.set(edge + secondSide * (sw / 2 + bezel) * Math.cos(angle), centerY, zFront - Math.sin(angle) * (sw / 2 + bezel));
      grp.rotation.y = Math.PI + secondSide * angle;
    }
    grp.userData.screen = true;
    scene.add(grp);
    rig.decor.push(grp);
    rig.baseScreens[i] = { grp, display, frameMat, w: sw, h: sh, defPos: grp.position.clone(), defRot: grp.rotation.clone() };
  });
  applyBaseScreens(rig.sceneData?.base?.screens);
}

function applyBaseScreens(list) {
  const us = rig.sceneUnit ||= rig.modelBox.getSize(V()).y || 1;
  (rig.baseScreens || []).forEach((S, i) => {
    const e = list?.[i] || {};
    S.grp.visible = !e.hidden;
    if (e.pos) S.grp.position.set(e.pos[0] * us, e.pos[1] * us, e.pos[2] * us); else S.grp.position.copy(S.defPos);
    if (e.rot) S.grp.rotation.set(...e.rot.map(THREE.MathUtils.degToRad), 'YXZ'); else S.grp.rotation.copy(S.defRot);
    S.grp.scale.setScalar(e.size || 1);
    S.frameMat.color.set(e.color || '#1b1b20');
    const src = e.source ?? i + 1;
    if (S.display.userData.source !== src) {
      S.display.material.dispose();
      S.display.material = screenMaterial(src);
      S.display.userData.source = src;
    }
    S.scale = e.size || 1;
  });
  refreshScreenTargets();
}

function applyBase(base) {
  applyTable(base?.table);
  applyBaseScreens(base?.screens);
  applyMiiOffset(base?.mii);
}

function applyMiiOffset(m) {
  if (!rig.root || !rig.modelBox) return;
  const us = rig.sceneUnit ||= rig.modelBox.getSize(V()).y || 1;
  const p = m?.pos || [0, 0, 0];
  const target = V((+p[0] || 0) * us, 0, (+p[2] || 0) * us);
  const delta = target.clone().sub(rig.miiShift || V());
  if (delta.lengthSq() < 1e-12) return;
  rig.miiShift = target;
  rig.root.position.add(delta);
  rig.bodyBase.add(delta);
  rig.modelBox.translate(delta);
  if (rig.seat) rig.seat.position.add(delta);
  rig.root.updateMatrixWorld(true);
}

function refreshScreenTargets() {
  if (rig.cinema) return;
  rig.screens = [];
  for (const S of rig.baseScreens || []) {
    const src = S.display.userData.source;
    if (S.grp.visible && typeof src === 'number' && !rig.screens[src - 1]) rig.screens[src - 1] = { display: S.display, w: S.w * S.scale, h: S.h * S.scale };
  }
  for (const [src, list] of userScreens) {
    const alive = list.filter(x => { let p = x.display; while (p && p !== scene) p = p.parent; return !!p; });
    userScreens.set(src, alive);
    const d = alive.find(x => x.display.parent?.visible !== false);
    if (d && !rig.screens[src - 1]) rig.screens[src - 1] = d;
  }
}

const screenMats = [];
const userScreens = new Map();
let offTex = null;
function offTexture() {
  if (offTex) return offTex;
  const c = document.createElement('canvas'); c.width = 640; c.height = 360;
  drawScreenOff(c.getContext('2d'), 640, 360);
  offTex = new THREE.CanvasTexture(c); offTex.colorSpace = THREE.SRGBColorSpace;
  return offTex;
}
function screenTexture(i) {
  if (screenTex[i]) return screenTex[i];
  const c = document.createElement('canvas'); c.width = 640; c.height = 360;
  const g = c.getContext('2d');
  g.fillStyle = '#111318'; g.fillRect(0, 0, 640, 360);
  g.fillStyle = '#6b7280'; g.font = 'bold 44px "Segoe UI", sans-serif'; g.textAlign = 'center';
  g.fillText(`Écran ${i + 1}`, 320, 190);
  const tex = new THREE.Texture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return screenTex[i] = tex;
}
function screenMaterial(src) {
  if (typeof src === 'string' && src.startsWith('img:')) return new THREE.MeshBasicMaterial({ map: getTexture(src, true), toneMapped: false });
  if (typeof src !== 'number' || !CFG.screenLive) return new THREE.MeshBasicMaterial({ map: offTexture(), toneMapped: false });
  const i = src - 1;
  const m = new THREE.MeshBasicMaterial({ map: screenTexture(i), toneMapped: false });
  (screenMats[i] ||= new Set()).add(m);
  m.addEventListener('dispose', () => screenMats[i].delete(m));
  return m;
}
const sceneScreenCtx = {
  screenMaterial,
  registerScreen(src, display, w, h) {
    if (typeof src !== 'number') return;
    if (!userScreens.has(src)) userScreens.set(src, []);
    userScreens.get(src).push({ display, w, h });
  },
};

function screenLookTarget() {
  const s = rig.screens[state.mouse.s];
  if (!s) return null;
  const mx = state.game ? state.nudge.x : state.mouse.x - 0.5, my = state.game ? state.nudge.y : state.mouse.y - 0.5;
  const local = V(mx * s.w * 0.35, -my * s.h * 0.5, 0);
  return s.display.localToWorld(local);
}

function lookAtMouseScreen(dt) {
  if (VR || !rig.eyeLocal || !rig.screens.some(Boolean)) { if (rig.gaze && !rig.screens.some(Boolean)) rig.gaze = null; return; }
  let target = screenLookTarget();
  if (!target && rig.cinema && rig.screens[0]) target = rig.screens[0].display.localToWorld(V(0, 0, 0));
  if (target) lookAtPoint(target, dt);
  else if (rig.gaze) rig.gaze = null;
}

function lookAtPoint(target, dt) {
  const head = rig.bones.Head;
  head.updateWorldMatrix(true, false);
  const eye = head.localToWorld(rig.eyeLocal.clone());
  const dir = target.clone().sub(eye);
  const yaw = THREE.MathUtils.clamp(Math.atan2(dir.x, dir.z) * 0.75, -0.7, 0.7);
  const pitchWorld = Math.atan2(-dir.y, Math.hypot(dir.x, dir.z));
  const pitch = rig.cinema
    ? THREE.MathUtils.clamp(pitchWorld + RECLINE * 0.45, -0.35, 0.35)
    : THREE.MathUtils.clamp(pitchWorld * 0.8, -0.35, 0.35);
  const g = rig.gaze ||= { yaw, pitch };
  const speed = state.game ? 3 : 9;
  g.yaw = damp(g.yaw, yaw, speed, dt);
  g.pitch = damp(g.pitch, pitch, speed, dt);
  const rest = rig.cinema ? qAxis(AX, -RECLINE * 0.45).multiply(rig.headRestWorldQ) : rig.headRestWorldQ;
  const wanted = qAxis(AY, g.yaw).multiply(qAxis(AX, g.pitch + face.talk * Math.sin(clock.elapsedTime * 14) * 0.03)).multiply(rest);
  head.quaternion.copy(head.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wanted));
  head.updateMatrixWorld(true);
}

async function onScreenFrame(buf) {
  const bytes = new Uint8Array(buf);
  if (!CFG.screenLive) return;
  const i = bytes[0], tex = screenTex[i];
  if (!tex || screenBusy[i]) return;
  screenBusy[i] = true;
  try {
    const bmp = await createImageBitmap(new Blob([bytes.subarray(1)], { type: 'image/jpeg' }), { imageOrientation: 'flipY' });
    const old = tex.image;
    if (old && (old.width !== bmp.width || old.height !== bmp.height)) {
      const t2 = new THREE.Texture(bmp);
      t2.colorSpace = THREE.SRGBColorSpace;
      t2.flipY = false;
      t2.needsUpdate = true;
      screenTex[i] = t2;
      for (const m of screenMats[i] || []) m.map = t2;
      tex.dispose();
    } else {
      tex.image = bmp;
      tex.flipY = false;
      tex.needsUpdate = true;
    }
    if (old && old.close) old.close();
  } catch { }
  finally { screenBusy[i] = false; }
}

function frameDecorCamera() {
  const view = orbit.on ? { az: orbit.az, el: orbit.el } : DECOR_VIEWS[CFG.decorView];
  if (rig.sun) {
    const a = THREE.MathUtils.degToRad(view.az);
    rig.sun.position.set(Math.sin(a) * 2, 2.2, Math.cos(a) * 2);
  }
  const boxes = [rig.modelBox.clone()];
  for (const p of rig.props) boxes.push(new THREE.Box3().setFromObject(p));
  for (const d of rig.decor) if (!(view.close && d.userData.floor)) boxes.push(new THREE.Box3().setFromObject(d));
  const box = new THREE.Box3();
  for (const b of boxes) box.union(b);
  const center = box.getCenter(new THREE.Vector3());
  const az = THREE.MathUtils.degToRad(view.az), el = THREE.MathUtils.degToRad(view.el);
  const dir = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  orthoCam.position.copy(center).addScaledVector(dir, 10);
  orthoCam.up.set(0, 1, 0);
  orthoCam.lookAt(center);
  orthoCam.updateMatrixWorld(true);
  const pts = [];
  for (const b of view.close ? boxes : [box])
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(V(x, y, z));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    p.applyMatrix4(orthoCam.matrixWorldInverse);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const margin = 1.06 / (orbit.on ? orbit.zoom : 1);
  let w = (maxX - minX) * margin, h = (maxY - minY) * margin;
  const aspect = window.innerWidth / window.innerHeight;
  if (w / h > aspect) h = w / aspect; else w = h * aspect;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  Object.assign(orthoCam, { left: cx - w / 2, right: cx + w / 2, top: cy + h / 2, bottom: cy - h / 2, near: 0.01, far: 30 });
  orthoCam.updateProjectionMatrix();
}

function frameCamera() {
  if ((CFG.editor || CFG.perso) && rig.editorCamera) { rig.editorCamera(); return; }
  if (!rig.root || !rig.modelBox) return;
  if (CFG.decor) { frameDecorCamera(); return; }
  const box = rig.modelBox.clone();
  for (const p of rig.props) box.expandByObject(p);
  if (CFG.view !== 'full') { box.min.y = rig.focusBottom; box.max.y = rig.modelBox.max.y; }
  box.min.x = Math.max(box.min.x, rig.modelBox.min.x - rig.unit * 0.3);
  box.max.x = Math.min(box.max.x, rig.modelBox.max.x + rig.unit * 0.3);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  if (orbit.on) {
    const az = THREE.MathUtils.degToRad(orbit.az), el = THREE.MathUtils.degToRad(orbit.el);
    const dir = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const up = Math.abs(dir.y) > 0.999 ? V(0, 0, -1) : V(0, 1, 0);
    const right = up.clone().cross(dir).normalize(), camUp = dir.clone().cross(right);
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), th = tv * camera.aspect;
    let dist = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = V(x, y, z).sub(center);
      const depth = p.dot(dir);
      dist = Math.max(dist, Math.abs(p.dot(right)) / th + depth, Math.abs(p.dot(camUp)) / tv + depth);
    }
    camera.position.copy(center).addScaledVector(dir, dist * 1.04 / orbit.zoom);
    keyLight.position.set(0.6, 1.4, 2.2).applyAxisAngle(V(0, 1, 0), az);
    camera.up.copy(up);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    return;
  }
  camera.up.set(0, 1, 0);
  keyLight.position.set(0.6, 1.4, 2.2);

  const elev = THREE.MathUtils.degToRad(PAD ? (CFG.view === 'full' ? 22 : 30) : CFG.view === 'full' ? 8 : 16);
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  const projH = size.y * Math.cos(elev) + size.z * Math.sin(elev);
  const dist = Math.max((projH / 2) / Math.tan(vHalf), (size.x / 2) / Math.tan(hHalf)) * 1.06 + size.z / 2;
  camera.position.copy(center).add(V(0, Math.sin(elev), Math.cos(elev)).multiplyScalar(dist));
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

const MIN_DOWN_MS = 90;

function press(side) {
  const h = state.hands[side];
  h.held++;
  h.downUntil = performance.now() + MIN_DOWN_MS;
  if (h.h > 0.55) h.h = 0.25;
}
function release(side) {
  const h = state.hands[side];
  h.held = Math.max(0, h.held - 1);
}

let lastActivity = 0;
const PASSIVE_EVENTS = new Set(['cfg', 'pads', 'drvs', 'vrs', 'scene', 'perso', 'persoOn', 'vrc', 'game']);
function onEvent(ev) {
  if (!PASSIVE_EVENTS.has(ev.t)) lastActivity = performance.now();
  switch (ev.t) {
    case 'kd':
      if (KEYBOARD) {
        const x = ev.x ?? (ev.s === 'L' ? 4 : 11), row = ev.r ?? 3;
        Object.assign(state.typing, { x, row, last: performance.now() });
        if (rig.keyboard) {
          const k = findKey(rig.keyboard, x, row);
          k.held++; k.lit = 1;
          state.typing.heldKeys.set(`${x}:${row}`, k);
        }
        press('L');
      } else press(sideSwap(ev.s));
      break;
    case 'ku':
      if (KEYBOARD) {
        const id = `${ev.x ?? (ev.s === 'L' ? 4 : 11)}:${ev.r ?? 3}`;
        const k = state.typing.heldKeys.get(id);
        if (k) { k.held = Math.max(0, k.held - 1); state.typing.heldKeys.delete(id); }
        release('L');
      } else release(sideSwap(ev.s));
      break;
    case 'md':
      if (KEYBOARD) { state.click[ev.b] = 1; press('R'); }
      else if (ev.b === 'M') { press('L'); press('R'); } else press(sideSwap(ev.b === 'L' ? 'R' : 'L'));
      break;
    case 'mu':
      if (KEYBOARD) { state.click[ev.b] = 0; release('R'); }
      else if (ev.b === 'M') { release('L'); release('R'); } else release(sideSwap(ev.b === 'L' ? 'R' : 'L'));
      break;
    case 'mm':
      if (state.game && state.mouse.s === (ev.s ?? -1)) {
        const push = (d, v) => THREE.MathUtils.clamp(v + THREE.MathUtils.clamp(d * 0.3, -0.03, 0.03), -0.07, 0.07);
        state.nudge.x = push(ev.x - state.mouse.x, state.nudge.x);
        state.nudge.y = push(ev.y - state.mouse.y, state.nudge.y);
      }
      state.mouse.x = ev.x; state.mouse.y = ev.y; state.mouse.s = ev.s ?? -1;
      break;
    case 'game': state.game = !!ev.on; break;
    case 'wh': state.wheel = THREE.MathUtils.clamp(state.wheel + ev.d * 0.5, -1, 1); break;
    case 'mic': state.mic = ev.v; state.micAt = performance.now(); break;
    case 'vr': Object.assign(state.vr, { h: ev.h, l: ev.l, r: ev.r, tl: ev.tl, tr: ev.tr, at: performance.now() }); break;
    case 'vrc': state.vrRecenter = true; status('VR recentrée'); break;
    case 'cfg':
      if (ev.c?.orbit && (FOLLOW || CFG.inApp) && !CFG.editor && !CFG.perso) setOrbit(ev.c.orbit, false);
      if (ev.c?.fps && (FOLLOW || CFG.inApp) && ev.c.fps !== CFG.fps) {
        CFG.fps = ['60', '30'].includes(ev.c.fps) ? ev.c.fps : 'auto';
        renderer.setPixelRatio(pixelRatio());
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
      if (ev.c?.theme && (CFG.editor || CFG.perso)) window.setUiTheme?.(ev.c.theme);
      if (FOLLOW && ev.c) {
        const strip = c => { const { orbit: _o, fps: _f, theme: _t, ...rest } = c; return JSON.stringify(rest); };
        let before = null;
        try { before = followedCfg && strip(JSON.parse(followedCfg)); } catch { }
        if (strip(ev.c) !== before) location.reload();
      }
      break;
    case 'drv': Object.assign(state.drv, ev, { at: performance.now() }); break;
    case 'pad': Object.assign(state.pad, ev, { at: performance.now() }); break;
    case 'perso':
      if (!CFG.perso) { char.rev = Date.now(); loadCharacter(); }
      break;
    case 'persoOn': setCharacterOn(ev.ids || []); break;
    case 'scene':
      if (!CFG.editor) loadUserScene();
      break;
    case 'pads':
      if (!PAD || ev.ok === state.padOk) break;
      state.padOk = ev.ok;
      if (ev.ok) status('Manette : ' + ev.s); else status('Manette : ' + ev.s, CFG.inApp ? 0 : 4000);
      break;
    case 'drvs':
      if (!WHEEL || ev.ok === state.drvOk) break;
      state.drvOk = ev.ok;
      if (ev.ok) status('Volant : ' + ev.s); else status('Volant : ' + ev.s, CFG.inApp ? 0 : 4000);
      break;
    case 'vrs':
      if (!VR || ev.ok === state.vrOk) break;
      state.vrOk = ev.ok;
      if (ev.ok) status('Casque VR connecté'); else status('Casque VR : ' + ev.s, CFG.inApp ? 0 : 4000);
      break;
  }
}

let wsConnected = false;
let perfSocket = null;

const perf = { deltas: [], last: 0, gaps: [] };
function perfFrame(now) {
  if (perf.last) {
    const d = now - perf.last;
    perf.deltas.push(d);
    if (d > 40) perf.gaps.push(Math.round(d));
  }
  perf.last = now;
}
setInterval(() => {
  const ds = perf.deltas.sort((a, b) => a - b);
  perf.deltas = [];
  const gaps = perf.gaps; perf.gaps = [];
  if (!ds.length || !perfSocket || perfSocket.readyState !== 1) return;
  const src = CFG.inApp ? 'fenêtre' : FOLLOW ? 'obs' : 'navigateur';
  perfSocket.send(JSON.stringify({
    t: 'perf', src, fps: Math.round(ds.length / 5), mediane: +ds[ds.length >> 1].toFixed(1),
    max: Math.round(ds[ds.length - 1]), saccades: gaps.length, exemples: gaps.slice(0, 8), visible: document.visibilityState,
  }));
}, 5000);

function connect() {
  let ws;
  try { ws = new WebSocket(`ws://${location.host}/ws`); } catch { return setTimeout(connect, 2000); }
  ws.onopen = () => { wsConnected = true; perfSocket = ws; status('Connecté aux entrées clavier/souris'); };
  ws.binaryType = 'arraybuffer';
  ws.onmessage = e => {
    if (typeof e.data !== 'string') { onScreenFrame(e.data); return; }
    try { onEvent(JSON.parse(e.data)); } catch { }
  };
  ws.onclose = () => {
    if (wsConnected) status('Connexion perdue — nouvelle tentative…', 0);
    wsConnected = false;
    for (const h of Object.values(state.hands)) h.held = 0;
    setTimeout(connect, 2000);
  };
}
if (location.protocol.startsWith('http')) connect();

const CODE_POS = (() => {
  const m = {};
  const row = (r, codes, start, step = 1) => codes.forEach((c, i) => { m[c] = [start + i * step, r]; });
  row(0, ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'], 0.5);
  row(1, ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'], 0.5);
  m.Backspace = [14, 1]; m.Tab = [0.75, 2];
  row(2, ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'], 2);
  m.CapsLock = [0.9, 3]; m.Enter = [14.1, 3]; m.Backslash = [13.25, 3];
  row(3, ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'], 2.25);
  m.ShiftLeft = [1.1, 4]; m.IntlBackslash = [1.9, 4]; m.ShiftRight = [13.6, 4];
  row(4, ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'], 2.75);
  Object.assign(m, { ControlLeft: [0.75, 5], MetaLeft: [2, 5], AltLeft: [3.25, 5], Space: [7.5, 5], AltRight: [11.75, 5], ContextMenu: [12.75, 5], ControlRight: [14.25, 5] });
  return m;
})();
const localDown = new Map();
let spaceAlt = false;
addEventListener('keydown', e => {
  if (wsConnected || e.repeat || localDown.has(e.code)) return;
  const [x, r] = CODE_POS[e.code] || [14.5, 1];
  let s = x < 7.5 ? 'L' : 'R';
  if (e.code === 'Space') s = (spaceAlt = !spaceAlt) ? 'L' : 'R';
  const ev = { s, x, r };
  localDown.set(e.code, ev);
  onEvent({ t: 'kd', ...ev });
});
addEventListener('keyup', e => {
  const ev = localDown.get(e.code);
  if (!ev) return;
  localDown.delete(e.code);
  onEvent({ t: 'ku', ...ev });
});
addEventListener('pointermove', e => {
  if (wsConnected) return;
  onEvent({ t: 'mm', x: e.clientX / innerWidth, y: e.clientY / innerHeight });
});

const btnName = e => e.button === 2 ? 'R' : e.button === 1 ? 'M' : 'L';
function setOrbit(o, frame = true) {
  const before = JSON.stringify(orbit);
  if (o.on !== undefined) orbit.on = !!o.on;
  if (o.az !== undefined) orbit.az = ((Number(o.az) % 360) + 540) % 360 - 180;
  if (o.el !== undefined) orbit.el = THREE.MathUtils.clamp(Number(o.el), -10, 85);
  if (o.zoom !== undefined) orbit.zoom = THREE.MathUtils.clamp(Number(o.zoom), 0.5, 3);
  if (JSON.stringify(orbit) !== before || frame) frameCamera();
}
let orbitSendTimer = null;
function sendOrbit() {
  if (orbitSendTimer) return;
  orbitSendTimer = setTimeout(() => {
    orbitSendTimer = null;
    window.chrome?.webview?.postMessage({ type: 'orbit', on: orbit.on, az: Math.round(orbit.az), el: Math.round(orbit.el), zoom: Math.round(orbit.zoom * 100) / 100 });
  }, 70);
}
if (CFG.inApp && window.chrome?.webview) {
  let orbitDrag = null;
  addEventListener('pointerdown', e => {
    if (e.button === 0) window.chrome.webview.postMessage({ type: 'drag' });
    else if (e.button === 2 || e.button === 1) {
      orbitDrag = { x: e.clientX, y: e.clientY, az: orbit.az, el: orbit.el };
      if (!orbit.on) {
        const p = viewCam.position.clone().sub(rig.modelBox ? rig.modelBox.getCenter(V()) : V());
        orbitDrag.az = THREE.MathUtils.radToDeg(Math.atan2(p.x, p.z));
        orbitDrag.el = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(p.y / p.length(), -1, 1)));
      }
      try { e.target.setPointerCapture(e.pointerId); } catch { }
      document.body.style.cursor = 'grabbing';
    }
  });
  addEventListener('pointermove', e => {
    if (!orbitDrag) return;
    setOrbit({ on: true, az: orbitDrag.az - (e.clientX - orbitDrag.x) * 0.45, el: orbitDrag.el + (e.clientY - orbitDrag.y) * 0.3 });
    sendOrbit();
  });
  const endOrbit = () => { if (orbitDrag) { orbitDrag = null; document.body.style.cursor = ''; sendOrbit(); } };
  addEventListener('pointerup', endOrbit);
  addEventListener('pointercancel', endOrbit);
  addEventListener('wheel', e => {
    if (e.ctrlKey) { setOrbit({ on: true, zoom: orbit.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1) }); sendOrbit(); return; }
    window.chrome.webview.postMessage({ type: 'zoom', d: e.deltaY < 0 ? 1 : -1 });
  }, { passive: true });
} else {
  addEventListener('pointerdown', e => { if (!wsConnected) onEvent({ t: 'md', b: btnName(e) }); });
  addEventListener('pointerup', e => { if (!wsConnected) onEvent({ t: 'mu', b: btnName(e) }); });
}
addEventListener('contextmenu', e => e.preventDefault());

const clock = new THREE.Clock();
function damp(cur, target, k, dt) { return cur + (target - cur) * (1 - Math.exp(-k * dt)); }
const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);
const qAxis = (axis, a) => new THREE.Quaternion().setFromAxisAngle(axis, a);

function solveSeatedLegs() {
  if (!rig.seatLegs) return;
  for (const leg of rig.seatLegs) {
    const hip = worldPos(leg.upper);
    const ankle = rig.cinema
      ? V(hip.x + leg.side * rig.unit * 0.04, hip.y - rig.unit * 0.12, hip.z + (leg.lenA + leg.lenB) * 0.93)
      : V(hip.x + leg.side * rig.unit * 0.06, rig.floorAnkleY, hip.z + leg.lenA + leg.lenB * 0.22);
    solveIK(leg, ankle);
  }
}

function updateHands(now) {
  for (const side of ['L', 'R']) {
    const h = state.hands[side];
    const down = h.held > 0 || now < h.downUntil;
    h.h = damp(h.h, down ? 1 : 0, down ? 45 : 18, clockDt);
    if (!h.wasDown && h.h > 0.85) {
      h.wasDown = true;
      state.bounceVel -= KEYBOARD ? 0.8 : 2.2;
      if (!KEYBOARD) {
        const drum = rig.drums[side];
        drum.userData.hit = 1;
        const sgn = side === 'L' ? -1 : 1;
        spawnNote(drum.position.clone().add(V(sgn * rig.unit * 0.45, rig.unit * 0.35, rig.unit * 0.3)), rig.unit * 0.5, sgn);
      }
    } else if (h.wasDown && h.h < 0.5) h.wasDown = false;
  }
}

function solveArms(t, now) {
  const u = rig.unit;
  if (!KEYBOARD) {
    for (const side of ['L', 'R']) {
      const arm = rig.arms[side], h = state.hands[side].h;
      const idle = V(0, Math.sin(t * 3 + (side === 'L' ? 0 : 1.7)) * u * 0.02, 0);
      solveIK(arm, arm.hover.clone().lerp(arm.hit, h).addScaledVector(idle, 1 - h));
    }
    return;
  }

  const ty = state.typing;
  const idle = now - ty.last > 1500;
  const tx = idle ? 5.5 : ty.x, trow = idle ? 3.2 : ty.row;
  ty.cx = damp(ty.cx, tx, idle ? 3 : 32, clockDt);
  ty.crow = damp(ty.crow, trow, idle ? 3 : 32, clockDt);
  const hk = state.hands.L.h;
  const onKey = keyAt(ty.cx, ty.crow).add(V(0, u * 0.1, -u * 0.06));
  const hover = onKey.clone().add(V(0, u * 0.24, -u * 0.08));
  const bob = V(0, Math.sin(t * 3) * u * 0.015 * (1 - hk), 0);
  solveIK(PHYSICAL ? rig.arms.R : rig.arms.L, hover.lerp(onKey, hk).add(bob));

  const p = rig.pad;
  const mx = THREE.MathUtils.clamp(state.mouse.x, 0, 1) - 0.5, my = THREE.MathUtils.clamp(state.mouse.y, 0, 1) - 0.5;
  const sx = PHYSICAL ? -1 : 1;
  const mpos = V(p.center.x + sx * mx * p.w * 0.72, p.y, p.center.z - my * p.d * 0.62);
  rig.mouse.position.lerp(mpos, 1 - Math.exp(-25 * clockDt));
  rig.mouse.rotation.y = -sx * mx * 0.25;
  const hm = state.hands.R.h;
  const onMouse = rig.mouse.position.clone().add(V(0, u * (0.17 - 0.035 * hm), -u * 0.02));
  solveIK(PHYSICAL ? rig.arms.L : rig.arms.R, onMouse);

  for (const k of rig.keyboard.userData.keys) {
    k.lit = k.held > 0 ? 1 : damp(k.lit, 0, 8, clockDt);
    k.mesh.position.y = k.baseY - (k.held > 0 ? rig.keyboard.userData.u * 0.2 : 0);
    k.mesh.material.color.setRGB(0.93, 0.93, 0.95).lerp(new THREE.Color(0xd42b2b), k.lit);
  }
  const [btnL, btnR] = PHYSICAL ? [rig.mouse.userData.right, rig.mouse.userData.left] : [rig.mouse.userData.left, rig.mouse.userData.right];
  btnL.material.emissiveIntensity = state.click.L || state.click.M ? 0.9 : 0;
  btnR.material.emissiveIntensity = state.click.R || state.click.M ? 0.9 : 0;
}

let clockDt = 0;
let nextFrameAt = 0;
function targetFps(now) {
  if (CFG.editor || CFG.perso || VR) return 60;
  if (CFG.fps === '30') return 30;
  if (CFG.fps === 'auto' && now - lastActivity > 2500) return 30;
  return 60;
}
function animate() {
  const frameNow = performance.now();
  if (frameNow < nextFrameAt - 1.5) { requestAnimationFrame(animate); return; }
  const interval = 1000 / targetFps(frameNow);
  nextFrameAt = frameNow - nextFrameAt > interval ? frameNow + interval : nextFrameAt + interval;
  const dt = clockDt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const now = performance.now();
  perfFrame(now);

  if (rig.root && rig.arms.L) {
    for (const [bone, q] of rig.rest) bone.quaternion.copy(q);
    rig.root.updateMatrixWorld(true);

    state.nudge.x = damp(state.nudge.x, 0, 2.5, dt);
    state.nudge.y = damp(state.nudge.y, 0, 2.5, dt);
    const mxl = !CFG.look ? 0 : state.game ? state.nudge.x : state.mouse.x - 0.5;
    const myl = !CFG.look ? 0 : state.game ? state.nudge.y : state.mouse.y - 0.5;
    const lookSpeed = state.game ? 3 : 7;
    state.look.x = damp(state.look.x, mxl, lookSpeed, dt);
    state.look.y = damp(state.look.y, myl, lookSpeed, dt);

    if (VR || WHEEL || PAD) {
      rig.root.position.y = rig.bodyBase.y + Math.sin(t * 2.2) * 0.003;
      if (VR) solveVR(t, dt); else if (WHEEL) solveWheel(t, dt); else solvePad(t, dt);
      solveSeatedLegs();
      if (rig.minis) updateMinis(t, dt);
      lookAtMouseScreen(dt);
      updateFace(t, dt);
      updateNotes(dt);
      updateAttachments();
      updateOccluders(dt);
      renderer.render(scene, viewCam);
      requestAnimationFrame(animate);
      return;
    }

    updateHands(now);

    state.bounceVel += (-state.bounce * 260 - state.bounceVel * 16) * dt;
    state.bounce += state.bounceVel * dt;
    rig.root.position.y = rig.bodyBase.y + Math.sin(t * 2.2) * 0.004 + state.bounce * 0.01;

    const lean = 0.12 + (rig.extraLean || 0) + Math.sin(t * 1.3) * 0.015 - state.bounce * 0.05;
    const sway = KEYBOARD
      ? Math.sin(t * 0.9) * 0.02 + (state.typing.cx - 7.5) * (PHYSICAL ? -0.004 : 0.004)
      : Math.sin(t * 0.9) * 0.03 + (state.hands.R.h - state.hands.L.h) * 0.04;
    rotateWorld(rig.bones.Spine_1, qAxis(AX, lean).multiply(qAxis(AZ, -sway)));

    state.wheel = damp(state.wheel, 0, 4, dt);
    const talkNod = face.talk * Math.sin(t * 14) * 0.035;
    const lookX = state.look.x;
    const yaw = lookX * 0.9;
    const pitch = state.look.y * 0.55 - lean * 0.6 + state.wheel * 0.15 + Math.sin(t * 1.7) * 0.01 + talkNod;
    const tilt = -lookX * 0.15 + sway * 0.8;
    rotateWorld(rig.bones.Head, qAxis(AY, yaw).multiply(qAxis(AX, pitch)).multiply(qAxis(AZ, tilt)));

    solveArms(t, now);
    solveSeatedLegs();

    if (!KEYBOARD) for (const side of ['L', 'R']) {
      const d = rig.drums[side];
      d.userData.hit = damp(d.userData.hit, 0, 10, dt);
      const k = d.userData.hit;
      d.userData.skin.scale.set(1 + k * 0.04, 1 - k * 0.5, 1 + k * 0.04);
      d.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.03);
    }

    lookAtMouseScreen(dt);
    updateFace(t, dt);
  }

  updateNotes(dt);
  updateAttachments();
  updateOccluders(dt);
  renderer.render(scene, viewCam);
  requestAnimationFrame(animate);
}

setObjectsRenderer(renderer);
let userSceneSeq = 0;
async function loadUserScene(data) {
  const seq = ++userSceneSeq;
  data ||= await fetchSceneData();
  if (seq !== userSceneSeq || !rig.modelBox) return;
  rig.sceneUnit ||= rig.modelBox.getSize(V()).y || 1;
  if (rig.userScene) { scene.remove(rig.userScene); rig.userScene.children.forEach(disposeObject); }
  userScreens.clear();
  rig.userScene = buildScene(CFG.objs || CFG.editor ? data : { objects: [] }, rig.sceneUnit, sceneScreenCtx);
  rig.userSceneData = data;
  rig.sceneData = data;
  scene.add(rig.userScene);
  applyBase(data.base);
}

const occRay = new THREE.Raycaster();
let occFrame = 0;
function setGroupOpacity(g, f) {
  g.visible = f > 0.03;
  g.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      const o0 = m.userData.o0 ||= { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
      const fading = f < 0.999;
      if (m.transparent !== (fading || o0.transparent)) { m.transparent = fading || o0.transparent; m.needsUpdate = true; }
      m.opacity = o0.opacity * f;
      m.depthWrite = fading ? false : o0.depthWrite;
    }
  });
}
function updateOccluders(dt) {
  const groups = rig.userScene?.children;
  if (!groups?.length || !rig.bones?.Head) return;
  const active = CFG.occlude && !CFG.editor;
  if (active && (occFrame++ % 3 === 0)) {
    const pts = [rig.bones.Head, rig.bones.Spine_1, rig.arms.L?.end, rig.arms.R?.end].filter(Boolean).map(b => b.getWorldPosition(V()));
    pts.push(pts[0].clone().add(V(0, rig.sceneUnit * 0.12 || 0.12, 0)));
    const cam = viewCam;
    cam.updateMatrixWorld();
    const camDir = cam.getWorldDirection(V());
    for (const g of groups) g.userData.hit = false;
    for (const p of pts) {
      const dir = cam.isOrthographicCamera ? camDir.clone().negate() : cam.position.clone().sub(p);
      const far = cam.isOrthographicCamera ? 50 : dir.length();
      occRay.set(p, dir.normalize()); occRay.near = 0.01; occRay.far = far;
      for (const g of groups) if (!g.userData.hit && occRay.intersectObject(g, true).length) g.userData.hit = true;
    }
  }
  for (const g of groups) {
    const target = active && g.userData.hit ? 0 : 1;
    const f = g.userData.fade ?? 1;
    if (f === target) continue;
    g.userData.fade = Math.abs(target - f) < 0.01 ? target : damp(f, target, 8, dt);
    setGroupOpacity(g, g.userData.fade);
  }
}

loadModel()
  .then(() => {
    if (CFG.editor) return import('./editor.js').then(m => m.startEditor(window.mii));
    if (CFG.perso) return import('./perso-editor.js').then(m => m.startCharEditor(window.mii));
  })
  .catch(err => { console.error(err); status('Erreur : ' + err.message, 0); });
animate();

window.mii = { THREE, scene, camera, orthoCam, rig, state, face, onEvent, CFG, onScreenFrame, renderer, frameCamera, loadUserScene, applyBase, screenMaterial, sceneScreenCtx, refreshScreenTargets, userScreens,
  char, applyCharacter, setCharacterOn, loadCharacter,
  reloadExpressions() {
    char.rev = Date.now();
    for (const e of char.expr.values()) e.src = null;
    for (const t of face.cache?.values() || []) t.dispose();
    face.cache?.clear();
    applyCharacter({ items: char.items });
  },
};

let simTimer = null;
window.mii.simVR = (on = true) => {
  clearInterval(simTimer);
  if (!on) return;
  const t0 = performance.now();
  simTimer = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    const head = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(t * 0.9) * 0.25, Math.sin(t * 0.6) * 0.6, 0, 'YXZ'));
    const ctrl = (x, y, z, rx) => [x, y, z, ...new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)).toArray()];
    const wave = Math.sin(t * 3);
    onEvent({
      t: 'vr',
      h: [0, 1.65, 0, ...head.toArray()],
      l: ctrl(-0.3, 1.2 + wave * 0.15, -0.35, -0.3),
      r: ctrl(0.25 + wave * 0.05, 1.75 + wave * 0.1, -0.25, 1.2),
      tl: 0, tr: (Math.sin(t * 4) + 1) / 2,
    });
  }, 16);
};

let simWheelTimer = null;
window.mii.simWheel = (on = true) => {
  clearInterval(simWheelTimer);
  if (!on) return;
  const t0 = performance.now();
  const gears = [1, 2, 3, 4, 5, 6, 0, -1, 0];
  simWheelTimer = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    const s = Math.sin(t * 0.8);
    onEvent({
      t: 'drv', a: Math.sin(t * 0.6) * 220, g: Math.max(0, s), b: Math.max(0, -s) * 0.8,
      c: (t % 2.5) < 0.4 ? 1 : 0, gear: gears[Math.floor(t / 2.5) % gears.length],
      pl: (t % 5) > 4.8 ? 1 : 0, pr: 0,
    });
  }, 16);
};

let simPadTimer = null;
window.mii.simPad = (on = true) => {
  clearInterval(simPadTimer);
  if (!on) return;
  const t0 = performance.now();
  const seq = [4096, 8192, 16384, 32768, 1, 2, 4, 8, 256, 512, 0, 64, 128, 16, 32];
  simPadTimer = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    const i = Math.floor(t * 2.5);
    const b = (t * 2.5 % 1) < 0.5 ? seq[i % seq.length] : 0;
    onEvent({
      t: 'pad', b, lx: Math.cos(t * 2) * 0.9, ly: Math.sin(t * 2) * 0.9, rx: Math.sin(t * 0.7) * 0.6, ry: 0,
      lt: Math.max(0, Math.sin(t * 1.3)), rt: (i % 7 === 3) ? 1 : 0,
    });
  }, 16);
};
