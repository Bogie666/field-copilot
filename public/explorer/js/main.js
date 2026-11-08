import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildUnit, buildPad, GROUPS, DIAG } from './parts.js';
import { PART_INFO, OVERVIEW, FLOW_INFO, TEARDOWN } from './content.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = THREE.MathUtils.clamp;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const GROUP_COLORS = { cabinet: '#8fa3b8', airflow: '#5fd0c5', refrigerant: '#ff9a3c', compressor: '#c792ff', electrical: '#ffd84a' };
const FLOW_COLORS = { discharge: 0xff3b2f, condensing: 0xff7a33, liquid: 0xffb341, suction: 0x3aa0ff };
const PIPE_TINT = { 'discharge-line': 0xd9483b, 'liquid-line': 0xe0a03a, 'suction-line': 0x3d7fd6 };
const HOME = { pos: new THREE.Vector3(1.75, 1.2, 1.95), target: new THREE.Vector3(0, 0.42, 0) };
const EXPLODED_VIEW = { pos: new THREE.Vector3(0.05, 0.78, 0).addScaledVector(new THREE.Vector3(0.5, 0.36, 0.79).normalize(), 4.3), target: new THREE.Vector3(0.05, 0.78, 0) };
const LAYOUT_VIEW = { pos: new THREE.Vector3(0.0, 2.9, 3.3), target: new THREE.Vector3(0, -0.05, 0.1) };
const GROUND = -0.08;

