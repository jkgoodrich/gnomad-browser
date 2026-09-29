import React, { useCallback, useMemo, useState } from 'react'
import styled from 'styled-components'

import { Track } from '@gnomad/region-viewer'
import { Button, TooltipAnchor, TooltipHint } from '@gnomad/ui'
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
import MissenseConstraint3dRegionTable from './MissenseConstraint3dRegionTable'
import MissenseConstraint3dStructurePanel from './MissenseConstraint3dStructurePanel'
import PlddtTrack from './PlddtTrack'
import RegionalMissenseConstraintUpperTrack from './RegionalMissenseConstraintUpperTrack'
import UniprotFeatureTracks from './UniprotFeatureTracks'

const TRACK_TITLE = '3D missense constraint'
const HELP_TOPIC = 'missense-constraint-3d'
// Many segments are a few residues long, and borders at their sides would make them look black
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

// The track colors regions by the upper bound of their o/e. The structure's other colors, other than
// RMC o/e, which the regional missense constraint track shows, get a track of their own below it.
const TRACK_COLOR_BY: RegionColorBy = 'oe_upper'

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

const RANKED_REGIONS_DESCRIPTION = `Regions with p ≤ ${RANKED_REGION_P_VALUE}, ranked by missense o/e from the most constrained (1). Up to ${RANKED_REGION_COLORS.length} are shown in color, and other regions are gray.`

type RankedRegionsLegendProps = {
  rankedRegionCount: number
  significantRegionCount: number
  interaction?: LegendInteraction
}

const RankedRegionsLegend = ({
  rankedRegionCount,
  significantRegionCount,
  interaction,
}: RankedRegionsLegendProps) => (
  <>
    <LegendTitle>
      <TooltipAnchor
        // @ts-expect-error TooltipAnchor's typings are missing its tooltip prop
        tooltip={RANKED_REGIONS_DESCRIPTION}
      >
        <TooltipHint>Rank</TooltipHint>
      </TooltipAnchor>
    </LegendTitle>
    <Legend
      interaction={interaction}
      series={[
        ...RANKED_REGION_COLORS.slice(0, rankedRegionCount).map((color, rank) => ({
          color,
          label: `${rank + 1}`,
        })),
        {
          color: NO_REGION_COLOR,
          label:
            significantRegionCount > rankedRegionCount
              ? 'Other regions'
              : `Not significant (p > ${RANKED_REGION_P_VALUE})`,
        },
        { color: UNASSIGNED_RESIDUE_FILL, label: 'Unassigned residue' },
      ]}
    />
  </>
)

