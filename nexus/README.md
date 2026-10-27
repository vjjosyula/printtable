# NEXUS animation (Remotion + three.js)

Procedural 3D molecular animation used for the 90 s NEXUS Epigenomics film.
Everything is generated in code: no stock footage, no video editor.

## Run

```bash
npm install
npx remotion studio src/index.ts        # live preview in the browser
./render_slice.sh Nexus 0 2699 out.mp4  # silent render of a frame range
node stills.mjs ./stills Nexus 60 900   # single frames, for a storyboard
```

Compositions are declared in `src/Root.tsx`:
`Nexus` 1080x1350 (LinkedIn), `NexusSquare` 1080x1080, `NexusYouTube` 1920x1080.

## What lives where

| Path | What it does |
|---|---|
| `src/Root.tsx` | composition sizes and duration |
| `src/Main.tsx` | puts the 3D canvas, the overlay and the audio together; decides which scene is on screen when |
| `src/Overlay.tsx` | captions, mark tags, cell labels, kit tags, end card (plain HTML/CSS) |
| `src/lib/brand.ts` | the whole palette |
| `src/lib/timeline.ts` | video time to story time mapping; `INTRO_END`, `STORY_STOP_S` |
| `src/lib/chromatin.ts` | B-DNA geometry, nucleosome superhelix, centrelines, marks |
| `src/lib/geom.ts` | tube geometry, signed distance fields, marching cubes |
| `src/lib/proteins.ts` | histone octamer, writer enzyme, RNA polymerase shapes |
| `src/scene/view.ts` | the camera for every second of the film, plus `fovFor` per aspect ratio |
| `src/scene/camera.ts` | the chromatin-section camera splines |
| `src/scene/Rig.tsx` | camera, fog, ambient occlusion, depth of field, rendering |
| `src/scene/Chromatin.tsx` | the nucleosome chain, marks, polymerase |
| `src/scene/Tissue.tsx` | brain cells (neurons, astrocytes, oligodendrocytes, microglia) |
| `src/scene/Nucleus.tsx` | nuclear envelope, fibres, nucleolus |
| `src/scene/GapStage.tsx` | the kit scenes: HisTLAND, methylation, MeTLAND, labs, two layers |
| `audio/script.json` | the narration: start time, spoken text, subtitle text, speed |
| `audio/gen_narration.py` | text to speech (Kokoro) |
| `audio/make_audio.py` | music bed, sound accents, ducking, final mix |
| `audio/make_srt.py` | subtitles from the script and the audio lengths |

## Making a shorter film (for example HisTLAND only)

1. Set the duration in `src/Root.tsx`.
2. Cut `audio/script.json` down to the lines you want and re-time them, then
   regenerate: narration, `make_audio.py`, `make_srt.py`.
3. Trim `CAPTIONS` at the top of `src/Overlay.tsx` to match.
4. In `src/scene/view.ts`, keep only the camera keys you need (`KEYS`), and in
   `src/scene/GapStage.tsx` keep only the scenes you want (each is one
   `win(t, from, to)` block). `STAGE` holds the x position of each scene.
5. Render slices in parallel and concatenate:
   `ffmpeg -f concat -safe 0 -i list.txt -i public/soundtrack.wav ... out.mp4`

The scene code is reusable on its own: `DNA`, `Nucleosomes`, `SampleTube`,
`Track`, `ReadStack`, `Kit` and the reader protein in `GapStage.tsx` take plain
props, so a new film can import them and place them anywhere.

## Reproducing the full film

`PROMPT.md` describes the finished 90 s cut: every scene, caption, voice line,
timing, colour and rule. Hand it to a coding agent, or follow it by hand.
