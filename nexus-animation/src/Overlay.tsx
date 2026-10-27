import React from 'react';
import * as THREE from 'three';
import {AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig, Easing, staticFile} from 'remotion';
import {LOGO_FILE} from './logo';
import {loadFont} from '@remotion/fonts';
import {C} from './lib/brand';
import {FPS, storyFrame} from './lib/timeline';
import {cameraAt, NUCLEUS_CENTER, TISSUE_K} from './scene/camera';
import {fovFor, GAP_T0, offsetAt, viewAt} from './scene/view';
import {gapAnchors} from './scene/GapStage';
import {worldAt} from './scene/state';
import {tailPoints} from './scene/tails';
import {repCell, TYPES} from './scene/Tissue';
import {ramp} from './lib/math';

// Red Hat Display (Google Fonts, variable weight), bundled locally for headless rendering.
const fontFamily = 'Red Hat Display';
loadFont({family: fontFamily, url: staticFile('RedHatDisplay-latin.woff2'), weight: '300 900'});

/** On-screen captions (video seconds). `key` is the single highlighted word. */
export const CAPTIONS: {from: number; to: number; lines: string[]; key?: string}[] = [
  {from: 1.9, to: 4.9, lines: ['Every cell carries', 'the same DNA.'], key: 'same'},
  {from: 5.3, to: 8.8, lines: ['So why does a neuron behave', 'nothing like the cell beside it?'], key: 'why'},
  {from: 9.1, to: 13.4, lines: ['In any one cell,', 'only part of that DNA', 'is switched on.'], key: 'part'},
  {from: 13.7, to: 17.0, lines: ['Which genes are on', 'is set by the epigenome.'], key: 'epigenome.'},
  {from: 17.1, to: 20.5, lines: ['Two layers:', 'histone modifications,', 'and DNA methylation.'], key: 'layers:'},
  {from: 20.7, to: 25.4, lines: ['Layer one:', 'modifications on histones.'], key: 'Layer'},
  {from: 25.7, to: 29.6, lines: ['Marks on histone tails decide', 'which genes are read.'], key: 'Marks'},
  {from: 29.9, to: 35.1, lines: ['Acetylation opens', 'the DNA.'], key: 'Acetylation'},
  {from: 35.4, to: 40.3, lines: ['Methylation of the histone', 'locks it shut.'], key: 'histone'},
  {from: 40.6, to: 44.5, lines: ['To measure both marks,', 'NEXUS built HisTLAND®.'], key: 'HisTLAND®.'},
  {from: 44.7, to: 49.6, lines: ['Two histone marks from one sample,', 'in bulk or single cells.'], key: 'one'},
  {from: 49.9, to: 55.8, lines: ['Layer two:', 'methylation on', 'the DNA itself.'], key: 'Layer'},
  {from: 56.0, to: 59.5, lines: ['To map it genome-wide,', 'NEXUS built MeTLAND®.'], key: 'MeTLAND®.'},
  {from: 59.7, to: 65.6, lines: ['No bisulfite,', 'no antibodies.'], key: 'No'},
  {from: 66.3, to: 71.9, lines: ['Built around published methods', 'from academic labs.'], key: 'published'},
  {from: 72.2, to: 75.1, lines: ['Made into kits you can run', 'in your own lab.'], key: 'kits'},
  {from: 75.4, to: 81.6, lines: ['Two layers of the epigenome.', 'HisTLAND® and MeTLAND®.'], key: 'Two'},
];

const fadeWin = (t: number, a: number, b: number, d = 0.35) =>
  interpolate(t, [a, a + d, b - d, b], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});

