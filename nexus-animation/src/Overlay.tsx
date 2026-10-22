import React from 'react';
import * as THREE from 'three';
import {AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig, Easing, staticFile} from 'remotion';
import {LOGO_FILE} from './logo';
import {loadFont} from '@remotion/fonts';
import {C} from './lib/brand';
import {FPS, storyFrame} from './lib/timeline';
import {cameraAt, NUCLEUS_CENTER, TISSUE_K, viewOffsetY} from './scene/camera';
import {worldAt} from './scene/state';
import {tailPoints} from './scene/tails';
import {mergeAmount, SLOT_Y, WIDTH, MERGED_Y} from './scene/Tracks';
import {repCell, TYPES} from './scene/Tissue';
import {techAnchors} from './scene/tech';
import {ramp} from './lib/math';

// Red Hat Display (Google Fonts, variable weight), bundled locally for headless rendering.
const fontFamily = 'Red Hat Display';
loadFont({family: fontFamily, url: staticFile('RedHatDisplay-latin.woff2'), weight: '300 900'});

/** On-screen captions (video seconds). `key` is the single highlighted word. */
export const CAPTIONS: {from: number; to: number; lines: string[]; key?: string; keyColor?: string}[] = [
  {from: 0.3, to: 4.6, lines: ['Every cell carries', 'the same DNA.'], key: 'same'},
  {from: 4.9, to: 9.9, lines: ['Your DNA is wrapped', 'around histones.'], key: 'histones.'},
  {from: 10.3, to: 16.6, lines: ['Marks on histones decide', 'which genes are read.'], key: 'Marks'},
  {from: 17.0, to: 25.2, lines: ['H3K27ac opens', 'the DNA.'], key: 'H3K27ac'},
  {from: 25.6, to: 31.0, lines: ['H3K27me3 locks', 'it shut.'], key: 'H3K27me3', keyColor: C.coral},
  {from: 31.6, to: 41.6, lines: ['Every cell type reads', 'different genes.'], key: 'different'},
  {from: 42.4, to: 49.6, lines: ['Most profiling blends a tissue', 'into one average.'], key: 'average.'},
  {from: 50.0, to: 56.7, lines: ['Cell-type signals get diluted.', 'Rare cells nearly vanish.'], key: 'diluted.'},
  {from: 57.6, to: 62.6, lines: ['NEXUS was founded', 'to close these gaps.'], key: 'gaps.'},
  {from: 63.0, to: 67.6, lines: ['Two ready-to-use kits.', 'MeTLAND and Histland.'], key: 'Two'},
  {from: 68.0, to: 73.6, lines: ['MeTLAND: DNA methylation,', 'in bulk or sorted cells.'], key: 'MeTLAND:', keyColor: C.teal},
  {from: 73.8, to: 79.6, lines: ['Histland: histone marks,', 'in bulk or single cells.'], key: 'Histland:'},
  {from: 79.9, to: 83.0, lines: ['Two layers.', 'One epigenome.'], key: 'Two'},
];

const fadeWin = (t: number, a: number, b: number, d = 0.35) =>
  interpolate(t, [a, a + d, b - d, b], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});

