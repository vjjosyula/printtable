import React, {useEffect, useMemo} from 'react';
import {useStoryFrame} from '../lib/timeline';
import * as THREE from 'three';
import {useCurrentFrame} from 'remotion';
import {coreToWorld, doubleHelix, G} from '../lib/chromatin';
import {tubeGeometry} from '../lib/geom';
import {histoneCoreGeometry, POL_CLAMP_PIVOT, polBodyGeometry, polClampGeometry, writerGeometry} from '../lib/proteins';
import {M} from './materials';
import {tailPoints} from './tails';
import {PolState, worldAt} from './state';

const MAX_RUNGS = 24000;
const rungGeo = new THREE.CylinderGeometry(G.RUNG_R, G.RUNG_R, 1, 6, 1, false);
const markGeo = new THREE.SphereGeometry(0.85, 24, 16);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _y = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function useDisposable<T extends {dispose: () => void}>(make: () => T, deps: unknown[]): T {
  const v = useMemo(make, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => v.dispose(), [v]);
  return v;
}

export const Chromatin: React.FC<{detail: boolean; opacity?: number; clip?: THREE.Plane[]}> = ({detail}) => {
  const f = useStoryFrame();
  const w = worldAt(f);

  const helix = useMemo(() => {
    if (!detail) return null;
    return doubleHelix(w.cl, w.anchorS, 0, w.cl.length);
  }, [w, detail]);

  const strandA = useDisposable(() => (helix ? tubeGeometry(helix.a, G.BB_R, 8) : new THREE.BufferGeometry()), [helix]);
  const strandB = useDisposable(() => (helix ? tubeGeometry(helix.b, G.BB_R, 8) : new THREE.BufferGeometry()), [helix]);
  const simple = useDisposable(() => {
    if (detail) return new THREE.BufferGeometry();
    // decimated single tube for distant views
    const step = 12;
    const n = Math.floor(w.cl.n / step);
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) pts[3 * i + c] = w.cl.pos[3 * i * step + c];
    return tubeGeometry(pts, 1.15, 6);
  }, [w, detail]);

  const rungs = useMemo(() => {
    const im = new THREE.InstancedMesh(rungGeo, M.rung, MAX_RUNGS);
    im.frustumCulled = false;
    return im;
  }, []);
  useMemo(() => {
    if (!helix) {
      rungs.count = 0;
      return;
    }
    const r = helix.rungs;
    const count = Math.min(MAX_RUNGS, r.length / 6);
    for (let i = 0; i < count; i++) {
      const ax = r[6 * i],
        ay = r[6 * i + 1],
        az = r[6 * i + 2];
      const bx = r[6 * i + 3],
        by = r[6 * i + 4],
        bz = r[6 * i + 5];
      _d.set(bx - ax, by - ay, bz - az);
      const len = _d.length();
      _d.divideScalar(len || 1);
      _q.setFromUnitVectors(_y, _d);
      _p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      _s.set(1, len, 1);
      _m.compose(_p, _q, _s);
      rungs.setMatrixAt(i, _m);
    }
    rungs.count = count;
    rungs.instanceMatrix.needsUpdate = true;
  }, [helix, rungs]);

  const tails = useDisposable(() => {
    const geos: THREE.BufferGeometry[] = [];
    w.nucs.forEach((n) => {
      if (n.coreVisible <= 0) return;
      n.tails.forEach((t) => geos.push(tubeGeometry(tailPoints(n, t, f), (u) => 0.34 - 0.14 * u, 6)));
    });
    const merged = mergeTubes(geos);
    geos.forEach((g) => g.dispose());
    return merged;
  }, [w]);

  const coreGeo = histoneCoreGeometry();
  const marks: {pos: THREE.Vector3; type: string; scale: number}[] = [];
  w.nucs.forEach((n) =>
    n.tails.forEach((t) => {
      if (!t.mark || t.markScale <= 0 || n.coreVisible <= 0) return;
      const pts = tailPoints(n, t, f);
      const k = pts.length / 3 - 1;
      marks.push({pos: new THREE.Vector3(pts[3 * k], pts[3 * k + 1], pts[3 * k + 2]), type: t.mark, scale: popScale(t.markScale)});
    }),
  );

  return (
    <group>
      {detail ? (
        <>
          <mesh geometry={strandA} material={M.backbone} />
          <mesh geometry={strandB} material={M.backboneB} />
          <primitive object={rungs} />
        </>
      ) : (
        <mesh geometry={simple} material={M.backbone} />
      )}
      {w.nucs.map((n) => {
        if (n.coreVisible <= 0) return null;
        const c = coreToWorld(n, new THREE.Vector3());
        const e1 = coreDirToWorldBasis(n);
        const m = new THREE.Matrix4().makeBasis(e1[0], e1[1], e1[2]);
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        const sc = 0.4 + 0.6 * n.coreVisible;
        return <mesh key={n.id} geometry={coreGeo} material={M.core} position={c} quaternion={q} scale={sc} />;
      })}
      <mesh geometry={tails} material={M.tail} />
      {marks.map((mk, i) => (
        <mesh key={i} geometry={markGeo} material={mk.type === 'ac' ? M.ac : M.me3} position={mk.pos} scale={mk.scale} />
      ))}
      <Writer />
      <Polymerase s={w.pol1} />
      <Polymerase s={w.pol2} />
      <Rna pts={w.rna} />
    </group>
  );
};

