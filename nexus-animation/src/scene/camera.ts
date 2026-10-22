import * as THREE from 'three';
import {spline, splineV} from '../lib/math';

/**
 * One continuous camera journey. The camera is described by a look-at target,
 * a direction (yaw/pitch around the target) and a distance that is keyframed in log space,
 * so the pull-back from nanometres to tissue scale feels uniform.
 */
type Key3 = [number, [number, number, number]];
type Key1 = [number, number];

// frames
const TARGET_NEAR: Key3[] = [
  [0, [0, -1, 0]],
  [60, [0, -3, 0]],
  [100, [6, -1, 0]],
  [140, [16, 0, 1]],
  [178, [18, 2, 2]],
  [208, [85, 0, 1]],
  [236, [87, 0, 1]],
  [262, [90, 2, 0]],
  [292, [94, 2, -2]],
  [326, [84, 1, 7]],
  [340, [88, 4, 9]],
  [364, [214, 9, 15]],
  [392, [214, 10, 16]]
];
const DIST: Key1[] = [
  [0, Math.log(20)],
  [60, Math.log(30)],
  [100, Math.log(55)],
  [140, Math.log(80)],
  [178, Math.log(90)],
  [208, Math.log(56)],
  [236, Math.log(54)],
  [262, Math.log(54)],
  [292, Math.log(68)],
  [326, Math.log(62)],
  [340, Math.log(58)],
  [364, Math.log(142)],
  [392, Math.log(152)],
  [430, Math.log(420)],
  [470, Math.log(2600)],
  [510, Math.log(16000)],
  [552, Math.log(64000)],
  [590, Math.log(86000)],
  [650, Math.log(98000)],
  [720, Math.log(104000)],
  [800, Math.log(96000)],
  [840, Math.log(92000)],
  [880, Math.log(60000)],
  [902, Math.log(5000)],
  [925, Math.log(330)],
  [975, Math.log(80)],
  [1140, Math.log(70)],
  [1320, Math.log(90)],
  [1450, Math.log(118)],
  [1590, Math.log(118)]
];
const YAW: Key1[] = [
  [0, 0.25],
  [60, -0.4],
  [100, -0.7],
  [140, -1.05],
  [178, -1.15],
  [208, -1.05],
  [236, -1.1],
  [262, -1.35],
  [292, -1.2],
  [326, -0.25],
  [340, -0.35],
  [364, -0.45],
  [392, -0.5],
  [470, -0.3],
  [560, -0.1],
  [700, 0],
  [860, 0],
  [975, -0.55],
  [1140, -0.25],
  [1320, 0.2],
  [1450, 0.05],
  [1590, 0.0]
];
const PITCH: Key1[] = [
  [0, 0.1],
  [60, 0.15],
  [100, 0.2],
  [178, 0.3],
  [208, 0.28],
  [292, 0.3],
  [392, 0.36],
  [470, 0.62],
  [560, 0.86],
  [600, 0.82],
  [680, 0.4],
  [760, 0.22],
  [860, 0.12],
  [975, 0.3],
  [1320, 0.22],
  [1450, 0.12],
  [1590, 0.12]
];

/** Tissue-scale targets live in world units (tissue scale K applied). */
export const TISSUE_K = 3400;
export const NUCLEUS_CENTER = new THREE.Vector3(110, 0, 0);
export const TECH_WORLD = () => TECH_ORIGIN.clone().multiplyScalar(TISSUE_K).add(NUCLEUS_CENTER);
const TARGET_FAR: Key3[] = [
  [430, [0, 0, 0]],
  [560, [0, 0.2, 0]],
  [580, [0, 2.0, 0]],
  [605, [0, 7.5, 0]],
  [640, [0, 10.0, 0]],
  [720, [0, 10.5, 0]],
  [780, [0, 9.5, 0]],
  [820, [0, 9.0, 0]],
  [880, [-4.08, 14.0, 0.5]],
];

/** Where the kit finale lives: in front of the neuron track's tallest peak (tissue units). */
export const TECH_ORIGIN = new THREE.Vector3(-4.08, 14.0, 0.5);
const TECH_TARGET: Key3[] = [
  [860, [0, 0, 0]],
  [975, [0, -2, 0]],
  [1320, [2, -2, 0]],
  [1450, [0, 2, 0]],
  [1590, [0, 2, 0]],
];

/** Vertical framing: subjects sit below the caption band, and rise above the end-card text. */
export const viewOffsetY = (f: number) => 0.085 - 0.215 * THREE.MathUtils.smoothstep(f, 1400, 1470);

export type CamState = {pos: THREE.Vector3; target: THREE.Vector3; dist: number; fov: number};

export function cameraAt(f: number): CamState {
  const logd = spline(DIST, f);
  const dist = Math.exp(logd);
  // before the finale the small-scale target is the chromatin chain; afterwards it is the kit vignette
  const near =
    f < 700
      ? splineV(TARGET_NEAR, f)
      : splineV(TECH_TARGET, f).add(TECH_ORIGIN.clone().multiplyScalar(TISSUE_K).add(NUCLEUS_CENTER));
  const farLocal = splineV(TARGET_FAR, f);
  const far = farLocal.multiplyScalar(TISSUE_K).add(NUCLEUS_CENTER);
  // blend from nanometre-scale target to tissue-scale target as the distance grows
  const w = THREE.MathUtils.smoothstep(logd, Math.log(250), Math.log(6000));
  const target = near.lerp(far, w);
  const yaw = spline(YAW, f);
  const pitch = spline(PITCH, f);
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const pos = target.clone().addScaledVector(dir, dist);
  return {pos, target, dist, fov: 34};
}