const Caption: React.FC<{c: (typeof CAPTIONS)[number]; t: number; size: number}> = ({c, t, size}) => {
  const o = fadeWin(t, c.from, c.to);
  if (o <= 0) return null;
  let wi = 0;
  return (
    <div style={{position: 'absolute', left: 80, right: 80, top: 116, display: 'flex', justifyContent: 'center', opacity: Math.min(1, o * 1.4)}}>
      <div
        style={{
          background: C.panel,
          borderRadius: 30,
          padding: '22px 40px 26px',
          fontFamily,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.18,
          color: C.charcoal,
          textAlign: 'center',
          letterSpacing: -0.5,
          boxShadow: '0 10px 40px rgba(63,68,74,0.10)',
          transform: `scale(${0.94 + 0.06 * o})`,
        }}
      >
        {c.lines.map((l, i) => (
          <div key={i}>
            {l.split(' ').map((w, j) => {
              // words pop in one after another
              const k = wi++;
              const p = interpolate(t, [c.from + k * 0.07, c.from + k * 0.07 + 0.3], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.6))});
              const isKey = w === c.key;
              return (
                <span key={j} style={{display: 'inline-block', marginLeft: j ? '0.26em' : 0, opacity: p, transform: `translateY(${(1 - p) * 16}px)`, color: isKey ? c.keyColor ?? C.blue : C.charcoal, fontWeight: isKey ? 800 : 700}}>
                  {w}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- 3D -> screen projection */
function makeProjector(sf: number, w: number, h: number) {
  const s = cameraAt(sf);
  const cam = new THREE.PerspectiveCamera(s.fov, w / h, s.dist * 0.02, s.dist * 40);
  cam.position.copy(s.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(s.target);
  const offY = viewOffsetY(sf);
  cam.setViewOffset(w, h, 0, -h * offY, w, h);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return (p: THREE.Vector3) => {
    const q = p.clone().project(cam);
    return {x: ((q.x + 1) / 2) * w, y: ((1 - q.y) / 2) * h, behind: q.z > 1};
  };
}

const Tag: React.FC<{x: number; y: number; color: string; title: string; sub: string; o: number; side?: 1 | -1; dy?: number}> = ({x, y, color, title, sub, o, side = 1, dy = -110}) => {
  if (o <= 0.01) return null;
  const dx = 70 * side;
  const lx = Math.min(1080 - 340, Math.max(80 + 290 * (side < 0 ? 1 : 0), x + dx));
  const ly = Math.min(1350 - 200, Math.max(430, y + dy));
  return (
    <>
      <svg style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: o}} width={1} height={1}>
        <line x1={x} y1={y} x2={lx} y2={ly} stroke={color} strokeWidth={3} strokeLinecap="round" />
        <circle cx={x} cy={y} r={7} fill="none" stroke={color} strokeWidth={3} />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: side > 0 ? lx : undefined,
          right: side < 0 ? undefined : undefined,
          top: ly - 34,
          transform: `translateX(${side > 0 ? 0 : -100}%) scale(${0.85 + 0.15 * o})`,
          transformOrigin: side > 0 ? 'left center' : 'right center',
          opacity: o,
          background: color,
          color: '#FBF9F6',
          borderRadius: 18,
          padding: '8px 18px 10px',
          fontFamily,
          whiteSpace: 'nowrap',
          boxShadow: '0 8px 24px rgba(63,68,74,0.18)',
          ...(side < 0 ? {left: lx} : {}),
        }}
      >
        <div style={{fontWeight: 800, fontSize: 42, letterSpacing: -0.3, lineHeight: 1.1}}>{title}</div>
        <div style={{fontWeight: 600, fontSize: 27, opacity: 0.92, lineHeight: 1.2}}>{sub}</div>
      </div>
    </>
  );
};

const clampToFrame = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const MarkTags: React.FC<{sf: number; w: number; h: number}> = ({sf, w, h}) => {
  const proj = makeProjector(sf, w, h);
  const world = worldAt(sf);
  const out: React.ReactNode[] = [];
  // H3K27ac on nucleosome 4, from the moment it is placed until the camera leaves the open region
  const oAc = ramp(sf, 232, 246, (x) => x) * (1 - ramp(sf, 330, 342, (x) => x));
  if (oAc > 0) {
    const n4 = world.nucs.find((n) => n.id === 4)!;
    const pts = tailPoints(n4, n4.tails[0], sf);
    const k = pts.length / 3 - 1;
    const p = proj(new THREE.Vector3(pts[3 * k], pts[3 * k + 1], pts[3 * k + 2]));
    if (!p.behind) {
      const side = p.x > w * 0.55 ? -1 : 1;
      out.push(<Tag key="ac" x={p.x} y={p.y} color={C.blue} title="H3K27ac" sub="active mark · DNA opens" o={oAc} side={side as 1 | -1} dy={-150} />);
    }
  }
  // H3K27me3 on the compact coil: tag the most visible coral mark
  const oMe = ramp(sf, 356, 366, (x) => x) * (1 - ramp(sf, 404, 414, (x) => x));
  if (oMe > 0) {
    let best: {x: number; y: number; d: number} | null = null;
    const cam = cameraAt(sf);
    for (const n of world.nucs) {
      if (!n.coil) continue;
      const t = n.tails[0];
      if (!t.mark) continue;
      const pts = tailPoints(n, t, sf);
      const k = pts.length / 3 - 1;
      const wp = new THREE.Vector3(pts[3 * k], pts[3 * k + 1], pts[3 * k + 2]);
      const p = proj(wp);
      if (p.behind || p.x < w * 0.25 || p.x > w * 0.8 || p.y < h * 0.4 || p.y > h * 0.85) continue;
      const d = wp.distanceTo(cam.pos);
      // prefer marks on the camera side, above the polymerase
      const score = d + Math.abs(p.y - h * 0.48) * 0.05;
      if (!best || score < best.d) best = {x: p.x, y: p.y, d: score};
    }
    if (best) out.push(<Tag key="me3" x={best.x} y={best.y} color={C.coral} title="H3K27me3" sub="repressive mark · DNA locked" o={oMe} side={best.x > w * 0.5 ? -1 : 1} dy={-120} />);
  }
  return <>{out}</>;
};

const CELL_NAME: Record<string, string> = {neuron: 'Neuron', astro: 'Astrocyte', oligo: 'Oligodendrocyte', micro: 'Microglia'};
const CELL_BG: Record<string, string> = {neuron: C.blue, astro: C.teal, oligo: C.sand, micro: C.coral};
/** Name one example of each cell type while the narration lists them. */
const CellLabels: React.FC<{sf: number; w: number; h: number}> = ({sf, w, h}) => {
  const proj = makeProjector(sf, w, h);
  const square = h < 1200;
  // place labels, then push apart any that would overlap
  const fs = square ? 26 : 30;
  const items = TYPES.map((t, i) => {
    const o = ramp(sf, 500 + i * 8, 516 + i * 8, (x) => x) * (1 - ramp(sf, 596, 612, (x) => x));
    const c = repCell(t);
    const p = proj(c.pos.clone().multiplyScalar(TISSUE_K).add(NUCLEUS_CENTER));
    const half = (CELL_NAME[t].length * 0.56 * fs + 32) / 2;
    return {t, o, p, half, x: clampToFrame(p.x, 80 + half, w - 80 - half), y: clampToFrame(p.y, square ? 380 : 440, h - 140)};
  }).filter((it) => it.o > 0 && !it.p.behind && it.p.x > 40 && it.p.x < w - 40 && it.p.y > 120 && it.p.y < h - 60);
  items.sort((a, b) => a.y - b.y);
  for (let pass = 0; pass < 3; pass++)
    for (let a = 0; a < items.length; a++)
      for (let b = a + 1; b < items.length; b++) {
        const A = items[a], B = items[b];
        const overlapX = Math.abs(A.x - B.x) < A.half + B.half + 12;
        if (overlapX && Math.abs(A.y - B.y) < fs * 2 + 16) B.y = A.y + fs * 2 + 16;
      }
  return (
    <>
      {items.map(({t, o, x, y, p}) => (
        <React.Fragment key={t}>
          <svg style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: o}} width={1} height={1}>
            <line x1={x} y1={y - 26} x2={clampToFrame(p.x, 0, w)} y2={clampToFrame(p.y, 0, h)} stroke={t === 'oligo' ? C.charcoal : CELL_BG[t]} strokeWidth={3} strokeLinecap="round" />
          </svg>
          <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -100%) translateY(${-26 - (1 - o) * 10}px)`, opacity: o}}>
            <div style={{background: CELL_BG[t], color: t === 'oligo' ? C.charcoal : '#FBF9F6', border: t === 'oligo' ? `2px solid ${C.charcoal}` : 'none', borderRadius: 14, padding: '6px 14px 8px', fontFamily, fontWeight: 800, fontSize: fs, whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(63,68,74,0.16)'}}>
              {CELL_NAME[t]}
            </div>
          </div>
        </React.Fragment>
      ))}
    </>
  );
};

const KitTags: React.FC<{sf: number; w: number; h: number}> = ({sf, w, h}) => {
  const proj = makeProjector(sf, w, h);
  const a = techAnchors(sf);
  const oM = ramp(sf, 1000, 1020, (x) => x) * (1 - ramp(sf, 1420, 1445, (x) => x));
  const oH = ramp(sf, 1160, 1180, (x) => x) * (1 - ramp(sf, 1420, 1445, (x) => x));
  const pm = proj(a.methyl);
  const ph = proj(a.mark);
  return (
    <>
      {!pm.behind ? <Tag x={pm.x} y={pm.y} color={C.teal} title="MeTLAND" sub="DNA methylation · bulk" o={oM} side={pm.x > w * 0.55 ? -1 : 1} dy={150} /> : null}
      {!ph.behind ? <Tag x={ph.x} y={ph.y} color={C.blue} title="Histland" sub="histone marks · bulk + single cell" o={oH} side={ph.x > w * 0.5 ? -1 : 1} dy={-150} /> : null}
    </>
  );
};

const TYPE_LABEL: Record<string, string> = {neuron: 'Neurons', astro: 'Astrocytes', oligo: 'Oligodendrocytes', micro: 'Microglia'};
const TYPE_TEXT: Record<string, string> = {neuron: C.blue, astro: C.teal, oligo: C.charcoal, micro: C.coral};

const TrackLabels: React.FC<{sf: number; w: number; h: number}> = ({sf, w, h}) => {
  const proj = makeProjector(sf, w, h);
  const m = mergeAmount(sf);
  const square = h < 1200;
  const nodes: React.ReactNode[] = [];
  TYPES.forEach((t, i) => {
    const o = ramp(sf, 618 + i * 10, 640 + i * 10, (x) => x) * (1 - Math.min(1, m * 3));
    if (o <= 0) return;
    const y = SLOT_Y(i);
    const p = proj(new THREE.Vector3(-WIDTH / 2, y, 0).multiplyScalar(TISSUE_K).add(NUCLEUS_CENTER));
    nodes.push(
      <div key={t} style={{position: 'absolute', left: clampToFrame(p.x, 80, w - 300), top: p.y - (square ? 34 : 40), opacity: o, fontFamily, fontWeight: 700, fontSize: square ? 22 : 26, color: TYPE_TEXT[t], letterSpacing: 0.2}}>
        {TYPE_LABEL[t]}
      </div>,
    );
  });
  const oAvg = Math.max(0, (m - 0.6) / 0.4);
  if (oAvg > 0) {
    const p = proj(new THREE.Vector3(-WIDTH / 2, MERGED_Y, 0).multiplyScalar(TISSUE_K).add(NUCLEUS_CENTER));
    nodes.push(
      <div key="avg" style={{position: 'absolute', left: clampToFrame(p.x, 80, w - 300), top: p.y - 92, opacity: oAvg, fontFamily, fontWeight: 700, fontSize: square ? 28 : 32, color: C.grey}}>
        Bulk tissue average
      </div>,
    );
  }
  return <>{nodes}</>;
};

const EndLine: React.FC<{t: number; at: number; style: React.CSSProperties; children: React.ReactNode}> = ({t, at, style, children}) => {
  const o = interpolate(t, [at, at + 0.6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  return <div style={{opacity: o, transform: `translateY(${(1 - o) * 18}px)`, ...style}}>{children}</div>;
};

export const Overlay: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const sf = storyFrame(f);
  const {width, height} = useVideoConfig();
  const square = height < 1200;
  const endStart = 83.2;
  const circle = interpolate(t, [82.6, 84.6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {circle > 0 ? (
        <div
          style={{
            position: 'absolute',
            width: square ? 640 : 780,
            height: square ? 640 : 780,
            right: square ? -200 : -230,
            bottom: square ? -230 : -250,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${C.sand} 0%, ${C.sand} 58%, rgba(233,228,198,0) 72%)`,
            opacity: circle,
            transform: `scale(${0.9 + 0.1 * circle})`,
          }}
        />
      ) : null}
      {LOGO_FILE && t > 1.5 && t < 82.6 ? (
        <div
          style={{
            position: 'absolute',
            left: 80,
            bottom: 80,
            padding: '10px 16px',
            borderRadius: 16,
            background: 'rgba(244,241,236,0.88)',
            boxShadow: '0 6px 20px rgba(63,68,74,0.08)',
            opacity: interpolate(t, [1.5, 2.5, 81.8, 82.6], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
          }}
        >
          <Img src={staticFile(LOGO_FILE)} style={{height: square ? 40 : 46, width: 'auto', display: 'block'}} />
        </div>
      ) : null}
      {sf < 420 ? <MarkTags sf={sf} w={width} h={height} /> : null}
      {sf > 495 && sf < 615 ? <CellLabels sf={sf} w={width} h={height} /> : null}
      {sf > 600 && sf < 870 ? <TrackLabels sf={sf} w={width} h={height} /> : null}
      {sf > 990 && sf < 1450 ? <KitTags sf={sf} w={width} h={height} /> : null}
      {CAPTIONS.map((c, i) => (
        <Caption key={i} c={c} t={t} size={square ? 54 : 60} />
      ))}
      {t >= endStart ? (
        <div style={{position: 'absolute', left: 80, right: 80, bottom: 80, fontFamily, color: C.charcoal}}>
          {LOGO_FILE ? (
            <EndLine t={t} at={83.3} style={{marginBottom: square ? 4 : 8}}>
              <Img src={staticFile(LOGO_FILE)} style={{height: square ? 112 : 136, width: 'auto', display: 'block'}} />
            </EndLine>
          ) : (
            <EndLine t={t} at={83.4} style={{fontWeight: 800, fontSize: square ? 70 : 84, letterSpacing: -1, lineHeight: 1.05}}>
              NEXUS Epigenomics
            </EndLine>
          )}
          <EndLine t={t} at={84.2} style={{fontWeight: 500, fontSize: square ? 36 : 44, marginTop: square ? 12 : 20, lineHeight: 1.25}}>
            Founded in Stockholm, 2024.
          </EndLine>
          <EndLine t={t} at={85.0} style={{fontWeight: 500, fontSize: square ? 36 : 44, marginTop: 8, lineHeight: 1.25, maxWidth: 860}}>
            Closing the gap with <span style={{fontWeight: 800, color: C.teal}}>MeTLAND</span> and <span style={{fontWeight: 800, color: C.blue}}>Histland</span>.
          </EndLine>
          <EndLine t={t} at={86.3} style={{fontWeight: 800, fontSize: square ? 54 : 66, marginTop: square ? 18 : 30, letterSpacing: -0.5, lineHeight: 1.1}}>
            What is your biggest gap?
          </EndLine>
          <EndLine t={t} at={86.8} style={{fontWeight: 700, fontSize: square ? 32 : 38, marginTop: 10, color: C.blue}}>
            Tell us in the comments.
          </EndLine>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
