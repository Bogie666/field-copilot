// Procedural geometry for a representational variable-speed
// outdoor condensing unit. Every part is built in world coordinates
// (assembled position) inside its own root Group, so exploding a part is
// simply a translation of that root.
//
// Units are metres. Cabinet footprint ~0.8 m square, height ~0.9 m.
// +Y is up. The service corner (control box + service valves) is the +X/+Z corner.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const DIAG = V(Math.SQRT1_2, 0, Math.SQRT1_2); // out of the service corner
const DIAG_PERP = V(Math.SQRT1_2, 0, -Math.SQRT1_2);

// ---------------------------------------------------------------- materials
const std = (o) => new THREE.MeshStandardMaterial(o);
const MAT = {
  cabinet: () => std({ color: 0x80868c, metalness: 0.45, roughness: 0.5, side: THREE.DoubleSide }),
  cabinetDark: () => std({ color: 0x34383d, metalness: 0.4, roughness: 0.55, side: THREE.DoubleSide }),
  base: () => std({ color: 0x2b2e32, metalness: 0.2, roughness: 0.75 }),
  galv: () => std({ color: 0xb4b9bf, metalness: 0.75, roughness: 0.38, side: THREE.DoubleSide }),
  alum: () => std({ color: 0xc9cdd2, metalness: 0.8, roughness: 0.32 }),
  copper: () => std({ color: 0xc47a45, metalness: 0.92, roughness: 0.28 }),
  brass: () => std({ color: 0xc9a54a, metalness: 0.9, roughness: 0.3 }),
  blackPlastic: () => std({ color: 0x151618, metalness: 0.05, roughness: 0.6 }),
  rubber: () => std({ color: 0x0e0e0f, metalness: 0, roughness: 0.95 }),
  compressor: () => std({ color: 0x23272b, metalness: 0.55, roughness: 0.42 }),
  felt: () => std({ color: 0x4b5157, metalness: 0, roughness: 1, side: THREE.DoubleSide }),
  pcb: () => std({ color: 0x1d6b3c, metalness: 0.1, roughness: 0.55 }),
  pcbBlue: () => std({ color: 0x1b3f73, metalness: 0.1, roughness: 0.55 }),
  chip: () => std({ color: 0x111214, metalness: 0.2, roughness: 0.4 }),
  capBlue: () => std({ color: 0x2856a3, metalness: 0.3, roughness: 0.45 }),
  relay: () => std({ color: 0x2f6fd0, metalness: 0.1, roughness: 0.5 }),
  connector: () => std({ color: 0xece6d6, metalness: 0, roughness: 0.6 }),
  termGreen: () => std({ color: 0x2e8b4f, metalness: 0.05, roughness: 0.6 }),
  wireBlack: () => std({ color: 0x1b1b1d, metalness: 0.1, roughness: 0.6 }),
  wireRed: () => std({ color: 0xb3261e, metalness: 0.1, roughness: 0.55 }),
  wireWhite: () => std({ color: 0xdedede, metalness: 0.1, roughness: 0.55 }),
  wireBlue: () => std({ color: 0x2457c5, metalness: 0.1, roughness: 0.55 }),
  conduit: () => std({ color: 0x6a6f74, metalness: 0.5, roughness: 0.5 }),
  laminations: () => std({ color: 0x5d636a, metalness: 0.7, roughness: 0.45 }),
  insulation: () => std({ color: 0x141414, metalness: 0, roughness: 0.9 }),
  drier: () => std({ color: 0x6f8fb0, metalness: 0.55, roughness: 0.4 }),
  grille: () => std({ color: 0x1f2124, metalness: 0.5, roughness: 0.45 }),
  fanBlade: () => std({ color: 0x292c30, metalness: 0.55, roughness: 0.4, side: THREE.DoubleSide }),
  motor: () => std({ color: 0x2c3035, metalness: 0.6, roughness: 0.4 }),
  sensor: () => std({ color: 0x0f0f10, metalness: 0.2, roughness: 0.5 }),
  ledGreen: () => std({ color: 0x0b3d12, emissive: 0x22ff55, emissiveIntensity: 2 }),
  ledRed: () => std({ color: 0x3d0b0b, emissive: 0xff3322, emissiveIntensity: 2 }),
  concrete: () => std({ color: 0x8d8b86, metalness: 0, roughness: 0.95 }),
};

