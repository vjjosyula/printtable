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
import {gapOrigin, GAP_T0, STAGE} from './view';

/**
 * The kit stage after the chromatin story, staged along +x beside the chromatin, on video seconds:
 * HisTLAND® (two marks read together) -> methylation appears -> MeTLAND® -> kits reach many labs -> two layers.
 */
export const GAP = STAGE;

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const win = (t: number, a: number, b: number) => t >= a && t <= b;
const rt = (t: number, a: number, b: number, e: (x: number) => number = easeInOutCubic) => ramp(t, a, b, e);

/* ---------------------------------------------------------------- shared geometry */
const rungGeo = new THREE.CylinderGeometry(G.RUNG_R, G.RUNG_R, 1, 6, 1, false);
const markGeo = new THREE.SphereGeometry(0.85, 24, 16);
const lollyGeo = new THREE.SphereGeometry(0.62, 18, 12);
const stalkGeo = new THREE.CylinderGeometry(0.14, 0.14, 1, 6);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const methylMat = clay(C.teal, {roughness: 0.4});
const readerMat = clay(C.markBlue, {roughness: 0.38, clearcoat: 0.5});
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
const glassMat = new THREE.MeshPhysicalMaterial({color: '#AFC0CF', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1});
const rimMat = clay('#8E9BA6', {roughness: 0.3});
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
const readMats = ['#C9C09A', '#B8AE86', '#D8CFAA', '#9FB7C9'].map((c) => clay(c, {roughness: 0.55}));
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
// on the light background a soft normal-blended halo reads better than an additive glow
const glowMat = (color: string) => new THREE.SpriteMaterial({map: (glowTex ??= glowTexture()), color, transparent: true, opacity: 0.55, depthWrite: false, fog: false});
const benchMat = clay('#8F99A3', {roughness: 0.7});
const benchHero = clay('#6E7983', {roughness: 0.6});
const flaskDim = clay('#B9C9C5', {roughness: 0.4});
const flaskLit = clay(C.teal, {roughness: 0.3, emissive: new THREE.Color(C.teal), emissiveIntensity: 0.3});
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
  const sheetGlow = useMemo(() => glowMat('#8DB3E2'), []);
  const labGlows = useMemo(() => Array.from({length: LAB_N}, () => glowMat(C.teal)), []);
  const centre = v3(0, 0, 0);
  const sheetPos = v3(0, 6.6, 1.2);
  // the published protocol glows, becomes a kit, and copies travel out to every lab
  const toKit = rt(t, 68.0, 69.0);
  const kits: React.ReactNode[] = [];
  const lit: number[] = [];
  for (let i = 0; i < LAB_N; i++) {
    const t0 = 69.4 + i * 0.32;
    const u = clamp((t - t0) / 1.2);
    lit.push(rt(t, t0 + 1.0, t0 + 1.6));
    if (t < t0) continue;
    const p = arc(sheetPos.clone().add(v3(0, 2, 0)), labPos(i).add(v3(-2, 3.4, 0)), easeInOutCubic(u), 22);
    kits.push(<Kit key={i} pos={p} s={1.0} rotY={u * 3} />);
  }
  return (
    <group>
      <Bench pos={centre} scale={1.9} mat={benchHero} />
      {toKit < 1 ? (
        <group position={sheetPos} rotation={[-0.35, 0, 0]} scale={1 - toKit}>
          <mesh material={sheetMat}>
            <planeGeometry args={[9.6, 12]} />
          </mesh>
        </group>
      ) : null}
      <sprite material={sheetGlow} position={sheetPos} scale={[44 * (1 - 0.5 * toKit), 44 * (1 - 0.5 * toKit), 1]} />
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
      {kits}
    </group>
  );
};

/* ---------------------------------------------------------------- the stage */
const notIntoCore = (nucs: Nuc[]) => (l: Lolly) => {
  // keep methyl groups that point away from the nearest histone core (no clipping into the octamer)
  const n = nucs.reduce((a, c) => (l.base.distanceTo(c.C) < l.base.distanceTo(a.C) ? c : a), nucs[0]);
  return l.tip.distanceTo(n.C) > l.base.distanceTo(n.C) + 0.6;
};
let built: ReturnType<typeof build> | null = null;
function build() {
  // HisTLAND®: one nucleosome carrying an active and a repressive mark
  const hNuc = makeNuc(310, v3(0, 0, 0), 2.7, ['ac', 'me3']);
  const hCl = buildCenterline([hNuc], 16, 16);
  // layer two: bare DNA (no histones), with methyl groups appearing along it
  const vCl = lineCenterline([v3(-34, -1.0, 0), v3(-17, 1.2, 0.8), v3(0, -0.6, -0.6), v3(17, 1.0, 0.5), v3(34, -0.8, 0)]);
  const vLollies = lollipops(vCl, 0, 16, 31, 3);
  // MeTLAND®: intact methylated DNA
  const mCl = lineCenterline([v3(-17, -0.5, 0), v3(-6, 0.8, 0.5), v3(6, -0.6, -0.4), v3(17, 0.4, 0)]);
  const mLollies = lollipops(mCl, 0, 9, 77, 2);
  // two layers: two nucleosomes with histone marks, and methyl groups on the same DNA
  const lNucs = [makeNuc(321, v3(-12, 0.5, 0), 0.9, ['ac', null, 'ac']), makeNuc(322, v3(12, -0.5, 0.3), 3.4, ['me3', 'me3'])];
  const lCl = buildCenterline(lNucs, 20, 20);
  const lAnchor = lCl.dyadS.get(321)!;
  const lLollies = lollipops(lCl, lAnchor, 30, 55, 4).filter(notIntoCore(lNucs));
  return {hNuc, hCl, vCl, vLollies, mCl, mLollies, lNucs, lCl, lAnchor, lLollies};
}
export const gapBuilt = () => (built ??= build());

