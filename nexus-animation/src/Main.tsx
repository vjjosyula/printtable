import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {C} from './lib/brand';
import {Rig} from './scene/Rig';
import {Lights} from './scene/Lights';
import {Chromatin} from './scene/Chromatin';
import {Nucleus} from './scene/Nucleus';
import {Tissue} from './scene/Tissue';
import {Tracks} from './scene/Tracks';
import {EndCard} from './scene/EndCard';
import {Overlay} from './Overlay';
import {useCurrentFrame} from 'remotion';
import {cameraAt} from './scene/camera';

export const Main: React.FC = () => {
  const {width, height} = useVideoConfig();
  const f = useCurrentFrame();
  const dist = cameraAt(f).dist;
  const detail = dist < 600;
  const showChromatin = dist < 9000;
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{fov: 34, near: 0.1, far: 1000, position: [0, 0, 30]}}
        gl={{antialias: false, toneMapping: THREE.NoToneMapping, preserveDrawingBuffer: true, localClippingEnabled: true} as never}
        onCreated={({gl}) => {
          gl.localClippingEnabled = true;
        }}
      >
        <color attach="background" args={[C.bg]} />
        <fog attach="fog" args={[C.bg, 100, 600]} />
        <Lights />
        {showChromatin ? <Chromatin detail={detail} /> : null}
        {f >= 300 && f < 600 ? <Nucleus /> : null}
        <Tissue />
        <Tracks />
        <EndCard />
        <Rig />
      </ThreeCanvas>
      <Overlay />
    </AbsoluteFill>
  );
};
