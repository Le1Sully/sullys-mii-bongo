import * as THREE from 'three';

export const SLOTS = [
  { id: 'Head', nom: '🙂 Tête', req: true },
  { id: 'Spine_1', nom: '🧍 Bas du dos', req: true, aide: 'penche tout le haut du corps' },
  { id: 'Spine_2', nom: '👕 Poitrine', req: false },
  { id: 'Waist', nom: '🩳 Bassin', req: false },
  { id: 'Jaw', nom: '👄 Mâchoire', req: false, aide: "s'ouvre quand vous parlez au micro" },
  { id: 'MouthUpper', nom: '👄 Bouche (haut)', req: false, aide: 'se soulève un peu quand vous parlez au micro' },
  { id: 'MouthLower', nom: '👄 Bouche (bas)', req: false, aide: "s'ouvre vers le bas quand vous parlez au micro" },
  { id: 'Arm_1_L', nom: '💪 Bras gauche', req: true, cote: 'L' },
  { id: 'Arm_2_L', nom: '💪 Avant-bras gauche', req: true, cote: 'L' },
  { id: 'Wrist_L', nom: '✋ Main gauche', req: true, cote: 'L' },
  { id: 'Arm_1_R', nom: '💪 Bras droit', req: true, cote: 'R' },
  { id: 'Arm_2_R', nom: '💪 Avant-bras droit', req: true, cote: 'R' },
  { id: 'Wrist_R', nom: '🤚 Main droite', req: true, cote: 'R' },
  { id: 'Leg_1_L', nom: '🦵 Cuisse gauche', req: false, jambe: true, cote: 'L' },
  { id: 'Leg_2_L', nom: '🦵 Jambe gauche', req: false, jambe: true, cote: 'L' },
  { id: 'Ankle_L', nom: '🦶 Pied gauche', req: false, jambe: true, cote: 'L' },
  { id: 'Leg_1_R', nom: '🦵 Cuisse droite', req: false, jambe: true, cote: 'R' },
  { id: 'Leg_2_R', nom: '🦵 Jambe droite', req: false, jambe: true, cote: 'R' },
  { id: 'Ankle_R', nom: '🦶 Pied droit', req: false, jambe: true, cote: 'R' },
];
export const UPPER = ['Spine_1', 'Head', 'Arm_1_L', 'Arm_2_L', 'Wrist_L', 'Arm_1_R', 'Arm_2_R', 'Wrist_R'];
export const LEGS = ['Leg_1_L', 'Leg_2_L', 'Ankle_L', 'Leg_1_R', 'Leg_2_R', 'Ankle_R'];
const CANON = new Set(SLOTS.map(s => s.id));

export const osFileName = model => String(model).replace(/\.(glb|gltf|fbx|obj|dae|3mf|stl|ply|zip)$/i, '') + '.os.json';

export function bonesOf(root) {
  const list = [];
  root.traverse(o => { if (o.isBone) list.push(o); });
  if (list.length) return list;
  root.traverse(o => { if (o !== root && !o.isMesh && !o.isLight && !o.isCamera && o.children.length) list.push(o); });
  return list;
}

export const originalName = o => o.userData.nomOrigine ?? o.name;

const tokens = name => String(name).replace(/^.*[:|]/, '')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const LEFT = new Set(['l', 'left', 'lft', 'lf']), RIGHT = new Set(['r', 'right', 'rgt', 'rt']);
const NOISE = new Set(['j', 'bip', 'bip01', 'bip001', 'b', 'def', 'mixamorig', 'mixamorig1', 'mixamorig2', 'cc', 'base', 'c', 'jnt', 'joint', 'bn', 'bone', 'sk', 'skel', 'skeleton', 'ue', 'rig', 'armature', 'valvebiped', 'ns', 'npc', 'deform', 'mmd', 'sec']);
const BAD = new Set(['thumb', 'index', 'middle', 'mid', 'ring', 'pinky', 'little', 'finger', 'fingers', 'toe', 'toes', 'twist', 'roll', 'ik', 'fk', 'pole', 'target', 'end', 'nub', 'tip', 'top', 'mch', 'org', 'ctrl', 'ctl', 'con', 'helper', 'socket', 'prop', 'weapon', 'attach', 'null', 'dummy', 'ref', 'master', 'jiggle', 'aux', 'corrective', 'adj', 'dist', 'acce', 'tweak', 'vis', 'eye', 'eyes', 'jaw', 'brow', 'hair', 'ear', 'tail', 'skirt', 'breast', 'bust', 'cloth', 'sleeve', 'collar', 'hood', 'tongue', 'teeth', 'lip', 'mouth', 'cheek', 'nose', 'lid']);
const PARTS = {
  head: ['head'],
  hand: ['hand', 'wrist'],
  fore: ['forearm', 'lowerarm', 'elbow', 'lowarm', 'arm2', 'larm', 'forarm'],
  upper: ['arm', 'upperarm', 'uparm', 'arm1', 'uarm'],
  thigh: ['upleg', 'upperleg', 'thigh', 'leg1', 'uleg', 'hip'],
  shin: ['leg', 'lowerleg', 'calf', 'shin', 'knee', 'leg2', 'lowleg', 'lleg'],
  foot: ['foot', 'ankle'],
};

