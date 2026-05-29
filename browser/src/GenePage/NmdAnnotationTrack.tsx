import React from 'react'
import styled from 'styled-components'

import { Track } from '@gnomad/region-viewer'
import { TooltipAnchor } from '@gnomad/ui'

import { regionsInExons } from '../ConstraintTrack'
import { Strand } from './GenePage'
import {
  predictNmdRegion,
  NmdRationale,
  NmdEscapeReason,
  NMD_ESCAPE_REASON_INFO,
} from './nmdRegion'

const Wrapper = styled.div`
  display: flex;
  margin-bottom: 1em;
`

const PlotWrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
`

const SidePanel = styled.div`
  display: flex;
  align-items: center;
`

const TopPanel = styled.div`
  display: flex;
  justify-content: flex-end;
  width: 100%;
  margin-bottom: 5px;
`

const LegendWrapper = styled.div`
  display: flex;
  gap: 1em;
  font-size: 12px;
`

const LegendItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
`

const LegendSwatch = styled.span<{ $color: string }>`
  display: inline-block;
  width: 18px;
  height: 10px;
  background-color: ${({ $color }) => $color};
  border: 1px solid #424242;
`

const TooltipBody = styled.dl`
  margin: 0;
  font-size: 12px;
  max-width: 320px;

  dt {
    font-weight: bold;
  }

  dd {
    margin-left: 0;
    margin-bottom: 0.4em;
  }
`

const SENSITIVE_COLOR = '#f4a6a6'

// Per-reason fill colors. Labels/descriptions live in NMD_ESCAPE_REASON_INFO so
// the track and the variant-table flag share one source of truth. Colors avoid
// red/pink so they don't read as NMD-sensitive.
const ESCAPE_REASON_COLORS: Record<NmdEscapeReason, string> = {
  'last-junction-50bp': '#6fbf73',
  'start-proximal': '#5b9bd5',
  'long-exon': '#e0b84c',
  'single-coding-exon': '#3fb6a8',
}

type SensitiveRegion = { kind: 'sensitive' }
type EscapeRegion = { kind: 'escape'; reason: NmdEscapeReason }
type NmdRegionKind = SensitiveRegion | EscapeRegion

type TooltipProps = {
  region: NmdRegionKind
}

const NmdRegionTooltip = ({ region }: TooltipProps) => (
  <TooltipBody>
    {region.kind === 'sensitive' ? (
      <>
        <dt>NMD-sensitive region</dt>
        <dd>
          Premature termination codons in this region are predicted to trigger nonsense-mediated
          decay.
        </dd>
      </>
    ) : (
      <>
        <dt>Predicted NMD-escape &mdash; {NMD_ESCAPE_REASON_INFO[region.reason].label}</dt>
        <dd>{NMD_ESCAPE_REASON_INFO[region.reason].description}</dd>
      </>
    )}
  </TooltipBody>
)

const rationaleMessage = (rationale: NmdRationale): string | null => {
  switch (rationale) {
    case 'single-coding-exon':
      return 'Single-coding-exon transcript: the entire CDS is predicted to escape NMD.'
    case 'no-cds':
      return 'No coding sequence; NMD annotation not applicable.'
    case 'multi-exon-50bp':
      return null
    default:
      return null
  }
}

type Props = {
  transcript: {
    transcript_id: string
    strand: Strand
    exons: { feature_type: string; start: number; stop: number }[]
  }
  trackTitle?: string
}

const HEIGHT = 12

const NmdAnnotationTrack = ({ transcript, trackTitle }: Props) => {
  const { nmdSensitiveRegions, nmdEscapeRegions, rationale } = predictNmdRegion(transcript)
  const cdsExons = transcript.exons.filter((e) => e.feature_type === 'CDS')

  const sensitiveClipped = regionsInExons(
    nmdSensitiveRegions.map((r) => ({ ...r, kind: 'sensitive' as const })),
    cdsExons
  )
  const escapeClipped = regionsInExons(
    nmdEscapeRegions.map((r) => ({ ...r, kind: 'escape' as const })),
    cdsExons
  )

  const allRegions = [...sensitiveClipped, ...escapeClipped]

  // Only show legend entries for categories actually present in this transcript.
  const hasSensitive = sensitiveClipped.length > 0
  const presentReasons = (Object.keys(ESCAPE_REASON_COLORS) as NmdEscapeReason[]).filter((reason) =>
    escapeClipped.some((r) => r.reason === reason)
  )

  const message = rationaleMessage(rationale)

  return (
    <Wrapper>
      <Track
        renderLeftPanel={() => (
          <SidePanel>
            <span>NMD prediction</span>
          </SidePanel>
        )}
      >
        {({ scalePosition, width }: { scalePosition: (n: number) => number; width: number }) => (
          <>
            <TopPanel>
              <LegendWrapper>
                {hasSensitive && (
                  <LegendItem>
                    <LegendSwatch $color={SENSITIVE_COLOR} />
                    NMD-sensitive
                  </LegendItem>
                )}
                {presentReasons.map((reason) => (
                  <LegendItem key={reason}>
                    <LegendSwatch $color={ESCAPE_REASON_COLORS[reason]} />
                    {NMD_ESCAPE_REASON_INFO[reason].label}
                  </LegendItem>
                ))}
              </LegendWrapper>
            </TopPanel>
            <PlotWrapper>
              <svg height={HEIGHT + 4} width={width}>
                {allRegions.map((region) => {
                  const startX = scalePosition(region.start)
                  const stopX = scalePosition(region.stop)
                  const regionWidth = Math.max(1, stopX - startX)
                  const fill =
                    region.kind === 'sensitive'
                      ? SENSITIVE_COLOR
                      : ESCAPE_REASON_COLORS[region.reason]

                  return (
                    <TooltipAnchor
                      key={`${region.kind}-${region.start}-${region.stop}`}
                      // @ts-expect-error TooltipAnchor passes arbitrary props through
                      region={region}
                      tooltipComponent={NmdRegionTooltip}
                    >
                      <g>
                        <rect
                          x={startX}
                          y={2}
                          width={regionWidth}
                          height={HEIGHT}
                          fill={fill}
                          stroke="#424242"
                        />
                      </g>
                    </TooltipAnchor>
                  )
                })}
              </svg>
              {message && (
                <small style={{ marginTop: 4, color: '#666' }}>
                  {trackTitle ? `${trackTitle}: ${message}` : message}
                </small>
              )}
            </PlotWrapper>
          </>
        )}
      </Track>
    </Wrapper>
  )
}

export default NmdAnnotationTrack
