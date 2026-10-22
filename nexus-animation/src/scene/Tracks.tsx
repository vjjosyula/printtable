import React, {useEffect, useMemo} from 'react';
import {useStoryFrame} from '../lib/timeline';
import * as THREE from 'three';
import {useCurrentFrame} from 'remotion';
import {C} from '../lib/brand';
import {tubeGeometry} from '../lib/geom';
import {easeInOutCubic, easeOutCubic, lerp, mulberry32, ramp} from '../lib/math';
import {NUCLEUS_CENTER, TISSUE_K} from './camera';
import {clay} from './materials';
import {CellType, repCell, TYPE_COLOR, TYPES} from './Tissue';

const N = 260;
export const WIDTH = 12;
export const AMP = 1.45;
export const SLOT_Y = (i: number) => 12.9 - i * 1.75;
export const MERGED_Y = SLOT_Y(1.5);

/** Peak positions: one shared (housekeeping) peak at 0.5, plus cell-type-specific peaks. */
const PEAKS: Record<CellType, [number, number, number][]> = {
  neuron: [[0.5, 0.8, 0.014], [0.16, 1.0, 0.012], [0.71, 0.75, 0.012]],
  astro: [[0.5, 0.8, 0.014], [0.29, 0.95, 0.012], [0.86, 0.7, 0.012]],
  oligo: [[0.5, 0.8, 0.014], [0.08, 0.85, 0.012], [0.61, 1.0, 0.012]],
  micro: [[0.5, 0.8, 0.014], [0.39, 0.9, 0.012], [0.79, 0.95, 0.012]],
};

function profile(type: CellType) {
  const rnd = mulberry32(type.length * 31 + type.charCodeAt(0));
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    let v = 0.03 + 0.02 * rnd();
    for (const [c, h, w] of PEAKS[type]) v += h * Math.exp(-((x - c) ** 2) / (2 * w * w));
    out[i] = v;
  }
  return out;
}
const PROFILES = Object.fromEntries(TYPES.map((t) => [t, profile(t)])) as Record<CellType, Float32Array>;
/**
 * Bulk average: the four profiles weighted by roughly how common each cell type is in brain
 * tissue (microglia are a small minority), lightly smoothed. Shared peaks survive; cell-type
 * peaks shrink in proportion to that cell type's share, so rare-cell signals nearly vanish.
 */
export const SHARE: Record<CellType, number> = {neuron: 0.42, astro: 0.24, oligo: 0.26, micro: 0.08};
const AVERAGE = (() => {
  const avg = new Float32Array(N);
  for (const t of TYPES) for (let i = 0; i < N; i++) avg[i] += PROFILES[t][i] * SHARE[t];
  const sm = new Float32Array(N);
  const k = 4;
  for (let i = 0; i < N; i++) {
    let s = 0;
    let wsum = 0;
    for (let j = -3 * k; j <= 3 * k; j++) {
      const ii = Math.min(N - 1, Math.max(0, i + j));
      const wt = Math.exp(-(j * j) / (2 * k * k));
      s += avg[ii] * wt;
      wsum += wt;
    }
    sm[i] = s / wsum;
  }
  return sm;
})();

/** Merge amount: 0 = four sharp tracks, 1 = one grey average. */
export const mergeAmount = (f: number) => ramp(f, 648, 706, easeInOutCubic) * (1 - ramp(f, 752, 806, easeInOutCubic));

const greyC = new THREE.Color(C.grey);
const mats = Object.fromEntries(TYPES.map((t) => [t, clay(TYPE_COLOR[t])])) as Record<CellType, THREE.MeshPhysicalMaterial>;
const fills = Object.fromEntries(TYPES.map((t) => [t, new THREE.MeshBasicMaterial({color: TYPE_COLOR[t], transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false})])) as Record<CellType, THREE.MeshBasicMaterial>;
const outline = new THREE.MeshBasicMaterial({color: C.charcoal, side: THREE.BackSide, transparent: true});
const baseMat = clay(C.charcoal);