// ------------------------------------------------------------------ renderer
const viewport = $('#viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.prepend(renderer.domElement);

const labelLayer = document.createElement('div');
labelLayer.className = 'label-layer';
const SVGNS = 'http://www.w3.org/2000/svg';
const leaderSvg = document.createElementNS(SVGNS, 'svg');
leaderSvg.classList.add('leaders');
labelLayer.appendChild(leaderSvg);
viewport.insertBefore(labelLayer, renderer.domElement.nextSibling);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 50);
camera.position.copy(HOME.pos).multiplyScalar(2.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.3;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.53;
controls.autoRotateSpeed = 1.2;

scene.add(new THREE.HemisphereLight(0xdfefff, 0x1d2228, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.position.set(2.4, 4.2, 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 0.5, far: 12 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x9cc8ff, 0.6);
rim.position.set(-3, 2, -2.5);
scene.add(rim);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.38 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND - 0.0005;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(10, 50, 0x3b4b5e, 0x26313f);
grid.position.y = GROUND;
grid.material.transparent = true;
grid.material.opacity = 0.45;
scene.add(grid);

const pad = buildPad();
pad.receiveShadow = true;
pad.material.transparent = true;
scene.add(pad);

// ------------------------------------------------------------------ parts
const parts = buildUnit();
const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
const maxOrder = Math.max(...parts.map((p) => p.order));
parts.forEach((p) => scene.add(p.root));

// layout ("parts table") offsets
(function computeLayout() {
  const GAP = 0.17, MAXW = 3.0;
  const items = parts.map((p) => {
    const b = new THREE.Box3();
    p.meshes.forEach((m) => b.expandByObject(m));
    return { p, b, w: b.max.x - b.min.x, d: b.max.z - b.min.z };
  }).sort((a, b) => b.w * b.d - a.w * a.d);
  const rows = [];
  let row = null;
  for (const it of items) {
    if (!row || row.w + it.w > MAXW) { row = { items: [], w: 0, d: 0 }; rows.push(row); }
    row.items.push(it); row.w += it.w + GAP; row.d = Math.max(row.d, it.d);
  }
  let z = 0;
  for (const r of rows) { r.z = z + r.d / 2; z += r.d + GAP; }
  const zOff = z / 2;
  for (const r of rows) {
    let x = -(r.w - GAP) / 2;
    for (const it of r.items) {
      const c = it.b.getCenter(new THREE.Vector3());
      it.p.layout = new THREE.Vector3(x + it.w / 2 - c.x, GROUND - it.b.min.y, r.z - zOff - c.z);
      x += it.w + GAP;
    }
  }
  // frame the whole table
  const span = Math.max(MAXW, z * 1.25);
  LAYOUT_VIEW.pos.set(0, 0, 0).addScaledVector(new THREE.Vector3(0, 0.78, 0.63), span * 1.55).add(LAYOUT_VIEW.target);
})();

// callout balloons + leader lines (screen-space, de-overlapped every frame)
for (const p of parts) {
  const el = document.createElement('div');
  el.className = 'balloon';
  el.innerHTML = `${p.num}<span class="bname">${p.name}</span>`;
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => { e.stopPropagation(); onPartClicked(p.id, true); });
  el.addEventListener('mouseenter', () => setHover(p.id));
  el.addEventListener('mouseleave', () => setHover(null));
  labelLayer.appendChild(el);
  const line = document.createElementNS(SVGNS, 'line');
  const dot = document.createElementNS(SVGNS, 'circle');
  dot.setAttribute('r', '2.5');
  leaderSvg.append(line, dot);
  p.labelEl = el; p.leaderEl = line; p.dotEl = dot; p.lab = null;
}
const _a = new THREE.Vector3();
function layoutLabels() {
  labelLayer.classList.toggle('off', !state.labels);
  if (!state.labels) return;
  const w = viewport.clientWidth, h = viewport.clientHeight;
  const items = [];
  _a.set(0, 0.45, 0).project(camera);
  let cx = (_a.x + 1) / 2 * w, cy = (1 - _a.y) / 2 * h;
  for (const p of parts) {
    const show = !state.hidden.has(p.id) && p.opacity > 0.08;
    _a.copy(p.anchor).add(p.root.position).project(camera);
    const vis = show && _a.z < 1 && _a.z > -1;
    p.labelEl.style.display = vis ? '' : 'none';
    p.leaderEl.style.display = p.dotEl.style.display = vis ? '' : 'none';
    if (!vis) { p.lab = null; continue; }
    const ax = (_a.x + 1) / 2 * w, ay = (1 - _a.y) / 2 * h;
    let dx = ax - cx, dy = ay - cy;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    items.push({ p, ax, ay, x: ax + dx * 46, y: ay + dy * 46 - 12 });
  }
  const MIN = 27;
  for (let it = 0; it < 10; it++) {
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      let dx = B.x - A.x, dy = B.y - A.y;
      let d = Math.hypot(dx, dy);
      if (d >= MIN) continue;
      if (d < 0.01) { dx = 1; dy = 0.3; d = 1.04; }
      const push = (MIN - d) / 2;
      A.x -= (dx / d) * push; A.y -= (dy / d) * push;
      B.x += (dx / d) * push; B.y += (dy / d) * push;
    }
  }
  for (const it of items) {
    const p = it.p;
    if (!p.lab) p.lab = { x: it.x, y: it.y };
    p.lab.x += (it.x - p.lab.x) * 0.35;
    p.lab.y += (it.y - p.lab.y) * 0.35;
    p.labelEl.style.transform = `translate(${p.lab.x - 11}px, ${p.lab.y - 11}px)`;
    p.leaderEl.setAttribute('x1', it.ax); p.leaderEl.setAttribute('y1', it.ay);
    p.leaderEl.setAttribute('x2', p.lab.x); p.leaderEl.setAttribute('y2', p.lab.y);
    p.dotEl.setAttribute('cx', it.ax); p.dotEl.setAttribute('cy', it.ay);
  }
}

// refrigerant particles
const particleGeo = new THREE.SphereGeometry(0.0065, 8, 6);
const flowSystems = [];
for (const p of parts) {
  for (const f of p.flows) {
    const len = f.curve.getLength();
    const count = Math.max(4, Math.ceil(len / 0.024));
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.95, depthTest: true });
    const im = new THREE.InstancedMesh(particleGeo, mat, count);
    im.frustumCulled = false;
    im.visible = false;
    im.renderOrder = 5;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      if (f.kind === 'condensing') c.setHex(FLOW_COLORS.discharge).lerp(new THREE.Color(FLOW_COLORS.liquid), i / count);
      else c.setHex(FLOW_COLORS[f.kind]);
      im.setColorAt(i, c);
    }
    p.root.add(im);
    flowSystems.push({ im, curve: f.curve, len, count, phase: Math.random(), kind: f.kind });
  }
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
function updateFlow(dt) {
  for (const fs of flowSystems) {
    fs.im.visible = state.flow;
    if (!state.flow) continue;
    fs.phase = (fs.phase + (dt * state.flowSpeed * 0.16) / fs.len) % 1;
    for (let i = 0; i < fs.count; i++) {
      const t = (i / fs.count + fs.phase) % 1;
      fs.curve.getPointAt(t, _p);
      const pulse = 0.8 + 0.4 * Math.sin((t * fs.len) * 60);
      _s.setScalar(pulse);
      _m4.compose(_p, _q, _s);
      fs.im.setMatrixAt(i, _m4);
    }
    fs.im.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ state
const state = {
  mode: 'explore',
  style: 'radial',
  S: 0,
  tween: null,
  selected: null,
  stepHi: [],
  highlight: new Set(),
  hover: null,
  isolate: false,
  labels: false,
  xray: false,
  section: false,
  sectionAxis: 'x',
  sectionPos: 0.05,
  blueprint: false,
  flow: false,
  flowSpeed: 1,
  flowTint: true,
  hidden: new Set(),
  step: 0,
};

// ------------------------------------------------------------------ materials / look
const bpMat = new THREE.MeshBasicMaterial({ color: 0x2a6cc4, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
const bpHi = new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
const lineMat = new THREE.LineBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.85 });
const lineDim = new THREE.LineBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.12 });
const lineHi = new THREE.LineBasicMaterial({ color: 0xffb054 });
function ensureEdges(m) {
  if (m.userData.edges) return m.userData.edges;
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), lineMat);
  e.raycast = () => {};
  m.add(e);
  m.userData.edges = e;
  return e;
}
for (const p of parts) for (const m of p.meshes) {
  const mat = m.userData.baseMat;
  m.userData.origColor = mat.color.clone();
  m.userData.origOpacity = mat.opacity;
}

