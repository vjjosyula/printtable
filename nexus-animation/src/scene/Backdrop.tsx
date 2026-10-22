import React, {useMemo} from 'react';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import {useStoryFrame} from '../lib/timeline';
import {brandBackground, darkAmount, DARK_CENTER, DARK_EDGE} from './background';

/** Full-screen backdrop: the light brand gradient, crossfading to a deep blue radial gradient among the cells. */
export const Backdrop: React.FC = () => {
  const f = useStoryFrame();
  const {size} = useThree();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          light: {value: brandBackground(size.width, size.height)},
          center: {value: DARK_CENTER.clone()},
          edge: {value: DARK_EDGE.clone()},
          mixAmt: {value: 0},
          aspect: {value: size.width / size.height},
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
        fragmentShader: `
          uniform sampler2D light; uniform vec3 center; uniform vec3 edge; uniform float mixAmt; uniform float aspect;
          varying vec2 vUv;
          void main(){
            vec3 l = texture2D(light, vUv).rgb;
            vec2 p = (vUv - vec2(0.5, 0.55)) * vec2(aspect, 1.0);
            float r = smoothstep(0.0, 0.85, length(p));
            vec3 d = mix(center, edge, r);
            gl_FragColor = vec4(mix(l, d, mixAmt), 1.0);
          }`,
        depthWrite: false,
        depthTest: false,
        fog: false,
      }),
    [size.width, size.height],
  );
  mat.uniforms.mixAmt.value = darkAmount(f);
  return (
    <mesh frustumCulled={false} renderOrder={-1000} material={mat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
};
