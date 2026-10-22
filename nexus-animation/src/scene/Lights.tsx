import React from 'react';
import {useThree} from '@react-three/fiber';
import {useCurrentFrame} from 'remotion';
import {viewAt} from './view';

/** Soft, bright, diffuse studio lighting that travels with the camera. */
export const Lights: React.FC = () => {
  const f = useCurrentFrame();
  useThree();
  const s = viewAt(f);
  const d = s.dist;
  const key = s.pos.clone().add(s.pos.clone().sub(s.target).normalize().multiplyScalar(0)).add({x: -0.6 * d, y: 0.9 * d, z: 0.2 * d} as never);
  const fill = s.pos.clone().add({x: 0.9 * d, y: -0.2 * d, z: 0} as never);
  return (
    <>
      <hemisphereLight args={['#ffffff', '#2E3439', 1.7]} />
      <directionalLight position={key} target-position={s.target} intensity={1.6} color="#fffaf2" />
      <directionalLight position={fill} target-position={s.target} intensity={0.45} color="#f4f1ec" />
      {/* rim light from behind gives molecules a crisp edge against the bright background */}
      <directionalLight position={s.target.clone().add(s.target.clone().sub(s.pos).multiplyScalar(1.2)).add({x: 0, y: 0.6 * d, z: 0} as never)} target-position={s.target} intensity={1.5} color="#ffffff" />
    </>
  );
};
