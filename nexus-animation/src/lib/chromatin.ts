import * as THREE from 'three';
import {clamp, easeInOutCubic, easeOutCubic, lerp, ramp, smoothstep} from './math';

type V3 = THREE.Vector3;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------------ */
/* Physical constants (1 unit ~ 1 nm)                                  */
/* ------------------------------------------------------------------ */
export const G = {
  SH_R: 5.2, // superhelix radius (DNA axis around the octamer)
  SH_PITCH: 2.55, // superhelix rise per turn
  TURNS: 1.7, // ~1.7 left-handed turns per nucleosome
  HELIX_R: 0.85, // backbone distance from DNA axis
  BB_R: 0.3, // backbone tube radius
  RISE: 0.34, // rise per base pair
  BP_TURN: 10.5, // base pairs per helical turn (B-DNA)
  STRAND_OFFSET: (150 / 180) * Math.PI, // unequal spacing gives major + minor grooves
  RUNG_R: 0.12,
  CORE_R: 4.35,
  SAMPLES_PER_BP: 4,
  SPACING: 22, // dyad-to-dyad spacing in relaxed beads-on-a-string
};
const SH_C = G.SH_PITCH / (2 * Math.PI);
const SH_PHI = G.TURNS * Math.PI; // half-angle of the full wrap
export const WRAP_ARC = 2 * SH_PHI * Math.sqrt(G.SH_R * G.SH_R + SH_C * SH_C);

/* ------------------------------------------------------------------ */
/* Nucleosome description                                              */
/* ------------------------------------------------------------------ */
export type MarkType = 'ac' | 'me3' | null;
export type Tail = {anchor: V3; dir: V3; len: number; phase: number; mark: MarkType; markScale: number};
export type Nuc = {
  id: number;
  P: V3; // dyad point on the DNA axis
  u: V3; // chain direction at the dyad
  D: V3; // from core centre to dyad
  wrap: number; // 0..1 fraction of the 1.7-turn wrap
  coreOffset: V3; // displacement of the core (fly-in)
  coreSpin: number;
  coreVisible: number;
  tails: Tail[];
  coil: boolean;
  // derived
  C: V3;
  e1: V3;
  e2: V3;
  e3: V3;
  phi: number;
};

export function nucFrame(n: Nuc) {
  const u = n.u.clone().normalize();
  const D = n.D.clone().sub(u.clone().multiplyScalar(n.D.dot(u))).normalize();
  const w = u.clone().cross(D).normalize();
  const beta = Math.atan2(SH_C, G.SH_R);
  n.e1 = D;
  n.e2 = u.clone().multiplyScalar(-Math.cos(beta)).add(w.clone().multiplyScalar(Math.sin(beta)));
  n.e3 = u.clone().multiplyScalar(Math.sin(beta)).add(w.clone().multiplyScalar(Math.cos(beta)));
  n.C = n.P.clone().sub(D.clone().multiplyScalar(G.SH_R));
  n.phi = SH_PHI * n.wrap;
}

/** Point on the left-handed superhelix at angle phi. */
export function shPoint(n: Nuc, phi: number, out = v3()) {
  return out
    .copy(n.C)
    .addScaledVector(n.e1, G.SH_R * Math.cos(phi))
    .addScaledVector(n.e2, -G.SH_R * Math.sin(phi))
    .addScaledVector(n.e3, SH_C * phi);
}
export function shTangent(n: Nuc, phi: number, out = v3()) {
  return out
    .set(0, 0, 0)
    .addScaledVector(n.e1, -G.SH_R * Math.sin(phi))
    .addScaledVector(n.e2, -G.SH_R * Math.cos(phi))
    .addScaledVector(n.e3, SH_C)
    .normalize();
}

/** Core-local (e1,e2,e3) -> world, including fly-in offset. */
export function coreToWorld(n: Nuc, local: V3, out = v3()) {
  const c = Math.cos(n.coreSpin);
  const s = Math.sin(n.coreSpin);
  const lx = local.x * c - local.y * s;
  const ly = local.x * s + local.y * c;
  return out
    .copy(n.C)
    .add(n.coreOffset)
    .addScaledVector(n.e1, lx)
    .addScaledVector(n.e2, ly)
    .addScaledVector(n.e3, local.z);
}
export function coreDirToWorld(n: Nuc, local: V3, out = v3()) {
  const c = Math.cos(n.coreSpin);
  const s = Math.sin(n.coreSpin);
  const lx = local.x * c - local.y * s;
  const ly = local.x * s + local.y * c;
  return out.set(0, 0, 0).addScaledVector(n.e1, lx).addScaledVector(n.e2, ly).addScaledVector(n.e3, local.z).normalize();
}

