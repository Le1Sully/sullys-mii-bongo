import * as THREE from 'three';

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const COLORS = [0xe53935, 0x43a047, 0x2f6bea];
const HOVER = 0xffd23f;
const BASIS = [
  new THREE.Matrix4().makeBasis(AXES[1], AXES[2], AXES[0]),
  new THREE.Matrix4().makeBasis(AXES[2], AXES[0], AXES[1]),
  new THREE.Matrix4(),
];

const mat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const hidden = () => new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });

function label(text, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 46px Segoe UI, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(text, 32, 34);
  g.fillStyle = color; g.fillText(text, 32, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, depthWrite: false, toneMapped: false }));
  s.scale.setScalar(0.2);
  s.renderOrder = 1001;
  return s;
}

export class Gizmo {
  constructor({ scene, camera, canvas, onStart, onChange, onEnd, size = 0.36 }) {
    Object.assign(this, { scene, camera, canvas, onStart, onChange, onEnd, size });
    this.modes = { move: true, plane: true, rotate: true, scale: true, center: true };
    this.root = new THREE.Group();
    this.root.visible = false;
    this.root.renderOrder = 1000;
    this.handles = [];
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.drag = null;
    this.hovered = null;
    this.target = () => null;
    this.build();
    scene.add(this.root);
    const tick = () => { if (this.disposed) return; this.update(); requestAnimationFrame(tick); };
    tick();
  }

  add(kind, axis, mesh, picker, colorMats) {
    mesh.renderOrder = 1000;
    this.root.add(mesh);
    if (picker) this.root.add(picker);
    const h = { kind, axis, mesh, picker: picker || mesh, mats: colorMats, base: colorMats.map(m => m.color.getHex()) };
    (picker || mesh).userData.handle = h;
    this.handles.push(h);
    return h;
  }