// ---------------------------------------------------------------- textures
function finTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#9fa6ad';
  g.fillRect(0, 0, 256, 256);
  // tube rows (4 per tile)
  for (let r = 0; r < 4; r++) {
    const y = r * 64 + 32;
    const grad = g.createLinearGradient(0, y - 9, 0, y + 9);
    grad.addColorStop(0, 'rgba(60,66,72,0)');
    grad.addColorStop(0.5, 'rgba(60,66,72,0.75)');
    grad.addColorStop(1, 'rgba(60,66,72,0)');
    g.fillStyle = grad;
    g.fillRect(0, y - 9, 256, 18);
  }
  // spines: dense short strokes radiating from each tube row
  for (let i = 0; i < 5200; i++) {
    const row = Math.floor(Math.random() * 4);
    const y = row * 64 + 32 + (Math.random() - 0.5) * 60;
    const x = Math.random() * 256;
    const l = 3 + Math.random() * 7;
    const light = Math.random() > 0.45;
    g.strokeStyle = light ? `rgba(225,230,235,${0.35 + Math.random() * 0.4})` : `rgba(55,60,66,${0.25 + Math.random() * 0.35})`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 2, y + (Math.random() > 0.5 ? l : -l));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function labelTexture(lines, { w = 512, h = 340, bg = '#e9e6dd', fg = '#1b1b1b', title = null, titleBg = '#1b1b1b', titleFg = '#fff' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
  let y = 24;
  if (title) {
    g.fillStyle = titleBg; g.fillRect(14, 14, w - 28, 74);
    g.fillStyle = titleFg; g.font = 'bold 44px Arial'; g.textAlign = 'center';
    g.fillText(title, w / 2, 66);
    y = 100;
  }
  g.fillStyle = fg; g.textAlign = 'left';
  for (const [txt, size, bold] of lines) {
    g.font = `${bold ? 'bold ' : ''}${size}px Arial`;
    y += size + 10;
    g.fillText(txt, 30, y);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- helpers
function mesh(geo, mat, pos, rot) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.copy(pos instanceof THREE.Vector3 ? pos : V(...pos));
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const box = (w, h, d, mat, pos, rot) => mesh(new THREE.BoxGeometry(w, h, d), mat, pos, rot);
const cyl = (r, h, mat, pos, rot, seg = 24, rb) =>
  mesh(new THREE.CylinderGeometry(r, rb ?? r, h, seg), mat, pos, rot);

// Cylinder between two points
function rod(a, b, r, mat, seg = 16) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const m = mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
  return m;
}

function curveOf(points, tension = 0.5) {
  return new THREE.CatmullRomCurve3(points.map((p) => (p instanceof THREE.Vector3 ? p : V(...p))), false, 'catmullrom', tension);
}
function tube(curve, r, mat, seg = 80) {
  return mesh(new THREE.TubeGeometry(curve, seg, r, 12, false), mat);
}

// Wall of given thickness extruded vertically along a 2D path (x,z).
function wallGeometry(pts, thick, y0, y1, uTile = 0.1, vTile = 0.1) {
  const N = pts.length;
  const nrm = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
    const n = new THREE.Vector2(b.y - a.y, -(b.x - a.x)).normalize();
    if (n.dot(p) < 0) n.negate();
    return n;
  });
  const len = [0];
  for (let i = 1; i < N; i++) len[i] = len[i - 1] + pts[i].distanceTo(pts[i - 1]);
  const pos = [], uv = [], idx = [];
  const off = (i, s) => pts[i].clone().addScaledVector(nrm[i], s);
  const strip = (A, B) => { // A,B arrays of [x,y,z,u,v] same length
    const base = pos.length / 3;
    for (let i = 0; i < A.length; i++) {
      pos.push(A[i][0], A[i][1], A[i][2]); uv.push(A[i][3], A[i][4]);
      pos.push(B[i][0], B[i][1], B[i][2]); uv.push(B[i][3], B[i][4]);
    }
    for (let i = 0; i < A.length - 1; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
  };
  const h = thick / 2;
  const mk = (s, y, uOff = 0) => pts.map((_, i) => { const p = off(i, s); return [p.x, y, p.y, len[i] / uTile + uOff, y / vTile]; });
  strip(mk(h, y0), mk(h, y1));            // outer
  strip(mk(-h, y1), mk(-h, y0));          // inner
  const top = (s) => pts.map((_, i) => { const p = off(i, s); return [p.x, y1, p.y, len[i] / uTile, s / vTile]; });
  const bot = (s) => pts.map((_, i) => { const p = off(i, s); return [p.x, y0, p.y, len[i] / uTile, s / vTile]; });
  strip(top(-h), top(h));
  strip(bot(h), bot(-h));
  for (const i of [0, N - 1]) {          // end caps
    const o = off(i, h), n = off(i, -h);
    strip([[o.x, y0, o.y, 0, y0 / vTile], [n.x, y0, n.y, thick / uTile, y0 / vTile]],
          [[o.x, y1, o.y, 0, y1 / vTile], [n.x, y1, n.y, thick / uTile, y1 / vTile]]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- layout constants
const CAB = 0.4;           // cabinet half width
const COIL_S = 0.34;       // coil centre-line half width
const COIL_R = 0.07;       // coil corner radius
const COIL_END = 0.12;     // coil stops here at the service corner
const COIL_Y0 = 0.07, COIL_Y1 = 0.82;
const COMP = V(-0.06, 0, -0.06); // compressor centre
const CB_CENTER = V(0.262, 0.62, 0.262); // control box centre
const HDR_A = V(0.105, 0, COIL_S);  // inlet header (discharge in, top)
const HDR_B = V(COIL_S, 0, 0.105);  // outlet header (liquid out, bottom)
const P_LIQ = V(0.315, 0.13, 0.245);
const P_SUC = V(0.245, 0.205, 0.315);

function coilPathPoints(n = 180) {
  const s = COIL_S, r = COIL_R;
  const p = new THREE.Path();
  p.moveTo(COIL_END, s);
  p.lineTo(-s + r, s);
  p.absarc(-s + r, s - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(-s, -s + r);
  p.absarc(-s + r, -s + r, r, Math.PI, Math.PI * 1.5, false);
  p.lineTo(s - r, -s);
  p.absarc(s - r, -s + r, r, Math.PI * 1.5, Math.PI * 2, false);
  p.lineTo(s, COIL_END);
  return p.getSpacedPoints(n);
}

// Control-box local frame: +Z local points out of the service corner.
function cbFrame() {
  const g = new THREE.Group();
  g.position.copy(CB_CENTER);
  g.rotation.y = Math.PI / 4;
  return g;
}

// Refrigerant curves (world, assembled)
const CURVES = {
  discharge: curveOf([
    [COMP.x, 0.49, COMP.z], [COMP.x, 0.56, COMP.z], [-0.03, 0.625, 0.04],
    [0.05, 0.655, 0.2], [HDR_A.x, 0.66, 0.295], [HDR_A.x, 0.66, COIL_S - 0.005],
  ]),
  liquid: curveOf([
    [HDR_B.x - 0.005, 0.14, HDR_B.z], [0.3, 0.135, HDR_B.z], [0.28, 0.13, 0.13],
    [0.28, 0.13, 0.2], [0.29, 0.13, 0.232], [P_LIQ.x - 0.012, 0.13, P_LIQ.z - 0.012],
  ]),
  suction: curveOf([
    [P_SUC.x - 0.012, P_SUC.y, P_SUC.z - 0.012], [0.2, 0.207, 0.262], [0.13, 0.235, 0.16],
    [0.075, 0.285, 0.07], [0.05, 0.3, 0.047], [0.04, 0.3, 0.04],
  ]),
};
const FIELD = {
  liquid: curveOf([P_LIQ.clone().addScaledVector(DIAG, 0.022), P_LIQ.clone().addScaledVector(DIAG, 0.12), P_LIQ.clone().addScaledVector(DIAG, 0.26)]),
  suction: curveOf([P_SUC.clone().addScaledVector(DIAG, 0.26), P_SUC.clone().addScaledVector(DIAG, 0.12), P_SUC.clone().addScaledVector(DIAG, 0.022)]),
};

// ---------------------------------------------------------------- part builders
function buildBasePan() {
  const g = new THREE.Group();
  const m = MAT.base();
  g.add(box(0.8, 0.04, 0.8, m, [0, 0.02, 0]));
  // raised compressor mounting pad + drain holes
  g.add(box(0.36, 0.008, 0.36, m.clone(), [COMP.x, 0.044, COMP.z]));
  const hole = MAT.rubber();
  for (const [x, z] of [[-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3], [0.05, 0.3], [0.3, 0.02]]) {
    g.add(cyl(0.012, 0.002, hole, [x, 0.0405, z], null, 16));
  }
  // under rails
  g.add(box(0.8, 0.015, 0.05, m.clone(), [0, 0.002, 0.3]));
  g.add(box(0.8, 0.015, 0.05, m.clone(), [0, 0.002, -0.3]));
  return { object: g };
}

function buildCornerPosts() {
  const g = new THREE.Group();
  const m = MAT.cabinetDark();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = new THREE.Group();
    c.position.set(sx * 0.38, 0.465, sz * 0.38);
    c.add(box(0.045, 0.84, 0.003, m, [sx * 0.0, 0, sz * 0.0185]));
    c.add(box(0.003, 0.84, 0.045, m, [sx * 0.0185, 0, sz * 0.0]));
    c.userData.ex = V(sx * 0.42, 0.05, sz * 0.42);
    g.add(c);
  }
  return { object: g };
}

function louverGeometry(L, h) {
  const geos = [];
  const add = (geo, x, y, z, rx = 0) => { if (rx) geo.rotateX(rx); geo.translate(x, y, z); geos.push(geo); };
  add(new THREE.BoxGeometry(L, 0.025, 0.004), 0, 0.0125, 0);
  add(new THREE.BoxGeometry(L, 0.025, 0.004), 0, h - 0.0125, 0);
  add(new THREE.BoxGeometry(0.018, h, 0.004), -L / 2 + 0.009, h / 2, 0);
  add(new THREE.BoxGeometry(0.018, h, 0.004), L / 2 - 0.009, h / 2, 0);
  const pitch = 0.019;
  const n = Math.floor((h - 0.05) / pitch);
  for (let i = 0; i < n; i++) {
    add(new THREE.BoxGeometry(L - 0.034, 0.017, 0.0022), 0, 0.025 + pitch * (i + 0.5), 0, -0.65);
  }
  return mergeGeometries(geos);
}

function buildLouvers() {
  const g = new THREE.Group();
  const m = MAT.cabinet();
  const y0 = 0.045, h = 0.83;
  const panels = [
    // [L, centreAlongFace, position fn, rotY, explodeDir]
    { L: 0.76, pos: V(0, y0, -0.401), rot: Math.PI, ex: V(0, 0.04, -0.5) },
    { L: 0.76, pos: V(-0.401, y0, 0), rot: -Math.PI / 2, ex: V(-0.5, 0.04, 0) },
    { L: 0.545, pos: V(-0.1075, y0, 0.401), rot: 0, ex: V(0, 0.04, 0.55) },
    { L: 0.545, pos: V(0.401, y0, -0.1075), rot: Math.PI / 2, ex: V(0.55, 0.04, 0) },
  ];
  for (const p of panels) {
    const c = new THREE.Group();
    c.position.copy(p.pos);
    c.rotation.y = p.rot;
    c.add(mesh(louverGeometry(p.L, h), m));
    c.userData.ex = p.ex;
    g.add(c);
  }
  return { object: g };
}

function buildAccessPanel() {
  const g = new THREE.Group();
  const m = MAT.cabinet();
  const y0 = 0.34, y1 = 0.875, h = y1 - y0, w = 0.232;
  g.add(box(w, h, 0.004, m, [0.4 - w / 2, y0 + h / 2, 0.402]));
  g.add(box(0.004, h, w, m, [0.402, y0 + h / 2, 0.4 - w / 2]));
  // stiffening flange along bottom
  g.add(box(w, 0.02, 0.012, m, [0.4 - w / 2, y0 + 0.01, 0.398]));
  g.add(box(0.012, 0.02, w, m, [0.398, y0 + 0.01, 0.4 - w / 2]));
  // screws
  const s = MAT.galv();
  for (const y of [y0 + 0.04, y1 - 0.04]) {
    g.add(cyl(0.006, 0.004, s, [0.19, y, 0.405], [Math.PI / 2, 0, 0], 12));
    g.add(cyl(0.006, 0.004, s, [0.405, y, 0.19], [0, 0, Math.PI / 2], 12));
  }
  // nameplate + warning decals
  const np = labelTexture([
    ['MODEL: VARIABLE SPEED A/C SYSTEM', 20, true],
    ['TRAINING MODEL - NOT FOR SERVICE DATA', 18, false],
    ['VOLTS 208/230  PH 1  HZ 60', 22, false],
    ['MCA ___  MOP ___  REFRIG ______', 22, false],
    ['FACTORY CHARGE ___ LB __ OZ', 22, false],
    ['DESIGN SUBCOOLING ___ °F', 22, true],
  ], { title: 'NAMEPLATE' });
  const npm = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.086), new THREE.MeshStandardMaterial({ map: np, roughness: 0.6 }));
  npm.position.set(0.4045, 0.66, 0.285); npm.rotation.y = Math.PI / 2;
  g.add(npm);
  const warn = labelTexture([
    ['HAZARDOUS VOLTAGE', 34, true],
    ['Disconnect all power before', 26, false],
    ['servicing. Drive capacitors', 26, false],
    ['hold charge after power off.', 26, false],
    ['Wait & verify 0 VDC.', 26, true],
  ], { title: '⚠ WARNING', bg: '#f6c913', titleBg: '#111', titleFg: '#f6c913', h: 340 });
  const wm = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.073), new THREE.MeshStandardMaterial({ map: warn, roughness: 0.6 }));
  wm.position.set(0.285, 0.72, 0.4045);
  g.add(wm);
  return { object: g, anchor: V(0.4, 0.62, 0.4) };
}

