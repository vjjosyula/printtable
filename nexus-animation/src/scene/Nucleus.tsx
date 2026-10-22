import React, {useMemo} from 'react';
import * as THREE from 'three';
import {useCurrentFrame} from 'remotion';
import {C} from '../lib/brand';
import {tubeGeometry} from '../lib/geom';
import {mulberry32, smoothstep} from '../lib/math';
import {cameraAt, NUCLEUS_CENTER, TISSUE_K} from './camera';
import {clay} from './materials';
import {MergeHelper} from './Chromatin';

export const NUCLEUS_R = 0.353 * TISSUE_K; // ~1200 units

/** Chromatin fibres that fill the rest of the nucleus (static, built once). */
function buildFibres() {
  const rnd = mulberry32(42);
  const geos: THREE.BufferGeometry[] = [];
  const inExclusion = (p: THREE.Vector3) =>
    p.x > -160 && p.x < 360 && Math.abs(p.y) < 120 && Math.abs(p.z) < 120;
  for (let i = 0; i < 80; i++) {
    // random smooth walk inside the sphere
    const p = new THREE.Vector3();
    do {
      p.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).multiplyScalar(NUCLEUS_R * 0.9);
    } while (p.length() > NUCLEUS_R * 0.88 || inExclusion(p));
    const dir = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    const pts: number[] = [];
    const steps = 420;
    for (let k = 0; k < steps; k++) {
      dir.x += (rnd() - 0.5) * 0.35;
      dir.y += (rnd() - 0.5) * 0.35;
      dir.z += (rnd() - 0.5) * 0.35;
      dir.normalize();
      // stay inside the nucleus and out of the hero region
      if (p.length() > NUCLEUS_R * 0.86) dir.addScaledVector(p.clone().normalize(), -0.4).normalize();
      if (inExclusion(p.clone().addScaledVector(dir, 30))) dir.y += p.y >= 0 ? 0.5 : -0.5;
      dir.normalize();
      p.addScaledVector(dir, 5);
      pts.push(p.x + NUCLEUS_CENTER.x, p.y + NUCLEUS_CENTER.y, p.z + NUCLEUS_CENTER.z);
    }
    // beaded fibre: radius modulated like nucleosomes on a string
    const len = steps * 5;
    geos.push(tubeGeometry(pts, (u) => 6.5 + 3.5 * Math.max(0, Math.sin((u * len * 2 * Math.PI) / 24)), 7));
  }
  const g = MergeHelper(geos);
  geos.forEach((x) => x.dispose());
  return g;
}

let fibreGeo: THREE.BufferGeometry | null = null;
const envelopeGeo = new THREE.SphereGeometry(NUCLEUS_R, 128, 96);
const poreGeo = new THREE.TorusGeometry(26, 9, 10, 24);

const fibreMat = clay(C.sand);
const envMat = clay(C.panel, {side: THREE.DoubleSide});
const poreMat = clay(C.sand);
const clipPlane = new THREE.Plane();
[fibreMat, envMat, poreMat].forEach((m) => (m.clippingPlanes = [clipPlane]));

export const Nucleus: React.FC = () => {
  const f = useCurrentFrame();
  if (!fibreGeo) fibreGeo = buildFibres();
  const pores = useMemo(() => {
    const rnd = mulberry32(9);
    const n = 320;
    const im = new THREE.InstancedMesh(poreGeo, poreMat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v);
      m.compose(v.clone().multiplyScalar(NUCLEUS_R).add(NUCLEUS_CENTER), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m);
    }
    return im;
  }, []);

  const cam = cameraAt(f);
  // cut-away: remove the cap facing the camera while we are close, close it as we leave
  const n = cam.pos.clone().sub(NUCLEUS_CENTER).normalize();
  const cut = 0.2 + 0.9 * smoothstep(Math.log(9000), Math.log(30000), Math.log(cam.dist));
  const P0 = NUCLEUS_CENTER.clone().addScaledVector(n, NUCLEUS_R * cut);
  clipPlane.set(n.clone().negate(), n.dot(P0));
  // nucleus takes on the neuron colour once seen from outside the cell
  const out = smoothstep(Math.log(5000), Math.log(20000), Math.log(cam.dist));
  envMat.color.set(C.panel).lerp(new THREE.Color(C.blue), out);
  const pulse = 1 + 0.035 * Math.sin((f - 400) * 0.16) * out;
  const visible = cam.dist < 60 ? false : true;
  return (
    <group visible={visible || f > 300}>
      <mesh geometry={fibreGeo} material={fibreMat} />
      <primitive object={pores} />
      <mesh geometry={envelopeGeo} material={envMat} position={NUCLEUS_CENTER} scale={pulse} />
    </group>
  );
};
