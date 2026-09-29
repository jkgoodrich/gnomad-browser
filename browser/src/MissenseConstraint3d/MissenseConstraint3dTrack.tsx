import React, { useCallback, useMemo, useState } from 'react'
import styled from 'styled-components'

import { Track } from '@gnomad/region-viewer'
import { Button } from '@gnomad/ui'
import { DatasetId, referenceGenome } from '@gnomad/dataset-metadata/metadata'

import { logButtonClick } from '../analytics'
import { ClinvarTrackFilter } from '../ClinvarVariantsTrack/ClinvarVariantTrack'
import ConstraintTrack, {
  PlotWrapper,
  RegionAttributeList,
  RegionWithUnclamped,
  SidePanel,
  regionsInExons,
} from '../ConstraintTrack'
import { Gene, GeneTranscript } from '../GenePage/GenePage'
import InfoButton from '../help/InfoButton'
import Legend, { LegendInteraction } from '../Legend'
import Query from '../Query'
import {
  MissenseObsExpLegend,
  RegionalMissenseConstraint,
} from '../RegionalMissenseConstraintTrack'
import { TrackPageSection } from '../TrackPage'
import { VariantFilterState } from '../VariantList/filterVariants'
import {
  MissenseConstraint3d,
  MissenseConstraint3dRegion,
  MissenseConstraint3dTrackRegion,
  NO_HIGHLIGHTED_RESIDUES,
  NO_REGION_COLOR,
  PageFilter,
  RANKED_REGION_COLORS,
  RANKED_REGION_MAX_P_VALUE,
  RegionColorBy,
  ResidueRange,
  DEFAULT_COLOR_BY,
  STRUCTURE_HIGHLIGHT_COLOR,
  StructureColorBy,
  StructureSelection,
  UNASSIGNED_RESIDUE_FILL,
  UNASSIGNED_RESIDUE_HATCH_COLOR,
  UNASSIGNED_RESIDUE_PATTERN_ID,
  UniprotFeature,
  codingSequenceLength,
  isSignificantRegion,
  rankConstrainedRegions,
  regionColor,
  regionResidueRanges,
  regionResidues,
  residuesOnGenome,
  segmentsOnGenome,
  toggleResidues,
} from './missenseConstraint3d'
import MissenseConstraint3dRegionAttributes from './MissenseConstraint3dRegionAttributes'
import MissenseConstraint3dStructurePanel from './MissenseConstraint3dStructurePanel'
import UniprotFeatureTracks from './UniprotFeatureTracks'

const TRACK_TITLE = '3D missense constraint'
const HELP_TOPIC = 'missense-constraint-3d'
// Many segments are a few residues long, and borders would make them look black
const MIN_SEGMENT_WIDTH_FOR_BORDER = 4

const operationName = 'MissenseConstraint3d'
const query = `
query ${operationName}($geneId: String!, $referenceGenome: ReferenceGenomeId!) {
  gene(gene_id: $geneId, reference_genome: $referenceGenome) {
    missense_constraint_3d {
      transcript_id
      uniprot_id
      protein_sequence
      regions {
        region_index
        is_catch_all
        obs_mis
        exp_mis
        obs_exp
        oe_upper
        p_value
        segments {
          aa_start
          aa_stop
        }
      }
      uniprot_features {
        feature_type
        start
        stop
        note
      }
    }
  }
}
`

type TrackRegion = MissenseConstraint3dTrackRegion & { rank: number | undefined }

// Residues highlighted on the structure. Highlighted regions are also outlined on the track.
type Highlight = { regions: MissenseConstraint3dRegion[]; residueRanges: ResidueRange[] }

const NO_HIGHLIGHT: Highlight = { regions: [], residueRanges: NO_HIGHLIGHTED_RESIDUES }

const regionsHighlight = (regions: MissenseConstraint3dRegion[]): Highlight =>
  regions.length > 0
    ? { regions, residueRanges: regions.flatMap(regionResidueRanges) }
    : NO_HIGHLIGHT

