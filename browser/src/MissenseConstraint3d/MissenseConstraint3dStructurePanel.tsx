import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'

import {
  Button,
  Checkbox,
  ExternalLink,
  SearchInput,
  SegmentedControl,
  TextButton,
} from '@gnomad/ui'
import { DatasetId, referenceGenome } from '@gnomad/dataset-metadata/metadata'

import CategoryFilterControl from '../CategoryFilterControl'
import { CheckboxInput, Label, LegendItemWrapper, LegendSwatch } from '../ChartStyles'
import ClinvarReviewStatusFilter from '../ClinvarVariantsTrack/ClinvarReviewStatusFilter'
import {
  ClinvarTrackFilter,
  DEFAULT_CLINVAR_TRACK_FILTER,
} from '../ClinvarVariantsTrack/ClinvarVariantTrack'
import { RegionAttributeList } from '../ConstraintTrack'
import Delayed from '../Delayed'
import InfoButton from '../help/InfoButton'
import Legend, { LegendInteraction } from '../Legend'
import Query from '../Query'
import {
  MissenseObsExpLegend,
  RegionalMissenseConstraint,
  RegionalMissenseConstraintRegion,
  regionalMissenseConstraintRegionColor,
} from '../RegionalMissenseConstraintTrack'
import StatusMessage from '../StatusMessage'
import { DEFAULT_VARIANT_FILTER, VariantFilterState } from '../VariantList/filterVariants'
import {
  CLINICAL_SIGNIFICANCE_CATEGORY_OVERLAYS,
  CLINVAR_TRACK_VARIANTS_OVERLAY_ID,
  CONSEQUENCE_CATEGORY_OVERLAYS,
  DEFAULT_COLOR_BY,
  HoveredResidue,
  MissenseConstraint3d,
  MissenseConstraint3dClinvarVariant,
  MissenseConstraint3dRegion,
  PageFilter,
  MissenseConstraint3dVariant,
  NO_REGION_COLOR,
  PLDDT_BANDS,
  ResidueRange,
  StructureColorBy,
  StructureOverlay,
  StructureViewerHandle,
  StructureViewerProps,
  TABLE_VARIANTS_OVERLAY_ID,
  UNIPROT_FEATURE_LEVELS,
  UNIPROT_FEATURE_OVERLAY_STYLES,
  alphafoldEntryUrl,
  alphafoldStructureUrl,
  ALPHAFOLD_DB_MODEL_VERSION,
  clinicalSignificanceCategoryOverlays,
  consequenceCategoryOverlays,
  fadeUnselectedResidues,
  formatResidue,
  placeVariantsOnSequence,
  plddtResidueColors,
  regionalMissenseConstraintByResidue,
  regionResidues,
  regionsByResidue,
  residueColors,
  residueLegendInteraction,
  toggleResidues,
  uniprotEntryUrl,
  uniprotFeatureOverlayId,
  uniprotFeatureOverlays,
} from './missenseConstraint3d'
import MissenseConstraint3dRegionAttributes, {
  regionDescription,
} from './MissenseConstraint3dRegionAttributes'

type StructureViewerComponent = React.ComponentType<
  StructureViewerProps & React.RefAttributes<StructureViewerHandle>
>

// Both candidate libraries are kept so they can be compared in demos; keep one before opening a PR
const STRUCTURE_VIEWERS: Record<
  string,
  { label: string; url: string; component: React.LazyExoticComponent<StructureViewerComponent> }
> = {
  '3dmol': {
    label: '3Dmol.js',
    url: 'https://3dmol.csb.pitt.edu/',
    component: lazy<StructureViewerComponent>(() => import('./StructureViewer3Dmol')),
  },
  molstar: {
    label: 'Mol*',
    url: 'https://molstar.org/',
    component: lazy<StructureViewerComponent>(() => import('./StructureViewerMolstar')),
  },
}

const DEFAULT_STRUCTURE_VIEWER = '3dmol'

const initialStructureViewer = () => {
  const requestedViewer = new URLSearchParams(window.location.search).get('viewer')
  return requestedViewer && requestedViewer in STRUCTURE_VIEWERS
    ? requestedViewer
    : DEFAULT_STRUCTURE_VIEWER
}

const variantsOperationName = 'MissenseConstraint3dVariants'
const variantsQuery = `
query ${variantsOperationName}($transcriptId: String!, $datasetId: DatasetId!, $referenceGenome: ReferenceGenomeId!) {
  transcript(transcript_id: $transcriptId, reference_genome: $referenceGenome) {
    variants(dataset: $datasetId) {
      variant_id
      consequence
      hgvsp
    }
    clinvar_variants {
      variant_id
      clinical_significance
      gold_stars
      major_consequence
      hgvsp
    }
  }
}
`

const VIEWER_HEIGHT = 500
const TOOLTIP_CURSOR_OFFSET = 15
const MAX_OVERLAY_TRANSPARENCY = 0.9
const MIN_OVERLAY_SIZE = 0.25
const MAX_OVERLAY_SIZE = 3

const Controls = styled.div`
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  margin-bottom: 0.5em;

  > * {
    margin-right: 1.5em;
  }
`

