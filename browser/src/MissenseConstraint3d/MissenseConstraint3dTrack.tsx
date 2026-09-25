import React, { useCallback, useMemo, useState } from 'react'
import styled from 'styled-components'

import { Track } from '@gnomad/region-viewer'
import { Button } from '@gnomad/ui'
import { DatasetId, referenceGenome } from '@gnomad/dataset-metadata/metadata'

import { logButtonClick } from '../analytics'
import ConstraintTrack, {
  PlotWrapper,
  RegionAttributeList,
  RegionWithUnclamped,
  SidePanel,
  regionsInExons,
} from '../ConstraintTrack'
import { Gene, GeneTranscript } from '../GenePage/GenePage'
import InfoButton from '../help/InfoButton'
import Legend from '../Legend'
import Query from '../Query'
import {
  MissenseObsExpLegend,
  RegionalMissenseConstraint,
} from '../RegionalMissenseConstraintTrack'
import { TrackPageSection } from '../TrackPage'
import {
  MissenseConstraint3d,
  MissenseConstraint3dRegion,
  MissenseConstraint3dTrackRegion,
  NO_REGION_COLOR,
  RANKED_REGION_COLORS,
  RegionColorBy,
  StructureColorBy,
  codingSequenceLength,
  rankConstrainedRegions,
  regionColor,
  regionResidueRanges,
  segmentsOnGenome,
} from './missenseConstraint3d'
import MissenseConstraint3dRegionAttributes from './MissenseConstraint3dRegionAttributes'
import MissenseConstraint3dStructurePanel from './MissenseConstraint3dStructurePanel'

const TRACK_TITLE = '3D missense constraint'
const HELP_TOPIC = 'missense-constraint-3d'

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
`

const RankedRegionsLegend = ({ rankedRegionCount }: { rankedRegionCount: number }) => (
  <>
    <LegendTitle>Regions ranked by missense o/e</LegendTitle>
    <Legend
      series={[
        ...RANKED_REGION_COLORS.slice(0, rankedRegionCount).map((color, rank) => ({
          color,
          label: `${rank + 1}`,
        })),
        { color: NO_REGION_COLOR, label: 'Other' },
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
}

const MissenseConstraint3dView = ({
  datasetId,
  gene,
  transcript,
  constraint,
  regionalMissenseConstraint,
}: ViewProps) => {
  const [isStructureShown, setIsStructureShown] = useState(false)
  const [colorBy, setColorBy] = useState<StructureColorBy>('obs_exp')
  const [colorCatchAllRegion, setColorCatchAllRegion] = useState(false)
  const [hoveredRegion, setHoveredRegion] = useState<MissenseConstraint3dRegion | null>(null)

  // The track shows 3D regions, so it keeps their o/e colors while the structure shows RMC or pLDDT
  const regionColorBy: RegionColorBy =
    colorBy === 'regional_missense_constraint' || colorBy === 'plddt' ? 'obs_exp' : colorBy

  const regionRanks = useMemo(() => rankConstrainedRegions(constraint.regions), [constraint])

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
      regionColor(region, { colorBy: regionColorBy, colorCatchAllRegion, regionRanks }),
    [regionColorBy, colorCatchAllRegion, regionRanks]
  )

  const highlightedResidueRanges = useMemo(
    () => (hoveredRegion ? regionResidueRanges(hoveredRegion) : []),
    [hoveredRegion]
  )

  const onHoverRegion = useCallback(
    (trackRegion: TrackRegion | null) => setHoveredRegion(trackRegion ? trackRegion.region : null),
    []
  )

  const legend =
    regionColorBy === 'ranked_regions' ? (
      <RankedRegionsLegend rankedRegionCount={regionRanks.size} />
    ) : (
      <MissenseObsExpLegend
        title={
          regionColorBy === 'obs_exp' ? 'Missense observed/expected' : 'Missense o/e upper bound'
        }
        notSignificantLabel="Catch-all region"
      />
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
        valueFn={(trackRegion: TrackRegion) => trackRegion.region.obs_exp.toFixed(2)}
        leftPanelControl={
          <ToggleStructureButton
            onClick={() => {
              if (!isStructureShown) {
                logButtonClick('User showed 3D missense constraint structure')
              }
              setHoveredRegion(null)
              setIsStructureShown(!isStructureShown)
            }}
          >
            {isStructureShown ? 'Hide' : 'Show'} structure
          </ToggleStructureButton>
        }
        onHoverRegion={isStructureShown ? onHoverRegion : undefined}
      />
      {isStructureShown && (
        <TrackPageSection>
          <MissenseConstraint3dStructurePanel
            datasetId={datasetId}
            constraint={constraint}
            regionRanks={regionRanks}
            colorBy={colorBy}
            onChangeColorBy={setColorBy}
            colorCatchAllRegion={colorCatchAllRegion}
            onChangeColorCatchAllRegion={setColorCatchAllRegion}
            colorRegion={colorRegion}
            highlightedResidueRanges={highlightedResidueRanges}
            regionalMissenseConstraint={regionalMissenseConstraint}
          />
        </TrackPageSection>
      )}
    </>
  )
}

type Props = {
  datasetId: DatasetId
  gene: Gene
  regionalMissenseConstraint?: RegionalMissenseConstraint | null
}

const MissenseConstraint3dTrack = ({
  datasetId,
  gene,
  regionalMissenseConstraint = null,
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
        />
      )
    }}
  </Query>
)

export default MissenseConstraint3dTrack
