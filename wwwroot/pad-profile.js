import * as THREE from 'three';
import { loadModel3D } from './model-loader.js';
import { getTexture } from './scene-objects.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const PAD_WIDTH = 154;

export const INPUTS = {
  '': { label: '— fixe (ne bouge pas) —' },
  A: { label: 'A · ✕ (PS)', mask: 4096 }, B: { label: 'B · ○ (PS)', mask: 8192 }, X: { label: 'X · □ (PS)', mask: 16384 }, Y: { label: 'Y · △ (PS)', mask: 32768 },
  LB: { label: 'LB · L1 (bumper gauche)', mask: 256 }, RB: { label: 'RB · R1 (bumper droit)', mask: 512 },
  LT: { label: 'LT · L2 (gâchette gauche)', trigger: 'L' }, RT: { label: 'RT · R2 (gâchette droite)', trigger: 'R' },
  LSTICK: { label: 'Stick gauche (+ clic L3)', stick: 'L', mask: 64 }, RSTICK: { label: 'Stick droit (+ clic R3)', stick: 'R', mask: 128 },
  DPAD: { label: 'Croix (les 4 directions)', dpad: true },
  DUP: { label: 'Croix : haut', mask: 1 }, DDOWN: { label: 'Croix : bas', mask: 2 }, DLEFT: { label: 'Croix : gauche', mask: 4 }, DRIGHT: { label: 'Croix : droite', mask: 8 },
  BACK: { label: 'View · Share · Select · −', mask: 32 }, START: { label: 'Menu · Options · Start · +', mask: 16 }, HOME: { label: 'Xbox · PS · Home', mask: 1024 },
};
export const DPAD_DIRS = { DUP: [0, 1], DDOWN: [0, -1], DLEFT: [-1, 0], DRIGHT: [1, 0] };

