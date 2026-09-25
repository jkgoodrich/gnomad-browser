# Plan: 3D missense constraint track + structure viewer in the gnomAD browser

> **DONTMERGE.** This is a temporary document on `jg/3d-missense-constraint`, shared for team review. It will be removed before the branch is opened as a PR. It is the plan as approved on 2026-09-25, before implementation started; see "What changed during implementation" for how the build differs.

## What changed during implementation

- **Both viewer libraries were kept** for a group demo: 3Dmol.js (the default) and Mol\*, switched with a "Viewer" control or `?viewer=molstar`. One will be removed before a PR. The viewers are `StructureViewer3Dmol.tsx` and `StructureViewerMolstar.tsx`, not `MissenseConstraint3dStructureViewer.tsx`.
- **Spike findings:**
  - Async chunk size in the production build (minified / gzipped): 3Dmol.js 576 KB / 161 KB, Mol\* 2.71 MB / 732 KB. Both load only after "Show structure".
  - 3Dmol's BinaryCIF parser fails on AlphaFold files, which have no symmetry operators, so 3Dmol loads the text `.cif`. Mol\* loads the `.bcif`.
  - Mol\* adds roughly 190 production packages, including `@scarf/scarf` install telemetry (through `swagger-ui-dist`).
- **More structure colorings:**

  - "RMC o/e", which colors each residue by the regional missense constraint region it falls in. For the demo, GRIN2B's v4 RMC comes from the same data export and is bundled by the DONTMERGE commit.
  - "pLDDT", AlphaFold's per-residue confidence.

  Their color keys appear in the structure panel, because the track keeps showing the 3D regions' o/e.

- **Viewer details:** the view is framed on confident residues (pLDDT ≥ 70), and 3Dmol's depth fog is off so it doesn't wash out the colors.
- **Track:** the line through the track has been removed (in progress at the time of writing).
- **Commits on the branch:**
  - `feat(pipelines)` 86b3a4c8
  - `feat(backend)` 2a1880d0
  - `feat(frontend)` b4fda31f
  - `DONTMERGE(frontend)` 29a208bb: demo fixtures and dev-server middleware
  - the DONTMERGE plan documents
- **Next:** the end-to-end test planned in `missense_constraint_3d_e2e_test_plan.md`. That plan also adds an "RMC regions" coloring, makes "Reset view" undo rotation, and replaces the gray in the ranked-region palette.

## Context

The standalone missense constraint demo (`gnomad-missense-constraint-viewer-demo`: React 19 + Vite + Mol\*, a Python API over a ~1 GB pickle, and an unsafe CIF server) shows 3D missense-constraint regions on AlphaFold structures. It has problems:

- UniProt/de novo overlays are off by one (0-based positions).
- No link between the 1D tracks and the 3D view.
- No legend.

We are bringing the functionality into the real gnomAD browser (branch `jg/3d-missense-constraint`, local only) so that it:

- looks native to the browser
- reuses the browser's components, help topics and tooltips
- changes existing browser code minimally
- follows AGENTS.md

Demo gene: **GRIN2B** (ENSG00000273079, MANE ENST00000609686, UniProt Q13224, 1484 aa).

### Decisions made during planning

- **Naming:** don't use the method's name anywhere (it will change). Everything is called **"3D missense constraint"** (`missense_constraint_3d`, `MissenseConstraint3d*`, help topic `missense-constraint-3d`). The method name appears nowhere in code, API, UI, help text or commit messages.
- **Data:**
  - Production-shaped pipeline task + GraphQL field.
  - Plus a `DONTMERGE` commit that serves a GRIN2B fixture locally. The author has no prod Elasticsearch/GKE access (403).
  - **Export only what the example needs:** GRIN2B only, and only the fields the UI uses.
- **Method:** a single method, AIC + PAE filter: the forward-selection run with a gamma o/e upper bound, AIC selection, at least 16 expected missense variants per region, and a 15 Å PAE cutoff on pairwise PAE with each region's center residue. The table's path is left out here because it contains the method's current name. This is a per-residue table keyed `[uniprot_id, transcript_id, residue_index (0-based)]`. No method selector.
- **Structure:** load live from AlphaFold DB (v6, open CORS, CC BY 4.0).
  - **Open item to resolve with the browser team before production.**
  - For GRIN2B, v6 and the v4 model used by the analysis have the same 1484-aa sequence and 0.2 Å CA RMSD over pLDDT ≥ 70 residues.