function buildTopCover() {
  const g = new THREE.Group();
  const m = MAT.cabinetDark();
  const shape = new THREE.Shape();
  shape.moveTo(-0.405, -0.405); shape.lineTo(0.405, -0.405); shape.lineTo(0.405, 0.405); shape.lineTo(-0.405, 0.405); shape.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.312, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: false, curveSegments: 64 });
  geo.rotateX(-Math.PI / 2);
  g.add(mesh(geo, m, [0, 0.877, 0]));
  // perimeter lip
  for (const [w, d, x, z] of [[0.81, 0.004, 0, 0.405], [0.81, 0.004, 0, -0.405], [0.004, 0.81, 0.405, 0], [0.004, 0.81, -0.405, 0]]) {
    g.add(box(w, 0.04, d, m, [x, 0.872, z]));
  }
  // venturi / orifice ring
  g.add(mesh(new THREE.CylinderGeometry(0.312, 0.33, 0.1, 72, 1, true), MAT.galv(), [0, 0.845, 0]));
  // wire grille
  const geos = [];
  for (let r = 0.055; r <= 0.315; r += 0.0205) {
    const t = new THREE.TorusGeometry(r, 0.0022, 6, 72); t.rotateX(Math.PI / 2); t.translate(0, 0.91, 0); geos.push(t);
  }
  for (let i = 0; i < 8; i++) {
    const b = new THREE.BoxGeometry(0.63, 0.005, 0.006); b.rotateY((i * Math.PI) / 8); b.translate(0, 0.904, 0); geos.push(b);
  }
  const hub = new THREE.CylinderGeometry(0.075, 0.075, 0.006, 32); hub.translate(0, 0.908, 0); geos.push(hub);
  g.add(mesh(mergeGeometries(geos), MAT.grille()));
  return { object: g, anchor: V(0.3, 0.91, 0.3) };
}