export const VIEWS = {
  face:   { label: 'de face', a: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  top:    { label: 'de dessus', a: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  back:   { label: 'de dos', a: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
  bottom: { label: 'de dessous', a: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  left:   { label: 'côté gauche', a: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  right:  { label: 'côté droit', a: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
};
const dot = (p, a) => p[0] * a[0] + p[1] * a[1] + p[2] * a[2];

const XBOX_AXIS_X = [0.99, -0.12, -0.078], XBOX_FACE_N = [0.106, 0.222, 0.969];
export const BUILTIN_MODELS = {
  'builtin:xbox': { label: 'Scan Xbox Series', url: './props/manette_xbox.glb' },
  'builtin:8bitdo': { label: '8BitDo Ultimate 2C', url: './props/manette_8bitdo_2c.glb' },
};
function preOrientation(model) {
  if (model === 'builtin:xbox') {
    const xa = V(...XBOX_AXIS_X).normalize(), n0 = V(...XBOX_FACE_N);
    const za = n0.sub(xa.clone().multiplyScalar(n0.dot(xa))).normalize(), ya = za.clone().cross(xa).normalize();
    return new THREE.Matrix4().makeBasis(xa, ya, za).transpose();
  }
  return new THREE.Matrix4();
}
const modelUrl = model => BUILTIN_MODELS[model]?.url || './manettes/' + encodeURIComponent(model);
const gltfCache = new Map();

export async function loadSource(profile) {
  const url = modelUrl(profile.modele);
  if (!gltfCache.has(url)) gltfCache.set(url, loadModel3D(url));
  const gltf = await gltfCache.get(url);
  const src = gltf.scene;
  src.updateMatrixWorld(true);
  const pre = preOrientation(profile.modele);
  const o = (profile.orientation || [0, 0, 0]).map(THREE.MathUtils.degToRad);
  const user = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o[0], o[1], o[2], 'XYZ'));
  const meshes = [];
  src.traverse(m => {
    if (!m.isMesh || !m.geometry?.attributes.position) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld).applyMatrix4(pre).applyMatrix4(user);
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { meshes.push({ geometry: g, material: mat, groups: Array.isArray(m.material) }); break; }
  });
  const bb = new THREE.Box3();
  for (const m of meshes) { m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox); }
  const center = bb.getCenter(V()), scale = PAD_WIDTH / Math.max(bb.max.x - bb.min.x, 1e-6);
  for (const m of meshes) {
    m.geometry.translate(-center.x, -center.y, -center.z).scale(scale, scale, scale);
    m.geometry.computeBoundingBox();
  }
  const size = bb.getSize(V()).multiplyScalar(scale);
  return { meshes, size, raw: { center, scale } };
}

export function zoneShape(z) {
  const view = VIEWS[z.view] || VIEWS.face;
  const [cu, cv] = z.center || [0, 0];
  const shape = z.shape || 'circle';
  return (p) => {
    const du = dot(p, view.u) - cu, dv = dot(p, view.v) - cv;
    if (shape === 'circle') return (z.r ?? 5) - Math.hypot(du, dv);
    if (shape === 'pill') {
      const w = z.size?.[0] ?? 10, h = z.size?.[1] ?? 5, r = h / 2;
      return r - Math.hypot(Math.max(Math.abs(du) - (w / 2 - r), 0), dv);
    }
    const rect = (w, h, rc) => {
      rc = Math.min(rc, w / 2, h / 2);
      const qx = Math.abs(du) - (w / 2 - rc), qy = Math.abs(dv) - (h / 2 - rc);
      return rc - (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0));
    };
    if (shape === 'cross') { const L = z.size?.[0] ?? 22, W = z.size?.[1] ?? 8; return Math.max(rect(L, W, z.corner ?? 1), rect(W, L, z.corner ?? 1)); }
    return rect(z.size?.[0] ?? 10, z.size?.[1] ?? 10, z.corner ?? 2);
  };
}
function zoneFields(z) {
  const view = VIEWS[z.view] || VIEWS.face;
  const shape = zoneShape(z);
  const min = z.depth?.[0] ?? -1e9, max = z.depth?.[1] ?? 1e9;
  const fields = [shape, p => dot(p, view.a) - min];
  if (max < 1e8) fields.push(p => max - dot(p, view.a));
  return { fields, near: p => shape(p) > -2 && dot(p, view.a) > min - 2 && dot(p, view.a) < max + 2 };
}

export function cutGeometry(geo, zones) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const names = Object.keys(src.attributes).filter(n => !src.attributes[n].isInterleavedBufferAttribute)
    .sort((a, b) => (b === 'position') - (a === 'position'));
  const attrs = names.map(n => src.attributes[n]);
  const sizes = attrs.map(a => a.itemSize), stride = sizes.reduce((s, x) => s + x, 0);
  const normalAt = names.indexOf('normal') < 0 ? -1 : sizes.slice(0, names.indexOf('normal')).reduce((s, x) => s + x, 0);
  const P = src.attributes.position;
  const parts = zones.map(zoneFields);
  const out = {};
  const sink = k => (out[k] ||= []);
  const vert = i => {
    const v = new Float32Array(stride); let o = 0;
    for (let a = 0; a < attrs.length; a++) { for (let c = 0; c < sizes[a]; c++) v[o + c] = attrs[a].getComponent(i, c); o += sizes[a]; }
    return v;
  };
  const lerp = (a, b, t) => { const r = new Float32Array(stride); for (let i = 0; i < stride; i++) r[i] = a[i] + (b[i] - a[i]) * t; return r; };
  const emit = (k, poly) => { const s = sink(k); for (let i = 1; i + 1 < poly.length; i++) s.push(poly[0], poly[i], poly[i + 1]); };
  const clip = (poly, f) => {
    const inside = [], outside = [], fv = poly.map(v => f([v[0], v[1], v[2]]));
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length, a = poly[i], fa = fv[i], fb = fv[j];
      (fa > 0 ? inside : outside).push(a);
      if ((fa > 0) !== (fb > 0)) { const v = lerp(a, poly[j], fa / (fa - fb)); inside.push(v); outside.push(v); }
    }
    return [inside, outside];
  };
  const assign = (poly, from) => {
    const c = [0, 0, 0];
    for (const v of poly) { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; }
    c[0] /= poly.length; c[1] /= poly.length; c[2] /= poly.length;
    let ki = -1;
    for (let i = from; i < parts.length; i++) if (parts[i].near(c)) { ki = i; break; }
    if (ki < 0) { emit('shell', poly); return; }
    for (const f of parts[ki].fields) {
      const [inside, outside] = clip(poly, f);
      if (outside.length >= 3) assign(outside, ki + 1);
      poly = inside;
      if (poly.length < 3) return;
    }
    emit(zones[ki].id, poly);
  };
  for (let t = 0; t < P.count; t += 3) {
    const cx = (P.getX(t) + P.getX(t + 1) + P.getX(t + 2)) / 3, cy = (P.getY(t) + P.getY(t + 1) + P.getY(t + 2)) / 3, cz = (P.getZ(t) + P.getZ(t + 1) + P.getZ(t + 2)) / 3;
    const c = [cx, cy, cz];
    if (!parts.some(p => p.near(c))) { sink('shell').push(t, t + 1, t + 2); continue; }
    assign([vert(t), vert(t + 1), vert(t + 2)], 0);
  }
  const geos = {};
  for (const [k, list] of Object.entries(out)) {
    const n = list.length, g = new THREE.BufferGeometry();
    const arrays = sizes.map(s => new Float32Array(n * s));
    for (let i = 0; i < n; i++) {
      const item = list[i];
      if (typeof item === 'number') { for (let a = 0; a < attrs.length; a++) for (let c = 0; c < sizes[a]; c++) arrays[a][i * sizes[a] + c] = attrs[a].getComponent(item, c); }
      else {
        let o = 0;
        for (let a = 0; a < attrs.length; a++) { for (let c = 0; c < sizes[a]; c++) arrays[a][i * sizes[a] + c] = item[o + c]; o += sizes[a]; }
        if (normalAt >= 0) { const a = names.indexOf('normal'), b = i * 3, l = Math.hypot(arrays[a][b], arrays[a][b + 1], arrays[a][b + 2]) || 1; arrays[a][b] /= l; arrays[a][b + 1] /= l; arrays[a][b + 2] /= l; }
      }
    }
    names.forEach((nm, a) => g.setAttribute(nm, new THREE.BufferAttribute(arrays[a], sizes[a], attrs[a].normalized)));
    g.computeBoundingBox(); g.computeBoundingSphere();
    geos[k] = g;
  }
  if (src !== geo) src.dispose();
  return geos;
}

