import * as THREE from 'three';
import { loadModel3D } from './model-loader.js';
import { mergeGeometries } from './vendor/three/examples/jsm/utils/BufferGeometryUtils.js';

let maxAniso = 4;
export function setRenderer(r) { maxAniso = r.capabilities.getMaxAnisotropy(); }

export const SHAPES = {
  cube:    { label: 'Cube', icon: '🧊', size: [0.4, 0.4, 0.4], tex: 'bois' },
  wall:    { label: 'Mur', icon: '🧱', size: [3, 1.6, 0.08], tex: 'brique' },
  plate:   { label: 'Plaque / sol', icon: '⬜', size: [3, 0.03, 3], tex: 'carrelage' },
  column:  { label: 'Colonne', icon: '🏛️', size: [0.25, 1.6, 0.25], tex: 'marbre' },
  sphere:  { label: 'Boule', icon: '⚪', size: [0.35, 0.35, 0.35], tex: 'uni', color: '#e8574a' },
  pyramid: { label: 'Pyramide', icon: '🔺', size: [0.6, 0.6, 0.6], tex: 'pierre' },
  stairs:  { label: 'Escalier', icon: '🪜', size: [0.8, 0.6, 1], tex: 'bois' },
  panel:   { label: 'Panneau / image', icon: '🖼️', size: [0.8, 0.8, 0.02], tex: 'uni', color: '#f4f1ea' },
  screen:  { label: 'Écran', icon: '🖥️', size: [0.9, 0.51, 0.04], color: '#1b1b20' },
  glb:     { label: 'Objet 3D', icon: '📦', size: [0.6, 0.6, 0.6] },
  light:   { label: 'Lumière', icon: '💡', size: [0.1, 0.1, 0.1], color: '#fff1d6' },
};

function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export const TEXTURES = {
  uni:       { label: 'Uni', tile: 1, roughness: 0.6, draw: (g, S) => { g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); } },
  bois:      { label: 'Bois', tile: 0.6, roughness: 0.6, draw: drawWood },
  brique:    { label: 'Brique', tile: 0.6, roughness: 0.9, draw: drawBrick },
  beton:     { label: 'Béton', tile: 1, roughness: 0.95, draw: drawConcrete },
  pierre:    { label: 'Pierre', tile: 0.8, roughness: 0.9, draw: drawStone },
  carrelage: { label: 'Carrelage', tile: 0.5, roughness: 0.25, draw: drawTiles },
  damier:    { label: 'Damier', tile: 0.5, roughness: 0.3, draw: drawChecker },
  moquette:  { label: 'Moquette', tile: 0.6, roughness: 1, draw: drawCarpet },
  gazon:     { label: 'Gazon', tile: 0.6, roughness: 1, draw: drawGrass },
  metal:     { label: 'Métal', tile: 0.5, roughness: 0.3, metalness: 0.35, draw: drawMetal },
  marbre:    { label: 'Marbre', tile: 1, roughness: 0.18, draw: drawMarble },
  papier:    { label: 'Papier peint', tile: 0.7, roughness: 0.8, draw: drawWallpaper },
  verre:     { label: 'Verre', tile: 1, roughness: 0.05, opacity: 0.32, draw: (g, S) => { g.fillStyle = '#dff3ff'; g.fillRect(0, 0, S, S); } },
};

