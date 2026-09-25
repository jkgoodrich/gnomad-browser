import React, { useMemo } from 'react'
import styled from 'styled-components'

import { Track } from '@gnomad/region-viewer'
import { ExternalLink, TooltipAnchor } from '@gnomad/ui'

import {
  RegionAttributeList,
  RegionWithUnclamped,
  SidePanel,
  regionsInExons,
} from '../ConstraintTrack'
import { GeneTranscript, Strand } from '../GenePage/GenePage'
import InfoButton from '../help/InfoButton'
import Link from '../Link'
import {
  UNIPROT_FEATURE_OVERLAY_STYLES,
  UniprotFeature,
  UniprotFeatureOnGenome,
  uniprotEntryUrl,
  uniprotHelpUrl,
  uniprotFeaturesByType,
  uniprotFeaturesOnGenome,
} from './missenseConstraint3d'

const ROW_HEIGHT = 16
const FEATURE_HEIGHT = 10
// Features of a single residue would otherwise be too narrow to see or hover over
const MIN_FEATURE_WIDTH = 2

const HELP_TOPIC = 'uniprot-features'

const Wrapper = styled.div`
  margin-bottom: 1em;
`

const HeaderText = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  font-size: 12px;
`

const RowLabel = styled.div`
  display: flex;
  align-items: center;
  height: 100%;
  font-size: 11px;

  a {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

const FeatureTooltip = ({ region }: { region: RegionWithUnclamped<UniprotFeatureOnGenome> }) => {
  const { feature } = region
  return (
    <RegionAttributeList>
      <div>
        <dt>UniProt feature:</dt>
        <dd>
          {[UNIPROT_FEATURE_OVERLAY_STYLES[feature.feature_type].label, feature.note]
            .filter(Boolean)
            .join(': ')}
        </dd>
      </div>
      <div>
        <dt>Amino acids:</dt>
        <dd>
          {feature.start === feature.stop ? feature.start : `${feature.start}-${feature.stop}`}
        </dd>
      </div>
      <div>
        <dt>Coordinates:</dt>
        <dd>{`${region.chrom}:${region.unclamped_start}-${region.unclamped_stop}`}</dd>
      </div>
    </RegionAttributeList>
  )
}

type Props = {
  uniprotId: string
  // The transcript whose protein matches the UniProt entry's sequence
  transcriptId: string
  features: UniprotFeature[]
  chrom: string
  strand: Strand
  transcript: GeneTranscript
  // Feature types selected in the structure's legend, which are the only ones shown here
  visibleOverlayIds: Set<string>
  onHoverFeature: (feature: UniprotFeature | null) => void
}

const UniprotFeatureTracks = ({
  uniprotId,
  transcriptId,
  features,
  chrom,
  strand,
  transcript,
  visibleOverlayIds,
  onHoverFeature,
}: Props) => {
  const rows = useMemo(() => {
    const codingExons = transcript.exons.filter((exon) => exon.feature_type === 'CDS')
    return uniprotFeaturesByType(features).map((row) => ({
      ...row,
      // Clipped one at a time, because features of the same type can overlap
      featuresOnGenome: uniprotFeaturesOnGenome(
        row.features,
        { strand, exons: transcript.exons },
        chrom
      ).flatMap((featureOnGenome) => regionsInExons([featureOnGenome], codingExons)),
    }))
  }, [features, chrom, strand, transcript])

  if (rows.length === 0) {
    return null
  }

  const visibleRows = rows.filter((row) => visibleOverlayIds.has(row.id))

  return (
    <Wrapper>
      <Track
        renderLeftPanel={() => (
          <SidePanel>
            <span>UniProt features</span>
            <InfoButton topic={HELP_TOPIC} />
          </SidePanel>
        )}
      >
        {() => (
          <HeaderText>
            <span>
              <ExternalLink href={uniprotEntryUrl(uniprotId)}>{uniprotId}</ExternalLink> (UniProtKB
              release 2021_04), matched to transcript{' '}
              <Link preserveSelectedDataset to={`/transcript/${transcriptId}`}>
                {transcriptId}
              </Link>
            </span>
            {visibleRows.length === 0 && (
              <span>Select features in the legend beside the structure to show them here.</span>
            )}
          </HeaderText>
        )}
      </Track>
      {visibleRows.map((row) => {
        return (
          <Track
            key={row.id}
            renderLeftPanel={() => (
              <RowLabel>
                <TooltipAnchor
                  // @ts-expect-error TooltipAnchor's typings are missing its tooltip prop
                  tooltip={row.description}
                >
                  <ExternalLink href={uniprotHelpUrl(row.uniprotHelpId)}>{row.label}</ExternalLink>
                </TooltipAnchor>
              </RowLabel>
            )}
          >
            {({
              scalePosition,
              width,
            }: {
              scalePosition: (position: number) => number
              width: number
            }) => (
              <svg width={width} height={ROW_HEIGHT}>
                {row.featuresOnGenome.map((featureOnGenome) => {
                  const x = scalePosition(featureOnGenome.start)
                  return (
                    <TooltipAnchor
                      key={`${featureOnGenome.feature.start}-${featureOnGenome.feature.stop}-${featureOnGenome.start}`}
                      // @ts-expect-error need to redefine TooltipAnchor to allow arbitrary props for the children type-safely
                      region={featureOnGenome}
                      tooltipComponent={FeatureTooltip}
                    >
                      <g>
                        {/* Hover handlers go on the rect because TooltipAnchor replaces its child's */}
                        <rect
                          x={x}
                          y={(ROW_HEIGHT - FEATURE_HEIGHT) / 2}
                          width={Math.max(
                            scalePosition(featureOnGenome.stop) - x,
                            MIN_FEATURE_WIDTH
                          )}
                          height={FEATURE_HEIGHT}
                          fill={row.color}
                          onMouseEnter={() => onHoverFeature(featureOnGenome.feature)}
                          onMouseLeave={() => onHoverFeature(null)}
                        />
                      </g>
                    </TooltipAnchor>
                  )
                })}
              </svg>
            )}
          </Track>
        )
      })}
    </Wrapper>
  )
}

export default UniprotFeatureTracks
