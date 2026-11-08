import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from './vendor/three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from './vendor/three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from './vendor/three/examples/jsm/loaders/MTLLoader.js';
import { ColladaLoader } from './vendor/three/examples/jsm/loaders/ColladaLoader.js';
import { STLLoader } from './vendor/three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from './vendor/three/examples/jsm/loaders/PLYLoader.js';
import { ThreeMFLoader } from './vendor/three/examples/jsm/loaders/3MFLoader.js';
import { TGALoader } from './vendor/three/examples/jsm/loaders/TGALoader.js';
import { unzipSync } from './vendor/three/examples/jsm/libs/fflate.module.js';

export const MODEL_EXTENSIONS = ['glb', 'gltf', 'fbx', 'obj', 'dae', '3mf', 'stl', 'ply', 'zip'];
const PRIORITY = ['glb', 'gltf', 'fbx', 'dae', 'obj', '3mf', 'stl', 'ply'];

const extOf = name => (decodeURIComponent(String(name).split(/[?#]/)[0]).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const baseName = p => decodeURIComponent(String(p).split(/[?#]/)[0]).split(/[\\/]/).pop().toLowerCase();
const dirOf = url => url.slice(0, url.lastIndexOf('/') + 1);
const stemOf = p => baseName(p).replace(/\.[a-z0-9]+$/i, '');

function track(manager) {
  manager.addHandler(/\.tga$/i, new TGALoader(manager));
  const t = { pending: 0, failed: [], wake: null };
  const start = manager.itemStart.bind(manager), end = manager.itemEnd.bind(manager), error = manager.itemError.bind(manager);
  manager.itemStart = u => { t.pending++; start(u); };
  manager.itemEnd = u => { t.pending = Math.max(0, t.pending - 1); end(u); if (!t.pending) t.wake?.(); };
  manager.itemError = u => { t.failed.push(u); error(u); };
  t.idle = ms => t.pending ? new Promise(r => { t.wake = r; setTimeout(r, ms); }) : Promise.resolve();
  return t;
}

function averageColor(tex) {
  const img = tex?.image;
  if (!img || img.data || !(img.width > 0)) return null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    const s = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
    return s.map(v => v / (d.length / 4));
  } catch { return null; }
}

const looksLikeNormalMap = tex => {
  const a = averageColor(tex);
  return !!a && a[2] > 190 && a[0] > 90 && a[0] < 175 && a[1] > 90 && a[1] < 175;
};

function toStandard(m) {
  const s = new THREE.MeshStandardMaterial({
    name: m.name, color: m.color ? m.color.clone() : new THREE.Color(0xffffff), map: m.map || null,
    emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0), emissiveMap: m.emissiveMap || null, emissiveIntensity: m.emissiveIntensity ?? 1,
    normalMap: m.normalMap || null, bumpMap: m.bumpMap || null, bumpScale: m.bumpScale ?? 1,
    alphaMap: m.alphaMap || null, aoMap: m.aoMap || null, aoMapIntensity: m.aoMapIntensity ?? 1, lightMap: m.lightMap || null,
    displacementMap: m.displacementMap || null, displacementScale: m.displacementScale ?? 1,
    opacity: m.opacity, transparent: m.transparent, alphaTest: m.alphaTest, side: m.side, vertexColors: m.vertexColors,
    depthWrite: m.depthWrite, depthTest: m.depthTest, flatShading: !!m.flatShading, wireframe: !!m.wireframe,
    roughness: m.shininess != null ? Math.min(1, Math.max(0.25, Math.sqrt(2 / (m.shininess + 2)) * 1.6)) : 0.85, metalness: 0,
  });
  if (m.normalScale) s.normalScale.copy(m.normalScale);
  s.userData = { ...m.userData };
  return s;
}

function tidyMaterials(root) {
  const done = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const fix = m => {
      if (!m) return m;
      if (done.has(m)) return done.get(m);
      let out = m;
      if (m.bumpMap && !m.normalMap && looksLikeNormalMap(m.bumpMap)) { m.normalMap = m.bumpMap; m.bumpMap = null; m.needsUpdate = true; }
      if (m.isMeshPhongMaterial || m.isMeshLambertMaterial) out = toStandard(m);
      done.set(m, out);
      return out;
    };
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
  });
}

function dropBrokenTextures(root) {
  const dropped = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      for (const k of Object.keys(m)) {
        const tex = m[k];
        if (!tex?.isTexture || tex.isRenderTargetTexture || tex.isVideoTexture || tex.isCanvasTexture) continue;
        const img = tex.image;
        const ok = img && (img.data || img.width > 0 || img.naturalWidth > 0 || (Array.isArray(img) && img.length));
        if (ok) continue;
        dropped.add(tex.name || k);
        m[k] = null;
        m.needsUpdate = true;
      }
    }
  });
  return [...dropped];
}

