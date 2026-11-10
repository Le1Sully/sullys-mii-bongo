import { FilesetResolver, PoseLandmarker, FaceLandmarker } from './vendor/mediapipe/vision_bundle.mjs';

const host = window.chrome?.webview;
const P = new URLSearchParams(location.search);
const want = { cam: P.get('cam') || '', head: P.get('h') === '1', hands: P.get('m') === '1' };
const fps = () => (delegate === 'GPU' ? 20 : 12);
const VIRTUAL = /obs|virtual|vcam|xsplit|manycam|snap camera|streamlabs|nvidia broadcast|meta quest/i;
const BASE = new URL('./vendor/mediapipe/', location.href).href;

const send = m => { try { host.postMessage(m); } catch { } };
let lastStatus = '';
const status = s => { if (s !== lastStatus) { lastStatus = s; send({ t: 'cams', s }); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const rotY = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };

const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qinv = q => [-q[0], -q[1], -q[2], q[3]];
const qnorm = q => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return q.map(v => v / l); };
function qslerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? b.map(v => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) return qnorm(a.map((v, i) => v + (bb[i] - v) * t));
  const th = Math.acos(d), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + bb[i] * wb);
}
function qFromBasis(x, y, z) {
  const [m00, m10, m20] = x, [m01, m11, m21] = y, [m02, m12, m22] = z;
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]; }
  return qnorm(q);
}
const toVr = q => [-q[0], q[1], -q[2], q[3]];
function faceQuat(d) {
  const q = qFromBasis(norm([d[0], d[1], d[2]]), norm([d[4], d[5], d[6]]), norm([d[8], d[9], d[10]]));
  return toVr(q);
}

const neutral = { f: null, p: null };
const smooth = { q: [0, 0, 0, 1], yaw: null, l: null, r: null };
host?.addEventListener('message', e => { if (e.data?.cmd === 'recenter') { neutral.f = neutral.p = null; smooth.yaw = null; } });

let fileset, pose = null, face = null, delegate = 'GPU';
async function make(cls, file, extra) {
  return cls.createFromOptions(fileset, { baseOptions: { modelAssetPath: BASE + file, delegate }, runningMode: 'VIDEO', ...extra });
}
async function loadModels() {
  try { pose?.close(); face?.close(); } catch { }
  pose = await make(PoseLandmarker, 'pose_landmarker_lite.task', { numPoses: 1 });
  face = want.head ? await make(FaceLandmarker, 'face_landmarker.task', { numFaces: 1, outputFacialTransformationMatrixes: true }) : null;
}

async function openCamera() {
  const base = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  send({ t: 'camdev', list: devs.map(d => d.label).filter(Boolean) });
  const fail = (name, label) => Object.assign(new Error(name), { name, label });
  if (!devs.length) throw fail('NotFoundError');
  const list = want.cam ? devs.filter(d => d.label === want.cam) : devs.filter(d => !VIRTUAL.test(d.label));
  if (!list.length) throw fail(want.cam ? 'SelectedMissing' : 'OnlyVirtual', want.cam);
  let err;
  for (const d of list) {
    try { return await navigator.mediaDevices.getUserMedia({ video: { ...base, deviceId: { exact: d.deviceId } }, audio: false }); }
    catch (e) { err = e; err.label = d.label; }
  }
  throw err;
}

function cameraError(e) {
  const name = e?.label ? ` « ${e.label} »` : '';
  switch (e?.name) {
    case 'NotAllowedError': return 'accès à la caméra refusé : Paramètres Windows → Confidentialité → Caméra → autorisez les applications de bureau';
    case 'NotFoundError': case 'OverconstrainedError': return 'aucune caméra branchée';
    case 'SelectedMissing': return `caméra${name} introuvable : branchez-la ou choisissez-en une autre`;
    case 'OnlyVirtual': return 'seules des caméras virtuelles (OBS…) sont branchées : choisissez-en une dans la liste ou branchez une webcam';
    case 'NotReadableError': return `caméra${name} pas prête : débranchée, téléphone non connecté, ou déjà utilisée par une autre appli`;
    default: return `caméra${name} indisponible : ` + (e?.message || e);
  }
}

const r4 = a => a.map(v => Math.round(v * 1e4) / 1e4);

