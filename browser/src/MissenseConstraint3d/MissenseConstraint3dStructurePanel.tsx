import React, { Suspense, lazy, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'

import { Button, Checkbox, ExternalLink, SegmentedControl } from '@gnomad/ui'
import { DatasetId, referenceGenome } from '@gnomad/dataset-metadata/metadata'

import CategoryFilterControl from '../CategoryFilterControl'
import { CheckboxInput, Label, LegendItemWrapper, LegendSwatch } from '../ChartStyles'
import { clinvarVariantClinicalSignificanceCategory } from '../ClinvarVariantsTrack/clinvarVariantCategories'
import { RegionAttributeList } from '../ConstraintTrack'
import Delayed from '../Delayed'
import InfoButton from '../help/InfoButton'
import Legend from '../Legend'
import Query from '../Query'
import {
  MissenseObsExpLegend,
  RegionalMissenseConstraint,
  RegionalMissenseConstraintRegion,
  regionalMissenseConstraintRegionColor,
} from '../RegionalMissenseConstraintTrack'
import StatusMessage from '../StatusMessage'
import {
  CLINICAL_SIGNIFICANCE_CATEGORY_OVERLAYS,
  CLINVAR_TRACK_VARIANTS_OVERLAY_ID,
  CONSEQUENCE_CATEGORY_OVERLAYS,
  GNOMAD_MISSENSE_OVERLAY,
  HoveredResidue,
  MissenseConstraint3d,
  MissenseConstraint3dClinvarVariant,
  MissenseConstraint3dRegion,
  MissenseConstraint3dVariant,
  PLDDT_BANDS,
  ResidueRange,
  StructureColorBy,
  StructureOverlay,
  StructureViewerProps,
  TABLE_VARIANTS_OVERLAY_ID,
  UNIPROT_FEATURE_LEVELS,
  UNIPROT_FEATURE_OVERLAY_STYLES,
  alphafoldEntryUrl,
  alphafoldStructureUrl,
  ALPHAFOLD_DB_MODEL_VERSION,
  clinicalSignificanceCategoryOverlays,
  consequenceCategoryOverlays,
  formatResidue,
  isPassingGnomadMissenseVariant,
  parseProteinChangeHgvsp,
  placeVariantsOnSequence,
  plddtResidueColors,
  regionalMissenseConstraintByResidue,
  regionsByResidue,
  residueColors,
  uniprotEntryUrl,
  uniprotFeatureOverlayId,
  uniprotFeatureOverlays,
  variantConsequenceCategory,
  variantOverlay,
  variantsInCategories,
} from './missenseConstraint3d'
import MissenseConstraint3dRegionAttributes from './MissenseConstraint3dRegionAttributes'

// Both candidate libraries are kept so they can be compared in demos; keep one before opening a PR
const STRUCTURE_VIEWERS: Record<
  string,
  { label: string; url: string; component: React.ComponentType<StructureViewerProps> }
> = {
  '3dmol': {
    label: '3Dmol.js',
    url: 'https://3dmol.csb.pitt.edu/',
    component: lazy(() => import('./StructureViewer3Dmol')),
  },
  molstar: {
    label: 'Mol*',
    url: 'https://molstar.org/',
    component: lazy(() => import('./StructureViewerMolstar')),
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
      exome {
        ac
        an
        filters
      }
      genome {
        ac
        an
        filters
      }
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

const UnplacedVariantsNote = styled.p`
  margin: 0.25em 0 0;
  font-size: 0.85em;
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

// The track's legend describes 3D region colors; these colors apply only to the structure
const StructureOnlyColorKey = ({ colorBy }: { colorBy: StructureColorBy }) => {
  if (colorBy === 'plddt') {
    return (
      <StructureLegend>
        <span>AlphaFold confidence</span>
        <Legend series={PLDDT_BANDS.map(({ label, color }) => ({ label, color }))} />
      </StructureLegend>
    )
  }
  if (colorBy === 'regional_missense_constraint') {
    return (
      <StructureLegend>
        <MissenseObsExpLegend title="Regional missense constraint o/e" />
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
  gnomadVariants: MissenseConstraint3dVariant[]
  clinvarVariants: MissenseConstraint3dClinvarVariant[]
  tableVariants: MissenseConstraint3dVariant[]
  uniprotFeatureDescriptions: string[]
}

const ResidueTooltip = ({
  residue,
  region,
  rank,
  regionalMissenseConstraintRegion,
  gnomadVariants,
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
    {gnomadVariants.length > 0 && (
      <div>
        <dt>gnomAD missense:</dt>
        <dd>{gnomadVariants.map((variant) => variant.hgvsp).join(', ')}</dd>
      </div>
    )}
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
  colorRegion: (region: MissenseConstraint3dRegion) => string
  highlightedResidueRanges: ResidueRange[]
  regionalMissenseConstraint: RegionalMissenseConstraint | null
  visibleOverlayIds: Set<string>
  onToggleOverlay: (overlayId: string) => void
  // Variants listed in the gene page's variant table, or null if it hasn't loaded
  variantIdsInTable: Set<string> | null
  // Variants listed in the gene page's ClinVar track, or null if it hasn't loaded
  clinvarVariantIdsInTrack: Set<string> | null
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
  colorRegion,
  highlightedResidueRanges,
  regionalMissenseConstraint,
  visibleOverlayIds,
  onToggleOverlay,
  variantIdsInTable,
  clinvarVariantIdsInTrack,
  variants,
  clinvarVariants,
}: StructurePanelProps) => {
  const [overlayTransparency, setOverlayTransparency] = useState(0)
  const [overlaySize, setOverlaySize] = useState(1)
  const [clinicalSignificanceSelections, setClinicalSignificanceSelections] = useState<
    Record<string, boolean>
  >(() => Object.fromEntries(CLINICAL_SIGNIFICANCE_CATEGORY_OVERLAYS.map(({ id }) => [id, true])))
  const [consequenceSelections, setConsequenceSelections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CONSEQUENCE_CATEGORY_OVERLAYS.map(({ id }) => [id, true]))
  )
  const [hoveredResidue, setHoveredResidue] = useState<HoveredResidue | null>(null)
  const [resetViewCount, setResetViewCount] = useState(0)
  const [structureViewer, setStructureViewer] = useState(initialStructureViewer)
  const [plddtByResidue, setPlddtByResidue] = useState<number[] | null>(null)
  const viewerWrapper = useRef<HTMLDivElement>(null)

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

  const gnomadMissense = useMemo(
    () => placeVariantsOnSequence(variants.filter(isPassingGnomadMissenseVariant), sequence),
    [variants, sequence]
  )

  const uniprotOverlays = useMemo(
    () => uniprotFeatureOverlays(constraint.uniprot_features),
    [constraint]
  )
  const overlays = useMemo(
    () => [
      variantOverlay(GNOMAD_MISSENSE_OVERLAY, gnomadMissense.variantsByResidue),
      ...uniprotOverlays,
    ],
    [gnomadMissense, uniprotOverlays]
  )
  const tableVariants = useMemo(
    () =>
      variantIdsInTable &&
      placeVariantsOnSequence(
        variants.filter((variant) => variantIdsInTable.has(variant.variant_id)),
        sequence,
        parseProteinChangeHgvsp
      ),
    [variants, variantIdsInTable, sequence]
  )
  // The table's variants in the consequence categories selected for the structure
  const selectedTableVariantsByResidue = useMemo(
    () =>
      variantsInCategories(
        tableVariants
          ? tableVariants.variantsByResidue
          : new Map<number, MissenseConstraint3dVariant[]>(),
        variantConsequenceCategory,
        consequenceSelections
      ),
    [tableVariants, consequenceSelections]
  )
  const tableOverlays = useMemo(
    () => consequenceCategoryOverlays(selectedTableVariantsByResidue),
    [selectedTableVariantsByResidue]
  )
  const clinvarTrackVariants = useMemo(
    () =>
      clinvarVariantIdsInTrack &&
      placeVariantsOnSequence(
        clinvarVariants.filter((variant) => clinvarVariantIdsInTrack.has(variant.variant_id)),
        sequence,
        parseProteinChangeHgvsp
      ),
    [clinvarVariants, clinvarVariantIdsInTrack, sequence]
  )
  // The ClinVar track's variants in the clinical significance categories selected for the structure
  const selectedClinvarTrackVariantsByResidue = useMemo(
    () =>
      variantsInCategories(
        clinvarTrackVariants
          ? clinvarTrackVariants.variantsByResidue
          : new Map<number, MissenseConstraint3dClinvarVariant[]>(),
        clinvarVariantClinicalSignificanceCategory,
        clinicalSignificanceSelections
      ),
    [clinvarTrackVariants, clinicalSignificanceSelections]
  )
  const clinvarTrackOverlays = useMemo(
    () => clinicalSignificanceCategoryOverlays(selectedClinvarTrackVariantsByResidue),
    [selectedClinvarTrackVariantsByResidue]
  )

  // 3Dmol colors a residue in several variant overlays like the last of them, so ClinVar goes last
  const visibleOverlays = useMemo(
    () => [
      ...(visibleOverlayIds.has(TABLE_VARIANTS_OVERLAY_ID) ? tableOverlays : []),
      ...overlays.filter((overlay) => visibleOverlayIds.has(overlay.id)),
      ...(visibleOverlayIds.has(CLINVAR_TRACK_VARIANTS_OVERLAY_ID) ? clinvarTrackOverlays : []),
    ],
    [overlays, tableOverlays, clinvarTrackOverlays, visibleOverlayIds]
  )

  const variantOverlays = overlays.filter((overlay) => overlay.style === 'variant')

  const { unplacedVariantCount } = gnomadMissense

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

  // A toggle for the variants listed elsewhere on the page, like the ClinVar track
  const renderListedVariantsToggle = (
    overlayId: string,
    listedVariantIds: Set<string>,
    placedVariants: { variantsByResidue: Map<number, unknown[]> },
    categoryControl: React.ReactNode
  ) => {
    const placedVariantCount = Array.from(placedVariants.variantsByResidue.values()).reduce(
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
        {categoryControl}
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
          gnomadVariants={
            isVisible(GNOMAD_MISSENSE_OVERLAY.id)
              ? gnomadMissense.variantsByResidue.get(residue.residueNumber) || []
              : []
          }
          clinvarVariants={
            isVisible(CLINVAR_TRACK_VARIANTS_OVERLAY_ID)
              ? selectedClinvarTrackVariantsByResidue.get(residue.residueNumber) || []
              : []
          }
          tableVariants={
            isVisible(TABLE_VARIANTS_OVERLAY_ID)
              ? selectedTableVariantsByResidue.get(residue.residueNumber) || []
              : []
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
            ]}
            value={colorBy}
            onChange={onChangeColorBy}
          />
        </LabeledControl>
        <Checkbox
          id="missense-constraint-3d-color-catch-all-region"
          label="Color unassigned residues"
          checked={colorCatchAllRegion}
          disabled={colorBy !== 'obs_exp' && colorBy !== 'oe_upper'}
          onChange={onChangeColorCatchAllRegion}
        />
        <Button onClick={() => setResetViewCount((count) => count + 1)}>Reset view</Button>
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
              setHoveredResidue(null)
              setStructureViewer(value)
            }}
          />
        </LabeledControl>
      </Controls>
      <StructureOnlyColorKey colorBy={colorBy} />
      <ViewerLayout>
        <ViewerWrapper ref={viewerWrapper} onMouseLeave={() => setHoveredResidue(null)}>
          <Suspense
            fallback={
              <Delayed>
                <StatusMessage>Loading structure viewer</StatusMessage>
              </Delayed>
            }
          >
            <StructureViewer
              key={structureViewer}
              structureUrl={alphafoldStructureUrl(constraint.uniprot_id)}
              expectedSequence={sequence}
              residueColors={colors}
              highlightedResidueRanges={highlightedResidueRanges}
              overlays={visibleOverlays}
              overlayOpacity={1 - overlayTransparency}
              overlaySize={overlaySize}
              resetViewCount={resetViewCount}
              onHoverResidue={setHoveredResidue}
              onLoadStructure={setPlddtByResidue}
            />
          </Suspense>
          {hoveredResidue && renderTooltip(hoveredResidue)}
        </ViewerWrapper>
        <OverlayPanel>
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
          <OverlayGroupHeading>Missense variants</OverlayGroupHeading>
          {renderOverlayList(variantOverlays)}
          {unplacedVariantCount > 0 && (
            <UnplacedVariantsNote>
              {unplacedVariantCount} missense variant{unplacedVariantCount === 1 ? '' : 's'} could
              not be placed on the structure because the HGVSp reference amino acid does not match
              the protein sequence.
            </UnplacedVariantsNote>
          )}
          {clinvarVariantIdsInTrack && clinvarTrackVariants && (
            <>
              <OverlayGroupHeading>ClinVar track</OverlayGroupHeading>
              {renderListedVariantsToggle(
                CLINVAR_TRACK_VARIANTS_OVERLAY_ID,
                clinvarVariantIdsInTrack,
                clinvarTrackVariants,
                <OverlayCategoryFilter
                  breakpoint={Number.MAX_SAFE_INTEGER}
                  categories={CLINICAL_SIGNIFICANCE_CATEGORY_OVERLAYS}
                  categorySelections={clinicalSignificanceSelections}
                  id="missense-constraint-3d-clinvar-track-included-categories"
                  onChange={setClinicalSignificanceSelections}
                />
              )}
            </>
          )}
          {variantIdsInTable && tableVariants && (
            <>
              <OverlayGroupHeading>gnomAD variants table</OverlayGroupHeading>
              {renderListedVariantsToggle(
                TABLE_VARIANTS_OVERLAY_ID,
                variantIdsInTable,
                tableVariants,
                <OverlayCategoryFilter
                  breakpoint={Number.MAX_SAFE_INTEGER}
                  categories={CONSEQUENCE_CATEGORY_OVERLAYS}
                  categorySelections={consequenceSelections}
                  id="missense-constraint-3d-gnomad-table-included-categories"
                  onChange={setConsequenceSelections}
                />
              )}
            </>
          )}
          {uniprotOverlays.length > 0 && (
            <>
              <OverlayGroupHeading>
                UniProt features
                <InfoButton topic="uniprot-features" />
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
