import React, {useMemo} from 'react';
import * as THREE from 'three';
import {useCurrentFrame} from 'remotion';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {buildCenterline, Centerline, doubleHelix, G, MarkType, Nuc, nucFrame, sampleAt, Tail, transportFrames} from '../lib/chromatin';
import {sdCapsule, sdfMesh, smin, SDF, tubeGeometry} from '../lib/geom';
import {histoneCoreGeometry} from '../lib/proteins';
import {clamp, easeInOutCubic, easeOutBack, easeOutCubic, mulberry32, ramp} from '../lib/math';
import {FPS} from '../lib/timeline';
import {C} from '../lib/brand';
import {clay, M} from './materials';
import {tailPoints} from './tails';
import {gapOrigin, GAP_T0} from './view';

/**
 * The gap beats, the kit hand-off and the two kit cards, staged along +x inside one neuron nucleus.
 * Everything here runs on video seconds.
 */
export const GAP = {
  vignette: 0, // three nucleosomes: methylation beat + "one mark at a time"
  tubes: 70, // two separate experiments
  harsh: 150, // harsh chemistry
  reads: 198, // tall stack of sequencing reads
  labs: 360, // one lab bench, many labs around it
  histland: 560,
  metland: 706,
};

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const win = (t: number, a: number, b: number) => t >= a && t <= b;
const rt = (t: number, a: number, b: number, e: (x: number) => number = easeInOutCubic) => ramp(t, a, b, e);

/* ---------------------------------------------------------------- shared geometry */
const rungGeo = new THREE.CylinderGeometry(G.RUNG_R, G.RUNG_R, 1, 6, 1, false);
const markGeo = new THREE.SphereGeometry(0.85, 24, 16);
const lollyGeo = new THREE.SphereGeometry(0.62, 18, 12);
const stalkGeo = new THREE.CylinderGeometry(0.14, 0.14, 1, 6);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const methylMat = clay(C.tealLight, {roughness: 0.4, emissive: new THREE.Color(C.tealLight), emissiveIntensity: 0.15});
const readerMat = clay(C.markBlue, {roughness: 0.38, clearcoat: 0.5});
const me3Fade = M.me3.clone();
const readerCoralMat = clay(C.coral, {roughness: 0.38, clearcoat: 0.5});