const GLSL_NOISE = `
float pph(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float ppn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(pph(i), pph(i + vec3(1,0,0)), f.x), mix(pph(i + vec3(0,1,0)), pph(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(pph(i + vec3(0,0,1)), pph(i + vec3(1,0,1)), f.x), mix(pph(i + vec3(0,1,1)), pph(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float ppfbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * ppn(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return v; }
`;
const PATTERNS = { uni: 0, fumee: 1, camo: 2, degrade: 3 };
const avgLumCache = new WeakMap();
function averageLuminance(tex) {
  if (!tex?.image) return 0.2;
  if (avgLumCache.has(tex)) return avgLumCache.get(tex);
  let v = 0.2;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'); g.drawImage(tex.image, 0, 0, 32, 32);
    const d = g.getImageData(0, 0, 32, 32).data; let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 10) { const l = (d[i] + d[i + 1] + d[i + 2]) / 765; s += Math.pow(l, 2.2); n++; }
    v = Math.max(0.01, n ? s / n : 0.2);
  } catch { }
  avgLumCache.set(tex, v);
  return v;
}

export function partMaterial(src, look = {}, glowColor = '#ffffff') {
  const mode = look.mode || 'origine';
  if (mode === 'texture') return textureMaterial(src, look, glowColor);
  if (mode === 'origine') {
    const m = src.clone();
    if ('emissive' in m) { m.emissive = new THREE.Color(glowColor); m.emissiveIntensity = 0; if (src.map && !src.emissiveMap) m.emissiveMap = src.map; }
    m.userData.glow = src.map ? 2.2 : 0.35;
    return m;
  }
  const glossy = look.finish === 'brillant';
  const m = new THREE.MeshPhysicalMaterial({
    map: src.map || null, roughness: glossy ? 0.28 : 0.6, metalness: 0, clearcoat: glossy ? 0.9 : 0, clearcoatRoughness: 0.18,
    emissive: new THREE.Color(look.color || glowColor), emissiveIntensity: 0, side: THREE.DoubleSide,
  });
  m.userData.glow = 0.45;
  const uniforms = {
    uA: { value: new THREE.Color(look.color || '#ffffff') }, uB: { value: new THREE.Color(look.color2 || '#000000') },
    uPat: { value: mode === 'motif' ? PATTERNS[look.pattern] ?? 1 : 0 }, uAvg: { value: averageLuminance(src.map) },
    uHasMap: { value: src.map ? 1 : 0 },
  };
  m.customProgramCacheKey = () => 'pad-paint';
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nuniform vec3 uA, uB;\nuniform float uPat, uAvg, uHasMap;\n' + GLSL_NOISE)
      .replace('#include <map_fragment>', `
        float detail = 1.0;
        #ifdef USE_MAP
          vec4 texel = texture2D(map, vMapUv);
          detail = clamp(dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722)) / uAvg, 0.55, 1.6);
        #endif
        float m2 = 0.0, wisp = 0.0;
        if (uPat > 0.5 && uPat < 1.5) {
          float n = ppfbm(vObj * 0.045);
          float s = ppfbm(vec3(vObj.x * 0.028, vObj.y * 0.075, vObj.z * 0.04) + n * 2.4);
          m2 = clamp(smoothstep(0.36, 0.66, s) * (0.75 + 0.5 * ppfbm(vObj * 0.16 + n)), 0.0, 1.0) * 0.92;
          wisp = smoothstep(0.03, 0.0, abs(s - 0.47)) * 0.35;
        } else if (uPat > 1.5 && uPat < 2.5) {
          m2 = max(step(0.52, ppfbm(vObj * 0.05 + vec3(3.0))) * 0.65, step(0.58, ppfbm(vObj * 0.085 + vec3(11.0))));
        } else if (uPat > 2.5) {
          m2 = smoothstep(30.0, -45.0, vObj.y);
        }
        diffuseColor.rgb = (mix(uA, uB, m2) + (uA + uB) * 0.25 * wisp) * mix(1.0, detail, 0.55);`);
  };
  return m;
}