- **v1 scope:**
  - Included: the 3D viewer (hidden by default), a linked 1D regions track, UniProt feature overlays, and gnomAD missense + ClinVar pathogenic missense overlays.
  - Excluded: de novos and a method selector.
- **3D library: spike both finalists, then pick one** (details below).

### Library comparison (npm registry and tarballs, 2026-09-24; no security advisories for any)

| Library               | License       | Size (min)                         | Fit                                                                                                                                                                                              | Status       |
| --------------------- | ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| **3Dmol.js 2.5.5**    | BSD-3         | 0.54 MB whole lib                  | Simple selection/style API: `colorfunc`, `setHoverable` (resi/resn/b = pLDDT), bcif + cif parsers, TS types, Node ≥16. Deps (iobuffer, netcdfjs, pako, upng-js) are all MIT. ~235k downloads/mo. | **Finalist** |
| **Mol\* 4.18.0**      | MIT           | ~3–5 MB chunk (full viewer 5.2 MB) | Same engine as AFDB/PDBe/RCSB and the demo; best rendering; complex API (theme provider, state tree). Pinned to 4.x because 5.x needs Node 22.                                                   | **Finalist** |
| NGL 2.5.0             | MIT           | 0.8 MB + three.js + Mol\*          | Now depends on Mol\* and three.js                                                                                                                                                                | Out          |
| pdbe-molstar 3.12     | Apache-2.0    | 6.1 MB prebuilt                    | Own UI/CSS; pins Mol\* 5.8; needs browserify polyfills                                                                                                                                           | Out          |
| @rcsb/rcsb-molstar    | MIT           | —                                  | Requires React 19                                                                                                                                                                                | Out          |
| Nightingale structure | none declared | —                                  | UniProt-specific; Mol\* 3.44                                                                                                                                                                     | Out          |
| iCn3D / PV / LiteMol  | —             | —                                  | Heavy app UI / unmaintained                                                                                                                                                                      | Out          |

## UX (on v4 gene pages)

1. **Track** right after the RMC block (`GenePage.tsx:615-620`):
   - Title "3D missense constraint", with an InfoButton linking to the new help topic.
   - Colored region segments, reusing `ConstraintTrack`.
   - TooltipAnchor hovers show coordinates, amino acids, region, missense o/e (obs/exp), o/e upper bound, and p-value.
   - A **"Show structure / Hide structure"** Button in the left panel, following the pext "Show tissues" pattern. It fires `logButtonClick` on expand.
   - Genes without data show "3D missense constraint is not available for this gene."
2. **Structure panel** (only after the click), in a `TrackPageSection`:
   - **"Color by"** `SegmentedControl`: Missense o/e (default) | o/e upper bound | Regions. Regions mode colors the top-10 regions with p ≤ 1e-3, ranked by o/e, using Tableau-10.
   - A "Color catch-all region" `Checkbox`.
   - **Overlay checkboxes** with swatches and counts, reusing the ChartStyles pattern from GenePage's "Include:" panel:
     - gnomAD missense (PASS)
     - ClinVar pathogenic missense
     - one per UniProt feature type present
   - A "Reset view" Button.
   - The lazy-loaded viewer canvas.
   - A legend reusing the RMC YlOrRd legend.
   - An attribution line: AlphaFold DB entry (CC BY 4.0), UniProtKB 2021_04, and the library credit.
3. **Linking:**
   - One shared "Color by" state drives both the 1D track and the structure.
   - Hovering a 1D segment highlights all residues of that region in 3D.
   - Hovering a 3D residue shows a cursor tooltip styled like @gnomad/ui tooltips. It lists the residue (e.g. Gly826), region/catch-all, o/e, upper bound, p-value, pLDDT, and any visible variants and features there.
4. **Gating:** `isV4(datasetId) && hasShortVariants(datasetId) && hasCodingExons && gene.chrom !== 'M'`. `isV4` alone also matches the SV and CNV datasets.

