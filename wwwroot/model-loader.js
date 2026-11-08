import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from './vendor/three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from './vendor/three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from './vendor/three/examples/jsm/loaders/MTLLoader.js';
import { ColladaLoader } from './vendor/three/examples/jsm/loaders/ColladaLoader.js';
import { STLLoader } from './vendor/three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from './vendor/three/examples/jsm/loaders/PLYLoader.js';
import { ThreeMFLoader } from './vendor/three/examples/jsm/loaders/3MFLoader.js';
import { unzipSync } from './vendor/three/examples/jsm/libs/fflate.module.js';

export const MODEL_EXTENSIONS = ['glb', 'gltf', 'fbx', 'obj', 'dae', '3mf', 'stl', 'ply', 'zip'];
const PRIORITY = ['glb', 'gltf', 'fbx', 'dae', 'obj', '3mf', 'stl', 'ply'];

const extOf = name => (decodeURIComponent(String(name).split(/[?#]/)[0]).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const baseName = p => decodeURIComponent(String(p).split(/[?#]/)[0]).split(/[\\/]/).pop().toLowerCase();
const dirOf = url => url.slice(0, url.lastIndexOf('/') + 1);

export const isModelFile = name => MODEL_EXTENSIONS.includes(extOf(name));
export const modelLabel = name => String(name).replace(/\.(glb|gltf|fbx|obj|dae|3mf|stl|ply|zip)$/i, '');

function folderManager(url) {
  const dir = dirOf(url);
  const manager = new THREE.LoadingManager();
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
  const files = unzipSync(buf);
  const entries = Object.entries(files).filter(([p, d]) => d.length && !/(^|\/)__MACOSX\//.test(p) && !/(^|\/)\./.test(p));
  const main = PRIORITY.map(e => entries.filter(([p]) => extOf(p) === e).sort((a, b) => a[0].split('/').length - b[0].split('/').length)[0]).find(Boolean);
  if (!main) throw new Error("aucun modèle 3D dans ce ZIP (glb, gltf, fbx, obj, dae, 3mf, stl ou ply)");
  const byPath = new Map(), byName = new Map(), blobData = new Map();
  for (const [p, d] of entries) {
    const u = URL.createObjectURL(new Blob([d]));
    byPath.set(p.toLowerCase(), u);
    if (!byName.has(baseName(p))) byName.set(baseName(p), u);
    blobData.set(u, d);
  }
  const mainDir = main[0].includes('/') ? main[0].slice(0, main[0].lastIndexOf('/') + 1).toLowerCase() : '';
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(u => {
    if (blobData.has(u) || /^data:/.test(u)) return u;
    const rel = decodeURIComponent(u.replace(/^blob:[a-z]+:\/\/[^/]+\//i, '').replace(/^https?:\/\/[^/]+\//i, '')).replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
    return byPath.get(mainDir + rel) || byPath.get(rel) || byName.get(baseName(rel)) || u;
  });
  const decoder = new TextDecoder();
  const readText = async u => decoder.decode(blobData.get(manager.resolveURL(u)) || new Uint8Array());
  const result = await loadByExt(extOf(main[0]), byPath.get(main[0].toLowerCase()), manager, readText);
  result.zip = main[0];
  return result;
}

export async function loadModel3D(url) {
  const ext = extOf(url);
  const result = ext === 'zip'
    ? await loadZip(url)
    : await loadByExt(ext, url, folderManager(url), async u => (await fetch(u)).text());
  result.scene.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m?.map) m.map.colorSpace = THREE.SRGBColorSpace;
  });
  return result;
}
