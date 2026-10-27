# Prompt: rebuild the NEXUS Epigenomics 90-second animation

Paste everything below into Claude Code (or another agent that can run Node and a headless browser).

---

Build a 90-second, procedurally generated 3D molecular animation for NEXUS Epigenomics. Everything is made in code: no stock footage, no AI video, no slides. Show me a storyboard contact sheet of stills (with timestamps) before rendering the full film.

## Deliverables
- LinkedIn: 1080 x 1350 (4:5), H.264, 30 fps, exactly 90.0 s (2700 frames), AAC 48 kHz, about -16 LUFS, `+faststart`.
- YouTube: 1920 x 1080 (16:9 landscape), same film reframed (wider camera, not cropped, smaller captions).
- One .srt subtitle file.
- The source code.

## Tech
- Remotion 4 + @remotion/three (React Three Fiber, three.js), rendered headless with `--gl=angle`.
- Post-processing: screen-space ambient occlusion (n8ao), depth of field on the subject, SMAA.
- Procedural molecules, roughly 1 unit = 1 nm:
  - Right-handed B-DNA: 10.5 bp per turn, 0.34 nm rise, unequal strand offset so major and minor grooves show, instanced base-pair rungs.
  - Nucleosomes: ~1.7 left-handed superhelical turns of DNA around a histone octamer built as a soft blobby disc (signed distance field + marching cubes), with flexible tails; marks are small spheres on the tail tips.
  - Linker DNA joins nucleosomes with Hermite curves and parallel-transport frames.
- One continuous camera journey, distance keyframed in log space, eased segments with zero velocity at each key so nothing overshoots.
- Font: Red Hat Display, bundled locally so headless rendering works.
- Render 2700 frames as 12 slices of 225 per format, in parallel, then concatenate and mux the soundtrack. Verify each slice is 225 frames and check the joins for jumps.

## Look (light, clean)
- Background: warm off-white #FBF9F6 with faint colour washes, light all the way through.
- Soft bright studio light, gentle rim light, shallow depth of field, matte clay materials.
- DNA: strands #688CB6 (blue) and #62AAA1 (teal), rungs sand #E9E4C6.
- Histones: sand #E9E4C6 discs with DNA wrapped ~1.7 turns.
- Active mark H3K27ac: #295D9B. Repressive mark H3K27me3: #BE5038. Methyl groups, polymerase and RNA: #20887D.
- Cells: neurons soft blue #5B8FD0, astrocytes teal, oligodendrocytes sand, microglia coral.
- Neurons must look like textbook neurons: an irregular star-shaped soma flowing into ~6 tapering dendrites that fork once or twice into fine tips, plus one long thin axon wrapped in sand myelin segments with small gaps, ending in 3 branches with bulb terminals. No bulging nucleus.
- Captions: charcoal #3F444A on a rounded #F4F1EC band near the top, one key word per caption in #295D9B, words popping in one after another. Smaller and higher in the landscape version.
- Mark tags are terracotta #BE5038 with white text. Kit tags: HisTLAND® #295D9B, MeTLAND® #20887D.
- Small NEXUS logo bottom-left from 1.5 s to 81.8 s.
- All text passes WCAG AA on the light background.

## Structure (the point: introduce each layer, then link it to its kit)
Video seconds, with the exact captions:

1. 0 to 1.9: quiet wide drift over brain tissue, no caption.
2. 1.9: "Every cell carries the same DNA." Cells are labelled once each (Neuron, Astrocyte, Oligodendrocyte, Microglia).
3. 5.3: "So why does a neuron behave nothing like the cell beside it?"
4. 9.1: "In any one cell, only part of that DNA is switched on."
5. 13.7: "Which genes are on is set by the epigenome."
6. 17.1: "Two layers: histone modifications, and DNA methylation." The camera dives into one neuron's nucleus.
7. 20.7: "Layer one: modifications on histones." Arrive at DNA wrapped around histones.
8. 25.7: "Marks on histone tails decide which genes are read."
9. 29.9: "Acetylation opens the DNA." A blue writer adds H3K27ac, nucleosomes slide apart, teal polymerase reads the gene. Tag: "H3K27ac · active mark · DNA opens".
10. 35.4: "Methylation of the histone locks it shut." Coral H3K27me3 marks pack a tight coil, polymerase cannot get in. Tag: "H3K27me3 · repressive mark · DNA locked".
11. 40.6: "To measure both marks, NEXUS built HisTLAND®." One nucleosome with a blue and a coral mark; a blue and a coral Y-shaped reader dock at once.
12. 44.7: "Two histone marks from one sample, in bulk or single cells." Both signals flow into one tube, two tracks draw in. Tag: "HisTLAND® · histone marks · bulk + single cell".
13. 49.9: "Layer two: methylation on the DNA itself." Bare DNA, no histones, with teal methyl lollipops appearing along it.
14. 56.0: "To map it genome-wide, NEXUS built MeTLAND®." Tag: "MeTLAND® · DNA methylation · bulk".
15. 59.7: "No bisulfite, no antibodies." Intact DNA beside a short stack of sequencing reads.
16. 66.3: "Built around published methods from academic labs." A glowing protocol page on a central bench, ringed by small labs.
17. 72.2: "Made into kits you can run in your own lab." The protocol becomes a kit box; copies fly out and each lab lights up.
18. 75.4: "Two layers, measured with HisTLAND® and MeTLAND®." Both histone marks and methyl groups on the same DNA, with both kit tags.
19. 82.0 to 90: end card on the light background: NEXUS logo, "Founded in Stockholm.", then "What is the question you are solving in epigenetics?"