## Data contract (only what the UI uses; all residue positions 1-based)

```graphql
type MissenseConstraint3dSegment {
  aa_start: Int!
  aa_stop: Int!
}
type MissenseConstraint3dRegion {
  region_index: Int!
  is_catch_all: Boolean!
  obs_mis: Int!
  exp_mis: Float!
  obs_exp: Float!
  oe_upper: Float!
  p_value: Float!
  segments: [MissenseConstraint3dSegment!]!
}
type UniprotFeature {
  feature_type: String!
  start: Int!
  stop: Int!
  note: String
}
type MissenseConstraint3d {
  transcript_id: String!
  uniprot_id: String!
  protein_sequence: String!
  regions: [MissenseConstraint3dRegion!]!
  uniprot_features: [UniprotFeature!]!
}
# gene.graphql: missense_constraint_3d: MissenseConstraint3d
```

- **No genomic coordinates are stored.** The frontend maps residue segments onto the transcript's CDS exons (already in the gene query) with the existing, tested `advanceOverIntervals` (`browser/src/ClinvarVariantsTrack/ClinvarAllVariantsPlot.tsx:85-112`, which just needs `export`).
  - This avoids scanning `gencode_positions.ht`, which is keyed by `sequence`.
- `protein_sequence` drives the runtime sequence guard against the loaded structure, and the check that each variant's hgvsp reference residue matches.

## Order of work