const TrackRegionTooltip = ({ region }: { region: RegionWithUnclamped<TrackRegion> }) => (
  <RegionAttributeList>
    <div>
      <dt>Coordinates:</dt>
      <dd>{`${region.chrom}:${region.unclamped_start}-${region.unclamped_stop}`}</dd>
    </div>
    <div>
      <dt>Amino acids:</dt>
      <dd>{`${region.aa_start}-${region.aa_stop}`}</dd>
    </div>
    <MissenseConstraint3dRegionAttributes region={region.region} rank={region.rank} />
  </RegionAttributeList>
)

const LegendTitle = styled.span`
  margin-right: 0.5em;
  white-space: nowrap;
`

const RANKED_REGION_P_VALUE = RANKED_REGION_MAX_P_VALUE.toExponential()

// For the track's regions and legend. A pattern in an SVG that isn't displayed isn't drawn, so this
// one takes no space instead.
const UnassignedResiduePattern = () => (
  <svg width={0} height={0} style={{ position: 'absolute' }}>
    <defs>
      <pattern
        id={UNASSIGNED_RESIDUE_PATTERN_ID}
        width={4}
        height={4}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width={4} height={4} fill={NO_REGION_COLOR} />
        <rect width={1.5} height={4} fill={UNASSIGNED_RESIDUE_HATCH_COLOR} />
      </pattern>
    </defs>
  </svg>
)

type RankedRegionsLegendProps = {
  // Most constrained first
  rankedRegions: MissenseConstraint3dRegion[]
  significantRegionCount: number
  interaction?: LegendInteraction
}

const RankedRegionsLegend = ({
  rankedRegions,
  significantRegionCount,
  interaction,
}: RankedRegionsLegendProps) => (
  <>
    <LegendTitle>{`Significant regions (p ≤ ${RANKED_REGION_P_VALUE}), most constrained first`}</LegendTitle>
    <Legend
      interaction={interaction}
      series={[
        ...rankedRegions.map((region, rank) => ({
          color: RANKED_REGION_COLORS[rank],
          label: `${rank + 1} · o/e ${region.obs_exp.toFixed(2)}`,
        })),
        {
          color: NO_REGION_COLOR,
          label:
            significantRegionCount > rankedRegions.length
              ? 'Other regions'
              : `Not significant (p > ${RANKED_REGION_P_VALUE})`,
        },
        { color: UNASSIGNED_RESIDUE_FILL, label: 'Unassigned residue' },
      ]}
    />
  </>
)

const ToggleStructureButton = styled(Button)`
  width: 100px;
  height: auto;
  padding-right: 0.25em;
  padding-left: 0.25em;
  margin-top: 0.25em;
`

const UnavailableTrack = ({ message }: { message: string }) => (
  <Track
    renderLeftPanel={() => (
      <SidePanel>
        <span>{TRACK_TITLE}</span>
        <InfoButton topic={HELP_TOPIC} />
      </SidePanel>
    )}
  >
    {({ width }: { width: number }) => (
      <PlotWrapper>
        <svg height={35} width={width}>
          <text x={width / 2} y={35 / 2} dy="0.33em" textAnchor="middle">
            {message}
          </text>
        </svg>
      </PlotWrapper>
    )}
  </Track>
)

type ViewProps = {
  datasetId: DatasetId
  gene: Gene
  transcript: GeneTranscript
  constraint: MissenseConstraint3d
  regionalMissenseConstraint: RegionalMissenseConstraint | null
  variantIdsInTable: Set<string> | null
  clinvarVariantIdsInTrack: Set<string> | null
  clinvarTrackFilter?: PageFilter<ClinvarTrackFilter>
  variantTableFilter?: PageFilter<VariantFilterState>
  structureSelection: StructureSelection | null
  onChangeStructureSelection?: (selection: StructureSelection | null) => void
}