function textureMaterial(src, look, glowColor) {
  const glossy = look.finish === 'brillant';
  const tex = getTexture(look.tex || 'bois');
  const m = new THREE.MeshPhysicalMaterial({
    map: src.map || null, roughness: glossy ? 0.28 : 0.6, metalness: 0, clearcoat: glossy ? 0.9 : 0, clearcoatRoughness: 0.18,
    emissive: new THREE.Color(glowColor), emissiveIntensity: 0, side: THREE.DoubleSide,
  });
  m.userData.glow = 0.45;
  const uniforms = {
    uTex: { value: tex }, uTint: { value: new THREE.Color(look.color || '#ffffff') },
    uScale: { value: 1 / (40 * (look.scale || 1)) }, uAvg: { value: averageLuminance(src.map) },
  };
  m.customProgramCacheKey = () => 'pad-tex';
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position; vObjN = objectNormal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying vec3 vObjN;\nuniform sampler2D uTex; uniform vec3 uTint; uniform float uScale, uAvg;')
      .replace('#include <map_fragment>', `
        float detail = 1.0;
        #ifdef USE_MAP
          vec4 texel = texture2D(map, vMapUv);
          detail = clamp(dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722)) / uAvg, 0.6, 1.5);
        #endif
        vec3 w = pow(abs(normalize(vObjN)), vec3(4.0)); w /= (w.x + w.y + w.z);
        vec3 p = vObj * uScale;
        vec3 c = texture2D(uTex, p.yz).rgb * w.x + texture2D(uTex, p.xz).rgb * w.y + texture2D(uTex, p.xy).rgb * w.z;
        diffuseColor.rgb = c * uTint * mix(1.0, detail, 0.45);`);
  };
  return m;
}

export function mainTexture(source) {
  let best = null, area = 0;
  for (const { material } of source.meshes) {
    const t = material.map, img = t?.image;
    if (img && img.width * img.height > area) { best = t; area = img.width * img.height; }
  }
  return best;
}
const replacedTex = new Map();
function loadReplacement(profile, main) {
  const url = './manettes/' + encodeURIComponent(profile.texture) + '?v=' + (profile.textureRev || 0);
  if (!replacedTex.has(url)) replacedTex.set(url, new THREE.TextureLoader().loadAsync(url).then(t => {
    t.flipY = main?.flipY ?? false; t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = main?.wrapS ?? THREE.RepeatWrapping; t.wrapT = main?.wrapT ?? THREE.RepeatWrapping;
    t.anisotropy = 8; t.needsUpdate = true;
    return t;
  }).catch(() => null));
  return replacedTex.get(url);
}

