import * as THREE from 'three';

const MAX = 4;
const STEP = 1 / 240;
const _a = new THREE.Vector3(), _d = new THREE.Vector3(), _m3 = new THREE.Matrix3(), _p = new THREE.Vector3();
const SHOW_SEL = new THREE.Color(0xffd23f), SHOW_OTHER = new THREE.Color(0x3fb6ff);

export const PHYS_PRESETS = {
  pompon: { nom: 'Pompon', souplesse: 0.55, rebond: 0.75, ampleur: 0.05 },
  tissu: { nom: 'Tissu, cheveux', souplesse: 0.8, rebond: 0.3, ampleur: 0.08 },
  ressort: { nom: 'Ressort, antenne', souplesse: 0.35, rebond: 0.92, ampleur: 0.04 },
  gelee: { nom: 'Gelée', souplesse: 0.65, rebond: 0.85, ampleur: 0.03 },
};

const clamp01 = v => Math.min(1, Math.max(0, +v || 0));

export function normalizeZone(z) {
  const c = Array.isArray(z?.centre) ? z.centre.slice(0, 3).map(v => +v || 0) : [0, 0, 0];
  while (c.length < 3) c.push(0);
  const peint = Array.isArray(z?.peint) ? z.peint.map(v => Math.max(0, Math.round(+v || 0))) : [];
  if (peint.length % 2) peint.pop();
  let sum = 0;
  for (let i = 0; i < peint.length; i++) sum = (sum * 31 + peint[i]) % 1000000007;
  const forme = z?.forme === 'peinte' ? 'peinte' : 'boule';
  const out = {
    id: String(z?.id || ''),
    nom: String(z?.nom || 'Physique'),
    cible: z?.cible === undefined ? 'mii' : String(z.cible || ''),
    mii: String(z?.mii || ''),
    mesh: Math.max(0, Math.floor(+z?.mesh || 0)),
    meshNom: String(z?.meshNom || ''),
    forme,
    centre: c,
    rayon: Math.min(0.5, Math.max(0.005, +z?.rayon || 0.04)),
    peint,
    nv: Math.max(0, Math.floor(+z?.nv || 0)),
    souplesse: z?.souplesse === undefined ? 0.55 : clamp01(z.souplesse),
    rebond: z?.rebond === undefined ? 0.75 : clamp01(z.rebond),
    ampleur: Math.min(0.3, Math.max(0.005, +z?.ampleur || 0.05)),
    actif: z?.actif !== false,
  };
  out.sig = forme === 'peinte' ? `p${out.nv}:${peint.length}:${sum}` : `b${c.join(',')}:${out.rayon}`;
  return out;
}

export function meshesOf(root) {
  const out = [];
  root?.traverse(o => { if (o.isMesh && !o.userData.noPhys) out.push(o); });
  return out;
}

export function findMesh(list, index, name) {
  if (list[index] && (!name || list[index].name === name)) return list[index];
  return (name && list.find(m => m.name === name)) || list[index] || null;
}

export function decodePaint(def, count) {
  const w = new Float32Array(count);
  if (def.nv && def.nv !== count) return w;
  for (let i = 0; i + 1 < def.peint.length; i += 2) if (def.peint[i] < count) w[def.peint[i]] = Math.min(1, def.peint[i + 1] / 100);
  return w;
}

export function encodePaint(w) {
  const out = [];
  for (let i = 0; i < w.length; i++) if (w[i] > 0.005) out.push(i, Math.max(1, Math.round(w[i] * 100)));
  return out;
}

export function sphereWeights(geo, centre, radius) {
  const pos = geo.attributes.position, w = new Float32Array(pos.count);
  const r0 = radius * 0.4;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i) - centre[0], pos.getY(i) - centre[1], pos.getZ(i) - centre[2]);
    w[i] = d <= r0 ? 1 : d >= radius ? 0 : 1 - THREE.MathUtils.smoothstep(d, r0, radius);
  }
  return w;
}

