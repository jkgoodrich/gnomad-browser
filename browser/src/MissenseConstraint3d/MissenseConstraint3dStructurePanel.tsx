import React, { Suspense, lazy, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'

import { Button, Checkbox, ExternalLink, SegmentedControl } from '@gnomad/ui'
import { DatasetId, referenceGenome } from '@gnomad/dataset-metadata/metadata'

import { CheckboxInput, Label, LegendItemWrapper, LegendSwatch } from '../ChartStyles'
import { RegionAttributeList } from '../ConstraintTrack'
import Delayed from '../Delayed'
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
  CLINVAR_PATHOGENIC_MISSENSE_OVERLAY,
  GNOMAD_MISSENSE_OVERLAY,
  HoveredResidue,
  MissenseConstraint3d,
  MissenseConstraint3dClinvarVariant,
  MissenseConstraint3dRegion,
  MissenseConstraint3dVariant,
  PLDDT_BANDS,
  ResidueRange,
  StructureColorBy,
  StructureViewerProps,
  UNIPROT_FEATURE_OVERLAY_STYLES,
  alphafoldEntryUrl,
  alphafoldStructureUrl,
  ALPHAFOLD_DB_MODEL_VERSION,
  formatResidue,
  isPassingGnomadMissenseVariant,
  isPathogenicClinvarMissenseVariant,
  placeVariantsOnSequence,
  plddtResidueColors,
  regionalMissenseConstraintByResidue,
  regionsByResidue,
  residueColors,
  uniprotFeatureOverlays,
  variantOverlay,
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

const OverlayControls = styled.ul`
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  padding: 0;
  margin: 0 0 0.5em;
  list-style-type: none;

  li:first-child {
    margin-left: 0;
  }
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
  uniprotFeatureDescriptions: string[]
}

const ResidueTooltip = ({
  residue,
  region,
  rank,
  regionalMissenseConstraintRegion,
  gnomadVariants,
  clinvarVariants,
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
  variants,
  clinvarVariants,
}: StructurePanelProps) => {
  const [visibleOverlayIds, setVisibleOverlayIds] = useState<Set<string>>(new Set())
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
  const clinvarMissense = useMemo(
    () =>
      placeVariantsOnSequence(clinvarVariants.filter(isPathogenicClinvarMissenseVariant), sequence),
    [clinvarVariants, sequence]
  )

  const overlays = useMemo(
    () => [
      variantOverlay(GNOMAD_MISSENSE_OVERLAY, gnomadMissense.variantsByResidue),
      variantOverlay(CLINVAR_PATHOGENIC_MISSENSE_OVERLAY, clinvarMissense.variantsByResidue),
      ...uniprotFeatureOverlays(constraint.uniprot_features),
    ],
    [gnomadMissense, clinvarMissense, constraint]
  )
  const visibleOverlays = useMemo(
    () => overlays.filter((overlay) => visibleOverlayIds.has(overlay.id)),
    [overlays, visibleOverlayIds]
  )

  const unplacedVariantCount =
    gnomadMissense.unplacedVariantCount + clinvarMissense.unplacedVariantCount

  const toggleOverlay = (overlayId: string) => {
    setVisibleOverlayIds((previousOverlayIds) => {
      const nextOverlayIds = new Set(previousOverlayIds)
      if (nextOverlayIds.has(overlayId)) {
        nextOverlayIds.delete(overlayId)
      } else {
        nextOverlayIds.add(overlayId)
      }
      return nextOverlayIds
    })
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
            isVisible(CLINVAR_PATHOGENIC_MISSENSE_OVERLAY.id)
              ? clinvarMissense.variantsByResidue.get(residue.residueNumber) || []
              : []
          }
          uniprotFeatureDescriptions={constraint.uniprot_features
            .filter(
              (feature) =>
                isVisible(`uniprot-${feature.feature_type}`) &&
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
          label="Color catch-all region"
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
      <OverlayControls>
        <li>Show on structure:</li>
        {overlays.map((overlay) => (
          <LegendItemWrapper key={overlay.id}>
            <Label htmlFor={`missense-constraint-3d-overlay-${overlay.id}`}>
              <CheckboxInput
                id={`missense-constraint-3d-overlay-${overlay.id}`}
                checked={visibleOverlayIds.has(overlay.id)}
                disabled={overlay.count === 0}
                onChange={() => toggleOverlay(overlay.id)}
              />
              {`${overlay.label} (${overlay.count})`}
              <LegendSwatch
                color={overlay.color}
                // @ts-expect-error TS(2769) FIXME: No overload matches this call.
                height={overlay.style === 'variant' ? 16 : 8}
              />
            </Label>
          </LegendItemWrapper>
        ))}
      </OverlayControls>
      {unplacedVariantCount > 0 && (
        <p>
          {unplacedVariantCount} missense variant{unplacedVariantCount === 1 ? '' : 's'} could not
          be placed on the structure because the HGVSp reference amino acid does not match the
          protein sequence.
        </p>
      )}
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
            resetViewCount={resetViewCount}
            onHoverResidue={setHoveredResidue}
            onLoadStructure={setPlddtByResidue}
          />
        </Suspense>
        {hoveredResidue && renderTooltip(hoveredResidue)}
      </ViewerWrapper>
      <Attribution>
        Predicted structure:{' '}
        <ExternalLink href={alphafoldEntryUrl(constraint.uniprot_id)}>
          AlphaFold DB AF-{constraint.uniprot_id}-F1 (model v{ALPHAFOLD_DB_MODEL_VERSION})
        </ExternalLink>
        , <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</ExternalLink>
        . Protein features: UniProtKB release 2021_04, CC BY 4.0. Rendered with{' '}
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