## Voice-over (warm clear female voice, ~1.05x; any good TTS)
- 2.0 "Every cell in your body carries the same DNA."
- 5.4 "So why does a neuron behave nothing like the cell beside it?"
- 9.2 "Because in any one cell, only part of that DNA is ever switched on."
- 13.8 "Which genes are switched on is set by the epigenome."
- 17.2 "Two layers: histone modifications, and methylation of the DNA."
- 21.8 "Layer one: the histones that DNA is wrapped around."
- 25.8 "Chemical marks on their tails decide which genes are read."
- 30.0 "Acetylation opens the DNA, so the gene can be read."
- 35.5 "Methylation of the histone packs it tightly, and the gene stays silent."
- 41.2 "To measure both marks together, NEXUS built Histland."
- 44.8 "It reads two histone marks from one sample, in bulk or in single cells."
- 50.2 "Layer two sits on the DNA itself: methylation."
- 56.4 "To map it genome-wide, NEXUS built Metland."
- 59.8 "It maps DNA methylation without bisulfite or antibodies."
- 66.4 "NEXUS Epigenomics, founded in Stockholm, builds kits around published methods from academic labs."
- 72.6 "Ready to run in your own lab."
- 75.8 "Two layers of the epigenome, measured with Histland and Metland."
- 82.8 "What is the question you are solving in epigenetics?"

Write the kit names as "Histland" and "Metland" in the TTS input so they are pronounced correctly. On screen and in the subtitles always write HisTLAND® and MeTLAND®.

## Music
Warm, hopeful, slightly scientific: soft pad, marimba-like arpeggio, gentle pulse, brighter from the kits on, final chord at 82.0. Soft accents on events: pops for marks and methyl groups, clicks when readers dock, chimes when kits arrive. Duck the music under the voice. Synthesise it or use properly licensed music.

## Approved facts (only these)
- NEXUS Epigenomics was founded in Stockholm.
- The kits are built on published methods from academic labs.
- HisTLAND® profiles histone marks, reads two marks from the same sample, and works in bulk and in single cells, on cell lines and fresh or frozen tissue.
- MeTLAND® profiles DNA methylation (5mC) in bulk, without bisulfite or antibodies, with far fewer sequencing reads than whole-genome bisulfite sequencing.

## Never
- Never give the founding year or name the journal.
- Never say or imply that bulk profiling, tissue averages or diluted signals are the problem NEXUS solves, and never say NEXUS was founded to close a gap.
- Never say MeTLAND® works in single cells or sorted cells. Never claim per-CpG levels, 5hmC or FFPE.
- Never use "rare cells"; just say microglia. Always introduce cell types with context ("In the brain, ...").
- No numbers about the kits, no competitor names, no prices, no em dashes, and no colons in captions except the layer labels.
- Always spell HisTLAND® and MeTLAND® with the ® sign.
- Never show histones in the layer-two scene; layer two is bare DNA, so it never looks like a return to layer one.

## Done when
- The storyboard is approved.
- Every caption matches the text above.
- The science is right: right-handed helix, DNA wrapped around histones, marks on tails, methyl groups on the DNA.
- The neurons look like textbook neurons.
- Each layer is introduced and then explicitly linked to its kit, and the ending merges both.
- Both formats are exactly 90.0 s with no visible jumps at the slice joins, and the .srt matches the voice-over.