function buildFanMotor() {
  const g = new THREE.Group();
  const m = MAT.motor();
  g.add(cyl(0.068, 0.085, m, [0, 0.8325, 0], null, 40));
  g.add(cyl(0.064, 0.03, MAT.blackPlastic(), [0, 0.89, 0], null, 40)); // ECM control module
  for (const y of [0.805, 0.83, 0.855]) {
    const t = mesh(new THREE.TorusGeometry(0.069, 0.003, 6, 40), m); t.rotation.x = Math.PI / 2; t.position.y = y; g.add(t);
  }
  g.add(cyl(0.0075, 0.065, MAT.galv(), [0, 0.76, 0], null, 16)); // shaft
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    g.add(cyl(0.005, 0.03, MAT.galv(), [Math.cos(a) * 0.045, 0.905 + 0.0, Math.sin(a) * 0.045], null, 10));
  }
  // lead + plug
  g.add(box(0.025, 0.018, 0.015, MAT.connector(), [0.075, 0.89, 0.02]));
  return { object: g, anchor: V(0.07, 0.84, 0.0) };
}

function buildFanBlade() {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  spin.name = 'spin';
  const shape = new THREE.Shape();
  shape.moveTo(0.032, -0.035);
  shape.lineTo(0.032, 0.035);
  shape.quadraticCurveTo(0.16, 0.115, 0.272, 0.092);
  shape.quadraticCurveTo(0.298, 0.02, 0.272, -0.052);
  shape.quadraticCurveTo(0.15, -0.075, 0.032, -0.035);
  const geos = [];
  for (let k = 0; k < 3; k++) {
    const b = new THREE.ExtrudeGeometry(shape, { depth: 0.003, bevelEnabled: false, curveSegments: 16 });
    b.translate(0, 0, -0.0015);
    b.rotateX(-Math.PI / 2);
    b.rotateX(0.42);
    b.rotateY((k * 2 * Math.PI) / 3);
    geos.push(b);
  }
  const hub = new THREE.CylinderGeometry(0.036, 0.036, 0.04, 32);
  geos.push(hub);
  const gm = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)));
  gm.computeVertexNormals();
  spin.add(mesh(gm, MAT.fanBlade()));
  spin.add(cyl(0.012, 0.045, MAT.galv(), [0, 0, 0], null, 12)); // set-screw boss
  spin.position.set(0, 0.742, 0);
  g.add(spin);
  return { object: g, anchor: V(0.2, 0.745, 0.12) };
}

function buildCoil() {
  const g = new THREE.Group();
  const pts = coilPathPoints();
  const tex = finTexture();
  const finMat = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 1.5, metalness: 0.55, roughness: 0.5, side: THREE.DoubleSide });
  g.add(mesh(wallGeometry(pts, 0.04, COIL_Y0, COIL_Y1), finMat));
  // top and bottom retaining rails
  const rail = MAT.galv();
  g.add(mesh(wallGeometry(pts, 0.046, COIL_Y1, COIL_Y1 + 0.012, 1, 1), rail));
  g.add(mesh(wallGeometry(pts, 0.046, COIL_Y0 - 0.012, COIL_Y0, 1, 1), rail.clone()));
  // headers
  const al = MAT.alum();
  g.add(cyl(0.014, 0.74, al, [HDR_A.x, 0.45, HDR_A.z], null, 18));
  g.add(cyl(0.014, 0.74, al, [HDR_B.x, 0.45, HDR_B.z], null, 18));
  // circuit stubs from headers into coil
  for (let i = 0; i < 8; i++) {
    const y = 0.12 + i * 0.09;
    g.add(rod(V(HDR_A.x, y, HDR_A.z), V(COIL_END + 0.01, y, HDR_A.z), 0.005, al));
    g.add(rod(V(HDR_B.x, y, HDR_B.z), V(HDR_B.x, y, COIL_END + 0.01), 0.005, al));
  }
  // coil flow paths for refrigerant animation: descend from header A to B
  const flows = [];
  for (let k = 0; k < 5; k++) {
    const yA = 0.75 - k * 0.13, yB = 0.68 - k * 0.13;
    const P = [V(HDR_A.x, yA, HDR_A.z)];
    for (let i = 0; i <= 40; i++) {
      const p = pts[Math.round((i / 40) * (pts.length - 1))];
      P.push(V(p.x, THREE.MathUtils.lerp(yA, yB, i / 40), p.y));
    }
    P.push(V(HDR_B.x, yB, HDR_B.z));
    flows.push({ curve: new THREE.CatmullRomCurve3(P), kind: 'condensing' });
  }
  return { object: g, flows, anchor: V(-0.36, 0.55, 0.2) };
}

