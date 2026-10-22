import React, {useMemo} from 'react';
import {useStoryFrame} from '../lib/timeline';
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
    // Pyramidal neuron: teardrop soma, one thick apical dendrite (along -z, so neighbours line up like a
    // cortical layer) ending in a tuft, oblique branches, a skirt of basal dendrites with spines, and a long axon.
    const apical = new THREE.Vector3(0, 0.05, -1).normalize();
    parts.push(somaGeo(0.85, 1.0, 0.8, 1.0));
    parts.push(tubeGeometry([0, 0, -0.3, 0, 0.02, -0.9, 0, 0.04, -1.45], (u) => 0.72 - 0.38 * u, 16));
    nucleusR = 0.353;
    const apicalPts: THREE.Vector3[] = [];
    {
      const pts: number[] = [];
      const p = new THREE.Vector3(0, 0.04, -1.4);
      const d = apical.clone();
      for (let k = 0; k < 26; k++) {
        pts.push(p.x, p.y, p.z);
        apicalPts.push(p.clone());
        d.x += (rnd() - 0.5) * 0.08;
        d.normalize();
        p.addScaledVector(d, 5.2 / 25);
      }
      parts.push(tubeGeometry(pts, (u) => 0.34 - 0.2 * u + outlinePad, 12));
    }
    // apical tuft
    const top = apicalPts[apicalPts.length - 1];
    for (let i = 0; i < 4; i++) {
      const a = -0.9 + (i / 3) * 1.8 + (rnd() - 0.5) * 0.3;
      const d = new THREE.Vector3(Math.sin(a), 0.1 * (rnd() - 0.5), -Math.cos(a)).normalize();
      branch(rnd, parts, top, d, 1.4 + rnd() * 0.8, 0.12, 1, {children: [1, 2], lenFactor: 0.6, spread: 0.9, wiggle: 0.3, flat: 0.5, rFactor: 0.6}, outlinePad);
    }
    // oblique branches off the apical shaft
    for (const at of [8, 14, 19]) {
      const side = rnd() < 0.5 ? -1 : 1;
      const d = new THREE.Vector3(side, 0, -0.5 - rnd() * 0.3).normalize();
      branch(rnd, parts, apicalPts[at], d, 1.0 + rnd() * 0.6, 0.09, 0, {children: [0, 0], lenFactor: 0, spread: 0, wiggle: 0.3, flat: 0.2, rFactor: 0.6}, outlinePad);
    }
    // basal dendrites fan out from the base of the soma
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.18 + (0.64 * i) / 5) + (rnd() - 0.5) * 0.2;
      const d = new THREE.Vector3(Math.cos(a), (rnd() - 0.5) * 0.6, Math.sin(a)).normalize();
      branch(rnd, parts, d.clone().multiplyScalar(0.7), d, 1.8 + rnd() * 1.0, 0.16, 2, {children: [1, 2], lenFactor: 0.6, spread: 1.0, wiggle: 0.35, flat: 0.6, rFactor: 0.5}, outlinePad);
    }
    // axon from the base, with two collaterals
    {
      const pts: number[] = [];
      const p = new THREE.Vector3(0, -0.05, 0.75);
      const d = new THREE.Vector3((rnd() - 0.5) * 0.3, -0.03, 1).normalize();
      const branchPts: THREE.Vector3[] = [];
      for (let k = 0; k < 40; k++) {
        pts.push(p.x, p.y, p.z);
        branchPts.push(p.clone());
        d.x += (rnd() - 0.5) * 0.12;
        d.normalize();
        p.addScaledVector(d, 0.24);
      }
      parts.push(tubeGeometry(pts, (u) => (u < 0.06 ? 0.16 - u : 0.075) + outlinePad, 10));
      for (const at of [14, 27]) {
        const side = rnd() < 0.5 ? -1 : 1;
        branch(rnd, parts, branchPts[at], new THREE.Vector3(side, 0, 0.6).normalize(), 2.0 + rnd(), 0.05, 0, {children: [0, 0], lenFactor: 0, spread: 0, wiggle: 0.25, flat: 0.2, rFactor: 0.8}, outlinePad);
      }
    }
    // dendritic spines along the apical shaft
    if (!outlinePad) {
      for (let k = 3; k < apicalPts.length; k++) {
        for (let j = 0; j < 2; j++) {
          const a = rnd() * Math.PI * 2;
          const off = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.6, 0).multiplyScalar(0.26 - 0.15 * (k / apicalPts.length) + 0.08);
          const g = new THREE.SphereGeometry(0.065, 6, 4);
          const c = apicalPts[k].clone().add(off);
          g.translate(c.x, c.y, c.z);
          parts.push(g);
        }
      }
    }
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
const bodyMats: Record<CellType, THREE.MeshPhysicalMaterial> = {
  neuron: clay(C.blue),
  astro: clay(C.teal),
  oligo: clay(C.sand),
  micro: clay(C.coral),
};
const BODY_TINT: Record<CellType, number> = {neuron: 0.12, astro: 0.2, oligo: 0, micro: 0.18};
const NUC_LIFT: Record<CellType, number> = {neuron: 0.5, astro: 0.42, oligo: 0.36, micro: 0.2};
const offWhite = new THREE.Color(C.bg);
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
  const f = useStoryFrame();
  const cells = useMemo(getTissue, []);
  const cam = cameraAt(f);
  if (f < 380 || f > 840) return null;
  const blend = blendAmount(f);
  const fade = fadeOut(f);
  // neuron 0 contains the camera at first: fade it in as we leave it
  const leave = smoothstep(Math.log(4500), Math.log(16000), Math.log(cam.dist));
  for (const t of TYPES) {
    const base = new THREE.Color(TYPE_COLOR[t]);
    bodyMats[t].color.copy(base).lerp(offWhite, BODY_TINT[t]).lerp(grey, blend);
    nucMats[t].color.copy(base).lerp(grey, blend);
    bodyMats[t].transparent = fade < 1;
    bodyMats[t].opacity = fade;
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
