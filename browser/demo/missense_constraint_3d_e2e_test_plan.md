# 3D missense constraint: end-to-end test plan

> **DONTMERGE.** This is a temporary document on `jg/3d-missense-constraint`, shared for team review. It will be removed before the branch is opened as a PR. Nothing in it is implemented yet.

## Why

The 3D missense constraint track and its AlphaFold structure panel are covered by Jest. Those tests mock the WebGL viewer, so nothing yet shows, in a real browser, that:

- the track shows the right data for the demo gene, GRIN2B;
- the structure isn't loaded until "Show structure" is clicked;
- the viewer loads and renders every coloring;
- UniProt feature and ClinVar variant overlays appear;
- the structure can be rotated.

This plan adds a Playwright test for all of that on the GRIN2B demo. It runs once for each viewer library, 3Dmol.js and Mol\*, because both are kept behind a "Viewer" toggle until one is chosen. Like the existing `tests/e2e` specs, it is meant for local and pre-demo runs, not CI.

## What the test checks

The requirements for the test, and the test steps (A1–A8 and B0–B7, below) that cover each:

| Requirement                                    | Test steps         |
| ---------------------------------------------- | ------------------ |
| The track shows the correct 3D constraint data | A1, A2, A5, B4     |
| The structure viewer loads                     | A4, A7, B1         |
| Coloring by 3D o/e, o/e upper bound, Regions   | A6 (track), B2     |
| Coloring by RMC o/e and RMC regions            | A6, B2             |
| Coloring by pLDDT                              | B1, B2             |
| UniProt features and ClinVar variants          | B3, B4             |
| The structure rotates (and Reset view)         | B6                 |
| The structure isn't shown until toggled        | A3, A4, A8, B1, B7 |

## Changes to the feature that the test needs

Writing the test turned up three gaps. These fixes were agreed during planning.

1. **New "RMC regions" coloring.** It uses the same rule as the 3D "Regions" option: RMC regions with p ≤ 1e-3 are ranked by o/e, the 10 lowest get distinct colors, and all other residues are gray. For GRIN2B, 10 of 19 RMC regions are colored.
   - `missenseConstraint3d.ts`:
     - add `'regional_missense_constraint_ranked_regions'` to `StructureColorBy`;
     - add an `isRegionColorBy` type guard, so the track maps every structure-only mode to o/e;
     - add `rankedRegionColor(rank)` and `rankedRegionsLegendSeries(count)`;
     - split `regionalMissenseConstraintResidueRange(region)` out of `regionalMissenseConstraintByResidue`;
     - add `rankRegionalMissenseConstraintRegions(regions)`. It returns a map keyed by region object, because RMC regions have no index. It skips regions with no residue range (such as the `has_no_rmc_evidence` placeholder), with a null o/e, or with p > 1e-3. It sorts by o/e, then by first residue, and keeps the top 10.
   - `MissenseConstraint3dStructurePanel.tsx`:
     - add an "RMC regions" option after "RMC o/e", under the same condition;
     - add a branch in the colors memo;
     - add a structure-only key, "RMC regions ranked by missense o/e", built the same way as the pLDDT key.
   - Help topic: add an "RMC regions" bullet.
   - Jest: unit tests for the ranking, and track tests for the option, its colors and its key.
2. **"Reset view" restores rotation.** Today it re-centers the structure but keeps any rotation, in both viewers.
   - 3Dmol: save `viewer.getView()` after the first framing, and restore it with `setView` on reset.
   - Mol*: `frameConfidentResidues()` builds the camera with `camera.getInvariantFocus(center, radius, up, direction)`, using a fixed up and direction and Mol*'s default focus padding. It then applies it with `plugin.managers.camera.setSnapshot(snapshot, 0)`. The starting view doesn't change.