function drawWood(g, S) {
  const rnd = seeded(7), rows = 6, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * S * 0.45 + rnd() * S * 0.2;
    for (let k = -1; k < 3; k++) {
      const x0 = (offset + k * S * 0.62) % S, tone = 0.82 + rnd() * 0.3;
      g.fillStyle = `rgb(${Math.round(176 * tone)},${Math.round(116 * tone)},${Math.round(64 * tone)})`;
      g.fillRect(x0, r * rh, S * 0.62, rh); g.fillRect(x0 - S, r * rh, S * 0.62, rh);
      g.strokeStyle = 'rgba(70,40,15,0.18)'; g.lineWidth = 1.2;
      for (let v = 0; v < 5; v++) {
        const y = r * rh + rh * (0.15 + v * 0.17) + rnd() * 3;
        g.beginPath(); g.moveTo(x0, y);
        g.bezierCurveTo(x0 + S * 0.2, y + rnd() * 6 - 3, x0 + S * 0.4, y + rnd() * 6 - 3, x0 + S * 0.62, y); g.stroke();
      }
      g.fillStyle = 'rgba(40,22,8,0.55)'; g.fillRect(x0, r * rh, 2, rh);
    }
    g.fillStyle = 'rgba(40,22,8,0.6)'; g.fillRect(0, r * rh, S, 2);
  }
}
function drawBrick(g, S) {
  const rnd = seeded(11), rows = 8, rh = S / rows, bw = S / 4;
  g.fillStyle = '#cfc6b8'; g.fillRect(0, 0, S, S);
  for (let r = 0; r < rows; r++) for (let k = -1; k < 5; k++) {
    const x = k * bw + (r % 2) * bw / 2, t = 0.8 + rnd() * 0.35;
    g.fillStyle = `rgb(${Math.round(168 * t)},${Math.round(72 * t)},${Math.round(52 * t)})`;
    g.fillRect(x + 3, r * rh + 3, bw - 6, rh - 6);
    for (let i = 0; i < 18; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'; g.fillRect(x + 3 + rnd() * (bw - 10), r * rh + 3 + rnd() * (rh - 10), 4, 3); }
  }
}
function drawConcrete(g, S) {
  const rnd = seeded(5);
  g.fillStyle = '#9c9a96'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) { const v = rnd(); g.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,60,60,0.06)'; g.beginPath(); g.arc(rnd() * S, rnd() * S, 8 + rnd() * 30, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(40,40,40,0.25)'; g.fillRect(0, 0, S, 2); g.fillRect(0, 0, 2, S);
}
function drawStone(g, S) {
  const rnd = seeded(23);
  g.fillStyle = '#6f6b64'; g.fillRect(0, 0, S, S);
  const rows = 5, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * S * 0.3;
    while (x < S) {
      const w = S * (0.18 + rnd() * 0.22), t = 0.75 + rnd() * 0.35;
      g.fillStyle = `rgb(${Math.round(176 * t)},${Math.round(168 * t)},${Math.round(152 * t)})`;
      const r0 = 6 + rnd() * 6;
      g.beginPath(); g.roundRect(x + 4, r * rh + 4, w - 8, rh - 8, r0); g.fill();
      g.beginPath(); g.roundRect(x + 4 - S, r * rh + 4, w - 8, rh - 8, r0); g.fill();
      x += w;
    }
  }
}
function drawTiles(g, S) {
  const n = 4, s = S / n;
  g.fillStyle = '#b9b5ad'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = '#f3f1ec'; g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(i * s + s * 0.12, j * s + s * 0.12, s * 0.3, s * 0.08);
  }
}
function drawChecker(g, S) {
  const n = 4, s = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? '#1d1d22' : '#f1efe9'; g.fillRect(i * s, j * s, s, s); }
}
function drawCarpet(g, S) {
  const rnd = seeded(3);
  g.fillStyle = '#8c8c94'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 16000; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)'; g.fillRect(rnd() * S, rnd() * S, 2, 2); }
}
function drawGrass(g, S) {
  const rnd = seeded(42);
  g.fillStyle = '#4f8f3a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(120,180,80,0.18)' : 'rgba(30,70,20,0.18)'; g.beginPath(); g.arc(rnd() * S, rnd() * S, 6 + rnd() * 26, 0, Math.PI * 2); g.fill(); }
  g.lineWidth = 1.4;
  for (let i = 0; i < 4500; i++) {
    const x = rnd() * S, y = rnd() * S, h = 4 + rnd() * 7, lean = (rnd() - 0.5) * 4, tone = 90 + rnd() * 90;
    g.strokeStyle = `rgb(${Math.round(tone * 0.45)},${Math.round(tone)},${Math.round(tone * 0.35)})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + lean, y - h); g.stroke();
  }
}
function drawMetal(g, S) {
  const rnd = seeded(9);
  g.fillStyle = '#b9bcc2'; g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${0.04 + rnd() * 0.06})`; g.fillRect(0, y, S, 1); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, S, 3); g.fillRect(0, 0, 3, S);
  for (const [x, y] of [[18, 18], [S - 18, 18], [18, S - 18], [S - 18, S - 18]]) {
    const gr = g.createRadialGradient(x - 2, y - 2, 1, x, y, 7); gr.addColorStop(0, '#f4f5f7'); gr.addColorStop(1, '#6d7078');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
  }
}
function drawMarble(g, S) {
  const rnd = seeded(17);
  g.fillStyle = '#f2f0ec'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(120,118,125,${0.08 + rnd() * 0.25})`; g.lineWidth = 0.6 + rnd() * 2.2;
    let x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (rnd() - 0.3) * 90; y += (rnd() - 0.5) * 90; g.lineTo(x, y); }
    g.stroke();
  }
}
function drawWallpaper(g, S) {
  g.fillStyle = '#efe6d2'; g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += S / 8) { g.fillStyle = 'rgba(176,140,90,0.25)'; g.fillRect(x, 0, S / 32, S); }
  g.fillStyle = 'rgba(150,60,70,0.35)';
  for (let x = S / 16; x < S; x += S / 4) for (let y = S / 16; y < S; y += S / 4) {
    g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 8, y); g.lineTo(x, y + 10); g.lineTo(x - 8, y); g.fill();
  }
}

const canvasCache = new Map();
export function textureCanvas(name) {
  if (!canvasCache.has(name)) {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    (TEXTURES[name] || TEXTURES.uni).draw(c.getContext('2d'), 512);
    canvasCache.set(name, c);
  }
  return canvasCache.get(name);
}

const texCache = new Map();
export function getTexture(tex, clamp = false) {
  const key = tex + (clamp ? '|entière' : '');
  if (texCache.has(key)) return texCache.get(key);
  let t;
  if (tex.startsWith('img:')) {
    t = new THREE.TextureLoader().load('./textures/' + encodeURIComponent(tex.slice(4)));
  } else {
    t = new THREE.CanvasTexture(textureCanvas(tex));
  }
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  texCache.set(key, t);
  return t;
}

export function makeMaterial(o) {
  const def = TEXTURES[o.tex] || {};
  const m = new THREE.MeshStandardMaterial({
    map: getTexture(o.tex || 'uni'), color: new THREE.Color(o.color || '#ffffff'),
    roughness: def.roughness ?? 0.7, metalness: def.metalness ?? 0,
  });
  if (def.opacity) { m.transparent = true; m.opacity = def.opacity; m.depthWrite = false; }
  return m;
}

function scaleUV(geo, fu, fv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * fu, uv.getY(i) * fv);
  return geo;
}
export function boxGeo(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]], uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  g.translate(0, h / 2, 0);
  return g;
}

function buildGeometry(type, [w, h, d], tile) {
  switch (type) {
    case 'column': { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 40); g.scale(w, h, d); scaleUV(g, Math.PI * w / tile, h / tile); return g.translate(0, h / 2, 0); }
    case 'sphere': { const g = new THREE.SphereGeometry(0.5, 40, 24); g.scale(w, h, d); scaleUV(g, Math.PI * w / tile, Math.PI * h / 2 / tile); return g.translate(0, h / 2, 0); }
    case 'pyramid': { const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); g.rotateY(Math.PI / 4); g.scale(w, h, d); scaleUV(g, 2 * (w + d) / tile, h / tile); return g.translate(0, h / 2, 0); }
    case 'stairs': {
      const n = Math.max(3, Math.round(h / 0.1)), parts = [];
      for (let i = 0; i < n; i++) {
        const sh = h * (i + 1) / n, sd = d / n;
        const g = boxGeo(w, sh, sd, tile);
        g.translate(0, 0, d / 2 - sd * (i + 0.5));
        parts.push(g);
      }
      return mergeGeometries(parts);
    }
    default: return boxGeo(w, h, d, tile);
  }
}

const gltfCache = new Map();
function loadGlb(file) {
  if (!gltfCache.has(file)) gltfCache.set(file, loadModel3D('./objets/' + encodeURIComponent(file)));
  return gltfCache.get(file);
}

export function makeObject(o, u, ctx = {}) {
  const group = new THREE.Group();
  group.userData.id = o.id;
  const size = (o.size || SHAPES[o.type]?.size || [1, 1, 1]).map(v => Math.max(0.01, +v || 0.01));
  const tile = Math.max(0.02, (+o.texScale || 1) * (TEXTURES[o.tex]?.tile ?? 1));

  if (o.type === 'glb') {
    const holder = new THREE.Group();
    group.add(holder);
    const box = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[0], size[0]).translate(0, size[0] / 2, 0),
      new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true }));
    holder.add(box);
    loadGlb(o.file).then(gltf => {
      const m = gltf.scene.clone(true);
      m.traverse(n => { if (n.isMesh) n.userData.sharedRes = true; });
      const bb = new THREE.Box3().setFromObject(m), s = bb.getSize(new THREE.Vector3());
      const k = size[0] / Math.max(s.x, s.y, s.z, 1e-6);
      m.scale.setScalar(k);
      const c = bb.getCenter(new THREE.Vector3());
      m.position.set(-c.x * k, -bb.min.y * k, -c.z * k);
      holder.remove(box); box.geometry.dispose();
      holder.add(m);
      group.userData.loaded?.();
    }).catch(() => { box.material.color.set(0xff4040); });
  } else if (o.type === 'light') {
    const color = new THREE.Color(o.color || SHAPES.light.color);
    const range = Math.max(0, +o.range || 0);
    const light = new THREE.PointLight(color, Math.max(0, o.intensity ?? 3) * u * u, range * u, 2);
    light.castShadow = o.shadow !== false;
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.0008;
    light.shadow.normalBias = 0.02 * u;
    light.shadow.camera.near = 0.02 * u;
    light.shadow.camera.far = (range || 30) * u;
    group.add(light);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color }));
    bulb.userData.noShadow = true;
    bulb.visible = o.bulb === true;
    group.add(bulb);
    group.userData.light = light;
    group.userData.bulb = bulb;
  } else if (o.type === 'panel') {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]).translate(0, size[1] / 2, 0);
    if (o.tex?.startsWith('img:')) {
      group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(o.color || '#f4f1ea'), roughness: 0.6 })));
      const img = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]).translate(0, size[1] / 2, size[2] / 2 + 0.002),
        new THREE.MeshStandardMaterial({ map: getTexture(o.tex, true), transparent: true, roughness: 0.5 }));
      group.add(img);
    } else {
      scaleUV(g, size[0] / tile, size[1] / tile);
      group.add(new THREE.Mesh(g, makeMaterial({ ...o, tex: o.tex || 'uni' })));
    }
  } else if (o.type === 'screen') {
    const [w, h, d] = size, bezel = Math.min(w, h) * 0.04;
    const frameMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.color || '#1b1b20'), roughness: 0.4 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + bezel * 2, h + bezel * 2, d).translate(0, h / 2, -d / 2), frameMat);
    group.add(frame);
    const display = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0.002),
      ctx.screenMaterial ? ctx.screenMaterial(o.source) : new THREE.MeshBasicMaterial({ color: 0x0b0b0e }));
    group.add(display);
    const y0 = +(o.pos?.[1]) || 0;
    if (o.stand !== false && y0 > 0.02) {
      const standMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.4, metalness: 0.4 });
      const r = Math.min(w, h) * 0.05;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(r, r, y0 + h * 0.3, 12), standMat);
      pole.position.set(0, (h * 0.3 - y0) / 2, -d - r);
      group.add(pole);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.18, w * 0.2, 0.02, 24), standMat);
      foot.position.set(0, -y0 + 0.01, -d - r);
      group.add(foot);
    }
    ctx.registerScreen?.(o.source, display, w * u, h * u);
  } else {
    group.add(new THREE.Mesh(buildGeometry(o.type, size, tile), makeMaterial(o)));
  }

  const [x, y, z] = o.pos || [0, 0, 0], [rx, ry, rz] = (o.rot || [0, 0, 0]).map(THREE.MathUtils.degToRad);
  group.position.set(x * u, y * u, z * u);
  group.rotation.set(rx, ry, rz, 'YXZ');
  group.scale.setScalar(u);
  return group;
}

export function disposeObject(group) {
  group.traverse(m => {
    if (m.isLight) { m.dispose?.(); return; }
    if (!m.isMesh || m.userData.sharedRes) return;
    m.geometry?.dispose();
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) mt?.dispose();
  });
}

export function buildScene(data, u, ctx = {}) {
  const root = new THREE.Group();
  root.name = 'objets-utilisateur';
  for (const o of data?.objects || []) {
    try { root.add(makeObject(o, u, ctx)); } catch (e) { console.warn('Objet ignoré :', o, e); }
  }
  return root;
}


const TYPE_ALIASES = {
  cube: 'cube', boite: 'cube', box: 'cube', caisse: 'cube', bloc: 'cube',
  wall: 'wall', mur: 'wall', cloison: 'wall',
  plate: 'plate', plaque: 'plate', sol: 'plate', floor: 'plate', plafond: 'plate', ceiling: 'plate', tapis: 'plate', rug: 'plate',
  column: 'column', colonne: 'column', cylindre: 'column', cylinder: 'column', pilier: 'column',
  sphere: 'sphere', boule: 'sphere', ball: 'sphere', balle: 'sphere',
  pyramid: 'pyramid', pyramide: 'pyramid',
  stairs: 'stairs', escalier: 'stairs', marches: 'stairs',
  panel: 'panel', panneau: 'panel', image: 'panel', poster: 'panel', tableau: 'panel', cadre: 'panel',
  screen: 'screen', ecran: 'screen', moniteur: 'screen', monitor: 'screen', tele: 'screen', tv: 'screen',
  glb: 'glb', objet: 'glb', model: 'glb', modele: 'glb', objet3d: 'glb',
  light: 'light', lumiere: 'light', lampe: 'light', ampoule: 'light', lamp: 'light', pointlight: 'light', spot: 'light',
};
const TEX_ALIASES = {
  uni: 'uni', plain: 'uni', none: 'uni', couleur: 'uni', color: 'uni',
  bois: 'bois', wood: 'bois', parquet: 'bois', plancher: 'bois',
  brique: 'brique', briques: 'brique', brick: 'brique', bricks: 'brique',
  beton: 'beton', concrete: 'beton', ciment: 'beton',
  pierre: 'pierre', stone: 'pierre', pierres: 'pierre',
  carrelage: 'carrelage', tiles: 'carrelage', tile: 'carrelage', faience: 'carrelage',
  damier: 'damier', checker: 'damier', checkerboard: 'damier', echiquier: 'damier',
  moquette: 'moquette', carpet: 'moquette',
  gazon: 'gazon', grass: 'gazon', herbe: 'gazon', pelouse: 'gazon',
  metal: 'metal', steel: 'metal', acier: 'metal',
  marbre: 'marbre', marble: 'marbre',
  papier: 'papier', 'papier peint': 'papier', wallpaper: 'papier', tapisserie: 'papier',
  verre: 'verre', glass: 'verre', vitre: 'verre',
};
const plain = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const num = (v, d) => { const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : +v; return Number.isFinite(n) ? n : d; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function vec3(v, d, warn, what) {
  if (v == null) return [...d];
  if (typeof v === 'number' || typeof v === 'string') return what === 'rot' ? [0, num(v, 0), 0] : [num(v, d[0]), num(v, d[1]), num(v, d[2])];
  if (Array.isArray(v)) return [0, 1, 2].map(i => num(v[i], d[i]));
  if (typeof v === 'object') {
    const pick = (...keys) => keys.map(k => v[k]).find(x => x != null);
    return [num(pick('x', 'largeur', 'width', 'l', 'w'), d[0]), num(pick('y', 'hauteur', 'height', 'h'), d[1]), num(pick('z', 'profondeur', 'depth', 'p', 'd'), d[2])];
  }
  warn(`${what} illisible, valeur par défaut utilisée`);
  return [...d];
}
function color(c, d) {
  if (c == null || c === '') return d;
  try { return '#' + new THREE.Color(String(c).trim()).getHexString(); } catch { return d; }
}
function texName(t, warn) {
  if (t == null || t === '') return null;
  const s = String(t);
  if (/^(img|image):/i.test(s)) return 'img:' + s.replace(/^(img|image):\s*/i, '');
  const k = TEX_ALIASES[plain(s)];
  if (!k) warn(`texture « ${s} » inconnue → uni`);
  return k || 'uni';
}
function screenSource(v) {
  if (v == null || v === '') return 1;
  if (typeof v === 'number') return v >= 1 ? Math.round(v) : 'off';
  const s = String(v);
  if (/^(img|image):/i.test(s)) return 'img:' + s.replace(/^(img|image):\s*/i, '');
  const p = plain(s);
  if (['off', 'eteint', 'none', 'aucun', 'noir'].includes(p)) return 'off';
  if (['principal', 'main', 'primary'].includes(p)) return 1;
  if (['secondaire', 'secondary', 'second'].includes(p)) return 2;
  const n = parseInt(p.replace(/\D/g, ''), 10);
  return n >= 1 ? n : 1;
}

export function normalizeScene(raw) {
  const warnings = [];
  if (typeof raw === 'string') raw = parseSceneText(raw);
  if (Array.isArray(raw)) raw = { objects: raw };
  if (!raw || typeof raw !== 'object') throw new Error("ce n'est pas une scène (il faut un objet JSON avec une liste « objects »)");
  const list = raw.objects ?? raw.objets ?? raw.elements ?? [];
  if (!Array.isArray(list)) throw new Error('« objects » doit être une liste');
  const ids = new Set(), objects = [];
  list.slice(0, 2000).forEach((o, n) => {
    if (!o || typeof o !== 'object') return;
    const label = o.name || o.nom || `objet n°${n + 1}`;
    const warn = m => warnings.push(`${label} : ${m}`);
    const type = TYPE_ALIASES[plain(o.type ?? o.forme ?? o.kind)];
    if (!type) { warnings.push(`${label} : type « ${o.type} » inconnu, objet ignoré`); return; }
    const def = SHAPES[type];
    let id = String(o.id ?? '').trim();
    if (!id || ids.has(id)) id = 'o' + Math.random().toString(36).slice(2, 10);
    ids.add(id);
    const sizeIn = o.size ?? o.taille ?? o.dimensions;
    let size = type === 'glb' && (typeof sizeIn === 'number' || typeof sizeIn === 'string')
      ? [num(sizeIn, def.size[0]), num(sizeIn, def.size[0]), num(sizeIn, def.size[0])]
      : vec3(sizeIn, def.size, warn, 'taille');
    size = size.map(v => clamp(Math.abs(v), 0.01, 50));
    const obj = {
      id, type, name: String(o.name ?? o.nom ?? '').slice(0, 60) || `${def.label} ${n + 1}`,
      pos: vec3(o.pos ?? o.position, [0, 0, 0], warn, 'position').map(v => clamp(v, -100, 100)),
      rot: vec3(o.rot ?? o.rotation, [0, 0, 0], warn, 'rot').map(v => ((v % 360) + 540) % 360 - 180),
      size,
    };
    if (type === 'glb') {
      obj.file = String(o.file ?? o.fichier ?? '');
      if (!obj.file) { warn('objet 3D sans fichier, ignoré'); return; }
    } else if (type === 'light') {
      obj.color = color(o.color ?? o.couleur, def.color);
      obj.intensity = clamp(num(o.intensity ?? o.intensite ?? o.puissance, 3), 0, 50);
      obj.range = clamp(num(o.range ?? o.portee ?? o.distance, 0), 0, 100);
      obj.shadow = (o.shadow ?? o.ombres ?? o.ombre) !== false;
      obj.bulb = !!(o.bulb ?? o.ampoule);
    } else if (type === 'screen') {
      obj.source = screenSource(o.source ?? o.affiche ?? o.ecran);
      obj.stand = o.stand ?? o.pied ?? true;
      obj.color = color(o.color ?? o.couleur, def.color);
    } else {
      obj.tex = texName(o.tex ?? o.texture, warn) || def.tex || 'uni';
      obj.color = color(o.color ?? o.couleur, def.color || '#ffffff');
      obj.texScale = clamp(num(o.texScale ?? o.motif, 1), 0.05, 10);
    }
    objects.push(obj);
  });
  if (list.length > 2000) warnings.push('plus de 2000 objets : les suivants sont ignorés');

  const b = raw.base || {}, base = {};
  const t = b.table ?? b.bureau;
  if (t && typeof t === 'object') {
    const warn = m => warnings.push(`table : ${m}`);
    base.table = {
      tex: texName(t.tex ?? t.texture, warn) || 'bois', color: color(t.color ?? t.couleur, '#c98a4b'),
      texScale: clamp(num(t.texScale ?? t.motif, 1), 0.05, 10),
      legColor: color(t.legColor ?? t.pieds, '#8a5a2b'), padColor: color(t.padColor ?? t.tapis, '#6a2a8a'),
      width: clamp(num(t.width ?? t.largeur, 1), 0.6, 2.5), depth: clamp(num(t.depth ?? t.profondeur, 1), 0.7, 2.5),
      hidden: !!(t.hidden ?? t.masque ?? t.cache),
    };
  }
  const sc = b.screens ?? b.ecrans;
  if (Array.isArray(sc)) {
    base.screens = sc.slice(0, 2).map((e, i) => {
      if (!e || typeof e !== 'object') return {};
      const warn = m => warnings.push(`écran ${i + 1} du décor : ${m}`);
      const out = { source: screenSource(e.source ?? e.affiche ?? i + 1), color: color(e.color ?? e.couleur, '#1b1b20'), hidden: !!(e.hidden ?? e.masque) };
      if (e.pos ?? e.position) out.pos = vec3(e.pos ?? e.position, [0, 0, 0], warn, 'position');
      if (e.rot ?? e.rotation) out.rot = vec3(e.rot ?? e.rotation, [0, 0, 0], warn, 'rot');
      if (e.size ?? e.taille) out.size = clamp(num(e.size ?? e.taille, 1), 0.2, 5);
      return out;
    });
  }
  const pd = b.pad ?? b.tapis;
  if (pd && typeof pd === 'object') {
    const warn = m => warnings.push(`tapis de souris : ${m}`);
    base.pad = {
      tex: texName(pd.tex ?? pd.texture, warn) || 'uni', color: color(pd.color ?? pd.couleur, '#6a2a8a'),
      texScale: clamp(num(pd.texScale ?? pd.motif, 1), 0.05, 10),
      w: clamp(num(pd.w ?? pd.largeur, 1), 0.2, 4), d: clamp(num(pd.d ?? pd.profondeur, 1), 0.2, 4),
      hidden: !!(pd.hidden ?? pd.masque),
    };
    if (pd.pos ?? pd.position) base.pad.pos = vec3(pd.pos ?? pd.position, [0, 0, 0], warn, 'position');
    if (pd.rot ?? pd.rotation) base.pad.rot = vec3(pd.rot ?? pd.rotation, [0, 0, 0], warn, 'rot');
  }
  const mi = b.mii;
  if (mi && typeof mi === 'object') {
    const warn = m => warnings.push(`Mii : ${m}`);
    const p = vec3(mi.pos ?? mi.position, [0, 0, 0], warn, 'position');
    base.mii = { pos: [clamp(p[0], -1.5, 1.5), 0, clamp(p[2], -1.5, 1.5)] };
  }
  const scene = {
    format: 'sullys-mii-bongo-scene', version: 2,
    nom: String(raw.nom ?? raw.name ?? '').slice(0, 80), description: String(raw.description ?? '').slice(0, 500),
    base, objects,
  };
  return { scene, warnings };
}

export function parseSceneText(text) {
  let t = String(text).replace(/```[a-z]*\s*/gi, '').replace(/```/g, '').trim();
  const a = t.search(/[{[]/);
  if (a < 0) throw new Error('aucun JSON trouvé dans le texte');
  const open = t[a], close = open === '{' ? '}' : ']';
  const b = t.lastIndexOf(close);
  t = t.slice(a, b + 1);
  try { return JSON.parse(t); }
  catch (e) {
    const fixed = t.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(fixed); } catch { throw new Error('JSON invalide : ' + e.message); }
  }
}
