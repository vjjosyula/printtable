import * as THREE from 'three';

export const FPS = 30;
export const TOTAL_FRAMES = 960;

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack = (t: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Eased 0..1 ramp between frames a and b. */
export const ramp = (f: number, a: number, b: number, ease: (t: number) => number = easeInOutCubic) =>
  ease(clamp((f - a) / (b - a)));

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Non-uniform Catmull-Rom spline over keyed values (zero velocity at the ends). */
export function spline(keys: [number, number][], t: number): number {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && t > keys[i + 1][0]) i++;
  const [t0, p0] = keys[i];
  const [t1, p1] = keys[i + 1];
  const slope = (j: number) => {
    if (j <= 0 || j >= n - 1) return 0;
    return (keys[j + 1][1] - keys[j - 1][1]) / (keys[j + 1][0] - keys[j - 1][0]);
  };
  const h = t1 - t0;
  const m0 = slope(i) * h;
  const m1 = slope(i + 1) * h;
  const s = (t - t0) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
}

export function splineV(keys: [number, [number, number, number]][], t: number): THREE.Vector3 {
  const k = (c: number) => keys.map(([tt, v]) => [tt, v[c]] as [number, number]);
  return new THREE.Vector3(spline(k(0), t), spline(k(1), t), spline(k(2), t));
}

export const hex = (c: string) => new THREE.Color(c);
