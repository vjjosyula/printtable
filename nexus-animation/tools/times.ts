import {videoSecondsForStory} from '../src/lib/timeline';
const ev: Record<string, number> = {writerArrive: 186, mark1: 226, mark2: 260, open: 262, openEnd: 316, pol1Arrive: 292, clamp: 324, pol2Bump: 372, pullback: 392, tissue: 552, tracksRise: 572, mergeStart: 648, mergeEnd: 706, split: 752, splitEnd: 806, end1: 792, end2: 812, end3: 830, end4: 858, still: 900};
for (const [k, v] of Object.entries(ev)) console.log(k.padEnd(12), v, videoSecondsForStory(v).toFixed(2));