3. **Ranked palette: gold instead of gray.** The 8th Tableau 10 color is mid-gray (#7f7f7f). With RMC regions on GRIN2B, rank 8 is residues 35–382, which would look like the light-gray unranked residues. Replace it with gold (#e7ba52). This also affects the 3D "Regions" coloring, but only for genes with 8 or more ranked regions; GRIN2B has 6.

## Test design

### Files

- `tests/e2e/MissenseConstraint3d.playwright.spec.ts`
- `tests/e2e/missenseConstraint3d/structureViewerProbe.ts` is an in-page probe, installed with `page.addInitScript`. It is the only code that touches React, 3Dmol or Mol\* internals.
- `tests/e2e/missenseConstraint3d/expectations.ts` holds the oracle, which restates the coloring and placement rules independently of the app. It also holds the golden values.

The helper files don't match `*.spec.*`, so Playwright won't run them as tests. They are type-checked by `make typecheck-browser`. They import only types from `browser/src`, so the expectations don't reuse app logic.

### Data sources

| Data                                    | Source                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MissenseConstraint3d` query            | The dev server's DONTMERGE GRIN2B fixture. The test watches the request without intercepting it, checks its variables, and uses the captured response. |
| Gene and `MissenseConstraint3dVariants` | Live gnomAD API, as in the other e2e specs                                                                                                             |
| Structure                               | Live AlphaFold DB (`AF-Q13224-F1-model_v6`)                                                                                                            |
| Expected pLDDT                          | AlphaFold's per-residue file, `AF-Q13224-F1-confidence_v6.json`                                                                                        |
| RMC                                     | The bundled DONTMERGE GRIN2B RMC JSON                                                                                                                  |

ClinVar and gnomAD counts change over time. The test recomputes them from each run's responses.

### How the test reads the viewer

These were checked interactively against the local dev server in Chrome, for both viewers.

- **Finding the viewer component.** The probe walks from the viewer's canvas up the React fiber tree to `StructureViewer3Dmol` or `StructureViewerMolstar`. Mol\* wraps its canvas in a div of its own, so the probe first walks up to the nearest React-created node.
- **Exact state read from the viewer:**
  - per-residue colors: 3Dmol's `style.cartoon.colorfunc`, Mol\*'s color theme evaluated at each residue;
  - each overlay's residues, color and visibility;
  - highlighted residues;
  - the camera: 3Dmol `getView()`, Mol\* `camera.getSnapshot()`;
  - residue names and pLDDT.
- **Probe helpers:**
  - `settle()` waits for Mol\*'s update and commit queues and any camera transition to finish, plus 2 animation frames.
  - `screenPoint(residue)` projects a residue's CA atom to screen coordinates for hovering.
  - `pixelStats()` draws the canvas into a 2D canvas. It reports the share of non-white pixels in three hue bands: blue, dark red and magenta. "Present" means more than 2% and "absent" means less than 0.2%.
  - `saveImage()` and `imageDifference()` compare canvas snapshots.
- **Track tooltips.** An in-page loop fires `mouseover`/`mouseout` on each of the track's 128 rects (118 segments) in about 0.7 s. It runs before the structure is shown.
- **Color controls.** The radio inputs are visually hidden. Click the `<label>`, then assert `getByRole('radio', { name, exact: true })` is checked. `exact` is needed because "Regions" would otherwise also match "RMC regions".
- **"Not shown until toggled".** Checking for no canvas doesn't work, because the variant tracks already draw two canvases. Instead the test checks that:
  - the panel's controls and attribution are absent;
  - the probe finds no viewer;
  - no AlphaFold, variants or viewer-chunk requests (`/js/.*(3dmol|molstar)/i`) were made.
- **Errors.** The test fails on `pageerror` and on the viewer's own `failed to (load|update) structure` console errors. It ignores the dev build's React warnings.

### Part A: track, data and toggling

Uses `/gene/ENSG00000273079?dataset=gnomad_r4` with the default viewer, 3Dmol. The steps run in order on one shared page.

1. **Query.** The page requests `MissenseConstraint3d` with `{geneId: ENSG00000273079, referenceGenome: GRCh38}`. The response matches the golden identity, region and feature values.
2. **Track data.** The tooltip sweep runs before the structure is shown. It checks that:
   - all 118 segments appear;
   - each rect's region label, o/e, upper bound, p-value and fill match the oracle;
   - three segments' genomic coordinates match Ensembl.
3. **Nothing loads early.** Nothing is rendered or requested for the structure before "Show structure" is clicked.
4. **Show structure.** Clicking it:
   - sends the variants query once, with `{transcriptId: ENST00000609686, datasetId: gnomad_r4, referenceGenome: GRCh38}`;
   - loads only 3Dmol's chunk;
   - fetches `AF-Q13224-F1-model_v6.cif` successfully;
   - brings the viewer to `ready`.
5. **Genomic placement.** Every placed gnomAD and ClinVar missense variant falls inside the genomic span of the track segment that holds its residue. This checks the residue-to-genome mapping on a minus-strand gene against real variant positions. In a trial run against the live API, all 1306 gnomAD and 921 ClinVar placements passed. Four known ClinVar variants must also be present.
6. **Each of the 6 color modes:**
   - The track's fills and legend are right. The RMC and pLDDT modes keep 3D o/e colors on the track.
   - The structure-only key appears only for RMC o/e, RMC regions and pLDDT.
   - "Color catch-all region" is enabled only for o/e and o/e upper bound. Turning it on colors the catch-all rects `#ffffb2`.
7. **Switching the viewer to Mol\*:**
   - loads the Mol\* chunk only at that point;
   - keeps the colors, and the ClinVar overlay stays on;
   - sends no second variants request;
   - changes the attribution to "Rendered with Mol\*".
8. **Hide structure.** It detaches the canvas and removes the panel.

### Part B: once per viewer (`?viewer=3dmol`, `?viewer=molstar`)

The steps run in order on one shared page.

0. **WebGL check.**
   - Create a `webgl2` context with `failIfMajorPerformanceCaveat` and record the renderer string.
   - Fail early on a software renderer (SwiftShader), because Mol\* refuses to run on one.
1. **Loading.**
   - Nothing loads before "Show structure". After it, only this library's chunk loads.
   - The structure is fetched as `.cif` by 3Dmol and `.bcif` by Mol\*.
   - The viewer reaches `ready` with no error or loading message.
   - The attribution names the library.
   - All 1484 residue names match the protein sequence.
   - Every residue's pLDDT is within 0.01 of AlphaFold's file.
   - The canvas isn't blank.
2. **Coloring.** For each of the 6 modes, and for o/e with the catch-all region colored:
   - The viewer's colors equal the oracle for all 1484 residues.
   - The per-color residue counts match the golden values.
   - The sample residues match.
   - Pixels confirm the render:
     - blue is present for Regions, RMC regions and pLDDT, and absent otherwise;
     - dark red is present for o/e, o/e upper bound and RMC o/e, and absent for pLDDT.
3. **Overlays.** All 13 overlays are toggled one at a time: gnomAD, ClinVar and the 11 UniProt feature types present in GRIN2B.
   - Each label reads "label (count)" with the oracle's count.
   - When on, the viewer shows exactly the oracle's residues in the overlay's color.
   - When off, the overlay is removed (3Dmol) or hidden (Mol\*).
   - The note about variants that couldn't be placed matches the oracle.
4. **Residue tooltips.** ClinVar and Transmembrane are turned on.
   - Hover the projected CA atoms of candidate residues: known ClinVar residues first, then transmembrane, ranked-region and catch-all residues.
   - Check every tooltip against the oracle:
     - residue name;
     - region lines;
     - RMC o/e and p;
     - pLDDT;
     - a ClinVar line exactly when the residue has pathogenic or likely pathogenic variants;
     - a UniProt line exactly when the residue is in a transmembrane feature.
   - Require at least 8 checked tooltips, covering a ClinVar line, a UniProt line, a catch-all residue and a ranked residue.
5. **Track-hover highlight.**
   - Hovering a rank-1 track rect highlights exactly that region's 285 residues on the structure, and magenta pixels appear.
   - Moving the mouse away clears both.
6. **Rotate and reset.**
   - Record the camera and the image.
   - Drag across the canvas, well past Mol\*'s 4 px click-to-focus threshold.
   - The orientation changes by more than 10° and more than 1% of pixels change.
   - After "Reset view", the camera is back to its starting values within 1e-6, and less than 0.2% of pixels differ.
7. **Hide.** The canvas is detached and the panel is gone.

### Waits and timeouts

- **Page load.** Against the live API, the "Show structure" button appears after about 10 s. Allow 60 s, with a 120 s timeout per test group.
- **Viewer ready.** Poll the viewer status until it is `ready` (60 s), then call `settle()`.
- **3Dmol** updates synchronously, so one frame is enough.
- **Mol\*.** Call `settle()`, then poll the state reads.
- **Before any pixel capture,** move the mouse off the canvas, because Mol\* tints hovered residues.
- **Fixed waits.** The only one is up to 500 ms per hover while the tooltip appears.

## Expected values

### Oracle rules

- **o/e bins:** > 0.8 `#ffffb2`, > 0.6 `#fecc5c`, > 0.4 `#fd8d3c`, > 0.2 `#de351b`, otherwise `#9b001f`. The catch-all region is gray (`#e2e2e2`) unless "Color catch-all region" is on.
- **Regions:** non-catch-all regions with p ≤ 1e-3, sorted by o/e and then index; the top 10 get palette colors.
- **RMC o/e:** RMC regions with p ≤ 1e-2 get the o/e bins, matching the existing RMC track. No GRIN2B region has p between 1e-3 and 1e-2.
- **Shared RMC boundaries:** where two RMC regions share a residue, the later region in the array wins. This happens for 13 residues.
- **pLDDT:** scores from AlphaFold's file. > 90 `#0053d6`, > 70 `#65cbf3`, > 50 `#ffdb13`, otherwise `#ff7d45`. Three residues score exactly 90.0. AlphaFold's own per-residue category calls them "Very high", while the legend, the app and Mol\*'s pLDDT theme all call them "Confident". The test follows the legend.
- **ClinVar overlay:** missense variants with any significance in {Pathogenic, Pathogenic/Likely pathogenic, Likely pathogenic, association, risk factor}, whose HGVSp reference amino acid matches the sequence. At the time of writing: 157 variants on 100 residues.
- **gnomAD overlay:** missense variants that pass in exomes or genomes. At the time of writing: 1182 variants on 740 residues.

### GRIN2B 3D constraint (fixture)

The fixture covers ENST00000609686 (UniProt Q13224), a 1484 aa protein:

- 27 regions; idx 26 is the only catch-all region.
- 118 segments, which tile residues 1–1484 exactly.
- 38 UniProt features:
  - Transmembrane: 3 (558–576, 631–646, 818–837)
  - Intramembrane: 1
  - Topological domain: 5
  - Region of interest: 6
  - Motif: 1
  - Binding site: 3
  - Metal binding: 2
  - Site: 1 (615)
  - Disulfide bond: 8
  - Glycosylation: 7
  - Signal peptide: 1 (1–26)

| Rank | Region idx | o/e               | Upper bound | p         | First segment |
| ---- | ---------- | ----------------- | ----------- | --------- | ------------- |
| 1    | 0          | 0.1366 (49/358.7) | 0.1733      | 4.166e-60 | 409–422       |
| 2    | 2          | 0.1730            | 0.2750      | 7.490e-13 | 565–579       |
| 3    | 5          | 0.2149            | 0.4918      | 7.059e-4  | 1082–1096     |
| 4    | 3          | 0.2583            |             |           |               |
| 5    | 4          | 0.3931            |             |           |               |
| 6    | 1          | 0.4243            | 0.4774      | 1.695e-35 | 38–54         |

Region idx 6 (p = 1.037e-3) just misses the cutoff and shows as "Not significant (p > 1e-3)".

### Residues per color (of 1484)

Each count was recomputed from the fixtures in Python. Except for RMC regions, each was also read back from the rendered Mol\* viewer.

| Mode                   | Counts                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| o/e                    | e2e2e2 348, fd8d3c 490, 9b001f 344, fecc5c 152, de351b 114, ffffb2 36                                                       |
| o/e, catch-all colored | ffffb2 384, fd8d3c 490, 9b001f 344, fecc5c 152, de351b 114                                                                  |
| o/e upper bound        | fd8d3c 458, e2e2e2 348, 9b001f 285, ffffb2 275, de351b 59, fecc5c 59                                                        |
| Regions                | e2e2e2 699, 8c564b 371, 1f77b4 285, ff7f0e 59, 9467bd 33, d62728 22, 2ca02c 15                                              |
| RMC o/e                | e2e2e2 546, fd8d3c 383, 9b001f 370, fecc5c 140, de351b 45                                                                   |
| RMC regions            | e2e2e2 546, e7ba52 347, 8c564b 155, 17becf 140, ff7f0e 84, 2ca02c 72, e377c2 45, bcbd22 36, 9467bd 32, 1f77b4 14, d62728 13 |
| pLDDT                  | ff7d45 655, 65cbf3 437, 0053d6 261, ffdb13 131                                                                              |

### Sample residues

| Residue | o/e                      | Upper bound | Regions | RMC o/e | RMC regions |
| ------- | ------------------------ | ----------- | ------- | ------- | ----------- |
| 1       | gray (ffffb2 if colored) | gray        | gray    | gray    | gray        |
| 38      | fd8d3c                   | fd8d3c      | 8c564b  | fd8d3c  | e7ba52      |
| 409     | 9b001f                   | 9b001f      | 1f77b4  | 9b001f  | 9467bd      |
| 565     | 9b001f                   | de351b      | ff7f0e  | 9b001f  | ff7f0e      |
| 870     | fd8d3c                   | ffffb2      | gray    | 9b001f  | d62728      |
| 1082    | de351b                   | fd8d3c      | 2ca02c  | de351b  | e377c2      |

- **RMC boundary residues:**
  - RMC regions: 597 is gray, 669 is 2ca02c and 1098 is e377c2.
  - RMC o/e: 1098 is de351b and 403 is gray.
- **pLDDT:** 409 is 0053d6, 565 is 65cbf3 (70.06), 110 is 65cbf3 (exactly 90.0), 870 is ffdb13 and 1082 is ff7d45.
- **Segment coordinates, from Ensembl REST `/map/translation`:** 1–15 is 12:13866164-13866208, 409–422 is 12:13616517-13616558, and 1471–1484 is 12:13562786-13562827.
- **Known ClinVar variants:** p.Arg540His (12-13615149-C-T), p.Asn615Ser, p.Gly820Glu, p.Cys461Phe.

## Running it

1. Install the browser once: `pnpm exec playwright install chromium`. This is Chromium 124, the version Playwright 1.43 uses.
2. Start the dev server from this branch, with the DONTMERGE demo commit, on :8008. Playwright reuses a running server.
3. Run `pnpm test:playwright tests/e2e/MissenseConstraint3d.playwright.spec.ts`. Add `--headed` to watch it. The run takes about 2–3 minutes.
4. If the WebGL check fails in headless mode, try these in order:
   - `PLAYWRIGHT_CHROMIUM_USE_HEADLESS_NEW=1`;
   - `--headed`;
   - launch args `--use-angle=metal --ignore-gpu-blocklist`.

## Verifying the test itself

- Run `pnpm jest browser/src/MissenseConstraint3d`, then `make validate-browser`. Together they cover the feature changes, snapshots and type-checking of the new e2e files.
- Run the e2e test twice. Both viewers must pass both times.
- Break the code on purpose, one change at a time. Each change must make the named step fail, and is then reverted:
  - revert a Reset view fix: B6 fails;
  - move an o/e bin edge: A6 and B2 fail;
  - start with the structure shown: A3 fails;
  - drop 3Dmol's `render()` after an update: the pixel checks in B2 fail;
  - make RMC ranking ignore p: B2 fails.

## Risks and limits

- **Not yet verified:**
  - whether Playwright's headless Chromium 124 gets GPU WebGL on macOS (the B0 check catches this);
  - whether real Playwright mouse events behave like the scripted events used in the trial;
  - both Reset view fixes, which were checked against the library source but not run.
- **Fragility.** The probe depends on private internals: React fiber keys, 3Dmol atom styles, and Mol\*'s highlight and state tree. They are confined to one file. The chunk-name checks only work on the dev server.
- **Before this becomes a PR,** the DONTMERGE demo data and one viewer library will be removed. The test will then need another data source (a routed fixture or the real API), and will lose its per-viewer loop.

## Questions for reviewers

1. The probe reads React fiber internals and each library's private state, so it can check per-residue colors, overlays and the camera exactly. Is that acceptable for a local e2e test, or would you rather have a small dev-only hook in the viewer components?
2. The test uses the live API and AlphaFold, like the other e2e specs, and works out the ClinVar, gnomAD and pLDDT expectations at run time. Should it pin those with fixtures instead, so it could eventually run in CI?
3. Is it OK to change the ranked palette's gray to gold (#e7ba52), given it also affects the 3D "Regions" coloring for genes with 8 or more ranked regions?
