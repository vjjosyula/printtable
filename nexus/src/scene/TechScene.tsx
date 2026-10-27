import React, {useEffect, useMemo} from 'react';
import * as THREE from 'three';
import {useStoryFrame} from '../lib/timeline';
import {doubleHelix, G} from '../lib/chromatin';
import {tubeGeometry} from '../lib/geom';
import {histoneCoreGeometry} from '../lib/proteins';
import {C} from '../lib/brand';
import {clay, M} from './materials';
import {tailPoints} from './tails';
import {MergeHelper} from './Chromatin';
import {techAt} from './tech';

const rungGeo = new THREE.CylinderGeometry(G.RUNG_R, G.RUNG_R, 1, 6, 1, false);
const markGeo = new THREE.SphereGeometry(0.85, 24, 16);
const methylGeo = new THREE.SphereGeometry(0.85, 20, 14);
const methylMat = clay(C.charcoal, {roughness: 0.45});
const scanGeo = new THREE.TorusGeometry(2.4, 0.22, 12, 48);
const scanMat = new THREE.MeshBasicMaterial({color: C.teal, transparent: true, opacity: 0.55, depthWrite: false});

function useDisposable<T extends {dispose: () => void}>(make: () => T, deps: unknown[]): T {
  const v = useMemo(make, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => v.dispose(), [v]);
  return v;
}

/** Kit finale: a short stretch of chromatin where MeTLAND and Histland "read" their layer. */
export const TechScene: React.FC = () => {
  const sf = useStoryFrame();
  const visible = sf >= 860;
  const s = techAt(visible ? sf : 860);
  const f = s.f;

  const helix = useMemo(() => doubleHelix(s.cl, s.anchorS, 0, s.cl.length), [s]);
  const strandA = useDisposable(() => tubeGeometry(helix.a, G.BB_R, 8), [helix]);
  const strandB = useDisposable(() => tubeGeometry(helix.b, G.BB_R, 8), [helix]);
  const rungs = useMemo(() => {
    const im = new THREE.InstancedMesh(rungGeo, M.rung, 2000);
    im.frustumCulled = false;
    return im;
  }, []);
  useMemo(() => {
    const r = helix.rungs;
    const count = Math.min(2000, r.length / 6);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const d = new THREE.Vector3();
    const y = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      d.set(r[6 * i + 3] - r[6 * i], r[6 * i + 4] - r[6 * i + 1], r[6 * i + 5] - r[6 * i + 2]);
      const len = d.length();
      d.divideScalar(len || 1);
      q.setFromUnitVectors(y, d);
      m.compose(new THREE.Vector3((r[6 * i] + r[6 * i + 3]) / 2, (r[6 * i + 1] + r[6 * i + 4]) / 2, (r[6 * i + 2] + r[6 * i + 5]) / 2), q, new THREE.Vector3(1, len, 1));
      rungs.setMatrixAt(i, m);
    }
    rungs.count = count;
    rungs.instanceMatrix.needsUpdate = true;
  }, [helix, rungs]);

  const tails = useDisposable(() => {
    const geos: THREE.BufferGeometry[] = [];
    s.nucs.forEach((n) => n.tails.forEach((t) => geos.push(tubeGeometry(tailPoints(n, t, f), (u) => 0.34 - 0.14 * u, 6))));
    const g = MergeHelper(geos);
    geos.forEach((x) => x.dispose());
    return g;
  }, [s]);
  const stalks = useDisposable(() => {
    const geos: THREE.BufferGeometry[] = [];
    s.methyl.forEach((m) => {
      if (m.scale <= 0) return;
      const tip = m.base.clone().lerp(m.tip, m.scale);
      geos.push(tubeGeometry([m.base.x, m.base.y, m.base.z, tip.x, tip.y, tip.z], 0.16, 6, false));
    });
    const g = geos.length ? MergeHelper(geos) : new THREE.BufferGeometry();
    geos.forEach((x) => x.dispose());
    return g;
  }, [s]);

  if (!visible) return null;
  const coreGeo = histoneCoreGeometry();
  const sc = 0.001 + s.appear;
  let scanPos: THREE.Vector3 | null = null;
  let scanQuat: THREE.Quaternion | null = null;
  if (s.scanS !== null) {
    const x = Math.min(s.cl.n - 2, Math.max(0, Math.floor(s.scanS / s.cl.ds)));
    scanPos = new THREE.Vector3(s.cl.pos[3 * x], s.cl.pos[3 * x + 1], s.cl.pos[3 * x + 2]);
    const t = new THREE.Vector3(s.cl.tan[3 * x], s.cl.tan[3 * x + 1], s.cl.tan[3 * x + 2]);
    scanQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), t.normalize());
  }
  return (
    <group position={s.origin} scale={sc}>
      <mesh geometry={strandA} material={M.backbone} />
      <mesh geometry={strandB} material={M.backboneB} />
      <primitive object={rungs} />
      {s.nucs.map((n) => {
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(n.e1, n.e2, n.e3));
        return <mesh key={n.id} geometry={coreGeo} material={M.core} position={n.C} quaternion={q} />;
      })}
      <mesh geometry={tails} material={M.tail} />
      {s.nucs.flatMap((n) =>
        n.tails.map((t, i) => {
          if (!t.mark || t.markScale <= 0) return null;
          const pts = tailPoints(n, t, f);
          const k = pts.length / 3 - 1;
          const pop = Math.min(1, t.markScale * 1.6) * (1 + 0.35 * Math.sin(Math.min(1, t.markScale) * Math.PI) * (1 - t.markScale));
          return <mesh key={`${n.id}-${i}`} geometry={markGeo} material={t.mark === 'ac' ? M.ac : M.me3} position={[pts[3 * k], pts[3 * k + 1], pts[3 * k + 2]]} scale={pop} />;
        }),
      )}
      <mesh geometry={stalks} material={methylMat} />
      {s.methyl.map((m, i) =>
        m.scale > 0 ? <mesh key={i} geometry={methylGeo} material={methylMat} position={m.tip.clone().sub(m.base).multiplyScalar(m.scale).add(m.base)} scale={Math.min(1, m.scale * 1.4)} /> : null,
      )}
      {scanPos && scanQuat ? <mesh geometry={scanGeo} material={scanMat} position={scanPos} quaternion={scanQuat} /> : null}
    </group>
  );
};