function describe(b, skin) {
  const t = tokens(b.name);
  const side = t.some(x => LEFT.has(x)) ? 'L' : t.some(x => RIGHT.has(x)) ? 'R' : null;
  const rest = t.filter(x => !LEFT.has(x) && !RIGHT.has(x) && !NOISE.has(x));
  const core = rest.filter(x => !/^\d+$/.test(x)).join('');
  const digits = rest.some(x => /^\d+$/.test(x));
  const bad = rest.some(x => BAD.has(x) || BAD.has(x.replace(/\d+$/, '')));
  let score = 0;
  if (t.includes('def')) score += 4;
  if (skin.has(b)) score += 2;
  if (!digits) score += 1;
  return { b, side, core, bare: core.replace(/\d+$/, ''), bad, score };
}

const isAncestor = (a, b) => { for (let o = b?.parent; o; o = o.parent) if (o === a) return true; return false; };
const depth = o => { let d = 0; for (let p = o.parent; p; p = p.parent) d++; return d; };
function lca(list) {
  list = list.filter(Boolean);
  if (!list.length) return null;
  const chain = o => { const c = []; for (let p = o; p; p = p.parent) c.unshift(p); return c; };
  const chains = list.map(chain);
  let i = 0;
  while (chains.every(c => c[i] && c[i] === chains[0][i])) i++;
  return chains[0][i - 1] || null;
}
const wp = o => { o.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); };

const JAW = /^(jaw|chin|mandible)\d*$/, MOUTH = /^(mouth|lip|lips|jaw)\d*$/;
const LOWER = new Set(['lower', 'low', 'bottom', 'bot', 'down', 'under']), UPPER_W = new Set(['upper', 'up', 'top']);
const NOT_FACE = new Set(['end', 'nub', 'tip', 'ctrl', 'ik', 'target', 'corner', 'tongue', 'teeth', 'tooth']);
function findFaceBone(root, head, skin, kind) {
  let best = null, bestScore = -Infinity;
  for (const b of bonesOf(root)) {
    if (!isAncestor(head, b)) continue;
    const t = tokens(b.name);
    if (t.some(x => NOT_FACE.has(x) || LEFT.has(x) || RIGHT.has(x))) continue;
    const low = t.some(x => LOWER.has(x)), up = t.some(x => UPPER_W.has(x));
    let ok;
    if (kind === 'jaw') ok = t.some(x => JAW.test(x)) && !low && !up;
    else ok = t.some(x => MOUTH.test(x)) && (kind === 'lower' ? low && !up : up && !low);
    if (!ok) continue;
    const score = (skin.has(b) ? 2 : 0) - depth(b) * 0.01;
    if (score > bestScore) { best = b; bestScore = score; }
  }
  return best;
}