/* ------------------------------------------------------------------ */
/* Story timing for chromatin (frames @30fps)                         */
/* ------------------------------------------------------------------ */
export const T = {
  wrap: {
    0: [36, 94],
    1: [70, 124],
    2: [96, 148],
    3: [118, 160],
    [-1]: [126, 168],
    4: [132, 170],
    [-2]: [138, 172],
  } as Record<number, [number, number]>,
  writerArrive: [186, 214],
  mark1: 226,
  writerHop: [236, 252],
  mark2: 260,
  writerLeave: [266, 318],
  open: [262, 316],
  pol1Arrive: [292, 324],
  pol1Clamp: [318, 330],
  pol1Move: [330, 440],
  pol2Arrive: [354, 384],
  pol2Bump: 384,
};

export const LOOSE_MIN = -3;
export const LOOSE_MAX = 8;
export const COIL_N = 24;
const COIL_X0 = 200;
const COIL_RC = 13.2; // radius of core centres around the fibre axis
const COIL_PER_TURN = 6;
const COIL_RISE = 1.3;

const wrapAt = (i: number, f: number) => {
  const w = T.wrap[i];
  if (!w) return f < 150 ? 0 : ramp(f, 140, 176);
  return ramp(f, w[0], w[1], easeInOutCubic);
};

/** Displacement of each loose nucleosome during chromatin opening. */
export const openAmount = (f: number) => ramp(f, T.open[0], T.open[1], easeInOutCubic);
const openShift: Record<number, number> = {4: -10, 5: 20, 6: 12, 7: 5};

const looseDyad = (x: number) => v3(x, 1.6 * Math.sin(x / 37), 2.4 * Math.sin(x / 53 + 1));
const looseDir = (x: number) =>
  v3(1, (1.6 / 37) * Math.cos(x / 37), (2.4 / 53) * Math.cos(x / 53 + 1)).normalize();

// rotation of the dyad direction around the chain axis, per nucleosome
const PSI: Record<number, number> = {
  [-3]: 0.4,
  [-2]: 2.5,
  [-1]: 4.4,
  0: 0.15,
  1: 2.2,
  2: 4.3,
  3: 0.6,
  4: 1.15,
  5: 1.35,
  6: 3.1,
  7: 5.0,
  8: 1.2,
};

export function markState(id: number, tail: number, f: number): {mark: MarkType; scale: number} {
  if (id >= 100) {
    // compact coil: repressive marks on most H3 tails
    if (tail === 0 || (tail === 1 && id % 2 === 0)) return {mark: 'me3', scale: 1};
    return {mark: null, scale: 0};
  }
  if (id === 4 && tail === 0) return {mark: 'ac', scale: ramp(f, T.mark1, T.mark1 + 10, (t) => t)};
  if (id === 5 && tail === 0) return {mark: 'ac', scale: ramp(f, T.mark2, T.mark2 + 10, (t) => t)};
  return {mark: null, scale: 0};
}

function makeTails(id: number, f: number, coil: boolean): Tail[] {
  const t0 = markState(id, 0, f);
  const t1 = markState(id, 1, f);
  const t2 = markState(id, 2, f);
  const out: Tail[] = [
    // H3 tails emerge between the two DNA gyres near the entry and exit
    {anchor: v3(4.0 * Math.cos(-0.95), -4.0 * Math.sin(-0.95), 0.9), dir: v3(Math.cos(-0.95), -Math.sin(-0.95), 0.25), len: 7, phase: id * 1.3, mark: t0.mark, markScale: t0.scale},
    {anchor: v3(4.0 * Math.cos(0.95), -4.0 * Math.sin(0.95), -0.9), dir: v3(Math.cos(0.95), -Math.sin(0.95), -0.25), len: 6.4, phase: id * 0.7 + 2, mark: t1.mark, markScale: t1.scale},
    // H4 / H2A tail from the disc face
    {anchor: v3(-1.6, 1.2, 2.6), dir: v3(-0.45, 0.25, 1), len: 5.6, phase: id * 2.1 + 4, mark: t2.mark, markScale: t2.scale},
  ];
  if (coil) out.forEach((t) => (t.len *= 0.85));
  return out;
}

