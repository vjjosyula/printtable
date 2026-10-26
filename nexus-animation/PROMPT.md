You are a senior scientific motion designer and a three.js / Remotion developer. Build a 90-second, procedurally generated 3D molecular animation for NEXUS Epigenomics' LinkedIn page. Everything is made in code (no stock footage, no AI video). Work in two stages: first show me a storyboard contact sheet of stills from every scene (with timestamps), and render the full video only after I approve it.

## Deliverables
- Main video: 1080 x 1350 (4:5), H.264, 30 fps, exactly 90.0 s (2700 frames), AAC 48 kHz audio, loudness about -16 LUFS, `+faststart`, LinkedIn-ready.
- A 1080 x 1080 (1:1) version of the same film, re-framed (not cropped).
- An .srt subtitle file for the voice-over.
- The full source code, so I can re-render or tweak it.

## Tech approach
- Remotion 4 with @remotion/three (React Three Fiber, three.js). Render headless with `--gl=angle`.
- Post-processing: screen-space ambient occlusion (n8ao), depth of field focused on the subject, SMAA.
- Molecules are procedural and physically plausible, about 1 unit = 1 nm:
  - Right-handed B-DNA double helix: 10.5 bp per turn, 0.34 nm rise, unequal strand spacing so major and minor grooves show, instanced base-pair rungs.
  - Nucleosomes: about 1.7 left-handed superhelical turns of DNA around a histone octamer, built as a soft blobby disc (signed distance field + marching cubes). Flexible histone tails come out of each core, and marks sit as small spheres on the tail tips.
  - Linker DNA joins nucleosomes smoothly (Hermite curves, parallel-transport frames).
- One continuous camera journey. Distance is keyframed in log space so zooms from nanometres to tissue scale feel uniform. Use eased keyframes with no overshoot. Keep subjects below the caption band.
- Font: Red Hat Display (bundle the font file locally, so headless rendering works).
- Render the 2700 frames in parallel slices (for example 12 slices of 225 frames), then concatenate them and mux the soundtrack. Check that the slice joins don't jump.

## Look and colour (dark scene throughout)
- Background and fog: #22272B (never pure black or navy). Slightly lighter haze in the distance: #2E3439. Soft diffuse light plus a gentle rim light.
- DNA backbone: cyan, #3FC8DE and #2AAFC8 for the two strands. Rungs: pale cyan-grey #A9C7CD. The DNA must clearly differ from the histones.
- Histone cores and tails: sand #D3CDAE, slightly darker than #E9E4C6, so the wrapped DNA reads.
- H3K27ac (active mark) and blue enzymes or readers: #5B8FD0. H3K27me3 (repressive mark): #D9654B.
- RNA polymerase, RNA and methyl groups: #2FA898.
- Cells:
  - Neurons: magenta #E0409A.
  - Astrocytes: #2FA898.
  - Oligodendrocytes: #E9E4C6.
  - Microglia: #D9654B.
- Neurons must look like textbook neurons, not worms or balls:
  - An irregular, slightly lumpy star-shaped soma that flows smoothly into its processes.
  - About 6 curving dendrites that taper and fork once or twice into fine tips.
  - One long, thin axon wrapped in sand-coloured myelin segments with small gaps (nodes of Ranvier), ending in 3 short branches with bulb-shaped synaptic terminals.
  - No sphere-like nucleus bulging out of the body.
- Captions: text #FBF9F6 on a rounded band of #2E3439 at 85% opacity, near the top of the frame. Exactly one key word per caption is highlighted in light blue #8DB3E2. Words pop in one after another.
- Kit tags: a rounded label with white text and a thin leader line to the object. HisTLAND tag colour #295D9B, MeTLAND tag colour #20887D.
- NEXUS logo: a small light rounded tile in the bottom-left corner from 1.5 s to 85 s. The end card uses the logo in off-white #FBF9F6 on the dark background.
- All text must pass WCAG AA contrast on the dark background.

## Story, visuals and on-screen captions (video seconds)
1. 0 to 10 s:
   - Inside a nucleus, close on DNA wrapped around histones (beads on a string).
   - Captions: "Every cell carries the same DNA." / "Your DNA is wrapped around histones."
2. 10 to 17 s:
   - Histone tails sway, and small marks appear on them.
   - Caption: "Marks on histones decide which genes are read."
