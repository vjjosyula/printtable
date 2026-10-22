import * as THREE from 'three';
import {C} from '../lib/brand';

/** Matte, slightly glossy clay. */
export const clay = (color: string, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.62,
    metalness: 0,
    clearcoat: 0.18,
    clearcoatRoughness: 0.55,
    ...extra,
  });

export const M = {
  backbone: clay(C.strandA, {roughness: 0.5}),
  backboneB: clay(C.strandB, {roughness: 0.5}),
  simpleDNA: clay(C.strandA, {roughness: 0.5}),
  rung: clay(C.rung),
  core: clay(C.sand),
  tail: clay(C.sand),
  ac: clay(C.blue),
  me3: clay(C.coral),
  writer: clay(C.blue),
  pol: clay(C.teal),
  rna: clay(C.teal),
};
