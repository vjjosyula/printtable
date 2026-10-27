import * as THREE from 'three';
import {smoothstep, easeInOutCubic, clamp} from '../lib/math';
import {FPS, INTRO_END, STORY_STOP_S, storyFrame} from '../lib/timeline';
import {cameraAt, CamState, viewOffsetY} from './camera';

/**
 * Camera for the whole film, on video time:
 * - 0..DIVE_IN: brain tissue overview (story camera at tissue scale), then the dive into one neuron
 *   (the original pull-back played in reverse) down to the start of the chromatin story;
 * - INTRO_END..GAP_T0: the chromatin story camera;
 * - after GAP_T0: the kit stage (HisTLAND, methylation, MeTLAND, labs, two layers), staged next to the chromatin.
 */
export const GAP_T0 = STORY_STOP_S;
const GLIDE = 1.6; // seconds from the end of the chromatin story to the first kit scene
const DIVE_IN = 14.8; // start of the dive into the neuron

/** World position of the kit stage: in the same nucleus, beside the chromatin, away from the chain. */
const ORIGIN = new THREE.Vector3(0, -40, -260);
export const gapOrigin = () => ORIGIN;

/** Kit-stage layout (local x of each scene). */
export const STAGE = {histland: 0, methyl: 150, metland: 300, labs: 520, layers: 760};

type K3 = [number, [number, number, number]];
type K1 = [number, number];

/** Eased segments between keys (zero velocity at every key): no overshoot before the moves between scenes. */
function spline(keys: K1[], t: number) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i];
    const [t1, b] = keys[i + 1];
    if (t <= t1) return a + (b - a) * easeInOutCubic((t - t0) / (t1 - t0));
  }
  return keys[keys.length - 1][1];
}
const splineV = (keys: K3[], t: number) => {
  const k = (c: number) => keys.map(([tt, v]) => [tt, v[c]] as K1);
  return new THREE.Vector3(spline(k(0), t), spline(k(1), t), spline(k(2), t));
};

// kit-stage camera keys: [video s, target (stage-local), distance, yaw, pitch]
const KEYS: [number, [number, number, number], number, number, number][] = [
  [41.8, [2, -1, 0], 82, -0.3, 0.25],
  [49.2, [4, -1, 0], 77, -0.15, 0.2],
  [50.9, [150, -1, 0], 72, -0.45, 0.3],
  [55.4, [152, 0, 0], 62, -0.3, 0.25],
  [57.0, [299, -2, 0], 84, -0.25, 0.22],
  [65.4, [300, -1, 0], 80, -0.1, 0.18],
  [67.2, [520, -2, 0], 150, -0.1, 0.52],
  [77.0, [520, 0, 0], 138, 0.35, 0.46],
  [78.9, [762, -1, 0], 88, -0.2, 0.22],
  [84.6, [763, 0, 0], 82, -0.05, 0.18],
  [86.2, [763, 2, 0], 104, 0, 0.14],
  [90.0, [763, 2, 0], 106, 0, 0.14],
];
const TGT: K3[] = KEYS.map(([t, p]) => [t, p]);
const LOGD: K1[] = KEYS.map(([t, , d]) => [t, Math.log(d)]);
const YAW: K1[] = KEYS.map(([t, , , y]) => [t, y]);
const PITCH: K1[] = KEYS.map(([t, , , , p]) => [t, p]);

const fromAngles = (target: THREE.Vector3, dist: number, yaw: number, pitch: number): CamState => {
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  return {pos: target.clone().addScaledVector(dir, dist), target, dist, fov: 34};
};
function stageCam(t: number): CamState {
  return fromAngles(splineV(TGT, t).add(ORIGIN), Math.exp(spline(LOGD, t)), spline(YAW, t), spline(PITCH, t));
}

/** Blend two camera states: target and view direction eased, distance in log space. */
function blendCam(a: CamState, b: CamState, u: number): CamState {
  const e = easeInOutCubic(clamp(u));
  const dirA = a.pos.clone().sub(a.target).normalize();
  const dirB = b.pos.clone().sub(b.target).normalize();
  const dir = dirA.lerp(dirB, e).normalize();
  const target = a.target.clone().lerp(b.target, e);
  const dist = Math.exp(THREE.MathUtils.lerp(Math.log(a.dist), Math.log(b.dist), e));
  return {pos: target.clone().addScaledVector(dir, dist), target, dist, fov: 34};
}

/** Camera for a video frame. */
export function viewAt(videoFrame: number): CamState {
  const t = videoFrame / FPS;
  // open wide on the tissue and drift slowly inwards, so the film eases in instead of starting mid-scene
  if (t < DIVE_IN) return cameraAt(522 + 68 * easeInOutCubic(t / DIVE_IN));
  if (t < INTRO_END - 1.6) {
    // dive into the neuron: the original pull-back (story 430..590) in reverse
    const u = (t - DIVE_IN) / (INTRO_END - 1.6 - DIVE_IN);
    return cameraAt(590 - 160 * easeInOutCubic(u));
  }
  if (t < INTRO_END) return blendCam(cameraAt(430), cameraAt(0), (t - (INTRO_END - 1.6)) / 1.6);
  if (t <= GAP_T0) return cameraAt(storyFrame(videoFrame));
  if (t >= GAP_T0 + GLIDE) return stageCam(t);
  return blendCam(cameraAt(storyFrame(videoFrame)), stageCam(GAP_T0 + GLIDE), (t - GAP_T0) / GLIDE);
}

/** Vertical field of view: tall frames keep the 4:5 horizontal view and see more above and below. */
export function fovFor(aspect: number, base = 34) {
  if (aspect >= 0.8) return base;
  const h = Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) * 0.8);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h) / aspect));
}

/** Vertical framing offset (fraction of the frame height). */
export function offsetAt(videoFrame: number) {
  const t = videoFrame / FPS;
  if (t <= GAP_T0) return viewOffsetY(0);
  // lifted above the end-card text at the end
  return 0.085 - 0.215 * smoothstep(84.8, 86.4, t);
}
