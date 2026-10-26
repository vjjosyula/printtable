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
  wash(w * 0.5, h * 0.5, Math.max(w, h) * 0.9, C.panel, 0); // keep centre clean
  wash(-w * 0.05, -h * 0.02, w * 0.85, C.blue, 0.10);
  wash(w * 1.05, h * 0.35, w * 0.7, C.teal, 0.08);
  wash(w * 0.15, h * 1.02, w * 0.9, C.sand, 0.55);
  // vignette to the light panel colour at the edges
  const v = g.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.35, w / 2, h * 0.48, Math.max(w, h) * 0.8);
  v.addColorStop(0, 'rgba(244,241,236,0)');
  v.addColorStop(1, 'rgba(244,241,236,0.9)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/**
 * Deep NEXUS-blue backdrop used while the camera is among the cells. It crossfades in after we leave the
 * neuron and back out as the signal tracks rise, so tracks and text always sit on the light background.
 */
export const darkAmount = (f: number) => {
  const sm = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  void sm;
  void f;
  return 0; // light throughout (no deep blue tissue backdrop)
};
export const DARK_CENTER = new THREE.Color(C.blue).lerp(new THREE.Color(C.bg), 0.08);
export const DARK_EDGE = new THREE.Color(C.blue).lerp(new THREE.Color(C.charcoal), 0.55);
