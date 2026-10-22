import React from 'react';
import {useThree} from '@react-three/fiber';
import {useCurrentFrame} from 'remotion';
import {cameraAt} from './camera';

/** Soft, bright, diffuse studio lighting that travels with the camera. */
export const Lights: React.FC = () => {
  const f = useCurrentFrame();
  useThree();
  const s = cameraAt(f);
  const d = s.dist;
  const key = s.pos.clone().add(s.pos.clone().sub(s.target).normalize().multiplyScalar(0)).add({x: -0.6 * d, y: 0.9 * d, z: 0.2 * d} as never);
  const fill = s.pos.clone().add({x: 0.9 * d, y: -0.2 * d, z: 0} as never);
  return (
    <>
      <hemisphereLight args={['#ffffff', '#E9E4C6', 1.85]} />
      <directionalLight position={key} target-position={s.target} intensity={1.35} color="#fffaf2" />
      <directionalLight position={fill} target-position={s.target} intensity={0.45} color="#f4f1ec" />
    </>
  );
};
