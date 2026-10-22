import React, {useMemo} from 'react';
import * as THREE from 'three';
import {useCurrentFrame} from 'remotion';
import {C} from '../lib/brand';
import {tubeGeometry} from '../lib/geom';
import {clamp, mulberry32, ramp, smoothstep, easeInOutCubic} from '../lib/math';
import {cameraAt, NUCLEUS_CENTER, TISSUE_K} from './camera';
import {clay} from './materials';
import {MergeHelper} from './Chromatin';

export type CellType = 'neuron' | 'astro' | 'oligo' | 'micro';
export const TYPE_COLOR: Record<CellType, string> = {neuron: C.blue, astro: C.teal, oligo: C.sand, micro: C.coral};
export const TYPES: CellType[] = ['neuron', 'astro', 'oligo', 'micro'];

type Cell = {type: CellType; pos: THREE.Vector3; rot: number; geo: THREE.BufferGeometry; outline?: THREE.BufferGeometry; nucleusR: number; nucleusOff: THREE.Vector3; phase: number};

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
    d.y *= 0.85;
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

function makeCell(type: CellType, seed: number, outlinePad = 0): {geo: THREE.BufferGeometry; nucleusR: number; nucleusOff: THREE.Vector3} {
  const rnd = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const somaGeo = (r: number, sx = 1, sy = 1, sz = 1) => {
    const g = new THREE.SphereGeometry(r + outlinePad, 64, 48);
    g.scale(sx, sy, sz);
    return g.toNonIndexed().index ? g : g;
  };
  let nucleusR = 0.3;
  let nucleusOff = new THREE.Vector3();
  const prim = (count: number, len: [number, number], r0: number, depth: number, spec: Parameters<typeof branch>[7], somaR: number) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rnd() * 0.6;
      const d = new THREE.Vector3(Math.cos(a), (rnd() - 0.5) * 0.5, Math.sin(a)).normalize();
      branch(rnd, parts, d.clone().multiplyScalar(somaR * 0.8), d, len[0] + rnd() * (len[1] - len[0]), r0, depth, spec, outlinePad);
    }
  };
  if (type === 'neuron') {
    parts.push(somaGeo(1.0, 1.0, 0.85, 1.25));
    nucleusR = 0.353;
    prim(5, [2.2, 3.4], 0.26, 2, {children: [2, 3], lenFactor: 0.6, spread: 1.1, wiggle: 0.35, flat: 0.4, rFactor: 0.55}, 1.0);
    // axon
    const a = rnd() * Math.PI * 2;
    branch(rnd, parts, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.9), new THREE.Vector3(Math.cos(a), -0.05, Math.sin(a)), 8 + rnd() * 3, 0.1, 0, {children: [0, 0], lenFactor: 0, spread: 0, wiggle: 0.12, flat: 0.3, rFactor: 0.7}, outlinePad);
  } else if (type === 'astro') {
    parts.push(somaGeo(0.6));
    nucleusR = 0.3;
    prim(11, [1.2, 2.0], 0.16, 2, {children: [2, 4], lenFactor: 0.55, spread: 1.4, wiggle: 0.6, flat: 0.8, rFactor: 0.5}, 0.6);
  } else if (type === 'oligo') {
    parts.push(somaGeo(0.5));
    nucleusR = 0.3;
    prim(4, [1.0, 1.6], 0.07, 0, {children: [0, 0], lenFactor: 0, spread: 0, wiggle: 0.3, flat: 0.5, rFactor: 0.8}, 0.5);
  } else {
    parts.push(somaGeo(0.36, 1.25, 0.8, 0.9));
    nucleusR = 0.22;
    nucleusOff = new THREE.Vector3(0.04, 0, 0);
    prim(7, [0.9, 1.5], 0.07, 3, {children: [2, 3], lenFactor: 0.6, spread: 1.6, wiggle: 0.7, flat: 0.8, rFactor: 0.6}, 0.36);
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
  return {geo, nucleusR, nucleusOff};
}

