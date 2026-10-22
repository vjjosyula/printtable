import * as THREE from 'three';
import {C} from '../lib/brand';

/**
 * Soft brand-colour backdrop: warm off-white centre, light panel edges and very faint washes of
 * denim, teal and sand in the corners. Bright and airy, never dark.
 */
const cache = new Map<string, THREE.Texture>();
export function brandBackground(w: number, h: number) {
  const key = `${w}x${h}`;
  if (cache.has(key)) return cache.get(key)!;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = C.bg;
  g.fillRect(0, 0, w, h);
  const wash = (x: number, y: number, r: number, color: string, alpha: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const rgb = new THREE.Color(color);
    const s = `${Math.round(rgb.r * 255)},${Math.round(rgb.g * 255)},${Math.round(rgb.b * 255)}`;
    grad.addColorStop(0, `rgba(${s},${alpha})`);
    grad.addColorStop(1, `rgba(${s},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  };
  // deep warm charcoal with a slightly lighter haze towards the centre (the distance)
  const v = g.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.max(w, h) * 0.75);
  v.addColorStop(0, C.haze);
  v.addColorStop(1, C.bg);
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  void wash;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/**
 * Deep NEXUS-blue backdrop used while the camera is among the cells. It crossfades in after we leave the
 * neuron and back out as the signal tracks rise, so tracks and text always sit on the light background.
 */
export const darkAmount = (_f: number) => {
  return 0;
}
export const _unusedDark = (f: number) => {
  const sm = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return sm(468, 520, f) * (1 - sm(586, 632, f));
};
export const DARK_CENTER = new THREE.Color(C.haze);
export const DARK_EDGE = new THREE.Color(C.bg);