const MissenseConstraint3dView = ({
  datasetId,
  gene,
  transcript,
  constraint,
  regionalMissenseConstraint,
  variantIdsInTable,
  clinvarVariantIdsInTrack,
  clinvarTrackFilter,
  variantTableFilter,
  structureSelection,
  onChangeStructureSelection,
}: ViewProps) => {
  const [isStructureShown, setIsStructureShown] = useState(false)
  const [colorBy, setColorBy] = useState<StructureColorBy>(DEFAULT_COLOR_BY)
  const [colorCatchAllRegion, setColorCatchAllRegion] = useState(false)
  const [colorNonSignificantRegions, setColorNonSignificantRegions] = useState(true)
  // Shown while something is hovered, and otherwise the pinned region, if any
  const [hoverHighlight, setHoverHighlight] = useState<Highlight>(NO_HIGHLIGHT)
  // In Regions mode, a region clicked to keep it highlighted, like while rotating the structure
  const [pinnedRegion, setPinnedRegion] = useState<MissenseConstraint3dRegion | null>(null)
  // Variants and features shown on the structure
  const [visibleOverlayIds, setVisibleOverlayIds] = useState<Set<string>>(new Set())

  // The track shows 3D regions, so it keeps their o/e colors while the structure shows RMC, pLDDT or
  // no colors
  const regionColorBy: RegionColorBy =
    colorBy === 'regional_missense_constraint' || colorBy === 'plddt' || colorBy === 'none'
      ? 'obs_exp'
      : colorBy

  const regionRanks = useMemo(() => rankConstrainedRegions(constraint.regions), [constraint])
  const rankedRegions = useMemo(
    () =>
      constraint.regions
        .filter((region) => regionRanks.has(region.region_index))
        .sort((a, b) => regionRanks.get(a.region_index)! - regionRanks.get(b.region_index)!),
    [constraint, regionRanks]
  )
  const significantRegionCount = constraint.regions.filter(isSignificantRegion).length

  const constrainedRegions = useMemo(() => {
    const trackRegions: TrackRegion[] = segmentsOnGenome(
      constraint.regions,
      { strand: gene.strand, exons: transcript.exons },
      gene.chrom
    ).map((trackRegion) => ({
      ...trackRegion,
      rank: regionRanks.get(trackRegion.region.region_index),
    }))
    return regionsInExons(
      trackRegions,
      transcript.exons.filter((exon) => exon.feature_type === 'CDS')
    )
  }, [constraint, gene, transcript, regionRanks])

  const colorRegion = useCallback(
    (region: MissenseConstraint3dRegion) =>
      regionColor(region, {
        colorBy: regionColorBy,
        colorCatchAllRegion,
        colorNonSignificantRegions,
        regionRanks,
      }),
    [regionColorBy, colorCatchAllRegion, colorNonSignificantRegions, regionRanks]
  )

  const highlight = useMemo(
    () =>
      hoverHighlight.residueRanges.length > 0 || !pinnedRegion
        ? hoverHighlight
        : regionsHighlight([pinnedRegion]),
    [hoverHighlight, pinnedRegion]
  )

  const highlightRegion = useCallback(
    (region: MissenseConstraint3dRegion | null) =>
      // Moving between the residues or segments of one region keeps its highlight
      setHoverHighlight((previous) =>
        region && previous.regions.length === 1 && previous.regions[0] === region
          ? previous
          : regionsHighlight(region ? [region] : [])
      ),
    []
  )

  const highlightResidues = useCallback(
    (residueRanges: ResidueRange[]) =>
      setHoverHighlight(residueRanges.length > 0 ? { regions: [], residueRanges } : NO_HIGHLIGHT),
    []
  )

  const changeColorBy = useCallback((nextColorBy: StructureColorBy) => {
    setColorBy(nextColorBy)
    setHoverHighlight(NO_HIGHLIGHT)
    setPinnedRegion(null)
  }, [])

  // The page shows only variants in the selected residues, so they're placed on the genome here
  const selectResidues = useCallback(
    (residues: ReadonlySet<number> | null) => {
      if (onChangeStructureSelection) {
        onChangeStructureSelection(
          residues && {
            residues,
            intervals: residuesOnGenome(residues, { strand: gene.strand, exons: transcript.exons }),
          }
        )
      }
    },
    [onChangeStructureSelection, gene, transcript]
  )

  // Hovering a color in the legend highlights its regions, and clicking it selects their residues
  const legendInteraction = useMemo(() => {
    if (!isStructureShown) {
      return undefined
    }
    const regionsWithFill = (fill: string) =>
      constraint.regions.filter((region) => colorRegion(region) === fill)
    return {
      onHoverFill: (fill: string | null) =>
        setHoverHighlight(regionsHighlight(fill ? regionsWithFill(fill) : [])),
      onClickFill: (fill: string) =>
        selectResidues(
          toggleResidues(
            structureSelection && structureSelection.residues,
            regionsWithFill(fill).flatMap(regionResidues)
          )
        ),
    }
  }, [isStructureShown, constraint, colorRegion, structureSelection, selectResidues])

  const onHoverFeature = useCallback(
    (feature: UniprotFeature | null) =>
      highlightResidues(feature ? [[feature.start, feature.stop]] : NO_HIGHLIGHTED_RESIDUES),
    [highlightResidues]
  )

  const hideOverlays = useCallback((overlayIds: string[]) => {
    setVisibleOverlayIds((previousOverlayIds) => {
      const nextOverlayIds = new Set(previousOverlayIds)
      overlayIds.forEach((overlayId) => nextOverlayIds.delete(overlayId))
      return nextOverlayIds
    })
  }, [])

  const toggleOverlay = useCallback((overlayId: string) => {
    setVisibleOverlayIds((previousOverlayIds) => {
      const nextOverlayIds = new Set(previousOverlayIds)
      if (nextOverlayIds.has(overlayId)) {
        nextOverlayIds.delete(overlayId)
      } else {
        nextOverlayIds.add(overlayId)
      }
      return nextOverlayIds
    })
  }, [])

  const legend = (
    <>
      <UnassignedResiduePattern />
      {regionColorBy === 'ranked_regions' ? (
        <RankedRegionsLegend
          rankedRegions={rankedRegions}
          significantRegionCount={significantRegionCount}
          interaction={legendInteraction}
        />
      ) : (
        <MissenseObsExpLegend
          title={
            regionColorBy === 'obs_exp' ? 'Missense observed/expected' : 'Missense o/e upper bound'
          }
          // For the regions that aren't colored by the scale
          swatches={[
            ...(colorNonSignificantRegions
              ? []
              : [
                  {
                    label: `Not significant (p > ${RANKED_REGION_P_VALUE})`,
                    fill: NO_REGION_COLOR,
                  },
                ]),
            ...(colorCatchAllRegion
              ? []
              : [{ label: 'Unassigned residue', fill: UNASSIGNED_RESIDUE_FILL }]),
          ]}
          interaction={legendInteraction}
        />
      )}
    </>
  )

  return (
    <>
      <ConstraintTrack
        trackTitle={TRACK_TITLE}
        // An empty list, unlike null, draws neither region brackets nor a line through the track
        allRegions={[]}
        constrainedRegions={constrainedRegions}
        infobuttonTopic={HELP_TOPIC}
        legend={legend}
        tooltipComponent={TrackRegionTooltip}
        colorFn={(trackRegion: TrackRegion) => colorRegion(trackRegion.region)}
        outlineFn={(trackRegion: TrackRegion) =>
          highlight.regions.includes(trackRegion.region) ? STRUCTURE_HIGHLIGHT_COLOR : null
        }
        valueFn={(trackRegion: TrackRegion) => trackRegion.region.obs_exp.toFixed(2)}
        minWidthForBorder={MIN_SEGMENT_WIDTH_FOR_BORDER}
        leftPanelControl={
          <ToggleStructureButton
            onClick={() => {
              if (!isStructureShown) {
                logButtonClick('User showed 3D missense constraint structure')
              }
              setHoverHighlight(NO_HIGHLIGHT)
              setPinnedRegion(null)
              if (isStructureShown) {
                selectResidues(null)
              }
              setIsStructureShown(!isStructureShown)
            }}
          >
            {isStructureShown ? 'Hide' : 'Show'} structure
          </ToggleStructureButton>
        }
        onHoverRegion={
          isStructureShown
            ? (trackRegion: TrackRegion | null) =>
                highlightRegion(trackRegion && trackRegion.region)
            : undefined
        }
        onClickRegion={
          isStructureShown && colorBy === 'ranked_regions'
            ? (trackRegion: TrackRegion) =>
                setPinnedRegion((pinned) =>
                  pinned === trackRegion.region ? null : trackRegion.region
                )
            : undefined
        }
      />
      {isStructureShown && (
        <>
          <UniprotFeatureTracks
            uniprotId={constraint.uniprot_id}
            transcriptId={constraint.transcript_id}
            features={constraint.uniprot_features}
            chrom={gene.chrom}
            strand={gene.strand}
            transcript={transcript}
            visibleOverlayIds={visibleOverlayIds}
            onHoverFeature={onHoverFeature}
          />
          <TrackPageSection>
            <MissenseConstraint3dStructurePanel
              datasetId={datasetId}
              constraint={constraint}
              regionRanks={regionRanks}
              colorBy={colorBy}
              onChangeColorBy={changeColorBy}
              colorCatchAllRegion={colorCatchAllRegion}
              onChangeColorCatchAllRegion={setColorCatchAllRegion}
              colorNonSignificantRegions={colorNonSignificantRegions}
              onChangeColorNonSignificantRegions={setColorNonSignificantRegions}
              colorRegion={colorRegion}
              highlightedResidueRanges={highlight.residueRanges}
              onHighlightResidues={highlightResidues}
              onHoverRegion={highlightRegion}
              pinnedRegion={pinnedRegion}
              onChangePinnedRegion={setPinnedRegion}
              regionalMissenseConstraint={regionalMissenseConstraint}
              visibleOverlayIds={visibleOverlayIds}
              onToggleOverlay={toggleOverlay}
              onHideOverlays={hideOverlays}
              variantIdsInTable={variantIdsInTable}
              clinvarVariantIdsInTrack={clinvarVariantIdsInTrack}
              clinvarTrackFilter={clinvarTrackFilter}
              variantTableFilter={variantTableFilter}
              selectedResidues={structureSelection ? structureSelection.residues : null}
              onSelectResidues={selectResidues}
            />
          </TrackPageSection>
        </>
      )}
    </>
  )
}