function buildCompressor() {
  const g = new THREE.Group();
  const m = MAT.compressor();
  const prof = [
    [0, 0.075], [0.098, 0.075], [0.111, 0.088], [0.112, 0.1], [0.112, 0.385], [0.106, 0.425],
    [0.088, 0.452], [0.055, 0.468], [0.02, 0.473], [0, 0.474],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const shell = mesh(new THREE.LatheGeometry(prof, 56), m);
  shell.position.set(COMP.x, 0, COMP.z);
  g.add(shell);
  const seam = mesh(new THREE.TorusGeometry(0.113, 0.0035, 8, 56), m); seam.rotation.x = Math.PI / 2; seam.position.set(COMP.x, 0.33, COMP.z); g.add(seam);
  // mounting feet and isolation grommets
  const foot = m.clone();
  const rub = MAT.rubber();
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3 + Math.PI / 6;
    const dx = Math.cos(a), dz = Math.sin(a);
    const f = box(0.075, 0.008, 0.045, foot, [COMP.x + dx * 0.12, 0.078, COMP.z + dz * 0.12]);
    f.rotation.y = -a;
    g.add(f);
    g.add(cyl(0.016, 0.03, rub, [COMP.x + dx * 0.145, 0.062, COMP.z + dz * 0.145], null, 16));
    g.add(cyl(0.005, 0.045, MAT.galv(), [COMP.x + dx * 0.145, 0.075, COMP.z + dz * 0.145], null, 8));
  }
  // terminal cover
  g.add(box(0.03, 0.055, 0.06, MAT.blackPlastic(), [COMP.x + 0.124, 0.26, COMP.z]));
  // stubs
  g.add(cyl(0.0095, 0.03, MAT.copper(), [COMP.x, 0.485, COMP.z], null, 16));
  g.add(rod(COMP.clone().setY(0.3).addScaledVector(DIAG, 0.1), COMP.clone().setY(0.3).addScaledVector(DIAG, 0.145), 0.012, MAT.copper()));
  // label decal
  const lab = labelTexture([['INVERTER COMPRESSOR', 30, true], ['3-PHASE PM MOTOR', 26, false], ['DO NOT CONNECT TO LINE', 26, true]], { w: 512, h: 200, bg: '#ddd', title: null });
  const lm = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.035), new THREE.MeshStandardMaterial({ map: lab, roughness: 0.6 }));
  const la = -Math.PI / 4 - Math.PI / 2; // face toward -x+z
  lm.position.set(COMP.x + Math.cos(Math.PI * 0.75) * 0.1135, 0.2, COMP.z + Math.sin(Math.PI * 0.75) * 0.1135);
  lm.rotation.y = la;
  g.add(lm);
  return { object: g, anchor: V(COMP.x - 0.08, 0.3, COMP.z + 0.08) };
}

function buildSoundBlanket() {
  const g = new THREE.Group();
  const m = MAT.felt();
  const prof = [[0.13, 0.085], [0.13, 0.44], [0.115, 0.47], [0.075, 0.49], [0.03, 0.495]].map(([r, y]) => new THREE.Vector2(r, y));
  const s = mesh(new THREE.LatheGeometry(prof, 48, 0.4, Math.PI * 2 - 0.55), m);
  s.position.set(COMP.x, 0, COMP.z);
  g.add(s);
  // Velcro seam strips
  const v = MAT.blackPlastic();
  for (const a of [0.4, Math.PI * 2 - 0.15]) {
    const p = V(Math.sin(a) * 0.132, 0.27, Math.cos(a) * 0.132).add(COMP);
    const b = box(0.012, 0.34, 0.004, v, p); b.rotation.y = a; g.add(b);
  }
  return { object: g, anchor: V(COMP.x - 0.1, 0.42, COMP.z - 0.05) };
}

function buildControlBox() {
  const g = new THREE.Group();
  const f = cbFrame();
  const m = MAT.galv();
  const W = 0.22, H = 0.4, D = 0.12;
  f.add(box(W, H, 0.003, m, [0, 0, -D / 2]));
  f.add(box(W, 0.003, D, m, [0, H / 2, 0]));
  f.add(box(W, 0.003, D, m, [0, -H / 2, 0]));
  f.add(box(0.003, H, D, m, [-W / 2, 0, 0]));
  f.add(box(0.003, H, D, m, [W / 2, 0, 0]));
  // knockouts / grommets in bottom
  for (const x of [-0.05, 0.0, 0.06]) f.add(cyl(0.011, 0.006, MAT.rubber(), [x, -H / 2, 0], null, 16));
  g.add(f);
  return { object: g, anchor: CB_CENTER.clone().add(V(0, 0.18, 0)).addScaledVector(DIAG_PERP, -0.11) };
}

function buildDrive() {
  const g = new THREE.Group();
  const f = cbFrame();
  const yc = -0.055;
  f.add(box(0.19, 0.15, 0.003, MAT.pcbBlue(), [0, yc, -0.05]));
  // DC bus capacitors
  for (const x of [-0.06, -0.025]) f.add(cyl(0.015, 0.045, MAT.capBlue(), [x, yc + 0.035, -0.026], [Math.PI / 2, 0, 0], 20));
  // IPM / power module
  f.add(box(0.05, 0.035, 0.01, MAT.chip(), [0.04, yc - 0.03, -0.043]));
  // bridge rectifier
  f.add(box(0.03, 0.03, 0.012, MAT.chip(), [0.0, yc - 0.035, -0.042]));
  // relay, connectors, inductor
  f.add(box(0.026, 0.02, 0.018, MAT.relay(), [0.05, yc + 0.035, -0.04]));
  f.add(box(0.04, 0.01, 0.012, MAT.connector(), [-0.04, yc - 0.06, -0.043]));
  f.add(box(0.03, 0.01, 0.012, MAT.connector(), [0.06, yc - 0.06, -0.043]));
  const ind = mesh(new THREE.TorusGeometry(0.012, 0.006, 10, 20), MAT.copper(), [0.0, yc + 0.035, -0.043]);
  f.add(ind);
  // compressor U-V-W output terminals
  for (let i = 0; i < 3; i++) f.add(box(0.008, 0.012, 0.008, MAT.brass(), [-0.07 + i * 0.016, yc - 0.06, -0.042]));
  // heat sink through back wall (cooled by condenser airflow)
  f.add(box(0.15, 0.12, 0.008, MAT.alum(), [0, yc, -0.066]));
  for (let i = 0; i < 13; i++) f.add(box(0.0025, 0.12, 0.05, MAT.alum(), [-0.072 + i * 0.012, yc, -0.095]));
  g.add(f);
  return { object: g, anchor: CB_CENTER.clone().add(V(0, -0.055, 0)).addScaledVector(DIAG, -0.04) };
}

