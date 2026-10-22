import * as THREE from 'three';
import {smoothstep, easeInOutCubic, clamp} from '../lib/math';
import {FPS, storyFrame} from '../lib/timeline';
import {cameraAt, CamState, NUCLEUS_CENTER, TISSUE_K, viewOffsetY} from './camera';
import {repCell} from './Tissue';

/**
 * From GAP_T0 (video seconds) the film leaves the story clock: the camera dives into one neuron's nucleus,
 * where the "gap" beats, the kit hand-off and the kit cards are staged in one continuous space (video-time driven).
 */
export const GAP_T0 = 41.2;
const DIVE = 2.4; // seconds to reach the first gap vignette

let origin: THREE.Vector3 | null = null;
/** World position of the gap stage: inside the nucleus of the labelled neuron. */
export function gapOrigin() {
  if (!origin) {
    const c = repCell('neuron');
    const off = new THREE.Vector3(c.nucleusOff.x, c.nucleusOff.y, c.nucleusOff.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.rot);
    origin = c.pos.clone().add(off).multiplyScalar(TISSUE_K).add(NUCLEUS_CENTER);
  }
  return origin;
}

type K3 = [number, [number, number, number]];
type K1 = [number, number];

/** Eased segments between keys (zero velocity at every key): no overshoot before the big moves between beats. */
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

// gap camera keys (video seconds, stage-local target)
const TGT: K3[] = [
  [43.6, [0, -1, 0]],
  [45.4, [0, 0, 0]],
  [47.4, [-3, -3, 0]],
  [49.0, [70, 3, 0]],
  [51.0, [71, 3, 0]],
  [52.4, [150, 0, 0]],
  [55.0, [168, 6, 0]],
  [57.9, [176, 32, 0]],
  [59.4, [360, 0, 0]],
  [64.8, [360, 0, 0]],
  [70.0, [360, 2, 0]],
  [74.8, [360, 2, 0]],
  [76.2, [562, -2, 0]],
  [79.9, [564, -1, 0]],
  [81.0, [705, -2, 0]],
  [84.6, [706, -1, 0]],
  [86.2, [706, 1, 0]],
  [90.0, [706, 1, 0]],
];
const LOGD: K1[] = [
  [43.6, Math.log(78)],
  [45.4, Math.log(62)],
  [47.4, Math.log(58)],
  [49.0, Math.log(92)],
  [51.0, Math.log(96)],
  [52.4, Math.log(92)],
  [55.0, Math.log(115)],
  [57.9, Math.log(205)],
  [59.4, Math.log(250)],
  [64.8, Math.log(215)],
  [67.0, Math.log(205)],
  [74.8, Math.log(225)],
  [76.2, Math.log(82)],
  [79.9, Math.log(77)],
  [81.0, Math.log(78)],
  [84.6, Math.log(82)],
  [86.2, Math.log(104)],
  [90.0, Math.log(106)],
];
const YAW: K1[] = [
  [43.6, -0.5],
  [45.4, -0.35],
  [47.4, -0.2],
  [49.0, 0],
  [51.0, 0.05],
  [52.4, -0.25],
  [55.0, -0.15],
  [57.9, -0.05],
  [59.4, -0.1],
  [64.8, 0.15],
  [70.0, 0.3],
  [74.8, 0.4],
  [76.2, -0.3],
  [79.9, -0.15],
  [81.0, -0.25],
  [84.6, -0.1],
  [86.2, 0],
  [90.0, 0],
];
const PITCH: K1[] = [
  [43.6, 0.32],
  [45.4, 0.25],
  [47.4, 0.2],
  [49.0, 0.12],
  [51.0, 0.12],
  [52.4, 0.2],
  [55.0, 0.18],
  [57.9, 0.12],
  [59.4, 0.62],
  [64.8, 0.58],
  [70.0, 0.55],
  [74.8, 0.5],
  [76.2, 0.25],
  [79.9, 0.2],
  [81.0, 0.22],
  [84.6, 0.18],
  [86.2, 0.14],
  [90.0, 0.14],
];

function gapCam(t: number): CamState & {yaw: number; pitch: number} {
  const target = splineV(TGT, t).add(gapOrigin());
  const dist = Math.exp(spline(LOGD, t));
  const yaw = spline(YAW, t);
  const pitch = spline(PITCH, t);
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  return {pos: target.clone().addScaledVector(dir, dist), target, dist, fov: 34, yaw, pitch};
}

/** Camera for a video frame (identical to the story camera before the dive). */
export function viewAt(videoFrame: number): CamState {
  const t = videoFrame / FPS;
  const sf = storyFrame(videoFrame);
  if (t <= GAP_T0) return cameraAt(sf);
  const g = gapCam(Math.max(t, GAP_T0 + DIVE));
  if (t >= GAP_T0 + DIVE) return g;
  // dive: pan onto the neuron, then fall through log-distance into the nucleus
  const u = clamp((t - GAP_T0) / DIVE);
  const s = cameraAt(sf);
  const toDir = (p: THREE.Vector3, q: THREE.Vector3) => p.clone().sub(q).normalize();
  const dir = toDir(s.pos, s.target).lerp(toDir(g.pos, g.target), easeInOutCubic(smoothstep(0.2, 1, u))).normalize();
  const target = s.target.clone().lerp(g.target, easeInOutCubic(smoothstep(0, 0.5, u)));
  const dist = Math.exp(THREE.MathUtils.lerp(Math.log(s.dist), Math.log(g.dist), easeInOutCubic(smoothstep(0.1, 1, u))));
  return {pos: target.clone().addScaledVector(dir, dist), target, dist, fov: 34};
}

/** Vertical framing offset (fraction of the frame height). */
export function offsetAt(videoFrame: number) {
  const t = videoFrame / FPS;
  if (t <= GAP_T0) return viewOffsetY(storyFrame(videoFrame));
  // centred a little lower during the gap beats, lifted above the end-card text at the end
  return 0.085 - 0.215 * smoothstep(84.8, 86.4, t);
}
