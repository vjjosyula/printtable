import React, {useMemo} from 'react';
import {useStoryFrame} from '../lib/timeline';
import * as THREE from 'three';
import {useCurrentFrame} from 'remotion';
import {C} from '../lib/brand';
import {tubeGeometry} from '../lib/geom';
import {mulberry32, smoothstep} from '../lib/math';
import {NUCLEUS_CENTER, TISSUE_K} from './camera';
import {viewAt} from './view';
import {clay} from './materials';
import {MergeHelper} from './Chromatin';

export const NUCLEUS_R = 0.353 * TISSUE_K; // ~1200 units

/**
 * Chromatin fibres that fill the rest of the nucleus (static, built once): thin DNA strings in the
 * strand tints with sand nucleosome beads. Fibres hugging the envelope are drawn compact and in a
 * coral tint (repressed heterochromatin sits at the nuclear periphery); a sand nucleolus sits off-centre.
 */
const CORAL_TINT = C.coral;
function buildFibres() {
  const rnd = mulberry32(42);
  const strings: Record<string, THREE.BufferGeometry[]> = {[C.strandA]: [], [C.strandB]: [], [CORAL_TINT]: []};
  const beads: number[] = [];
  const inExclusion = (p: THREE.Vector3) =>
    p.x > -160 && p.x < 360 && Math.abs(p.y) < 120 && Math.abs(p.z) < 120;
  const inNucleolus = (p: THREE.Vector3) => p.distanceTo(NUCLEOLUS) < NUCLEOLUS_R + 20;
  for (let i = 0; i < 110; i++) {
    const peripheral = i < 34;
    const p = new THREE.Vector3();
    do {
      p.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).multiplyScalar(NUCLEUS_R * 0.9);
    } while (
      p.length() > NUCLEUS_R * 0.88 ||
      (peripheral && p.length() < NUCLEUS_R * 0.78) ||
      inExclusion(p) ||
      inNucleolus(p)
    );
    const dir = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    const pts: number[] = [];
    const steps = peripheral ? 300 : 420;
    const stepLen = peripheral ? 3.2 : 5;
    const wig = peripheral ? 0.7 : 0.35;
    let travelled = 0;
    for (let k = 0; k < steps; k++) {
      dir.x += (rnd() - 0.5) * wig;
      dir.y += (rnd() - 0.5) * wig;
      dir.z += (rnd() - 0.5) * wig;
      dir.normalize();
      const r = p.length();
      if (r > NUCLEUS_R * 0.9) dir.addScaledVector(p.clone().normalize(), -0.5).normalize();
      if (peripheral && r < NUCLEUS_R * 0.76) dir.addScaledVector(p.clone().normalize(), 0.5).normalize();
      if (inExclusion(p.clone().addScaledVector(dir, 30))) dir.y += p.y >= 0 ? 0.5 : -0.5;
      if (inNucleolus(p.clone().addScaledVector(dir, 20))) dir.addScaledVector(p.clone().sub(NUCLEOLUS).normalize(), 0.6);
      dir.normalize();
      p.addScaledVector(dir, stepLen);
      travelled += stepLen;
      const w = p.clone().add(NUCLEUS_CENTER);
      pts.push(w.x, w.y, w.z);
      if (travelled >= 22) {
        travelled = 0;
        beads.push(w.x, w.y, w.z);
      }
    }
    const col = peripheral ? CORAL_TINT : i % 2 ? C.strandA : C.strandB;
    strings[col].push(tubeGeometry(pts, 3.2, 6));
  }
  const merged = Object.fromEntries(
    Object.entries(strings).map(([c, gs]) => {
      const g = MergeHelper(gs);
      gs.forEach((x) => x.dispose());
      return [c, g];
    }),
  );
  return {merged, beads: new Float32Array(beads)};
}

const NUCLEOLUS = new THREE.Vector3(-380, 330, -420);
const NUCLEOLUS_R = 240;
let fibres: ReturnType<typeof buildFibres> | null = null;
const envelopeGeo = new THREE.SphereGeometry(NUCLEUS_R, 128, 96);
const poreGeo = new THREE.TorusGeometry(26, 9, 10, 24);
const beadGeo = new THREE.SphereGeometry(7.5, 12, 8);
beadGeo.scale(1, 1, 0.65);

// a touch deeper than the DNA tints so the fibres read against the light background during the dive
const stringMats = Object.fromEntries([C.strandA, C.strandB, CORAL_TINT].map((c) => [c, clay(new THREE.Color(c).multiplyScalar(0.82).getStyle())])) as Record<string, THREE.MeshPhysicalMaterial>;
const beadMat = clay('#D5CEAE');
const envMat = clay(C.panel, {side: THREE.DoubleSide});
const poreMat = clay(C.sand);
const nucleolusMat = clay(C.sand);
const clipPlane = new THREE.Plane();
[...Object.values(stringMats), beadMat, envMat, poreMat, nucleolusMat].forEach((m) => (m.clippingPlanes = [clipPlane]));
const nucleolusGeo = (() => {
  const g = new THREE.IcosahedronGeometry(NUCLEOLUS_R, 24);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const bump = 1 + 0.07 * Math.sin(n.x * 5 + n.y * 3) * Math.cos(n.z * 4 - n.x * 2) + 0.04 * Math.sin(n.y * 11 + n.z * 7);
    v.copy(n.multiplyScalar(NUCLEOLUS_R * bump));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
})();

export const Nucleus: React.FC = () => {
  const f = useStoryFrame();
  if (!fibres) fibres = buildFibres();
  const fb = fibres;
  const beads = useMemo(() => {
    const n = fb.beads.length / 3;
    const im = new THREE.InstancedMesh(beadGeo, beadMat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const rnd = mulberry32(5);
    for (let i = 0; i < n; i++) {
      q.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6));
      m.compose(new THREE.Vector3(fb.beads[3 * i], fb.beads[3 * i + 1], fb.beads[3 * i + 2]), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m);
    }
    return im;
  }, [fb]);
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

  const cam = viewAt(useCurrentFrame());
  // cut-away: remove the cap facing the camera while we are close, close it as we leave
  const n = cam.pos.clone().sub(NUCLEUS_CENTER).normalize();
  const cut = 0.2 + 0.9 * smoothstep(Math.log(9000), Math.log(30000), Math.log(cam.dist));
  const P0 = NUCLEUS_CENTER.clone().addScaledVector(n, NUCLEUS_R * cut);
  clipPlane.set(n.clone().negate(), n.dot(P0));
  // nucleus takes on the neuron colour once seen from outside the cell
  const out = smoothstep(Math.log(5000), Math.log(20000), Math.log(cam.dist));
  envMat.color.set(C.panel).lerp(new THREE.Color(C.magenta), out);
  const pulse = 1 + 0.035 * Math.sin((f - 400) * 0.16) * out;
  const visible = cam.dist < 60 ? false : true;
  return (
    <group visible={visible || f > 300}>
      {Object.entries(fb.merged).map(([c, g]) => (
        <mesh key={c} geometry={g} material={stringMats[c]} />
      ))}
      <primitive object={beads} />
      <mesh geometry={nucleolusGeo} material={nucleolusMat} position={NUCLEOLUS.clone().add(NUCLEUS_CENTER)} />
      <primitive object={pores} />
      <mesh geometry={envelopeGeo} material={envMat} position={NUCLEUS_CENTER} scale={pulse} />
    </group>
  );
};