function useDisposable<T extends {dispose: () => void}>(make: () => T, deps: unknown[]): T {
  return useMemo(make, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Centreline along a polyline (resampled), for straight or gently bent DNA. */
function lineCenterline(pts: THREE.Vector3[], ds = 0.25): Centerline {
  const curve = new THREE.CatmullRomCurve3(pts);
  const len = curve.getLength();
  const n = Math.max(2, Math.ceil(len / ds) + 1);
  const pos = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const p = curve.getPointAt(k / (n - 1));
    pos.set([p.x, p.y, p.z], 3 * k);
  }
  const {tan, nor, bin} = transportFrames(pos, n, v3(0, 1, 0));
  return {n, pos, tan, nor, bin, ds: len / (n - 1), dyadS: new Map(), length: len};
}

type Lolly = {base: THREE.Vector3; tip: THREE.Vector3; s: number};
/** Methyl groups on strand A at roughly CpG spacing (deterministic). */
function lollipops(cl: Centerline, anchorS: number, count: number, seed: number, margin = 3): Lolly[] {
  const rnd = mulberry32(seed);
  const pitch = G.BP_TURN * G.RISE;
  const out: Lolly[] = [];
  for (let k = 0; k < count; k++) {
    const s = margin + ((cl.length - 2 * margin) * (k + 0.2 + 0.6 * rnd())) / count;
    const q = sampleAt(cl, s);
    const th = (2 * Math.PI * (s - anchorS)) / pitch;
    const dir = q.n.clone().multiplyScalar(Math.cos(th)).addScaledVector(q.b, Math.sin(th)).normalize();
    const base = q.p.clone().addScaledVector(dir, G.HELIX_R + G.BB_R * 0.6);
    out.push({base, tip: base.clone().addScaledVector(dir, 1.4), s: s / cl.length});
  }
  return out;
}

/** Double helix (both strands, rungs) as one static group of meshes. */
const DNA: React.FC<{cl: Centerline; anchor?: number; lollies?: Lolly[]; show?: (l: Lolly, i: number) => number}> = ({cl, anchor = 0, lollies, show}) => {
  const helix = useMemo(() => doubleHelix(cl, anchor, 0, cl.length), [cl, anchor]);
  const a = useDisposable(() => tubeGeometry(helix.a, G.BB_R, 8), [helix]);
  const b = useDisposable(() => tubeGeometry(helix.b, G.BB_R, 8), [helix]);
  const rungs = useMemo(() => {
    const r = helix.rungs;
    const count = r.length / 6;
    const im = new THREE.InstancedMesh(rungGeo, M.rung, count);
    im.frustumCulled = false;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const d = v3();
    const y = v3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      d.set(r[6 * i + 3] - r[6 * i], r[6 * i + 4] - r[6 * i + 1], r[6 * i + 5] - r[6 * i + 2]);
      const len = d.length();
      d.divideScalar(len || 1);
      q.setFromUnitVectors(y, d);
      m.compose(v3((r[6 * i] + r[6 * i + 3]) / 2, (r[6 * i + 1] + r[6 * i + 4]) / 2, (r[6 * i + 2] + r[6 * i + 5]) / 2), q, v3(1, len, 1));
      im.setMatrixAt(i, m);
    }
    return im;
  }, [helix]);
  return (
    <group>
      <mesh geometry={a} material={M.backbone} />
      <mesh geometry={b} material={M.backboneB} />
      <primitive object={rungs} />
      {lollies?.map((l, i) => {
        const k = show ? show(l, i) : 1;
        if (k <= 0.001) return null;
        const pop = Math.min(1, k * 1.5);
        const head = l.base.clone().lerp(l.tip, k);
        const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), l.tip.clone().sub(l.base).normalize());
        return (
          <group key={i}>
            <mesh geometry={lollyGeo} material={methylMat} position={head} scale={pop} />
            <mesh geometry={stalkGeo} material={methylMat} position={l.base.clone().lerp(head, 0.5)} quaternion={q} scale={[1, Math.max(0.01, l.base.distanceTo(head)), 1]} />
          </group>
        );
      })}
    </group>
  );
};

/* ---------------------------------------------------------------- nucleosomes */
function makeNuc(id: number, P: THREE.Vector3, psi: number, marks: MarkType[] = []): Nuc {
  const u = v3(1, 0.03 * Math.cos(id), -0.04 * Math.sin(id)).normalize();
  const D = v3(0, 1, 0).sub(u.clone().multiplyScalar(u.y)).normalize().applyAxisAngle(u, psi);
  const tails: Tail[] = [
    {anchor: v3(4.0 * Math.cos(-0.95), -4.0 * Math.sin(-0.95), 0.9), dir: v3(Math.cos(-0.95), -Math.sin(-0.95), 0.25), len: 7, phase: id * 1.3, mark: marks[0] ?? null, markScale: 1},
    {anchor: v3(4.0 * Math.cos(0.95), -4.0 * Math.sin(0.95), -0.9), dir: v3(Math.cos(0.95), -Math.sin(0.95), -0.25), len: 6.4, phase: id * 0.7 + 2, mark: marks[1] ?? null, markScale: 1},
    {anchor: v3(-1.6, 1.2, 2.6), dir: v3(-0.45, 0.25, 1), len: 5.6, phase: id * 2.1 + 4, mark: marks[2] ?? null, markScale: 1},
  ];
  const n = {id, P, u, D, wrap: 1, coreOffset: v3(), coreSpin: 0, coreVisible: 1, tails, coil: false} as Nuc;
  nucFrame(n);
  return n;
}
const TAIL_F = 40; // tails are posed once (static sway phase)
function tip(n: Nuc, i: number) {
  const pts = tailPoints(n, n.tails[i], TAIL_F);
  const k = pts.length / 3 - 1;
  return v3(pts[3 * k], pts[3 * k + 1], pts[3 * k + 2]);
}