1. **Pipeline function** (commit 1 code) with unit tests on synthetic tables.
2. **GRIN2B fixture (Step 0, minimal):**
   - A small script, kept in the DONTMERGE commit, reads the per-residue table filtered to `uniprot_id == 'Q13224'` (a key-prefix read, so it's fast) and `alphafold_map_to_gencode39_and_uniprot_versions.ht` filtered to Q13224 (also key-based).
   - It calls the _same_ `prepare_gnomad_v4_missense_constraint_3d` function and writes `{"data":{"gene":{"missense_constraint_3d": …}}}`.
   - GRIN2B only; nothing genome-wide.
   - Run it locally with Hail if GCS access works, otherwise on Dataproc.
3. **Frontend** (library-agnostic parts) plus the DONTMERGE dev-server fixture, so the demo is visible early.
4. **Viewer spike:** build the viewer module against both 3Dmol.js and Mol\*, compare, and keep one (see below).
5. **Backend GraphQL type**, then run all `make validate-*` targets, then commits.

## Commits on `jg/3d-missense-constraint`

All commits use Conventional Commits with the `Assisted-by: ClaudeCode:claude-opus-5-5` trailer, **no** `Co-authored-by`, and must pass `make validate-*` first.

### 1. `feat(pipelines): add 3D missense constraint to GRCh38 genes`

- **New** `data-pipeline/src/data_pipeline/datasets/gnomad_v4/gnomad_v4_missense_constraint_3d.py`
  - `prepare_gnomad_v4_missense_constraint_3d(residues_path, uniprot_features_path)`:
    - Groups the per-residue table by `(transcript_id, uniprot_id)`.
    - Builds regions (stats are constant per `region_index`).
    - Builds segments from runs of consecutive residues, with `aa = residue_index + 1`.
    - Renames `is_null` to `is_catch_all`.
    - Attaches `protein_sequence` and UniProt features from `map_2021_04.features`, only when that release's sequence matches. Feature types go through a named-constant mapping; isoform-prefixed locations are dropped; disulfide bonds are split into two single residues.
    - Output is keyed by `transcript_id` with the single field `missense_constraint_3d`; globals are dropped.
  - `_validate_residue_positions` raises `ValueError` for any position outside 1..len(sequence), which catches 0-based input.
- **Edit** `data-pipeline/src/data_pipeline/pipelines/genes.py`:
  - Add the task beside `prepare_gnomad_v4_constraint` (~l.297).
  - Add **`annotate_grch38_genes_step_9`** using `annotate_table(..., join_on="preferred_transcript_id")`, following the v2 RMC precedent. With a single field, it is added top-level (`helpers/annotate_table.py:18-22`).
  - Point `set_outputs` `genes_grch38` at step 9. Transcript extraction (l.551) and the public release (l.519) stay on step 8, so the field isn't duplicated into transcript docs.
- **New** `data-pipeline/tests/v4/test_gnomad_v4_missense_constraint_3d.py` (uses `hl.Table.parallelize`): segment building, 1-based conversion, `ValueError` on 0-based input, and feature normalization.

### 2. `feat(backend): expose 3D missense constraint on genes`

- **New** `graphql-api/src/graphql/types/constraint/missense-constraint-3d.graphql` (the contract above; auto-loaded).
- **Edit** `graphql-api/src/graphql/types/gene.graphql`: add the field after l.73. Line 67 is avoided because `upstream/v4-rmc` renames it.
- **Edit** `graphql-api/src/graphql/resolvers/gene-fields.ts`: add `nullifyEmptyObject('missense_constraint_3d')` on `Gene`.
- **New** `gene-fields.spec.ts` (`jest.mock('./mitochondrial-constraint')` because of its static TSV import).
- No Elasticsearch mapping or query changes are needed, since gene docs are returned whole.

### 3. `feat(frontend): add 3D missense constraint track and structure viewer`

- **New dir `browser/src/MissenseConstraint3d/`:**
  - `missenseConstraint3d.ts` — **pure helpers and types; no React or 3D-library imports.**
    - Constants: `RANKED_REGION_COLORS`, `RANKED_REGION_MAX_P_VALUE`, `ALPHAFOLD_DB_MODEL_VERSION = 6`, `UNIPROT_FEATURE_OVERLAY_STYLES`.
    - Segment helpers: `segmentGenomicRange` (via `advanceOverIntervals` on the MANE transcript's CDS exons), `segmentsWithRegion`.
    - Ranking and colors: `rankConstrainedRegions`, `obsExpBinColor` (exported RMC scale), `regionColor`.
    - Residue helpers: `residueColors` (dense, 1-based), `regionResidueRanges`.
    - Variant helpers: `parseMissenseHgvsp`, `isPassingGnomadMissenseVariant`, `isPathogenicClinvarMissenseVariant`, `placeVariantsOnSequence`. Variants whose reference residue doesn't match `protein_sequence` are skipped and counted.
    - Overlay and display helpers: `uniprotFeatureOverlays`, `alphafoldStructureUrl`, `alphafoldEntryUrl`, `formatResidue`.
  - `MissenseConstraint3dTrack.tsx` (props `{datasetId, gene}`):
    - Runs its own `<Query operationName="MissenseConstraint3d">`, following the `GeneCoverage` child-query precedent. The main `Gene` query and `GenePageContainer.tsx` are unchanged, because the prod API would reject an unknown field.
    - State: `isStructureShown`, `colorBy`, `colorCatchAllRegion`, `hoveredRegion`. Derived values are memoized.
    - Renders `ConstraintTrack`. When shown, renders `TrackPageSection` + the panel.
  - `MissenseConstraint3dStructurePanel.tsx`:
    - Its own `<Query operationName="MissenseConstraint3dVariants">`: `transcript(transcript_id) { variants(dataset) { variant_id consequence hgvsp exome { ac an filters } genome { ac an filters } } clinvar_variants { variant_id clinical_significance gold_stars major_consequence hgvsp } }`. It is transcript-scoped so HGVSp refers to the MANE protein. Cost 21 ≤ 25.
    - Controls, overlays, legend, attribution, and the residue tooltip content (via `RegionAttributeList`).
    - `lazy(() => import('./MissenseConstraint3dStructureViewer'))` inside `Suspense`, with a `Delayed` + `StatusMessage` fallback.
  - `MissenseConstraint3dStructureViewer.tsx` — **the only module importing the 3D library**, behind a library-agnostic props interface:
    - `{structureUrl, expectedSequence, residueColors: string[], highlightedResidueRanges, overlays, onHoverResidue(residue | null, {x, y})}`.
    - Class component following the `ReadData/IGVBrowser.tsx` lifecycle: create on mount, recolor/highlight/toggle overlays in `componentDidUpdate` **without re-downloading**, dispose on unmount, show a message if WebGL is unavailable, and a sequence guard.
- **Small edits to existing files:**
  - `browser/src/ConstraintTrack.tsx`: add optional `leftPanelControl?` (under the title) and `onHoverRegion?` on the inner `<rect>`. It has to go on the `<rect>` because TooltipAnchor overwrites its direct child's handlers.
  - `browser/src/RegionalMissenseConstraintTrack.tsx`: add optional `title`/`notSignificantLabel` props to `Legend` (defaults unchanged), and export `colorScale as missenseObsExpColorScale`, `Legend as MissenseObsExpLegend`.
  - `browser/src/ClinvarVariantsTrack/ClinvarAllVariantsPlot.tsx`: `export` `advanceOverIntervals`.
  - `browser/src/vepConsequences.ts`: export the consequence category colors, and use them in `VariantList/VariantTrack.tsx` and `VariantFilterControls.tsx`. Otherwise the missense color `#F0C94D` would get a third private copy.
  - `browser/src/GenePage/GenePage.tsx`: imports (`isV4`, `hasShortVariants`, the track) plus a ~5-line gated render after l.620.
- **Help topic** `browser/help/topics/missense-constraint-3d.md` (`id: missense-constraint-3d`, title '3D missense constraint'). It describes the method generically, without naming it:

  - AIC region selection, PAE ≤ 15 Å filter, min expected missense 16, gamma o/e upper bound
  - the MANE Select ↔ UniProt mapping
  - color scales and the catch-all region
  - pLDDT caveats
  - overlay definitions
  - AlphaFold DB and UniProt citations/licenses

  The author reviews the scientific text.

- **Dependency:** only the spike winner, pinned exact (`pnpm --filter @gnomad/browser add <lib>@<version> --save-exact`), with `browser/package.json` + `pnpm-lock.yaml` updated.
- **Reuse:**
  - `ConstraintTrack`, `RegionAttributeList`, `regionsInExons`
  - the RMC scale and legend
  - `CLINICAL_SIGNIFICANCE_CATEGORY_COLORS` + `clinvarVariantClinicalSignificanceCategory`
  - ChartStyles `ControlPanel`/`Legend`/`LegendItemWrapper`/`Label`/`CheckboxInput`/`LegendSwatch`
  - `browser/src/Legend.tsx`
  - `StatusMessage`, `Delayed`, `logButtonClick`, `TrackPageSection`, `Query`, `InfoButton`
  - @gnomad/ui `Button`/`SegmentedControl`/`Checkbox`/`ExternalLink`
  - `referenceGenome`/`isV4`/`hasShortVariants`
- **Tests** (in the same commit):
  - `missenseConstraint3d.spec.ts`: segment → genomic mapping on both strands, ranking, bin edges, 1-based colors, hgvsp parsing (missense/`=`/`fs`/null), off-by-one skip, filters, feature grouping.
  - `MissenseConstraint3dTrack.spec.tsx`:
    - Setup: `mockQueries`, `jest.mock('./MissenseConstraint3dStructureViewer', () => jest.fn(() => null))`, and a `RegionViewerContext.Provider`.
    - Cases: collapsed snapshot, not-available case, the Show-structure click (fires the variants query and analytics), Color by and catch-all changing both the 1D fills and the viewer props, and 1D hover highlighting every segment of the region.
  - `ConstraintTrack.spec.tsx`: the new optional props.
  - `GenePage.spec.tsx`: one gating test (gnomad_r4 fires the operation; r3/r2 don't). Existing snapshots must pass **without `-u`**, because the factory has `exons: []`.

### 4. `DONTMERGE(frontend): serve GRIN2B 3D missense constraint fixture from dev server`

Drop this before the PR.

- `browser/webpack.config.js`: a `setupMiddlewares` hook runs before the `/api` proxy.
  - For `operationName === 'MissenseConstraint3d'`, it answers with `browser/demo/missense_constraint_3d_ENSG00000273079.json` for GRIN2B and `null` for other genes.
  - Other bodies are replayed to prod via `onProxyReq` (http-proxy-middleware 2.0.9).
- Also contains the Step 0 export script, so the fixture can be reproduced.
- Production code and tests stay identical.

## Viewer spike: 3Dmol.js vs Mol\* (before commit 3 is finalized)

- **Setup:**
  - Install both (`3dmol@2.5.5`, `molstar@4.18.0`).
  - Implement the same viewer props interface twice: `StructureViewer3Dmol.tsx` and `StructureViewerMolstar.tsx`.
    - 3Dmol: `createViewer`, `addModel(bcif)`, `setStyle` with `colorfunc`, `setHoverable`/`setHoverDuration`, `addStyle` for highlights/overlays, `zoomTo`.
    - Mol\*: `PluginContext` + `mount` (no UI/Sass), a custom residue theme with a dense `Color[]` param (a new object on every update, because Mol\*'s `deepEqual` ignores Maps), `build().to().update()` to recolor, `lociHighlights`, `setSubtreeVisibility`.
  - A temporary `?viewer=3dmol|molstar` switch in the panel, so the two can be opened in side-by-side tabs.
- **Compare on GRIN2B:**
  - screenshots of each color mode and overlay
  - async chunk size (`make build-browser`)
  - viewer-module lines of code
  - time to first render
  - hover latency
  - 10× show/hide with no WebGL-context warnings
  - touch/mobile behavior
  - license audit (`pnpm licenses list --prod`)
- **Deliver** a short comparison table; **the author picks**. Then delete the loser and its dependency, rename the winner to `MissenseConstraint3dStructureViewer.tsx`, and remove the switch. The spike code is never committed.

## Verification

1. Run `make validate-data-pipeline`, `make validate-graphql-api` and `make validate-browser` (the browser target includes the production webpack build and typecheck against the library's typings).
2. **Local demo:**
   - Start it: `pnpm install && pnpm start:browser`, then open http://localhost:8008/gene/ENSG00000273079?dataset=gnomad_r4.
   - The 1D track aligns with GRIN2B's CDS exons (minus strand).
   - The library chunk, the variants query and the AFDB fetch happen only after Show structure.
   - Recolor and overlay toggles make no new requests.
   - 1D hover highlights the region's residues in 3D.
   - 3D tooltip residues match the variants' HGVSp, with **0 skipped variants** for GRIN2B.
   - The console is clean.
   - Other v4 genes show "not available", and r2/r3 datasets don't show the track.
3. **Bundle:** the main bundle grows by only a few KB, and the library code appears only in the async chunk.
4. **License audit:** record the winner's license tree and the AFDB/UniProt CC BY 4.0 attribution in the PR's "new dependencies" section.
5. **Mobile:** at 375 and 768 px, controls wrap and the page scrolls outside the canvas. Screenshots go in the PR.

## Open items / risks

1. **Structure hosting (browser team):**
   - AFDB live means a pinned v6 URL, possible drift from the analysis' v4 models, EBI uptime, and EBI seeing which gene a user views.
   - The alternative is self-hosting ~20k models.
   - The sequence guard exposes drift but doesn't fix it.
2. **Genome-wide export and production load (later):**
   - Run `prepare_…` on the full inputs, and copy them to `gs://gnomad-v4-data-pipeline/inputs/...` (or grant access to `gs://gnomad`).
   - Run `genes` without preemptibles, load `genes_grch38` and switch the alias.
   - Flush Redis `gene:*`, bump `JSON_CACHE_PATH`, and deploy the API before the browser.
3. **`upstream/v4-rmc` overlap:**
   - Both branches add a step 9 (whichever lands second renumbers).
   - Both edit the GenePage import.
   - Later: dedupe the o/e thresholds, and consider RMC as a "Color by" source.
4. **Coverage:** joining on `preferred_transcript_id` drops genes whose analyzed transcript isn't MANE/canonical. Count them on the first full run.
5. **Follow-ups:**
   - Add a cursor-anchored tooltip to @gnomad/ui (gnomad-browser-toolkit).
   - Fold the field into the main `Gene` query once the API ships.
   - Decide whether "ClinVar pathogenic" should include association/risk factor.
   - Decide whether the consequence-color extraction becomes its own `refactor(frontend)` commit (ask at commit time).