function patchMesh(mesh, own) {
  if (mesh.userData.jig) return mesh.userData.jig;
  if (own) mesh.geometry = mesh.geometry.clone();
  const geo = mesh.geometry;
  const J = {
    d: Array.from({ length: MAX }, () => new THREE.Vector3()),
    col: Array.from({ length: MAX }, () => new THREE.Color()),
    show: { value: new THREE.Vector4() },
    attr: new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 4), 4),
    sig: '',
    slots: [],
  };
  geo.setAttribute('jigW', J.attr);
  const patch = m => {
    if (!m) return m;
    const c = m.userData.jig && m.userData.jig !== J ? m.clone() : m;
    const prev = c.userData.jig ? null : c.onBeforeCompile;
    const base = prev && prev !== THREE.Material.prototype.onBeforeCompile ? prev : null;
    c.userData.jig = J;
    c.needsUpdate = true;
    c.onBeforeCompile = (sh, r) => {
      base?.call(c, sh, r);
      sh.uniforms.uJigD = { value: J.d };
      sh.uniforms.uJigCol = { value: J.col };
      sh.uniforms.uJigShow = J.show;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec4 jigW;
uniform vec3 uJigD[${MAX}];
varying vec4 vJigW;`)
        .replace('#include <skinning_vertex>', `#include <skinning_vertex>
transformed += uJigD[0] * jigW.x + uJigD[1] * jigW.y + uJigD[2] * jigW.z + uJigD[3] * jigW.w;
vJigW = jigW;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform vec3 uJigCol[${MAX}];
uniform vec4 uJigShow;
varying vec4 vJigW;`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
vec4 jk = clamp(vJigW * uJigShow, 0.0, 1.0);
gl_FragColor.rgb = mix(gl_FragColor.rgb, uJigCol[0], jk.x);
gl_FragColor.rgb = mix(gl_FragColor.rgb, uJigCol[1], jk.y);
gl_FragColor.rgb = mix(gl_FragColor.rgb, uJigCol[2], jk.z);
gl_FragColor.rgb = mix(gl_FragColor.rgb, uJigCol[3], jk.w);`);
    };
    c.customProgramCacheKey = () => 'jiggleW' + MAX + (base ? base.toString() : '');
    return c;
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(patch) : patch(mesh.material);
  mesh.userData.jig = J;
  return J;
}