const Nucleosomes: React.FC<{nucs: Nuc[]}> = ({nucs}) => {
  const tails = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    nucs.forEach((n) => n.tails.forEach((t) => geos.push(tubeGeometry(tailPoints(n, t, TAIL_F), (u) => 0.34 - 0.14 * u, 6))));
    const g = mergeGeometries(geos);
    geos.forEach((x) => x.dispose());
    return g;
  }, [nucs]);
  const core = histoneCoreGeometry();
  return (
    <group>
      {nucs.map((n) => {
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(n.e1, n.e2, n.e3));
        return <mesh key={n.id} geometry={core} material={M.core} position={n.C} quaternion={q} />;
      })}
      <mesh geometry={tails} material={M.tail} />
    </group>
  );
};

/* ---------------------------------------------------------------- reader (antibody-like Y) */
const readerGeo = (() => {
  // fork at the bottom: the two tips cradle a mark at the origin
  const parts: SDF[] = [sdCapsule(0, 3.2, 0, 0, 7.4, 0, 1.0), sdCapsule(0, 3.2, 0, -1.7, 0.7, 0, 0.72), sdCapsule(0, 3.2, 0, 1.7, 0.7, 0, 0.72)];
  const sdf: SDF = (x, y, z) => smin(smin(parts[0](x, y, z), parts[1](x, y, z), 0.8), parts[2](x, y, z), 0.8);
  return sdfMesh(sdf, v3(0, 3.8, 0), 6, 48);
})();

/** Reader docking on a mark: comes in along `dir`, holds, then leaves carrying the mark. */
function readerPose(mark: THREE.Vector3, dir: THREE.Vector3, t: number, tIn: number, tOut?: number) {
  const inA = rt(t, tIn, tIn + 1.0, easeOutCubic);
  const outA = tOut === undefined ? 0 : rt(t, tOut, tOut + 1.0, (x) => x * x);
  const off = (1 - inA) * 26 + outA * 30;
  const pos = mark.clone().addScaledVector(dir, off + 0.3);
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir);
  return {pos, q, visible: t > tIn - 0.05, carried: tOut !== undefined && t > tOut ? mark.clone().addScaledVector(dir, outA * 30) : null};
}

/* ---------------------------------------------------------------- tubes and tracks */
const glassMat = new THREE.MeshPhysicalMaterial({color: '#DCE3EA', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1});
const rimMat = clay('#C9D2DA', {roughness: 0.3});
const tubeBody = (() => {
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 10; k++) {
    const a = (Math.PI / 2) * (k / 10);
    pts.push(new THREE.Vector2(3 * Math.sin(a), -7 - 3 * Math.cos(a) + 3));
  }
  pts.push(new THREE.Vector2(3, 7));
  return new THREE.LatheGeometry(pts, 40);
})();
const rimGeo = new THREE.TorusGeometry(3, 0.28, 10, 40);

/** A sample tube; `layers` are liquid colours stacked from the bottom. */
const SampleTube: React.FC<{pos: THREE.Vector3; layers: THREE.Material[]; fill: number; s: number}> = ({pos, layers, fill, s}) => (
  <group position={pos} scale={Math.max(0.001, s)}>
    {layers.map((m, i) => {
      const h = (9 / layers.length) * fill;
      return <mesh key={i} geometry={boxGeoCyl} material={m} position={[0, -6 + h * (i + 0.5), 0]} scale={[2.6, Math.max(0.01, h), 2.6]} />;
    })}
    <mesh geometry={tubeBody} material={glassMat} renderOrder={5} />
    <mesh geometry={rimGeo} material={rimMat} position={[0, 7, 0]} rotation={[Math.PI / 2, 0, 0]} />
  </group>
);
const boxGeoCyl = new THREE.CylinderGeometry(1, 1, 1, 32);
const liquid = (c: string) => clay(c, {roughness: 0.25, transparent: true, opacity: 0.9, emissive: new THREE.Color(c), emissiveIntensity: 0.25});
const liqBlue = liquid(C.markBlue);
const liqCoral = liquid(C.coral);

