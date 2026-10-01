import { scaleLinear } from 'd3-scale'
import React, { ReactNode, useState } from 'react'
import styled from 'styled-components'
import { AxisRight } from '@visx/axis'

import { Track } from '@gnomad/region-viewer'
import { Button, SegmentedControl, TooltipAnchor } from '@gnomad/ui'

import { logButtonClick } from '../analytics'
import {
  GenericRegion,
  RegionAttributeList,
  RegionWithUnclamped,
  SidePanel,
  SidePanelWithControl,
} from '../ConstraintTrack'
import InfoButton from '../help/InfoButton'
import Legend from '../Legend'
import { RegionalMissenseConstraintRegion } from '../RegionalMissenseConstraintTrack'
import MissenseConstraint3dRegionAttributes from './MissenseConstraint3dRegionAttributes'
import {
  MissenseConstraint3dRegion,
  MissenseConstraint3dTrackRegion,
  STRUCTURE_HIGHLIGHT_COLOR,
} from './missenseConstraint3d'
import { RegionalMissenseConstraintRegionAttributes } from './RegionalMissenseConstraintUpperTrack'

export type ConstraintPlotValue = 'obs_exp' | 'upper'

const PLOT_HEIGHT = 120
const PLOT_MARGIN = 8

export const MISSENSE_CONSTRAINT_3D_COLOR = '#1f77b4'
export const REGIONAL_MISSENSE_CONSTRAINT_COLOR = '#ff7f0e'

type Segment3d = RegionWithUnclamped<MissenseConstraint3dTrackRegion & { rank: number | undefined }>

type PlotSegment = GenericRegion & { value: number }

// A line through the values of segments of the genome, with steps between adjacent segments and
// breaks between others, like between exons
export const stepLinePath = (
  segments: PlotSegment[],
  scalePosition: (position: number) => number,
  scaleValue: (value: number) => number
) =>
  [...segments]
    .sort((a, b) => a.start - b.start)
    .map((segment, index, sortedSegments) => {
      const previous = sortedSegments[index - 1]
      const isAdjacent = previous !== undefined && segment.start <= previous.stop + 1
      return `${isAdjacent ? 'L' : 'M'}${scalePosition(segment.start)},${scaleValue(
        segment.value
      )}H${scalePosition(segment.stop)}`
    })
    .join('')

export type PlotInterval<A, B> = GenericRegion & { first: A | undefined; second: B | undefined }

// Splits the genome where either kind of region starts or stops, for hovering over both at once
export const plotIntervals = <A extends GenericRegion, B extends GenericRegion>(
  firstRegions: A[],
  secondRegions: B[]
): PlotInterval<A, B>[] => {
  const boundaries = Array.from(
    new Set([...firstRegions, ...secondRegions].flatMap(({ start, stop }) => [start, stop + 1]))
  ).sort((a, b) => a - b)
  const covering = <R extends GenericRegion>(regions: R[], position: number) =>
    regions.find((region) => region.start <= position && position <= region.stop)
  return boundaries.slice(0, -1).flatMap((start, index) => {
    const first = covering(firstRegions, start)
    const second = covering(secondRegions, start)
    return first || second ? [{ start, stop: boundaries[index + 1] - 1, first, second }] : []
  })
}

const LineSwatch = ({ color }: { color: string }) => (
  <svg width={16} height={16}>
    <line x1={0} y1={8} x2={16} y2={8} stroke={color} strokeWidth={2} />
  </svg>
)

const TopPanel = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
  margin-bottom: 5px;
`

const TooltipHeading = styled.div`
  font-weight: bold;
