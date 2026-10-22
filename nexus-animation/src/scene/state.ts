import * as THREE from 'three';
import {buildCenterline, Centerline, chromatinState, G, Nuc, sampleAt, T, WRAP_ARC} from '../lib/chromatin';
import {clamp, easeInOutCubic, easeOutCubic, lerp, ramp, smoothstep} from '../lib/math';
import {tailTip} from './tails';

export type World = {
  f: number;
  nucs: Nuc[];
  cl: Centerline;
  anchorS: number;
  writer: {pos: THREE.Vector3; quat: THREE.Quaternion; visible: number};
  pol1: PolState;
  pol2: PolState;
  rna: Float32Array | null;
};
export type PolState = {pos: THREE.Vector3; quat: THREE.Quaternion; clampOpen: number; visible: number};

const byId = (nucs: Nuc[], id: number) => nucs.find((n) => n.id === id)!;

let ref180: {d0: number; mid: number} | null = null;
function reference() {
  if (!ref180) {
    const nucs = chromatinState(180);
    const cl = buildCenterline(nucs);
    ref180 = {d0: cl.dyadS.get(0)!, mid: (cl.dyadS.get(4)! + cl.dyadS.get(5)!) / 2};
  }
  return ref180;
}

const quatFromBasis = (x: THREE.Vector3, y: THREE.Vector3) => {
  const xx = x.clone().normalize();
  const yy = y.clone().sub(xx.clone().multiplyScalar(y.dot(xx))).normalize();
  const zz = new THREE.Vector3().crossVectors(xx, yy);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, yy, zz));
};

/** Arc length on the DNA just downstream of nucleosome 4 (the promoter). */
const promoterS = (cl: Centerline) => cl.dyadS.get(4)! + WRAP_ARC / 2 + 13;

