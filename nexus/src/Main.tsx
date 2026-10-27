import React from 'react';
import {useStoryFrame} from './lib/timeline';
import {AbsoluteFill, Audio, staticFile, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {C} from './lib/brand';
import {Rig} from './scene/Rig';
import {Lights} from './scene/Lights';
import {Chromatin} from './scene/Chromatin';
import {Nucleus} from './scene/Nucleus';
import {Tissue} from './scene/Tissue';
import {GapStage} from './scene/GapStage';
import {GAP_T0, viewAt} from './scene/view';
import {INTRO_END} from './lib/timeline';
import {brandBackground} from './scene/background';
import {Overlay} from './Overlay';
import {useCurrentFrame} from 'remotion';
import {cameraAt} from './scene/camera';

export const Main: React.FC = () => {
  const {width, height} = useVideoConfig();
  const f = useStoryFrame();
  const t = useCurrentFrame() / 30;
  const dist = viewAt(useCurrentFrame()).dist;
  const detail = dist < 600;
  const showChromatin = dist < 9000 && t > INTRO_END - 1.7 && t < GAP_T0 + 1.6;
  // the nucleus around the chromatin: during the dive in, and in the background late in the chromatin story
  const showNucleus = (t > 12 && t < INTRO_END + 0.5) || (f >= 300 && t < GAP_T0);
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
        <primitive attach="background" object={brandBackground(width, height)} />
        <fog attach="fog" args={[C.bg, 100, 600]} />
        <Lights />
        {showChromatin ? <Chromatin detail={detail} /> : null}
        {showNucleus ? <Nucleus /> : null}
        <Tissue />
        <GapStage />
        <Rig />
      </ThreeCanvas>
      <Overlay />
      <Audio src={staticFile('soundtrack.wav')} />
    </AbsoluteFill>
  );
};