function analyse(img, ts) {
  const pr = pose.detectForVideo(img, ts);
  const fm = face ? face.detectForVideo(img, ts).facialTransformationMatrixes?.[0] : null;
  const wl = pr.worldLandmarks?.[0], nl = pr.landmarks?.[0];
  if (!wl || !nl) { status("personne n'est visible : placez-vous face à la caméra"); return; }
  const vis = (i, min = 0.5) => (nl[i].visibility ?? 1) > min && nl[i].x > -0.02 && nl[i].x < 1.02 && nl[i].y > -0.02 && nl[i].y < 1.02;
  const W = i => [-wl[i].x, -wl[i].y, wl[i].z];
  if (!vis(11) || !vis(12)) { status('épaules hors champ : reculez un peu'); return; }

  const sL = W(11), sR = W(12), mid = scale(add(sL, sR), 0.5);
  const right = sub(sR, sL);
  const yawNow = clamp(Math.atan2(-right[2], right[0]), -1, 1);
  smooth.yaw = smooth.yaw === null ? yawNow : smooth.yaw + wrap(yawNow - smooth.yaw) * 0.08;
  const body = v => rotY(sub(v, mid), -smooth.yaw);

  let hq = null, how = '';
  if (want.head) {
    if (fm) {
      const q = faceQuat(fm.data);
      if (!neutral.f) neutral.f = q;
      hq = qmul(q, qinv(neutral.f));
      how = 'visage';
    } else if (vis(0, 0.3) && vis(7, 0.3) && vis(8, 0.3)) {
      const eL = body(W(7)), eR = body(W(8)), nose = body(W(0));
      const x = norm(sub(eR, eL));
      let z = scale(sub(nose, scale(add(eL, eR), 0.5)), -1);
      z = norm(sub(z, scale(x, dot(x, z))));
      const q = qFromBasis(x, cross(z, x), z);
      if (!neutral.p) neutral.p = q;
      hq = qmul(q, qinv(neutral.p));
      how = 'tête (sans visage)';
    }
  }
  smooth.q = qslerp(smooth.q, hq || [0, 0, 0, 1], hq ? 0.6 : 0.1);

  const msg = { t: 'vr', cam: 1, h: [0, 0.24, -0.09, ...r4(smooth.q)] };
  const parts = how ? [how] : [];
  if (want.hands) {
    for (const [key, idx, name] of [['l', 15, 'main gauche'], ['r', 16, 'main droite']]) {
      if (!vis(idx)) { smooth[key] = null; continue; }
      const p = body(W(idx));
      smooth[key] = smooth[key] ? lerp3(smooth[key], p, 0.6) : p;
      msg[key] = [...r4(smooth[key]), 0, 0, 0, 1];
      parts.push(name);
    }
  }
  send(msg);
  status(parts.length ? 'suivi actif : ' + parts.join(', ') : 'vous êtes visible, mais ni la tête ni les mains ne sont suivies');
}
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

async function run() {
  if (!host) return;
  status('chargement du suivi');
  try {
    fileset = await FilesetResolver.forVisionTasks(BASE + 'wasm');
    try { await loadModels(); } catch { delegate = 'CPU'; await loadModels(); }
  } catch (e) { status('suivi impossible à charger : ' + (e?.message || e)); return; }

  for (;;) {
    let stream;
    status('ouverture de la caméra');
    try { stream = await openCamera(); } catch (e) { status(cameraError(e)); await sleep(4000); continue; }
    const track = stream.getVideoTracks()[0];
    const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
    let last = 0, lastTs = 0, fails = 0;
    status('caméra ouverte');
    for (;;) {
      let res;
      try { res = await reader.read(); } catch { break; }
      if (res.done) break;
      const frame = res.value, now = performance.now();
      if (now - last < 1000 / fps() - 2) { frame.close(); continue; }
      last = now;
      let bmp;
      try { bmp = await createImageBitmap(frame, { resizeWidth: 640, resizeQuality: 'low' }); }
      catch { continue; }
      finally { frame.close(); }
      const ts = Math.max(Math.round(now), lastTs + 1);
      lastTs = ts;
      try { analyse(bmp, ts); fails = 0; }
      catch (e) {
        if (++fails > 5 && delegate === 'GPU') { delegate = 'CPU'; try { await loadModels(); } catch { } fails = 0; }
        else status('erreur de suivi : ' + (e?.message || e));
      }
      finally { bmp.close(); }
    }
    try { track.stop(); } catch { }
    status('caméra déconnectée, nouvel essai…');
    await sleep(3000);
  }
}

run();