const LabeledControl = styled.div`
  display: flex;
  align-items: center;

  > span {
    margin-right: 0.5em;
  }
`

const ViewerLayout = styled.div`
  display: flex;
  align-items: flex-start;

  @media (max-width: 900px) {
    flex-direction: column;
    align-items: stretch;
  }
`

const OverlayPanel = styled.div`
  flex: 0 0 32em;
  overflow-y: auto;
  box-sizing: border-box;
  max-height: ${VIEWER_HEIGHT}px;
  padding-left: 1em;

  @media (max-width: 900px) {
    flex: none;
    max-height: none;
    padding: 1em 0 0;
  }
`

const SliderControl = styled.div`
  margin-bottom: 0.5em;

  div {
    display: flex;
    justify-content: space-between;
  }

  input {
    width: 100%;
    margin: 0.25em 0 0;
  }
`

const OverlayGroupHeading = styled.h3`
  display: flex;
  align-items: center;
  margin: 0.75em 0 0.35em;
  font-size: 1em;
`

// Resets one section of the legend
const SectionResetButton = styled(TextButton)`
  margin-left: auto;
  font-size: 0.85em;
  font-weight: normal;
`

const OverlaySubgroupHeading = styled.h4`
  margin: 0.5em 0 0.25em;
  font-size: 0.9em;
`

const OverlayList = styled.ul`
  padding: 0;
  margin: 0;
  list-style-type: none;

  li {
    margin: 0 0 0.35em;
  }
`

const OverlaySwatch = styled(LegendSwatch)`
  flex-shrink: 0;
  margin: 0 0.5em 0 0;
`

// The same category filters as the ClinVar and gnomAD variant tracks. Pass a breakpoint that always
// applies to stack their categories in the narrow overlay panel.
const OverlayCategoryFilter = styled(CategoryFilterControl)`
  padding-left: 1.5em;
`

const OverlayFilter = styled.div`
  padding-left: 1.5em;
  margin-top: 0.25em;
`

const RegionsNote = styled.p`
  margin: 0 0 0.5em;
`

const StructureLegend = styled.div`
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  margin-bottom: 0.5em;

  > span {
    margin-right: 1em;
  }
`

type StructureOnlyColorKeyProps = {
  colorBy: StructureColorBy
  interaction: LegendInteraction
}

// The track's legend describes 3D region colors; these colors apply only to the structure
const StructureOnlyColorKey = ({ colorBy, interaction }: StructureOnlyColorKeyProps) => {
  if (colorBy === 'plddt') {
    return (
      <StructureLegend>
        <span>AlphaFold confidence</span>
        <Legend
          series={PLDDT_BANDS.map(({ label, color }) => ({ label, color }))}
          interaction={interaction}
        />
      </StructureLegend>
    )
  }
  if (colorBy === 'regional_missense_constraint') {
    return (
      <StructureLegend>
        <MissenseObsExpLegend title="Regional missense constraint o/e" interaction={interaction} />
      </StructureLegend>
    )
  }
  return null
}

const ViewerWrapper = styled.div`
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: ${VIEWER_HEIGHT}px;
  border: 1px solid #ccc;
`

type SelectionMode = 'off' | 'residue' | 'box' | 'region'

const SELECTION_MODES: { value: SelectionMode; label: string; hint: string }[] = [
  {
    value: 'off',
    label: 'Off',
    hint: 'Select residues, or click colors in the legends, to show only their variants in the ClinVar and gnomAD tracks below.',
  },
  { value: 'residue', label: 'Residue', hint: 'Click residues to select or deselect them.' },
  { value: 'box', label: 'Box', hint: 'Drag a box to select the residues in it.' },
  {
    value: 'region',
    label: '3D region',
    hint: 'Click a residue to select or deselect its 3D region.',
  },
]

// A box smaller than this is a click rather than a selection
const MIN_SELECTION_BOX_SIZE = 3

// The viewers' own wheel zoom is too fast to zoom slowly. This zooms by about 10% for each notch of a
// mouse wheel, and by much less for each of a trackpad's many small scrolls.
const WHEEL_ZOOM_PER_PIXEL = 0.001
const PIXELS_PER_WHEEL_LINE = 16
const ZOOM_BUTTON_FACTOR = 1.25

const DEFAULT_OVERLAY_TRANSPARENCY = 0
const DEFAULT_OVERLAY_SIZE = 1

const areAllCategoriesSelected = (selections: Record<string, boolean>) =>
  Object.values(selections).every(Boolean)

const ZoomButton = styled(Button)`
  min-width: 2em;
  padding-right: 0.5em;
  padding-left: 0.5em;
  margin-right: 0.25em;
`

const SelectionToolbar = styled.div`
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  margin-bottom: 0.5em;

  > * {
    margin-right: 1em;
  }
`

// Covers the structure while selecting with a box, so that dragging draws a box instead of rotating
const BoxSelectionLayer = styled.div`
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  cursor: crosshair;
`

const SelectionBox = styled.div`
  position: absolute;
  border: 1px dashed #000;
  background: rgb(0 0 0 / 5%);
`

type ViewerPoint = { x: number; y: number }