const cache = new Map<number, World>();
export function worldAt(f: number): World {
  if (cache.has(f)) return cache.get(f)!;
  const nucs = chromatinState(f);
  const cl = buildCenterline(nucs);
  let anchorS = cl.dyadS.get(0)!;
  if (f >= 180) {
    const r = reference();
    anchorS = (cl.dyadS.get(4)! + cl.dyadS.get(5)!) / 2 - (r.mid - r.d0);
  }

  /* ---------- writer enzyme ---------- */
  const n4 = byId(nucs, 4);
  const n5 = byId(nucs, 5);
  const dock = (n: Nuc) => {
    const {tip, dir} = tailTip(n, n.tails[0], f);
    return {pos: tip.clone().addScaledVector(dir, 4.6), dir};
  };
  const d4 = dock(n4);
  const d5 = dock(n5);
  const start = d4.pos.clone().add(new THREE.Vector3(-26, 22, 18));
  const away = d5.pos.clone().add(new THREE.Vector3(18, 26, 22));
  let wpos: THREE.Vector3;
  let wdir: THREE.Vector3;
  const [a0, a1] = T.writerArrive;
  const [h0, h1] = T.writerHop;
  const [l0, l1] = T.writerLeave;
  if (f < a1) {
    const t = ramp(f, a0, a1, easeOutCubic);
    // arc in on a curve rather than a straight line
    const mid = start.clone().lerp(d4.pos, 0.5).add(new THREE.Vector3(0, 6, 4));
    wpos = new THREE.Vector3().copy(start).multiplyScalar((1 - t) * (1 - t)).addScaledVector(mid, 2 * t * (1 - t)).addScaledVector(d4.pos, t * t);
    wdir = d4.dir;
  } else if (f < h0) {
    wpos = d4.pos;
    wdir = d4.dir;
  } else if (f < h1) {
    const t = ramp(f, h0, h1, easeInOutCubic);
    const lift = Math.sin(t * Math.PI) * 6;
    wpos = d4.pos.clone().lerp(d5.pos, t).add(new THREE.Vector3(0, lift, lift * 0.5));
    wdir = d4.dir.clone().lerp(d5.dir, t).normalize();
  } else if (f < l0) {
    wpos = d5.pos;
    wdir = d5.dir;
  } else {
    const t = ramp(f, l0, l1, (x) => x * x);
    wpos = d5.pos.clone().lerp(away, t);
    wdir = d5.dir;
  }
  // docking pocket (-y) faces the tail
  const wq = quatFromBasis(new THREE.Vector3(1, 0.2, 0.1).normalize(), wdir.clone());
  const wobble = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(f * 0.05) * 0.1, f * 0.004, Math.cos(f * 0.04) * 0.08));
  wq.multiply(wobble);
  const writer = {pos: wpos, quat: wq, visible: smoothstep(a0 - 2, a0 + 8, f) * (1 - smoothstep(l1 - 10, l1, f))};

  /* ---------- polymerase 1: reads the open promoter ---------- */
  const sP = promoterS(cl);
  const travel = 20 * ramp(f, T.pol1Move[0], T.pol1Move[1], (x) => x * (2 - x));
  const onDNA = sampleAt(cl, sP + travel);
  // cleft (local -y) faces the viewer so the DNA is seen lying in it
  const worldUp = new THREE.Vector3(0.0, 0.25, -1).normalize();
  const upLocal = worldUp.clone().sub(onDNA.t.clone().multiplyScalar(worldUp.dot(onDNA.t))).normalize();
  const pq = quatFromBasis(onDNA.t, upLocal);
  const arrive = ramp(f, T.pol1Arrive[0], T.pol1Arrive[1], easeOutCubic);
  const p1pos = onDNA.p.clone().addScaledVector(upLocal, 34 * (1 - arrive)).add(new THREE.Vector3(-6, 0, -14).multiplyScalar(1 - arrive));
  const pol1: PolState = {
    pos: p1pos,
    quat: pq,
    clampOpen: 1 - 0.55 * ramp(f, T.pol1Clamp[0], T.pol1Clamp[1], easeInOutCubic),
    visible: smoothstep(T.pol1Arrive[0] - 6, T.pol1Arrive[0] + 6, f),
  };

  /* ---------- nascent RNA ---------- */
  let rna: Float32Array | null = null;
  const made = Math.max(0, travel - 0.8) * 3.4;
  if (made > 0.3) {
    const exitW = new THREE.Vector3(-7.5, -5.5, 6.5).applyQuaternion(pq).add(p1pos);
    const back = onDNA.t.clone().negate();
    const side = new THREE.Vector3().crossVectors(onDNA.t, upLocal);
    const count = Math.max(4, Math.ceil(made / 0.4));
    rna = new Float32Array(count * 3);
    const p = new THREE.Vector3();
    for (let k = 0; k < count; k++) {
      const u = (k / (count - 1)) * made; // distance from the exit along the transcript
      const wob = Math.min(1, u / 6);
      p.copy(exitW)
        .addScaledVector(back, u * 0.35)
        .addScaledVector(side, u * 0.75 + Math.sin(u * 0.45 + f * 0.04) * 1.2 * wob)
        .addScaledVector(upLocal, -(u * 0.38 + Math.cos(u * 0.38 + f * 0.05) * 1.2 * wob));
      rna[3 * k] = p.x;
      rna[3 * k + 1] = p.y;
      rna[3 * k + 2] = p.z;
    }
  }

  /* ---------- polymerase 2: blocked by compact chromatin ---------- */
  const coilContact = new THREE.Vector3(206, 6, 27.5);
  const p2start = coilContact.clone().add(new THREE.Vector3(-34, 14, 30));
  const tA = ramp(f, T.pol2Arrive[0], T.pol2Arrive[1], (x) => x * x * (2 - x));
  let p2pos = p2start.clone().lerp(coilContact, tA);
  if (f > T.pol2Bump) {
    const dt = (f - T.pol2Bump) / 30;
    const recoil = (1 - Math.exp(-dt * 4)) * 5 + Math.sin(dt * 14) * Math.exp(-dt * 5) * 1.2;
    p2pos = coilContact.clone().add(new THREE.Vector3(-0.5, 0.35, 1).normalize().multiplyScalar(recoil + dt * 1.5));
  }
  const p2q = quatFromBasis(new THREE.Vector3(1, -0.15, 0.25), new THREE.Vector3(0.1, 0.5, 1));
  p2q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, f > T.pol2Bump ? Math.sin((f - T.pol2Bump) * 0.3) * 0.05 * Math.exp(-(f - T.pol2Bump) / 20) : 0)));
  const pol2: PolState = {pos: p2pos, quat: p2q, clampOpen: 1, visible: smoothstep(T.pol2Arrive[0] - 4, T.pol2Arrive[0] + 8, f)};

  const w: World = {f, nucs, cl, anchorS, writer, pol1, pol2, rna};
  cache.set(f, w);
  if (cache.size > 6) cache.delete(cache.keys().next().value!);
  void lerp;
  void G;
  return w;
}
