import * as THREE from 'three';
import {coreDirToWorld, coreToWorld, Nuc, Tail} from '../lib/chromatin';

/** World-space points of a flexible histone tail at frame f. */
export function tailPoints(n: Nuc, tail: Tail, f: number, count = 22): Float32Array {
  const base = coreToWorld(n, tail.anchor);
  const dir = coreDirToWorld(n, tail.dir);
  const helper = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const p1 = new THREE.Vector3().crossVectors(dir, helper).normalize();
  const p2 = new THREE.Vector3().crossVectors(dir, p1).normalize();
  // gentle sway of the whole tail
  const sw = 0.28 * Math.sin(f * 0.045 + tail.phase);
  const sw2 = 0.22 * Math.cos(f * 0.037 + tail.phase * 1.7);
  const d = dir.clone().addScaledVector(p1, sw).addScaledVector(p2, sw2).normalize();
  const out = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  for (let k = 0; k < count; k++) {
    const u = k / (count - 1);
    const wave = Math.sin(u * 5.2 + f * 0.09 + tail.phase) * 0.75 * Math.pow(u, 1.2);
    const wave2 = Math.cos(u * 3.7 + f * 0.07 + tail.phase * 0.6) * 0.55 * Math.pow(u, 1.2);
    p.copy(base)
      .addScaledVector(d, tail.len * u)
      .addScaledVector(p1, wave)
      .addScaledVector(p2, wave2);
    out[3 * k] = p.x;
    out[3 * k + 1] = p.y;
    out[3 * k + 2] = p.z;
  }
  return out;
}

export function tailTip(n: Nuc, tail: Tail, f: number) {
  const pts = tailPoints(n, tail, f, 22);
  const k = pts.length / 3 - 1;
  const tip = new THREE.Vector3(pts[3 * k], pts[3 * k + 1], pts[3 * k + 2]);
  const prev = new THREE.Vector3(pts[3 * k - 3], pts[3 * k - 2], pts[3 * k - 1]);
  return {tip, dir: tip.clone().sub(prev).normalize()};
}