export const FILL_SHAPES = { cylinder: 'Cylindre', box: 'Boîte', sphere: 'Boule', cone: 'Cône' };
function fillMesh(f) {
  const [w, h, d] = f.size || [10, 10, 10];
  let g;
  if (f.shape === 'box') g = new THREE.BoxGeometry(w, h, d);
  else if (f.shape === 'sphere') g = new THREE.SphereGeometry(0.5, 24, 16).scale(w, h, d);
  else if (f.shape === 'cone') g = new THREE.ConeGeometry(0.5, 1, 24).scale(w, h, d);
  else g = new THREE.CylinderGeometry(0.5, 0.5, 1, 28).scale(w, h, d);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(f.color || '#1c1c1f'), roughness: 0.6, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 }));
  m.material.userData.glow = 0.35;
  m.position.set(...(f.pos || [0, 0, 0]));
  m.rotation.set(...(f.rot || [0, 0, 0]).map(THREE.MathUtils.degToRad), 'YXZ');
  m.userData.fillId = f.id;
  return m;
}

export async function buildController(profile, source = null) {
  source ||= await loadSource(profile);
  const zones = (profile.pieces || []).filter(z => z.id && z.id !== 'shell');
  const model = new THREE.Group();
  const looks = profile.apparence || {};
  const glow = profile.lumiere || '#ffffff';
  const main = mainTexture(source);
  const repl = profile.texture && main ? await loadReplacement(profile, main) : null;
  const swapped = new Map();
  const withTexture = mat => {
    if (!repl || mat.map !== main) return mat;
    if (!swapped.has(mat)) { const c = mat.clone(); c.map = repl; if (c.emissiveMap === main) c.emissiveMap = repl; swapped.set(mat, c); }
    return swapped.get(mat);
  };
  const parts = {};
  const geosByPart = {};
  for (const m of source.meshes) {
    const cut = cutGeometry(m.geometry, zones);
    for (const [id, g] of Object.entries(cut)) (geosByPart[id] ||= []).push({ geometry: g, material: m.material });
  }
  const makePart = (id, zone) => {
    const list = geosByPart[id] || [];
    const bb = new THREE.Box3();
    for (const { geometry } of list) bb.union(geometry.boundingBox);
    const view = VIEWS[zone?.view] || VIEWS.face;
    const a = V(...view.a), u = V(...view.u), v = V(...view.v);
    const input = zone?.input || '';
    const info = INPUTS[input] || {};
    const c = bb.isEmpty() ? V() : bb.getCenter(V());
    let topD = 0;
    if (!bb.isEmpty()) {
      topD = -Infinity;
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) topD = Math.max(topD, x * a.x + y * a.y + z * a.z);
    }
    const top = c.clone().addScaledVector(a, topD - c.dot(a));
    let pivot = c.clone();
    const size = bb.isEmpty() ? 10 : Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
    if (info.stick) pivot = top.clone().addScaledVector(a, -size * 1.1);
    if (info.trigger && !bb.isEmpty()) pivot = V(c.x, bb.max.y, bb.max.z);
    const obj = new THREE.Group();
    obj.position.copy(pivot);
    const mats = [];
    for (const { geometry, material } of list) {
      const mat = partMaterial(withTexture(material), looks[id], glow);
      mats.push(mat);
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.copy(pivot).negate();
      obj.add(mesh);
    }
    model.add(obj);
    const anchor = new THREE.Object3D();
    anchor.position.copy(top).sub(pivot);
    obj.add(anchor);
    const side = c.x < 0 ? 'L' : 'R';
    return parts[id] = { id, obj, anchor, base: obj.position.clone(), mats, zone, input, info, side, view: { a, u, v }, bb, size };
  };
  makePart('shell', null);
  for (const z of zones) makePart(z.id, z);
  for (const f of profile.formes || []) {
    const p = parts[f.attache] || parts.shell;
    const m = fillMesh(f);
    m.position.sub(p.obj.position);
    p.obj.add(m);
    p.mats.push(m.material);
  }
  return { model, parts, size: source.size, source };
}

