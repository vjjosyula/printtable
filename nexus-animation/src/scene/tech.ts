import * as THREE from 'three';
import {buildCenterline, Centerline, G, MarkType, Nuc, nucFrame, sampleAt, Tail} from '../lib/chromatin';
import {mulberry32, ramp} from '../lib/math';
import {TECH_WORLD} from './camera';
import {tailPoints} from './tails';

/** Finale timing (story frames). */
export const TECH = {
  appear: [872, 925] as [number, number],
  methyl: [990, 1110] as [number, number], // MeTLAND: methylated CpGs appear along the DNA
  scan: [975, 1125] as [number, number],
  histone: [1150, 1250] as [number, number], // Histland: histone marks appear on the tails
  freeze: 1590, // last two seconds hold perfectly still
};

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PSI = [0.5, 2.7, 4.7];

// histone marks shown in the Histland beat: [nucleosome, tail, type, story frame]
const MARKS: [number, number, MarkType, number][] = [
  [0, 0, 'ac', 1150],
  [1, 0, 'ac', 1172],
  [1, 2, 'ac', 1190],
  [2, 0, 'me3', 1210],
  [2, 1, 'me3', 1228],
];

function tails(i: number, f: number): Tail[] {
  const base: Tail[] = [
    {anchor: v3(4.0 * Math.cos(-0.95), -4.0 * Math.sin(-0.95), 0.9), dir: v3(Math.cos(-0.95), -Math.sin(-0.95), 0.25), len: 7, phase: i * 1.3, mark: null, markScale: 0},
    {anchor: v3(4.0 * Math.cos(0.95), -4.0 * Math.sin(0.95), -0.9), dir: v3(Math.cos(0.95), -Math.sin(0.95), -0.25), len: 6.4, phase: i * 0.7 + 2, mark: null, markScale: 0},
    {anchor: v3(-1.6, 1.2, 2.6), dir: v3(-0.45, 0.25, 1), len: 5.6, phase: i * 2.1 + 4, mark: null, markScale: 0},
  ];
  for (const [n, t, type, at] of MARKS) {
    if (n !== i) continue;
    base[t].mark = type;
    base[t].markScale = ramp(f, at, at + 12, (x) => x);
  }
  return base;
}

export type TechState = {
  f: number;
  origin: THREE.Vector3;
  nucs: Nuc[];
  cl: Centerline;
  anchorS: number;
  methyl: {base: THREE.Vector3; tip: THREE.Vector3; scale: number}[];
  scanS: number | null;
  appear: number;
};

const cache = new Map<number, TechState>();
export function techAt(fIn: number): TechState {
  const f = Math.min(fIn, TECH.freeze);
  if (cache.has(f)) return cache.get(f)!;
  const origin = TECH_WORLD();
  const nucs: Nuc[] = [];
  for (let i = 0; i < 3; i++) {
    const x = -27 + 27 * i;
    const P = v3(x, 1.8 * Math.sin(i * 1.7), 2.0 * Math.cos(i * 1.3) - 1);
    const u = v3(1, 0.04 * Math.cos(i), -0.05 * Math.sin(i)).normalize();
    const D = v3(0, 1, 0).sub(u.clone().multiplyScalar(u.y)).normalize().applyAxisAngle(u, PSI[i]);
    const n = {id: 200 + i, P, u, D, wrap: 1, coreOffset: v3(), coreSpin: 0, coreVisible: 1, tails: tails(i, f), coil: false} as Nuc;
    nucFrame(n);
    nucs.push(n);
  }
  const cl = buildCenterline(nucs, 30, 30);
  const anchorS = cl.dyadS.get(201)!;

  // methylated CpGs on strand A, revealed in sequence along the DNA (reading direction)
  const rnd = mulberry32(31);
  const pitch = G.BP_TURN * G.RISE;
  const methyl: TechState['methyl'] = [];
  const count = 22;
  for (let k = 0; k < count; k++) {
    const s = 8 + ((cl.length - 16) * (k + 0.2 + 0.6 * rnd())) / count;
    const q = sampleAt(cl, s);
    const th = (2 * Math.PI * (s - anchorS)) / pitch;
    const dir = q.n.clone().multiplyScalar(Math.cos(th)).addScaledVector(q.b, Math.sin(th)).normalize();
    const base = q.p.clone().addScaledVector(dir, G.HELIX_R + G.BB_R * 0.6);
    const tip = base.clone().addScaledVector(dir, 1.6);
    const at = TECH.methyl[0] + ((TECH.methyl[1] - TECH.methyl[0]) * s) / cl.length;
    methyl.push({base, tip, scale: ramp(f, at, at + 10, (x) => x)});
  }
  const scanT = ramp(f, TECH.scan[0], TECH.scan[1], (x) => x);
  const scanS = f > TECH.scan[0] && f < TECH.scan[1] + 6 ? scanT * cl.length : null;
  const st: TechState = {f, origin, nucs, cl, anchorS, methyl, scanS, appear: ramp(f, TECH.appear[0], TECH.appear[1], (x) => x)};
  cache.set(f, st);
  if (cache.size > 6) cache.delete(cache.keys().next().value!);
  return st;
}

/** World positions used by the overlay tags. */
export function techAnchors(sf: number) {
  const s = techAt(sf);
  const toW = (p: THREE.Vector3) => p.clone().add(s.origin);
  // MeTLAND tag: a lollipop near the middle linker; Histland tag: the H3K27ac mark on the middle nucleosome
  const m = s.methyl[Math.floor(s.methyl.length * 0.62)];
  const n1 = s.nucs[1];
  const pts = tailPoints(n1, n1.tails[0], s.f);
  const k = pts.length / 3 - 1;
  return {
    methyl: toW(m.tip),
    mark: toW(new THREE.Vector3(pts[3 * k], pts[3 * k + 1], pts[3 * k + 2])),
  };
}