  build() {
    for (let i = 0; i < 3; i++) {
      const color = COLORS[i], toAxis = new THREE.Quaternion().setFromUnitVectors(AXES[1], AXES[i]);
      const m = mat(color);
      const arrow = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.78, 8).translate(0, 0.49, 0), m);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.2, 16).translate(0, 0.98, 0), m);
      arrow.add(shaft, cone);
      arrow.quaternion.copy(toAxis);
      const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 8).translate(0, 0.6, 0), hidden());
      pick.quaternion.copy(toAxis);
      this.add('move', i, arrow, pick, [m]);

      const sm = mat(color);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), sm);
      ball.position.copy(AXES[i]).multiplyScalar(0.62);
      const ballPick = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), hidden());
      ballPick.position.copy(ball.position);
      this.add('scale', i, ball, ballPick, [sm]);

      const am = mat(color, 0.9);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.022, 6, 40, Math.PI / 2), am);
      arc.quaternion.setFromRotationMatrix(BASIS[i]);
      const arcPick = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.075, 6, 24, Math.PI / 2), hidden());
      arcPick.quaternion.copy(arc.quaternion);
      this.add('rotate', i, arc, arcPick, [am]);

      const pm = mat(0xcfcfd4, 0.55), em = new THREE.LineBasicMaterial({ color, transparent: true, depthTest: false, toneMapped: false });
      const plane = new THREE.Group();
      const sq = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), pm);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.2, 0.2)), em);
      edge.renderOrder = 1000;
      plane.add(sq, edge);
      plane.quaternion.setFromRotationMatrix(BASIS[i]);
      plane.position.set(0.36, 0.36, 0).applyQuaternion(plane.quaternion);
      const planePick = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), hidden());
      planePick.quaternion.copy(plane.quaternion); planePick.position.copy(plane.position);
      this.add('plane', i, plane, planePick, [pm]);

      const l = label('XYZ'[i], '#ffe14d');
      l.position.copy(AXES[i]).multiplyScalar(1.2);
      this.root.add(l);
      (this.labels ||= []).push(l);
    }
    const cm = mat(0xffe14d);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), cm);
    this.add('center', -1, dot, new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), hidden()), [cm]);
    this.root.traverse(o => { o.renderOrder = Math.max(o.renderOrder, 1000); o.frustumCulled = false; });
  }

  setModes(modes) { Object.assign(this.modes, modes); this.applyModes(); }
  applyModes() {
    for (const h of this.handles) {
      const on = !!this.modes[h.kind];
      h.mesh.visible = on; h.picker.visible = on;
    }
    for (const l of this.labels) l.visible = !!(this.modes.move || this.modes.scale);
  }
  setTarget(fn) { this.target = fn || (() => null); this.update(); }

  update() {
    const t = this.target() || this.drag?.frame;
    this.frame = t;
    this.root.visible = !!t;
    if (!t) return;
    this.root.position.copy(t.position);
    this.root.quaternion.copy(t.quaternion || new THREE.Quaternion());
    const d = this.camera.isPerspectiveCamera ? this.camera.position.distanceTo(t.position) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) : 1 / this.camera.zoom;
    this.root.scale.setScalar(Math.max(1e-4, d * this.size * (t.scale || 1)));
    this.applyModes();
    this.root.updateMatrixWorld(true);
  }

  setRay(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
  }
  pick(e) {
    if (!this.root.visible) return null;
    this.update();
    this.setRay(e);
    const pickers = this.handles.filter(h => h.picker.visible).map(h => h.picker);
    const hits = this.ray.intersectObjects(pickers, false);
    if (!hits.length) return null;
    const order = { center: 0, scale: 1, move: 2, plane: 3, rotate: 4 };
    const near = hits[0].distance;
    const close = hits.filter(h => h.distance < near + this.root.scale.x * 0.15);
    close.sort((a, b) => order[a.object.userData.handle.kind] - order[b.object.userData.handle.kind]);
    return close[0].object.userData.handle;
  }
  highlight(h) {
    if (this.hovered === h) return;
    if (this.hovered) this.hovered.mats.forEach((m, i) => m.color.setHex(this.hovered.base[i]));
    this.hovered = h;
    if (h) h.mats.forEach(m => m.color.setHex(HOVER));
    this.canvas.style.cursor = h ? (h.kind === 'rotate' ? 'grab' : 'move') : '';
  }
  hover(e) { if (!this.drag) this.highlight(this.pick(e)); }

  worldAxis(i) { return AXES[i].clone().applyQuaternion(this.root.quaternion).normalize(); }
  axisParam(axis, c = this.root.position) {
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    const w = o.clone().sub(c), b = axis.dot(d), denom = 1 - b * b;
    if (denom < 1e-4) return null;
    return (axis.dot(w) - b * d.dot(w)) / denom;
  }
  planeHit(normal, c = this.root.position) {
    const p = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, c);
    return this.ray.ray.intersectPlane(p, new THREE.Vector3());
  }

  pointerDown(e) {
    if (e.button !== 0) return false;
    const h = this.pick(e);
    if (!h) return false;
    const frame = { position: this.root.position.clone(), quaternion: this.root.quaternion.clone(), scale: this.frame?.scale };
    const drag = { h, frame };
    if (h.kind === 'move' || h.kind === 'scale') {
      drag.axis = this.worldAxis(h.axis);
      drag.t0 = this.axisParam(drag.axis);
      if (drag.t0 == null) return false;
    } else {
      drag.normal = h.kind === 'center' ? this.camera.getWorldDirection(new THREE.Vector3()).negate() : this.worldAxis(h.axis);
      drag.p0 = this.planeHit(drag.normal);
      if (!drag.p0) return false;
    }
    this.drag = drag;
    this.highlight(h);
    try { this.canvas.setPointerCapture(e.pointerId); } catch { }
    this.onStart?.({ kind: h.kind, axis: h.axis });
    return true;
  }

  pointerMove(e) {
    if (!this.drag) { this.hover(e); return false; }
    const d = this.drag, h = d.h;
    this.setRay(e);
    let ev = null;
    const c0 = d.frame.position;
    if (h.kind === 'move') {
      const t = this.axisParam(d.axis, c0);
      if (t != null) ev = { kind: 'move', axis: h.axis, delta: d.axis.clone().multiplyScalar(t - d.t0) };
    } else if (h.kind === 'scale') {
      const t = this.axisParam(d.axis, c0);
      if (t != null && Math.abs(d.t0) > 1e-6) ev = { kind: 'scale', axis: h.axis, factor: Math.max(0.02, t / d.t0) };
    } else if (h.kind === 'rotate') {
      const p = this.planeHit(d.normal, c0);
      if (p) {
        const v0 = d.p0.clone().sub(d.frame.position), v1 = p.sub(d.frame.position);
        ev = { kind: 'rotate', axis: h.axis, worldAxis: d.normal.clone(), angle: Math.atan2(v0.clone().cross(v1).dot(d.normal), v0.dot(v1)) };
      }
    } else {
      const p = this.planeHit(d.normal, c0);
      if (p) ev = { kind: 'move', axis: -1, delta: p.sub(d.p0) };
    }
    if (ev) this.onChange?.(ev);
    return true;
  }

  pointerUp() {
    if (!this.drag) return false;
    this.drag = null;
    this.onEnd?.();
    this.highlight(null);
    return true;
  }

  get dragging() { return !!this.drag; }

  dispose() {
    this.disposed = true;
    this.scene.remove(this.root);
    this.root.traverse(o => { o.geometry?.dispose(); [].concat(o.material || []).forEach(m => { m.map?.dispose(); m.dispose(); }); });
  }
}
