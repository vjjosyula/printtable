import * as THREE from 'three';
import {mulberry32} from './math';
import {sdEllipsoid, sdSphere, sdfMesh, smax, smin, SDF} from './geom';

const cache = new Map<string, THREE.BufferGeometry>();
const once = (key: string, make: () => THREE.BufferGeometry) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key)!;
};

/** Histone octamer: eight slightly flattened spheres fused into a squat disc (axis = local z). */
export const histoneCoreGeometry = () =>
  once('core', () => {
    const parts: SDF[] = [];
    for (let layer = 0; layer < 2; layer++) {
      const z = layer ? 1.25 : -1.25;
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + (layer ? Math.PI / 4 : 0) + 0.2;
        parts.push(sdEllipsoid(2.05 * Math.cos(a), 2.05 * Math.sin(a), z, 2.25, 2.25, 1.55));
      }
    }
    const sdf: SDF = (x, y, z) => {
      let d = parts[0](x, y, z);
      for (let i = 1; i < parts.length; i++) d = smin(d, parts[i](x, y, z), 0.9);
      return d;
    };
    return sdfMesh(sdf, new THREE.Vector3(0, 0, 0), 5.6, 56);
  });

/** Writer enzyme (a histone acetyltransferase): a rounded multi-lobed blob ~ the size of a core. */
export const writerGeometry = () =>
  once('writer', () => {
    const rnd = mulberry32(7);
    const lobes: SDF[] = [sdSphere(0, 0, 0, 3.4)];
    const pts = [
      [2.6, 1.4, 0.6, 2.4],
      [-2.4, 1.6, -0.8, 2.3],
      [0.4, -2.3, 1.8, 2.2],
      [-0.6, 0.6, 2.8, 2.0],
      [1.2, -1.0, -2.6, 2.1],
    ];
    pts.forEach(([x, y, z, r]) => lobes.push(sdSphere(x + rnd() * 0.3, y, z, r)));
    const sdf: SDF = (x, y, z) => {
      let d = lobes[0](x, y, z);
      for (let i = 1; i < lobes.length; i++) d = smin(d, lobes[i](x, y, z), 1.4);
      // shallow docking pocket on the -y side, where the tail binds
      d = smax(d, -sdSphere(0, -5.6, 0, 2.2)(x, y, z), 0.8);
      return d;
    };
    return sdfMesh(sdf, new THREE.Vector3(0, 0, 0), 7.5, 56);
  });

/*
 * RNA polymerase II, simplified: a large rounded body with a DNA channel along local x
 * through the origin, a cleft open towards local -y, and a separate clamp lobe that closes the cleft.
 */
const POL_BODY: SDF = (x, y, z) => {
  let d = sdEllipsoid(0, 3.2, 0, 10.5, 9.0, 9.0)(x, y, z);
  d = smin(d, sdSphere(-3.5, 7.5, 3.0, 5.2)(x, y, z), 2.5);
  d = smin(d, sdSphere(4.0, 6.0, -3.5, 5.0)(x, y, z), 2.5);
  d = smin(d, sdSphere(1.0, -1.5, 5.2, 4.2)(x, y, z), 2.0);
  // DNA channel
  const chan = Math.hypot(y, z) - 2.2;
  d = smax(d, -chan, 0.7);
  // cleft: slot from the channel down to the underside
  const slot = Math.max(Math.abs(z + 0.4) - 2.5, y - 0.2);
  d = smax(d, -slot, 0.8);
  // remove the clamp region (rendered separately)
  const clampRegion = Math.max(-z - 2.4, y - 1.2);
  d = smax(d, -clampRegion, 0.6);
  return d;
};
export const POL_CLAMP_PIVOT = new THREE.Vector3(0, 1.5, -2.6);
const POL_CLAMP: SDF = (x, y, z) => {
  let d = sdEllipsoid(0, -1.4, -6.0, 8.0, 4.6, 4.0)(x, y, z);
  d = smin(d, sdSphere(0, -3.7, -2.6, 2.6)(x, y, z), 1.5);
  const chan = Math.hypot(y, z) - 2.4;
  d = smax(d, -chan, 0.6);
  d = smax(d, -(z + 0.3), 0.6);
  return d;
};
export const polBodyGeometry = () => once('polBody', () => sdfMesh(POL_BODY, new THREE.Vector3(0, 3, 0), 15, 72));
export const polClampGeometry = () => once('polClamp', () => sdfMesh(POL_CLAMP, new THREE.Vector3(0, -1, -5), 10, 56));
/** Local position where the nascent RNA leaves the enzyme. */
export const POL_RNA_EXIT = new THREE.Vector3(-6.5, 4.5, 6.0);
