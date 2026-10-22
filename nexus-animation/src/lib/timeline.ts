import {useCurrentFrame} from 'remotion';

export const FPS = 30;
export const DURATION_S = 90;
export const DURATION_FRAMES = DURATION_S * FPS;

/**
 * The animation is choreographed on a "story clock": 0..27 s is the original 32 s story (to the split of the tracks), 27..55 s is the kit finale. The 90 s cut plays it
 * through a smooth, monotone time remap so each beat gets room without anything ever freezing.
 * Keys: [video seconds, story seconds].
 */
const KEYS: [number, number][] = [
  [0, 0],
  [10, 6],
  [17, 8.7],
  [24, 11.0],
  [31, 13],
  [42, 19],
  [57, 25],
  [62, 27],
  [90, 55],
];

// Fritsch-Carlson monotone cubic tangents
const tangents = (() => {
  const n = KEYS.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((KEYS[i + 1][1] - KEYS[i][1]) / (KEYS[i + 1][0] - KEYS[i][0]));
  const m = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return m;
})();

export function storySeconds(videoSeconds: number): number {
  const s = Math.max(0, Math.min(DURATION_S, videoSeconds));
  let i = 0;
  while (i < KEYS.length - 2 && s > KEYS[i + 1][0]) i++;
  const [x0, y0] = KEYS[i];
  const [x1, y1] = KEYS[i + 1];
  const h = x1 - x0;
  const u = (s - x0) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * h * tangents[i] + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * h * tangents[i + 1];
}

/** Story frame (0..960, fractional) for a video frame. */
// the story clock stops when the film dives into the gap stage (see scene/view.ts GAP_T0)
export const STORY_STOP_S = 41.2;
export const storyFrame = (videoFrame: number) => storySeconds(Math.min(videoFrame / FPS, STORY_STOP_S)) * 30;
export const useStoryFrame = () => storyFrame(useCurrentFrame());

/** Inverse: video seconds at which a story frame happens (for audio cue placement). */
export function videoSecondsForStory(storyF: number) {
  let lo = 0;
  let hi = DURATION_S;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (storySeconds(mid) * 30 < storyF) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