let pickables = [];
function refreshLook() {
  state.highlight = new Set([...state.stepHi, ...(state.selected ? [state.selected] : [])]);
  const anySel = state.highlight.size > 0;
  pickables = [];
  viewport.classList.toggle('blueprint', state.blueprint);
  document.body.classList.toggle('blueprint-on', state.blueprint);
  grid.material.color.setHex(state.blueprint ? 0x5a8fd6 : 0x3b4b5e);
  grid.material.opacity = state.blueprint ? 0.25 : 0.45;
  ground.visible = !state.blueprint;
  for (const p of parts) {
    const isHi = state.highlight.has(p.id);
    const hidden = state.hidden.has(p.id);
    p.root.visible = !hidden;
    const ghostShell = state.xray && (p.shell || (state.flow && p.id === 'coil')) && !isHi;
    let opacity = 1;
    if (ghostShell) opacity = p.id === 'coil' ? 0.3 : 0.09;
    if (state.isolate && anySel && !isHi) opacity = Math.min(opacity, 0.06);
    p.opacity = opacity;
    for (const m of p.meshes) {
      if (state.blueprint) {
        m.material = isHi ? bpHi : bpMat;
        const e = ensureEdges(m);
        e.visible = true;
        e.material = isHi ? lineHi : opacity < 0.5 ? lineDim : lineMat;
      } else {
        if (m.userData.edges) m.userData.edges.visible = false;
        const mat = m.userData.baseMat;
        m.material = mat;
        const o = opacity * m.userData.origOpacity;
        const tr = o < 1;
        if (mat.transparent !== tr) { mat.transparent = tr; mat.needsUpdate = true; }
        mat.opacity = o;
        mat.depthWrite = o > 0.5;
        const tint = state.flow && state.flowTint && PIPE_TINT[p.id];
        if (tint) mat.color.setHex(tint); else mat.color.copy(m.userData.origColor);
      }
      m.castShadow = opacity > 0.5;
      if (!hidden && opacity >= 0.2) pickables.push(m);
    }
    p.labelEl.classList.toggle('active', isHi);
  }
  updateLabels();
  updateList();
}

function updateLabels() {
  labelLayer.classList.toggle('off', !state.labels);
}