3. 17 to 25 s:
   - A blue writer enzyme adds H3K27ac (blue) to a tail.
   - The nucleosomes slide apart, the DNA opens, and RNA polymerase (#2FA898) clamps on and reads the gene.
   - Tag: "H3K27ac · active mark · DNA opens".
   - Caption: "H3K27ac opens the DNA."
4. 25 to 31 s:
   - Elsewhere, nucleosomes covered in coral H3K27me3 marks pack into a tight coil. A second polymerase bumps into it and can't get in.
   - Tag: "H3K27me3 · repressive mark · DNA locked".
   - Caption: "H3K27me3 locks it shut."
5. 31 to 41 s:
   - Pull back out of the nucleus and the neuron into brain tissue: a few neurons, astrocytes, oligodendrocytes and microglia, each labelled once with a small coloured name tag.
   - Caption: "Every cell type reads different genes."
6. 41 to 45 s:
   - The camera dives back into one neuron's nucleus to a short stretch of 3 nucleosomes. Methyl groups (#2FA898 lollipops) pop onto the DNA one after another.
   - Caption: "DNA methylation adds a second layer."
7. 45 to 51 s:
   - One nucleosome carries a blue active mark and a coral repressive mark at the same gene. An antibody-like Y-shaped blue reader docks on the blue mark only, and the coral mark fades.
   - Two separate sample tubes appear, one blue and one coral, each with its own peaky signal track drawing in above it. Small labels: "Sample 1 / H3K27ac" and "Sample 2 / H3K27me3".
   - Caption: "Most methods read one mark at a time."
8. 51 to 58 s:
   - Methylated DNA slides through a glowing coral, translucent "harsh treatment" box and comes out broken into fragments.
   - Beside it, a very tall stack of sequencing reads (thin sand-coloured bars) builds up, and the camera pulls back to show its height.
   - Caption: "Methylation maps mean harsh chemistry and huge sequencing runs."
9. 58 to 65 s:
   - A top-down view of one central lab bench with a glowing protocol sheet, surrounded by about 8 small, dim labs on a ring. Request tokens fly in from every lab and pile up beside the central bench.
   - Caption: "The best methods stayed in the labs that built them."
10. 65 to 75 s:
    - The glowing protocol turns into a kit box (sand body, #295D9B lid, #20887D stripe). Copies fly out along arcs to every lab, each lab lights up teal on arrival, and the request pile fades away.
    - Captions: "NEXUS was founded to close these gaps." then "Published methods. Ready-to-use kits."
11. 75 to 80 s, HisTLAND:
    - One nucleosome with a blue and a coral mark. A blue reader and a coral reader dock at the same time, both signals flow into one tube (half blue, half coral liquid), and two tracks draw in above it.
    - Tag: "HisTLAND · histone marks · bulk + single cell".
    - Caption: "HisTLAND: two histone marks from one sample, in bulk or single cells."
12. 80 to 85 s, MeTLAND:
    - Intact cyan DNA with teal methyl groups (no harsh box, no fragments) and a short stack of reads.
    - Tag: "MeTLAND · DNA methylation · bulk".
    - Caption: "MeTLAND: genome-wide methylation, no bisulfite, no antibodies."
13. 85 to 90 s, end:
    - The scene fades to the dark background, and only the NEXUS logo remains, large and centred.
    - No other text.

## Voice-over (warm, clear female voice, about 1.05x speed; any good TTS)
Start times are in seconds:
- 0.4: "Every cell in your body carries the same DNA."
- 3.6: "About two metres of it, wrapped around proteins called histones, like thread on spools."
- 10.2: "Small chemical marks on histone tails decide which genes are read."
- 14.3: "Here, an enzyme adds an activating mark, H3 K27 acetylation."
- 19.8: "The nucleosomes slide apart, so polymerase can read the gene."
- 24.2: "Elsewhere, H3 K27 tri-methylation packs the DNA tightly."
- 29.3: "The polymerase can't get in. The gene stays silent."
- 32.5: "Zoom out, and every cell type has its own pattern of marks."
- 36.0: "Neurons, astrocytes, oligodendrocytes and microglia each read different genes."
- 41.6: "DNA methylation adds a second layer, written on the DNA itself."
- 46.0: "But most methods read one histone mark at a time, so on and off genes are measured in separate samples."
- 52.0: "Methylation maps rely on bisulfite, which damages DNA, and on very deep sequencing."
- 58.3: "And the best methods stayed in the labs that built them."
- 65.0: "NEXUS Epigenomics was founded in Stockholm in 2024 to close these gaps,"
- 70.6: "turning methods published in Nature Biotechnology into ready-to-use kits."
- 75.9: "HisTLAND reads two histone marks from one sample, in bulk or in single cells."
- 80.7: "MeTLAND maps DNA methylation without bisulfite or antibodies."

Notes:
- In the TTS input, write "Histland" and "Metland" so they are pronounced correctly. Subtitles always spell them HisTLAND and MeTLAND.
- No voice after 85 s; the logo end card plays to music only.

## Music and sound
- A warm, hopeful, slightly scientific bed: soft pad, marimba-like arpeggio, gentle pulse.
- Subdued and darker during the gap beats (45 to 65 s). Brighter from the kits (65 s on). A final chord under the logo.
- Soft sound accents synced to events: pops when marks and methyl groups appear, clicks when readers dock, a thud for the harsh treatment, chimes as kits arrive in the labs.
- Duck the music under the voice.
- Royalty-free: synthesise it or use properly licensed music.

## Approved facts (use only these)
- NEXUS Epigenomics was founded in Stockholm in 2024.
- The kits are built on methods published in Nature Biotechnology.
- HisTLAND profiles histone marks, reads two marks from the same sample, and works in bulk and in single cells, on cell lines and fresh or frozen tissue.
- MeTLAND profiles DNA methylation (5mC) in bulk, without bisulfite or antibodies, with far fewer sequencing reads than whole-genome bisulfite sequencing.

## Never
- Never say or imply that bulk profiling, tissue averages or "blending" is the problem NEXUS solves. The gaps are: one mark per experiment, harsh and expensive methylation chemistry, and methods stuck in the labs that built them.
- Never say MeTLAND works in single cells or sorted cells. Never claim per-CpG levels, 5hmC or FFPE.
- No numbers about the kits, no competitor names, no prices.
- Spell HisTLAND and MeTLAND exactly like that everywhere (never "Histland" on screen).
- No colons in captions except the two kit captions.
- No em dashes in any on-screen text.

## Done when
- The storyboard is approved.
- Every caption matches the text above word for word.
- All text passes WCAG AA contrast.
- The DNA (cyan) is clearly different from the histones (sand).
- The neurons look like textbook neurons.
- The 4:5 and 1:1 versions are each exactly 90.0 s with no visible jumps.
- The .srt matches the voice-over.