/** Full chromatin state for a frame. */
export function chromatinState(f: number) {
  const nucs: Nuc[] = [];
  // Contour-length conservation: dyads are further apart while DNA is unwrapped.
  const wraps: Record<number, number> = {};
  for (let i = LOOSE_MIN; i <= LOOSE_MAX; i++) wraps[i] = wrapAt(i, f);
  const extra = WRAP_ARC * 0.5 * 0.82;
  const xs: Record<number, number> = {0: 0};
  for (let i = 1; i <= LOOSE_MAX; i++) xs[i] = xs[i - 1] + G.SPACING + extra * (2 - wraps[i - 1] - wraps[i]);
  for (let i = -1; i >= LOOSE_MIN; i--) xs[i] = xs[i + 1] - G.SPACING - extra * (2 - wraps[i + 1] - wraps[i]);
  const o = openAmount(f);

  for (let i = LOOSE_MIN; i <= LOOSE_MAX; i++) {
    const x = xs[i] + (openShift[i] ?? 0) * o;
    const P = looseDyad(x);
    const u = looseDir(x);
    let D = v3(0, 1, 0);
    D.sub(u.clone().multiplyScalar(D.dot(u))).normalize();
    D.applyAxisAngle(u, PSI[i]);
    // Fly-in of the octamer before the DNA wraps onto it.
    const w = T.wrap[i] ?? [140, 176];
    const fly = ramp(f, w[0] - 46, w[0] + 6, easeOutCubic);
    const off = D.clone()
      .multiplyScalar(-26 * (1 - fly))
      .add(v3(0, -10, -34).multiplyScalar(1 - fly));
    const n: Nuc = {
      id: i,
      P,
      u,
      D,
      wrap: wraps[i],
      coreOffset: off,
      coreSpin: (1 - fly) * 1.2,
      coreVisible: smoothstep(w[0] - 46, w[0] - 30, f),
      tails: makeTails(i, f, false),
      coil: false,
    } as Nuc;
    nucFrame(n);
    nucs.push(n);
  }

  // Compact coil (solenoid-like 30 nm fibre), repressed.
  const rd = COIL_RC + G.SH_R;
  for (let k = 0; k < COIL_N; k++) {
    const a = (k * 2 * Math.PI) / COIL_PER_TURN + 2.2;
    const P = v3(COIL_X0 + k * COIL_RISE, rd * Math.cos(a), rd * Math.sin(a));
    const da = (2 * Math.PI) / COIL_PER_TURN;
    const u = v3(COIL_RISE, -rd * Math.sin(a) * da, rd * Math.cos(a) * da).normalize();
    const D = v3(0, Math.cos(a), Math.sin(a));
    const n: Nuc = {
      id: 100 + k,
      P,
      u,
      D,
      wrap: 1,
      coreOffset: v3(),
      coreSpin: 0,
      coreVisible: 1,
      tails: makeTails(100 + k, f, true),
      coil: true,
    } as Nuc;
    nucFrame(n);
    nucs.push(n);
  }
  return nucs;
}

/* ------------------------------------------------------------------ */
/* DNA centreline                                                      */
/* ------------------------------------------------------------------ */
export type Centerline = {
  n: number;
  pos: Float32Array;
  tan: Float32Array;
  nor: Float32Array;
  bin: Float32Array;
  ds: number;
  dyadS: Map<number, number>;
  length: number;
};

function hermite(p0: V3, m0: V3, p1: V3, m1: V3, t: number, out: V3) {
  const t2 = t * t;
  const t3 = t2 * t;
  return out
    .set(0, 0, 0)
    .addScaledVector(p0, 2 * t3 - 3 * t2 + 1)
    .addScaledVector(m0, t3 - 2 * t2 + t)
    .addScaledVector(p1, -2 * t3 + 3 * t2)
    .addScaledVector(m1, t3 - t2);
}