export const isModelFile = name => MODEL_EXTENSIONS.includes(extOf(name));
export const modelLabel = name => String(name).replace(/\.(glb|gltf|fbx|obj|dae|3mf|stl|ply|zip)$/i, '');

function folderManager(url) {
  const dir = dirOf(url);
  const manager = new THREE.LoadingManager();
  manager.tracker = track(manager);
  manager.setURLModifier(u => {
    if (/^(blob:|data:)/.test(u)) return u;
    if (/\\|^[a-z]:/i.test(decodeURIComponent(u).replace(/^https?:\/\/[^/]+\//, ''))) return dir + encodeURIComponent(baseName(u));
    return u;
  });
  return manager;
}

function plainMesh(geometry) {
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0xd8d8dc, roughness: 0.6, metalness: 0.05, vertexColors: !!geometry.attributes.color });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  return group;
}

async function loadMtlFor(url, manager, readText) {
  try {
    const text = await readText(url);
    const lib = text.match(/^\s*mtllib\s+(.+?)\s*$/m)?.[1];
    if (!lib) return { text };
    const mtl = new MTLLoader(manager);
    mtl.setResourcePath(dirOf(url));
    const materials = await mtl.loadAsync(dirOf(url) + encodeURIComponent(lib));
    materials.preload();
    return { text, materials };
  } catch { return {}; }
}

async function loadByExt(ext, url, manager, readText) {
  switch (ext) {
    case 'glb': case 'gltf': {
      const g = await new GLTFLoader(manager).loadAsync(url);
      return { scene: g.scene, animations: g.animations || [] };
    }
    case 'fbx': {
      const o = await new FBXLoader(manager).loadAsync(url);
      return { scene: o, animations: o.animations || [] };
    }
    case 'obj': {
      const { text, materials } = await loadMtlFor(url, manager, readText);
      const loader = new OBJLoader(manager);
      if (materials) loader.setMaterials(materials);
      const o = text != null ? loader.parse(text) : await loader.loadAsync(url);
      return { scene: o, animations: [] };
    }
    case 'dae': {
      const c = await new ColladaLoader(manager).loadAsync(url);
      return { scene: c.scene, animations: c.scene.animations || [] };
    }
    case '3mf': return { scene: await new ThreeMFLoader(manager).loadAsync(url), animations: [] };
    case 'stl': return { scene: plainMesh(await new STLLoader(manager).loadAsync(url)), animations: [] };
    case 'ply': return { scene: plainMesh(await new PLYLoader(manager).loadAsync(url)), animations: [] };
    default: throw new Error(`format « .${ext} » non pris en charge`);
  }
}

async function loadZip(url) {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const entries = [];
  const expand = (data, prefix, depth) => {
    for (const [p, d] of Object.entries(unzipSync(data))) {
      if (!d.length || /(^|\/)__MACOSX\//.test(p) || /(^|\/)\./.test(p)) continue;
      const path = prefix + p;
      if (extOf(p) === 'zip' && depth < 2) {
        try { expand(d, path.slice(0, path.lastIndexOf('/') + 1), depth + 1); continue; } catch { }
      }
      entries.push([path, d]);
    }
  };
  expand(buf, '', 0);
  const main = PRIORITY.map(e => entries.filter(([p]) => extOf(p) === e).sort((a, b) => a[0].split('/').length - b[0].split('/').length)[0]).find(Boolean);
  if (!main) throw new Error("aucun modèle 3D dans ce ZIP (glb, gltf, fbx, obj, dae, 3mf, stl ou ply)");
  const byPath = new Map(), byName = new Map(), byStem = new Map(), blobData = new Map();
  for (const [p, d] of entries) {
    const u = URL.createObjectURL(new Blob([d]));
    byPath.set(p.toLowerCase(), u);
    if (!byName.has(baseName(p))) byName.set(baseName(p), u);
    if (!isModelFile(p) && !byStem.has(stemOf(p))) byStem.set(stemOf(p), u);
    blobData.set(u, d);
  }
  const mainDir = main[0].includes('/') ? main[0].slice(0, main[0].lastIndexOf('/') + 1).toLowerCase() : '';
  const manager = new THREE.LoadingManager();
  manager.tracker = track(manager);
  manager.setURLModifier(u => {
    if (blobData.has(u) || /^data:/.test(u)) return u;
    const rel = decodeURIComponent(u.replace(/^blob:[a-z]+:\/\/[^/]+\//i, '').replace(/^https?:\/\/[^/]+\//i, '')).replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
    return byPath.get(mainDir + rel) || byPath.get(rel) || byName.get(baseName(rel)) || byStem.get(stemOf(rel)) || u;
  });
  const decoder = new TextDecoder();
  const readText = async u => decoder.decode(blobData.get(manager.resolveURL(u)) || new Uint8Array());
  const result = await loadByExt(extOf(main[0]), byPath.get(main[0].toLowerCase()), manager, readText);
  result.zip = main[0];
  result.tracker = manager.tracker;
  result.images = entries.filter(([p]) => TEX_RANK[extOf(p)] !== undefined).map(([p]) => ({ path: p, url: byPath.get(p.toLowerCase()) }));
  result.flipY = !['glb', 'gltf'].includes(extOf(main[0]));
  return result;
}

const TEX_RANK = { jpg: 0, jpeg: 0, png: 1, webp: 1, bmp: 3, tga: 4 };
const TEX_ROLES = [
  ['normalMap', /(normalmap|normal|nrm|norm)$|[_\-. ]n$/],
  ['roughnessMap', /(roughness|rough|rgh)$|[_\-. ]r$/],
  ['metalnessMap', /(metalness|metallic|metal)$|[_\-. ]m$/],
  ['aoMap', /(ambientocclusion|occlusion|ao)$/],
  ['map', /(albedo|basecolor|base_color|diffuse|diff|dif|color|col)$|[_\-. ](a|d|bc|c)$/],
];
const cleanName = s => String(s || '').toLowerCase().replace(/[_\-. ]*(inst|mat|material|mtl)$/, '').replace(/[_\-. ]+$/, '');

function textureSets(images) {
  const sets = new Map();
  for (const img of images) {
    const stem = stemOf(img.path);
    for (const [role, rx] of TEX_ROLES) {
      const m = stem.match(rx);
      if (!m) continue;
      const base = stem.slice(0, m.index).replace(/[_\-. ]+$/, '');
      const set = sets.get(base) || sets.set(base, {}).get(base);
      const cur = set[role];
      if (!cur || TEX_RANK[extOf(img.path)] < TEX_RANK[extOf(cur.path)]) set[role] = img;
      break;
    }
  }
  return sets;
}

async function autoTextures(root, images, flipY) {
  if (!images?.length) return 0;
  const sets = [...textureSets(images)].filter(([, s]) => s.map);
  if (!sets.length) return 0;
  const tga = new TGALoader(), loader = new THREE.TextureLoader(), cache = new Map();
  const load = img => {
    if (!cache.has(img.url)) {
      const l = extOf(img.path) === 'tga' ? tga : loader;
      cache.set(img.url, l.loadAsync(img.url).then(t => { t.flipY = flipY; t.needsUpdate = true; return t; }).catch(() => null));
    }
    return cache.get(img.url);
  };
  const jobs = [], seen = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || m.map || seen.has(m) || !m.isMeshStandardMaterial) continue;
      seen.add(m);
      const key = cleanName(m.name);
      let best = null;
      for (const [base, set] of sets) if (base && key && (key.includes(base) || base.includes(key)) && (!best || base.length > best[0].length)) best = [base, set];
      if (!best && sets.length === 1) best = sets[0];
      if (!best) continue;
      const set = best[1];
      for (const role of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
        if (!set[role] || m[role]) continue;
        jobs.push(load(set[role]).then(t => {
          if (!t) return;
          if (role === 'map') { t.colorSpace = THREE.SRGBColorSpace; m.color.set(0xffffff); }
          m[role] = t;
          if (role === 'roughnessMap') m.roughness = 1;
          if (role === 'metalnessMap') m.metalness = 1;
          m.needsUpdate = true;
        }));
      }
    }
  });
  await Promise.all(jobs);
  return jobs.length;
}

export async function loadModel3D(url) {
  const ext = extOf(url);
  let result;
  if (ext === 'zip') result = await loadZip(url);
  else {
    const manager = folderManager(url);
    result = await loadByExt(ext, url, manager, async u => (await fetch(u)).text());
    result.tracker = manager.tracker;
  }
  await result.tracker?.idle(10000);
  const dropped = dropBrokenTextures(result.scene);
  if (dropped.length) console.warn(`Modèle ${baseName(url)} : textures introuvables ignorées (${dropped.join(', ')})`, result.tracker?.failed || []);
  delete result.tracker;
  tidyMaterials(result.scene);
  await autoTextures(result.scene, result.images, result.flipY !== false);
  delete result.images;
  delete result.flipY;
  result.scene.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m?.map) m.map.colorSpace = THREE.SRGBColorSpace;
  });
  return result;
}