const Caption: React.FC<{c: (typeof CAPTIONS)[number]; t: number; size: number; top: number}> = ({c, t, size: maxSize, top}) => {
  const o = fadeWin(t, c.from, c.to);
  if (o <= 0) return null;
  // long lines get a slightly smaller size so the band never touches the frame margins
  const longest = Math.max(...c.lines.map((l) => l.length));
  const size = Math.min(maxSize, Math.floor(820 / (longest * 0.53)));
  let wi = 0;
  return (
    <div style={{position: 'absolute', left: 80, right: 80, top: top, display: 'flex', justifyContent: 'center', opacity: Math.min(1, o * 1.4)}}>
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
                <span key={j} style={{display: 'inline-block', marginLeft: j ? '0.26em' : 0, opacity: p, transform: `translateY(${(1 - p) * 16}px)`, color: isKey ? C.blue : C.charcoal, fontWeight: isKey ? 800 : 700}}>
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
function makeProjector(vf: number, w: number, h: number) {
  const s = viewAt(vf);
  const cam = new THREE.PerspectiveCamera(fovFor(w / h), w / h, s.dist * 0.02, s.dist * 40);
  cam.position.copy(s.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(s.target);
  const offY = offsetAt(vf) * (w > h ? 0.4 : 1);
  cam.setViewOffset(w, h, 0, -h * offY, w, h);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return (p: THREE.Vector3) => {
    const q = p.clone().project(cam);
    return {x: ((q.x + 1) / 2) * w, y: ((1 - q.y) / 2) * h, behind: q.z > 1};
  };
}

const Tag: React.FC<{x: number; y: number; color: string; text?: string; title: string; sub: string; o: number; side?: 1 | -1; dy?: number; h?: number}> = ({x, y, color, text = '#FBF9F6', title, sub, o, side = 1, dy = -110, h = 1350}) => {
  if (o <= 0.01) return null;
  const dx = 70 * side;
  const lx = Math.min(1080 - 340, Math.max(80 + 290 * (side < 0 ? 1 : 0), x + dx));
  const ly = Math.min(h - 200, Math.max(430, y + dy));
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
          color: text,
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

const MarkTags: React.FC<{sf: number; vf: number; w: number; h: number}> = ({sf, vf, w, h}) => {
  const proj = makeProjector(vf, w, h);
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
      out.push(<Tag key="ac" x={p.x} y={p.y} color={C.coral} title="H3K27ac" sub="active mark · DNA opens" o={oAc} side={side as 1 | -1} dy={-150} h={h} />);
    }
  }
  // H3K27me3 on the compact coil: tag the most visible coral mark
  // the story clock holds at its last frame after the chromatin section, so also fade by video time
  const oMe = ramp(sf, 356, 366, (x) => x) * (1 - ramp(sf, 404, 414, (x) => x)) * (1 - ramp(vf / FPS, 39.5, 40.1, (x) => x));
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
    if (best) out.push(<Tag key="me3" x={best.x} y={best.y} color={C.coral} title="H3K27me3" sub="repressive mark · DNA locked" o={oMe} side={best.x > w * 0.5 ? -1 : 1} dy={-120} h={h} />);
  }
  return <>{out}</>;
};

const CELL_NAME: Record<string, string> = {neuron: 'Neuron', astro: 'Astrocyte', oligo: 'Oligodendrocyte', micro: 'Microglia'};
const CELL_BG: Record<string, string> = {neuron: C.magenta, astro: C.teal, oligo: C.sand, micro: C.coral};
/** Name one example of each cell type while the narration lists them. */
const CellLabels: React.FC<{vf: number; w: number; h: number}> = ({vf, w, h}) => {
  const proj = makeProjector(vf, w, h);
  const vt = vf / FPS;
  const out = 1 - ramp(vt, 12.6, 13.4, (x) => x);
  const square = h < 1200;
  // place labels, then push apart any that would overlap
  const fs = square ? 26 : 30;
  const items = TYPES.map((t, i) => {
    const o = ramp(vt, 2.6 + i * 0.3, 3.1 + i * 0.3, (x) => x) * out;
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
            <line x1={x} y1={y - 26} x2={clampToFrame(p.x, 0, w)} y2={clampToFrame(p.y, 0, h)} stroke={CELL_BG[t]} strokeWidth={3} strokeLinecap="round" />
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

/** Kit tags: HisTLAND® and MeTLAND® on their scenes, then both together on the two-layers scene. */
const GapLabels: React.FC<{vf: number; w: number; h: number}> = ({vf, w, h}) => {
  const proj = makeProjector(vf, w, h);
  const t = vf / FPS;
  const a = gapAnchors();
  const square = h < 1200;
  const dy = square ? 150 : 210;
  const nodes: React.ReactNode[] = [];
  const tag = (key: string, p3: THREE.Vector3, o: number, kit: 'h' | 'm', up = false) => {
    if (o <= 0) return;
    const p = proj(p3);
    if (p.behind) return;
    const props = kit === 'h' ? {color: C.blue, title: 'HisTLAND®', sub: 'histone marks · bulk + single cell'} : {color: C.teal, title: 'MeTLAND®', sub: 'DNA methylation · bulk'};
    // keep tags inside the frame: below the anchor when there is room, otherwise above it
    const below = p.y + dy < h - 170;
    nodes.push(<Tag key={key} x={p.x} y={p.y} {...props} o={o} side={p.x > w * 0.5 ? -1 : 1} dy={up || !below ? -Math.abs(dy) * 0.8 : dy} h={h} />);
  };
  tag('h', a.histMark, ramp(t, 42.2, 42.8, (x) => x) * (1 - ramp(t, 49.4, 49.9, (x) => x)), 'h');
  tag('m', a.metMethyl, ramp(t, 56.6, 57.2, (x) => x) * (1 - ramp(t, 65.2, 65.7, (x) => x)), 'm');
  const oL = ramp(t, 76.4, 77.0, (x) => x) * (1 - ramp(t, 81.6, 82.1, (x) => x));
  tag('lh', a.layersMark, oL, 'h', true);
  tag('lm', a.layersMethyl, oL, 'm');
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
  const tall = height > 1500;
  const wide = width > height;
  const endStart = 82.0;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {LOGO_FILE && t > 1.5 && t < 81.8 ? (
        <div
          style={{
            position: 'absolute',
            left: 80,
            bottom: tall ? 300 : 80,
            padding: '10px 16px',
            borderRadius: 16,
            background: 'rgba(244,241,236,0.88)',
            boxShadow: '0 6px 20px rgba(63,68,74,0.08)',
            opacity: interpolate(t, [1.5, 2.5, 81.2, 81.8], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
          }}
        >
          <Img src={staticFile(LOGO_FILE)} style={{height: square ? 40 : 46, width: 'auto', display: 'block'}} />
        </div>
      ) : null}
      {sf > 200 && t < GAP_T0 ? <MarkTags sf={sf} vf={f} w={width} h={height} /> : null}
      {t > 2.2 && t < 13.6 ? <CellLabels vf={f} w={width} h={height} /> : null}
      {t > 42 && t < 82.0 ? <GapLabels vf={f} w={width} h={height} /> : null}
      {CAPTIONS.map((c, i) => (
        <Caption key={i} c={c} t={t} size={wide ? 46 : square ? 54 : 60} top={tall ? 190 : wide ? 54 : 116} />
      ))}
      {t >= endStart ? (
        <div style={{position: 'absolute', left: 80, right: 80, bottom: tall ? 320 : 80, fontFamily, color: C.charcoal}}>
          <EndLine t={t} at={82.2} style={{marginBottom: square ? 4 : 8}}>
            <Img src={staticFile(LOGO_FILE ?? 'logo.png')} style={{height: square ? 112 : 136, width: 'auto', display: 'block'}} />
          </EndLine>
          <EndLine t={t} at={82.8} style={{fontWeight: 500, fontSize: square ? 36 : 44, marginTop: square ? 12 : 20, lineHeight: 1.25}}>
            Founded in Stockholm.
          </EndLine>
          <EndLine t={t} at={83.5} style={{fontWeight: 800, fontSize: square ? 48 : 58, marginTop: square ? 18 : 30, letterSpacing: -0.5, lineHeight: 1.12, maxWidth: 920}}>
            What is the question you are solving in epigenetics?
          </EndLine>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
