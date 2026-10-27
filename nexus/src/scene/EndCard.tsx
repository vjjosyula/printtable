import React from 'react';
import {useStoryFrame} from '../lib/timeline';
import * as THREE from 'three';
import {useCurrentFrame} from 'remotion';
import {C} from '../lib/brand';
import {easeInOutCubic, ramp} from '../lib/math';
import {NUCLEUS_CENTER, TISSUE_K} from './camera';

const mat = new THREE.MeshBasicMaterial({color: C.sand, fog: false, transparent: true});
const geo = new THREE.SphereGeometry(1, 64, 48);

/** Large soft sand circle that drifts into the bottom-right of the final frame. */
export const EndCard: React.FC = () => {
  const f = useStoryFrame();
  const t = ramp(f, 756, 860, easeInOutCubic);
  if (t <= 0) return null;
  mat.opacity = t;
  const pos = new THREE.Vector3(lerp(16, 7.2, t), lerp(-6, -2.6, t), -14).multiplyScalar(TISSUE_K).add(NUCLEUS_CENTER);
  return <mesh geometry={geo} material={mat} position={pos} scale={7.5 * TISSUE_K} />;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
