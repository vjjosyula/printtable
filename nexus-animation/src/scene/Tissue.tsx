import React, {useMemo} from 'react';
import {INTRO_END} from '../lib/timeline';
import * as THREE from 'three';
import {useCurrentFrame} from 'remotion';
import {C} from '../lib/brand';
import {sdCapsule, sdEllipsoid, sdfMesh, SDF, smin, tubeGeometry} from '../lib/geom';
import {clamp, mulberry32, ramp, smoothstep, easeInOutCubic} from '../lib/math';
import {NUCLEUS_CENTER, TISSUE_K} from './camera';
import {viewAt} from './view';
import {clay} from './materials';
import {MergeHelper} from './Chromatin';

export type CellType = 'neuron' | 'astro' | 'oligo' | 'micro';
export const TYPE_COLOR: Record<CellType, string> = {neuron: C.magenta, astro: C.tealLight, oligo: C.sand, micro: C.coral};
export const TYPES: CellType[] = ['neuron', 'astro', 'oligo', 'micro'];

type Cell = {type: CellType; pos: THREE.Vector3; rot: number; geo: THREE.BufferGeometry; accent?: THREE.BufferGeometry | null; outline?: THREE.BufferGeometry; nucleusR: number; nucleusOff: THREE.Vector3; phase: number};

/** Recursive branching process (dendrites, astrocyte and microglial processes). */
function branch(
  rnd: () => number,
  out: THREE.BufferGeometry[],
  start: THREE.Vector3,
  dir: THREE.Vector3,
  len: number,
  r0: number,
  depth: number,
  spec: {children: [number, number]; lenFactor: number; spread: number; wiggle: number; flat: number; rFactor: number},
  extra = 0,
) {
  const n = 22;
  const pts: number[] = [];
  const p = start.clone();
  const d = dir.clone();
  for (let k = 0; k < n; k++) {
    pts.push(p.x, p.y, p.z);
    d.x += (rnd() - 0.5) * spec.wiggle;
    d.y += (rnd() - 0.5) * spec.wiggle * spec.flat;
    d.z += (rnd() - 0.5) * spec.wiggle;
    d.y *= 0.95;
    d.normalize();
    p.addScaledVector(d, len / (n - 1));
  }
  const r1 = r0 * spec.rFactor;
  out.push(tubeGeometry(pts, (u) => r0 + (r1 - r0) * u + extra, 12));
  if (depth <= 0) return;
  const kids = spec.children[0] + Math.floor(rnd() * (spec.children[1] - spec.children[0] + 1));
  for (let c = 0; c < kids; c++) {
    const at = 0.45 + 0.55 * rnd();
    const idx = Math.min(n - 1, Math.floor(at * (n - 1)));
    const s = new THREE.Vector3(pts[3 * idx], pts[3 * idx + 1], pts[3 * idx + 2]);
    const nd = d
      .clone()
      .add(new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * spec.flat, rnd() - 0.5).multiplyScalar(spec.spread))
      .normalize();
    branch(rnd, out, s, nd, len * spec.lenFactor * (0.7 + 0.5 * rnd()), r1 * 0.95, depth - 1, spec, extra);
  }
}

/**
 * Irregular star-shaped soma: a lumpy ellipsoid smoothly merged with short cones towards each process,
 * so the cell body flows into its dendrites and axon instead of being a ball.
 */
function starSoma(seed: number, dirs: THREE.Vector3[], pad: number) {
  const r = mulberry32(seed * 7 + 3);
  const ph = [r() * 6, r() * 6, r() * 6];
  const base = sdEllipsoid(0, 0, 0, 0.56, 0.46, 0.56);
  const cones = dirs.map((d) => sdCapsule(0, 0, 0, d.x * 0.85, d.y * 0.85, d.z * 0.85, 0.2));
  const sdf: SDF = (x, y, z) => {
    let v = base(x, y, z);
    for (const c of cones) v = smin(v, c(x, y, z), 0.32);
    // gentle lumpiness
    v += 0.035 * Math.sin(7 * x + ph[0]) * Math.sin(6 * y + ph[1]) * Math.sin(7 * z + ph[2]);
    return v - pad;
  };
  return sdfMesh(sdf, new THREE.Vector3(0, 0, 0), 1.3, 52);
}