function buildTissue(): Cell[] {
  const rnd = mulberry32(2024);
  const cells: Cell[] = [];
  const counts: [CellType, number][] = [
    ['neuron', 9],
    ['astro', 11],
    ['oligo', 12],
    ['micro', 6],
  ];
  const placed: THREE.Vector3[] = [new THREE.Vector3(0, 0, 0)];
  const neuron0 = makeCell('neuron', 1);
  cells.push({type: 'neuron', pos: new THREE.Vector3(0, 0, 0), rot: 0.4, ...neuron0, phase: 0});
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
        p = new THREE.Vector3(Math.cos(a) * r, (rnd() - 0.5) * 1.6, Math.sin(a) * r * 0.85);
        tries++;
      } while (tries < 200 && placed.some((q) => q.distanceTo(p) < minD));
      placed.push(p);
      const c = makeCell(type, seed++);
      const outline = type === 'oligo' ? makeCell(type, seed - 1, 0.05).geo : undefined;
      cells.push({type, pos: p, rot: rnd() * Math.PI * 2, ...c, outline, phase: rnd() * Math.PI * 2});
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
    neuron: new THREE.Vector3(-5, 0, 2),
    astro: new THREE.Vector3(-1.5, 0, 4),
    oligo: new THREE.Vector3(2, 0, 3),
    micro: new THREE.Vector3(5, 0, 2),
  };
  void pick;
  return same.reduce((best, c) => (c.pos.distanceTo(spots[type]) < best.pos.distanceTo(spots[type]) ? c : best), same[0]);
}

const bodyMats: Record<CellType, THREE.MeshPhysicalMaterial> = {
  neuron: clay(C.blue, {transparent: true, opacity: 0.55}),
  astro: clay(C.teal, {transparent: true, opacity: 0.55}),
  oligo: clay(C.sand, {transparent: true, opacity: 0.85}),
  micro: clay(C.coral, {transparent: true, opacity: 0.6}),
};
const nucMats: Record<CellType, THREE.MeshPhysicalMaterial> = {
  neuron: clay(C.blue),
  astro: clay(C.teal),
  oligo: clay(C.sand),
  micro: clay(C.coral),
};
const outlineMat = new THREE.MeshBasicMaterial({color: C.charcoal, side: THREE.BackSide, transparent: true});
const nucOutlineMat = new THREE.MeshBasicMaterial({color: C.charcoal, side: THREE.BackSide, transparent: true});
const sphere = new THREE.SphereGeometry(1, 32, 24);
const grey = new THREE.Color(C.grey);

/** Swirl / blend amount (scene 4) and fade-out (scene 5). */
export const blendAmount = (f: number) => ramp(f, 640, 712, easeInOutCubic);
const fadeOut = (f: number) => 1 - ramp(f, 752, 830, easeInOutCubic);

export const Tissue: React.FC = () => {
  const f = useCurrentFrame();
  const cells = useMemo(getTissue, []);
  const cam = cameraAt(f);
  if (f < 380 || f > 840) return null;
  const blend = blendAmount(f);
  const fade = fadeOut(f);
  // neuron 0 contains the camera at first: fade it in as we leave it
  const leave = smoothstep(Math.log(4500), Math.log(16000), Math.log(cam.dist));
  for (const t of TYPES) {
    const base = new THREE.Color(TYPE_COLOR[t]);
    bodyMats[t].color.copy(base).lerp(grey, blend);
    nucMats[t].color.copy(base).lerp(grey, blend);
    bodyMats[t].opacity = (t === 'oligo' ? 0.85 : 0.55) * fade;
    nucMats[t].transparent = fade < 1;
    nucMats[t].opacity = fade;
  }
  outlineMat.opacity = fade * (1 - blend * 0.6);
  nucOutlineMat.opacity = fade * (1 - blend * 0.6);
  const swirlT = (f - 640) / 30;
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
            {isHero ? null : (
              <>
                <mesh geometry={sphere} material={nucMats[c.type]} position={c.nucleusOff} scale={[c.nucleusR * pulse, c.nucleusR * pulse * 0.9, c.nucleusR * pulse * 1.1]} />
                {c.type === 'oligo' ? (
                  <mesh geometry={sphere} material={nucOutlineMat} position={c.nucleusOff} scale={[(c.nucleusR + 0.04) * pulse, (c.nucleusR + 0.04) * pulse * 0.9, (c.nucleusR + 0.04) * pulse * 1.1]} />
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
  h.opacity = m.opacity * clamp(k);
  h.depthWrite = k > 0.9;
  return h;
}