const popScale = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + Math.sin(t * Math.PI) * 0.35 * (1 - t) + (t - 1) * (1 - t) * 0.0) * Math.min(1, t * 1.6);

function coreDirToWorldBasis(n: ReturnType<typeof worldAt>['nucs'][number]) {
  const c = Math.cos(n.coreSpin);
  const s = Math.sin(n.coreSpin);
  const x = n.e1.clone().multiplyScalar(c).addScaledVector(n.e2, s);
  const y = n.e1.clone().multiplyScalar(-s).addScaledVector(n.e2, c);
  return [x, y, n.e3.clone()];
}

function mergeTubes(geos: THREE.BufferGeometry[]) {
  let nv = 0;
  let ni = 0;
  geos.forEach((g) => {
    nv += g.attributes.position?.count ?? 0;
    ni += g.index?.count ?? 0;
  });
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let ov = 0;
  let oi = 0;
  geos.forEach((g) => {
    if (!g.attributes.position) return;
    pos.set(g.attributes.position.array as Float32Array, ov * 3);
    nor.set(g.attributes.normal.array as Float32Array, ov * 3);
    const src = g.index!.array;
    for (let i = 0; i < src.length; i++) idx[oi + i] = src[i] + ov;
    ov += g.attributes.position.count;
    oi += src.length;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

const Writer: React.FC = () => {
  const f = useStoryFrame();
  const w = worldAt(f).writer;
  if (w.visible <= 0) return null;
  return <mesh geometry={writerGeometry()} material={M.writer} position={w.pos} quaternion={w.quat} scale={0.8 * (0.6 + 0.4 * w.visible)} />;
};

const Polymerase: React.FC<{s: PolState}> = ({s}) => {
  if (s.visible <= 0) return null;
  const ang = s.clampOpen * 0.75;
  return (
    <group position={s.pos} quaternion={s.quat} scale={0.6 + 0.4 * s.visible}>
      <mesh geometry={polBodyGeometry()} material={M.pol} />
      <group position={POL_CLAMP_PIVOT} rotation={[ang, 0, 0]}>
        <mesh geometry={polClampGeometry()} material={M.pol} position={POL_CLAMP_PIVOT.clone().negate()} />
      </group>
    </group>
  );
};

const Rna: React.FC<{pts: Float32Array | null}> = ({pts}) => {
  const geo = useDisposable(() => (pts ? tubeGeometry(pts, (u) => 0.42 - 0.12 * u, 7) : new THREE.BufferGeometry()), [pts]);
  if (!pts) return null;
  return <mesh geometry={geo} material={M.rna} />;
};

export {MergeHelper};
const MergeHelper = mergeTubes;
