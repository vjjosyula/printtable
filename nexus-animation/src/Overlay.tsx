import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, Easing, staticFile} from 'remotion';
import {loadFont} from '@remotion/fonts';
import {C} from './lib/brand';

// Red Hat Display (Google Fonts, variable weight), bundled locally for headless rendering.
const fontFamily = 'Red Hat Display';
loadFont({family: fontFamily, url: staticFile('RedHatDisplay-latin.woff2'), weight: '300 900'});

/** On-screen captions. `key` marks the single blue keyword. */
export const CAPTIONS: {from: number; to: number; lines: string[]; key?: string}[] = [
  {from: 12, to: 168, lines: ['Your DNA is wrapped', 'around histones.'], key: 'histones.'},
  {from: 190, to: 282, lines: ['Marks decide which', 'genes are read.'], key: 'Marks'},
  {from: 292, to: 386, lines: ['Open here.', 'Locked there.'], key: 'Open'},
  {from: 404, to: 562, lines: ['Every cell type reads', 'different genes.'], key: 'different'},
  {from: 600, to: 744, lines: ['Most profiling blends them', 'into one average.'], key: 'average.'},
];

const fade = (f: number, a: number, b: number, d = 10) =>
  interpolate(f, [a, a + d, b - d, b], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});

const Caption: React.FC<{c: (typeof CAPTIONS)[number]; f: number; size: number}> = ({c, f, size}) => {
  const o = fade(f, c.from, c.to);
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 80,
        right: 80,
        top: 120,
        display: 'flex',
        justifyContent: 'center',
        opacity: o,
        transform: `translateY(${(1 - o) * 14}px)`,
      }}
    >
      <div
        style={{
          background: C.panel,
          borderRadius: 28,
          padding: '22px 40px 26px',
          fontFamily,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.18,
          color: C.charcoal,
          textAlign: 'center',
          letterSpacing: -0.5,
          boxShadow: '0 6px 30px rgba(63,68,74,0.08)',
        }}
      >
        {c.lines.map((l, i) => (
          <div key={i}>
            {l.split(' ').map((w, j) => (
              <span key={j} style={{color: w === c.key ? C.blue : C.charcoal}}>
                {j ? ' ' : ''}
                {w}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const EndLine: React.FC<{f: number; at: number; style: React.CSSProperties; children: React.ReactNode}> = ({f, at, style, children}) => {
  const o = interpolate(f, [at, at + 18], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  return <div style={{opacity: o, transform: `translateY(${(1 - o) * 18}px)`, ...style}}>{children}</div>;
};

export const Overlay: React.FC = () => {
  const f = useCurrentFrame();
  const {height} = useVideoConfig();
  const square = height < 1200;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {CAPTIONS.map((c, i) => (
        <Caption key={i} c={c} f={f} size={square ? 54 : 60} />
      ))}
      {f >= 790 ? (
        <div style={{position: 'absolute', left: 80, right: 80, bottom: 80, fontFamily, color: C.charcoal}}>
          <EndLine f={f} at={792} style={{fontWeight: 800, fontSize: square ? 70 : 84, letterSpacing: -1, lineHeight: 1.05}}>
            NEXUS Epigenomics
          </EndLine>
          <EndLine f={f} at={812} style={{fontWeight: 500, fontSize: square ? 38 : 46, marginTop: square ? 14 : 22, lineHeight: 1.25}}>
            Founded in Stockholm, 2024.
          </EndLine>
          <EndLine f={f} at={830} style={{fontWeight: 500, fontSize: square ? 38 : 46, marginTop: 8, lineHeight: 1.25, maxWidth: 820}}>
            Kits built on methods published in Nature Biotechnology.
          </EndLine>
          <EndLine f={f} at={858} style={{fontWeight: 800, fontSize: square ? 56 : 68, marginTop: square ? 22 : 40, letterSpacing: -0.5, lineHeight: 1.1}}>
            What is your biggest gap?
          </EndLine>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