function makeCell(type: CellType, seed: number, outlinePad = 0): {geo: THREE.BufferGeometry; nucleusR: number; nucleusOff: THREE.Vector3; accent: THREE.BufferGeometry | null} {
  const rnd = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const somaGeo = (r: number, sx = 1, sy = 1, sz = 1) => {
    const g = new THREE.SphereGeometry(r + outlinePad, 64, 48);
    g.scale(sx, sy, sz);
    return g.toNonIndexed().index ? g : g;
  };
  let nucleusR = 0.3;
  const accents: THREE.BufferGeometry[] = [];
  const axonPts: THREE.Vector3[] = [];
  let nucleusOff = new THREE.Vector3();
  const prim = (count: number, len: [number, number], r0: number, depth: number, spec: Parameters<typeof branch>[7], somaR: number) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rnd() * 0.6;
      const d = new THREE.Vector3(Math.cos(a), (rnd() - 0.5) * 0.5, Math.sin(a)).normalize();
      branch(rnd, parts, d.clone().multiplyScalar(somaR * 0.8), d, len[0] + rnd() * (len[1] - len[0]), r0, depth, spec, outlinePad);
    }
  };
  if (type === 'neuron') {
    // Textbook neuron: an irregular star-shaped soma that flows into a handful of curving, tapering dendrites
    // (each forking once or twice), and one long axon wrapped in myelin segments with gaps (nodes of Ranvier),
    // ending in a small arbor of bulb-shaped synaptic terminals. Dendrites point to -z, the axon to +z.
    nucleusR = 0.34;
    const dirs: THREE.Vector3[] = [];
    const nd = 6;
    for (let i = 0; i < nd; i++) {
      const az = (i / nd) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
      const tilt = 0.75 + rnd() * 0.75; // angle away from -z
      dirs.push(new THREE.Vector3(Math.sin(tilt) * Math.cos(az), Math.sin(tilt) * Math.sin(az) * 0.55, -Math.cos(tilt)).normalize());
    }
    const axonDir = new THREE.Vector3((rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.1, 1).normalize();
    parts.push(starSoma(seed, [...dirs, axonDir], outlinePad));
    for (const d of dirs)
      branch(rnd, parts, d.clone().multiplyScalar(0.55), d, 1.7 + rnd() * 1.1, 0.15, 2, {children: [1, 2], lenFactor: 0.55, spread: 0.9, wiggle: 0.16, flat: 0.5, rFactor: 0.32}, outlinePad);
    // axon: gently curving, thin, sheathed in myelin
    {
      const pts: number[] = [];
      const p = axonDir.clone().multiplyScalar(0.5);
      const d = axonDir.clone();
      for (let k = 0; k < 42; k++) {
        pts.push(p.x, p.y, p.z);
        axonPts.push(p.clone());
        d.x += (rnd() - 0.5) * 0.05;
        d.y += (rnd() - 0.5) * 0.02;
        d.normalize();
        p.addScaledVector(d, 0.13);
      }
      parts.push(tubeGeometry(pts, (u) => (u < 0.08 ? 0.12 - 0.6 * u : 0.06) + outlinePad, 10));
      if (!outlinePad) {
        // myelin segments with short gaps between them
        const L = axonPts.length;
        for (let k = 6; k + 5 < L - 3; k += 6) {
          const a0 = axonPts[k];
          const a1 = axonPts[k + 5];
          const mid = a0.clone().add(a1).multiplyScalar(0.5);
          const g = new THREE.CapsuleGeometry(0.13, a0.distanceTo(a1) - 0.2, 6, 14);
          g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), a1.clone().sub(a0).normalize()));
          g.translate(mid.x, mid.y, mid.z);
          accents.push(g);
        }
      }
      // terminal arbor with bulb-shaped synaptic endings
      const end = axonPts[axonPts.length - 1];
      for (let i = 0; i < 3; i++) {
        const td = d.clone().add(new THREE.Vector3((i - 1) * 0.8, (rnd() - 0.5) * 0.4, 0)).normalize();
        const tip = end.clone().addScaledVector(td, 0.55);
        const mid = end.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0, 0.05));
        parts.push(tubeGeometry([end.x, end.y, end.z, mid.x, mid.y, mid.z, tip.x, tip.y, tip.z], (u) => 0.045 - 0.02 * u + outlinePad, 8));
        const bulb = new THREE.SphereGeometry(0.085 + outlinePad, 14, 10);
        bulb.scale(1, 1, 1.3);
        bulb.translate(tip.x, tip.y, tip.z);
        parts.push(bulb);
      }
    }
  } else if (type === 'astro') {
    parts.push(somaGeo(0.6));
    nucleusR = 0.3;
    prim(8, [1.3, 2.0], 0.17, 2, {children: [2, 3], lenFactor: 0.55, spread: 1.2, wiggle: 0.3, flat: 0.9, rFactor: 0.5}, 0.6);
  } else if (type === 'oligo') {
    parts.push(somaGeo(0.5));
    nucleusR = 0.3;
    prim(4, [1.0, 1.6], 0.07, 0, {children: [0, 0], lenFactor: 0, spread: 0, wiggle: 0.3, flat: 0.5, rFactor: 0.8}, 0.5);
  } else {
    parts.push(somaGeo(0.36, 1.25, 0.8, 0.9));
    nucleusR = 0.22;
    nucleusOff = new THREE.Vector3(0.04, 0, 0);
    prim(6, [1.0, 1.6], 0.08, 2, {children: [2, 3], lenFactor: 0.6, spread: 1.4, wiggle: 0.4, flat: 0.9, rFactor: 0.6}, 0.36);
  }
  const normalized = parts.map((g) => {
    const ng = g.index ? g : g;
    if (!ng.getAttribute('normal')) ng.computeVertexNormals();
    // MergeHelper expects indexed geometry with position+normal only
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', ng.getAttribute('position'));
    clean.setAttribute('normal', ng.getAttribute('normal'));
    clean.setIndex(ng.index ?? null);
    return clean;
  });
  const geo = MergeHelper(normalized);
  parts.forEach((g) => g.dispose());
  const accent = accents.length ? MergeHelper(accents.map((g) => {
    const c = new THREE.BufferGeometry();
    c.setAttribute('position', g.getAttribute('position'));
    c.setAttribute('normal', g.getAttribute('normal'));
    c.setIndex(g.index);
    return c;
  })) : null;
  return {geo, nucleusR, nucleusOff, accent};
}