// ------------------------------------------------------------------ explode
function staggerTarget(S, p) {
  const spread = 0.6;
  return clamp(S * (1 + spread) - (p.order / maxOrder) * spread, 0, 1);
}
function tweenS(to, dur = 1.6) {
  state.tween = { from: state.S, to, t0: performance.now(), dur: dur * 1000 * Math.max(0.25, Math.abs(to - state.S)) };
}
const _off = new THREE.Vector3();
function updateParts(dt, now) {
  if (state.tween) {
    const k = clamp((now - state.tween.t0) / state.tween.dur, 0, 1);
    state.S = THREE.MathUtils.lerp(state.tween.from, state.tween.to, ease(k));
    $('#explode').value = state.S;
    if (k >= 1) state.tween = null;
  }
  const layout = state.style === 'layout';
  for (const p of parts) {
    if (state.mode !== 'teardown') p.target = staggerTarget(state.S, p);
    if (p.delayUntil && now < p.delayUntil) continue;
    const diff = p.target - p.e;
    const speed = state.mode === 'teardown' ? 1.1 : 3.5;
    p.e += Math.sign(diff) * Math.min(Math.abs(diff), dt * speed);
    const k = ease(p.e);
    _off.copy(layout ? p.layout : p.explode).multiplyScalar(k);
    p.root.position.lerp(_off, 1 - Math.exp(-dt * 14));
    p.root.traverse((o) => {
      if (!o.userData.ex) return;
      _p.copy(o.userData.base).addScaledVector(o.userData.ex, layout ? 0 : k);
      o.position.lerp(_p, 1 - Math.exp(-dt * 14));
    });
  }
  const padFade = layout ? clamp(state.S * 3, 0, 1) : 0;
  pad.material.opacity = 1 - padFade;
  pad.visible = padFade < 0.99;
}

// ------------------------------------------------------------------ camera tweens
let camTween = null;
function flyTo(pos, target, dur = 0.9) {
  // portrait / narrow viewports need more distance to fit the same width
  const fit = Math.pow(Math.max(1, 1.25 / Math.max(camera.aspect, 0.3)), 0.85);
  if (fit > 1) pos = target.clone().add(pos.clone().sub(target).multiplyScalar(fit));
  camTween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), start: performance.now(), dur: dur * 1000 };
}
function partBox(p) {
  const b = new THREE.Box3();
  p.meshes.forEach((m) => b.expandByObject(m));
  return b;
}
function focusPart(id) {
  const p = byId[id];
  if (!p) return;
  // wait for part to settle if mid-explode by predicting final offset
  const offset = (state.style === 'layout' ? p.layout : p.explode).clone().multiplyScalar(ease(p.target));
  const b = partBox(p);
  b.translate(offset.sub(p.root.position));
  const c = b.getCenter(new THREE.Vector3());
  const r = b.getSize(new THREE.Vector3()).length() / 2;
  const dir = camera.position.clone().sub(controls.target).normalize();
  const dist = Math.max(0.7, r * 2.9);
  flyTo(c.clone().addScaledVector(dir, dist), c);
}
function updateCamera(now) {
  if (!camTween) return;
  const k = ease(clamp((now - camTween.start) / camTween.dur, 0, 1));
  camera.position.lerpVectors(camTween.p0, camTween.p1, k);
  controls.target.lerpVectors(camTween.t0, camTween.t1, k);
  if (k >= 1) camTween = null;
}

// ------------------------------------------------------------------ section plane
const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
function updateSection() {
  const n = state.sectionAxis === 'x' ? new THREE.Vector3(-1, 0, 0) : state.sectionAxis === 'z' ? new THREE.Vector3(0, 0, -1) : DIAG.clone().negate();
  clipPlane.normal.copy(n);
  clipPlane.constant = state.sectionPos * 1.3;
  renderer.clippingPlanes = state.section ? [clipPlane] : [];
}