export function buildCenterline(nucs: Nuc[], leadIn = 160, leadOut = 140): Centerline {
  const raw: number[] = [];
  const rawDyad: [number, number][] = []; // [nucleosome id, raw index]
  const push = (p: V3) => raw.push(p.x, p.y, p.z);
  const tmp = v3();
  const tmpT = v3();

  const first = nucs[0];
  const entry0 = shPoint(first, -first.phi);
  const tan0 = shTangent(first, -first.phi);
  const start = entry0.clone().addScaledVector(tan0, -leadIn);
  const nLead = Math.ceil(leadIn / 0.5);
  for (let k = 0; k < nLead; k++) push(tmp.copy(start).lerp(entry0, k / nLead));

  for (let i = 0; i < nucs.length; i++) {
    const n = nucs[i];
    // wrapped part
    const arc = 2 * n.phi * Math.sqrt(G.SH_R * G.SH_R + SH_C * SH_C);
    const ns = Math.max(1, Math.ceil(arc / 0.3));
    for (let k = 0; k <= ns; k++) {
      const phi = -n.phi + (2 * n.phi * k) / ns;
      if (k === Math.floor(ns / 2)) rawDyad.push([n.id, raw.length / 3]);
      push(shPoint(n, phi, tmp));
    }
    // linker to the next nucleosome
    const exitP = shPoint(n, n.phi);
    const exitT = shTangent(n, n.phi);
    if (i < nucs.length - 1) {
      const m = nucs[i + 1];
      const entP = shPoint(m, -m.phi);
      const entT = shTangent(m, -m.phi);
      const chord = exitP.distanceTo(entP);
      const k0 = exitT.clone().multiplyScalar(chord * 1.05);
      const k1 = entT.clone().multiplyScalar(chord * 1.05);
      const nl = Math.max(6, Math.ceil((chord * 1.3) / 0.3));
      for (let k = 1; k < nl; k++) push(hermite(exitP, k0, entP, k1, k / nl, tmp));
    } else {
      const nl = Math.ceil(leadOut / 0.5);
      for (let k = 1; k <= nl; k++) push(tmp.copy(exitP).addScaledVector(exitT, (leadOut * k) / nl));
    }
  }
  void tmpT;

  // cumulative raw length
  const nr = raw.length / 3;
  const cum = new Float64Array(nr);
  for (let k = 1; k < nr; k++) {
    const dx = raw[3 * k] - raw[3 * k - 3];
    const dy = raw[3 * k + 1] - raw[3 * k - 2];
    const dz = raw[3 * k + 2] - raw[3 * k - 1];
    cum[k] = cum[k - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const length = cum[nr - 1];
  const dyadS = new Map<number, number>();
  rawDyad.forEach(([id, idx]) => dyadS.set(id, cum[idx]));

  // resample by arc length
  const ds = G.RISE / G.SAMPLES_PER_BP;
  const n = Math.floor(length / ds) + 1;
  const pos = new Float32Array(n * 3);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = k * ds;
    while (j < nr - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j];
    const t = seg > 1e-9 ? clamp((s - cum[j]) / seg) : 0;
    for (let c = 0; c < 3; c++) pos[3 * k + c] = lerp(raw[3 * j + c], raw[3 * j + 3 + c], t);
  }
  // light smoothing removes kinks at segment joins
  for (let pass = 0; pass < 2; pass++) {
    const copy = pos.slice();
    for (let k = 2; k < n - 2; k++)
      for (let c = 0; c < 3; c++)
        pos[3 * k + c] =
          (copy[3 * (k - 2) + c] + 4 * copy[3 * (k - 1) + c] + 6 * copy[3 * k + c] + 4 * copy[3 * (k + 1) + c] + copy[3 * (k + 2) + c]) / 16;
  }
  const {tan, nor, bin} = transportFrames(pos, n);
  return {n, pos, tan, nor, bin, ds, dyadS, length: (n - 1) * ds};
}

/** Parallel-transport (rotation-minimising) frames along a polyline. */
export function transportFrames(pos: Float32Array, n: number, initialNormal?: V3) {
  const tan = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const bin = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 1);
    const b = Math.min(n - 1, k + 1);
    let x = pos[3 * b] - pos[3 * a];
    let y = pos[3 * b + 1] - pos[3 * a + 1];
    let z = pos[3 * b + 2] - pos[3 * a + 2];
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    x /= l;
    y /= l;
    z /= l;
    tan[3 * k] = x;
    tan[3 * k + 1] = y;
    tan[3 * k + 2] = z;
  }
  // initial normal
  const t0 = v3(tan[0], tan[1], tan[2]);
  let N = initialNormal ? initialNormal.clone() : Math.abs(t0.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
  N.sub(t0.clone().multiplyScalar(N.dot(t0))).normalize();
  for (let k = 0; k < n; k++) {
    const tx = tan[3 * k];
    const ty = tan[3 * k + 1];
    const tz = tan[3 * k + 2];
    const d = N.x * tx + N.y * ty + N.z * tz;
    let nx = N.x - d * tx;
    let ny = N.y - d * ty;
    let nz = N.z - d * tz;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    N = N.set(nx, ny, nz);
    nor[3 * k] = nx;
    nor[3 * k + 1] = ny;
    nor[3 * k + 2] = nz;
    // B = T x N
    bin[3 * k] = ty * nz - tz * ny;
    bin[3 * k + 1] = tz * nx - tx * nz;
    bin[3 * k + 2] = tx * ny - ty * nx;
  }
  return {tan, nor, bin};
}