function buildControlBoard() {
  const g = new THREE.Group();
  const f = cbFrame();
  const yc = 0.11;
  f.add(box(0.19, 0.12, 0.003, MAT.pcb(), [0, yc, -0.05]));
  f.add(box(0.03, 0.03, 0.004, MAT.chip(), [-0.02, yc + 0.01, -0.047]));
  f.add(box(0.02, 0.016, 0.016, MAT.relay(), [0.05, yc + 0.03, -0.041]));
  f.add(box(0.02, 0.016, 0.016, MAT.relay(), [0.05, yc, -0.041]));
  f.add(box(0.035, 0.012, 0.012, MAT.connector(), [-0.06, yc + 0.04, -0.043]));
  f.add(box(0.025, 0.012, 0.012, MAT.connector(), [0.0, yc + 0.045, -0.043]));
  // low-voltage / communication terminal strip
  f.add(box(0.1, 0.018, 0.016, MAT.termGreen(), [-0.03, yc - 0.045, -0.041]));
  for (let i = 0; i < 5; i++) f.add(cyl(0.0035, 0.004, MAT.galv(), [-0.07 + i * 0.02, yc - 0.045, -0.032], [Math.PI / 2, 0, 0], 10));
  // diagnostic LEDs
  const leds = [];
  const l1 = mesh(new THREE.SphereGeometry(0.004, 12, 8), MAT.ledGreen(), [0.07, yc - 0.035, -0.046]);
  const l2 = mesh(new THREE.SphereGeometry(0.004, 12, 8), MAT.ledRed(), [0.08, yc - 0.035, -0.046]);
  l1.userData.noHighlight = l2.userData.noHighlight = true;
  l1.userData.led = 'green'; l2.userData.led = 'red';
  f.add(l1, l2); leds.push(l1, l2);
  f.add(box(0.03, 0.014, 0.004, MAT.chip(), [0.065, yc - 0.012, -0.047])); // status display
  g.add(f);
  return { object: g, anchor: CB_CENTER.clone().add(V(0, 0.11, 0)).addScaledVector(DIAG, -0.04), leds };
}

function buildReactor() {
  const g = new THREE.Group();
  const f = cbFrame();
  const p = [-0.055, -0.165, -0.025];
  f.add(box(0.065, 0.045, 0.05, MAT.laminations(), p));
  f.add(box(0.035, 0.05, 0.056, MAT.copper(), p));
  f.add(box(0.075, 0.006, 0.06, MAT.galv(), [p[0], p[1] - 0.025, p[2]]));
  g.add(f);
  return { object: g, anchor: CB_CENTER.clone().add(V(0, -0.165, 0)).addScaledVector(DIAG_PERP, -0.055) };
}

function buildTerminalBlock() {
  const g = new THREE.Group();
  const f = cbFrame();
  const p = [0.055, -0.165, -0.035];
  f.add(box(0.075, 0.035, 0.03, MAT.blackPlastic(), p));
  for (const dx of [-0.02, 0.005]) f.add(box(0.016, 0.02, 0.012, MAT.brass(), [p[0] + dx, p[1], p[2] + 0.02]));
  f.add(box(0.014, 0.02, 0.012, MAT.termGreen(), [p[0] + 0.028, p[1], p[2] + 0.02]));
  g.add(f);
  return { object: g, anchor: CB_CENTER.clone().add(V(0, -0.165, 0)).addScaledVector(DIAG_PERP, 0.055) };
}

function pipePart(curve, r, kind, extra) {
  const g = new THREE.Group();
  g.add(tube(curve, r, MAT.copper(), 90));
  const flows = [{ curve, kind }];
  if (extra) extra(g, flows);
  return { object: g, flows };
}

function buildDischarge() {
  return pipePart(CURVES.discharge, 0.0085, 'discharge');
}
function buildLiquid() {
  return pipePart(CURVES.liquid, 0.0062, 'liquid');
}
function buildSuction() {
  return pipePart(CURVES.suction, 0.0115, 'suction');
}

function buildDrier() {
  const g = new THREE.Group();
  const m = MAT.drier();
  const z0 = 0.14, z1 = 0.195;
  g.add(cyl(0.017, z1 - z0, m, [0.28, 0.13, (z0 + z1) / 2], [Math.PI / 2, 0, 0], 24));
  g.add(cyl(0.017, 0.012, m, [0.28, 0.13, z0 - 0.006], [-Math.PI / 2, 0, 0], 24, 0.007));
  g.add(cyl(0.017, 0.012, m, [0.28, 0.13, z1 + 0.006], [Math.PI / 2, 0, 0], 24, 0.007));
  // flow arrow decal ring
  const t = mesh(new THREE.TorusGeometry(0.0172, 0.0015, 6, 24), MAT.wireWhite(), [0.28, 0.13, 0.17]);
  g.add(t);
  return { object: g, anchor: V(0.28, 0.15, 0.17) };
}

function serviceValve(P, size, g) {
  const grp = new THREE.Group();
  grp.position.copy(P);
  grp.rotation.y = Math.PI / 4;
  grp.add(box(size, size * 1.1, size, MAT.brass(), [0, 0, 0]));
  // stem + cap (side, along local x)
  grp.add(cyl(size * 0.32, size * 0.5, MAT.brass(), [size * 0.7, 0, 0], [0, 0, Math.PI / 2], 6));
  // Schrader access port on top
  grp.add(cyl(size * 0.16, size * 0.5, MAT.brass(), [0, size * 0.75, 0], null, 12));
  grp.add(cyl(size * 0.2, size * 0.25, MAT.blackPlastic(), [0, size * 1.05, 0], null, 12));
  // flare/sweat stub toward unit
  grp.add(cyl(size * 0.22, size * 0.35, MAT.copper(), [0, 0, -size * 0.6], [Math.PI / 2, 0, 0], 12));
  g.add(grp);
}