// ------------------------------------------------------------------ picking / hover
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  for (const h of hits) {
    if (state.section && clipPlane.distanceToPoint(h.point) < 0) continue;
    return h.object.userData.partId;
  }
  return null;
}
const tooltip = $('#tooltip');
function setHover(id) {
  if (state.hover === id) return;
  state.hover = id;
  renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
  $$('.part-item').forEach((el) => el.classList.toggle('hovered', el.dataset.id === id));
}
let lastMove = null;
renderer.domElement.addEventListener('pointermove', (e) => { lastMove = e; });
renderer.domElement.addEventListener('pointerleave', () => { lastMove = null; setHover(null); tooltip.classList.remove('show'); });
function processHover() {
  if (!lastMove || lastMove.pointerType === 'touch') return;
  const e = lastMove;
  lastMove = null;
  const id = pick(e.clientX, e.clientY);
  setHover(id);
  if (id) {
    const r = viewport.getBoundingClientRect();
    const p = byId[id];
    tooltip.innerHTML = `<span class="num">${p.num}</span>${p.name}`;
    tooltip.style.left = e.clientX - r.left + 'px';
    tooltip.style.top = e.clientY - r.top + 'px';
    tooltip.classList.add('show');
  } else tooltip.classList.remove('show');
}
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; camTween = null; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 6) return;
  const id = pick(e.clientX, e.clientY);
  if (id) onPartClicked(id, false);
  else select(null);
});
renderer.domElement.addEventListener('dblclick', (e) => {
  const id = pick(e.clientX, e.clientY);
  if (id) { select(id); focusPart(id); }
});

function onPartClicked(id, fromLabel) {
  select(id);
  if (fromLabel) focusPart(id);
}

// ------------------------------------------------------------------ selection + info panel
const info = $('#info');
function select(id) {
  state.selected = id;
  refreshLook();
  renderInfo();
}
function renderInfo() {
  const body = $('#info-body');
  const narrow = window.matchMedia('(max-width: 820px)').matches;
  const p = state.selected && byId[state.selected];
  if (!p) {
    if (narrow) { info.classList.add('hidden'); onResize(); return; }
    const counts = GROUPS.map((g) => `<button class="chip" data-group="${g.id}" style="border-color:${GROUP_COLORS[g.id]}55">${g.name} · ${parts.filter((x) => x.group === g.id).length}</button>`).join('');
    body.innerHTML = `
      <div class="overview">
        <div class="info-kicker">Overview</div>
        <h2>${OVERVIEW.title}</h2>
        <p class="info-summary">${OVERVIEW.body}</p>
        <div class="stat-grid">
          <div class="stat"><b>${parts.length}</b><span>Modeled components</span></div>
          <div class="stat"><b>${TEARDOWN.length}</b><span>Teardown steps</span></div>
          <div class="stat"><b>Inverter</b><span>Variable-speed compressor drive</span></div>
          <div class="stat"><b>Spine Fin™</b><span>All-aluminum coil</span></div>
        </div>
        <div class="sec"><h3>Systems</h3><div class="group-chips">${counts}</div></div>
        <div class="sec tip"><h3>★ Start here</h3><p>Hit <b>Explode</b> to pull the unit apart, then click any component. Try <b>Guided Teardown</b> for a step-by-step service walk-through.</p></div>
        <p class="disclaimer">Representational training model — not to OEM scale or exact layout. Always follow the manufacturer’s literature for the model & serial being serviced. Not affiliated with or endorsed by Trane.</p>
      </div>`;
    body.querySelectorAll('[data-group]').forEach((b) => b.addEventListener('click', () => {
      state.stepHi = parts.filter((x) => x.group === b.dataset.group).map((x) => x.id);
      refreshLook();
      setTimeout(() => { if (state.mode === 'explore') { state.stepHi = []; refreshLook(); } }, 1800);
    }));
    info.classList.remove('hidden');
    onResize();
    return;
  }
  const d = PART_INFO[p.id] || {};
  const g = GROUPS.find((x) => x.id === p.group);
  const list = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${x}</li>`).join('')}</ul>` : '');
  body.innerHTML = `
    <div class="info-kicker"><span class="num">${p.num}</span><span style="color:${GROUP_COLORS[p.group]}">${g.name}</span></div>
    <h2>${p.name}</h2>
    <p class="info-summary">${d.summary || ''}</p>
    <div class="info-actions">
      <button class="pill" data-act="fly">⌖ Fly to</button>
      <button class="pill ${state.isolate ? 'primary' : ''}" data-act="isolate">◎ Isolate</button>
      <button class="pill" data-act="hide">⊘ Hide</button>
    </div>
    <div class="sec"><h3>What it does</h3><p>${d.role || ''}</p></div>
    ${d.specs ? `<div class="sec"><h3>Key specs & notes</h3>${list(d.specs)}</div>` : ''}
    ${d.failures ? `<div class="sec"><h3>Common failures</h3>${list(d.failures)}</div>` : ''}
    ${d.diagnostics ? `<div class="sec"><h3>How to test</h3>${list(d.diagnostics)}</div>` : ''}
    ${d.safety ? `<div class="sec safety"><h3>⚠ Safety</h3>${list(d.safety)}</div>` : ''}
    ${d.tip ? `<div class="sec tip"><h3>★ Pro tip</h3><p>${d.tip}</p></div>` : ''}`;
  body.querySelector('[data-act=fly]').onclick = () => focusPart(p.id);
  body.querySelector('[data-act=isolate]').onclick = () => { state.isolate = !state.isolate; refreshLook(); renderInfo(); };
  body.querySelector('[data-act=hide]').onclick = () => { state.hidden.add(p.id); select(null); };
  info.classList.remove('hidden');
  info.scrollTop = 0;
  onResize();
}
$('#info-close').onclick = () => {
  if (state.selected) select(null);
  else { info.classList.add('hidden'); onResize(); }
};