export function sampleAt(cl: Centerline, s: number) {
  const x = clamp(s / cl.ds, 0, cl.n - 1.001);
  const k = Math.floor(x);
  const t = x - k;
  const g = (arr: Float32Array) =>
    v3(lerp(arr[3 * k], arr[3 * k + 3], t), lerp(arr[3 * k + 1], arr[3 * k + 4], t), lerp(arr[3 * k + 2], arr[3 * k + 5], t));
  return {p: g(cl.pos), t: g(cl.tan).normalize(), n: g(cl.nor).normalize(), b: g(cl.bin).normalize()};
}

/** Strand positions and base-pair rungs of the double helix over [s0, s1]. */
export function doubleHelix(cl: Centerline, phaseAnchorS: number, s0: number, s1: number) {
  const k0 = Math.max(0, Math.floor(s0 / cl.ds));
  const k1 = Math.min(cl.n - 1, Math.ceil(s1 / cl.ds));
  const m = Math.max(0, k1 - k0 + 1);
  const a = new Float32Array(m * 3);
  const b = new Float32Array(m * 3);
  const pitch = G.BP_TURN * G.RISE;
  for (let i = 0; i < m; i++) {
    const k = k0 + i;
    const s = k * cl.ds;
    const th = (2 * Math.PI * (s - phaseAnchorS)) / pitch;
    const th2 = th + G.STRAND_OFFSET;
    for (let c = 0; c < 3; c++) {
      const p = cl.pos[3 * k + c];
      const nn = cl.nor[3 * k + c];
      const bb = cl.bin[3 * k + c];
      a[3 * i + c] = p + G.HELIX_R * (Math.cos(th) * nn + Math.sin(th) * bb);
      b[3 * i + c] = p + G.HELIX_R * (Math.cos(th2) * nn + Math.sin(th2) * bb);
    }
  }
  // one rung per base pair at exact multiples of the rise, phase-locked to the anchor
  const rungs: number[] = [];
  const j0 = Math.ceil((k0 * cl.ds - phaseAnchorS) / G.RISE);
  const j1 = Math.floor((k1 * cl.ds - phaseAnchorS) / G.RISE);
  for (let j = j0; j <= j1; j++) {
    const s = phaseAnchorS + j * G.RISE;
    const q = sampleAt(cl, s);
    const th = (2 * Math.PI * (s - phaseAnchorS)) / pitch;
    const th2 = th + G.STRAND_OFFSET;
    const r = G.HELIX_R * 0.92;
    rungs.push(
      q.p.x + r * (Math.cos(th) * q.n.x + Math.sin(th) * q.b.x),
      q.p.y + r * (Math.cos(th) * q.n.y + Math.sin(th) * q.b.y),
      q.p.z + r * (Math.cos(th) * q.n.z + Math.sin(th) * q.b.z),
      q.p.x + r * (Math.cos(th2) * q.n.x + Math.sin(th2) * q.b.x),
      q.p.y + r * (Math.cos(th2) * q.n.y + Math.sin(th2) * q.b.y),
      q.p.z + r * (Math.cos(th2) * q.n.z + Math.sin(th2) * q.b.z),
    );
  }
  return {a, b, m, rungs};
}