const pointInViewer = (event: React.PointerEvent<HTMLElement>): ViewerPoint => {
  const bounds = event.currentTarget.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

const boxBetween = (start: ViewerPoint, end: ViewerPoint) => ({
  left: Math.min(start.x, end.x),
  top: Math.min(start.y, end.y),
  right: Math.max(start.x, end.x),
  bottom: Math.max(start.y, end.y),
})

// Matches @gnomad/ui tooltips, which can't be anchored to a point on a canvas
const StructureTooltip = styled.div`
  position: absolute;
  z-index: 3;
  max-width: 400px;
  padding: 0.5em;
  border-radius: 3px;
  background-color: #474747;
  color: #fff;
  font-size: 13px;
  pointer-events: none;

  @media (max-width: 500px) {
    max-width: 300px;
  }
`

const Attribution = styled.p`
  margin: 0.5em 0 1em;
  font-size: 0.85em;
`

type ResidueTooltipProps = {
  residue: HoveredResidue
  region: MissenseConstraint3dRegion | undefined
  rank: number | undefined
  regionalMissenseConstraintRegion: RegionalMissenseConstraintRegion | undefined
  clinvarVariants: MissenseConstraint3dClinvarVariant[]
  tableVariants: MissenseConstraint3dVariant[]
  uniprotFeatureDescriptions: string[]
}

const ResidueTooltip = ({
  residue,
  region,
  rank,
  regionalMissenseConstraintRegion,
  clinvarVariants,
  tableVariants,
  uniprotFeatureDescriptions,
}: ResidueTooltipProps) => (
  <RegionAttributeList>
    <div>
      <dt>Residue:</dt>
      <dd>{formatResidue(residue.residueName, residue.residueNumber)}</dd>
    </div>
    {region && <MissenseConstraint3dRegionAttributes region={region} rank={rank} />}
    {regionalMissenseConstraintRegion && (
      <div>
        <dt>RMC missense o/e:</dt>
        <dd>
          {`${regionalMissenseConstraintRegion.obs_exp?.toPrecision(4) ?? '-'} (p = ${
            regionalMissenseConstraintRegion.p_value?.toExponential(3) ?? '-'
          })`}
        </dd>
      </div>
    )}
    <div>
      <dt>AlphaFold pLDDT:</dt>
      <dd>{residue.plddt.toFixed(1)}</dd>
    </div>
    {clinvarVariants.length > 0 && (
      <div>
        <dt>ClinVar:</dt>
        <dd>
          {clinvarVariants
            .map((variant) => `${variant.hgvsp} (${variant.clinical_significance})`)
            .join(', ')}
        </dd>
      </div>
    )}
    {tableVariants.length > 0 && (
      <div>
        <dt>In variant table:</dt>
        <dd>{tableVariants.map((variant) => variant.hgvsp).join(', ')}</dd>
      </div>
    )}
    {uniprotFeatureDescriptions.length > 0 && (
      <div>
        <dt>UniProt:</dt>
        <dd>{uniprotFeatureDescriptions.join('; ')}</dd>
      </div>
    )}
  </RegionAttributeList>
)

type PanelProps = {
  datasetId: DatasetId
  constraint: MissenseConstraint3d
  regionRanks: Map<number, number>
  colorBy: StructureColorBy
  onChangeColorBy: (colorBy: StructureColorBy) => void
  colorCatchAllRegion: boolean
  onChangeColorCatchAllRegion: (colorCatchAllRegion: boolean) => void
  colorNonSignificantRegions: boolean
  onChangeColorNonSignificantRegions: (colorNonSignificantRegions: boolean) => void
  colorRegion: (region: MissenseConstraint3dRegion) => string
  highlightedResidueRanges: ResidueRange[]
  onHighlightResidues: (residueRanges: ResidueRange[]) => void
  onHoverRegion: (region: MissenseConstraint3dRegion | null) => void
  pinnedRegion: MissenseConstraint3dRegion | null
  onChangePinnedRegion: (region: MissenseConstraint3dRegion | null) => void
  regionalMissenseConstraint: RegionalMissenseConstraint | null
  visibleOverlayIds: Set<string>
  onToggleOverlay: (overlayId: string) => void
  onHideOverlays: (overlayIds: string[]) => void
  // Variants listed in the gene page's variant table, or null if it hasn't loaded
  variantIdsInTable: Set<string> | null
  // Variants listed in the gene page's ClinVar track, or null if it hasn't loaded
  clinvarVariantIdsInTrack: Set<string> | null
  // The filters of the ClinVar track and variant table, which the legend also has
  clinvarTrackFilter?: PageFilter<ClinvarTrackFilter>
  variantTableFilter?: PageFilter<VariantFilterState>
  selectedResidues: ReadonlySet<number> | null
  onSelectResidues: (residues: ReadonlySet<number> | null) => void
}

type StructurePanelProps = PanelProps & {
  variants: MissenseConstraint3dVariant[]
  clinvarVariants: MissenseConstraint3dClinvarVariant[]
}

const StructurePanel = ({
  constraint,
  regionRanks,
  colorBy,
  onChangeColorBy,
  colorCatchAllRegion,
  onChangeColorCatchAllRegion,
  colorNonSignificantRegions,
  onChangeColorNonSignificantRegions,
  colorRegion,
  highlightedResidueRanges,
  onHighlightResidues,
  onHoverRegion,
  pinnedRegion,
  onChangePinnedRegion,
  regionalMissenseConstraint,
  visibleOverlayIds,
  onToggleOverlay,
  onHideOverlays,
  variantIdsInTable,
  clinvarVariantIdsInTrack,
  clinvarTrackFilter,
  variantTableFilter,
  selectedResidues,
  onSelectResidues,
  variants,
  clinvarVariants,
}: StructurePanelProps) => {
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('off')
  const [selectionBox, setSelectionBox] = useState<{
    start: ViewerPoint
    end: ViewerPoint
  } | null>(null)
  const viewer = useRef<StructureViewerHandle>(null)
  const [overlayTransparency, setOverlayTransparency] = useState(DEFAULT_OVERLAY_TRANSPARENCY)
  const [overlaySize, setOverlaySize] = useState(DEFAULT_OVERLAY_SIZE)
  const [hoveredResidue, setHoveredResidue] = useState<HoveredResidue | null>(null)
  const [resetViewCount, setResetViewCount] = useState(0)
  const [structureViewer, setStructureViewer] = useState(initialStructureViewer)
  const [plddtByResidue, setPlddtByResidue] = useState<number[] | null>(null)
  const viewerWrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrapper = viewerWrapper.current
    if (!wrapper) {
      return undefined
    }
    // Captured before the viewer, so that its own zoom doesn't run
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const pixels =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * PIXELS_PER_WHEEL_LINE
          : event.deltaY
      if (viewer.current) {
        viewer.current.zoomBy(Math.exp(-pixels * WHEEL_ZOOM_PER_PIXEL))
      }
    }
    wrapper.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => wrapper.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  const {
    label: viewerLabel,
    url: viewerUrl,
    component: StructureViewer,
  } = STRUCTURE_VIEWERS[structureViewer]

  const sequence = constraint.protein_sequence

  const regionByResidue = useMemo(
    () => regionsByResidue(constraint.regions, sequence.length),
    [constraint, sequence]
  )
  const regionalMissenseConstraintRegionByResidue = useMemo(
    () =>
      regionalMissenseConstraint && regionalMissenseConstraint.regions.length > 0
        ? regionalMissenseConstraintByResidue(regionalMissenseConstraint.regions, sequence.length)
        : null,
    [regionalMissenseConstraint, sequence]
  )
  const colors = useMemo(() => {
    if (colorBy === 'none') {
      return residueColors(regionByResidue, () => NO_REGION_COLOR)
    }
    if (colorBy === 'plddt' && plddtByResidue) {
      return plddtResidueColors(plddtByResidue)
    }
    if (colorBy === 'regional_missense_constraint' && regionalMissenseConstraintRegionByResidue) {
      return residueColors(
        regionalMissenseConstraintRegionByResidue,
        regionalMissenseConstraintRegionColor
      )
    }
    return residueColors(regionByResidue, colorRegion)
  }, [
    colorBy,
    plddtByResidue,
    regionalMissenseConstraintRegionByResidue,
    regionByResidue,
    colorRegion,
  ])
  const displayedColors = useMemo(
    () => (selectedResidues ? fadeUnselectedResidues(colors, selectedResidues) : colors),
    [colors, selectedResidues]
  )

  const hoverResidue = (residue: HoveredResidue | null) => {
    setHoveredResidue(residue)
    // In Regions mode, hovering a residue shows its whole region, unless one is pinned
    if (colorBy === 'ranked_regions') {
      onHoverRegion(
        residue && !pinnedRegion ? regionByResidue[residue.residueNumber] || null : null
      )
    }
  }

  const onClickResidue = (residueNumber: number) => {
    if (selectionMode === 'off' && colorBy === 'ranked_regions') {
      const region = regionByResidue[residueNumber]
      if (region) {
        onChangePinnedRegion(region === pinnedRegion ? null : region)
      }
    }
    if (selectionMode === 'residue') {
      onSelectResidues(toggleResidues(selectedResidues, [residueNumber]))
    }
    if (selectionMode === 'region') {
      const region = regionByResidue[residueNumber]
      if (region) {
        onSelectResidues(toggleResidues(selectedResidues, regionResidues(region)))
      }
    }
  }

  // Ends at where the pointer is released, in case its last move hasn't been rendered yet
  const finishSelectionBox = (end: ViewerPoint) => {
    if (!selectionBox) {
      return
    }
    const box = boxBetween(selectionBox.start, end)
    setSelectionBox(null)
    if (
      box.right - box.left < MIN_SELECTION_BOX_SIZE ||
      box.bottom - box.top < MIN_SELECTION_BOX_SIZE ||
      !viewer.current
    ) {
      return
    }
    const residuesInBox = viewer.current.residuesInRectangle(box)
    if (residuesInBox.length > 0) {
      onSelectResidues(new Set([...(selectedResidues || []), ...residuesInBox]))
    }
  }

  const uniprotOverlays = useMemo(
    () => uniprotFeatureOverlays(constraint.uniprot_features),
    [constraint]
  )
  const tableVariantsByResidue = useMemo(
    () =>
      variantIdsInTable &&
      placeVariantsOnSequence(
        variants.filter((variant) => variantIdsInTable.has(variant.variant_id)),
        sequence
      ),
    [variants, variantIdsInTable, sequence]
  )
  const tableOverlays = useMemo(
    () => (tableVariantsByResidue ? consequenceCategoryOverlays(tableVariantsByResidue) : []),
    [tableVariantsByResidue]
  )
  const clinvarTrackVariantsByResidue = useMemo(
    () =>
      clinvarVariantIdsInTrack &&
      placeVariantsOnSequence(
        clinvarVariants.filter((variant) => clinvarVariantIdsInTrack.has(variant.variant_id)),
        sequence
      ),
    [clinvarVariants, clinvarVariantIdsInTrack, sequence]
  )
  const clinvarTrackOverlays = useMemo(
    () =>
      clinvarTrackVariantsByResidue
        ? clinicalSignificanceCategoryOverlays(clinvarTrackVariantsByResidue)
        : [],
    [clinvarTrackVariantsByResidue]
  )

  // The legend changes the filters of the ClinVar track and variant table, rather than its own, so
  // that they're the same wherever they're changed
  const changeClinvarTrackFilter = (change: Partial<ClinvarTrackFilter>) =>
    clinvarTrackFilter &&
    clinvarTrackFilter.onChangeFilter({ ...clinvarTrackFilter.filter, ...change })
  const changeVariantTableFilter = (change: Partial<VariantFilterState>) =>
    variantTableFilter &&
    variantTableFilter.onChangeFilter({ ...variantTableFilter.filter, ...change })

  // 3Dmol colors a residue in several variant overlays like the last of them, so ClinVar goes last
  const visibleOverlays = useMemo(
    () => [
      ...(visibleOverlayIds.has(TABLE_VARIANTS_OVERLAY_ID) ? tableOverlays : []),
      ...uniprotOverlays.filter((overlay) => visibleOverlayIds.has(overlay.id)),
      ...(visibleOverlayIds.has(CLINVAR_TRACK_VARIANTS_OVERLAY_ID) ? clinvarTrackOverlays : []),
    ],
    [uniprotOverlays, tableOverlays, clinvarTrackOverlays, visibleOverlayIds]
  )

  const renderOverlayList = (groupOverlays: StructureOverlay[]) => (
    <OverlayList>
      {groupOverlays.map((overlay) => (
        <LegendItemWrapper key={overlay.id}>
          <Label htmlFor={`missense-constraint-3d-overlay-${overlay.id}`}>
            <CheckboxInput
              id={`missense-constraint-3d-overlay-${overlay.id}`}
              checked={visibleOverlayIds.has(overlay.id)}
              disabled={overlay.count === 0}
              onChange={() => onToggleOverlay(overlay.id)}
            />
            <OverlaySwatch
              color={overlay.color}
              // @ts-expect-error TS(2769) FIXME: No overload matches this call.
              height={overlay.style === 'variant' ? 16 : 8}
            />
            {`${overlay.label} (${overlay.count})`}
          </Label>
        </LegendItemWrapper>
      ))}
    </OverlayList>
  )

  const renderSectionReset = (sectionLabel: string, onReset: () => void) => (
    <SectionResetButton aria-label={`Reset ${sectionLabel}`} onClick={onReset}>
      Reset
    </SectionResetButton>
  )

  const isAnyOverlayVisible = (overlayIds: string[]) =>
    overlayIds.some((overlayId) => visibleOverlayIds.has(overlayId))

  // A toggle for the variants listed elsewhere on the page, like the ClinVar track
  const renderListedVariantsToggle = (
    overlayId: string,
    listedVariantIds: Set<string>,
    placedVariantsByResidue: Map<number, unknown[]>,
    filterControls: React.ReactNode
  ) => {
    const placedVariantCount = Array.from(placedVariantsByResidue.values()).reduce(
      (count, variantsAtResidue) => count + variantsAtResidue.length,
      0
    )
    return (
      <>
        <OverlayList>
          <LegendItemWrapper>
            <Label htmlFor={`missense-constraint-3d-overlay-${overlayId}`}>
              <CheckboxInput
                id={`missense-constraint-3d-overlay-${overlayId}`}
                checked={visibleOverlayIds.has(overlayId)}
                disabled={placedVariantCount === 0}
                onChange={() => onToggleOverlay(overlayId)}
              />
              {`Current selection (${placedVariantCount} of ${listedVariantIds.size})`}
            </Label>
          </LegendItemWrapper>
        </OverlayList>
        {filterControls}
      </>
    )
  }

  const renderTooltip = (residue: HoveredResidue) => {
    const region = regionByResidue[residue.residueNumber]
    const isVisible = (overlayId: string) => visibleOverlayIds.has(overlayId)
    const tooltipOnLeft =
      viewerWrapper.current !== null && residue.x > viewerWrapper.current.offsetWidth / 2
    return (
      <StructureTooltip
        style={{
          top: residue.y + TOOLTIP_CURSOR_OFFSET,
          ...(tooltipOnLeft
            ? { right: viewerWrapper.current!.offsetWidth - residue.x + TOOLTIP_CURSOR_OFFSET }
            : { left: residue.x + TOOLTIP_CURSOR_OFFSET }),
        }}
      >
        <ResidueTooltip
          residue={residue}
          region={region}
          rank={region && regionRanks.get(region.region_index)}
          regionalMissenseConstraintRegion={
            regionalMissenseConstraintRegionByResidue
              ? regionalMissenseConstraintRegionByResidue[residue.residueNumber]
              : undefined
          }
          clinvarVariants={
            (isVisible(CLINVAR_TRACK_VARIANTS_OVERLAY_ID) &&
              clinvarTrackVariantsByResidue &&
              clinvarTrackVariantsByResidue.get(residue.residueNumber)) ||
            []
          }
          tableVariants={
            (isVisible(TABLE_VARIANTS_OVERLAY_ID) &&
              tableVariantsByResidue &&
              tableVariantsByResidue.get(residue.residueNumber)) ||
            []
          }
          uniprotFeatureDescriptions={constraint.uniprot_features
            .filter(
              (feature) =>
                isVisible(uniprotFeatureOverlayId(feature.feature_type)) &&
                feature.start <= residue.residueNumber &&
                residue.residueNumber <= feature.stop
            )
            .map((feature) =>
              [UNIPROT_FEATURE_OVERLAY_STYLES[feature.feature_type].label, feature.note]
                .filter(Boolean)
                .join(': ')
            )}
        />
      </StructureTooltip>
    )
  }

  return (
    <>
      <Controls>
        <LabeledControl>
          <span>Color by</span>
          <SegmentedControl<StructureColorBy>
            id="missense-constraint-3d-color-by"
            options={[
              { value: 'obs_exp', label: 'Missense o/e' },
              { value: 'oe_upper', label: 'o/e upper bound' },
              { value: 'ranked_regions', label: 'Regions' },
              ...(regionalMissenseConstraintRegionByResidue
                ? [{ value: 'regional_missense_constraint' as const, label: 'RMC o/e' }]
                : []),
              { value: 'plddt', label: 'pLDDT' },
              { value: 'none', label: 'None' },
            ]}
            value={colorBy}
            onChange={onChangeColorBy}
          />
        </LabeledControl>
        <Checkbox
          id="missense-constraint-3d-color-non-significant-regions"
          label="Color non-significant regions"
          checked={colorNonSignificantRegions}
          disabled={colorBy !== 'obs_exp' && colorBy !== 'oe_upper'}
          onChange={onChangeColorNonSignificantRegions}
        />
        <Checkbox
          id="missense-constraint-3d-color-catch-all-region"
          label="Color unassigned residues"
          checked={colorCatchAllRegion}
          disabled={colorBy !== 'obs_exp' && colorBy !== 'oe_upper'}
          onChange={onChangeColorCatchAllRegion}
        />
        <Button
          disabled={
            colorBy === DEFAULT_COLOR_BY && colorNonSignificantRegions && !colorCatchAllRegion
          }
          onClick={() => {
            onChangeColorBy(DEFAULT_COLOR_BY)
            onChangeColorNonSignificantRegions(true)
            onChangeColorCatchAllRegion(false)
          }}
        >
          Reset colors
        </Button>
        <LabeledControl>
          <span>Zoom</span>
          <ZoomButton
            aria-label="Zoom out"
            onClick={() => viewer.current && viewer.current.zoomBy(1 / ZOOM_BUTTON_FACTOR)}
          >
            −
          </ZoomButton>
          <ZoomButton
            aria-label="Zoom in"
            onClick={() => viewer.current && viewer.current.zoomBy(ZOOM_BUTTON_FACTOR)}
          >
            +
          </ZoomButton>
        </LabeledControl>
        <Button onClick={() => setResetViewCount((count) => count + 1)}>
          Reset rotation and zoom
        </Button>
        <LabeledControl>
          <span>Viewer</span>
          <SegmentedControl<string>
            id="missense-constraint-3d-viewer"
            options={Object.entries(STRUCTURE_VIEWERS).map(([value, { label }]) => ({
              value,
              label,
            }))}
            value={structureViewer}
            onChange={(value) => {
              hoverResidue(null)
              setStructureViewer(value)
            }}
          />
        </LabeledControl>
      </Controls>
      <StructureOnlyColorKey
        colorBy={colorBy}
        // Colors before any are faded, which are the ones in the key
        interaction={residueLegendInteraction(
          colors,
          selectedResidues,
          onHighlightResidues,
          onSelectResidues
        )}
      />
      {colorBy === 'ranked_regions' && (
        <RegionsNote>
          {pinnedRegion ? (
            <>
              {`Pinned: ${regionDescription(
                pinnedRegion,
                regionRanks.get(pinnedRegion.region_index)
              )}, o/e ${pinnedRegion.obs_exp.toFixed(2)}, ${
                regionResidues(pinnedRegion).length
              } residues. `}
              <TextButton onClick={() => onChangePinnedRegion(null)}>Unpin</TextButton>
            </>
          ) : (
            'Hover over a residue to see its whole 3D region. Click a region in the track, or a residue while Select is Off, to keep it highlighted.'
          )}
        </RegionsNote>
      )}
      <SelectionToolbar>
        <LabeledControl>
          <span>Select</span>
          <SegmentedControl<SelectionMode>
            id="missense-constraint-3d-selection-mode"
            options={SELECTION_MODES.map(({ value, label }) => ({ value, label }))}
            value={selectionMode}
            onChange={setSelectionMode}
          />
        </LabeledControl>
        <Button disabled={!selectedResidues} onClick={() => onSelectResidues(null)}>
          Clear selection
        </Button>
        <span>
          {selectedResidues
            ? `${selectedResidues.size} residue${selectedResidues.size === 1 ? '' : 's'} selected.`
            : SELECTION_MODES.find(({ value }) => value === selectionMode)!.hint}
        </span>
      </SelectionToolbar>
      <ViewerLayout>
        <ViewerWrapper ref={viewerWrapper} onMouseLeave={() => hoverResidue(null)}>
          <Suspense
            fallback={
              <Delayed>
                <StatusMessage>Loading structure viewer</StatusMessage>
              </Delayed>
            }
          >
            <StructureViewer
              key={structureViewer}
              ref={viewer}
              structureUrl={alphafoldStructureUrl(constraint.uniprot_id)}
              expectedSequence={sequence}
              residueColors={displayedColors}
              highlightedResidueRanges={highlightedResidueRanges}
              overlays={visibleOverlays}
              overlayOpacity={1 - overlayTransparency}
              overlaySize={overlaySize}
              resetViewCount={resetViewCount}
              onHoverResidue={hoverResidue}
              onClickResidue={onClickResidue}
              onLoadStructure={setPlddtByResidue}
            />
          </Suspense>
          {selectionMode === 'box' && (
            <BoxSelectionLayer
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                const point = pointInViewer(event)
                setSelectionBox({ start: point, end: point })
              }}
              onPointerMove={(event) => {
                if (selectionBox) {
                  setSelectionBox({ ...selectionBox, end: pointInViewer(event) })
                }
              }}
              onPointerUp={(event) => finishSelectionBox(pointInViewer(event))}
            >
              {selectionBox &&
                (() => {
                  const box = boxBetween(selectionBox.start, selectionBox.end)
                  return (
                    <SelectionBox
                      style={{
                        left: box.left,
                        top: box.top,
                        width: box.right - box.left,
                        height: box.bottom - box.top,
                      }}
                    />
                  )
                })()}
            </BoxSelectionLayer>
          )}
          {hoveredResidue && renderTooltip(hoveredResidue)}
        </ViewerWrapper>
        <OverlayPanel>
          <OverlayGroupHeading>
            Display
            {(overlayTransparency !== DEFAULT_OVERLAY_TRANSPARENCY ||
              overlaySize !== DEFAULT_OVERLAY_SIZE) &&
              renderSectionReset('display', () => {
                setOverlayTransparency(DEFAULT_OVERLAY_TRANSPARENCY)
                setOverlaySize(DEFAULT_OVERLAY_SIZE)
              })}
          </OverlayGroupHeading>
          <SliderControl>
            <div>
              <label htmlFor="missense-constraint-3d-overlay-transparency">Transparency</label>
              <span>{`${Math.round(overlayTransparency * 100)}%`}</span>
            </div>
            <input
              id="missense-constraint-3d-overlay-transparency"
              type="range"
              min={0}
              max={MAX_OVERLAY_TRANSPARENCY}
              step={0.05}
              value={overlayTransparency}
              aria-valuetext={`${Math.round(overlayTransparency * 100)}%`}
              onChange={(event) => setOverlayTransparency(Number(event.target.value))}
            />
          </SliderControl>
          <SliderControl>
            <div>
              <label htmlFor="missense-constraint-3d-overlay-size">Size</label>
              <span>{`${overlaySize}×`}</span>
            </div>
            <input
              id="missense-constraint-3d-overlay-size"
              type="range"
              min={MIN_OVERLAY_SIZE}
              max={MAX_OVERLAY_SIZE}
              step={0.25}
              value={overlaySize}
              aria-valuetext={`${overlaySize} times`}
              onChange={(event) => setOverlaySize(Number(event.target.value))}
            />
          </SliderControl>
          {uniprotOverlays.length > 0 && (
            <>
              <OverlayGroupHeading>
                UniProt features
                <InfoButton topic="uniprot-features" />
                {isAnyOverlayVisible(uniprotOverlays.map(({ id }) => id)) &&
                  renderSectionReset('UniProt features', () =>
                    onHideOverlays(uniprotOverlays.map(({ id }) => id))
                  )}
              </OverlayGroupHeading>
              {UNIPROT_FEATURE_LEVELS.map(({ level, label }) => {
                const levelOverlays = uniprotOverlays.filter((overlay) => overlay.level === level)
                return (
                  levelOverlays.length > 0 && (
                    <React.Fragment key={level}>
                      <OverlaySubgroupHeading>{label}</OverlaySubgroupHeading>
                      {renderOverlayList(levelOverlays)}
                    </React.Fragment>
                  )
                )
              })}
            </>
          )}
          {clinvarVariantIdsInTrack && clinvarTrackVariantsByResidue && (
            <>
              <OverlayGroupHeading>
                ClinVar track
                {(isAnyOverlayVisible([CLINVAR_TRACK_VARIANTS_OVERLAY_ID]) ||
                  (clinvarTrackFilter &&
                    (!areAllCategoriesSelected(
                      clinvarTrackFilter.filter.includedClinicalSignificanceCategories
                    ) ||
                      clinvarTrackFilter.filter.starFilter > 0))) &&
                  renderSectionReset('ClinVar track', () => {
                    onHideOverlays([CLINVAR_TRACK_VARIANTS_OVERLAY_ID])
                    changeClinvarTrackFilter(DEFAULT_CLINVAR_TRACK_FILTER)
                  })}
              </OverlayGroupHeading>
              {renderListedVariantsToggle(
                CLINVAR_TRACK_VARIANTS_OVERLAY_ID,
                clinvarVariantIdsInTrack,
                clinvarTrackVariantsByResidue,
                clinvarTrackFilter && (
                  <>
                    <OverlayCategoryFilter
                      breakpoint={Number.MAX_SAFE_INTEGER}
                      categories={CLINICAL_SIGNIFICANCE_CATEGORY_OVERLAYS}
                      categorySelections={
                        clinvarTrackFilter.filter.includedClinicalSignificanceCategories
                      }
                      id="missense-constraint-3d-clinvar-track-included-categories"
                      onChange={(includedClinicalSignificanceCategories) =>
                        changeClinvarTrackFilter({ includedClinicalSignificanceCategories })
                      }
                    />
                    <OverlayFilter>
                      <ClinvarReviewStatusFilter
                        id="missense-constraint-3d-clinvar-track-review-status"
                        value={clinvarTrackFilter.filter.starFilter}
                        onChange={(starFilter) => changeClinvarTrackFilter({ starFilter })}
                      />
                    </OverlayFilter>
                  </>
                )
              )}
            </>
          )}
          {variantIdsInTable && tableVariantsByResidue && (
            <>
              <OverlayGroupHeading>
                gnomAD variants table
                {(isAnyOverlayVisible([TABLE_VARIANTS_OVERLAY_ID]) ||
                  (variantTableFilter &&
                    (!areAllCategoriesSelected(variantTableFilter.filter.includeCategories) ||
                      variantTableFilter.filter.searchText !== ''))) &&
                  renderSectionReset('gnomAD variants table', () => {
                    onHideOverlays([TABLE_VARIANTS_OVERLAY_ID])
                    changeVariantTableFilter({
                      includeCategories: DEFAULT_VARIANT_FILTER.includeCategories,
                      searchText: DEFAULT_VARIANT_FILTER.searchText,
                    })
                  })}
              </OverlayGroupHeading>
              {renderListedVariantsToggle(
                TABLE_VARIANTS_OVERLAY_ID,
                variantIdsInTable,
                tableVariantsByResidue,
                variantTableFilter && (
                  <>
                    <OverlayCategoryFilter
                      breakpoint={Number.MAX_SAFE_INTEGER}
                      categories={CONSEQUENCE_CATEGORY_OVERLAYS}
                      categorySelections={variantTableFilter.filter.includeCategories}
                      id="missense-constraint-3d-gnomad-table-included-categories"
                      onChange={(includeCategories) =>
                        changeVariantTableFilter({ includeCategories })
                      }
                    />
                    <OverlayFilter>
                      <SearchInput
                        placeholder="Search variant table"
                        value={variantTableFilter.filter.searchText}
                        onChange={(searchText) => changeVariantTableFilter({ searchText })}
                      />
                    </OverlayFilter>
                  </>
                )
              )}
            </>
          )}
        </OverlayPanel>
      </ViewerLayout>
      <Attribution>
        Predicted structure:{' '}
        <ExternalLink href={alphafoldEntryUrl(constraint.uniprot_id)}>
          AlphaFold DB AF-{constraint.uniprot_id}-F1 (model v{ALPHAFOLD_DB_MODEL_VERSION})
        </ExternalLink>
        , <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</ExternalLink>
        . Protein features: UniProtKB{' '}
        <ExternalLink href={uniprotEntryUrl(constraint.uniprot_id)}>
          {constraint.uniprot_id}
        </ExternalLink>{' '}
        release 2021_04, CC BY 4.0. Rendered with{' '}
        <ExternalLink href={viewerUrl}>{viewerLabel}</ExternalLink>.
      </Attribution>
    </>
  )
}

const MissenseConstraint3dStructurePanel = (props: PanelProps) => {
  const { constraint, datasetId } = props
  return (
    <Query
      operationName={variantsOperationName}
      query={variantsQuery}
      variables={{
        transcriptId: constraint.transcript_id,
        datasetId,
        referenceGenome: referenceGenome(datasetId),
      }}
      loadingMessage="Loading variants"
      errorMessage="Unable to load variants"
      success={(data: any) => Boolean(data.transcript)}
    >
      {({ data }: any) => (
        <StructurePanel
          {...props}
          variants={data.transcript.variants}
          clinvarVariants={data.transcript.clinvar_variants}
        />
      )}
    </Query>
  )
}

export default MissenseConstraint3dStructurePanel