function buildServiceValves() {
  const g = new THREE.Group();
  serviceValve(P_LIQ, 0.028, g);
  serviceValve(P_SUC, 0.038, g);
  // mounting bracket
  const b = box(0.13, 0.16, 0.004, MAT.galv(), CB_CENTER.clone().setY(0.17).addScaledVector(DIAG, -0.018));
  b.rotation.y = Math.PI / 4;
  g.add(b);
  // field line stubs (to indoor coil) + suction insulation
  g.add(tube(FIELD.liquid, 0.0062, MAT.copper(), 20));
  g.add(tube(FIELD.suction, 0.0115, MAT.copper(), 20));
  const ins = curveOf([P_SUC.clone().addScaledVector(DIAG, 0.07), P_SUC.clone().addScaledVector(DIAG, 0.26)]);
  g.add(tube(ins, 0.02, MAT.insulation(), 8));
  return {
    object: g,
    flows: [{ curve: FIELD.liquid, kind: 'liquid' }, { curve: FIELD.suction, kind: 'suction' }],
    anchor: P_SUC.clone().add(V(0, 0.03, 0)),
  };
}

function pressureSwitch(curve, t, color, g) {
  const p = curve.getPointAt(t);
  g.add(cyl(0.004, 0.03, MAT.copper(), [p.x, p.y + 0.015, p.z], null, 10));
  g.add(cyl(0.009, 0.01, MAT.brass(), [p.x, p.y + 0.034, p.z], null, 6));
  g.add(cyl(0.012, 0.03, color, [p.x, p.y + 0.054, p.z], null, 20));
  g.add(cyl(0.002, 0.04, MAT.wireBlack(), [p.x + 0.006, p.y + 0.085, p.z], null, 6));
  g.add(cyl(0.002, 0.04, MAT.wireBlack(), [p.x - 0.006, p.y + 0.085, p.z], null, 6));
  return p.clone().setY(p.y + 0.06);
}
function buildHPS() {
  const g = new THREE.Group();
  const a = pressureSwitch(CURVES.discharge, 0.42, std({ color: 0xb02a2a, metalness: 0.2, roughness: 0.5 }), g);
  return { object: g, anchor: a };
}
function buildLPS() {
  const g = new THREE.Group();
  const a = pressureSwitch(CURVES.suction, 0.3, std({ color: 0x2a5bb0, metalness: 0.2, roughness: 0.5 }), g);
  return { object: g, anchor: a };
}

function thermistor(p, dirUp, ex) {
  const c = new THREE.Group();
  c.position.copy(p);
  const m = MAT.sensor();
  c.add(cyl(0.006, 0.03, m, [0, 0, 0], [0, 0, Math.PI / 2], 12));
  const clip = mesh(new THREE.TorusGeometry(0.012, 0.002, 6, 16), MAT.galv()); clip.rotation.y = Math.PI / 2; c.add(clip);
  c.add(cyl(0.0018, 0.06, MAT.wireBlack(), [0, 0.03 * dirUp, 0], null, 6));
  c.userData.ex = ex;
  return c;
}
function buildSensors() {
  const g = new THREE.Group();
  const pd = CURVES.discharge.getPointAt(0.12);
  const pl = CURVES.liquid.getPointAt(0.2);
  const ps = CURVES.suction.getPointAt(0.72);
  g.add(thermistor(pd.clone().add(V(0.0, 0, 0.012)), 1, V(-0.1, 0.16, 0.1)));
  g.add(thermistor(pl.clone().add(V(0, 0.012, 0)), 1, V(0.1, 0.12, -0.05)));
  g.add(thermistor(ps.clone().add(V(0, 0.016, 0)), 1, V(0.0, 0.2, -0.05)));
  // outdoor ambient sensor on bracket under control box
  const oat = new THREE.Group();
  oat.position.copy(CB_CENTER.clone().setY(0.385).addScaledVector(DIAG_PERP, 0.08));
  oat.add(box(0.03, 0.004, 0.02, MAT.galv(), [0, 0.01, 0]));
  oat.add(cyl(0.005, 0.03, MAT.sensor(), [0, -0.006, 0], null, 12));
  oat.userData.ex = V(0.18, -0.02, 0.05);
  g.add(oat);
  return { object: g, anchor: pd.clone().add(V(0, 0.02, 0.012)) };
}

function buildWiring() {
  const g = new THREE.Group();
  // compressor U/V/W leads to drive
  const T = V(COMP.x + 0.14, 0.27, COMP.z);
  const cbBottom = CB_CENTER.clone().setY(0.42);
  const mats = [MAT.wireRed(), MAT.wireBlack(), MAT.wireBlue()];
  for (let i = 0; i < 3; i++) {
    const o = (i - 1) * 0.009;
    const c = curveOf([T.clone().add(V(0, o, 0)), V(0.15, 0.28 + o, 0.0), V(0.21, 0.33 + o, 0.14), cbBottom.clone().add(V(-0.03, -0.04 + o, -0.03)), cbBottom.clone().add(V(o, 0.03, -o))]);
    g.add(tube(c, 0.0035, mats[i], 60));
  }
  // fan motor lead to control box top
  const fan = curveOf([V(0.085, 0.89, 0.02), V(0.2, 0.86, 0.1), V(0.27, 0.855, 0.2), CB_CENTER.clone().setY(0.84), CB_CENTER.clone().setY(0.8)]);
  g.add(tube(fan, 0.004, MAT.wireBlack(), 60));
  // field line-voltage whip in flexible conduit
  const tb = CB_CENTER.clone().setY(0.44).addScaledVector(DIAG_PERP, 0.055);
  const whip = curveOf([tb, V(0.33, 0.36, 0.2), V(0.43, 0.31, 0.2), V(0.53, 0.22, 0.2), V(0.56, 0.02, 0.2)]);
  g.add(tube(whip, 0.011, MAT.conduit(), 60));
  // sensor harness
  const sh = curveOf([CURVES.discharge.getPointAt(0.12).add(V(0, 0.03, 0.012)), V(0.0, 0.6, 0.1), V(0.16, 0.5, 0.2), cbBottom.clone().add(V(0, 0.03, 0))]);
  g.add(tube(sh, 0.0022, MAT.wireWhite(), 50));
  return { object: g, anchor: V(0.18, 0.3, 0.08) };
}

