import * as THREE from 'three';
import { SHAPES, TEXTURES, textureCanvas, makeObject, disposeObject, normalizeScene } from './scene-objects.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const round = (v, step) => Math.round(v / step) * step;
const fmt = v => (Math.round(v * 100) / 100).toString();
const deg = r => Math.round(THREE.MathUtils.radToDeg(r));
const wrapDeg = a => ((a % 360) + 540) % 360 - 180;
const TABLE_DEFAULT = { tex: 'uni', color: '#c98a4b', texScale: 1, legColor: '#8a5a2b', padColor: '#6a2a8a', width: 1, depth: 1, hidden: false };

export async function startEditor(mii) {
  const { scene, camera, rig, renderer } = mii;
  const u = rig.sceneUnit;
  const host = window.chrome?.webview;
  const canvas = renderer.domElement;
  const ctx = mii.sceneScreenCtx;

  let data = JSON.parse(JSON.stringify(rig.userSceneData || { objects: [] }));
  data.format = 'sullys-mii-bongo-scene'; data.version = 2;
  data.objects ||= []; data.base ||= {};
  let selected = null;
  let snap = true;
  const groups = new Map();
  for (const g of rig.userScene.children) groups.set(g.userData.id, g);

  let userImages = [], userModels = [], monitorCount = 2;
  let presets = [], currentPreset = null, presetBase = null;
  let firstPresets = true;
  const refreshPresets = async () => {
    const r = await fetch('./api/scene-presets', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
    presets = r.list || [];
    if (firstPresets) {
      firstPresets = false;
      const cur = presets.find(p => p.file.toLowerCase() === String(r.current || '').toLowerCase());
      if (cur) { currentPreset = cur.file; presetBase = JSON.stringify(data); }
    }
    if (currentPreset && !presets.some(p => p.file === currentPreset)) currentPreset = null;
    renderPresets();
  };
  const refreshLists = async () => {
    refreshPresets();
    userImages = await fetch('./api/textures', { cache: 'no-store' }).then(r => r.json()).catch(() => []);
    userModels = await fetch('./api/objets', { cache: 'no-store' }).then(r => r.json()).catch(() => []);
    monitorCount = Math.max(1, (await fetch('./api/screens', { cache: 'no-store' }).then(r => r.json()).catch(() => [])).length || 2);
    renderAddPanel();
    renderProps();
  };

  const box0 = rig.modelBox.clone();
  for (const p of rig.props) box0.expandByObject(p);
  const cam = { target: box0.getCenter(V()), az: 35, el: 24, dist: box0.getSize(V()).length() * 2.6 };
  const applyCamera = () => {
    const a = THREE.MathUtils.degToRad(cam.az), e = THREE.MathUtils.degToRad(cam.el);
    camera.position.copy(cam.target).add(V(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(cam.dist));
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.target);
    camera.near = cam.dist * 0.01; camera.far = cam.dist * 60;
    camera.updateProjectionMatrix();
  };
  rig.editorCamera = applyCamera;
  applyCamera();

  const grid = new THREE.GridHelper(u * 12, 48, 0x6a6a80, 0x3a3a48);
  grid.position.y = 0.0005;
  grid.material.transparent = true; grid.material.opacity = 0.55; grid.material.depthWrite = false;
  scene.add(grid);

  const helper = new THREE.BoxHelper(undefined, 0xffd23f);
  helper.visible = false;
  helper.material.depthTest = false; helper.renderOrder = 10;
  scene.add(helper);

  const baseScreenIndex = id => id?.startsWith('@screen') ? +id.slice(7) : -1;
  const isBase = id => id?.startsWith('@');
  const targetOf = id => {
    if (id === '@mii') return rig.root;
    if (id === '@table') return rig.table?.desk;
    const i = baseScreenIndex(id);
    if (i >= 0) return rig.baseScreens?.[i]?.grp;
    return groups.get(id);
  };
  const tableData = () => (data.base.table ||= { ...TABLE_DEFAULT });
  const screenData = i => {
    data.base.screens ||= [];
    while (data.base.screens.length <= i) data.base.screens.push({ source: data.base.screens.length + 1, color: '#1b1b20', hidden: false });
    return data.base.screens[i];
  };
  const currentScreenPose = i => {
    const S = rig.baseScreens[i], e = screenData(i);
    const pos = e.pos || S.grp.position.toArray().map(v => Math.round(v / u * 1000) / 1000);
    const eu = new THREE.Euler().setFromQuaternion(S.grp.quaternion, 'YXZ');
    const rot = e.rot || [deg(eu.x), wrapDeg(deg(eu.y)), deg(eu.z)];
    return { pos, rot };
  };
  const applyBaseLive = () => { mii.applyBase(data.base); updateHelper(); };

  const updateHelper = () => {
    const g = targetOf(selected);
    helper.visible = !!g && g.visible !== false;
    if (g) helper.setFromObject(g);
  };

  const byId = id => data.objects.find(o => o.id === id);
  const undo = [], redo = [];
  let baseline = JSON.stringify(data), saveTimer = null;
  const saveNow = () => {
    clearTimeout(saveTimer); saveTimer = null;
    host?.postMessage({ type: 'scene', data });
    if (!statusText || statusText === '…' || statusText.startsWith('✓ Enregistré')) setStatus('✓ Enregistré');
  };
  const commit = (fromPanel = false) => {
    const now = JSON.stringify(data);
    if (now === baseline) return;
    undo.push(baseline); if (undo.length > 80) undo.shift();
    redo.length = 0;
    baseline = now;
    setStatus('…');
    clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 350);
    renderList(); renderTopbar(); renderPresets();
    renderProps(fromPanel);
  };
  addEventListener('beforeunload', () => { if (saveTimer) saveNow(); });
  const restore = json => {
    data = JSON.parse(json);
    data.base ||= {};
    baseline = json;
    for (const g of groups.values()) { rig.userScene.remove(g); disposeObject(g); }
    groups.clear();
    for (const o of data.objects) addGroup(o);
    mii.refreshScreenTargets();
    applyBaseLive();
    if (!byId(selected) && !isBase(selected)) selected = null;
    updateHelper(); renderList(); renderProps(); renderTopbar();
    clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 200);
  };
  const doUndo = () => { if (!undo.length) return; redo.push(baseline); restore(undo.pop()); };
  const doRedo = () => { if (!redo.length) return; undo.push(baseline); restore(redo.pop()); };
  const replaceData = d => { undo.push(baseline); redo.length = 0; restore(JSON.stringify(d)); };

  const addGroup = o => {
    const g = makeObject(o, u, ctx);
    g.userData.loaded = () => { if (selected === o.id) updateHelper(); };
    rig.userScene.add(g); groups.set(o.id, g);
    return g;
  };
  const rebuild = o => {
    const old = groups.get(o.id);
    if (old) { rig.userScene.remove(old); disposeObject(old); }
    addGroup(o);
    if (o.type === 'screen') mii.refreshScreenTargets();
    if (selected === o.id) updateHelper();
  };
  const placeGroup = o => {
    const g = groups.get(o.id); if (!g) return;
    g.position.set(o.pos[0] * u, o.pos[1] * u, o.pos[2] * u);
    g.rotation.set(...o.rot.map(THREE.MathUtils.degToRad), 'YXZ');
    if (o.type === 'screen' && o.stand !== false) rebuild(o);
    if (selected === o.id) updateHelper();
  };

  const newId = () => 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nameFor = type => {
    const base = type === 'glb' ? 'Objet 3D' : SHAPES[type].label.split(' /')[0];
    let n = 1; while (data.objects.some(o => o.name === `${base} ${n}`)) n++;
    return `${base} ${n}`;
  };
  const dropPoint = () => {
    const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(0, -0.1), camera);
    const p = r.ray.intersectPlane(new THREE.Plane(V(0, 1, 0), 0), V());
    const t = p && p.distanceTo(cam.target) < cam.dist * 2 ? p : cam.target.clone().setY(0);
    return [round(t.x / u, 0.05), 0, round(t.z / u, 0.05)];
  };
  const addObject = (type, extra = {}) => {
    const def = SHAPES[type];
    const o = { id: newId(), type, name: nameFor(type), pos: dropPoint(), rot: [0, 0, 0], size: [...def.size], tex: def.tex || 'uni', color: def.color || '#ffffff', texScale: 1, ...extra };
    if (type === 'panel' && userImages.length && !extra.tex) o.tex = 'img:' + userImages[0];
    if (type === 'glb') { delete o.tex; delete o.color; delete o.texScale; }
    if (type === 'screen') {
      delete o.tex; delete o.texScale;
      o.source = 1; o.stand = true;
      o.pos[1] = 0.3;
      const a = THREE.MathUtils.radToDeg(Math.atan2(-o.pos[0], -o.pos[2]));
      o.rot[1] = wrapDeg(Math.round(a / 15) * 15);
    }
    data.objects.push(o);
    addGroup(o);
    if (type === 'screen') mii.refreshScreenTargets();
    select(o.id);
    commit();
  };
  const removeSelected = () => {
    const o = byId(selected); if (!o) return;
    const g = groups.get(o.id); rig.userScene.remove(g); disposeObject(g); groups.delete(o.id);
    data.objects = data.objects.filter(x => x !== o);
    if (o.type === 'screen') mii.refreshScreenTargets();
    select(null); commit();
  };
  const duplicateSelected = () => {
    const o = byId(selected); if (!o) return;
    const c = JSON.parse(JSON.stringify(o));
    c.id = newId(); c.name = nameFor(o.type); c.pos[0] += 0.2; c.pos[2] += 0.2;
    data.objects.push(c); addGroup(c); if (c.type === 'screen') mii.refreshScreenTargets();
    select(c.id); commit();
  };
  const select = id => { selected = id; updateHelper(); renderList(); renderProps(); };

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const setRay = e => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  const pickables = () => {
    const list = [...groups.values()];
    (rig.baseScreens || []).forEach((S, i) => { if (S.grp.visible) { S.grp.userData.pickId = '@screen' + i; list.push(S.grp); } });
    if (rig.table?.desk.visible) { rig.table.desk.userData.pickId = '@table'; list.push(rig.table.desk); }
    if (rig.root.visible) { rig.root.userData.pickId = '@mii'; list.push(rig.root); }
    return list;
  };
  const pick = e => {
    setRay(e);
    const hit = ray.intersectObjects(pickables(), true)[0];
    if (!hit) return null;
    let g = hit.object; while (g && !g.userData.id && !g.userData.pickId) g = g.parent;
    return g ? { id: g.userData.id || g.userData.pickId, point: hit.point } : null;
  };
  const posOf = id => {
    if (id === '@mii') return ((data.base.mii ||= { pos: [0, 0, 0] }).pos);
    const i = baseScreenIndex(id);
    if (i >= 0) { const e = screenData(i); e.pos ||= currentScreenPose(i).pos; return e.pos; }
    return byId(id)?.pos;
  };
  const afterMove = id => {
    if (id === '@mii') { const p = data.base.mii.pos; p[1] = 0; applyBaseLive(); return; }
    if (baseScreenIndex(id) >= 0) applyBaseLive(); else placeGroup(byId(id));
  };

  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    try { canvas.setPointerCapture(e.pointerId); } catch { }
    if (e.button === 2 || e.button === 1) {
      drag = { kind: e.button === 1 || e.shiftKey ? 'pan' : 'orbit', x: e.clientX, y: e.clientY, az: cam.az, el: cam.el, target: cam.target.clone() };
      return;
    }
    if (e.button !== 0) return;
    const hit = pick(e);
    if (!hit) { select(null); return; }
    select(hit.id);
    if (hit.id === '@table') return;
    const pos = posOf(hit.id);
    const lift = e.shiftKey && hit.id !== '@mii';
    const normal = lift ? camera.getWorldDirection(V()).setY(0).normalize().negate() : V(0, 1, 0);
    drag = { kind: lift ? 'lift' : 'move', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point), start: hit.point.clone(), pos: [...pos], moved: false };
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.kind === 'orbit') {
      cam.az = drag.az - (e.clientX - drag.x) * 0.4;
      cam.el = THREE.MathUtils.clamp(drag.el + (e.clientY - drag.y) * 0.3, -5, 89);
      applyCamera(); return;
    }
    if (drag.kind === 'pan') {
      const k = cam.dist / canvas.clientHeight * 0.9;
      const right = V().setFromMatrixColumn(camera.matrixWorld, 0), up = V().setFromMatrixColumn(camera.matrixWorld, 1);
      cam.target.copy(drag.target).addScaledVector(right, -(e.clientX - drag.x) * k).addScaledVector(up, (e.clientY - drag.y) * k);
      applyCamera(); return;
    }
    setRay(e);
    const p = ray.ray.intersectPlane(drag.plane, V()); if (!p) return;
    const d = p.sub(drag.start).divideScalar(u), pos = posOf(selected), step = snap ? 0.05 : 0.001;
    if (drag.kind === 'move') { pos[0] = round(drag.pos[0] + d.x, step); pos[2] = round(drag.pos[2] + d.z, step); }
    else pos[1] = Math.max(-5, round(drag.pos[1] + d.y, step));
    drag.moved = true;
    afterMove(selected); renderProps(true);
  });
  const endDrag = () => { if (drag?.moved) commit(); drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    cam.dist = THREE.MathUtils.clamp(cam.dist * (e.deltaY > 0 ? 1.12 : 1 / 1.12), u * 0.15, u * 40);
    applyCamera();
  }, { passive: false });

  addEventListener('keydown', e => {
    if (e.target.closest?.('input, select, textarea') || document.querySelector('.edModal')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (k === 'escape') { select(null); return; }
    if (!selected || selected === '@table') return;
    if ((k === 'delete' || k === 'backspace') && !isBase(selected)) { removeSelected(); return; }
    const pos = posOf(selected);
    const step = e.altKey ? 0.01 : 0.05;
    const nudge = { arrowleft: [-step, 0, 0], arrowright: [step, 0, 0], arrowup: [0, 0, -step], arrowdown: [0, 0, step], pageup: [0, step, 0], pagedown: [0, -step, 0] }[k];
    if (nudge) {
      e.preventDefault();
      const a = THREE.MathUtils.degToRad(cam.az), c = Math.cos(a), s = Math.sin(a);
      pos[0] += nudge[0] * c + nudge[2] * s; pos[2] += -nudge[0] * s + nudge[2] * c; pos[1] += nudge[1];
      for (let i = 0; i < 3; i++) pos[i] = Math.round(pos[i] * 1000) / 1000;
      afterMove(selected); commit(); return;
    }
    if (k === 'q' || k === 'e') {
      const i = baseScreenIndex(selected);
      const rot = i >= 0 ? (screenData(i).rot ||= currentScreenPose(i).rot) : byId(selected).rot;
      rot[1] = wrapDeg(rot[1] + (k === 'q' ? 15 : -15));
      afterMove(selected); commit(); return;
    }
    if (k === 'f') { const g = targetOf(selected); if (g) { cam.target.copy(new THREE.Box3().setFromObject(g).getCenter(V())); applyCamera(); } }
  });

  const css = document.createElement('style');
  css.textContent = `
    #status { display: none !important; }
    .ed { position: fixed; z-index: 10; font: 13px/1.35 "Segoe UI", system-ui, sans-serif; color: #ececf1; }
    .ed .panel, .ed.panel { background: rgba(26,26,34,.93); border: 1px solid #34343f; border-radius: 12px; padding: 10px 12px; box-shadow: 0 6px 22px #0006; }
    .ed h3 { margin: 2px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #9b9bab; font-weight: 600; }
    .ed button, .ed select, .ed input, .ed textarea { font: inherit; color: inherit; }
    .ed button { background: #2a2a34; border: 1px solid #3a3a48; border-radius: 8px; padding: 6px 9px; cursor: pointer; }
    .ed button:hover { border-color: #5a5a70; }
    .ed button.on { background: #d63a45; border-color: #d63a45; color: #fff; }
    .ed button.primary { background: #d63a45; border-color: #d63a45; color: #fff; }
    .ed button:disabled { opacity: .4; cursor: default; }
    #edTop { top: 10px; left: 250px; right: 298px; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; align-items: center; padding: 6px 8px; }
    #edTop button { white-space: nowrap; }
    #edTop b { margin: 0 8px 0 4px; white-space: nowrap; }
    #edTop .st { color: #9b9bab; min-width: 92px; margin-left: 6px; font-size: 12px; }
    #edLeft { top: 10px; left: 10px; width: 228px; max-height: calc(100vh - 80px); overflow: hidden auto; }
    .shapes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .shapes button { display: flex; align-items: center; gap: 6px; text-align: left; padding: 7px 8px; }
    .shapes span { font-size: 17px; }
    .io { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .io button { padding: 6px 6px; font-size: 12.5px; }
    .presets { display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px; }
    .pre { display: flex; gap: 3px; align-items: stretch; }
    .pre button { padding: 4px 6px; }
    .pre button[data-pre=load] { flex: 1; min-width: 0; text-align: left; display: flex; flex-direction: column; }
    .pre button[data-pre=load] b { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pre button[data-pre=load] small { color: #9b9bab; font-size: 11px; }
    .pre.on button[data-pre=load] { border-color: #d63a45; background: #3a1f26; }
    .pre button[data-pre=ren], .pre button[data-pre=del] { flex: none; width: 30px; padding: 0; }
    button.wide { width: 100%; }
    .row { display: flex; gap: 6px; align-items: center; margin: 7px 0; }
    .row > label { color: #9b9bab; min-width: 62px; font-size: 12px; }
    .ed select, .ed input[type=text] { background: #2a2a34; border: 1px solid #3a3a48; border-radius: 8px; padding: 5px 7px; flex: 1; min-width: 0; }
    .ed input[type=number] { background: #2a2a34; border: 1px solid #3a3a48; border-radius: 7px; padding: 4px 5px; width: 100%; min-width: 0; }
    .ed input[type=range] { flex: 1; accent-color: #d63a45; min-width: 0; }
    .ed input[type=color] { flex: 1; height: 28px; background: none; border: 0; padding: 0; min-width: 0; }
    .ed label.chk { display: flex; gap: 8px; align-items: center; margin: 7px 0; cursor: pointer; }
    .trio { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; flex: 1; }
    .trio div { display: flex; flex-direction: column; font-size: 10.5px; color: #9b9bab; }
    .list { margin-top: 4px; display: flex; flex-direction: column; gap: 3px; }
    .list button { text-align: left; background: transparent; border-color: transparent; padding: 4px 7px; }
    .list button.on { background: #3a1f26; border-color: #d63a45; color: #fff; }
    .muted { color: #9b9bab; font-size: 12px; }
    #edRight { top: 10px; right: 10px; width: 276px; max-height: calc(100vh - 60px); overflow: hidden auto; }
    .tex { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
    .tex button { padding: 0; aspect-ratio: 1; border-radius: 8px; overflow: hidden; background-size: cover; background-position: center; border: 2px solid transparent; position: relative; }
    .tex button.on { border-color: #ffd23f; }
    .tex button i { position: absolute; left: 0; right: 0; bottom: 0; font-style: normal; font-size: 9px; background: #000a; color: #fff; padding: 1px 0; text-align: center; white-space: nowrap; overflow: hidden; }
    .src { display: flex; flex-wrap: wrap; gap: 5px; }
    .src button { padding: 5px 8px; }
    .src button.on { background: #1f4a37; border-color: #3fb67f; color: #c9f3dd; }
    .acts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 10px; }
    .danger { color: #ffb3b8; }
    #edHelp { left: 10px; bottom: 8px; right: 10px; text-align: center; font-size: 11.5px; color: #c8c8d4; text-shadow: 0 1px 2px #000; pointer-events: none; }
    #edHelp kbd { background: #2a2a34; border: 1px solid #44445a; border-radius: 4px; padding: 0 4px; font: inherit; }
    .edModal { position: fixed; inset: 0; z-index: 20; background: #0009; display: grid; place-items: center; }
    .edModal .box { width: min(760px, calc(100vw - 40px)); max-height: calc(100vh - 60px); overflow: auto; }
    .edModal h2 { margin: 0 0 8px; font-size: 16px; }
    .edModal textarea { width: 100%; box-sizing: border-box; height: 300px; background: #15151b; border: 1px solid #3a3a48; border-radius: 8px; padding: 8px; font: 12px/1.4 Consolas, monospace; color: #e6e6ee; resize: vertical; }
    .edModal .btns { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; flex-wrap: wrap; }
    .edModal ul { margin: 6px 0; padding-left: 18px; color: #e0b070; font-size: 12px; max-height: 160px; overflow: auto; }
  `;
  document.head.appendChild(css);
  const el = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };
  const top = el(`<div id="edTop" class="ed panel"></div>`);
  const left = el(`<div id="edLeft" class="ed panel"></div>`);
  const right = el(`<div id="edRight" class="ed panel" style="display:none"></div>`);
  const help = el(`<div id="edHelp" class="ed">Clic : sélectionner · <b>glisser</b> : déplacer · <kbd>Maj</kbd> + glisser : monter / descendre · clic droit + glisser : tourner la vue · clic molette (ou <kbd>Maj</kbd> + clic droit) : déplacer la vue · molette : zoom · <kbd>Q</kbd>/<kbd>E</kbd> : pivoter · flèches, <kbd>Page↑</kbd>/<kbd>Page↓</kbd> : ajuster · <kbd>Ctrl</kbd>+<kbd>D</kbd> : dupliquer · <kbd>Suppr</kbd> · <kbd>Ctrl</kbd>+<kbd>Z</kbd></div>`);
  document.body.append(top, left, right, help);

  let statusText = '';
  const setStatus = t => { statusText = t; const s = top.querySelector('.st'); if (s) s.textContent = t; };
  let miiVisible = true;
  function renderTopbar() {
    top.innerHTML = `<b>🧱 Éditeur de scène</b>
      <button data-a="undo" ${undo.length ? '' : 'disabled'} title="Annuler (Ctrl+Z)">↶ Annuler</button>
      <button data-a="redo" ${redo.length ? '' : 'disabled'} title="Rétablir (Ctrl+Y)">↷ Rétablir</button>
      <button data-a="snap" class="${snap ? 'on' : ''}" title="Aimant : pas de 0,05 et angles de 15°">🧲 Aimant</button>
      <button data-a="mii" class="${miiVisible ? '' : 'on'}" title="Masquer le Mii pour mieux voir">${miiVisible ? '🙈 Masquer le Mii' : '👁 Montrer le Mii'}</button>
      <button data-a="home" title="Voir tout : le Mii et tous les objets">⤢ Tout voir</button>
      <span class="st">${statusText}</span>`;
  }
  top.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'undo') doUndo();
    if (a === 'redo') doRedo();
    if (a === 'snap') snap = !snap;
    if (a === 'mii') {
      miiVisible = !miiVisible;
      rig.root.visible = miiVisible;
      for (const p of rig.props) p.visible = miiVisible;
      if (miiVisible) applyBaseLive();
    }
    if (a === 'home') {
      const all = box0.clone();
      for (const g of groups.values()) all.expandByObject(g);
      for (const S of rig.baseScreens || []) all.expandByObject(S.grp);
      Object.assign(cam, { target: all.getCenter(V()), az: 35, el: 28, dist: Math.max(all.getSize(V()).length() * 1.7, box0.getSize(V()).length() * 2.6) });
      applyCamera();
    }
    renderTopbar();
  });

  function renderAddPanel() {
    const shapes = Object.entries(SHAPES).filter(([k]) => k !== 'glb')
      .map(([k, s]) => `<button data-add="${k}" title="Ajouter : ${s.label}"><span>${s.icon}</span>${s.label}</button>`).join('');
    const models = userModels.length
      ? `<div class="row"><select id="edGlb">${userModels.map(m => `<option>${escapeHtml(m)}</option>`).join('')}</select><button data-add="glb" title="Ajouter ce modèle">＋</button></div>`
      : `<div class="muted">Déposez des fichiers .glb dans le dossier <b>Objets</b>, puis ↻.</div>`;
    left.innerHTML = `<h3>Scène</h3>
      <div class="io">
        <button data-io="import" title="Ouvrir un fichier de scène (.json)">📥 Importer</button>
        <button data-io="export" title="Enregistrer la scène dans un fichier pour la partager">📤 Exporter</button>
        <button data-io="paste" title="Coller une scène écrite par une IA (ou copiée)">📋 Coller</button>
        <button data-io="ai" title="Faire créer une scène par une IA (ChatGPT, Claude, Gemini…)">🤖 Avec une IA</button>
      </div>
      <h3 style="margin-top:12px">💾 Préréglages</h3>
      <div class="presets" id="edPresets"></div>
      <button data-pre="save" class="primary wide" title="Garder la scène actuelle comme préréglage, sous un nom, pour y revenir d'un clic (ou d'un raccourci)">💾 Enregistrer la scène…</button>
      <h3 style="margin-top:12px">Ajouter</h3><div class="shapes">${shapes}</div>
      <h3 style="margin-top:12px">📦 Objets 3D</h3>${models}
      <div class="row"><button data-act="openObjets">📁 Objets</button><button data-act="openTextures">📁 Images</button><button data-act="refresh" title="Actualiser les listes">↻</button></div>
      <h3 style="margin-top:12px">Éléments de base</h3><div class="list" id="edBase"></div>
      <h3 style="margin-top:12px">Dans la scène</h3><div class="list" id="edList"></div>`;
    renderList(); renderPresets();
  }
  function renderPresets() {
    const box = left.querySelector('#edPresets'); if (!box) return;
    const dirty = currentPreset && presetBase !== JSON.stringify(data);
    box.innerHTML = presets.length
      ? presets.map(p => {
        const on = p.file === currentPreset;
        const info = p.objets < 0 ? '⚠ à vérifier' : `${p.objets} objet${p.objets > 1 ? 's' : ''}` + (on ? (dirty ? ' · modifiée depuis' : ' · chargée') : '');
        return `<div class="pre ${on ? 'on' : ''}">
          <button data-pre="load" data-f="${escapeHtml(p.file)}" title="Charger « ${escapeHtml(p.nom)} » (Ctrl+Z pour revenir)${p.description ? '\n' + escapeHtml(p.description) : ''}"><b>${escapeHtml(p.nom)}</b><small>${info}</small></button>
          <button data-pre="ren" data-f="${escapeHtml(p.file)}" title="Renommer">✏️</button>
          <button data-pre="del" data-f="${escapeHtml(p.file)}" title="Supprimer (va dans la Corbeille)">🗑</button></div>`;
      }).join('')
      : `<div class="muted">Aucun préréglage : enregistrez la scène actuelle pour la retrouver plus tard.</div>`;
  }
  const presetOf = f => presets.find(p => p.file === f);
  function showSavePreset() {
    const cur = presetOf(currentPreset);
    const m = modal(`<h2>💾 Enregistrer comme préréglage</h2>
      <div class="row"><label>Nom</label><input type="text" id="edPreName" maxlength="80" value="${escapeHtml(cur?.nom || data.nom || '')}" placeholder="Ma chambre de stream"></div>
      <div class="muted">Le préréglage garde tous les objets, la table et les écrans du décor. Rechargez-le ici, dans les réglages
        (Décor &amp; scène), depuis le menu de l'icône ou avec un raccourci (Réglages → ⌨️ Raccourcis).</div>
      <div class="muted" id="edPreWarn" style="margin-top:6px;color:#e0b070"></div>
      <div class="btns"><button data-close>Annuler</button><button data-go class="primary">💾 Enregistrer</button></div>`,
      (e, m) => {
        if (e.target.closest('[data-close]')) { m.remove(); return; }
        if (e.target.closest('[data-go]')) go();
      });
    const input = m.querySelector('#edPreName'), warn = m.querySelector('#edPreWarn'), btn = m.querySelector('[data-go]');
    const clash = () => presets.find(p => p.nom.toLowerCase() === input.value.trim().toLowerCase());
    const check = () => {
      const c = clash();
      warn.textContent = c ? `Un préréglage « ${c.nom} » existe déjà : il sera remplacé.` : '';
      btn.textContent = c ? '💾 Remplacer' : '💾 Enregistrer';
    };
    const go = () => {
      const name = input.value.trim();
      if (!name) { warn.textContent = 'Donnez-lui un nom.'; input.focus(); return; }
      m.remove();
      if (!host) { setStatus("Préréglages : depuis l'appli seulement"); return; }
      host.postMessage({ type: 'savePreset', name, data });
    };
    input.addEventListener('input', check);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') m.remove(); });
    check(); input.focus(); input.select();
  }
  function showRenamePreset(file) {
    const p = presetOf(file); if (!p) return;
    const m = modal(`<h2>✏️ Renommer le préréglage</h2>
      <div class="row"><label>Nom</label><input type="text" id="edPreName" maxlength="80" value="${escapeHtml(p.nom)}"></div>
      <div class="muted">Ses raccourcis suivent le nouveau nom.</div>
      <div class="btns"><button data-close>Annuler</button><button data-go class="primary">Renommer</button></div>`,
      (e, m) => { if (e.target.closest('[data-close]')) m.remove(); if (e.target.closest('[data-go]')) go(); });
    const input = m.querySelector('#edPreName');
    const go = () => {
      const name = input.value.trim(); m.remove();
      if (!name || name === p.nom) return;
      if (currentPreset === file) pendingRename = name.toLowerCase();
      host?.postMessage({ type: 'renamePreset', file, name });
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') m.remove(); });
    input.focus(); input.select();
  }
  let pendingRename = null;
  function showDeletePreset(file) {
    const p = presetOf(file); if (!p) return;
    modal(`<h2>🗑 Supprimer « ${escapeHtml(p.nom)} » ?</h2>
      <div class="muted">Le fichier va dans la Corbeille de Windows (récupérable). Votre scène actuelle ne change pas.</div>
      <div class="btns"><button data-close>Annuler</button><button data-go class="primary">Supprimer</button></div>`,
      (e, m) => {
        if (e.target.closest('[data-close]')) m.remove();
        if (e.target.closest('[data-go]')) { m.remove(); host?.postMessage({ type: 'deletePreset', file }); }
      });
  }
  function loadPresetText(m) {
    let res;
    try { res = normalizeScene(m.text); }
    catch (err) { modal(`<h2>⚠ Préréglage illisible</h2><div>${escapeHtml(m.name)} : ${escapeHtml(err.message)}</div><div class="btns"><button data-close>OK</button></div>`, (e, mm) => { if (e.target.closest('[data-close]')) mm.remove(); }); return; }
    const s = res.scene;
    s.format = 'sullys-mii-bongo-scene'; s.version = 2;
    if (JSON.stringify(s) !== JSON.stringify(data)) {
      replaceData(s);
      select(null);
      document.querySelector('[data-a=home]')?.click();
    }
    currentPreset = m.file; presetBase = JSON.stringify(data);
    renderPresets();
    setStatus((m.external ? '✓ Chargé depuis les réglages : « ' : '✓ Chargé : « ') + m.name + ' »' + (res.warnings.length ? ` (${res.warnings.length} correction${res.warnings.length > 1 ? 's' : ''})` : '') + (m.external ? '' : ' · Ctrl+Z pour revenir'));
  }
  left.addEventListener('click', e => {
    const pre = e.target.closest('[data-pre]');
    if (pre) {
      const f = pre.dataset.f;
      if (pre.dataset.pre === 'save') showSavePreset();
      if (pre.dataset.pre === 'load') host ? host.postMessage({ type: 'loadPreset', file: f }) : setStatus("Préréglages : depuis l'appli seulement");
      if (pre.dataset.pre === 'ren') showRenamePreset(f);
      if (pre.dataset.pre === 'del') showDeletePreset(f);
      return;
    }
    const add = e.target.closest('[data-add]')?.dataset.add;
    if (add === 'glb') { const f = left.querySelector('#edGlb')?.value; if (f) addObject('glb', { file: f, name: f.replace(/\.(glb|gltf)$/i, '') }); return; }
    if (add) { addObject(add); return; }
    const io = e.target.closest('[data-io]')?.dataset.io;
    if (io === 'import') { host ? host.postMessage({ type: 'importScene' }) : setStatus("Importer : depuis l'appli seulement"); return; }
    if (io === 'export') { showExport(); return; }
    if (io === 'paste') { showPaste(); return; }
    if (io === 'ai') { showAiGuide(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'refresh') { refreshLists(); return; }
    if (act) { host?.postMessage({ type: 'action', name: act }); return; }
    const pickId = e.target.closest('[data-sel]')?.dataset.sel;
    if (pickId) select(pickId);
  });
  function renderList() {
    const base = left.querySelector('#edBase');
    if (base) {
      const items = [];
      items.push(['@mii', '🧍 Le Mii (sa place)']);
      if (rig.table) items.push(['@table', '🪑 Table du bureau' + (data.base.table?.hidden ? ' (masquée)' : '')]);
      (rig.baseScreens || []).forEach((S, i) => items.push(['@screen' + i, `🖥️ Écran ${i + 1} du décor` + (data.base.screens?.[i]?.hidden ? ' (masqué)' : '')]));
      base.innerHTML = items.length
        ? items.map(([id, t]) => `<button data-sel="${id}" class="${id === selected ? 'on' : ''}">${t}</button>`).join('')
        : `<div class="muted">Table : mode clavier + souris. Écrans : décor activé avec « Deux écrans ».</div>`;
    }
    const list = left.querySelector('#edList'); if (!list) return;
    list.innerHTML = data.objects.length
      ? data.objects.map(o => `<button data-sel="${o.id}" class="${o.id === selected ? 'on' : ''}">${SHAPES[o.type]?.icon || '•'} ${escapeHtml(o.name || o.type)}</button>`).join('')
      : `<div class="muted">Aucun objet pour l'instant : ajoutez-en un ci-dessus.</div>`;
  }

  const swatch = {};
  for (const k of Object.keys(TEXTURES)) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    c.getContext('2d').drawImage(textureCanvas(k), 0, 0, 512, 512, 0, 0, 64, 64);
    swatch[k] = c.toDataURL();
  }
  const texGrid = current => {
    const list = [...Object.entries(TEXTURES).map(([k, t]) => [k, t.label, `url(${swatch[k]})`]),
      ...userImages.map(f => ['img:' + f, f.replace(/\.[^.]+$/, ''), `url('./textures/${encodeURIComponent(f)}')`])];
    return `<div class="tex">${list.map(([k, label, bg]) => `<button data-tex="${escapeHtml(k)}" class="${current === k ? 'on' : ''}" style="background-image:${bg}" title="${escapeHtml(label)}"><i>${escapeHtml(label)}</i></button>`).join('')}</div>
      <div class="muted" style="margin-top:4px">Vos images : dossier <b>Images</b> (bouton 📁 à gauche).</div>`;
  };
  const sourceButtons = current => {
    const btn = (v, label) => `<button data-src="${escapeHtml(String(v))}" class="${String(current) === String(v) ? 'on' : ''}">${label}</button>`;
    const mons = Array.from({ length: Math.max(monitorCount, typeof current === 'number' ? current : 0) }, (_, i) => btn(i + 1, i === 0 ? '🖥️ Écran 1 (principal)' : `🖥️ Écran ${i + 1}`));
    return `<div class="src">${mons.join('')}${btn('off', '⬛ Éteint')}${userImages.map(f => btn('img:' + f, '🖼️ ' + escapeHtml(f.replace(/\.[^.]+$/, '')))).join('')}</div>
      <div class="muted" style="margin-top:4px">Écran 1 = votre écran principal. Une image : dossier <b>Images</b>.</div>`;
  };
  const num = (k, i, step, label, v) => `<div>${label}<input type="number" step="${step}" data-k="${k}.${i}" value="${fmt(v)}"></div>`;

  function renderProps(valuesOnly = false) {
    const o = byId(selected), si = baseScreenIndex(selected);
    right.style.display = o || selected === '@mii' || selected === '@table' && rig.table || si >= 0 ? '' : 'none';
    if (right.style.display === 'none') return;
    if (valuesOnly) {
      const vals = o || (si >= 0 ? { ...screenData(si), ...currentScreenPose(si) } : null);
      if (vals) right.querySelectorAll('[data-k]').forEach(inp => { const [k, i] = inp.dataset.k.split('.'); if (vals[k] && i != null && document.activeElement !== inp) inp.value = fmt(vals[k][i]); });
      return;
    }
    if (selected === '@table') return renderTable();
    if (selected === '@mii') return renderMii();
    if (si >= 0) return renderBaseScreen(si);
    const isGlb = o.type === 'glb', isScreen = o.type === 'screen';
    right.innerHTML = `<h3>${SHAPES[o.type].icon} Objet sélectionné</h3>
      <div class="row"><label>Nom</label><input type="text" data-f="name" value="${escapeHtml(o.name || '')}"></div>
      <div class="row"><label>Position</label><div class="trio">${num('pos', 0, 0.05, '← →', o.pos[0])}${num('pos', 1, 0.05, 'hauteur', o.pos[1])}${num('pos', 2, 0.05, 'avant / arr.', o.pos[2])}</div></div>
      <div class="row"><label>Pivoter</label><input type="range" min="-180" max="180" step="${snap ? 15 : 1}" data-k="rot.1" value="${o.rot[1]}"><span class="muted" style="width:38px;text-align:right">${Math.round(o.rot[1])}°</span></div>
      <div class="row"><label>Incliner</label><div class="trio">${num('rot', 0, snap ? 15 : 1, 'avant (°)', o.rot[0])}${num('rot', 2, snap ? 15 : 1, 'côté (°)', o.rot[2])}<div></div></div></div>
      ${isGlb
        ? `<div class="row"><label>Taille</label><div class="trio">${num('size', 0, 0.05, 'plus grande dimension', o.size[0])}<div></div><div></div></div></div>`
        : isScreen
        ? `<div class="row"><label>Taille</label><div class="trio">${num('size', 0, 0.05, 'largeur', o.size[0])}${num('size', 1, 0.05, 'hauteur', o.size[1])}<div style="justify-content:flex-end"><button data-do="ratio" title="Hauteur = largeur × 9/16">16:9</button></div></div></div>
           <h3 style="margin-top:12px">Affiche</h3>${sourceButtons(o.source)}
           <label class="chk"><input type="checkbox" data-f="stand" ${o.stand !== false ? 'checked' : ''}> Pied jusqu'au sol</label>
           <div class="row"><label>Cadre</label><input type="color" data-f="color" value="${o.color || '#1b1b20'}"></div>`
        : `<div class="row"><label>Taille</label><div class="trio">${num('size', 0, 0.05, 'largeur', o.size[0])}${num('size', 1, 0.05, 'hauteur', o.size[1])}${num('size', 2, 0.05, 'profondeur', o.size[2])}</div></div>
           <h3 style="margin-top:12px">Texture</h3>${texGrid(o.tex)}
           <div class="row"><label>Couleur</label><input type="color" data-f="color" value="${o.color || '#ffffff'}"><button data-c="#ffffff" title="Sans teinte">⟲</button></div>
           <div class="row"><label>Motif</label><input type="range" min="0.2" max="4" step="0.05" data-f="texScale" value="${o.texScale ?? 1}"><span class="muted" style="width:38px;text-align:right">×${fmt(o.texScale ?? 1)}</span></div>`}
      <div class="acts"><button data-do="ground" title="Poser au sol">⬇ Au sol</button><button data-do="dup" title="Dupliquer (Ctrl+D)">⧉ Dupliquer</button><button data-do="del" class="danger" title="Supprimer (Suppr)">🗑 Suppr.</button></div>`;
  }
  function renderMii() {
    const p = (data.base.mii ||= { pos: [0, 0, 0] }).pos;
    right.innerHTML = `<h3>🧍 Le Mii</h3>
      <div class="muted">Rapprochez ou éloignez le Mii de son setup : seul le Mii bouge (avec sa chaise) ; le clavier, la manette ou le volant restent en place et ses bras les suivent.</div>
      <div class="row" style="margin-top:10px"><label>Avancer</label><input type="range" min="-0.6" max="0.6" step="0.01" data-m="2" value="${p[2]}"><span class="muted" style="width:42px;text-align:right">${fmt(p[2])}</span></div>
      <div class="muted">+ : plus près du bureau / de l'instrument · − : plus loin</div>
      <div class="row"><label>Décaler</label><input type="range" min="-0.6" max="0.6" step="0.01" data-m="0" value="${p[0]}"><span class="muted" style="width:42px;text-align:right">${fmt(p[0])}</span></div>
      <div class="muted">+ : vers sa gauche · − : vers sa droite. Vous pouvez aussi le faire glisser dans la vue.</div>
      <div class="acts"><button data-do="resetMii" style="grid-column:1/-1">↺ Remettre le Mii à sa place</button></div>`;
  }
  function renderTable() {
    const t = { ...TABLE_DEFAULT, ...(data.base.table || {}) };
    right.innerHTML = `<h3>🪑 Table du bureau</h3>
      <div class="muted">Élément de base du mode clavier + souris : le clavier et la souris restent posés dessus.</div>
      <h3 style="margin-top:12px">Plateau</h3>${texGrid(t.tex)}
      <div class="row"><label>Couleur</label><input type="color" data-t="color" value="${t.color}"><button data-tc="color:#ffffff" title="Sans teinte">⟲</button></div>
      <div class="row"><label>Motif</label><input type="range" min="0.2" max="4" step="0.05" data-t="texScale" value="${t.texScale}"><span class="muted" style="width:38px;text-align:right">×${fmt(t.texScale)}</span></div>
      <div class="row"><label>Largeur</label><input type="range" min="0.6" max="2.5" step="0.05" data-t="width" value="${t.width}"><span class="muted" style="width:38px;text-align:right">×${fmt(t.width)}</span></div>
      <div class="row"><label>Profondeur</label><input type="range" min="0.7" max="2.5" step="0.05" data-t="depth" value="${t.depth}"><span class="muted" style="width:38px;text-align:right">×${fmt(t.depth)}</span></div>
      <div class="row"><label>Pieds</label><input type="color" data-t="legColor" value="${t.legColor}"></div>
      <div class="row"><label>Tapis souris</label><input type="color" data-t="padColor" value="${t.padColor}"></div>
      <label class="chk"><input type="checkbox" data-t="hidden" ${t.hidden ? 'checked' : ''}> Masquer la table (clavier et souris restent)</label>
      <div class="acts"><button data-do="resetTable" style="grid-column:1/-1">↺ Table d'origine</button></div>`;
  }
  function renderBaseScreen(i) {
    const e = screenData(i), pose = currentScreenPose(i);
    right.innerHTML = `<h3>🖥️ Écran ${i + 1} du décor</h3>
      <h3 style="margin-top:6px">Affiche</h3>${sourceButtons(e.source ?? i + 1)}
      <div class="row" style="margin-top:12px"><label>Position</label><div class="trio">${num('pos', 0, 0.05, '← →', pose.pos[0])}${num('pos', 1, 0.05, 'hauteur', pose.pos[1])}${num('pos', 2, 0.05, 'avant / arr.', pose.pos[2])}</div></div>
      <div class="row"><label>Pivoter</label><input type="range" min="-180" max="180" step="${snap ? 15 : 1}" data-k="rot.1" value="${pose.rot[1]}"><span class="muted" style="width:38px;text-align:right">${Math.round(pose.rot[1])}°</span></div>
      <div class="row"><label>Incliner</label><div class="trio">${num('rot', 0, snap ? 15 : 1, 'avant (°)', pose.rot[0])}${num('rot', 2, snap ? 15 : 1, 'côté (°)', pose.rot[2])}<div></div></div></div>
      <div class="row"><label>Taille</label><input type="range" min="0.3" max="3" step="0.05" data-s="size" value="${e.size || 1}"><span class="muted" style="width:38px;text-align:right">×${fmt(e.size || 1)}</span></div>
      <div class="row"><label>Cadre</label><input type="color" data-s="color" value="${e.color || '#1b1b20'}"></div>
      <label class="chk"><input type="checkbox" data-s="hidden" ${e.hidden ? 'checked' : ''}> Masquer cet écran</label>
      <div class="acts"><button data-do="resetScreen" style="grid-column:1/-1">↺ Remettre à sa place d'origine</button></div>
      <div class="muted" style="margin-top:8px">Position = centre de l'écran. Pour d'autres écrans, ajoutez un « Écran » (à gauche).</div>`;
  }

  right.addEventListener('input', e => {
    const t = e.target, o = byId(selected), si = baseScreenIndex(selected);
    const label = (txt) => { if (t.nextElementSibling?.classList.contains('muted')) t.nextElementSibling.textContent = txt; };
    if (t.dataset.k && (o || si >= 0)) {
      const [k, i] = t.dataset.k.split('.'); const v = parseFloat(t.value); if (!Number.isFinite(v)) return;
      if (si >= 0) {
        const e2 = screenData(si); const pose = currentScreenPose(si);
        e2.pos ||= pose.pos; e2.rot ||= pose.rot;
        e2[k][i] = v; applyBaseLive();
      } else {
        o[k][i] = k === 'size' ? Math.max(0.01, v) : v;
        if (k === 'size') rebuild(o); else placeGroup(o);
      }
      if (t.type === 'range') label(Math.round(v) + '°');
    } else if (t.dataset.m) {
      const p = (data.base.mii ||= { pos: [0, 0, 0] }).pos;
      p[+t.dataset.m] = parseFloat(t.value);
      label(fmt(p[+t.dataset.m]));
      applyBaseLive();
    } else if (t.dataset.t) {
      const tb = tableData(), k = t.dataset.t;
      tb[k] = t.type === 'checkbox' ? t.checked : t.type === 'range' ? parseFloat(t.value) : t.value;
      if (t.type === 'range') label('×' + fmt(tb[k]));
      applyBaseLive();
    } else if (t.dataset.s && si >= 0) {
      const e2 = screenData(si), k = t.dataset.s;
      e2[k] = t.type === 'checkbox' ? t.checked : t.type === 'range' ? parseFloat(t.value) : t.value;
      if (t.type === 'range') label('×' + fmt(e2[k]));
      applyBaseLive();
    } else if (o) {
      if (t.dataset.f === 'color') { o.color = t.value; rebuild(o); }
      else if (t.dataset.f === 'texScale') { o.texScale = parseFloat(t.value); label('×' + fmt(o.texScale)); rebuild(o); }
      else if (t.dataset.f === 'name') { o.name = t.value; renderList(); }
      else if (t.dataset.f === 'stand') { o.stand = t.checked; rebuild(o); }
    }
  });
  right.addEventListener('change', () => { commit(true); renderList(); });
  right.addEventListener('click', e => {
    const o = byId(selected), si = baseScreenIndex(selected);
    const tex = e.target.closest('[data-tex]')?.dataset.tex;
    if (tex) {
      if (selected === '@table') {
        const tb = tableData(); tb.tex = tex;
        if (tex !== 'uni' && tb.color === TABLE_DEFAULT.color) { tb.color = '#ffffff'; right.querySelector('[data-t=color]').value = '#ffffff'; }
        applyBaseLive();
      }
      else if (o) { o.tex = tex; rebuild(o); }
      commit(true);
      right.querySelectorAll('[data-tex]').forEach(b => b.classList.toggle('on', b.dataset.tex === tex));
      return;
    }
    const src = e.target.closest('[data-src]')?.dataset.src;
    if (src != null) {
      const v = /^\d+$/.test(src) ? +src : src;
      if (si >= 0) { screenData(si).source = v; applyBaseLive(); }
      else if (o) { o.source = v; rebuild(o); }
      commit(true);
      right.querySelectorAll('[data-src]').forEach(b => b.classList.toggle('on', b.dataset.src === src));
      return;
    }
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (c && o) { o.color = c; rebuild(o); commit(true); right.querySelector('[data-f=color]').value = c; return; }
    const tc = e.target.closest('[data-tc]')?.dataset.tc;
    if (tc) { const [k, v] = tc.split(':'); tableData()[k] = v; applyBaseLive(); commit(true); right.querySelector(`[data-t=${k}]`).value = v; return; }
    const d = e.target.closest('[data-do]')?.dataset.do;
    if (d === 'ground' && o) { o.pos[1] = 0; placeGroup(o); commit(true); }
    if (d === 'ratio' && o) { o.size[1] = Math.round(o.size[0] * 9 / 16 * 1000) / 1000; rebuild(o); commit(true); renderProps(true); }
    if (d === 'dup') duplicateSelected();
    if (d === 'del') removeSelected();
    if (d === 'resetTable') { delete data.base.table; applyBaseLive(); commit(); }
    if (d === 'resetMii') { data.base.mii = { pos: [0, 0, 0] }; applyBaseLive(); commit(); }
    if (d === 'resetScreen' && si >= 0) { data.base.screens[si] = { source: si + 1, color: '#1b1b20', hidden: false }; applyBaseLive(); commit(); }
  });

  const modal = (html, onClick) => {
    document.querySelector('.edModal')?.remove();
    const m = el(`<div class="edModal ed"><div class="box panel">${html}</div></div>`);
    m.addEventListener('click', e => { if (e.target === m) m.remove(); else onClick?.(e, m); });
    document.body.appendChild(m);
    return m;
  };
  function askImport(raw, origin) {
    let res;
    try { res = normalizeScene(raw); }
    catch (err) { modal(`<h2>⚠ Scène illisible</h2><div>${escapeHtml(err.message)}</div><div class="btns"><button data-close>OK</button></div>`, (e, m) => { if (e.target.closest('[data-close]')) m.remove(); }); return; }
    const { scene: s, warnings } = res;
    const baseInfo = [s.base.table && 'table', s.base.screens && 'écrans du décor'].filter(Boolean).join(' et ');
    modal(`<h2>📥 Importer ${s.nom ? '« ' + escapeHtml(s.nom) + ' »' : 'la scène'}</h2>
      ${s.description ? `<div class="muted">${escapeHtml(s.description)}</div>` : ''}
      <div style="margin-top:6px">${s.objects.length} objet${s.objects.length > 1 ? 's' : ''}${baseInfo ? ' + réglages de la ' + baseInfo : ''} (${escapeHtml(origin)}).</div>
      ${warnings.length ? `<div style="margin-top:8px">Remarques :</div><ul>${warnings.slice(0, 40).map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : ''}
      <div class="btns"><button data-close>Annuler</button><button data-mode="add">➕ Ajouter à ma scène</button><button data-mode="replace" class="primary">Remplacer ma scène</button></div>`,
      (e, m) => {
        if (e.target.closest('[data-close]')) { m.remove(); return; }
        const mode = e.target.closest('[data-mode]')?.dataset.mode; if (!mode) return;
        m.remove();
        if (mode === 'replace') replaceData(s);
        else {
          const merged = JSON.parse(JSON.stringify(data));
          const ids = new Set(merged.objects.map(o => o.id));
          for (const o of s.objects) { if (ids.has(o.id)) o.id = newId(); merged.objects.push(o); }
          if (s.base.table) merged.base.table = s.base.table;
          if (s.base.screens) merged.base.screens = s.base.screens;
          replaceData(merged);
        }
        select(null);
        document.querySelector('[data-a=home]')?.click();
        setStatus(`✓ ${s.objects.length} objet(s) importé(s)`);
      });
  }
  function showPaste() {
    modal(`<h2>📋 Coller une scène</h2>
      <div class="muted">Collez ici la réponse de l'IA (ou une scène copiée). Le texte autour du JSON et les \`\`\` sont ignorés.</div>
      <textarea id="edPaste" placeholder='{ "nom": "…", "objects": [ … ] }' style="margin-top:8px"></textarea>
      <div class="btns"><button data-close>Annuler</button><button data-go class="primary">Importer</button></div>`,
      (e, m) => {
        if (e.target.closest('[data-close]')) m.remove();
        if (e.target.closest('[data-go]')) { const t = m.querySelector('#edPaste').value; m.remove(); askImport(t, 'texte collé'); }
      }).querySelector('textarea').focus();
  }
  function showExport() {
    modal(`<h2>📤 Exporter la scène</h2>
      <div class="row"><label>Nom</label><input type="text" id="edName" value="${escapeHtml(data.nom || '')}" placeholder="Ma chambre de gamer"></div>
      <div class="row"><label>Description</label><input type="text" id="edDesc" value="${escapeHtml(data.description || '')}" placeholder="facultatif"></div>
      <div class="muted">Le fichier (.json) peut être partagé, réimporté, ou donné à une IA pour qu'elle le modifie.</div>
      <div class="btns"><button data-close>Annuler</button><button data-copy title="Copier le texte de la scène (pour le coller dans une IA)">📋 Copier le texte</button><button data-go class="primary">Enregistrer le fichier…</button></div>`,
      (e, m) => {
        const named = () => { data.nom = m.querySelector('#edName').value.trim(); data.description = m.querySelector('#edDesc').value.trim(); commit(); return { ...data }; };
        if (e.target.closest('[data-close]')) m.remove();
        if (e.target.closest('[data-copy]')) { copy(JSON.stringify(named(), null, 2)); setStatus('✓ Scène copiée'); m.remove(); }
        if (e.target.closest('[data-go]')) {
          const d = named(); m.remove();
          host ? host.postMessage({ type: 'exportScene', data: d }) : setStatus("Exporter : depuis l'appli seulement");
        }
      });
  }
  let guide = null;
  async function showAiGuide() {
    guide ??= await fetch('./guide-ia.md', { cache: 'no-store' }).then(r => r.text()).catch(() => '');
    modal(`<h2>🤖 Faire créer une scène par une IA</h2>
      <ol style="margin:4px 0 8px;padding-left:20px;line-height:1.6">
        <li><b>Copiez le guide</b> ci-dessous et collez-le dans votre IA (ChatGPT, Claude, Gemini, Copilot…).</li>
        <li>À la suite, <b>décrivez la scène</b> voulue, par ex. « une chambre de gamer avec des néons violets, un lit et deux étagères ».</li>
        <li>Copiez la réponse de l'IA, puis ici : <b>📋 Coller</b>. Les erreurs courantes sont corrigées toutes seules.</li>
      </ol>
      <textarea readonly id="edGuide">${escapeHtml(guide)}</textarea>
      <div class="btns"><button data-close>Fermer</button><button data-scene title="Pour demander à l'IA de modifier votre scène actuelle">📋 Copier aussi ma scène actuelle</button><button data-copy class="primary">📋 Copier le guide</button></div>`,
      (e, m) => {
        if (e.target.closest('[data-close]')) m.remove();
        if (e.target.closest('[data-copy]')) { copy(guide); setStatus('✓ Guide copié'); }
        if (e.target.closest('[data-scene]')) { copy(guide + '\n\n## Ma scène actuelle (à modifier)\n\n```json\n' + JSON.stringify(data, null, 2) + '\n```\n'); setStatus('✓ Guide + scène copiés'); }
      });
  }
  function copy(text) {
    navigator.clipboard?.writeText(text).catch(() => {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    });
  }
  host?.addEventListener('message', e => {
    const m = e.data || {};
    if (m.type === 'importText') askImport(m.text, 'fichier ' + (m.name || ''));
    if (m.type === 'exported') { setStatus('✓ Exportée : ' + (m.name || '')); refreshPresets(); }
    if (m.type === 'presetText') loadPresetText(m);
    if (m.type === 'presetSaved') { currentPreset = m.file; presetBase = JSON.stringify(data); setStatus('✓ Préréglage enregistré : « ' + m.name + ' »'); refreshPresets(); }
    if (m.type === 'presetsChanged') refreshPresets().then(() => {
      if (pendingRename) { const p = presets.find(q => q.nom.toLowerCase() === pendingRename); if (p) { currentPreset = p.file; renderPresets(); } pendingRename = null; }
    });
    if (m.type === 'error') setStatus('⚠ ' + (m.message || 'erreur'));
  });
  host?.postMessage({ type: 'ready' });

  renderTopbar(); renderAddPanel();
  await refreshLists();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