const BINS = 34;
function profile(seed: number) {
  const rnd = mulberry32(seed);
  const peaks = Array.from({length: 5}, () => ({c: rnd() * BINS, w: 0.8 + rnd() * 1.6, h: 0.35 + rnd() * 0.65}));
  return Array.from({length: BINS}, (_, i) => 0.06 + peaks.reduce((s, p) => s + p.h * Math.exp(-((i - p.c) ** 2) / (2 * p.w * p.w)), 0));
}
const PROFILES = {ac: profile(11), me3: profile(23)};
/** Signal track: a baseline with bars drawing in left to right. */
const Track: React.FC<{pos: THREE.Vector3; width: number; height: number; color: string; prof: number[]; p: number}> = ({pos, width, height, color, prof, p}) => {
  const mat = useMemo(() => clay(color, {roughness: 0.35, emissive: new THREE.Color(color), emissiveIntensity: 0.3}), [color]);
  const bw = width / BINS;
  return (
    <group position={pos}>
      <mesh geometry={boxGeo} material={rimMat} position={[0, -0.15, 0]} scale={[width * Math.min(1, p * 1.3), 0.18, 0.5]} />
      {prof.map((v, i) => {
        const a = clamp(p * BINS * 1.25 - i, 0, 1);
        if (a <= 0) return null;
        const h = Math.max(0.05, Math.min(1.2, v) * height * easeOutBack(a));
        return <mesh key={i} geometry={boxGeo} material={mat} position={[-width / 2 + bw * (i + 0.5), h / 2, 0]} scale={[bw * 0.78, h, 0.7]} />;
      })}
    </group>
  );
};