// ---------------------------------------------------------------- registry
// explode: assembled -> exploded translation (radial service view)
// order: stagger order for cascading animation (lower = moves first)
export const GROUPS = [
  { id: 'cabinet', name: 'Cabinet & Structure' },
  { id: 'airflow', name: 'Airflow' },
  { id: 'refrigerant', name: 'Refrigerant Circuit' },
  { id: 'compressor', name: 'Compressor' },
  { id: 'electrical', name: 'Electrical & Controls' },
];

const D = (k, y = 0) => DIAG.clone().multiplyScalar(k).setY(y);

const PART_DEFS = [
  { id: 'top-cover', name: 'Top Cover & Fan Grille', group: 'cabinet', build: buildTopCover, explode: V(0, 0.98, 0), order: 0, shell: true },
  { id: 'access-panel', name: 'Service Access Panel', group: 'cabinet', build: buildAccessPanel, explode: D(1.2, 0.32), order: 0, shell: true },
  { id: 'fan-motor', name: 'ECM Fan Motor', group: 'airflow', build: buildFanMotor, explode: V(0, 0.74, 0), order: 1 },
  { id: 'fan-blade', name: 'Condenser Fan Blade', group: 'airflow', build: buildFanBlade, explode: V(0, 0.54, 0), order: 2 },
  { id: 'louvers', name: 'Louvered Coil Guards', group: 'cabinet', build: buildLouvers, explode: V(0, 0, 0), order: 1, shell: true },
  { id: 'corner-posts', name: 'Corner Posts', group: 'cabinet', build: buildCornerPosts, explode: V(0, 0, 0), order: 2, shell: true },
  { id: 'control-box', name: 'Control Box', group: 'electrical', build: buildControlBox, explode: D(0.42, 0.04), order: 3 },
  { id: 'control-board', name: 'Outdoor Control Board', group: 'electrical', build: buildControlBoard, explode: D(0.72, 0.2), order: 4 },
  { id: 'inverter-drive', name: 'Inverter Drive (VSD)', group: 'electrical', build: buildDrive, explode: D(0.66, 0.0), order: 4 },
  { id: 'reactor', name: 'Line Reactor / Choke', group: 'electrical', build: buildReactor, explode: D(0.58, -0.14).add(DIAG_PERP.clone().multiplyScalar(-0.1)), order: 5 },
  { id: 'terminal-block', name: 'Line-Voltage Terminal Block', group: 'electrical', build: buildTerminalBlock, explode: D(0.6, -0.14).add(DIAG_PERP.clone().multiplyScalar(0.12)), order: 5 },
  { id: 'coil', name: 'Spine Fin™ Condenser Coil', group: 'refrigerant', build: buildCoil, explode: V(-0.36, 0.08, -0.36), order: 3 },
  { id: 'sound-blanket', name: 'Compressor Sound Blanket', group: 'compressor', build: buildSoundBlanket, explode: V(-0.05, 0.62, -0.05), order: 4, shell: true },
  { id: 'compressor', name: 'Variable-Speed Compressor', group: 'compressor', build: buildCompressor, explode: V(-0.12, 0.12, -0.12), order: 6 },
  { id: 'discharge-line', name: 'Discharge Line', group: 'refrigerant', build: buildDischarge, explode: V(0.02, 0.3, 0.02), order: 6 },
  { id: 'hp-switch', name: 'High-Pressure Switch', group: 'refrigerant', build: buildHPS, explode: V(0.06, 0.5, 0.06), order: 7 },
  { id: 'suction-line', name: 'Suction Line', group: 'refrigerant', build: buildSuction, explode: D(0.16, 0.06), order: 6 },
  { id: 'lp-switch', name: 'Low-Pressure Switch', group: 'refrigerant', build: buildLPS, explode: D(0.2, 0.24), order: 7 },
  { id: 'liquid-line', name: 'Liquid Line', group: 'refrigerant', build: buildLiquid, explode: D(0.22, -0.02), order: 6 },
  { id: 'filter-drier', name: 'Liquid-Line Filter Drier', group: 'refrigerant', build: buildDrier, explode: D(0.24, 0.16).add(DIAG_PERP.clone().multiplyScalar(0.12)), order: 7 },
  { id: 'service-valves', name: 'Service Valves', group: 'refrigerant', build: buildServiceValves, explode: D(0.42, 0.0), order: 7 },
  { id: 'sensors', name: 'Temperature Sensors', group: 'electrical', build: buildSensors, explode: V(0, 0.3, 0), order: 8 },
  { id: 'wiring', name: 'Wiring Harness & Whip', group: 'electrical', build: buildWiring, explode: D(0.16, 0.12), order: 8 },
  { id: 'base-pan', name: 'Base Pan', group: 'cabinet', build: buildBasePan, explode: V(0, 0, 0), order: 9 },
];

export function buildUnit() {
  const parts = PART_DEFS.map((def, i) => {
    const built = def.build();
    const root = new THREE.Group();
    root.name = def.id;
    root.add(built.object);
    const meshes = [];
    root.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.userData.partId = def.id;
        o.userData.baseMat = o.material;
        meshes.push(o);
      }
      if (o.userData.ex) o.userData.base = o.position.clone();
    });
    const box3 = new THREE.Box3().setFromObject(root);
    const center = box3.getCenter(new THREE.Vector3());
    return {
      ...def,
      num: i + 1,
      root,
      meshes,
      flows: built.flows || [],
      leds: built.leds || [],
      anchor: built.anchor || center,
      center,
      size: box3.getSize(new THREE.Vector3()),
      e: 0,
      target: 0,
    };
  });
  // number parts in a stable, readable order (by group then definition order)
  const order = GROUPS.map((g) => g.id);
  parts.slice().sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || PART_DEFS.indexOf(a) - PART_DEFS.indexOf(b))
    .forEach((p, i) => { p.num = i + 1; });
  return parts;
}

export function buildPad() {
  const pad = box(1.05, 0.08, 1.05, MAT.concrete(), [0, -0.04, 0]);
  pad.castShadow = false;
  return pad;
}