/** World-space anchors used by overlay tags. */
export function gapAnchors() {
  const b = gapBuilt();
  const o = gapOrigin();
  const at = (x: number, p: THREE.Vector3) => p.clone().add(v3(x, 0, 0)).add(o);
  // pick the methyl group nearest the middle of the two-layers DNA for its tag
  const lm = b.lLollies.reduce((a, l) => (Math.abs(l.s - 0.5) < Math.abs(a.s - 0.5) ? l : a), b.lLollies[0]);
  return {
    histMark: at(GAP.histland, tip(b.hNuc, 0)),
    metMethyl: at(GAP.metland, b.mLollies[5].tip),
    layersMark: at(GAP.layers, tip(b.lNucs[0], 0)),
    layersMethyl: at(GAP.layers, lm.tip),
  };
}

export const GapStage: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  if (t < GAP_T0) return null;
  const b = gapBuilt();
  const o = gapOrigin();

  /* HisTLAND®: both marks read together from one sample ---------------- */
  const hAc = tip(b.hNuc, 0);
  const hMe = tip(b.hNuc, 1);
  const fromAbove = (m: THREE.Vector3) => m.clone().sub(b.hNuc.C).normalize().multiplyScalar(0.5).add(v3(0, 1, 0.45)).normalize();
  const hReadA = readerPose(hAc, fromAbove(hAc), t, 42.4);
  const hReadB = readerPose(hMe, fromAbove(hMe), t, 42.55);
  const hTube = rt(t, 43.6, 44.3, easeOutBack);
  const hFill = rt(t, 43.8, 45.0);

  /* methylation appears -------------------------------------------------- */
  const methylShow = (l: Lolly) => rt(t, 51.0 + l.s * 2.6, 51.0 + l.s * 2.6 + 0.4, (x) => x);

  /* MeTLAND®: intact DNA, a short stack of reads ------------------------- */
  const mReads = rt(t, 58.6, 60.2, (x) => x);

  return (
    <group position={o}>
      {win(t, GAP_T0, 51.2) ? (
        <group position={[GAP.histland, 0, 0]}>
          <DNA cl={b.hCl} anchor={b.hCl.dyadS.get(310)!} />
          <Nucleosomes nucs={[b.hNuc]} />
          <mesh geometry={markGeo} material={M.ac} position={hAc} />
          <mesh geometry={markGeo} material={M.me3} position={hMe} />
          {hReadA.visible ? <mesh geometry={readerGeo} material={readerMat} position={hReadA.pos} quaternion={hReadA.q} /> : null}
          {hReadB.visible ? <mesh geometry={readerGeo} material={readerCoralMat} position={hReadB.pos} quaternion={hReadB.q} /> : null}
          <SampleTube pos={v3(17, -4, 0)} layers={[liqBlue, liqCoral]} fill={hFill} s={hTube} />
          <Track pos={v3(17, 9.5, 0)} width={12} height={3.2} color={C.markBlue} prof={PROFILES.ac} p={rt(t, 44.2, 45.6, (x) => x)} />
          <Track pos={v3(17, 5.6, 0)} width={12} height={3.2} color={C.coral} prof={PROFILES.me3} p={rt(t, 44.4, 45.8, (x) => x)} />
        </group>
      ) : null}
      {win(t, 49.0, 57.6) ? (
        <group position={[GAP.methyl, 0, 0]}>
          <DNA cl={b.vCl} lollies={b.vLollies} show={methylShow} />
        </group>
      ) : null}
      {win(t, 55.4, 67.6) ? (
        <group position={[GAP.metland, 0, 0]}>
          <DNA cl={b.mCl} lollies={b.mLollies} />
          <ReadStack pos={v3(6, -12, 0)} cols={2} rows={8} p={mReads} seed={9} />
        </group>
      ) : null}
      {win(t, 65.0, 76.4) ? (
        <group position={[GAP.labs, 0, 0]}>
          <LabScene t={t} />
        </group>
      ) : null}
      {win(t, 74.6, 90.1) ? (
        <group position={[GAP.layers, 0, 0]}>
          <DNA cl={b.lCl} anchor={b.lAnchor} lollies={b.lLollies} />
          <Nucleosomes nucs={b.lNucs} />
          {b.lNucs.flatMap((n) =>
            n.tails.map((tl, i) => (tl.mark ? <mesh key={`${n.id}-${i}`} geometry={markGeo} material={tl.mark === 'ac' ? M.ac : M.me3} position={tip(n, i)} /> : null)),
          )}
        </group>
      ) : null}
    </group>
  );
};