function trackGeometry(values: Float32Array, reveal: number, y0: number, amp: number, from: THREE.Vector3 | null, rise: number) {
  const n = Math.max(2, Math.round(N * reveal));
  const start = Math.floor((N - n) / 2);
  const pts = new Float32Array(n * 3);
  const fillPos: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = start + k;
    const x = -WIDTH / 2 + (i / (N - 1)) * WIDTH;
    let px = x;
    let py = y0 + values[i] * amp;
    let pz = 0;
    if (from) {
      // rising from the cell: collapsed to the cell position, then lifted into its slot
      px = lerp(from.x, x, rise);
      py = lerp(from.y, py, rise);
      pz = lerp(from.z, 0, rise);
    }
    pts[3 * k] = px;
    pts[3 * k + 1] = py;
    pts[3 * k + 2] = pz;
    fillPos.push(px, lerp(from ? from.y : y0, y0, rise), pz, px, py, pz);
  }
  const line = tubeGeometry(pts, 0.065, 6);
  const fill = new THREE.BufferGeometry();
  fill.setAttribute('position', new THREE.Float32BufferAttribute(fillPos, 3));
  const idx: number[] = [];
  for (let k = 0; k < n - 1; k++) idx.push(2 * k, 2 * k + 2, 2 * k + 1, 2 * k + 1, 2 * k + 2, 2 * k + 3);
  fill.setIndex(idx);
  return {line, fill, pts};
}

export const Tracks: React.FC = () => {
  const f = useStoryFrame();
  const visible = f >= 566 && f < 905;
  // fade out as the camera dives into the neuron peak for the kit finale
  const out = ramp(f, 862, 900, (x) => x);
  const m = mergeAmount(f);
  const data = useMemo(() => {
    if (!visible) return null;
    return TYPES.map((t, i) => {
      const appear = ramp(f, 572 + i * 10, 630 + i * 10, easeOutCubic);
      const rise = ramp(f, 572 + i * 10, 622 + i * 10, easeInOutCubic);
      const reveal = 0.02 + 0.98 * ramp(f, 590 + i * 10, 640 + i * 10, easeInOutCubic);
      const vals = new Float32Array(N);
      for (let k = 0; k < N; k++) vals[k] = lerp(PROFILES[t][k], AVERAGE[k], m);
      const y = lerp(SLOT_Y(i), MERGED_Y, m);
      const cell = repCell(t);
      const from = rise < 1 ? cell.pos.clone().add(new THREE.Vector3(0, 0.6, 0)) : null;
      const g = trackGeometry(vals, reveal, y, AMP, from, rise);
      return {t, appear, ...g, edge: t === 'oligo' ? tubeGeometry(g.pts, 0.078, 6) : null};
    });
  }, [f, visible, m]);
  useEffect(
    () => () => {
      data?.forEach((d) => {
        d.line.dispose();
        d.fill.dispose();
        d.edge?.dispose();
      });
    },
    [data],
  );
  const baseline = useMemo(() => {
    const pts = new Float32Array([-WIDTH / 2, 0, 0, WIDTH / 2, 0, 0]);
    return tubeGeometry(pts, 0.02, 5);
  }, []);
  if (!data) return null;
  outline.opacity = 1 - out;
  TYPES.forEach((t) => {
    mats[t].color.set(TYPE_COLOR[t]).lerp(greyC, m);
    fills[t].color.set(TYPE_COLOR[t]).lerp(greyC, m);
    // the sand oligodendrocyte track would vanish on the light background, so it is drawn darker-edged
    fills[t].opacity = (t === 'oligo' ? 0.55 : 0.22) * (1 - out);
    mats[t].transparent = out > 0;
    mats[t].opacity = 1 - out;
  });
  return (
    <group position={NUCLEUS_CENTER} scale={TISSUE_K}>
      {data.map((d, i) => (
        <group key={d.t} visible={d.appear > 0.001}>
          <mesh geometry={d.fill} material={fills[d.t]} renderOrder={3} />
          <mesh geometry={d.line} material={mats[d.t]} />
          {d.edge ? <mesh geometry={d.edge} material={outline} /> : null}
          {d.appear > 0.9 && m < 0.02 ? <mesh geometry={baseline} material={baseMat} position={[0, SLOT_Y(i), 0]} /> : null}
        </group>
      ))}
    </group>
  );
};