export function makeControls(built) {
  const controls = [];
  const press = (p, k, depth) => {
    p.obj.position.copy(p.base).addScaledVector(p.view.a, -k * depth);
    for (const m of p.mats) m.emissiveIntensity = k * (m.userData.glow ?? 0.5);
  };
  let ls = null, rs = null, dpadPart = null;
  const triggers = {};
  const dirs = [];
  for (const p of Object.values(built.parts)) {
    if (p.id === 'shell' || !p.input) continue;
    const info = p.info, depth = Math.min(2, Math.max(0.8, p.size * 0.12));
    if (info.stick) {
      const ctl = { ...p, side: info.stick, mask: info.mask, down: false, k: 0, at: 0, apply: k => press(p, k, 1.8) };
      ctl.tilt = (x, y) => p.obj.quaternion.setFromAxisAngle(p.view.u, -y * 0.3).multiply(new THREE.Quaternion().setFromAxisAngle(p.view.v, x * 0.3));
      controls.push(ctl);
      if (info.stick === 'L') ls = ctl; else rs = ctl;
    } else if (info.trigger) {
      triggers[info.trigger] = { apply: v => { p.obj.rotation.x = -v * 0.3; for (const m of p.mats) m.emissiveIntensity = v * (m.userData.glow ?? 0.5); }, part: p, obj: p.obj };
    } else if (info.dpad) {
      dpadPart = p;
      for (const [name, [dx, dy]] of Object.entries(DPAD_DIRS)) {
        const anchor = new THREE.Object3D();
        anchor.position.copy(p.anchor.position).addScaledVector(p.view.u, dx * p.size * 0.3).addScaledVector(p.view.v, dy * p.size * 0.3);
        p.obj.add(anchor);
        const ctl = { ...p, anchor, side: p.side, mask: INPUTS[name].mask, dir: [dx, dy], down: false, k: 0, at: 0, apply: () => { } };
        controls.push(ctl); dirs.push(ctl);
      }
    } else {
      controls.push({ ...p, side: p.side, mask: info.mask, down: false, k: 0, at: 0, apply: k => press(p, k, depth) });
    }
  }
  const updateDpad = () => {
    if (!dpadPart) return;
    let x = 0, y = 0, k = 0;
    for (const c of dirs) { x += c.dir[0] * c.k; y += c.dir[1] * c.k; k = Math.max(k, c.k); }
    dpadPart.obj.quaternion.setFromAxisAngle(dpadPart.view.u, -y * 0.12).multiply(new THREE.Quaternion().setFromAxisAngle(dpadPart.view.v, x * 0.12));
    for (const m of dpadPart.mats) m.emissiveIntensity = k * (m.userData.glow ?? 0.5);
  };
  const fallback = side => {
    const anchor = new THREE.Object3D();
    const s = built.size;
    anchor.position.set(side === 'L' ? -s.x * 0.28 : s.x * 0.28, s.y * 0.05, s.z * 0.45);
    built.model.add(anchor);
    return { anchor, side, tilt: () => { }, apply: () => { }, mask: 0, k: 0, down: false, at: 0 };
  };
  ls ||= fallback('L'); rs ||= fallback('R');
  for (const side of ['L', 'R']) {
    const bumper = controls.find(c => c.mask === (side === 'L' ? 256 : 512));
    triggers[side] ||= { apply: () => { } };
    triggers[side].grab = (bumper || (side === 'L' ? ls : rs)).anchor;
  }
  return { controls, ls, rs, triggers, updateDpad };
}

export const BUILTIN_PADS = [
  { id: '8bitdo', nom: '8BitDo Ultimate 2C (Mint)', builtin: true },
  { id: 'xbox', nom: 'Xbox Series (noire)', builtin: true },
  { id: 'xbox25', nom: 'Xbox — édition 25 ans', builtin: true },
];