// ------------------------------------------------------------------ parts list
function buildList() {
  const wrap = $('#part-list');
  wrap.innerHTML = '';
  for (const g of GROUPS) {
    const t = document.createElement('div');
    t.className = 'group-title';
    t.style.setProperty('--gc', GROUP_COLORS[g.id]);
    t.textContent = g.name;
    t.dataset.group = g.id;
    wrap.appendChild(t);
    for (const p of parts.filter((x) => x.group === g.id).sort((a, b) => a.num - b.num)) {
      const b = document.createElement('div');
      b.className = 'part-item';
      b.dataset.id = p.id;
      b.dataset.group = g.id;
      b.setAttribute('role', 'button');
      b.tabIndex = 0;
      b.innerHTML = `<span class="num">${p.num}</span><span class="pname">${p.name}</span><button class="eye" title="Hide / show">👁</button>`;
      b.addEventListener('click', (e) => {
        if (e.target.classList.contains('eye')) {
          e.stopPropagation();
          state.hidden.has(p.id) ? state.hidden.delete(p.id) : state.hidden.add(p.id);
          if (state.selected === p.id) state.selected = null;
          refreshLook();
          return;
        }
        if (state.hidden.has(p.id)) state.hidden.delete(p.id);
        select(p.id);
        focusPart(p.id);
        $('#sidebar').classList.remove('open');
      });
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter') b.click(); });
      b.addEventListener('mouseenter', () => setHover(p.id));
      b.addEventListener('mouseleave', () => setHover(null));
      wrap.appendChild(b);
    }
  }
}
function updateList() {
  $$('.part-item').forEach((el) => {
    el.classList.toggle('active', state.highlight.has(el.dataset.id));
    el.classList.toggle('hidden-part', state.hidden.has(el.dataset.id));
  });
}
$('#search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  $$('.part-item').forEach((el) => {
    const p = byId[el.dataset.id];
    const hay = (p.name + ' ' + (PART_INFO[p.id]?.summary || '')).toLowerCase();
    el.classList.toggle('hidden', !!q && !hay.includes(q));
  });
  $$('.group-title').forEach((t) => {
    const any = $$(`.part-item[data-group="${t.dataset.group}"]:not(.hidden)`).length;
    t.classList.toggle('hidden', !any);
  });
});
$('#show-all').onclick = () => { state.hidden.clear(); state.isolate = false; refreshLook(); renderInfo(); };
$('#menu-btn').onclick = () => $('#sidebar').classList.toggle('open');