const LeftPanelButton = styled(Button)`
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
  const [isRegionTableShown, setIsRegionTableShown] = useState(false)
  const [colorBy, setColorBy] = useState<StructureColorBy>(DEFAULT_COLOR_BY)
  const [colorCatchAllRegion, setColorCatchAllRegion] = useState(false)
  const [colorNonSignificantRegions, setColorNonSignificantRegions] = useState(true)
  // Shown while something is hovered, and otherwise the pinned region, if any
  const [hoverHighlight, setHoverHighlight] = useState<Highlight>(NO_HIGHLIGHT)
  // In Regions mode, a region clicked to keep it highlighted, like while rotating the structure
  const [pinnedRegion, setPinnedRegion] = useState<MissenseConstraint3dRegion | null>(null)
  // AlphaFold's confidence in each residue, from the structure once it's loaded
  const [plddtByResidue, setPlddtByResidue] = useState<number[] | null>(null)
  // Variants and features shown on the structure
  const [visibleOverlayIds, setVisibleOverlayIds] = useState<Set<string>>(new Set())

  // The structure's colors of 3D regions, or the track's while it isn't colored by 3D regions
  const regionColorBy: RegionColorBy =
    colorBy === 'obs_exp' || colorBy === 'oe_upper' || colorBy === 'ranked_regions'
      ? colorBy
      : TRACK_COLOR_BY

  const regionRanks = useMemo(() => rankConstrainedRegions(constraint.regions), [constraint])
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

  const colorTrackRegion = useCallback(
    (region: MissenseConstraint3dRegion) =>
      regionColor(region, {
        colorBy: TRACK_COLOR_BY,
        colorCatchAllRegion,
        colorNonSignificantRegions,
        regionRanks,
      }),
    [colorCatchAllRegion, colorNonSignificantRegions, regionRanks]
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

  // Hovering a color in a legend of regions highlights them, and clicking it selects their residues
  const regionLegendInteraction = (
    colorFn: (region: MissenseConstraint3dRegion) => string
  ): LegendInteraction | undefined => {
    if (!isStructureShown) {
      return undefined
    }
    const regionsWithFill = (fill: string) =>
      constraint.regions.filter((region) => colorFn(region) === fill)
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
  }

  const onHoverFeature = useCallback(
    (feature: UniprotFeature | null) =>
      highlightResidues(feature ? [[feature.start, feature.stop]] : NO_HIGHLIGHTED_RESIDUES),
    [highlightResidues]
  )

  const showOverlays = useCallback((overlayIds: string[]) => {
    setVisibleOverlayIds((previousOverlayIds) => new Set([...previousOverlayIds, ...overlayIds]))
  }, [])

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

  const obsExpLegend = (title: string, colorFn: (region: MissenseConstraint3dRegion) => string) => (
    <MissenseObsExpLegend
      title={title}
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
      interaction={regionLegendInteraction(colorFn)}
    />
  )

  // The track of 3D regions, and the one below it for the structure's other colors of regions
  const regionTrackProps = {
    allRegions: [] as TrackRegion[],
    constrainedRegions,
    infobuttonTopic: HELP_TOPIC,
    tooltipComponent: TrackRegionTooltip,
    outlineFn: (trackRegion: TrackRegion) =>
      highlight.regions.includes(trackRegion.region) ? STRUCTURE_HIGHLIGHT_COLOR : null,
    valueFn: (trackRegion: TrackRegion) => trackRegion.region.obs_exp.toFixed(2),
    minWidthForBorder: MIN_SEGMENT_WIDTH_FOR_BORDER,
    onHoverRegion: isStructureShown
      ? (trackRegion: TrackRegion | null) => highlightRegion(trackRegion && trackRegion.region)
      : undefined,
    onClickRegion:
      isStructureShown && colorBy === 'ranked_regions'
        ? (trackRegion: TrackRegion) =>
            setPinnedRegion((pinned) => (pinned === trackRegion.region ? null : trackRegion.region))
        : undefined,
  }

  let structureColorsTrack = null
  if (colorBy === 'obs_exp') {
    structureColorsTrack = (
      <ConstraintTrack
        {...regionTrackProps}
        trackTitle="3D missense o/e"
        legend={obsExpLegend('Missense observed/expected', colorRegion)}
        colorFn={(trackRegion: TrackRegion) => colorRegion(trackRegion.region)}
      />
    )
  } else if (colorBy === 'ranked_regions') {
    structureColorsTrack = (
      <ConstraintTrack
        {...regionTrackProps}
        trackTitle="Ranked 3D regions"
        legend={
          <RankedRegionsLegend
            rankedRegionCount={regionRanks.size}
            significantRegionCount={significantRegionCount}
            interaction={regionLegendInteraction(colorRegion)}
          />
        }
        colorFn={(trackRegion: TrackRegion) => colorRegion(trackRegion.region)}
      />
    )
  } else if (colorBy === 'plddt' && plddtByResidue) {
    structureColorsTrack = (
      <PlddtTrack
        plddtByResidue={plddtByResidue}
        chrom={gene.chrom}
        strand={gene.strand}
        transcript={transcript}
        onHighlightResidues={highlightResidues}
      />
    )
  } else if (colorBy === 'regional_missense_constraint_upper' && regionalMissenseConstraint) {
    structureColorsTrack = (
      <RegionalMissenseConstraintUpperTrack
        regionalMissenseConstraint={regionalMissenseConstraint}
        transcript={transcript}
      />
    )
  }

  return (
    <>
      <ConstraintTrack
        {...regionTrackProps}
        trackTitle={TRACK_TITLE}
        legend={
          <>
            <UnassignedResiduePattern />
            {obsExpLegend('Missense o/e upper bound', colorTrackRegion)}
          </>
        }
        colorFn={(trackRegion: TrackRegion) => colorTrackRegion(trackRegion.region)}
        leftPanelControl={
          <>
            <LeftPanelButton
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
            </LeftPanelButton>
            <LeftPanelButton
              onClick={() => {
                if (!isRegionTableShown) {
                  logButtonClick('User showed 3D missense constraint regions')
                }
                setHoverHighlight(NO_HIGHLIGHT)
                setIsRegionTableShown(!isRegionTableShown)
              }}
            >
              {isRegionTableShown ? 'Hide' : 'Show'} regions
            </LeftPanelButton>
          </>
        }
      />
      {isRegionTableShown && (
        <TrackPageSection>
          <MissenseConstraint3dRegionTable
            regions={constraint.regions}
            regionRanks={regionRanks}
            colorRegion={colorTrackRegion}
            onHoverRegion={highlightRegion}
          />
          <Button
            onClick={() => {
              setHoverHighlight(NO_HIGHLIGHT)
              setIsRegionTableShown(false)
            }}
          >
            Hide regions
          </Button>
        </TrackPageSection>
      )}
      {isStructureShown && (
        <>
          {structureColorsTrack}
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
              plddtByResidue={plddtByResidue}
              onLoadStructure={setPlddtByResidue}
              pinnedRegion={pinnedRegion}
              onChangePinnedRegion={setPinnedRegion}
              regionalMissenseConstraint={regionalMissenseConstraint}
              visibleOverlayIds={visibleOverlayIds}
              onToggleOverlay={toggleOverlay}
              onShowOverlays={showOverlays}
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