function buildTissue(): Cell[] {
  const rnd = mulberry32(2024);
  const cells: Cell[] = [];
  const counts: [CellType, number][] = [
    ['neuron', 6],
    ['astro', 6],
    ['oligo', 6],
    ['micro', 4],
  ];
  const placed: THREE.Vector3[] = [new THREE.Vector3(0, 0, 0)];
  const neuron0 = makeCell('neuron', 1);
  cells.push({type: 'neuron', pos: new THREE.Vector3(0, 0, 0), rot: 0, ...neuron0, phase: 0});
  let seed = 10;
  for (const [type, count] of counts) {
    const n = type === 'neuron' ? count - 1 : count;
    for (let i = 0; i < n; i++) {
      let p = new THREE.Vector3();
      let tries = 0;
      const minD = type === 'neuron' ? 3.4 : 2.4;
      do {
        const a = rnd() * Math.PI * 2;
        const r = 2.5 + Math.sqrt(rnd()) * 11.5;
        p = new THREE.Vector3(Math.cos(a) * r, (rnd() - 0.5) * 3.0, Math.sin(a) * r * 0.85);
        tries++;
      } while (tries < 200 && placed.some((q) => q.distanceTo(p) < minD));
      placed.push(p);
      const c = makeCell(type, seed++);
      const outline = type === 'oligo' ? makeCell(type, seed - 1, 0.05).geo : undefined;
      const rr = rnd();
      cells.push({type, pos: p, rot: type === 'neuron' ? (rr - 0.5) * 0.5 : rr * Math.PI * 2, ...c, outline, phase: rnd() * Math.PI * 2});
    }
  }
  return cells;
}