/* ---------------------------------------------------------------- read stacks */
const readMats = ['#E9E4C6', '#D3CDAE', '#BDB79A', '#FBF9F6'].map((c) => clay(c, {roughness: 0.55}));
type ReadStackProps = {pos: THREE.Vector3; cols: number; rows: number; p: number; seed: number};
const ReadStack: React.FC<ReadStackProps> = ({pos, cols, rows, p, seed}) => {
  const meshes = useMemo(() => {
    const rnd = mulberry32(seed);
    const per = readMats.map(() => [] as THREE.Matrix4[]);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        for (let z = 0; z < 2; z++) {
          const len = 3.0 + rnd() * 1.4;
          const m = new THREE.Matrix4().compose(v3(c * 4.6 + (rnd() - 0.5) * 0.9, r * 0.62, (z - 0.5) * 1.3), new THREE.Quaternion(), v3(len, 0.42, 1.0));
          per[Math.floor(rnd() * readMats.length)].push(m);
          (m as unknown as {row: number}).row = r;
        }
    return per.map((list, i) => {
      const im = new THREE.InstancedMesh(boxGeo, readMats[i], list.length);
      im.frustumCulled = false;
      list.forEach((m, k) => im.setMatrixAt(k, m));
      return {im, list};
    });
  }, [cols, rows, seed]);
  const shown = p * rows;
  const tmp = new THREE.Matrix4();
  const P = v3(), Q = new THREE.Quaternion(), S = v3();
  for (const {im, list} of meshes) {
    let n = 0;
    for (const m of list) {
      const row = (m as unknown as {row: number}).row;
      const a = clamp(shown - row, 0, 1);
      if (a <= 0) continue;
      m.decompose(P, Q, S);
      P.y += (1 - easeOutCubic(a)) * 6;
      tmp.compose(P, Q, S);
      im.setMatrixAt(n++, tmp);
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
  }
  return (
    <group position={pos}>
      {meshes.map(({im}, i) => (
        <primitive key={i} object={im} />
      ))}
    </group>
  );
};

/* ---------------------------------------------------------------- lab scene */
function sheetTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = '#FBF9F6';
  g.fillRect(0, 0, 256, 320);
  g.fillStyle = C.keyword;
  g.fillRect(28, 30, 140, 18);
  g.fillStyle = '#9AA6B2';
  for (let i = 0; i < 9; i++) g.fillRect(28, 76 + i * 24, i % 3 === 2 ? 120 : 196, 8);
  g.fillStyle = C.tealLight;
  g.fillRect(28, 296, 60, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
let sheetMat: THREE.MeshBasicMaterial | null = null;
let glowTex: THREE.Texture | null = null;
const glowMat = (color: string) => new THREE.SpriteMaterial({map: (glowTex ??= glowTexture()), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false});
const benchMat = clay('#5A636C', {roughness: 0.7});
const floorMat = clay('#2A3035', {roughness: 0.95});
const floorGeo = new THREE.CircleGeometry(68, 64);
const benchHero = clay('#6B7580', {roughness: 0.6});
const flaskDim = clay('#3E5E5A', {roughness: 0.4});
const flaskLit = clay(C.tealLight, {roughness: 0.3, emissive: new THREE.Color(C.tealLight), emissiveIntensity: 0.6});
const requestMat = clay('#FBF9F6', {roughness: 0.5});
const kitBody = clay(C.sand, {roughness: 0.5});
const kitLid = clay(C.blue, {roughness: 0.45});
const kitBand = clay(C.teal, {roughness: 0.45});

const LAB_N = 8;
const LAB_R = 46;
const labPos = (i: number) => {
  const a = (i / LAB_N) * Math.PI * 2 + 0.3;
  return v3(Math.cos(a) * LAB_R, -1, Math.sin(a) * LAB_R * 0.95);
};
const Bench: React.FC<{pos: THREE.Vector3; scale: number; mat: THREE.Material; rotY?: number}> = ({pos, scale, mat, rotY = 0}) => (
  <group position={pos} scale={scale} rotation={[0, rotY, 0]}>
    <mesh geometry={boxGeo} material={mat} position={[0, 0, 0]} scale={[12, 0.9, 6]} />
    {[-5.2, 5.2].map((x) => [-2.4, 2.4].map((z) => <mesh key={`${x}${z}`} geometry={boxGeo} material={mat} position={[x, -2.6, z]} scale={[0.6, 4.4, 0.6]} />))}
  </group>
);
const Kit: React.FC<{pos: THREE.Vector3; s: number; rotY?: number}> = ({pos, s, rotY = 0}) =>
  s > 0.001 ? (
    <group position={pos} scale={s} rotation={[0, rotY, 0]}>
      <mesh geometry={boxGeo} material={kitBody} scale={[5, 3.4, 3.4]} />
      <mesh geometry={boxGeo} material={kitLid} position={[0, 1.95, 0]} scale={[5.2, 0.5, 3.6]} />
      <mesh geometry={boxGeo} material={kitBand} position={[0, -0.2, 1.72]} scale={[5.0, 0.7, 0.06]} />
    </group>
  ) : null;

const arc = (a: THREE.Vector3, b: THREE.Vector3, u: number, h: number) => a.clone().lerp(b, u).add(v3(0, Math.sin(Math.PI * u) * h, 0));

const LabScene: React.FC<{t: number}> = ({t}) => {
  sheetMat ??= new THREE.MeshBasicMaterial({map: sheetTexture(), toneMapped: false});
  const sheetGlow = useMemo(() => glowMat(C.keyword), []);
  const labGlows = useMemo(() => Array.from({length: LAB_N}, () => glowMat(C.tealLight)), []);
  const centre = v3(0, 0, 0);
  const sheetPos = v3(0, 6.6, 1.2);
  const toKit = rt(t, 65.3, 66.3);
  const pileFade = 1 - rt(t, 66.4, 67.4);
  // requests: one after another from the labs, landing in a growing pile beside the bench
  const REQ = 36;
  const reqs: React.ReactNode[] = [];
  for (let k = 0; k < REQ; k++) {
    const t0 = 59.3 + k * 0.14;
    if (t < t0) continue;
    const from = labPos(k % LAB_N).add(v3(0, 1.5, 0));
    const rnd = mulberry32(100 + k);
    const slot = v3(17 + (k % 2) * 5 + (rnd() - 0.5) * 1.2, -8.8 + Math.floor(k / 2) * 0.8, 6 + (rnd() - 0.5) * 1.6);
    const u = clamp((t - t0) / 1.0);
    const p = arc(from, slot, easeInOutCubic(u), 20);
    const s = pileFade;
    if (s <= 0.01) continue;
    reqs.push(<mesh key={k} geometry={boxGeo} material={requestMat} position={p} rotation={[0, (rnd() - 0.5) * 0.8 + u * 2 * (1 - u), (rnd() - 0.5) * 0.15]} scale={[4.4 * s, 0.6 * s, 3.0 * s]} />);
  }
  // kits: one per lab, flying out from the centre
  const kits: React.ReactNode[] = [];
  const lit: number[] = [];
  for (let i = 0; i < LAB_N; i++) {
    const t0 = 66.4 + i * 0.28;
    const u = clamp((t - t0) / 1.2);
    lit.push(rt(t, t0 + 1.0, t0 + 1.6));
    if (t < t0) continue;
    const p = arc(sheetPos.clone().add(v3(0, 2, 0)), labPos(i).add(v3(-2, 3.4, 0)), easeInOutCubic(u), 22);
    kits.push(<Kit key={i} pos={p} s={1.0} rotY={u * 3} />);
  }
  return (
    <group>
      <Bench pos={centre} scale={1.9} mat={benchHero} />
      <mesh geometry={floorGeo} material={floorMat} position={[0, -9.6, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      {toKit < 1 ? (
        <group position={sheetPos} rotation={[-0.35, 0, 0]} scale={1 - toKit}>
          <mesh material={sheetMat}>
            <planeGeometry args={[9.6, 12]} />
          </mesh>
        </group>
      ) : null}
      <sprite material={sheetGlow} position={sheetPos} scale={[44, 44, 1]} />
      <Kit pos={sheetPos.clone().add(v3(0, -2.6 + 2.6 * easeOutBack(toKit), 0))} s={easeOutBack(toKit) * 1.7} />
      {Array.from({length: LAB_N}, (_, i) => {
        const p = labPos(i);
        const rotY = -Math.atan2(p.z, p.x) + Math.PI / 2;
        return (
          <group key={i}>
            <Bench pos={p} scale={0.95} mat={benchMat} rotY={rotY} />
            <mesh geometry={boxGeoCyl} material={lit[i] > 0.5 ? flaskLit : flaskDim} position={p.clone().add(v3(2.4, 2.4, 0))} scale={[1.3, 4.0, 1.3]} />
            {lit[i] > 0 ? <sprite material={labGlows[i]} position={p.clone().add(v3(0, 3, 0))} scale={[26 * lit[i], 26 * lit[i], 1]} /> : null}
          </group>
        );
      })}
      {reqs}
      {kits}
    </group>
  );
};

/* ---------------------------------------------------------------- the stage */
let built: ReturnType<typeof build> | null = null;
function build() {
  // beat 1: three nucleosomes; the middle one carries one active and one repressive mark
  const vNucs = [makeNuc(301, v3(-27, 1, -1), 0.5), makeNuc(302, v3(0, 0, 0.5), 2.7, ['ac', 'me3']), makeNuc(303, v3(27, -1, 0), 4.7)];
  const vCl = buildCenterline(vNucs, 30, 30);
  const vAnchor = vCl.dyadS.get(302)!;
  const vLollies = lollipops(vCl, vAnchor, 46, 31, 6).filter((l) => {
    // keep the methyl groups that point away from the histone cores (no clipping into the octamer)
    const n = vNucs.reduce((a, c) => (l.base.distanceTo(c.C) < l.base.distanceTo(a.C) ? l.base.distanceTo(c.C) < 1e9 ? c : a : a), vNucs[0]);
    return l.tip.distanceTo(n.C) > l.base.distanceTo(n.C) + 0.6;
  });
  // beat 2: a methylated stretch cut into pieces (they fray apart after the harsh treatment)
  const PIECES = 6;
  const PL = 8.2;
  const pieces = Array.from({length: PIECES}, (_, i) => {
    const cl = lineCenterline([v3(-PL / 2, 0, 0), v3(0, 0.15 * Math.sin(i), 0), v3(PL / 2, 0, 0)]);
    return {cl, lollies: lollipops(cl, 0, 2, 50 + i, 1.4), anchor: i * PL};
  });
  // HisTLAND card: one nucleosome, both marks
  const hNuc = makeNuc(310, v3(0, 0, 0), 2.7, ['ac', 'me3']);
  const hCl = buildCenterline([hNuc], 16, 16);
  // MeTLAND card: intact DNA with methyl groups
  const mCl = lineCenterline([v3(-17, -0.5, 0), v3(-6, 0.8, 0.5), v3(6, -0.6, -0.4), v3(17, 0.4, 0)]);
  const mLollies = lollipops(mCl, 0, 9, 77, 2);
  return {vNucs, vCl, vAnchor, vLollies, pieces, PL, hNuc, hCl, mCl, mLollies};
}
export const gapBuilt = () => (built ??= build());

/** World-space anchors used by overlay labels and tags. */
export function gapAnchors() {
  const b = gapBuilt();
  const o = gapOrigin();
  return {
    histMark: tip(b.hNuc, 0).add(v3(GAP.histland, 0, 0)).add(o),
    metMethyl: b.mLollies[5].tip.clone().add(v3(GAP.metland, 0, 0)).add(o),
    tube1: v3(GAP.tubes - 10, -12, 0).add(o),
    tube2: v3(GAP.tubes + 10, -12, 0).add(o),
  };
}

export const GapStage: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  if (t < GAP_T0) return null;
  const b = gapBuilt();
  const o = gapOrigin();

  /* beat 1 ----------------------------------------------------------- */
  const mid = b.vNucs[1];
  const acTip = tip(mid, 0);
  const meTip = tip(mid, 1);
  const acDir = acTip.clone().sub(mid.C).normalize().multiplyScalar(0.5).add(v3(0, 1, 0.45)).normalize();
  const reader = readerPose(acTip, acDir, t, 45.7, 47.5);
  const coralO = 1 - rt(t, 46.9, 47.9);
  me3Fade.transparent = coralO < 1;
  me3Fade.opacity = coralO;
  const marksIn = rt(t, 44.9, 45.5, easeOutBack);
  const methylShow = (l: Lolly) => rt(t, 42.4 + l.s * 2.0, 42.4 + l.s * 2.0 + 0.4, (x) => x);

  /* tubes -------------------------------------------------------------- */
  const tubeIn = rt(t, 47.9, 48.7, easeOutBack);
  const fill1 = rt(t, 48.4, 49.6);
  const fill2 = rt(t, 48.9, 50.1);

  /* beat 2 ------------------------------------------------------------- */
  const travel = rt(t, 52.3, 55.4, (x) => x) * 52;
  const boxPulse = 1 + 0.03 * Math.sin(t * 9);
  const readsP = rt(t, 54.6, 57.9, (x) => 1 - Math.pow(1 - x, 1.6));

  /* kit cards ---------------------------------------------------------- */
  const hAc = tip(b.hNuc, 0);
  const hMe = tip(b.hNuc, 1);
  const fromAbove = (m: THREE.Vector3) => m.clone().sub(b.hNuc.C).normalize().multiplyScalar(0.5).add(v3(0, 1, 0.45)).normalize();
  const hReadA = readerPose(hAc, fromAbove(hAc), t, 75.6);
  const hReadB = readerPose(hMe, fromAbove(hMe), t, 75.75);
  const hTube = rt(t, 76.8, 77.5, easeOutBack);
  const hFill = rt(t, 77.0, 78.2);
  const mReads = rt(t, 81.4, 82.8, (x) => x);

  return (
    <group position={o}>
      {win(t, GAP_T0, 51.8) ? (
        <group position={[GAP.vignette, 0, 0]}>
          <DNA cl={b.vCl} anchor={b.vAnchor} lollies={b.vLollies} show={methylShow} />
          <Nucleosomes nucs={b.vNucs} />
          {marksIn > 0 ? <mesh geometry={markGeo} material={M.ac} position={reader.carried ?? acTip} scale={marksIn} /> : null}
          {marksIn > 0 && coralO > 0.01 ? <mesh geometry={markGeo} material={me3Fade} position={meTip} scale={marksIn} /> : null}
          {reader.visible ? <mesh geometry={readerGeo} material={readerMat} position={reader.pos} quaternion={reader.q} /> : null}
        </group>
      ) : null}
      {win(t, 47.6, 52.6) ? (
        <group position={[GAP.tubes, 0, 0]}>
          <SampleTube pos={v3(-10, -4, 0)} layers={[liqBlue]} fill={fill1} s={tubeIn} />
          <SampleTube pos={v3(10, -4, 0)} layers={[liqCoral]} fill={fill2} s={tubeIn} />
          <Track pos={v3(-10, 6.5, 0)} width={15} height={6} color={C.markBlue} prof={PROFILES.ac} p={rt(t, 48.6, 50.2, (x) => x)} />
          <Track pos={v3(10, 6.5, 0)} width={15} height={6} color={C.coral} prof={PROFILES.me3} p={rt(t, 49.2, 50.8, (x) => x)} />
        </group>
      ) : null}
      {win(t, 50.6, 59.8) ? (
        <group>
          <group position={[GAP.harsh, 0, 0]}>
            <mesh geometry={boxGeo} material={harshMat} scale={[14 * boxPulse, 14 * boxPulse, 14 * boxPulse]} renderOrder={6} />
            <lineSegments geometry={harshEdges} material={harshLine} scale={14 * boxPulse} />
          </group>
          {b.pieces.map((pc, i) => {
            // pieces travel left to right; once out of the box they break apart and drift
            const x = GAP.harsh - 14 - i * b.PL + travel;
            const rnd = mulberry32(400 + i);
            const fray = clamp((x - (GAP.harsh + 6)) / 14);
            const e = easeOutCubic(fray);
            const pos = v3(x + e * i * 0.8, e * (rnd() - 0.5) * 16, e * (rnd() - 0.5) * 12);
            const rot = new THREE.Euler(e * (rnd() - 0.5) * 2.4, e * (rnd() - 0.5) * 1.6, e * (rnd() - 0.5) * 2.0);
            return (
              <group key={i} position={pos} rotation={rot}>
                <DNA cl={pc.cl} anchor={pc.anchor} lollies={pc.lollies} />
              </group>
            );
          })}
          <ReadStack pos={v3(GAP.reads, -10, 0)} cols={4} rows={140} p={readsP} seed={5} />
        </group>
      ) : null}
      {win(t, 57.6, 76.2) ? (
        <group position={[GAP.labs, 0, 0]}>
          <LabScene t={t} />
        </group>
      ) : null}
      {win(t, 74.4, 81.8) ? (
        <group position={[GAP.histland, 0, 0]}>
          <DNA cl={b.hCl} anchor={b.hCl.dyadS.get(310)!} />
          <Nucleosomes nucs={[b.hNuc]} />
          <mesh geometry={markGeo} material={M.ac} position={hAc} />
          <mesh geometry={markGeo} material={M.me3} position={hMe} />
          {hReadA.visible ? <mesh geometry={readerGeo} material={readerMat} position={hReadA.pos} quaternion={hReadA.q} /> : null}
          {hReadB.visible ? <mesh geometry={readerGeo} material={readerCoralMat} position={hReadB.pos} quaternion={hReadB.q} /> : null}
          <SampleTube pos={v3(17, -4, 0)} layers={[liqBlue, liqCoral]} fill={hFill} s={hTube} />
          <Track pos={v3(17, 9.5, 0)} width={12} height={3.2} color={C.markBlue} prof={PROFILES.ac} p={rt(t, 77.4, 78.8, (x) => x)} />
          <Track pos={v3(17, 5.6, 0)} width={12} height={3.2} color={C.coral} prof={PROFILES.me3} p={rt(t, 77.6, 79.0, (x) => x)} />
        </group>
      ) : null}
      {win(t, 79.6, 90.1) ? (
        <group position={[GAP.metland, 0, 0]}>
          <DNA cl={b.mCl} lollies={b.mLollies} />
          <ReadStack pos={v3(6, -12, 0)} cols={2} rows={8} p={mReads} seed={9} />
        </group>
      ) : null}
    </group>
  );
};

const harshMat = new THREE.MeshPhysicalMaterial({color: C.coral, emissive: new THREE.Color(C.coral), emissiveIntensity: 0.35, roughness: 0.4, transparent: true, opacity: 0.42, depthWrite: false});
const harshEdges = new THREE.EdgesGeometry(boxGeo);
const harshLine = new THREE.LineBasicMaterial({color: '#F08A70'});