export function detectBones(root) {
  root.updateMatrixWorld(true);
  const skin = new Set();
  root.traverse(o => { if (o.isSkinnedMesh) for (const b of o.skeleton.bones) skin.add(b); });
  const info = bonesOf(root).map(b => describe(b, skin)).filter(i => !i.bad);
  const pick = (part, side, under, above) => {
    const names = PARTS[part];
    const c = info.filter(i => (side ? i.side === side : !i.side) && (names.includes(i.core) || names.includes(i.bare))
      && (!under || isAncestor(under, i.b)) && (!above || isAncestor(i.b, above)));
    c.sort((a, b) => b.score - a.score || depth(a.b) - depth(b.b));
    return c[0]?.b || null;
  };
  const found = {};
  const head = pick('head', null);
  for (const side of ['L', 'R']) {
    const hand = pick('hand', side);
    let fore = hand && pick('fore', side, null, hand);
    if (hand && !fore) fore = hand.parent;
    let upper = fore && pick('upper', side, null, fore);
    if (fore && !upper) upper = fore.parent;
    Object.assign(found, { ['Arm_1_' + side]: upper, ['Arm_2_' + side]: fore, ['Wrist_' + side]: hand });
    const foot = pick('foot', side);
    let shin = foot && pick('shin', side, null, foot);
    if (foot && !shin) shin = foot.parent;
    let thigh = shin && pick('thigh', side, null, shin);
    if (shin && !thigh) thigh = shin.parent;
    Object.assign(found, { ['Leg_1_' + side]: thigh, ['Leg_2_' + side]: shin, ['Ankle_' + side]: foot });
  }
  found.Head = head;
  if (head) {
    found.Jaw = findFaceBone(root, head, skin, 'jaw');
    found.MouthUpper = findFaceBone(root, head, skin, 'upper');
    found.MouthLower = findFaceBone(root, head, skin, 'lower');
  }
  const chest = lca([head, found.Arm_1_L, found.Arm_1_R].filter(Boolean).length >= 2 ? [head, found.Arm_1_L, found.Arm_1_R] : []);
  if (chest) {
    const hips = found.Leg_1_L || found.Leg_1_R ? lca([chest, found.Leg_1_L, found.Leg_1_R]) : null;
    let low = chest;
    if (hips && hips !== chest) while (low.parent && low.parent !== hips) low = low.parent;
    found.Spine_1 = low;
    if (chest !== low) found.Spine_2 = chest;
    if (hips && hips !== low) found.Waist = hips;
  }
  let demiTour = false;
  const footL = found.Ankle_L || found.Ankle_R;
  const toe = footL?.children.find(c => c.isBone);
  const d = toe ? wp(toe).sub(wp(footL)) : null;
  if (d && Math.abs(d.z) > d.length() * 0.35) demiTour = d.z < 0;
  else if (found.Wrist_L && found.Wrist_R) demiTour = wp(found.Wrist_L).x < wp(found.Wrist_R).x;
  const os = {};
  for (const s of SLOTS) if (found[s.id]) os[s.id] = originalName(found[s.id]);
  return { os, demiTour };
}

export function applyBones(root, os) {
  const bones = bonesOf(root);
  for (const b of bones) b.userData.nomOrigine ??= b.name;
  const byName = new Map();
  for (const b of bones) if (!byName.has(b.userData.nomOrigine)) byName.set(b.userData.nomOrigine, b);
  const chosen = new Map(), problems = [];
  for (const s of SLOTS) {
    const src = os?.[s.id];
    if (!src) continue;
    const b = byName.get(src);
    if (!b) { problems.push(`${s.nom} : os « ${src} » introuvable`); continue; }
    const dup = [...chosen].find(([, o]) => o === b);
    if (dup) { if (s.req) problems.push(`${s.nom} : même os que ${SLOTS.find(x => x.id === dup[0]).nom}`); continue; }
    chosen.set(s.id, b);
  }
  const taken = new Set(chosen.values());
  root.traverse(o => { if (CANON.has(o.name) && !taken.has(o)) { o.userData.nomOrigine ??= o.name; o.name = o.name + ' (orig.)'; } });
  for (const [id, b] of chosen) b.name = id;
  return problems;
}

export function headBoxOf(root, head) {
  if (!head) return null;
  root.updateMatrixWorld(true);
  const sub = new Set();
  head.traverse(o => sub.add(o));
  const box = new THREE.Box3(), v = new THREE.Vector3();
  root.traverse(m => {
    if (!m.isSkinnedMesh) return;
    const g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position;
    if (!si || !sw || !pos) return;
    const bones = m.skeleton.bones;
    if (!bones.some(b => sub.has(b))) return;
    m.skeleton.update();
    const step = Math.max(1, Math.floor(pos.count / 30000));
    for (let i = 0; i < pos.count; i += step) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (sub.has(bones[si.getComponent(i, k)])) w += sw.getComponent(i, k);
      if (w < 0.5) continue;
      m.getVertexPosition(i, v);
      box.expandByPoint(v.applyMatrix4(m.matrixWorld));
    }
  });
  head.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) box.expandByObject(o); });
  return box.isEmpty() ? null : box;
}