let tissue: Cell[] | null = null;
export const getTissue = () => (tissue ??= buildTissue());

/** Representative cell of each type (where its signal track rises from). */
export function repCell(type: CellType) {
  const cells = getTissue();
  const pick: Record<CellType, number> = {neuron: 0, astro: 0, oligo: 0, micro: 0};
  const same = cells.filter((c) => c.type === type && c.pos.length() > 0.1);
  // choose the one closest to a fixed spot on the front side for each type
  const spots: Record<CellType, THREE.Vector3> = {
    neuron: new THREE.Vector3(-3.5, 0, 0.5),
    astro: new THREE.Vector3(2.5, 0, 1.5),
    oligo: new THREE.Vector3(-1, 0, -2.5),
    micro: new THREE.Vector3(3.5, 0, -2),
  };
  void pick;
  return same.reduce((best, c) => (c.pos.distanceTo(spots[type]) < best.pos.distanceTo(spots[type]) ? c : best), same[0]);
}

// Solid (opaque) cells so they shade and cast ambient occlusion like real 3D objects.
// Bodies are a lighter tint of the type colour; the nucleus bulges out in the full colour.
/** Light denim blue for neurons (a lighter, cleaner relative of the brand blue). */
const NEURON_BLUE = C.magenta;
const bodyMats: Record<CellType, THREE.MeshPhysicalMaterial> = {
  neuron: clay(NEURON_BLUE, {roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.4}),
  astro: clay(C.teal),
  oligo: clay(C.sand),
  micro: clay(C.coral),
};
const accentMat = clay('#D8CB98', {roughness: 0.35, clearcoat: 0.4});
const BODY_TINT: Record<CellType, number> = {neuron: 0, astro: 0.2, oligo: 0, micro: 0.18};
const NUC_LIFT: Record<CellType, number> = {neuron: 0, astro: 0.42, oligo: 0.36, micro: 0.2};
const offWhite = new THREE.Color(C.bg);
const nucMats: Record<CellType, THREE.MeshPhysicalMaterial> = {
  neuron: clay('#2F5F98'),
  astro: clay(C.teal),
  oligo: clay(C.sand),
  micro: clay(C.coral),
};
const outlineMat = new THREE.MeshBasicMaterial({color: C.charcoal, side: THREE.BackSide, transparent: true});
const nucOutlineMat = new THREE.MeshBasicMaterial({color: C.charcoal, side: THREE.BackSide, transparent: true});
const sphere = new THREE.SphereGeometry(1, 32, 24);
// cells merge towards a soft light blue (the grey is kept for the averaged signal track only)
const grey = new THREE.Color('#9AA6B4');

/** Dilution beat (video seconds): the cell types swirl together, then separate again for the dive. */
export const blendAmount = (t: number) => ramp(t, 10.2, 12.4, easeInOutCubic) * (1 - ramp(t, 13.2, 14.8, easeInOutCubic));