type Props = {
  datasetId: DatasetId
  gene: Gene
  regionalMissenseConstraint?: RegionalMissenseConstraint | null
  // Variants listed in the gene page's variant table and ClinVar track, which can be shown on the
  // structure
  variantIdsInTable?: Set<string> | null
  clinvarVariantIdsInTrack?: Set<string> | null
  // The filters of the ClinVar track and variant table, which the structure's legend also has
  clinvarTrackFilter?: PageFilter<ClinvarTrackFilter>
  variantTableFilter?: PageFilter<VariantFilterState>
  // Residues selected on the structure, which the page shows only the variants of
  structureSelection?: StructureSelection | null
  onChangeStructureSelection?: (selection: StructureSelection | null) => void
}

const MissenseConstraint3dTrack = ({
  datasetId,
  gene,
  regionalMissenseConstraint = null,
  variantIdsInTable = null,
  clinvarVariantIdsInTrack = null,
  clinvarTrackFilter,
  variantTableFilter,
  structureSelection = null,
  onChangeStructureSelection,
}: Props) => (
  <Query
    operationName={operationName}
    query={query}
    variables={{ geneId: gene.gene_id, referenceGenome: referenceGenome(datasetId) }}
    loadingMessage="Loading 3D missense constraint"
    errorMessage="Unable to load 3D missense constraint"
    success={(data: any) => Boolean(data.gene)}
  >
    {({ data }: { data: { gene: { missense_constraint_3d: MissenseConstraint3d | null } } }) => {
      const constraint = data.gene.missense_constraint_3d
      const transcript =
        constraint &&
        gene.transcripts.find(
          (geneTranscript) => geneTranscript.transcript_id === constraint.transcript_id
        )
      if (!constraint || !transcript) {
        return <UnavailableTrack message="3D missense constraint is not available for this gene." />
      }
      // Residue numbers can only be placed on the genome if the protein matches the coding sequence
      if (codingSequenceLength(transcript.exons) !== constraint.protein_sequence.length * 3) {
        return (
          <UnavailableTrack
            message={`3D missense constraint does not match the coding sequence of ${constraint.transcript_id}.`}
          />
        )
      }
      return (
        <MissenseConstraint3dView
          datasetId={datasetId}
          gene={gene}
          transcript={transcript}
          constraint={constraint}
          regionalMissenseConstraint={regionalMissenseConstraint}
          variantIdsInTable={variantIdsInTable}
          clinvarVariantIdsInTrack={clinvarVariantIdsInTrack}
          clinvarTrackFilter={clinvarTrackFilter}
          variantTableFilter={variantTableFilter}
          structureSelection={structureSelection}
          onChangeStructureSelection={onChangeStructureSelection}
        />
      )
    }}
  </Query>
)

export default MissenseConstraint3dTrack
