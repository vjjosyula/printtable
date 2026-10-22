import * as THREE from 'three';
import {MarchingCubes} from 'three/examples/jsm/objects/MarchingCubes.js';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Tube along a polyline with rotation-minimising frames.
 * radius may be a constant or a function of the normalised position along the tube.
 */
export function tubeGeometry(
  pts: Float32Array | number[],
  radius: number | ((u: number) => number),
  radial = 8,
  caps = true,
): THREE.BufferGeometry {
  const n = Math.floor(pts.length / 3);
  const geo = new THREE.BufferGeometry();
  if (n < 2) return geo;
  const ring = radial + 1;
  const vcount = n * ring + (caps ? 2 : 0);
  const pos = new Float32Array(vcount * 3);
  const nor = new Float32Array(vcount * 3);
  const idx: number[] = [];
  let Nx = 0,
    Ny = 0,
    Nz = 0;
  let px = 0,
    py = 0,
    pz = 0;
  const tangentAt = (k: number) => {
    const a = Math.max(0, k - 1);
    const b = Math.min(n - 1, k + 1);
    let x = pts[3 * b] - pts[3 * a];
    let y = pts[3 * b + 1] - pts[3 * a + 1];
    let z = pts[3 * b + 2] - pts[3 * a + 2];
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  };
  for (let k = 0; k < n; k++) {
    const [tx, ty, tz] = tangentAt(k);
    if (k === 0) {
      // any vector not parallel to t
      const ax = Math.abs(tx) < 0.8 ? 1 : 0;
      const ay = ax ? 0 : 1;
      // N = normalize(a - (a.t) t)
      const d = ax * tx + ay * ty;
      Nx = ax - d * tx;
      Ny = ay - d * ty;
      Nz = -d * tz;
    } else {
      const d = Nx * tx + Ny * ty + Nz * tz;
      Nx -= d * tx;
      Ny -= d * ty;
      Nz -= d * tz;
    }
    const l = Math.hypot(Nx, Ny, Nz) || 1;
    Nx /= l;
    Ny /= l;
    Nz /= l;
    const Bx = ty * Nz - tz * Ny;
    const By = tz * Nx - tx * Nz;
    const Bz = tx * Ny - ty * Nx;
    const r = typeof radius === 'number' ? radius : radius(k / (n - 1));
    px = pts[3 * k];
    py = pts[3 * k + 1];
    pz = pts[3 * k + 2];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const nx = c * Nx + s * Bx;
      const ny = c * Ny + s * By;
      const nz = c * Nz + s * Bz;
      const vi = (k * ring + j) * 3;
      pos[vi] = px + r * nx;
      pos[vi + 1] = py + r * ny;
      pos[vi + 2] = pz + r * nz;
      nor[vi] = nx;
      nor[vi + 1] = ny;
      nor[vi + 2] = nz;
    }
    if (k < n - 1) {
      for (let j = 0; j < radial; j++) {
        const a = k * ring + j;
        const b = (k + 1) * ring + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  if (caps) {
    for (const end of [0, 1]) {
      const k = end ? n - 1 : 0;
      const [tx, ty, tz] = tangentAt(k);
      const ci = n * ring + end;
      const sgn = end ? 1 : -1;
      const r = typeof radius === 'number' ? radius : radius(end);
      pos[ci * 3] = pts[3 * k] + sgn * tx * r * 0.9;
      pos[ci * 3 + 1] = pts[3 * k + 1] + sgn * ty * r * 0.9;
      pos[ci * 3 + 2] = pts[3 * k + 2] + sgn * tz * r * 0.9;
      nor[ci * 3] = sgn * tx;
      nor[ci * 3 + 1] = sgn * ty;
      nor[ci * 3 + 2] = sgn * tz;
      for (let j = 0; j < radial; j++) {
        const a = k * ring + j;
        if (end) idx.push(a, a + 1, ci);
        else idx.push(a + 1, a, ci);
      }
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(vcount > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  return geo;
}

/* ------------------------------------------------------------------ */
/* Signed distance helpers and an SDF mesher (marching cubes)          */
/* ------------------------------------------------------------------ */
export type SDF = (x: number, y: number, z: number) => number;
export const sdSphere = (cx: number, cy: number, cz: number, r: number): SDF => (x, y, z) =>
  Math.hypot(x - cx, y - cy, z - cz) - r;
export const sdEllipsoid = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): SDF => (x, y, z) => {
  const px = (x - cx) / rx;
  const py = (y - cy) / ry;
  const pz = (z - cz) / rz;
  const k0 = Math.hypot(px, py, pz);
  const k1 = Math.hypot(px / rx, py / ry, pz / rz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
};
export const sdCapsule = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): SDF => (x, y, z) => {
  const pax = x - ax,
    pay = y - ay,
    paz = z - az;
  const bax = bx - ax,
    bay = by - ay,
    baz = bz - az;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
};
export const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
};
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);
export const unionS = (k: number, ...fs: SDF[]): SDF => (x, y, z) => {
  let d = fs[0](x, y, z);
  for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y, z), k);
  return d;
};

const meshMaterial = new THREE.MeshBasicMaterial();
/** Polygonise an SDF inside an axis-aligned box centred on `center` with half-size `extent`. */
export function sdfMesh(sdf: SDF, center: THREE.Vector3, extent: number, res = 64): THREE.BufferGeometry {
  const mc = new MarchingCubes(res, meshMaterial, false, false, 200000);
  mc.isolation = 0;
  const size = mc.size;
  const half = size / 2;
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const wx = center.x + ((x - half) / half) * extent;
        const wy = center.y + ((y - half) / half) * extent;
        const wz = center.z + ((z - half) / half) * extent;
        mc.field[x + y * size + z * size * size] = -sdf(wx, wy, wz);
      }
  mc.update();
  const count = mc.count;
  const src = mc.geometry.attributes.position.array as Float32Array;
  const srcN = mc.geometry.attributes.normal.array as Float32Array;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[3 * i] = center.x + src[3 * i] * extent;
    pos[3 * i + 1] = center.y + src[3 * i + 1] * extent;
    pos[3 * i + 2] = center.z + src[3 * i + 2] * extent;
    nor[3 * i] = srcN[3 * i];
    nor[3 * i + 1] = srcN[3 * i + 1];
    nor[3 * i + 2] = srcN[3 * i + 2];
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  mc.geometry.dispose();
  return g;
}
