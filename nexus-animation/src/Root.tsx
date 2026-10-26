import React from 'react';
import {Composition} from 'remotion';
import {Main} from './Main';
import {DURATION_FRAMES} from './lib/timeline';
export const Root: React.FC = () => (
  <>
    <Composition id="Nexus" component={Main} durationInFrames={DURATION_FRAMES} fps={30} width={1080} height={1350} />
    <Composition id="NexusSquare" component={Main} durationInFrames={DURATION_FRAMES} fps={30} width={1080} height={1080} />
    <Composition id="NexusYouTube" component={Main} durationInFrames={DURATION_FRAMES} fps={30} width={1080} height={1920} />
  </>
);