// ------------------------------------------------------------------ toolbar
function setTool(name, on) {
  state[name] = on ?? !state[name];
  const btn = { labels: '#t-labels', xray: '#t-xray', section: '#t-section', blueprint: '#t-blueprint' }[name];
  if (btn) $(btn).classList.toggle('on', state[name]);
  if (name === 'section') { $('#section-ctrl').classList.toggle('hidden', !state.section); updateSection(); }
  refreshLook();
}
$('#t-labels').onclick = () => setTool('labels');
$('#t-xray').onclick = () => setTool('xray');
$('#t-section').onclick = () => setTool('section');
$('#t-blueprint').onclick = () => setTool('blueprint');
$('#t-rotate').onclick = () => { controls.autoRotate = !controls.autoRotate; $('#t-rotate').classList.toggle('on', controls.autoRotate); };
$('#t-reset').onclick = () => resetView();
$('#section-axis').onchange = (e) => { state.sectionAxis = e.target.value; updateSection(); };
$('#section-pos').oninput = (e) => { state.sectionPos = +e.target.value; updateSection(); };

function resetView() {
  const exploded = state.S > 0.3;
  const v = exploded ? (state.style === 'layout' ? LAYOUT_VIEW : EXPLODED_VIEW) : HOME;
  flyTo(v.pos, v.target);
}

$('#explode').addEventListener('input', (e) => { state.tween = null; state.S = +e.target.value; });
$('#btn-explode').onclick = () => explode(1);
$('#btn-assemble').onclick = () => explode(0);
function explode(to) {
  tweenS(to, state.style === 'layout' ? 2.2 : 1.8);
  const v = to ? (state.style === 'layout' ? LAYOUT_VIEW : EXPLODED_VIEW) : HOME;
  flyTo(v.pos, v.target, 1.4);
}
$$('[data-style]').forEach((b) => b.addEventListener('click', () => {
  state.style = b.dataset.style;
  $$('[data-style]').forEach((x) => x.classList.toggle('active', x === b));
  if (state.S < 0.5) explode(1); else resetView();
}));

// ------------------------------------------------------------------ modes
function setMode(mode) {
  const prev = state.mode;
  if (prev === mode) return;
  state.mode = mode;
  $$('.mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('#teardown-panel').classList.toggle('hidden', mode !== 'teardown');
  $('#flow-legend').classList.toggle('hidden', mode !== 'flow');
  $('#explode-bar').classList.toggle('hidden', mode === 'teardown');
  state.stepHi = [];
  if (prev === 'teardown') { parts.forEach((p) => { p.delayUntil = 0; }); }
  if (prev === 'flow' || prev === 'teardown') { state.flow = false; setTool('xray', state.savedXray ?? false); }

  if (mode === 'teardown') {
    state.style = 'radial';
    $$('[data-style]').forEach((x) => x.classList.toggle('active', x.dataset.style === 'radial'));
    state.savedXray = state.xray;
    state.selected = null;
    goStep(0);
  } else if (mode === 'flow') {
    state.savedXray = state.xray;
    state.flow = true;
    setTool('xray', true);
    if (state.S > 0.05) explode(0); else flyTo(new THREE.Vector3(1.25, 1.15, 1.45), new THREE.Vector3(0.05, 0.4, 0.05));
  } else {
    state.S = clamp(parts.reduce((a, p) => a + p.e, 0) / parts.length, 0, 1);
    $('#explode').value = state.S;
  }
  refreshLook();
  renderInfo();
}
$$('.mode').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

// ------------------------------------------------------------------ teardown
function goStep(i) {
  state.step = clamp(i, 0, TEARDOWN.length - 1);
  const s = TEARDOWN[state.step];
  const open = s.open === '*' ? new Set(parts.map((p) => p.id)) : new Set(s.open);
  const now = performance.now();
  const changing = parts.filter((p) => (open.has(p.id) ? 1 : 0) !== p.target).sort((a, b) => a.order - b.order);
  changing.forEach((p, k) => { p.target = open.has(p.id) ? 1 : 0; p.delayUntil = now + k * 110; });
  state.stepHi = s.highlight;
  state.selected = null;
  state.flow = !!s.flow;
  setTool('xray', !!s.flow || state.savedXray);
  flyTo(new THREE.Vector3(...s.cam[0]), new THREE.Vector3(...s.cam[1]), 1.3);
  $('#td-count').textContent = `STEP ${state.step + 1} / ${TEARDOWN.length}`;
  $('#td-title').textContent = s.title;
  $('#td-text').textContent = s.text;
  $('#teardown-panel').classList.toggle('safety', !!s.safety);
  $('#td-prev').disabled = state.step === 0;
  $('#td-next').textContent = state.step === TEARDOWN.length - 1 ? 'Reassemble ↺' : 'Next ›';
  $('#td-dots').innerHTML = TEARDOWN.map((_, k) => `<span class="${k <= state.step ? 'done' : ''}" data-k="${k}" title="${TEARDOWN[k].title}"></span>`).join('');
  $$('#td-dots span').forEach((d) => d.addEventListener('click', () => goStep(+d.dataset.k)));
  refreshLook();
  renderInfo();
}
$('#td-prev').onclick = () => goStep(state.step - 1);
$('#td-next').onclick = () => goStep(state.step === TEARDOWN.length - 1 ? 0 : state.step + 1);

// ------------------------------------------------------------------ flow legend
$('#flow-items').innerHTML = FLOW_INFO.map((f) => {
  const c = '#' + FLOW_COLORS[f.kind].toString(16).padStart(6, '0');
  return `<div class="flow-item"><i style="background:${c};color:${c}"></i><b>${f.label}</b><small>${f.note}</small></div>`;
}).join('');
$('#flow-speed').oninput = (e) => { state.flowSpeed = +e.target.value; };
$('#flow-tint').onchange = (e) => { state.flowTint = e.target.checked; refreshLook(); };

// ------------------------------------------------------------------ help / keys
const help = $('#help');
$('#help-btn').onclick = () => help.classList.remove('hidden');
$('#help-close').onclick = () => help.classList.add('hidden');
help.addEventListener('click', (e) => { if (e.target === help) help.classList.add('hidden'); });
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea') && e.target.type !== 'range') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { help.classList.add('hidden'); select(null); }
  else if (k === 'e' && state.mode !== 'teardown') explode(state.S > 0.5 ? 0 : 1);
  else if (k === 'l') setTool('labels');
  else if (k === 'x') setTool('xray');
  else if (k === 'c') setTool('section');
  else if (k === 'b') setTool('blueprint');
  else if (k === 't') $('#t-rotate').click();
  else if (k === 'r') resetView();
  else if (state.mode === 'teardown' && (k === 'arrowright' || k === 'arrowleft')) goStep(state.step + (k === 'arrowright' ? 1 : -1));
});