`

type TooltipProps = {
  interval: PlotInterval<Segment3d, RegionWithUnclamped<RegionalMissenseConstraintRegion>>
  isRegionalMissenseConstraintTranscriptWide: boolean
}

const IntervalTooltip = ({
  interval: { first: segment, second: regionalMissenseConstraintRegion },
  isRegionalMissenseConstraintTranscriptWide,
}: TooltipProps) => (
  <RegionAttributeList>
    {segment && (
      <>
        <TooltipHeading>3D missense constraint</TooltipHeading>
        <div>
          <dt>Amino acids:</dt>
          <dd>{`${segment.aa_start}-${segment.aa_stop}`}</dd>
        </div>
        <MissenseConstraint3dRegionAttributes region={segment.region} rank={segment.rank} />
      </>
    )}
    {regionalMissenseConstraintRegion && (
      <>
        <TooltipHeading>Regional missense constraint</TooltipHeading>
        {isRegionalMissenseConstraintTranscriptWide ? (
          <div>No regional missense constraint was found, so this is the whole transcript.</div>
        ) : (
          <RegionalMissenseConstraintRegionAttributes region={regionalMissenseConstraintRegion} />
        )}
      </>
    )}
  </RegionAttributeList>
)

type Props = {
  trackTitle: string
  // Segments of 3D regions, clamped to coding exons
  segments: Segment3d[]
  // Regional missense constraint regions, clamped to coding exons
  regionalMissenseConstraintRegions: RegionWithUnclamped<RegionalMissenseConstraintRegion>[]
  isRegionalMissenseConstraintTranscriptWide: boolean
  highlightedRegions: MissenseConstraint3dRegion[]
  leftPanelControl: ReactNode
  onHoverRegion?: (region: MissenseConstraint3dRegion | null) => void
}

// The missense o/e, or its upper bound, of 3D regions and regional missense constraint, as lines
// along the gene
const MissenseConstraintPlotTrack = ({
  trackTitle,
  segments,
  regionalMissenseConstraintRegions,
  isRegionalMissenseConstraintTranscriptWide,
  highlightedRegions,
  leftPanelControl,
  onHoverRegion,
}: Props) => {
  const [plotValue, setPlotValue] = useState<ConstraintPlotValue>('obs_exp')

  const segmentsWithValues: (PlotSegment & { segment: Segment3d })[] = segments.map((segment) => ({
    start: segment.start,
    stop: segment.stop,
    value: plotValue === 'obs_exp' ? segment.region.obs_exp : segment.region.oe_upper,
    segment,
  }))
  const regionalMissenseConstraintSegments = regionalMissenseConstraintRegions.flatMap(
    (region): PlotSegment[] => {
      const value = plotValue === 'obs_exp' ? region.obs_exp : region.obs_exp_upper
      return value === undefined || value === null
        ? []
        : [{ start: region.start, stop: region.stop, value }]
    }
  )

  const scaleValue = scaleLinear()
    .domain([
      0,
      Math.max(
        1,
        ...[...segmentsWithValues, ...regionalMissenseConstraintSegments].map(({ value }) => value)
      ),
    ])
    .nice()
    .range([PLOT_HEIGHT - PLOT_MARGIN, PLOT_MARGIN])

  const intervals = plotIntervals(segments, regionalMissenseConstraintRegions)

  return (
    <Track
      renderLeftPanel={() => (
        <SidePanelWithControl>
          <SidePanel>
            <span>{trackTitle}</span>
            <InfoButton topic="missense-constraint-3d" />
          </SidePanel>
          {leftPanelControl}
        </SidePanelWithControl>
      )}
      renderTopPanel={() => (
        <TopPanel>
          <Legend
            series={[
              {
                label: '3D missense constraint',
                swatch: <LineSwatch color={MISSENSE_CONSTRAINT_3D_COLOR} />,
              },
              ...(regionalMissenseConstraintSegments.length > 0
                ? [
                    {
                      label: 'Regional missense constraint',
                      swatch: <LineSwatch color={REGIONAL_MISSENSE_CONSTRAINT_COLOR} />,
                    },
                  ]
                : []),
            ]}
          />
          <SegmentedControl<ConstraintPlotValue>
            id="missense-constraint-plot-value"
            options={[
              { value: 'obs_exp', label: 'Missense o/e' },
              { value: 'upper', label: 'o/e upper bound' },
            ]}
            value={plotValue}
            onChange={setPlotValue}
          />
        </TopPanel>
      )}
      renderRightPanel={({ width }: { width: number }) =>
        width > 30 && (
          <svg width={width} height={PLOT_HEIGHT}>
            <AxisRight scale={scaleValue} numTicks={4} stroke="#333" tickStroke="#333" />
          </svg>
        )
      }
    >
      {({
        scalePosition,
        width,
      }: {
        scalePosition: (position: number) => number
        width: number
      }) => (
        <svg width={width} height={PLOT_HEIGHT}>
          {/* No constraint */}
          <line
            x1={0}
            x2={width}
            y1={scaleValue(1)}
            y2={scaleValue(1)}
            stroke="#999"
            strokeDasharray="3 3"
          />
          <path
            d={stepLinePath(regionalMissenseConstraintSegments, scalePosition, scaleValue)}
            fill="none"
            stroke={REGIONAL_MISSENSE_CONSTRAINT_COLOR}
            strokeWidth={2}
          />
          <path
            d={stepLinePath(segmentsWithValues, scalePosition, scaleValue)}
            fill="none"
            stroke={MISSENSE_CONSTRAINT_3D_COLOR}
            strokeWidth={2}
          />
          <path
            d={stepLinePath(
              segmentsWithValues.filter(({ segment }) =>
                highlightedRegions.includes(segment.region)
              ),
              scalePosition,
              scaleValue
            )}
            fill="none"
            stroke={STRUCTURE_HIGHLIGHT_COLOR}
            strokeWidth={3}
          />
          {intervals.map((interval) => {
            const startX = scalePosition(interval.start)
            return (
              <TooltipAnchor
                key={interval.start}
                // @ts-expect-error need to redefine TooltipAnchor to allow arbitrary props for the children type-safely
                interval={interval}
                isRegionalMissenseConstraintTranscriptWide={
                  isRegionalMissenseConstraintTranscriptWide
                }
                tooltipComponent={IntervalTooltip}
              >
                <g>
                  {/* Hover handlers go on the rect because TooltipAnchor replaces its child's */}
                  <rect
                    x={startX}
                    y={0}
                    width={scalePosition(interval.stop) - startX}
                    height={PLOT_HEIGHT}
                    fill="none"
                    pointerEvents="all"
                    onMouseEnter={
                      onHoverRegion &&
                      (() => onHoverRegion(interval.first ? interval.first.region : null))
                    }
                    onMouseLeave={onHoverRegion && (() => onHoverRegion(null))}
                  />
                </g>
              </TooltipAnchor>
            )
          })}
        </svg>
      )}
    </Track>
  )
}

const PlotToggleWrapper = styled.div`
  display: flex;
  justify-content: flex-end;
  width: 100%;
  margin-bottom: 0.5em;
`

type PlotToggleProps = {
  showAsPlot: boolean
  onChangeShowAsPlot: (showAsPlot: boolean) => void
}

// Switches between colored tracks of 3D and regional missense constraint and one plot of both, so
// it goes above the tracks
export const MissenseConstraintPlotToggle = ({
  showAsPlot,
  onChangeShowAsPlot,
}: PlotToggleProps) => (
  <Track renderLeftPanel={() => null}>
    {() => (
      <PlotToggleWrapper>
        <Button
          onClick={() => {
            if (!showAsPlot) {
              logButtonClick('User plotted missense constraint')
            }
            onChangeShowAsPlot(!showAsPlot)
          }}
        >
          {showAsPlot ? 'Show missense constraint as colors' : 'Show missense constraint as plot'}
        </Button>
      </PlotToggleWrapper>
    )}
  </Track>
)

export default MissenseConstraintPlotTrack
