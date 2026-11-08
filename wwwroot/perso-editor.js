import * as THREE from 'three';
import { SHAPES, TEXTURES } from './scene-objects.js';
import { Gizmo } from './gizmo.js';
import { PHYS_PRESETS, normalizeZone, decodePaint, encodePaint, sphereWeights } from './physics.js';
import { pageTabs, onLeavePage } from './editor-pages.js';

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

const R = [0.3, 0.3, 0.42];
const TEMPLATES = {
  coucou: { nom: 'Coucou', cles: [
    { t: 0, mainD: R },
    { t: 0.35, mainD: [0.6, 0.72, 0.3], tete: [8, -4, 6] },
    { t: 0.6, mainD: [0.85, 0.55, 0.3], tete: [8, -4, 6] },
    { t: 0.85, mainD: [0.45, 0.78, 0.3], tete: [8, -4, 6] },
    { t: 1.1, mainD: [0.85, 0.55, 0.3], tete: [8, -4, 6] },
    { t: 1.35, mainD: [0.45, 0.78, 0.3], tete: [8, -4, 6] },
    { t: 1.6, mainD: [0.65, 0.7, 0.3], tete: [8, -4, 6] },
    { t: 1.9, mainD: R },
  ] },
  victoire: { nom: 'Victoire', cles: [
    { t: 0, mainG: R, mainD: R },
    { t: 0.3, mainG: [0.3, 0.95, 0.05], mainD: [0.3, 0.95, 0.05], tete: [0, -15, 0], buste: [-5, 0] },
    { t: 0.55, mainG: [0.38, 0.86, 0.05], mainD: [0.38, 0.86, 0.05], tete: [0, -12, 0], buste: [-2, 0] },
    { t: 0.8, mainG: [0.3, 0.95, 0.05], mainD: [0.3, 0.95, 0.05], tete: [0, -15, 0], buste: [-5, 0] },
    { t: 1.05, mainG: [0.38, 0.86, 0.05], mainD: [0.38, 0.86, 0.05], tete: [0, -12, 0], buste: [-2, 0] },
    { t: 1.4, mainG: R, mainD: R },
  ] },
  oui: { nom: 'Oui de la tête', cles: [
    { t: 0 }, { t: 0.2, tete: [0, 14, 0] }, { t: 0.4, tete: [0, -6, 0] }, { t: 0.6, tete: [0, 14, 0] }, { t: 0.8, tete: [0, -6, 0] }, { t: 1 },
  ] },
  non: { nom: 'Non de la tête', cles: [
    { t: 0 }, { t: 0.2, tete: [22, 0, 0] }, { t: 0.45, tete: [-22, 0, 0] }, { t: 0.7, tete: [22, 0, 0] }, { t: 0.95, tete: [-22, 0, 0] }, { t: 1.15 },
  ] },
  applaudir: { nom: 'Applaudir', cles: [
    { t: 0, mainG: R, mainD: R },
    ...[0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 1.1].map((t, i) => {
      const p = i % 2 ? [-0.22, 0.28, 0.58] : [0.08, 0.3, 0.58];
      return { t, mainG: p, mainD: p, tete: [0, -4, 0] };
    }),
    { t: 1.35, mainG: R, mainD: R },
  ] },
  danse: { nom: 'Danse', cles: [
    { t: 0, mainG: R, mainD: R },
    ...[0.3, 0.6, 0.9, 1.2].map((t, i) => {
      const up = [0.35, 0.9, 0.1], low = [0.55, 0.05, 0.3], s = i % 2 ? 1 : -1;
      return { t, mainG: i % 2 ? low : up, mainD: i % 2 ? up : low, buste: [0, 8 * s], tete: [0, 0, 8 * s] };
    }),
    { t: 1.55, mainG: R, mainD: R },
  ] },
  bof: { nom: 'Je sais pas', cles: [
    { t: 0, mainG: R, mainD: R },
    { t: 0.3, mainG: [0.58, 0.08, 0.35], mainD: [0.58, 0.08, 0.35], tete: [0, -3, 12] },
    { t: 0.95, mainG: [0.6, 0.1, 0.35], mainD: [0.6, 0.1, 0.35], tete: [0, -3, 12] },
    { t: 1.3, mainG: R, mainD: R },
  ] },
};
const TEMPLATE_LIST = Object.entries(TEMPLATES).map(([k, v]) => [k, v.nom]);

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

  let selected = data.items.find(i => i.type !== 'animation')?.id || null;
  const sel = () => data.items.find(i => i.id === selected) || null;
  let saveTimer = null;
  let savePending = false;
  const save = () => {
    mii.applyCharacter(data);
    clearTimeout(saveTimer);
    savePending = true;
    saveTimer = setTimeout(() => { savePending = false; host?.postMessage({ type: 'savePerso', data }); setStatus('✓ Enregistré'); }, 300);
  };
  onLeavePage(() => { if (savePending) { clearTimeout(saveTimer); savePending = false; host?.postMessage({ type: 'savePerso', data }); } });
  let tab = 'apparence', akey = 0, playStart = 0;
  const isAnim = it => it?.type === 'animation';
  const setPreview = () => {
    if (tab === 'physique') { char.preview = null; char.animPreview = null; return; }
    const it = sel();
    char.preview = isAnim(it) ? null : selected;
    if (!isAnim(it) || tab !== 'animations') char.animPreview = null;
    else if (playStart) char.animPreview = { item: it, mode: 'play', start: playStart };
    else char.animPreview = { item: it, mode: 'pose', t: it.cles?.[akey]?.t ?? 0 };
  };
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

  const { scene } = mii;
  const r3 = v => Math.round(v * 1000) / 1000;
  const anchorQ = it => {
    const a = rig.anchors?.[it.point] || rig.anchors?.tete;
    return a ? a.bone.getWorldQuaternion(new THREE.Quaternion()).multiply(a.restInv) : new THREE.Quaternion();
  };
  const rotQ = r => new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r || [0, 0, 0]).map(v => THREE.MathUtils.degToRad(+v || 0)), 'YXZ'));
  let gStart = null;
  const objGizmo = new Gizmo({
    scene, camera, canvas,
    onStart: () => { const it = sel(); gStart = it && { pos: [...(it.pos || [0, 0, 0])], rot: [...(it.rot || [0, 0, 0])], taille: +it.taille || 0.15, aq: anchorQ(it) }; },
    onChange: ev => {
      const it = sel();
      if (!it || !gStart || it.type !== 'objet') return;
      const inv = gStart.aq.clone().invert();
      if (ev.kind === 'move') {
        const d = ev.delta.clone().applyQuaternion(inv).divideScalar(H);
        it.pos = gStart.pos.map((v, k) => r3(v + [d.x, d.y, d.z][k]));
      } else if (ev.kind === 'rotate') {
        const q = inv.clone().multiply(new THREE.Quaternion().setFromAxisAngle(ev.worldAxis, ev.angle)).multiply(gStart.aq).multiply(rotQ(gStart.rot));
        const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
        it.rot = [e.x, e.y, e.z].map(r => Math.round(THREE.MathUtils.radToDeg(r)));
      } else if (ev.kind === 'scale') it.taille = r3(Math.max(0.005, gStart.taille * ev.factor));
      mii.applyCharacter(data);
      syncObjectFields(it);
    },
    onEnd: () => { gStart = null; save(); },
  });
  objGizmo.setModes({ center: true });
  objGizmo.setTarget(() => {
    const it = sel();
    if (!it || it.type !== 'objet' || tab !== 'apparence') return null;
    const o = char.objs.get(it.id);
    if (!o || !o.group.visible) return null;
    return { position: o.group.getWorldPosition(V()), quaternion: o.group.getWorldQuaternion(new THREE.Quaternion()) };
  });
  function syncObjectFields(it) {
    for (const inp of right.querySelectorAll('[data-v3]')) {
      const v = (it[inp.dataset.v3] || [0, 0, 0])[+inp.dataset.i];
      inp.value = inp.type === 'number' ? fmt(v) : v;
    }
    for (const inp of right.querySelectorAll('[data-f="taille"]')) inp.value = inp.type === 'number' ? fmt(+it.taille) : +it.taille;
  }

  const handFrame = side => {
    const it = sel(), k = isAnim(it) && tab === 'animations' && !playStart ? it.cles?.[akey] : null;
    const v = k?.[side];
    const arm = rig.arms?.[side === 'mainG' ? 'L' : 'R'];
    if (!v || !arm) return null;
    const rq = rig.root.getWorldQuaternion(new THREE.Quaternion());
    const sgn = side === 'mainG' ? -1 : 1;
    return { position: arm.upper.getWorldPosition(V()).add(V(sgn * v[0], v[1], v[2]).multiplyScalar(rig.unit).applyQuaternion(rq)), quaternion: rq, scale: 0.7 };
  };
  const handGizmos = ['mainG', 'mainD'].map(side => {
    let start = null;
    const gz = new Gizmo({
      scene, camera, canvas,
      onStart: () => { const k = sel()?.cles?.[akey]; start = k?.[side] ? [...k[side]] : null; },
      onChange: ev => {
        const k = sel()?.cles?.[akey];
        if (!k || !start || ev.kind !== 'move') return;
        const rq = rig.root.getWorldQuaternion(new THREE.Quaternion()).invert();
        const d = ev.delta.clone().applyQuaternion(rq).divideScalar(rig.unit);
        const sgn = side === 'mainG' ? -1 : 1;
        k[side] = [r3(start[0] + sgn * d.x), r3(start[1] + d.y), r3(start[2] + d.z)];
        setPreview();
        for (const inp of right.querySelectorAll(`[data-ah="${side}"]`)) {
          const v = k[side][+inp.dataset.i];
          inp.value = inp.type === 'number' ? fmt(v) : v;
        }
      },
      onEnd: () => { start = null; save(); },
    });
    gz.setModes({ rotate: false, scale: false });
    gz.setTarget(() => handFrame(side));
    return gz;
  });
  data.physique = Array.isArray(data.physique) ? data.physique : [];
  let physSel = data.physique.find(z => z.cible !== 'mii' || z.mii === lists.mii)?.id || null;
  let picking = null, pStart = null, lastPreset = 'pompon';
  let tool = null, brush = 0.03, stroke = null;
  const paintW = new Map(), paintUndo = [];
  const zsel = () => data.physique.find(z => z.id === physSel) || null;
  const zoneBall = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, wireframe: true, transparent: true, opacity: 0.35, depthTest: false }));
  zoneBall.renderOrder = 998;
  zoneBall.userData.noPhys = true;
  zoneBall.visible = false;
  scene.add(zoneBall);
  const brushBall = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.5, depthTest: false }));
  brushBall.renderOrder = 999;
  brushBall.userData.noPhys = true;
  brushBall.visible = false;
  scene.add(brushBall);
  const painting = () => tab === 'physique' && !!tool && zsel()?.forme === 'peinte';
  const zoneFrame = () => {
    const z = zsel();
    if (tab !== 'physique' || !z || picking || z.forme === 'peinte') return null;
    return mii.jiggle.zoneWorld(z.id, H);
  };
  (function tickZone() {
    const w = zoneFrame();
    zoneBall.visible = !!w;
    if (w) { zoneBall.position.copy(w.center); zoneBall.scale.setScalar(w.radius); }
    mii.jiggle.show = tab === 'physique' ? physSel : null;
    mii.jiggle.showAll = tab === 'physique';
    if (!painting()) brushBall.visible = false;
    requestAnimationFrame(tickZone);
  })();
  const r5 = v => Math.round(v * 100000) / 100000;
  const physGizmo = new Gizmo({
    scene, camera, canvas,
    onStart: () => {
      const z = zsel(), w = zoneFrame();
      pStart = z && w && { centre: z.centre.slice(), rayon: z.rayon, inv: new THREE.Matrix3().setFromMatrix4(w.mesh.matrixWorld).invert() };
    },
    onChange: ev => {
      const z = zsel();
      if (!z || !pStart) return;
      if (ev.kind === 'move') {
        const d = ev.delta.clone().applyMatrix3(pStart.inv);
        z.centre = pStart.centre.map((v, k) => r5(v + [d.x, d.y, d.z][k]));
      } else if (ev.kind === 'scale') z.rayon = r3(Math.min(0.3, Math.max(0.005, pStart.rayon * ev.factor)));
      mii.jiggle.setDefs(data.physique);
      syncPhysFields(z);
    },
    onEnd: () => { pStart = null; save(); },
  });
  physGizmo.setModes({ rotate: false, center: false });
  physGizmo.setTarget(() => { const w = zoneFrame(); return w && { position: w.center, quaternion: new THREE.Quaternion(), scale: 0.6 }; });
  const gizmos = [objGizmo, ...handGizmos, physGizmo];

  const ray = new THREE.Raycaster();
  function castAt(e, only) {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    let targets = mii.physTargets();
    if (only) targets = targets.filter(t => t.mesh === only);
    const hits = ray.intersectObjects(targets.map(t => t.mesh), false);
    const matOf = h => Array.isArray(h.object.material) ? h.object.material[h.face?.materialIndex || 0] : h.object.material;
    const solid = h => { const m = matOf(h); return m && m.visible !== false && !m.transparent && !(m.alphaTest > 0); };
    const hit = only ? hits[0] : hits.find(solid) || hits[0];
    return hit ? { hit, t: targets.find(x => x.mesh === hit.object) } : null;
  }
  function restPoint(hit) {
    const mesh = hit.object;
    const local = mesh.worldToLocal(hit.point.clone());
    if (!mesh.isSkinnedMesh || !hit.face) return local;
    const pa = mesh.getVertexPosition(hit.face.a, V()), pb = mesh.getVertexPosition(hit.face.b, V()), pc = mesh.getVertexPosition(hit.face.c, V());
    const bc = new THREE.Triangle(pa, pb, pc).getBarycoord(local, V());
    const pos = mesh.geometry.attributes.position;
    const ra = V().fromBufferAttribute(pos, hit.face.a), rb = V().fromBufferAttribute(pos, hit.face.b), rc = V().fromBufferAttribute(pos, hit.face.c);
    return ra.multiplyScalar(bc.x).addScaledVector(rb, bc.y).addScaledVector(rc, bc.z);
  }
  const targetOf = t => ({ cible: t.cible, mii: t.cible === 'mii' ? lists.mii : '', mesh: t.index, meshNom: t.mesh.name || '' });
  function physPick(e) {
    if (!picking) return false;
    const c = castAt(e);
    if (!c) { setStatus('Rien ici : cliquez sur le Mii ou sur un objet accroché'); return true; }
    const place = { ...targetOf(c.t), centre: restPoint(c.hit).toArray().map(r5) };
    const mode = picking.mode, src = data.physique.find(z => z.id === picking.id);
    picking = null;
    canvas.style.cursor = '';
    let z;
    if (mode === 'move' && src) z = Object.assign(src, place);
    else {
      const p = PHYS_PRESETS[lastPreset] || PHYS_PRESETS.pompon;
      const base = mode === 'dup' && src ? src : { ...p, rayon: 0.045 };
      const n = data.physique.length + 1;
      const nom = (mode === 'dup' && src ? src.nom.replace(/\s*\d+$/, '') : p.nom) + ' ' + n;
      z = { id: newId(), nom, forme: 'boule', rayon: base.rayon, souplesse: base.souplesse, rebond: base.rebond, ampleur: base.ampleur, actif: true, ...place };
      data.physique.push(z);
    }
    physSel = z.id;
    save();
    setTimeout(() => mii.jiggle.kick(z.id), 150);
    setStatus('✓ Placé : ajustez la taille de la boule, puis 🫨 Secouer');
    renderLeft(); renderRight();
    return true;
  }

  const zoneMesh = z => (z.forme === 'peinte' && !z.cible) ? null : mii.jiggle.meshOf(z);
  function weightsOf(z, mesh) {
    const n = mesh.geometry.attributes.position.count;
    let w = paintW.get(z.id);
    if (w && w.length === n) return w;
    const def = normalizeZone(z);
    w = def.forme === 'peinte' ? decodePaint(def, n)
      : sphereWeights(mesh.geometry, def.centre, (def.rayon * H) / (mesh.matrixWorld.getMaxScaleOnAxis() || 1));
    paintW.set(z.id, w);
    return w;
  }
  function commitPaint(z, mesh, final) {
    const w = paintW.get(z.id);
    if (!w) return;
    if (!final) { mii.jiggle.setLiveWeights(z.id, w); return; }
    const pos = mesh.geometry.attributes.position;
    let sx = 0, sy = 0, sz = 0, s = 0;
    for (let i = 0; i < w.length; i++) if (w[i] > 0) { sx += pos.getX(i) * w[i]; sy += pos.getY(i) * w[i]; sz += pos.getZ(i) * w[i]; s += w[i]; }
    if (s > 0) z.centre = [sx / s, sy / s, sz / s].map(r5);
    z.peint = encodePaint(w);
    z.nv = w.length;
    mii.jiggle.setLiveWeights(z.id, null);
    mii.jiggle.setDefs(data.physique);
    save();
  }
  function pushUndo(z) {
    const w = paintW.get(z.id);
    paintUndo.push({ id: z.id, w: w ? w.slice() : null, target: { cible: z.cible, mii: z.mii, mesh: z.mesh, meshNom: z.meshNom } });
    if (paintUndo.length > 30) paintUndo.shift();
  }
  function undoPaint() {
    const u = paintUndo.pop(), z = u && data.physique.find(x => x.id === u.id);
    if (!z) return;
    Object.assign(z, u.target);
    if (u.w) paintW.set(z.id, u.w); else paintW.delete(z.id);
    const mesh = zoneMesh(z);
    if (mesh && u.w) commitPaint(z, mesh, true);
    else { z.peint = []; z.nv = 0; mii.jiggle.setLiveWeights(z.id, null); mii.jiggle.setDefs(data.physique); save(); }
    setStatus('↶ Annulé');
    renderRight();
  }
  function brushAt(z, mesh, rest, erase) {
    const w = weightsOf(z, mesh), pos = mesh.geometry.attributes.position;
    const r = (brush * H) / (mesh.matrixWorld.getMaxScaleOnAxis() || 1), r0 = r * 0.5;
    for (let i = 0; i < w.length; i++) {
      const d = Math.hypot(pos.getX(i) - rest.x, pos.getY(i) - rest.y, pos.getZ(i) - rest.z);
      if (d >= r) continue;
      const f = d <= r0 ? 1 : 1 - THREE.MathUtils.smoothstep(d, r0, r);
      w[i] = erase ? Math.min(w[i], 1 - f) : Math.max(w[i], f);
    }
  }
  const islandCache = new WeakMap();
  function islandsOf(geo) {
    if (islandCache.has(geo)) return islandCache.get(geo);
    const pos = geo.attributes.position, n = pos.count;
    const rep = new Int32Array(n), seen = new Map();
    for (let i = 0; i < n; i++) {
      const k = Math.round(pos.getX(i) * 1e4) + ',' + Math.round(pos.getY(i) * 1e4) + ',' + Math.round(pos.getZ(i) * 1e4);
      if (!seen.has(k)) seen.set(k, i);
      rep[i] = seen.get(k);
    }
    const par = Int32Array.from({ length: n }, (_, i) => i);
    const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const join = (a, b) => { a = find(rep[a]); b = find(rep[b]); if (a !== b) par[a] = b; };
    const idx = geo.index;
    const tri = idx ? idx.count / 3 : n / 3;
    for (let t = 0; t < tri; t++) {
      const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      join(a, b); join(b, c);
    }
    const label = new Int32Array(n);
    for (let i = 0; i < n; i++) label[i] = find(rep[i]);
    islandCache.set(geo, label);
    return label;
  }
  function fillAt(z, mesh, hit, erase) {
    const w = weightsOf(z, mesh), label = islandsOf(mesh.geometry);
    const id = label[hit.face ? hit.face.a : 0];
    const pos = mesh.geometry.attributes.position;
    let count = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < w.length; i++) if (label[i] === id) { w[i] = erase ? 0 : 1; count++; cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i); }
    if (erase || !count) return count;
    cx /= count; cy /= count; cz /= count;
    let R = 0;
    for (let i = 0; i < w.length; i++) if (label[i] === id) R = Math.max(R, Math.hypot(pos.getX(i) - cx, pos.getY(i) - cy, pos.getZ(i) - cz));
    for (let i = 0; i < w.length; i++) {
      if (label[i] === id) continue;
      const d = Math.hypot(pos.getX(i) - cx, pos.getY(i) - cy, pos.getZ(i) - cz);
      if (d < R * 2.4) w[i] = Math.max(w[i], 1 - THREE.MathUtils.smoothstep(d, R * 0.9, R * 2.4));
    }
    return count;
  }
  function moveBrush(e) {
    if (!painting()) return null;
    const z = zsel(), mesh = zoneMesh(z);
    const c = castAt(e, mesh);
    brushBall.visible = !!c && tool !== 'remplir';
    if (c) { brushBall.position.copy(c.hit.point); brushBall.scale.setScalar(brush * H); }
    return c;
  }
  function physPaintDown(e) {
    if (e.button !== 0 || !painting()) return false;
    const z = zsel();
    let mesh = zoneMesh(z);
    const c = castAt(e, mesh);
    if (!c) return false;
    pushUndo(z);
    if (!mesh) {
      Object.assign(z, targetOf(c.t));
      mesh = c.hit.object;
      paintW.delete(z.id);
      renderRight();
    }
    const erase = tool === 'gomme' || e.shiftKey;
    if (tool === 'remplir') {
      const n = fillAt(z, mesh, c.hit, erase);
      commitPaint(z, mesh, true);
      setStatus(erase ? '🪣 Pièce effacée' : `🪣 Pièce coloriée (${n} points)`);
      setTimeout(() => mii.jiggle.kick(z.id), 120);
      renderRight();
      return true;
    }
    brushAt(z, mesh, restPoint(c.hit), erase);
    commitPaint(z, mesh, false);
    stroke = { z, mesh, erase };
    return true;
  }
  function physPaintMove(e) {
    const c = moveBrush(e);
    if (!stroke) return false;
    if (c) { brushAt(stroke.z, stroke.mesh, restPoint(c.hit), stroke.erase || e.shiftKey); commitPaint(stroke.z, stroke.mesh, false); }
    return true;
  }
  function physPaintUp() {
    if (!stroke) return;
    const { z, mesh } = stroke;
    stroke = null;
    commitPaint(z, mesh, true);
    setStatus('✓ Colorié : 🫨 Secouer pour voir');
    renderRight();
  }
  function setForme(z, forme) {
    if (z.forme === forme || (forme === 'boule' && !z.forme)) return;
    const mesh = zoneMesh(z);
    if (forme === 'peinte') {
      z.forme = 'peinte';
      if (mesh) {
        const def = normalizeZone({ ...z, forme: 'boule' });
        paintW.set(z.id, sphereWeights(mesh.geometry, def.centre, (def.rayon * H) / (mesh.matrixWorld.getMaxScaleOnAxis() || 1)));
        commitPaint(z, mesh, true);
      } else { z.peint = []; z.nv = 0; }
      tool = 'pinceau';
    } else {
      z.forme = 'boule';
      tool = null;
      if (!z.cible) Object.assign(z, { cible: 'mii', mii: lists.mii });
    }
    paintW.delete(z.id);
    mii.jiggle.setDefs(data.physique);
    save();
  }
  function newPaintedZone(from) {
    const p = from || PHYS_PRESETS[lastPreset] || PHYS_PRESETS.pompon;
    const n = data.physique.length + 1;
    const z = { id: newId(), nom: (from ? from.nom.replace(/\s*\d+$/, '') : p.nom) + ' ' + n, forme: 'peinte', cible: '', mii: '', mesh: 0, meshNom: '',
      centre: [0, 0, 0], rayon: 0.045, peint: [], nv: 0, souplesse: p.souplesse, rebond: p.rebond, ampleur: p.ampleur, actif: true };
    data.physique.push(z);
    physSel = z.id; tool = 'pinceau';
    save();
    setStatus('🖌 Coloriez la partie qui doit bouger');
    renderLeft(); renderRight();
  }

  function startPick(mode, id) {
    picking = { mode, id };
    tool = null;
    canvas.style.cursor = 'crosshair';
    setStatus(mode === 'move' ? 'Cliquez sur le nouvel endroit' : 'Cliquez sur la partie qui doit bouger (ex. un pompon)');
    renderRight();
  }
  function stopPick() { picking = null; canvas.style.cursor = ''; setStatus(''); }
  function syncPhysFields(z) {
    for (const inp of right.querySelectorAll('[data-pf]')) {
      if (inp.dataset.pf === 'nom') continue;
      const v = +z[inp.dataset.pf];
      inp.value = inp.type === 'number' ? fmt(v) : v;
    }
  }
  const physOfMii = z => z.cible !== 'mii' || !z.mii || z.mii === lists.mii;
  const zoneTarget = z => {
    if (!z.cible) return 'pas encore coloriée';
    if (z.cible === 'mii') return `${lists.mii.replace(/\.(glb|gltf|fbx|obj|dae|3mf|stl|ply|zip)$/i, '')}${z.meshNom ? ' · pièce « ' + z.meshNom + ' »' : ''}`;
    const o = data.items.find(i => i.id === z.cible);
    return o ? '🎩 ' + (o.nom || 'Objet') : '⚠ objet supprimé';
  };
  function physLeft() {
    const zones = data.physique.filter(physOfMii);
    const other = data.physique.length - zones.length;
    left.innerHTML = `<h3>Ajouter de la physique</h3>
      <div class="row"><label>Genre</label><select id="cePhysType">${Object.entries(PHYS_PRESETS).map(([k, p]) => `<option value="${k}" ${k === lastPreset ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}</select></div>
      <div class="grid2"><button data-padd class="primary" title="Cliquez ensuite sur la partie qui doit bouger : une boule délimite la zone">🎈 Boule</button><button data-paint class="primary" title="Coloriez ensuite la partie qui doit bouger, comme les pièces des manettes">🖌 À colorier</button></div>
      <p class="muted"><b>🎈 Boule</b> : un clic sur la partie qui doit bouger (un pompon, une antenne…). <b>🖌 À colorier</b> : vous coloriez exactement ce qui bouge, au pinceau ou d'un coup avec 🪣.</p>
      <h3>Parties qui bougent</h3>
      <div class="items">${zones.map(z => `<div class="it ${z.id === physSel ? 'sel' : ''}" data-pid="${esc(z.id)}"><span>${z.forme === 'peinte' ? '🖌' : '🎈'}</span><span class="n">${esc(z.nom)}</span>
        <button class="sw ${z.actif !== false ? 'on' : ''}" data-pon="${esc(z.id)}" title="Activer / désactiver"></button></div>`).join('') || '<div class="muted">Aucune pour l\'instant.</div>'}</div>
      ${zones.length ? '<button data-pkick style="width:100%;margin-top:8px">🫨 Tout secouer</button>' : ''}
      ${other ? `<p class="muted">${other} autre${other > 1 ? 's' : ''} pour d'autres Mii.</p>` : ''}
      <p class="muted">En jaune sur le modèle : ce que la partie choisie fait bouger ; en bleu : les autres. Pour un objet accroché, activez-le d'abord ou cliquez 👁 Tout montrer.</p>`;
  }
  function physRight() {
    const z = zsel();
    if (picking) {
      right.innerHTML = `<h3>🎈 Physique</h3><p class="warn">👆 ${picking.mode === 'move' ? 'Cliquez sur le nouvel endroit, sur le Mii ou un objet accroché.' : 'Cliquez sur la partie qui doit bouger, sur le Mii ou un objet accroché.'}</p>
        <p class="muted">Glissez à côté du Mii pour tourner autour si besoin. Échap : annuler.</p><button data-px="cancel">Annuler</button>`;
      return;
    }
    if (!z || !physOfMii(z)) {
      right.innerHTML = `<h3>🎈 Physique</h3><p class="muted">Choisissez le genre à gauche (Pompon, Tissu…), puis <b>🎈 Boule</b> (un clic sur la partie) ou <b>🖌 À colorier</b> (vous coloriez ce qui bouge).</p>`;
      return;
    }
    const sl = (lbl, f, min, max, step) => `<div class="sl"><span>${lbl}</span><input type="range" data-pf="${f}" min="${min}" max="${max}" step="${step}" value="${+z[f]}"><input type="number" data-pf="${f}" min="${min}" max="${max}" step="${step}" value="${fmt(+z[f])}"></div>`;
    const cur = Object.entries(PHYS_PRESETS).find(([, p]) => p.souplesse === z.souplesse && p.rebond === z.rebond && p.ampleur === z.ampleur)?.[0];
    const peinte = z.forme === 'peinte';
    const tools = { pinceau: '🖌 Pinceau', gomme: '🧽 Gomme', remplir: '🪣 Remplir une pièce' };
    const zone = peinte ? `
      <div class="seg" data-ptool>${Object.entries(tools).map(([k, t]) => `<button data-v="${k}" class="${tool === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="sl"><span>Pinceau</span><input type="range" data-pb min="0.005" max="0.15" step="0.005" value="${brush}"><input type="number" data-pb min="0.005" max="0.15" step="0.005" value="${fmt(brush)}"></div>
      <div class="grid2"><button data-px="pundo" ${paintUndo.some(u => u.id === z.id) ? '' : 'disabled'} title="Ctrl+Z">↶ Annuler</button><button data-px="pclear" ${z.peint?.length ? '' : 'disabled'}>🗑 Tout effacer</button></div>
      ${z.cible ? '' : '<p class="warn">👆 Coloriez sur le Mii ou sur un objet accroché : la première touche choisit la pièce.</p>'}
      <p class="muted">Clic gauche : colorier ce qui doit bouger (en jaune). <b>Maj</b> + clic ou 🧽 : gommer. <b>🪣</b> colorie d'un coup une pièce détachée (un pompon séparé du chapeau…), avec un fondu sur ce qui la tient. Clic droit + glisser : tourner autour du Mii, molette : zoom.</p>
      <p class="muted">Une zone par partie (un pompon chacun : ⧉ Dupliquer) pour qu'elles bougent chacune de leur côté.</p>`
      : `${sl('Taille', 'rayon', 0.005, 0.3, 0.005)}
      <p class="muted">La boule délimite la zone : son cœur bouge d'un bloc, le bord se déforme en douceur. Flèches : la déplacer · boules : la grossir.</p>`;
    right.innerHTML = `<h3>🎈 Physique</h3>
      <div class="row"><label>Nom</label><input type="text" data-pf="nom" value="${esc(z.nom)}" maxlength="60"></div>
      <div class="row"><label>Sur</label><span>${esc(zoneTarget(z))}</span></div>
      <div class="grid2"><button data-px="kick" class="primary">🫨 Secouer</button>${peinte ? `<button data-px="look" class="${tool ? '' : 'on'}" title="Arrêter de colorier pour tourner librement">✋ Regarder</button>` : '<button data-px="move">📍 Replacer</button>'}</div>
      <h3>Zone qui bouge</h3>
      <div class="seg" data-pforme><button data-v="boule" class="${peinte ? '' : 'on'}">⚪ Boule</button><button data-v="peinte" class="${peinte ? 'on' : ''}">🖌 Coloriée</button></div>
      ${zone}
      <h3>Comportement</h3>
      <div class="seg" data-pseg>${Object.entries(PHYS_PRESETS).map(([k, p]) => `<button data-v="${k}" class="${cur === k ? 'on' : ''}">${esc(p.nom)}</button>`).join('')}</div>
      ${sl('Souplesse', 'souplesse', 0, 1, 0.01)}
      ${sl('Rebond', 'rebond', 0, 1, 0.01)}
      ${sl('Ampleur', 'ampleur', 0.005, 0.2, 0.005)}
      <p class="muted"><b>Souplesse</b> : raide à gauche, mou à droite. <b>Rebond</b> : s'arrête vite à gauche, ballotte longtemps à droite. <b>Ampleur</b> : jusqu'où ça peut partir.</p>
      <div class="row"><label>Activée</label><button class="sw ${z.actif !== false ? 'on' : ''}" data-pon="${esc(z.id)}"></button><span class="muted">fenêtre du Mii et OBS</span></div>
      <div class="grid2" style="margin-top:12px"><button data-px="dup" title="Mêmes réglages pour une autre partie (l'autre pompon…)">⧉ Dupliquer${peinte ? '' : ' et placer'}</button><button data-px="del" class="danger">🗑 Supprimer</button></div>`;
  }
  function physTogg(id) {
    const z = data.physique.find(x => x.id === id);
    if (!z) return;
    z.actif = z.actif === false;
    save(); renderLeft(); renderRight();
  }
  function onPhysLeft(e) {
    const on = e.target.closest('[data-pon]');
    if (on) { physTogg(on.dataset.pon); return; }
    if (e.target.closest('[data-padd]')) { lastPreset = left.querySelector('#cePhysType')?.value || lastPreset; startPick('new'); return; }
    if (e.target.closest('[data-paint]')) { lastPreset = left.querySelector('#cePhysType')?.value || lastPreset; stopPick(); newPaintedZone(); return; }
    if (e.target.closest('[data-pkick]')) { mii.jiggle.kick(null); return; }
    const row = e.target.closest('[data-pid]');
    if (row) {
      physSel = row.dataset.pid; stopPick();
      tool = zsel()?.forme === 'peinte' ? tool || 'pinceau' : null;
      renderLeft(); renderRight();
    }
  }
  function onPhysRight(e) {
    const z = zsel();
    const on = e.target.closest('[data-pon]');
    if (on) { physTogg(on.dataset.pon); return; }
    const pv = e.target.closest('[data-pseg] [data-v]');
    if (pv && z) {
      const p = PHYS_PRESETS[pv.dataset.v];
      Object.assign(z, { souplesse: p.souplesse, rebond: p.rebond, ampleur: p.ampleur });
      save(); renderRight(); setTimeout(() => mii.jiggle.kick(z.id), 50);
      return;
    }
    const pf = e.target.closest('[data-pforme] [data-v]');
    if (pf && z) { setForme(z, pf.dataset.v); renderLeft(); renderRight(); return; }
    const pt = e.target.closest('[data-ptool] [data-v]');
    if (pt && z) { tool = pt.dataset.v; renderRight(); return; }
    const x = e.target.closest('[data-px]')?.dataset.px;
    if (x === 'cancel') { stopPick(); renderRight(); }
    if (!z) return;
    if (x === 'kick') mii.jiggle.kick(z.id);
    if (x === 'move') startPick('move', z.id);
    if (x === 'look') { tool = tool ? null : 'pinceau'; renderRight(); }
    if (x === 'pundo') undoPaint();
    if (x === 'pclear' && confirm(`Effacer tout le coloriage de « ${z.nom} » ?`)) {
      pushUndo(z);
      const mesh = zoneMesh(z);
      if (mesh) { weightsOf(z, mesh).fill(0); commitPaint(z, mesh, true); }
      renderRight();
    }
    if (x === 'dup') { if (z.forme === 'peinte') newPaintedZone(z); else startPick('dup', z.id); }
    if (x === 'del' && confirm(`Supprimer « ${z.nom} » ?`)) {
      data.physique.splice(data.physique.indexOf(z), 1);
      paintW.delete(z.id);
      physSel = data.physique.find(physOfMii)?.id || null;
      tool = null;
      save(); renderLeft(); renderRight();
    }
  }
  function onPhysField(t, final) {
    if (t.dataset && 'pb' in t.dataset) {
      brush = Math.min(0.15, Math.max(0.005, +t.value || 0.03));
      syncPair(t, brush);
      return;
    }
    const z = zsel(), f = t.dataset?.pf;
    if (!z || !f) return;
    if (f === 'nom') { z.nom = t.value; save(); if (final) renderLeft(); return; }
    const v = +t.value || 0;
    z[f] = f === 'rayon' ? Math.min(0.3, Math.max(0.005, v)) : f === 'ampleur' ? Math.min(0.3, Math.max(0.005, v)) : Math.min(1, Math.max(0, v));
    syncPair(t, z[f]);
    save();
    if (final) { renderRight(); if (f !== 'rayon') mii.jiggle.kick(z.id); }
  }
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && (picking || tool)) { stopPick(); tool = null; renderRight(); }
    if (tab === 'physique' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest?.('input, select, textarea')) { e.preventDefault(); undoPaint(); }
  });

  let drag = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 0 && physPick(e)) return;
    if (physPaintDown(e)) return;
    if (e.button === 0 && gizmos.some(g => g.pointerDown(e))) return;
    drag = { x: e.clientX, y: e.clientY, pan: painting() ? e.button === 1 : e.button === 1 || e.button === 2 || e.shiftKey };
  });
  canvas.addEventListener('pointermove', e => {
    if (physPaintMove(e)) return;
    let busy = false;
    for (const g of gizmos) busy = g.pointerMove(e) || busy;
    if (busy) return;
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
  canvas.addEventListener('pointerup', () => { physPaintUp(); for (const g of gizmos) g.pointerUp(); drag = null; });
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
    #ceTop .tabs { display: flex; gap: 4px; margin-right: 10px; }
    #ceTime { left: 282px; right: 362px; bottom: 34px; display: flex; gap: 8px; align-items: center; padding: 8px 10px; }
    #ceTime .track { position: relative; flex: 1; height: 46px; border-radius: 8px; background: #15151b; border: 1px solid #3a3a48; cursor: copy; overflow: hidden; }
    #ceTime .tick { position: absolute; top: 0; bottom: 0; width: 1px; background: #2c2c38; pointer-events: none; }
    #ceTime .tick i { position: absolute; top: 2px; left: 3px; font-style: normal; font-size: 9.5px; color: #77778a; white-space: nowrap; }
    #ceTime .mk { position: absolute; top: 15px; width: 14px; height: 22px; margin-left: -7px; border-radius: 4px; background: #9b9bab; border: 1px solid #000; cursor: ew-resize; }
    #ceTime .mk.on { background: #ffd23f; }
    #ceTime .head { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #d63a45; pointer-events: none; }
    #ceTime .dur { color: #9b9bab; font-size: 12px; white-space: nowrap; min-width: 64px; text-align: right; }
    .ce label.chk { display: flex; align-items: center; gap: 6px; margin: 10px 0 2px; color: inherit; font-weight: 600; cursor: pointer; }
  `;
  document.head.appendChild(css);
  const el = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };
  const top = el(`<div id="ceTop" class="ce panel"></div>`);
  const left = el(`<div id="ceLeft" class="ce panel"></div>`);
  const right = el(`<div id="ceRight" class="ce panel"></div>`);
  const help = el(`<div id="ceHelp" class="ce">Flèches X Y Z, carrés, arcs et boules : déplacer, tourner, agrandir l'objet ou la main · glisser ailleurs : tourner autour du Mii · clic droit + glisser : déplacer la vue · molette : zoom.</div>`);
  const timeline = el(`<div id="ceTime" class="ce panel" style="display:none"></div>`);
  document.body.append(top, left, right, help, timeline);

  let statusText = '';
  const setStatus = t => { statusText = t; const s = top.querySelector('.st'); if (s) s.textContent = t; };
  function renderTop() {
    top.innerHTML = `${pageTabs('perso')}
      <span class="tabs"><button data-tab="apparence" class="${tab === 'apparence' ? 'on' : ''}">🎭 Apparence</button><button data-tab="animations" class="${tab === 'animations' ? 'on' : ''}">👋 Animations</button><button data-tab="physique" class="${tab === 'physique' ? 'on' : ''}">🎈 Physique</button></span>
      <button data-v="tete">🙂 Tête</button><button data-v="buste">👕 Buste</button><button data-v="corps">🧍 Corps entier</button>
      <button data-a="all" class="${char.showAll ? 'on' : ''}" title="Montrer tous les ajouts en même temps (aperçu, ici seulement)">👁 Tout montrer</button>
      <span class="st">${esc(statusText)}</span>`;
  }
  top.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.v) goView(b.dataset.v);
    if (b.dataset.tab === 'physique' && tab !== 'physique') {
      if (capturing) cancelCapture();
      tab = 'physique'; playStart = 0;
      setPreview();
      renderTop(); renderLeft(); renderRight(); renderTimeline();
      goView('tete');
    } else if (b.dataset.tab && b.dataset.tab !== tab) {
      stopPick();
      tab = b.dataset.tab;
      const first = data.items.find(i => (tab === 'animations') === isAnim(i));
      select(first?.id || null, true);
      if (tab === 'animations') goView('corps');
    }
    if (b.dataset.a === 'all') { char.showAll = !char.showAll; renderTop(); }
  });

  const keyLabel = it => it.touche ? (it.maintien ? '⏬ ' : '') + it.touche : '';
  const playsOnce = it => isAnim(it) && !it.boucle && !it.maintien;
  function renderLeft() {
    if (tab === 'physique') { physLeft(); return; }
    const row = it => `<div class="it ${it.id === selected ? 'sel' : ''}" data-id="${esc(it.id)}">
        <span>${it.type === 'objet' ? '🎩' : isAnim(it) ? '👋' : '🙂'}</span><span class="n">${esc(it.nom || 'Sans nom')}</span>
        ${it.touche ? `<span class="k" title="Raccourci">${esc(keyLabel(it))}</span>` : ''}
        ${playsOnce(it) ? `<button data-play="${esc(it.id)}" title="Jouer sur le Mii (fenêtre et OBS)">▶</button>`
          : `<button class="sw ${char.on.has(it.id) ? 'on' : ''}" data-on="${esc(it.id)}" title="Activer / désactiver (comme dans les réglages)"></button>`}</div>`;
    if (tab === 'animations') {
      const anims = data.items.filter(isAnim);
      left.innerHTML = `<h3>Nouvelle animation</h3>
        <div class="row"><select id="ceTpl"><option value="">Vide (à composer)</option>${TEMPLATE_LIST.map(([k, n]) => `<option value="${k}">Modèle : ${esc(n)}</option>`).join('')}</select></div>
        <button data-add="animation" class="primary" style="width:100%">👋 + Animation</button>
        <h3>Vos animations</h3><div class="items">${anims.map(row).join('') || `<div class="muted">Aucune. Partez d'un modèle (Coucou, Victoire…) ou d'une animation vide.</div>`}</div>
        <p class="muted">Une animation est une suite de <b>poses clés</b> : où vont les mains, comment tournent la tête et le buste. Le Mii passe en douceur de l'une à l'autre, puis reprend ce qu'il faisait.</p>
        <p class="muted">▶ = jouer sur le Mii (fenêtre et OBS). Une animation en boucle a un interrupteur à la place.</p>`;
      return;
    }
    const exprs = data.items.filter(i => i.type === 'expression' || !i.type), objs = data.items.filter(i => i.type === 'objet');
    left.innerHTML = `<h3>Ajouter</h3>
      <div class="add"><button data-add="expression">🙂 + Expression</button><button data-add="objet">🎩 + Objet 3D</button></div>
      <h3>Expressions (visage)</h3><div class="items">${exprs.map(row).join('') || '<div class="muted">Aucune. Une expression change les yeux, la bouche ou les deux.</div>'}</div>
      <h3>Objets accrochés</h3><div class="items">${objs.map(row).join('') || '<div class="muted">Aucun. Chapeau, lunettes, épée… sur la tête, le corps ou dans une main.</div>'}</div>
      <h3>Dossiers</h3>
      <div class="grid2"><button data-act="openExpressions">📁 Expressions</button><button data-act="openAccessoires">📁 Accessoires</button>
        <button data-imp="expressions" title="Choisir des images PNG sur le PC : elles sont copiées dans Personnage\\Expressions">📥 Image…</button><button data-imp="accessoires" title="Choisir des modèles 3D sur le PC : ils sont copiés dans Personnage\\Accessoires">📥 Modèle 3D…</button></div>
      <p class="muted">Interrupteur allumé (ou case cochée) = activé partout (fenêtre du Mii et OBS), comme dans les réglages.</p>`;
  }
  left.addEventListener('click', e => {
    if (tab === 'physique') { onPhysLeft(e); return; }
    const on = e.target.closest('[data-on]');
    if (on) { toggleOn(on.dataset.on); return; }
    const impL = e.target.closest('[data-imp]');
    if (impL) { host?.postMessage({ type: 'import', kind: impL.dataset.imp }); importFor = null; return; }
    const play = e.target.closest('[data-play]');
    if (play) { host ? host.postMessage({ type: 'playAnim', id: play.dataset.play }) : mii.playAnim(play.dataset.play); return; }
    const add = e.target.closest('[data-add]');
    if (add) { addItem(add.dataset.add, add.dataset.add === 'animation' ? left.querySelector('#ceTpl')?.value : null); return; }
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
  function select(id, keepView = false) {
    if (capturing) cancelCapture();
    selected = id; akey = 0; playStart = 0;
    const it = sel();
    if (it) tab = isAnim(it) ? 'animations' : 'apparence';
    setPreview();
    if (!keepView) {
      if (it?.type === 'objet') goView(it.point === 'tete' ? 'tete' : 'buste');
      else if (isAnim(it)) goView('corps');
      else if (it) goView('tete');
    }
    renderTop(); renderLeft(); renderRight(); renderTimeline();
  }
  const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const blankKeys = () => [{ t: 0, mainG: null, mainD: null, tete: [0, 0, 0], buste: [0, 0] }, { t: 1, mainG: null, mainD: null, tete: [0, 0, 0], buste: [0, 0] }];
  const fullKey = k => ({ t: k.t, mainG: k.mainG ? k.mainG.slice() : null, mainD: k.mainD ? k.mainD.slice() : null, tete: (k.tete || [0, 0, 0]).slice(), buste: (k.buste || [0, 0]).slice() });
  function addItem(type, tpl) {
    const n = data.items.filter(i => i.type === type).length + 1;
    const it = type === 'expression'
      ? { id: newId(), type, nom: 'Expression ' + n, image: '', zone: 'tout', parler: true, touche: '', maintien: false }
      : type === 'animation'
      ? { id: newId(), type, nom: tpl && TEMPLATES[tpl] ? TEMPLATES[tpl].nom : 'Animation ' + n, cles: tpl && TEMPLATES[tpl] ? TEMPLATES[tpl].cles.map(fullKey) : blankKeys(), boucle: false, touche: '', maintien: false }
      : { id: newId(), type, nom: 'Objet ' + n, modele: lists.models[0] || 'forme:cube', couleur: '#e8574a', texture: 'uni', point: 'tete', ...JSON.parse(JSON.stringify(POINT_DEFAULTS.tete)), rot: [0, 0, 0], touche: '', maintien: false };
    data.items.push(it);
    save(); select(it.id);
  }

  let capturing = false;
  const imgUrl = f => './personnage/Expressions/' + encodeURIComponent(f) + '?v=' + rev;
  function renderRight() {
    if (tab === 'physique') { physRight(); return; }
    const it = sel();
    if (!it) {
      right.innerHTML = tab === 'animations'
        ? `<h3>Animations</h3><p class="muted">Choisissez un modèle à gauche (par exemple Coucou) puis « + Animation ».</p>`
        : `<h3>Personnage</h3><p class="muted">Ajoutez une expression ou un objet avec les boutons à gauche.</p>`;
      return;
    }
    const seg = (key, opts, val) => `<div class="seg" data-seg="${key}">${Object.entries(opts).map(([v, t]) => `<button data-v="${esc(v)}" class="${String(val) === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    if (isAnim(it)) { right.innerHTML = animPanel(it, seg); return; }
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
          <button data-imp="expressions" style="grid-column:1/-1" title="Choisir une image PNG sur le PC : elle est copiée dans Personnage\\Expressions et utilisée ici">📥 Importer une image…</button>
        </div>
        <p class="muted">Même disposition que la texture du visage (fond transparent). Le haut de l'image donne les yeux, le bas la bouche.</p>
        <h3>Ce qu'elle remplace</h3>${seg('zone', ZONES, it.zone || 'tout')}
        ${it.zone === 'yeux' ? '' : `<h3>Quand vous parlez</h3>${seg('parler', { true: '🗣 La bouche parle', false: '🔒 Garder cette bouche' }, String(it.parler !== false))}`}`;
    } else {
      const forms = FORMS.map(f => `<option value="forme:${f}" ${it.modele === 'forme:' + f ? 'selected' : ''}>${SHAPES[f].icon} ${SHAPES[f].label}</option>`).join('');
      const models = lists.models.map(f => `<option value="${esc(f)}" ${it.modele === f ? 'selected' : ''}>📦 ${esc(f.replace(/\.(glb|gltf|fbx|obj|dae|3mf|stl|ply|zip)$/i, ''))}</option>`).join('');
      const missing = it.modele && !it.modele.startsWith('forme:') && !lists.models.includes(it.modele) ? `<option value="${esc(it.modele)}" selected>⚠ ${esc(it.modele)} (introuvable)</option>` : '';
      const isForm = (it.modele || '').startsWith('forme:');
      const texs = Object.entries(TEXTURES).map(([k, t]) => `<option value="${k}" ${it.texture === k ? 'selected' : ''}>${t.label}</option>`).join('');
      const p = it.pos || [0, 0, 0], r = it.rot || [0, 0, 0];
      const slider = (lbl, f, i, min, max, step, v) => `<div class="sl"><span>${lbl}</span><input type="range" data-v3="${f}" data-i="${i}" min="${min}" max="${max}" step="${step}" value="${v}"><input type="number" data-v3="${f}" data-i="${i}" min="${min}" max="${max}" step="${step}" value="${fmt(v)}"></div>`;
      body += `<h3>Modèle 3D</h3>
        <div class="row"><select data-f="modele"><optgroup label="Vos modèles (dossier Accessoires)">${models || '<option disabled>— aucun : déposez des modèles 3D (glb, fbx, obj, zip…) —</option>'}</optgroup><optgroup label="Formes simples">${forms}</optgroup>${missing}</select></div>
        <div class="grid2"><button data-act="openAccessoires">📁 Dossier Accessoires</button><button data-x="lists">↻ Actualiser</button>
          <button data-imp="accessoires" style="grid-column:1/-1" title="Choisir un modèle 3D sur le PC : il est copié dans Personnage\\Accessoires et utilisé ici">📥 Importer un modèle 3D…</button></div>
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
      <div class="row"><select data-f="mii"><option value="">Tous les Mii</option><option value="${esc(lists.mii)}" ${it.mii === lists.mii ? 'selected' : ''}>Seulement ${esc(lists.mii.replace(/\.(glb|gltf|fbx|obj|dae|3mf|stl|ply|zip)$/i, ''))}</option>${it.mii && it.mii !== lists.mii ? `<option value="${esc(it.mii)}" selected>Seulement ${esc(it.mii)}</option>` : ''}</select></div>
      <div class="grid2" style="margin-top:12px"><button data-x="dup">⧉ Dupliquer</button><button data-x="del" class="danger">🗑 Supprimer</button></div>`;
    right.innerHTML = body;
  }
  const normKey = k => (k || '').toLowerCase().replace(/shift/g, 'maj').split('+').map(s => s.trim()).sort().join('+');

  const animDur = it => Math.max(0, ...(it.cles || []).map(k => +k.t || 0));
  const fmtS = v => (Math.round(v * 100) / 100).toString().replace('.', ',') + ' s';
  function animPanel(it, seg) {
    const ks = it.cles;
    akey = Math.max(0, Math.min(akey, ks.length - 1));
    const k = ks[akey];
    const sl = (lbl, attr, i, min, max, step, v) => `<div class="sl"><span>${lbl}</span><input type="range" ${attr} data-i="${i}" min="${min}" max="${max}" step="${step}" value="${v}"><input type="number" ${attr} data-i="${i}" min="${min}" max="${max}" step="${step}" value="${fmt(v)}"></div>`;
    const hand = (side, title) => {
      const v = k[side];
      return `<label class="chk"><input type="checkbox" data-ahon="${side}" ${v ? 'checked' : ''}> ${title}</label>
        ${v ? sl('↔ Écarter', `data-ah="${side}"`, 0, -0.6, 1, 0.01, v[0]) + sl('↕ Hauteur', `data-ah="${side}"`, 1, -0.6, 1.1, 0.01, v[1]) + sl('↗ Avancer', `data-ah="${side}"`, 2, -0.4, 1, 0.01, v[2])
          : `<p class="muted">Libre : la main continue ce qu'elle faisait (clavier, souris, manette…).</p>`}`;
    };
    const others = data.items.filter(o => o.id !== it.id && o.touche && normKey(o.touche) === normKey(it.touche));
    return `<h3>👋 Animation</h3>
      <div class="row"><label>Nom</label><input type="text" data-f="nom" value="${esc(it.nom)}" maxlength="60"></div>
      <div class="row"><label>Durée</label><span>${fmtS(animDur(it))} · ${ks.length} clé${ks.length > 1 ? 's' : ''}</span></div>
      <h3>Clé ${akey + 1} sur ${ks.length}</h3>
      ${sl('Moment (s)', 'data-ak="t"', 0, 0, 10, 0.05, k.t)}
      <div class="grid2"><button data-k="prev" ${akey ? '' : 'disabled'}>◀ Clé d'avant</button><button data-k="next" ${akey < ks.length - 1 ? '' : 'disabled'}>Clé d'après ▶</button>
        <button data-k="add">＋ Nouvelle clé</button><button data-k="del" ${ks.length > 1 ? '' : 'disabled'}>🗑 Cette clé</button></div>
      ${hand('mainG', "✋ Main de gauche (à l'écran)")}
      ${hand('mainD', "🤚 Main de droite (à l'écran)")}
      <h3>Tête (degrés)</h3>
      ${sl('← Tourner →', 'data-at', 0, -60, 60, 1, k.tete[0])}
      ${sl('↑ Lever · Baisser ↓', 'data-at', 1, -40, 40, 1, k.tete[1])}
      ${sl('Pencher ← →', 'data-at', 2, -40, 40, 1, k.tete[2])}
      <h3>Buste (degrés)</h3>
      ${sl('En avant', 'data-ab', 0, -25, 30, 1, k.buste[0])}
      ${sl('Pencher ← →', 'data-ab', 1, -25, 25, 1, k.buste[1])}
      <div class="grid2" style="margin-top:8px"><button data-k="copyPrev" ${akey ? '' : 'disabled'} title="Remettre la même pose que la clé d'avant">⧉ Pose d'avant</button><button data-k="mirror" title="Échanger gauche et droite dans toute l'animation">⇋ Miroir</button></div>
      <h3>Copier / coller</h3>
      <div class="grid2"><button data-k="copy" title="Copier la pose de cette clé (Ctrl+C)">📋 Copier la clé</button><button data-k="pasteHere" ${keyClip ? '' : 'disabled'} title="Remplacer la pose de cette clé, en gardant son moment (Ctrl+V)">📥 Coller sur cette clé</button>
        <button data-k="pasteNew" ${keyClip ? '' : 'disabled'} title="Ajouter la pose copiée comme nouvelle clé, juste après celle-ci (Ctrl+Maj+V)" style="grid-column:1/-1">➕ Coller en nouvelle clé</button></div>
      ${keyClip ? `<p class="muted">Copiée : ${esc(keyClip.from)}, clé à ${fmtS(keyClip.key.t)}. Collez-la ici ou dans une autre animation.</p>` : ''}
      <h3>Partir d'un modèle</h3>
      <div class="row"><select data-f="tplPick"><option value="">Choisir…</option>${TEMPLATE_LIST.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select></div>
      <h3>Lecture</h3>
      ${seg('boucle', { false: '▶ Une fois par appui', true: '🔁 En boucle (interrupteur)' }, String(!!it.boucle))}
      ${it.boucle ? `<div class="row"><label>Activée</label><button class="sw ${char.on.has(it.id) ? 'on' : ''}" data-on="${esc(it.id)}"></button><span class="muted">aussi dans les réglages</span></div>`
        : `<div class="row"><button data-k="mii" class="primary">📺 Jouer sur le Mii</button><span class="muted">fenêtre et OBS</span></div>`}
      <h3>Raccourci</h3>
      <div class="row"><label>Touche</label><span class="key ${capturing ? 'wait' : ''}">${capturing ? 'Appuyez…' : esc(it.touche || 'aucun')}</span>
        <button data-x="capture" ${host ? '' : 'disabled'}>${capturing ? 'Annuler' : '⌨ Choisir…'}</button>${it.touche ? '<button data-x="nokey" title="Supprimer le raccourci">✕</button>' : ''}</div>
      ${capturing ? '<p class="warn">Appuyez sur la combinaison voulue (ex. Ctrl + Maj + F1). Échap : annuler.</p>' : ''}
      <div class="row"><label>ou</label><select data-f="toucheListe"><option value="">une touche sans l'appuyer (F13…F24, souris…)</option>${
        [...Array.from({ length: 24 }, (_, i) => 'F' + (i + 1)), 'Souris4', 'Souris5', 'SourisMilieu', ...Array.from({ length: 10 }, (_, i) => 'Num' + i)]
          .map(x => `<option value="${x}">${x}</option>`).join('')}</select></div>
      ${others.length ? `<p class="warn">⚠ Même raccourci que « ${esc(others.map(o => o.nom).join(' », « '))} » : ils se déclencheront ensemble.</p>` : ''}
      ${seg('maintien', { false: it.boucle ? '👆 Appuyer = démarrer / arrêter' : '👆 Appuyer = jouer une fois', true: '⏬ Joue tant que la touche est enfoncée' }, String(!!it.maintien))}
      <h3>Mii</h3>
      <div class="row"><select data-f="mii"><option value="">Tous les Mii</option><option value="${esc(lists.mii)}" ${it.mii === lists.mii ? 'selected' : ''}>Seulement ${esc(lists.mii.replace(/\.(glb|gltf|fbx|obj|dae|3mf|stl|ply|zip)$/i, ''))}</option>${it.mii && it.mii !== lists.mii ? `<option value="${esc(it.mii)}" selected>Seulement ${esc(it.mii)}</option>` : ''}</select></div>
      <div class="grid2" style="margin-top:12px"><button data-x="dup">⧉ Dupliquer</button><button data-x="del" class="danger">🗑 Supprimer</button></div>`;
  }
  function sortKeys(it, keep) {
    it.cles.sort((a, b) => a.t - b.t);
    akey = Math.max(0, it.cles.indexOf(keep));
  }
  function keyFromSample(it, t) {
    const s = mii.sampleAnim(mii.normalizeAnim(it), t);
    if (!s) return { t, mainG: null, mainD: null, tete: [0, 0, 0], buste: [0, 0] };
    const r3 = a => a.map(v => Math.round(v * 1000) / 1000);
    return { t, mainG: s.mainG.v && s.mainG.w > 0.5 ? r3(s.mainG.v) : null, mainD: s.mainD.v && s.mainD.w > 0.5 ? r3(s.mainD.v) : null, tete: s.tete.map(Math.round), buste: s.buste.map(Math.round) };
  }
  function animChanged(full) {
    setPreview(); save();
    if (full) renderRight();
    renderTimeline();
  }
  function playOnMii(it) {
    clearTimeout(saveTimer);
    host?.postMessage({ type: 'savePerso', data });
    setTimeout(() => host ? host.postMessage({ type: 'playAnim', id: it.id }) : mii.playAnim(it.id), 450);
    setStatus('📺 ' + (it.nom || 'Animation') + ' : jouée sur le Mii');
  }
  function onAnimClick(e, it) {
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (!k) return false;
    const ks = it.cles, cur = ks[akey];
    if (k === 'prev' && akey > 0) { akey--; setPreview(); renderRight(); renderTimeline(); }
    if (k === 'next' && akey < ks.length - 1) { akey++; setPreview(); renderRight(); renderTimeline(); }
    if (k === 'add') {
      const nextT = ks[akey + 1]?.t;
      const t = nextT != null ? Math.round((cur.t + nextT) / 2 * 20) / 20 : Math.round((cur.t + 0.3) * 20) / 20;
      const nk = keyFromSample(it, t);
      if (nextT == null) Object.assign(nk, { mainG: cur.mainG?.slice() || null, mainD: cur.mainD?.slice() || null, tete: cur.tete.slice(), buste: cur.buste.slice() });
      ks.push(nk); sortKeys(it, nk); animChanged(true);
    }
    if (k === 'del' && ks.length > 1) { ks.splice(akey, 1); akey = Math.min(akey, ks.length - 1); animChanged(true); }
    if (k === 'copyPrev' && akey > 0) {
      const p = ks[akey - 1];
      Object.assign(cur, { mainG: p.mainG?.slice() || null, mainD: p.mainD?.slice() || null, tete: p.tete.slice(), buste: p.buste.slice() });
      animChanged(true);
    }
    if (k === 'mirror') {
      for (const c of ks) {
        [c.mainG, c.mainD] = [c.mainD, c.mainG];
        c.tete = [-c.tete[0], c.tete[1], -c.tete[2]];
        c.buste = [c.buste[0], -c.buste[1]];
      }
      animChanged(true);
    }
    if (k === 'mii') playOnMii(it);
    if (k === 'copy') copyKey(it);
    if (k === 'pasteHere') pasteKey(it, false);
    if (k === 'pasteNew') pasteKey(it, true);
    return true;
  }
  let keyClip = null;
  try { keyClip = JSON.parse(localStorage.getItem('animKeyClip') || 'null'); } catch { }
  function copyKey(it) {
    const k = it.cles[akey];
    if (!k) return;
    keyClip = { from: it.nom || 'Animation', key: fullKey(k) };
    try { localStorage.setItem('animKeyClip', JSON.stringify(keyClip)); } catch { }
    setStatus(`📋 Clé ${akey + 1} copiée`);
    renderRight();
  }
  function pasteKey(it, asNew) {
    if (!keyClip) return;
    const ks = it.cles, cur = ks[akey], src = fullKey(keyClip.key);
    if (!asNew && cur) {
      Object.assign(cur, { mainG: src.mainG, mainD: src.mainD, tete: src.tete, buste: src.buste });
      setStatus(`📥 Pose collée sur la clé ${akey + 1}`);
    } else {
      const nextT = ks[akey + 1]?.t, t0 = cur?.t ?? 0;
      src.t = nextT != null ? Math.round((t0 + nextT) / 2 * 20) / 20 : Math.round((t0 + 0.3) * 20) / 20;
      ks.push(src); sortKeys(it, src);
      setStatus(`➕ Clé collée à ${fmtS(src.t)}`);
    }
    playStart = 0;
    animChanged(true);
  }
  addEventListener('keydown', e => {
    if (tab !== 'animations' || !(e.ctrlKey || e.metaKey) || e.target.closest?.('input, select, textarea')) return;
    const it = sel();
    if (!isAnim(it)) return;
    const key = e.key.toLowerCase();
    if (key === 'c') { e.preventDefault(); copyKey(it); }
    if (key === 'v') { e.preventDefault(); pasteKey(it, e.shiftKey); }
  });
  function onAnimField(t, it, final) {
    const ks = it.cles, k = ks[akey];
    if (!k) return false;
    if (t.dataset.f === 'tplPick') {
      if (final && t.value && TEMPLATES[t.value] && confirm(`Remplacer toutes les clés de « ${it.nom} » par le modèle « ${TEMPLATES[t.value].nom} » ?`)) {
        it.cles = TEMPLATES[t.value].cles.map(fullKey); akey = 0; animChanged(true);
      } else if (final) t.value = '';
      return true;
    }
    if (t.dataset.ahon) {
      const side = t.dataset.ahon;
      k[side] = t.checked ? (keyFromSample(it, k.t)[side] || R.slice()) : null;
      animChanged(true);
      return true;
    }
    let v = +t.value || 0;
    if (t.dataset.ak) {
      v = Math.max(0, Math.min(10, Math.round(v * 100) / 100));
      k.t = v; sortKeys(it, k); syncPair(t, v);
      animChanged(false);
      if (final) renderRight();
      return true;
    }
    const arr = t.dataset.ah ? (k[t.dataset.ah] = (k[t.dataset.ah] || R).slice()) : t.dataset.at ? (k.tete = k.tete.slice()) : t.dataset.ab ? (k.buste = k.buste.slice()) : null;
    if (!arr) return false;
    arr[+t.dataset.i] = v; syncPair(t, v);
    animChanged(false);
    return true;
  }

  let dragKey = null, span = 2;
  function renderTimeline() {
    const it = sel();
    if (tab !== 'animations' || !isAnim(it)) { timeline.style.display = 'none'; return; }
    timeline.style.display = 'flex';
    const dur = animDur(it);
    span = Math.max(2, Math.ceil((dur + 0.5) * 2) / 2);
    const ticks = Array.from({ length: Math.floor(span / 0.5) + 1 }, (_, i) => i * 0.5)
      .map(s => `<div class="tick" style="left:${s / span * 100}%"><i>${Number.isInteger(s) ? s + ' s' : ''}</i></div>`).join('');
    const marks = it.cles.map((c, i) => `<div class="mk ${i === akey ? 'on' : ''}" data-mk="${i}" style="left:${c.t / span * 100}%" title="Clé ${i + 1} : ${fmtS(c.t)}"></div>`).join('');
    timeline.innerHTML = `<button data-tl="play" class="${playStart ? 'on' : ''}">${playStart ? '⏹ Arrêter' : '▶ Aperçu'}</button>
      <div class="track" title="Glissez une clé pour changer son moment · double-clic : nouvelle clé à cet endroit">${ticks}${marks}<div class="head" style="display:none"></div></div>
      <span class="dur">${fmtS(dur)}</span>
      ${it.boucle ? '' : '<button data-tl="mii" title="Jouer sur le Mii (fenêtre et OBS)">📺 Sur le Mii</button>'}`;
  }
  const trackTime = e => {
    const r = timeline.querySelector('.track').getBoundingClientRect();
    return Math.max(0, Math.min(10, Math.round((e.clientX - r.left) / r.width * span * 20) / 20));
  };
  timeline.addEventListener('click', e => {
    const it = sel(), b = e.target.closest('[data-tl]');
    if (!it || !b) return;
    if (b.dataset.tl === 'play') { playStart = playStart ? 0 : performance.now(); setPreview(); renderTimeline(); }
    if (b.dataset.tl === 'mii') playOnMii(it);
  });
  timeline.addEventListener('pointerdown', e => {
    const it = sel(), mk = e.target.closest('[data-mk]');
    if (!it || !mk) return;
    akey = +mk.dataset.mk; dragKey = it.cles[akey];
    playStart = 0;
    timeline.querySelector('.track').setPointerCapture(e.pointerId);
    setPreview(); renderRight();
    timeline.querySelectorAll('.mk').forEach((m, i) => m.classList.toggle('on', i === akey));
  });
  timeline.addEventListener('pointermove', e => {
    const it = sel();
    if (!dragKey || !it) return;
    dragKey.t = trackTime(e);
    const m = timeline.querySelector(`[data-mk="${akey}"]`);
    if (m) m.style.left = dragKey.t / span * 100 + '%';
    const r = right.querySelector('[data-ak]');
    if (r) { r.value = dragKey.t; syncPair(r, dragKey.t); }
    setPreview();
  });
  timeline.addEventListener('pointerup', () => {
    const it = sel();
    if (!dragKey || !it) return;
    sortKeys(it, dragKey); dragKey = null;
    animChanged(true);
  });
  timeline.addEventListener('dblclick', e => {
    const it = sel();
    if (!it || e.target.closest('[data-mk]') || !e.target.closest('.track')) return;
    const nk = keyFromSample(it, trackTime(e));
    it.cles.push(nk); sortKeys(it, nk); playStart = 0;
    animChanged(true);
  });
  (function tickHead() {
    const head = timeline.querySelector('.head'), it = sel();
    if (head && it && isAnim(it)) {
      if (playStart) {
        const t = ((performance.now() - playStart) / 1000) % (animDur(it) + 0.4);
        head.style.display = ''; head.style.left = Math.min(t, span) / span * 100 + '%';
      } else head.style.display = 'none';
    }
    requestAnimationFrame(tickHead);
  })();

  right.addEventListener('click', e => {
    if (tab === 'physique') { onPhysRight(e); return; }
    const it = sel();
    if (!it) return;
    if (isAnim(it) && onAnimClick(e, it)) return;
    const impR = e.target.closest('[data-imp]');
    if (impR) { host?.postMessage({ type: 'import', kind: impR.dataset.imp }); importFor = it.id; return; }
    const on = e.target.closest('[data-on]');
    if (on) { toggleOn(on.dataset.on); return; }
    const act = e.target.closest('[data-act]');
    if (act) { host?.postMessage({ type: 'action', name: act.dataset.act }); return; }
    const img = e.target.closest('[data-img]');
    if (img) { it.image = img.dataset.img; save(); renderRight(); return; }
    const sg = e.target.closest('[data-seg] [data-v]');
    if (sg) {
      const key = sg.parentElement.dataset.seg, v = sg.dataset.v;
      if (key === 'parler' || key === 'maintien' || key === 'boucle') it[key] = v === 'true';
      else if (key === 'point') {
        if (it.point !== v) Object.assign(it, JSON.parse(JSON.stringify(POINT_DEFAULTS[v] || POINT_DEFAULTS.tete)), { point: v });
        goView(v === 'tete' ? 'tete' : 'buste');
      } else it[key] = v;
      save(); renderLeft(); renderRight(); renderTimeline(); return;
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
      const same = data.items.filter(o => isAnim(o) === isAnim(it));
      select(same[Math.min(same.length - 1, data.items.slice(0, i).filter(o => isAnim(o) === isAnim(it)).length)]?.id || null, true);
      save();
    }
  });
  const onField = (e, final) => {
    if (tab === 'physique') { onPhysField(e.target, final); return; }
    const it = sel();
    const t = e.target;
    if (!it || !t.dataset) return;
    if (isAnim(it) && onAnimField(t, it, final)) return;
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

  let importFor = null;
  host?.addEventListener('message', e => {
    const m = e.data || {};
    if (m.type === 'imported') {
      const target = data.items.find(i => i.id === importFor);
      importFor = null;
      fetchAll(false).then(() => {
        const f = m.files[0];
        if (m.kind === 'accessoires') {
          if (target?.type === 'objet') { target.modele = f; save(); }
          else { addItem('objet'); const it = sel(); if (it) { it.modele = f; it.nom = f.replace(/\.(glb|gltf|fbx|obj|dae|3mf|stl|ply|zip)$/i, ''); save(); } }
        }
        if (m.kind === 'expressions') {
          if (target?.type === 'expression') { target.image = f; save(); }
          else { addItem('expression'); const it = sel(); if (it) { it.image = f; it.nom = f.replace(/\.png$/i, ''); save(); } }
        }
        renderLeft(); renderRight();
        setStatus('📥 Importé : ' + m.files.join(', '));
      });
    }
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

  renderTop(); renderLeft(); renderRight(); renderTimeline();
  host?.postMessage({ type: 'ready' });
  window.charEditor = { get data() { return data; }, select, addItem, toggleOn, physPick, startPick, get tab() { return tab; } };
}