function nearestVertex(geo, c) {
  const pos = geo.attributes.position;
  let best = 0, bd = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - c.x, dy = pos.getY(i) - c.y, dz = pos.getZ(i) - c.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export class Jiggle {
  constructor(resolve) {
    this.resolve = resolve;
    this.defs = [];
    this.rt = new Map();
    this.meshes = new Set();
    this.show = null;
    this.showAll = false;
    this.live = new Map();
  }

  setDefs(list) {
    this.defs = (Array.isArray(list) ? list : []).map(normalizeZone).filter(z => z.id);
    const ids = new Set(this.defs.map(z => z.id));
    for (const id of [...this.rt.keys()]) if (!ids.has(id)) this.rt.delete(id);
  }

  setLiveWeights(id, w) { if (w) this.live.set(id, w); else this.live.delete(id); for (const m of this.meshes) m.userData.jig.sig = ''; }

  meshOf(def) { return this.resolve(normalizeZone(def)); }

  anchorOf(r, out) {
    const mesh = r.mesh;
    if (mesh.isSkinnedMesh) { mesh.getVertexPosition(r.anchorIdx, out); return out.applyMatrix4(mesh.matrixWorld); }
    return out.copy(r.c).applyMatrix4(mesh.matrixWorld);
  }

  runtime(def) {
    const mesh = this.resolve(def);
    if (!mesh || !mesh.geometry?.attributes?.position) return null;
    let r = this.rt.get(def.id);
    const sig = def.centre.join(',');
    if (!r || r.mesh !== mesh || r.sig !== sig) {
      const c = new THREE.Vector3(...def.centre);
      r = { mesh, sig, c, anchorIdx: mesh.isSkinnedMesh ? nearestVertex(mesh.geometry, c) : 0,
        p: new THREE.Vector3(), v: new THREE.Vector3(), ready: false, kick: r?.kick || null };
      this.rt.set(def.id, r);
    }
    return r;
  }

  isShown(mesh) {
    for (let o = mesh; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  weightsFor(def, mesh, H) {
    const live = this.live.get(def.id);
    const count = mesh.geometry.attributes.position.count;
    if (live && live.length === count) return live;
    if (def.forme === 'peinte') return decodePaint(def, count);
    const s = mesh.matrixWorld.getMaxScaleOnAxis() || 1;
    return sphereWeights(mesh.geometry, def.centre, (def.rayon * H) / s);
  }

  update(dt, H) {
    const groups = new Map();
    for (const def of this.defs) {
      if (!def.actif && def.id !== this.show && !this.showAll) continue;
      const r = this.runtime(def);
      if (!r || !this.isShown(r.mesh)) continue;
      let g = groups.get(r.mesh);
      if (!g) groups.set(r.mesh, g = []);
      if (g.length < MAX) g.push([def, r]);
    }
    for (const m of this.meshes) if (!groups.has(m)) { const J = m.userData.jig; for (const v of J.d) v.set(0, 0, 0); J.show.value.set(0, 0, 0, 0); }
    if (!groups.size) return;
    dt = Math.min(dt, 0.1);
    for (const [mesh, list] of groups) {
      const J = patchMesh(mesh, !this.resolve.isMii?.(mesh));
      this.meshes.add(mesh);
      mesh.updateWorldMatrix(true, false);
      const sig = list.map(([d]) => d.id + d.sig + (this.live.has(d.id) ? '*' : '')).join('|') + '#' + H.toFixed(4);
      if (sig !== J.sig || list.some(([d]) => this.live.has(d.id))) {
        const arr = J.attr.array;
        arr.fill(0);
        list.forEach(([def], c) => { const w = this.weightsFor(def, mesh, H); for (let i = 0; i < w.length; i++) arr[i * 4 + c] = w[i]; });
        J.attr.needsUpdate = true;
        J.sig = sig;
      }
      const show = [0, 0, 0, 0];
      _m3.setFromMatrix4(mesh.matrixWorld).invert();
      for (let c = 0; c < MAX; c++) {
        const item = list[c];
        if (!item) { J.d[c].set(0, 0, 0); continue; }
        const [def, r] = item;
        J.col[c].copy(def.id === this.show ? SHOW_SEL : SHOW_OTHER);
        show[c] = def.id === this.show ? 0.75 : this.showAll ? 0.35 : 0;
        if (!def.actif) { J.d[c].set(0, 0, 0); continue; }
        this.anchorOf(r, _a);
        const lim = def.ampleur * H;
        if (!r.ready || r.p.distanceTo(_a) > H * 2) { r.p.copy(_a); r.v.set(0, 0, 0); r.ready = true; }
        if (r.kick) { r.v.add(r.kick.multiplyScalar(H)); r.kick = null; }
        const k = 10 + 260 * (1 - def.souplesse) ** 2;
        const damp = 2 * Math.sqrt(k) * (0.04 + 0.96 * (1 - def.rebond) ** 1.5);
        const steps = Math.max(1, Math.ceil(dt / STEP)), h = dt / steps;
        for (let i = 0; i < steps; i++) {
          _d.copy(_a).sub(r.p).multiplyScalar(k).addScaledVector(r.v, -damp);
          r.v.addScaledVector(_d, h);
          r.p.addScaledVector(r.v, h);
        }
        _d.copy(r.p).sub(_a);
        if (_d.length() > lim) { _d.setLength(lim); r.p.copy(_a).add(_d); }
        J.d[c].copy(_d.applyMatrix3(_m3));
      }
      J.show.value.set(...show);
    }
  }

  kick(id, strength = 1.6) {
    for (const def of this.defs) {
      if (id && def.id !== id) continue;
      const r = this.rt.get(def.id);
      if (!r) continue;
      const a = Math.random() * Math.PI * 2;
      r.kick = new THREE.Vector3(Math.cos(a), 0.35 + Math.random() * 0.3, Math.sin(a)).multiplyScalar(strength);
    }
  }

  zoneWorld(id, H) {
    const def = this.defs.find(z => z.id === id);
    const r = def && this.runtime(def);
    if (!r) return null;
    r.mesh.updateWorldMatrix(true, false);
    return { center: this.anchorOf(r, _p.clone()), radius: def.rayon * H, mesh: r.mesh, forme: def.forme };
  }
}
