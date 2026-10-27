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

/**
 * Film structure (video seconds): 0..INTRO_END brain tissue intro and the dive into a neuron,
 * INTRO_END..STORY_STOP the chromatin story (story seconds 0..13, the original 31 s cut, played a little faster),
 * then the kit stage (scene/view.ts, scene/GapStage.tsx) on video time.
 */
export const INTRO_END = 20.6;
export const STORY_STOP_S = 40.2;
const STORY_LEN = 31; // original video length of the chromatin section, the KEYS domain used here

function remap(u: number): number {
  const s = Math.max(0, Math.min(STORY_LEN, u));
  let i = 0;
  while (i < KEYS.length - 2 && s > KEYS[i + 1][0]) i++;
  const [x0, y0] = KEYS[i];
  const [x1, y1] = KEYS[i + 1];
  const h = x1 - x0;
  const v = (s - x0) / h;
  const v2 = v * v;
  const v3 = v2 * v;
  return (2 * v3 - 3 * v2 + 1) * y0 + (v3 - 2 * v2 + v) * h * tangents[i] + (-2 * v3 + 3 * v2) * y1 + (v3 - v2) * h * tangents[i + 1];
}

export function storySeconds(videoSeconds: number): number {
  if (videoSeconds <= INTRO_END) return 0;
  return remap(((videoSeconds - INTRO_END) * STORY_LEN) / (STORY_STOP_S - INTRO_END));
}

/** Story frame (fractional) for a video frame. */
export const storyFrame = (videoFrame: number) => storySeconds(videoFrame / FPS) * 30;
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
