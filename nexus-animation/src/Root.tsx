import React from 'react';
import {Composition} from 'remotion';
import {Main} from './Main';
export const Root: React.FC = () => (
  <>
    <Composition id="Nexus" component={Main} durationInFrames={960} fps={30} width={1080} height={1350} />
    <Composition id="NexusSquare" component={Main} durationInFrames={960} fps={30} width={1080} height={1080} />
  </>
);