export const Tissue: React.FC = () => {
  const vf = useCurrentFrame();
  const vt = vf / 30;
  const f = 560 + vt * 30; // gentle idle motion (pulse) on video time
  const cells = useMemo(getTissue, []);
  const cam = viewAt(vf);
  if (vt > INTRO_END || cam.dist < 3000) return null;
  const blend = blendAmount(vt);
  // the cells fade out as the camera dives in past them (no giant processes in front of the lens)
  const fade = smoothstep(Math.log(5000), Math.log(13000), Math.log(cam.dist));
  // neuron 0 contains the camera at first: fade it in as we leave it
  const leave = smoothstep(Math.log(9000), Math.log(22000), Math.log(cam.dist));
  for (const t of TYPES) {
    const base = new THREE.Color(TYPE_COLOR[t]);
    bodyMats[t].color.set(t === 'neuron' ? NEURON_BLUE : TYPE_COLOR[t]).lerp(offWhite, BODY_TINT[t]).lerp(grey, blend);
    nucMats[t].color.copy(base).lerp(grey, blend);
    bodyMats[t].transparent = fade < 1;
    bodyMats[t].opacity = fade;
    nucMats[t].transparent = fade < 1;
    nucMats[t].opacity = fade;
  }
  outlineMat.opacity = fade * (1 - blend * 0.6);
  accentMat.transparent = fade < 1;
  accentMat.opacity = fade;
  accentMat.color.set('#D8CB98').lerp(grey, blend);
  nucOutlineMat.opacity = fade * (1 - blend * 0.6);
  const swirlT = vt - 10.2;
  return (
    <group position={NUCLEUS_CENTER} scale={TISSUE_K}>
      {cells.map((c, i) => {
        const r = Math.hypot(c.pos.x, c.pos.z);
        // differential rotation: inner cells turn faster, everything is drawn in
        const ang = blend * (2.4 / (0.6 + r / 5)) + (swirlT > 0 ? swirlT * 0.02 : 0) * blend;
        const pull = 1 - 0.32 * blend;
        const x = (c.pos.x * Math.cos(ang) - c.pos.z * Math.sin(ang)) * pull;
        const z = (c.pos.x * Math.sin(ang) + c.pos.z * Math.cos(ang)) * pull;
        const y = c.pos.y * (1 - blend * 0.5);
        const pulse = 1 + 0.07 * Math.sin(f * 0.15 + c.phase) * (1 - blend);
        const isHero = i === 0;
        const bodyOpacityScale = isHero ? leave : 1;
        return (
          <group key={i} position={[x, y, z]} rotation={[0, c.rot + ang * 0.6, 0]} scale={1 - 0.15 * blend}>
            {bodyOpacityScale > 0.01 ? (
              <mesh geometry={c.geo} material={isHero ? heroMat(bodyMats[c.type], leave) : bodyMats[c.type]} renderOrder={2} />
            ) : null}
            {c.outline ? <mesh geometry={c.outline} material={outlineMat} renderOrder={1} /> : null}
            {c.accent ? <mesh geometry={c.accent} material={accentMat} /> : null}
            {isHero && leave < 0.97 ? null : (
              <>
                <mesh geometry={sphere} material={nucMats[c.type]} position={[c.nucleusOff.x, c.nucleusOff.y + NUC_LIFT[c.type], c.nucleusOff.z]} scale={[c.nucleusR * pulse, c.nucleusR * pulse * 0.9, c.nucleusR * pulse * 1.1]} />
                {c.type === 'oligo' ? (
                  <mesh geometry={sphere} material={nucOutlineMat} position={[c.nucleusOff.x, c.nucleusOff.y + NUC_LIFT[c.type], c.nucleusOff.z]} scale={[(c.nucleusR + 0.04) * pulse, (c.nucleusR + 0.04) * pulse * 0.9, (c.nucleusR + 0.04) * pulse * 1.1]} />
                ) : null}
              </>
            )}
          </group>
        );
      })}
    </group>
  );
};

const heroCache = new Map<THREE.Material, THREE.MeshPhysicalMaterial>();
function heroMat(m: THREE.MeshPhysicalMaterial, k: number) {
  if (!heroCache.has(m)) heroCache.set(m, m.clone());
  const h = heroCache.get(m)!;
  h.color.copy(m.color);
  h.transparent = k < 0.999 || m.transparent;
  h.opacity = m.opacity * clamp(k);
  h.depthWrite = k > 0.9;
  return h;
}