export function xboxProfile(raw, anniversary = false) {
  const { center: c, scale: s } = raw;
  const P = {
    LS: [-48.47, 16.22, 8.7, 21, 'LSTICK'], RS: [10.86, -6.85, 8.7, 21, 'RSTICK'], DP: [-29.53, -8.95, 11.58, 22, 'DPAD'],
    Y: [29.16, 26.09, 4.93, 21.4, 'Y'], X: [18.99, 16.0, 4.94, 22.6, 'X'], B: [39.58, 15.81, 4.88, 19.4, 'B'], A: [29.48, 5.75, 4.96, 21.6, 'A'],
    VIEW: [-20.54, 16.01, 3.39, 23.9, 'BACK'], MENU: [1.36, 16.17, 3.37, 23.6, 'START'], HOME: [-9.74, 31.41, 6.04, 23.4, 'HOME'],
  };
  const NAMES = { LS: 'Stick gauche', RS: 'Stick droit', DP: 'Croix', VIEW: 'View', MENU: 'Menu', HOME: 'Bouton Xbox' };
  const pieces = [];
  const X = x => (x - c.x) * s, Y = y => (y - c.y) * s, Z = z => (z - c.z) * s;
  for (const [k, [x, y, r, zMin, input]] of Object.entries(P))
    pieces.push({ id: k.toLowerCase(), nom: NAMES[k] || k, view: 'face', shape: 'circle', center: [X(x), Y(y)], r: r * s, depth: [Z(zMin), null], input });
  pieces.push({ id: 'share', nom: 'Partage', view: 'face', shape: 'pill', center: [X(-9.49), Y(7.56)], size: [9.04 * s, 4.84 * s], depth: [Z(23.7), null], input: '' });
  const CX = -9.75;
  for (const [side, x0, x1] of [['L', -63, -46], ['R', 25.6, 45]]) {
    const seam = 4.5 + Math.max(0, Math.abs((x0 + x1) / 2 - CX) - 40) * 0.3;
    pieces.push({ id: side.toLowerCase() + 't', nom: `Gâchette ${side === 'L' ? 'gauche' : 'droite'}`, view: 'top', shape: 'rect', center: [X((x0 + x1) / 2), Z((-21 + seam) / 2)], size: [(x1 - x0) * s, (seam + 21) * s], corner: 5 * s, depth: [Y(27), null], input: side + 'T' });
  }
  for (const [side, a, b] of [['L', -95, CX - 24], ['R', CX + 24, 75]])
    pieces.push({ id: side.toLowerCase() + 'b', nom: `Bumper ${side === 'L' ? 'gauche' : 'droit'}`, view: 'top', shape: 'rect', center: [X((a + b) / 2), Z((5.2 + 20.8) / 2)], size: [(b - a) * s, (20.8 - 5.2) * s], corner: 0.5, depth: [Y(38.5), null], input: side + 'B' });
  const apparence = anniversary ? {
    shell: { mode: 'motif', pattern: 'fumee', color: '#3d8f14', color2: '#0b2a0d', finish: 'brillant' },
    lt: { mode: 'motif', pattern: 'fumee', color: '#3d8f14', color2: '#0b2a0d', finish: 'brillant' }, rt: { mode: 'motif', pattern: 'fumee', color: '#3d8f14', color2: '#0b2a0d', finish: 'brillant' },
    lb: { mode: 'motif', pattern: 'fumee', color: '#3d8f14', color2: '#0b2a0d', finish: 'brillant' }, rb: { mode: 'motif', pattern: 'fumee', color: '#3d8f14', color2: '#0b2a0d', finish: 'brillant' },
    a: { mode: 'couleur', color: '#5fbf2f', finish: 'brillant' }, b: { mode: 'couleur', color: '#e0332a', finish: 'brillant' },
    x: { mode: 'couleur', color: '#2f86e8', finish: 'brillant' }, y: { mode: 'couleur', color: '#f5c518', finish: 'brillant' },
    home: { mode: 'couleur', color: '#3f9a1c', finish: 'brillant' },
  } : {};
  return {
    format: 'sullys-mii-bongo-manette', version: 1,
    nom: anniversary ? 'Xbox 25 ans (copie)' : 'Xbox Series (copie)',
    modele: 'builtin:xbox', orientation: [0, 0, 0],
    tenue: { taille: 1, hauteur: 0, inclinaison: 0 },
    lumiere: anniversary ? '#9dff6a' : '#ffffff',
    pieces, formes: [], apparence,
  };
}

export function emptyProfile(modele, nom) {
  return {
    format: 'sullys-mii-bongo-manette', version: 1, nom: nom || 'Ma manette', modele, orientation: [0, 0, 0],
    tenue: { taille: 1, hauteur: 0, inclinaison: 0 }, lumiere: '#ffffff', pieces: [], formes: [], apparence: {},
  };
}