// ------------------------------------------------------------------ resize + loop
function onResize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(onResize).observe(viewport);

const leds = parts.flatMap((p) => p.leds);
const fanSpin = byId['fan-blade'].root.getObjectByName('spin');
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  const t = now / 1000;
  updateParts(dt, now);
  updateCamera(now);
  updateFlow(dt);
  processHover();
  if (state.flow) fanSpin.rotation.y -= dt * 14 * state.flowSpeed;
  for (const l of leds) {
    const on = l.userData.led === 'green' ? (t % 1.2) < 0.6 : state.flow && (t % 3) < 0.15;
    l.material.emissiveIntensity = on ? 2.5 : 0.05;
  }
  // highlight pulse
  if (!state.blueprint) {
    const pulse = 0.35 + 0.25 * Math.sin(t * 4.5);
    for (const p of parts) {
      const hi = state.highlight.has(p.id);
      const hv = state.hover === p.id && !hi;
      for (const m of p.meshes) {
        if (m.userData.noHighlight) continue;
        const mat = m.material;
        if (hi) { mat.emissive.setHex(0x1aa3ff); mat.emissiveIntensity = pulse; }
        else if (hv) { mat.emissive.setHex(0x3a5068); mat.emissiveIntensity = 0.8; }
        else if (mat.emissiveIntensity !== 0) { mat.emissive.setHex(0x000000); mat.emissiveIntensity = 0; }
      }
    }
  }
  controls.update();
  renderer.render(scene, camera);
  layoutLabels();
  requestAnimationFrame(animate);
}

buildList();
refreshLook();
renderInfo();
onResize();
$('#loading').remove();
flyTo(HOME.pos, HOME.target, 1.8);
requestAnimationFrame(animate);
try {
  if (!localStorage.getItem('vs-trainer-help-seen')) { help.classList.remove('hidden'); localStorage.setItem('vs-trainer-help-seen', '1'); }
} catch (_) { /* storage unavailable */ }

// expose for debugging / automated checks
window.__trainer = { state, parts, setMode, select, explode, goStep, setTool };
